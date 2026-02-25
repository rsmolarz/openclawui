#!/usr/bin/env node
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_FILE = path.join(__dirname, "config.json");
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 300000;
const STATUS_REPORT_INTERVAL_MS = 30000;

let config = {};
let client = null;
let reconnectAttempts = 0;
let statusTimer = null;
let connectedPhone = null;

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
}

async function reportStatus(state, phone, error) {
  try {
    await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ state, phone, error, runtime: "home-bot-wwebjs", hostname: os.hostname() }),
    });
  } catch (err) {
  }
}

async function processMessage(senderPhone, text, pushName) {
  try {
    const resp = await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ phone: senderPhone, text, pushName }),
    });
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
}

function startStatusReporter() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    reportStatus("connected", connectedPhone, null);
  }, STATUS_REPORT_INTERVAL_MS);
}

async function startBot() {
  console.log("\n[Bot] Starting WhatsApp connection (whatsapp-web.js)...");
  console.log("[Bot] This uses a real browser engine — much more reliable than Baileys.\n");

  reportStatus("connecting", null, null);

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, ".wwebjs_auth") }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", (qr) => {
    console.log("\n[Bot] Scan this QR code with WhatsApp:\n");
    qrcode.generate(qr, { small: true });
    console.log("\nOpen WhatsApp on your phone > Settings > Linked Devices > Link a Device");
    console.log("Then scan the QR code above.\n");
    reportStatus("qr_ready", null, null);
  });

  client.on("authenticated", () => {
    console.log("[Bot] Authenticated successfully!");
  });

  client.on("auth_failure", (msg) => {
    console.error("[Bot] Authentication failed:", msg);
    reportStatus("disconnected", null, `Auth failed: ${msg}`);
  });

  client.on("ready", async () => {
    reconnectAttempts = 0;
    try {
      const info = client.info;
      connectedPhone = info?.wid?.user || info?.me?.user || null;
    } catch (e) {
      connectedPhone = null;
    }
    console.log(`\n[Bot] Connected as +${connectedPhone || "unknown"}\n`);
    console.log("[Bot] WhatsApp bot is running. Press Ctrl+C to stop.\n");
    reportStatus("connected", connectedPhone, null);
    startStatusReporter();
  });

  client.on("disconnected", (reason) => {
    console.log(`[Bot] Disconnected: ${reason}`);
    clearTimers();
    connectedPhone = null;
    reportStatus("disconnected", null, `Disconnected: ${reason}`);

    if (config.autoRestart !== false) {
      reconnectAttempts++;
      const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
      console.log(`[Bot] Auto-reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
      setTimeout(() => startBot(), delay);
    }
  });

  client.on("message_create", async (msg) => {
    console.log(`[Bot] message_create event: fromMe=${msg.fromMe}, from=${msg.from}, body="${(msg.body || "").substring(0, 40)}"`);

    if (msg.fromMe || !msg.body || !msg.body.trim()) return;
    if (msg.from === "status@broadcast") return;

    let senderPhone, pushName;
    try {
      const contact = await msg.getContact();
      senderPhone = contact.id?.user || msg.from.replace("@c.us", "").replace("@g.us", "");
      pushName = contact.pushname || contact.name || undefined;
    } catch (err) {
      senderPhone = msg.from.replace("@c.us", "").replace("@g.us", "");
      pushName = undefined;
      console.warn(`[Bot] Could not get contact info: ${err.message}`);
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
      reconnectAttempts++;
      const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
      console.log(`[Bot] Retrying in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
      setTimeout(() => startBot(), delay);
    }
  }
}

process.on("SIGINT", async () => {
  console.log("\n[Bot] Shutting down gracefully (session preserved)...");
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Manual shutdown");
  if (client) {
    try { await client.destroy(); } catch {}
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Bot] Received SIGTERM, shutting down...");
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Service stopped");
  if (client) {
    try { await client.destroy(); } catch {}
  }
  process.exit(0);
});

loadConfig();
startBot().catch((err) => {
  console.error("[Bot] Fatal error:", err);
  process.exit(1);
});
