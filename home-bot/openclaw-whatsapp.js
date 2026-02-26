#!/usr/bin/env node
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_FILE = path.join(__dirname, "config.json");
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 120000;
const STATUS_REPORT_INTERVAL_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 50;

let config = {};
let client = null;
let reconnectAttempts = 0;
let statusTimer = null;
let healthTimer = null;
let connectedPhone = null;
let lastMessageTime = Date.now();
let isRestarting = false;

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log("\n=== OpenClaw WhatsApp Bot - First Time Setup ===\n");
    console.log("No config.json found. Creating one...\n");
    const defaultConfig = {
      dashboardUrl: "https://claw-settings.replit.app",
      apiKey: "YOUR_API_KEY_HERE",
      botName: "OpenClaw AI",
      autoRestart: true,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created ${CONFIG_FILE} — edit it with your API key and dashboard URL, then run again.\n`);
    process.exit(0);
  }
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  if (!config.dashboardUrl || !config.apiKey || config.apiKey === "YOUR_API_KEY_HERE") {
    console.error("ERROR: Please set dashboardUrl and apiKey in config.json");
    process.exit(1);
  }
  config.dashboardUrl = config.dashboardUrl.replace(/\/$/, "");
  console.log(`Dashboard: ${config.dashboardUrl}`);
  console.log(`API Key: ${config.apiKey.substring(0, 8)}...`);
  console.log(`Hostname: ${os.hostname()}`);
}

async function reportStatus(state, phone, error) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ state, phone, error, runtime: "home-bot-wwebjs", hostname: os.hostname() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.warn("[Bot] Status report failed:", err.message);
  }
}

async function processMessage(senderPhone, text, pushName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const resp = await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ phone: senderPhone, text, pushName }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API error ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    return data.reply || "I couldn't generate a response.";
  } catch (err) {
    console.error("[Bot] Failed to process message via dashboard:", err.message);
    return "Sorry, I'm having trouble connecting to the AI service. Please try again in a moment.";
  }
}

function clearTimers() {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

function startStatusReporter() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    reportStatus("connected", connectedPhone, null);
  }, STATUS_REPORT_INTERVAL_MS);
}

function startHealthMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(async () => {
    if (!client) return;

    try {
      const state = await client.getState();
      if (state !== "CONNECTED") {
        console.warn(`[Bot] Health check: state is "${state}" — not connected`);
        if (!isRestarting) {
          console.log("[Bot] Health monitor triggering reconnect...");
          await safeRestart("Health monitor detected disconnected state");
        }
      }
    } catch (err) {
      console.warn("[Bot] Health check failed:", err.message);
      if (!isRestarting && err?.message && (err.message.includes("Protocol error") || err.message.includes("Session closed"))) {
        console.log("[Bot] Health monitor: session appears dead, restarting...");
        await safeRestart("Health monitor: " + err.message);
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

async function safeRestart(reason) {
  if (isRestarting) return;
  isRestarting = true;
  console.log(`[Bot] Safe restart triggered: ${reason}`);
  clearTimers();
  connectedPhone = null;
  reportStatus("reconnecting", null, reason);

  if (client) {
    try { await client.destroy(); } catch (e) { console.warn("[Bot] Destroy error:", e.message); }
    client = null;
  }

  reconnectAttempts++;
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error(`[Bot] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Resetting counter and waiting 5 minutes.`);
    reconnectAttempts = 0;
    reportStatus("disconnected", null, "Max reconnect attempts reached. Waiting 5 minutes before trying again.");
    setTimeout(() => { isRestarting = false; startBot(); }, 300000);
    return;
  }

  const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.3, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
  console.log(`[Bot] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  setTimeout(() => { isRestarting = false; startBot(); }, delay);
}

async function startBot() {
  if (isRestarting) return;
  console.log("\n[Bot] Starting WhatsApp connection (whatsapp-web.js)...");
  console.log("[Bot] Session is saved locally — no QR code needed after first link.\n");

  reportStatus("connecting", null, null);

  const authPath = path.join(__dirname, ".wwebjs_auth");
  const hasAuth = fs.existsSync(path.join(authPath, "session"));
  if (hasAuth) {
    console.log("[Bot] Found existing session — reconnecting without QR code");
  } else {
    console.log("[Bot] No existing session — QR code will be displayed");
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--disable-gpu",
        "--single-process",
      ],
    },
    restartOnAuthFail: true,
  });

  client.on("qr", (qr) => {
    console.log("\n[Bot] Scan this QR code with WhatsApp:\n");
    qrcode.generate(qr, { small: true });
    console.log("\nOpen WhatsApp on your phone > Settings > Linked Devices > Link a Device");
    console.log("Then scan the QR code above.\n");
    reportStatus("qr_ready", null, null);
  });

  client.on("authenticated", () => {
    console.log("[Bot] Authenticated successfully! Session saved.");
  });

  client.on("auth_failure", async (msg) => {
    console.error("[Bot] Authentication failed:", msg);
    reportStatus("disconnected", null, `Auth failed: ${msg}`);
    console.log("[Bot] Clearing auth data and retrying...");
    try {
      const sessionDir = path.join(authPath, "session");
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log("[Bot] Old session cleared. Will need QR code on next start.");
      }
    } catch (e) { console.warn("[Bot] Failed to clear session:", e.message); }
    await safeRestart("Auth failure — cleared old session");
  });

  client.on("ready", async () => {
    reconnectAttempts = 0;
    lastMessageTime = Date.now();
    try {
      const info = client.info;
      connectedPhone = info?.wid?.user || info?.me?.user || null;
    } catch (e) {
      connectedPhone = null;
    }
    console.log(`\n[Bot] Connected as +${connectedPhone || "unknown"}\n`);
    console.log("[Bot] WhatsApp bot is running. Session is locked in — will auto-reconnect if disconnected.\n");
    console.log("[Bot] Press Ctrl+C to stop.\n");
    reportStatus("connected", connectedPhone, null);
    startStatusReporter();
    startHealthMonitor();
  });

  client.on("disconnected", async (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`);
    clearTimers();
    const savedPhone = connectedPhone;
    connectedPhone = null;
    reportStatus("disconnected", null, `Disconnected: ${reason}`);

    if (reason === "LOGOUT" || reason === "CONFLICT") {
      console.log(`[Bot] ${reason} — clearing session and stopping auto-reconnect.`);
      try {
        const sessionDir = path.join(authPath, "session");
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      } catch (e) {}
      reportStatus("disconnected", null, `${reason}: Session ended. Run the bot again and scan a new QR code.`);
      return;
    }

    if (config.autoRestart !== false) {
      await safeRestart(`Disconnected: ${reason}`);
    }
  });

  client.on("change_state", (state) => {
    console.log(`[Bot] State changed: ${state}`);
    if (state === "CONFLICT" || state === "UNLAUNCHED" || state === "UNPAIRED") {
      console.warn(`[Bot] Problematic state: ${state}`);
    }
  });

  client.on("message_create", async (msg) => {
    if (!msg.body || !msg.body.trim()) return;
    if (msg.from === "status@broadcast") return;
    if (msg.fromMe) return;

    lastMessageTime = Date.now();

    let senderPhone, pushName;
    try {
      const contact = await msg.getContact();
      senderPhone = contact.id?.user || msg.from.replace("@c.us", "").replace("@g.us", "");
      pushName = contact.pushname || contact.name || undefined;
    } catch (err) {
      senderPhone = msg.from.replace("@c.us", "").replace("@g.us", "");
      pushName = undefined;
    }

    console.log(`[Bot] Message from ${senderPhone} (${pushName || "unknown"}): "${msg.body.substring(0, 80)}"`);

    let chat;
    try {
      chat = await msg.getChat();
      await chat.sendStateTyping();
    } catch {}

    const reply = await processMessage(senderPhone, msg.body.trim(), pushName);

    try {
      if (chat) await chat.clearState();
      await msg.reply(reply);
      console.log(`[Bot] Reply sent to ${senderPhone} (${reply.length} chars)`);
    } catch (err) {
      console.error(`[Bot] Failed to send reply to ${senderPhone}:`, err.message);
      try {
        await client.sendMessage(msg.from, reply);
        console.log(`[Bot] Reply sent via sendMessage to ${senderPhone}`);
      } catch (err2) {
        console.error(`[Bot] sendMessage also failed:`, err2.message);
      }
    }
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error("[Bot] Failed to initialize:", err.message);
    if (config.autoRestart !== false) {
      await safeRestart("Initialize failed: " + err.message);
    }
  }
}

process.on("SIGINT", async () => {
  console.log("\n[Bot] Shutting down gracefully (session preserved for auto-reconnect)...");
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Manual shutdown");
  if (client) {
    try { await client.destroy(); } catch {}
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Bot] Received SIGTERM, shutting down (session preserved)...");
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Service stopped");
  if (client) {
    try { await client.destroy(); } catch {}
  }
  process.exit(0);
});

process.on("uncaughtException", async (err) => {
  console.error("[Bot] Uncaught exception:", err.message);
  console.error(err.stack);
  reportStatus("disconnected", connectedPhone, "Crash: " + err.message);
  if (!isRestarting) {
    await safeRestart("Uncaught exception: " + err.message);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[Bot] Unhandled rejection:", reason);
});

loadConfig();
startBot().catch((err) => {
  console.error("[Bot] Fatal error:", err);
  reportStatus("disconnected", null, "Fatal: " + err.message);
  setTimeout(() => startBot(), 30000);
});
