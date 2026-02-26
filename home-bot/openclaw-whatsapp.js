import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { hostname } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_FILE = join(__dirname, "config.json");
const AUTH_DIR = join(__dirname, "auth_state");
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 120000;
const KEEPALIVE_INTERVAL_MS = 30000;
const STATUS_INTERVAL_MS = 30000;

let config = {};
let sock = null;
let reconnectTimer = null;
let keepaliveTimer = null;
let statusTimer = null;
let reconnectAttempts = 0;
let currentState = "disconnected";
let currentPhone = null;
let currentError = null;
let isStarting = false;
let pairingCodeRequested = false;
let lastPongTime = Date.now();
let sentMessageIds = new Set();

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.log("\n=== OpenClaw WhatsApp Bot - First Time Setup ===\n");
    const defaultConfig = {
      dashboardUrl: "https://claw-settings.replit.app",
      apiKey: "YOUR_API_KEY_HERE",
      phoneNumber: "",
      botName: "OpenClaw AI",
      usePairingCode: true,
      autoRestart: true,
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created ${CONFIG_FILE} — edit it with your API key and phone number, then run again.`);
    process.exit(0);
  }
  config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  if (!config.dashboardUrl || !config.apiKey || config.apiKey === "YOUR_API_KEY_HERE") {
    console.error("ERROR: Set dashboardUrl and apiKey in config.json");
    process.exit(1);
  }
  config.dashboardUrl = config.dashboardUrl.replace(/\/$/, "");
  console.log(`[Bot] Dashboard: ${config.dashboardUrl}`);
  console.log(`[Bot] Phone: ${config.phoneNumber || "not set"}`);
  console.log(`[Bot] Pairing mode: ${config.usePairingCode ? "pairing code" : "QR code"}`);
  console.log(`[Bot] Host: ${hostname()}`);
}

async function reportStatus(state, phone, error) {
  currentState = state;
  if (phone) currentPhone = phone;
  currentError = error;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({ state, phone, error, runtime: "home-bot", hostname: hostname() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.warn("[Bot] Status report failed:", err.message);
  }
}

async function processMessage(phone, text, pushName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const resp = await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({ phone, text, pushName }),
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
    console.error("[Bot] Message processing failed:", err.message);
    return "Sorry, I'm having trouble connecting to the AI service. Please try again.";
  }
}

function clearTimers() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
}

function startKeepalive() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  lastPongTime = Date.now();
  keepaliveTimer = setInterval(async () => {
    if (!sock || currentState !== "connected") return;
    try {
      await sock.sendPresenceUpdate("available");
      lastPongTime = Date.now();
    } catch (err) {
      const silent = Date.now() - lastPongTime;
      console.warn(`[Bot] Keepalive failed (silent ${Math.round(silent / 1000)}s): ${err.message}`);
      if (silent > KEEPALIVE_INTERVAL_MS * 3) {
        console.error("[Bot] Connection dead — forcing reconnect");
        handleDeadConnection();
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function startStatusReporter() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    reportStatus(currentState, currentPhone, currentError);
  }, STATUS_INTERVAL_MS);
}

function handleDeadConnection() {
  clearTimers();
  if (sock) {
    try { sock.end(undefined); } catch {}
    sock = null;
  }
  isStarting = false;
  scheduleReconnect("connection dead");
}

function scheduleReconnect(reason) {
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, Math.min(reconnectAttempts - 1, 15)), MAX_RECONNECT_DELAY_MS);
  console.log(`[Bot] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}, reason: ${reason})`);
  reportStatus("connecting", currentPhone, `Reconnecting... (${reason})`);
  reconnectTimer = setTimeout(() => startBot(), delay);
}

function hasAuthState() {
  return existsSync(join(AUTH_DIR, "creds.json"));
}

async function sendMessage(jid, text) {
  if (!sock) return;
  try {
    const result = await sock.sendMessage(jid, { text });
    if (result?.key?.id) sentMessageIds.add(result.key.id);
    if (sentMessageIds.size > 500) {
      const arr = [...sentMessageIds];
      sentMessageIds = new Set(arr.slice(-250));
    }
  } catch (err) {
    console.error(`[Bot] Failed to send message to ${jid}:`, err.message);
  }
}

async function startBot() {
  if (isStarting && sock) {
    console.log("[Bot] Already starting, skip");
    return;
  }
  if (isStarting && !sock) {
    console.log("[Bot] isStarting flag stuck, resetting");
  }

  isStarting = true;
  clearTimers();
  pairingCodeRequested = false;

  try {
    reportStatus("connecting", null, null);
    const existingAuth = hasAuthState();
    console.log(`[Bot] Starting WhatsApp connection... (existing auth: ${existingAuth})`);

    mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[Bot] Baileys version: ${version.join(".")}`);

    const newSock = makeWASocket({
      auth: state,
      version,
      browser: ["Ubuntu", "Chrome", "22.04.4"],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 500,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      getMessage: async () => ({ conversation: "" }),
    });

    sock = newSock;

    newSock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.error("[Bot] Failed to save credentials:", err.message);
      }
    });

    newSock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (config.usePairingCode && config.phoneNumber && !pairingCodeRequested) {
          pairingCodeRequested = true;
          try {
            const code = await newSock.requestPairingCode(config.phoneNumber);
            const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`[Bot] ============================`);
            console.log(`[Bot] PAIRING CODE: ${formatted}`);
            console.log(`[Bot] Enter this code in WhatsApp > Linked Devices > Link with Phone Number`);
            console.log(`[Bot] ============================`);
            reportStatus("pairing_code_ready", null, null);
          } catch (err) {
            console.error("[Bot] Pairing code request failed:", err.message);
            console.log("[Bot] Showing QR code instead...");
            const qrterm = await import("qrcode-terminal");
            qrterm.default.generate(qr, { small: true });
            reportStatus("qr_ready", null, null);
          }
          return;
        }

        console.log("[Bot] Scan this QR code with WhatsApp:");
        const qrterm = await import("qrcode-terminal");
        qrterm.default.generate(qr, { small: true });
        reportStatus("qr_ready", null, null);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || "unknown";
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isBadSession = statusCode === DisconnectReason.badSession;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.log(`[Bot] Connection closed: status=${statusCode}, reason="${errorMsg}"`);
        clearTimers();
        sock = null;
        isStarting = false;

        if (isLoggedOut || statusCode === 401) {
          console.log("[Bot] Session invalid — clearing auth and restarting");
          try {
            const { rmSync } = await import("fs");
            rmSync(AUTH_DIR, { recursive: true, force: true });
            mkdirSync(AUTH_DIR, { recursive: true });
            console.log("[Bot] Auth state cleared");
          } catch {}
          pairingCodeRequested = false;
          reconnectAttempts = 0;
          scheduleReconnect(`session invalid (${statusCode})`);
          return;
        }

        if (isBadSession) {
          console.log("[Bot] Bad session — clearing and restarting");
          try {
            const { rmSync } = await import("fs");
            rmSync(AUTH_DIR, { recursive: true, force: true });
            mkdirSync(AUTH_DIR, { recursive: true });
          } catch {}
          pairingCodeRequested = false;
          reconnectAttempts = 0;
          scheduleReconnect("bad session");
          return;
        }

        if (isRestartRequired) {
          reconnectAttempts = 0;
          scheduleReconnect("restart required");
          return;
        }

        reportStatus("disconnected", currentPhone, `status ${statusCode}: ${errorMsg}`);
        scheduleReconnect(`status ${statusCode}: ${errorMsg}`);
      }

      if (connection === "open") {
        console.log("[Bot] Connected to WhatsApp!");
        const phone = newSock.user?.id?.split(":")[0] || newSock.user?.id?.split("@")[0] || null;
        currentPhone = phone;
        reconnectAttempts = 0;
        isStarting = false;

        console.log(`[Bot] Logged in as +${phone || "unknown"}`);
        console.log("[Bot] Bot is running. Press Ctrl+C to stop.\n");
        reportStatus("connected", phone, null);
        startKeepalive();
        startStatusReporter();
      }
    });

    newSock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify" && m.type !== "append") return;
      const botJid = newSock.user?.id;
      const botPhone = botJid?.split(":")[0] || botJid?.split("@")[0] || "";

      for (const msg of m.messages) {
        const jid = msg.key?.remoteJid;
        const fromMe = msg.key?.fromMe;
        const msgId = msg.key?.id;

        if (!jid || jid === "status@broadcast") continue;
        if (fromMe && sentMessageIds.has(msgId)) continue;

        const isGroup = jid.endsWith("@g.us");
        const actualSender = isGroup
          ? (msg.key?.participant || "").replace("@s.whatsapp.net", "")
          : jid.replace("@s.whatsapp.net", "");

        if (fromMe && !isGroup && actualSender !== botPhone) {
          console.log(`[Bot] Message from linked device ${actualSender}`);
        } else if (fromMe) {
          continue;
        }

        if (!msg.message) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          msg.message.buttonsResponseMessage?.selectedDisplayText ||
          msg.message.listResponseMessage?.title ||
          "";

        if (!text.trim()) continue;

        const senderPhone = actualSender;
        const pushName = msg.pushName || undefined;
        console.log(`[Bot] Message from ${senderPhone} (${pushName || "?"}): "${text.trim().substring(0, 80)}"`);

        try {
          await newSock.sendPresenceUpdate("composing", jid);
        } catch {}

        const reply = await processMessage(senderPhone, text.trim(), pushName);

        try {
          await newSock.sendPresenceUpdate("paused", jid);
        } catch {}

        if (reply && reply.trim()) {
          await sendMessage(jid, reply);
          console.log(`[Bot] Reply sent to ${senderPhone} (${reply.length} chars)`);
        }
      }
    });
  } catch (error) {
    console.error("[Bot] Failed to start:", error.message);
    clearTimers();
    isStarting = false;
    sock = null;
    reportStatus("disconnected", null, `Start failed: ${error.message}`);
    scheduleReconnect("start error");
  }
}

process.on("SIGINT", async () => {
  console.log("\n[Bot] Shutting down gracefully...");
  clearTimers();
  await reportStatus("disconnected", currentPhone, "Manual shutdown");
  if (sock) { try { sock.end(undefined); } catch {} }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Bot] SIGTERM received...");
  clearTimers();
  await reportStatus("disconnected", currentPhone, "Service stopped");
  if (sock) { try { sock.end(undefined); } catch {} }
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[Bot] Uncaught exception:", err.message);
  console.error(err.stack);
  if (!isStarting) {
    reportStatus("disconnected", currentPhone, "Crash: " + err.message);
    scheduleReconnect("uncaught exception");
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[Bot] Unhandled rejection:", reason);
});

loadConfig();
console.log("[Bot] OpenClaw WhatsApp Home Bot (Baileys v3) starting...");
startBot().catch((err) => {
  console.error("[Bot] Fatal:", err);
  reportStatus("disconnected", null, "Fatal: " + err.message);
  setTimeout(() => startBot(), 30000);
});
