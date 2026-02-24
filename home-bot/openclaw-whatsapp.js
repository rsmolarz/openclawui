#!/usr/bin/env node
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { SocksClient } = require("socks");
const net = require("net");

const CONFIG_FILE = path.join(__dirname, "config.json");
const AUTH_DIR = path.join(__dirname, "auth_state");
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 300000;
const KEEPALIVE_INTERVAL_MS = 25000;
const STATUS_REPORT_INTERVAL_MS = 30000;

let config = {};
let sock = null;
let reconnectAttempts = 0;
let autoReconnect = true;
let keepaliveTimer = null;
let statusTimer = null;
let lastPongTime = 0;
let connectedPhone = null;

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log("\n=== OpenClaw WhatsApp Bot - First Time Setup ===\n");
    console.log("No config.json found. Creating one...\n");
    console.log("You need your dashboard URL and an API key from Settings > API Keys.\n");
    const defaultConfig = {
      dashboardUrl: "https://claw-settings.replit.app",
      apiKey: "YOUR_API_KEY_HERE",
      phoneNumber: "",
      usePairingCode: true,
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
  if (config.socksProxy) {
    console.log(`SOCKS Proxy: ${config.socksProxy}`);
  }
}

function parseSocksProxy(proxyUrl) {
  if (!proxyUrl) return null;
  const url = new URL(proxyUrl.startsWith("socks") ? proxyUrl : `socks5://${proxyUrl}`);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 1080,
    type: url.protocol === "socks4:" ? 4 : 5,
    userId: url.username || undefined,
    password: url.password || undefined,
  };
}

function makeSocksAgent(proxyConfig) {
  return {
    createConnection: (opts, callback) => {
      const destHost = opts.host || opts.hostname;
      const destPort = opts.port || 443;
      SocksClient.createConnection({
        proxy: {
          host: proxyConfig.host,
          port: proxyConfig.port,
          type: proxyConfig.type,
          userId: proxyConfig.userId,
          password: proxyConfig.password,
        },
        command: "connect",
        destination: { host: destHost, port: destPort },
      }).then(info => {
        callback(null, info.socket);
      }).catch(err => {
        console.error(`[Proxy] SOCKS connection to ${destHost}:${destPort} failed:`, err.message);
        callback(err);
      });
    },
  };
}

async function reportStatus(state, phone, error) {
  try {
    await fetch(`${config.dashboardUrl}/api/whatsapp/home-bot-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ state, phone, error, runtime: "home-bot", hostname: require("os").hostname() }),
    });
  } catch (err) {
    // Silent — dashboard might be temporarily unavailable
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
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
}

function startKeepalive() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  lastPongTime = Date.now();
  keepaliveTimer = setInterval(async () => {
    if (!sock) return;
    try {
      await sock.sendPresenceUpdate("available");
      lastPongTime = Date.now();
    } catch (err) {
      const silentMs = Date.now() - lastPongTime;
      console.warn(`[Bot] Keepalive failed (silent ${Math.round(silentMs / 1000)}s):`, err.message);
      if (silentMs > KEEPALIVE_INTERVAL_MS * 3) {
        console.error("[Bot] Connection appears dead — forcing reconnect");
        handleDeadConnection();
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function startStatusReporter() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    reportStatus("connected", connectedPhone, null);
  }, STATUS_REPORT_INTERVAL_MS);
}

function handleDeadConnection() {
  clearTimers();
  if (sock) {
    try { sock.end(undefined); } catch {}
    sock = null;
  }
  if (autoReconnect) {
    reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
    console.log(`[Bot] Scheduling reconnect in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
    reportStatus("connecting", connectedPhone, "Reconnecting after dead connection");
    setTimeout(() => startBot(), delay);
  }
}

async function startBot() {
  console.log("\n[Bot] Starting WhatsApp connection...");
  autoReconnect = true;

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const hasExistingSession = fs.existsSync(path.join(AUTH_DIR, "creds.json"));

  console.log(`[Bot] Existing session: ${hasExistingSession}`);
  reportStatus("connecting", null, null);

  const socketOpts = {
    auth: state,
    browser: ["OpenClaw Home Bot", "Chrome", "1.0"],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    printQRInTerminal: !config.usePairingCode,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    getMessage: async () => ({ conversation: "" }),
  };

  const proxyConfig = parseSocksProxy(config.socksProxy);
  if (proxyConfig) {
    console.log(`[Bot] Using SOCKS${proxyConfig.type} proxy: ${proxyConfig.host}:${proxyConfig.port}`);
    socketOpts.agent = makeSocksAgent(proxyConfig);
  }

  sock = makeWASocket(socketOpts);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && config.usePairingCode && config.phoneNumber && !hasExistingSession) {
      try {
        const cleaned = config.phoneNumber.replace(/[^0-9]/g, "");
        const code = await sock.requestPairingCode(cleaned);
        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n╔════════════════════════════════════════╗");
        console.log("║     WHATSAPP PAIRING CODE              ║");
        console.log(`║     ${formatted}                      ║`);
        console.log("╠════════════════════════════════════════╣");
        console.log("║  1. Open WhatsApp on your phone        ║");
        console.log("║  2. Settings > Linked Devices           ║");
        console.log("║  3. Link a Device                       ║");
        console.log("║  4. 'Link with phone number instead'    ║");
        console.log("║  5. Enter the code above                ║");
        console.log("╚════════════════════════════════════════╝\n");
        reportStatus("pairing_code_ready", null, null);
      } catch (err) {
        console.error("[Bot] Failed to get pairing code:", err.message);
        console.log("[Bot] Falling back to QR code scanning...");
      }
      return;
    }

    if (qr && !config.usePairingCode) {
      console.log("\n[Bot] Scan the QR code above with WhatsApp > Linked Devices > Link a Device\n");
      reportStatus("qr_ready", null, null);
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const errorMsg = (lastDisconnect?.error)?.message || "unknown";
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired;
      const isConnectionLost = statusCode === DisconnectReason.connectionLost;
      const isTimedOut = statusCode === DisconnectReason.timedOut;
      const isBadSession = statusCode === DisconnectReason.badSession;

      console.log(`[Bot] Connection closed: status=${statusCode}, reason="${errorMsg}"`);
      clearTimers();
      sock = null;

      if (isLoggedOut || isBadSession) {
        console.log("[Bot] Session invalid — clearing auth state");
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        reconnectAttempts = 0;
        reportStatus("disconnected", null, isLoggedOut ? "Logged out" : "Bad session cleared");
        console.log("[Bot] Restarting in 5s to generate new QR/pairing code...");
        setTimeout(() => startBot(), 5000);
      } else if (autoReconnect) {
        reconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
        const reason = isRestartRequired ? "restart required" :
          isConnectionLost ? "connection lost" :
          isTimedOut ? "timed out" : `status ${statusCode}`;
        console.log(`[Bot] Auto-reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}, reason: ${reason})`);
        reportStatus("connecting", connectedPhone, `Reconnecting: ${reason}`);
        setTimeout(() => startBot(), delay);
      } else {
        reportStatus("disconnected", connectedPhone, `Closed: ${errorMsg}`);
      }
    } else if (connection === "open") {
      reconnectAttempts = 0;
      connectedPhone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0] || null;
      console.log(`\n[Bot] ✓ Connected as +${connectedPhone}\n`);
      console.log("[Bot] WhatsApp bot is running. Press Ctrl+C to stop.\n");
      reportStatus("connected", connectedPhone, null);
      startKeepalive();
      startStatusReporter();
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify" && m.type !== "append") return;

    for (const msg of m.messages) {
      const jid = msg.key?.remoteJid;
      if (msg.key?.fromMe || !msg.message || !jid || jid === "status@broadcast") continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      if (!text.trim()) continue;

      const isGroup = jid.endsWith("@g.us");
      const senderPhone = isGroup
        ? (msg.key.participant || jid).replace("@s.whatsapp.net", "").replace("@g.us", "")
        : jid.replace("@s.whatsapp.net", "");
      const pushName = msg.pushName || undefined;

      console.log(`[Bot] Message from ${senderPhone} (${pushName || "unknown"}): "${text.substring(0, 80)}"`);

      try {
        await sock.sendPresenceUpdate("composing", jid);
      } catch {}

      const reply = await processMessage(senderPhone, text.trim(), pushName);

      try {
        await sock.sendPresenceUpdate("paused", jid);
        await sock.sendMessage(jid, { text: reply });
        console.log(`[Bot] Reply sent to ${senderPhone} (${reply.length} chars)`);
      } catch (err) {
        console.error(`[Bot] Failed to send reply to ${senderPhone}:`, err.message);
      }
    }
  });
}

process.on("SIGINT", async () => {
  console.log("\n[Bot] Shutting down gracefully (session preserved)...");
  autoReconnect = false;
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Manual shutdown");
  if (sock) {
    try { sock.end(undefined); } catch {}
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Bot] Received SIGTERM, shutting down...");
  autoReconnect = false;
  clearTimers();
  reportStatus("disconnected", connectedPhone, "Service stopped");
  if (sock) {
    try { sock.end(undefined); } catch {}
  }
  process.exit(0);
});

loadConfig();
startBot().catch((err) => {
  console.error("[Bot] Fatal error:", err);
  process.exit(1);
});
