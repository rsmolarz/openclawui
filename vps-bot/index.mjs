#!/usr/bin/env node
import makeWASocketDefault from "@whiskeysockets/baileys";
import { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { hostname } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const makeWASocket = makeWASocketDefault.default || makeWASocketDefault;

const CONFIG_FILE = join(__dirname, "config.json");
const AUTH_DIR = join(__dirname, "auth_state");
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 120000;
const STATUS_INTERVAL_MS = 20000;
const KEEPALIVE_INTERVAL_MS = 25000;

let config = {};
let sock = null;
let reconnectAttempts = 0;
let qrCycleCount = 0;
let reconnectTimer = null;
let keepaliveTimer = null;
let statusTimer = null;
let lastPongTime = 0;
let currentState = "disconnected";
let currentPhone = null;
let currentError = null;
let currentQrDataUrl = null;
let isStarting = false;
let sentMessageIds = new Set();
let pairingCodeRequested = false;

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      dashboardUrl: "https://claw-settings.replit.app",
      apiKey: "YOUR_API_KEY_HERE",
      botName: "OpenClaw AI",
      phoneNumber: "13405140344",
      usePairingCode: true,
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created ${CONFIG_FILE} — edit it with your API key and dashboard URL, then run again.`);
    process.exit(0);
  }
  config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  if (!config.dashboardUrl || !config.apiKey || config.apiKey === "YOUR_API_KEY_HERE") {
    console.error("ERROR: Set dashboardUrl and apiKey in config.json");
    process.exit(1);
  }
  config.dashboardUrl = config.dashboardUrl.replace(/\/$/, "");
  console.log(`[VPS-Bot] Dashboard: ${config.dashboardUrl}`);
  console.log(`[VPS-Bot] Phone: ${config.phoneNumber || "not set"}`);
  console.log(`[VPS-Bot] Pairing mode: ${config.usePairingCode ? "pairing code" : "QR code"}`);
  console.log(`[VPS-Bot] Host: ${hostname()}`);
}

async function reportStatus(state, phone, error, qrDataUrl, pairingCode) {
  currentState = state;
  if (phone) currentPhone = phone;
  currentError = error;
  currentQrDataUrl = qrDataUrl || null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const urls = [config.dashboardUrl];
    if (config.dashboardUrlProd && config.dashboardUrlProd !== config.dashboardUrl) {
      urls.push(config.dashboardUrlProd);
    }
    for (const url of urls) {
      try {
        await fetch(`${url}/api/whatsapp/home-bot-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
          body: JSON.stringify({
            state,
            phone: phone || currentPhone,
            error,
            hostname: hostname(),
            runtime: "vps-baileys",
            qrDataUrl: qrDataUrl || null,
            pairingCode: pairingCode || null,
          }),
          signal: controller.signal,
        });
      } catch {}
    }
    clearTimeout(timeout);
  } catch (err) {
    if (state !== "connecting") {
      console.warn("[VPS-Bot] Status report failed:", err.message);
    }
  }
}

async function processMessage(phone, text, pushName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const urls = [config.dashboardUrl];
    if (config.dashboardUrlProd && config.dashboardUrlProd !== config.dashboardUrl) {
      urls.push(config.dashboardUrlProd);
    }
    let lastError = null;
    for (const url of urls) {
      try {
        const resp = await fetch(`${url}/api/whatsapp/home-bot-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
          body: JSON.stringify({ phone, text, pushName }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!resp.ok) {
          const err = await resp.text();
          lastError = new Error(`API error ${resp.status}: ${err}`);
          continue;
        }
        const data = await resp.json();
        return data.reply || "I couldn't generate a response.";
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("All dashboard URLs failed");
  } catch (err) {
    console.error("[VPS-Bot] Message processing failed:", err.message);
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
      console.warn(`[VPS-Bot] Keepalive failed (silent ${Math.round(silent / 1000)}s): ${err.message}`);
      if (silent > KEEPALIVE_INTERVAL_MS * 3) {
        console.error("[VPS-Bot] Connection dead — forcing reconnect");
        handleDeadConnection();
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function startStatusReporter() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(() => {
    reportStatus(currentState, currentPhone, currentError, null, null);
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
  console.log(`[VPS-Bot] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}, reason: ${reason})`);
  reportStatus("connecting", currentPhone, `Reconnecting... (${reason})`, null, null);
  reconnectTimer = setTimeout(() => startBot(), delay);
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
    console.error(`[VPS-Bot] Failed to send message to ${jid}:`, err.message);
  }
}

function hasAuthState() {
  return existsSync(join(AUTH_DIR, "creds.json"));
}

async function startBot() {
  if (isStarting && sock) {
    console.log("[VPS-Bot] Already starting, skip");
    return;
  }
  if (isStarting && !sock) {
    console.log("[VPS-Bot] isStarting flag stuck, resetting");
  }

  isStarting = true;
  clearTimers();
  qrCycleCount = 0;
  pairingCodeRequested = false;

  try {
    reportStatus("connecting", null, null, null, null);
    const existingAuth = hasAuthState();
    console.log(`[VPS-Bot] Starting WhatsApp connection... (existing auth: ${existingAuth})`);

    mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[VPS-Bot] Baileys version: ${version.join(".")}`);

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
        console.error("[VPS-Bot] Failed to save credentials:", err.message);
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
            console.log(`[VPS-Bot] ============================`);
            console.log(`[VPS-Bot] PAIRING CODE: ${formatted}`);
            console.log(`[VPS-Bot] Enter this code in WhatsApp > Linked Devices > Link with Phone Number`);
            console.log(`[VPS-Bot] ============================`);
            reportStatus("pairing_code_ready", null, null, null, formatted);
          } catch (err) {
            console.error("[VPS-Bot] Pairing code request failed:", err.message);
            console.log("[VPS-Bot] Falling back to QR code...");
            try {
              const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
              qrCycleCount++;
              console.log(`[VPS-Bot] QR code ready (cycle ${qrCycleCount}) — scan with your phone or view in dashboard`);
              reportStatus("qr_ready", null, null, qrDataUrl, null);
            } catch {}
          }
          return;
        }

        qrCycleCount++;
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          console.log(`[VPS-Bot] QR code ready (cycle ${qrCycleCount}) — scan with your phone or view in dashboard`);
          reportStatus("qr_ready", null, null, qrDataUrl, null);
        } catch (err) {
          console.error("[VPS-Bot] QR code generation failed:", err.message);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || "unknown";
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isBadSession = statusCode === DisconnectReason.badSession;
        const isConflict = statusCode === 440 || errorMsg.includes("conflict");
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.log(`[VPS-Bot] Connection closed: status=${statusCode}, reason="${errorMsg}"`);
        clearTimers();
        sock = null;
        isStarting = false;

        if (isConflict) {
          console.log("[VPS-Bot] Conflict — another session replaced this one. Waiting 60s then retrying.");
          reportStatus("disconnected", currentPhone, "Session conflict detected. Auto-retrying in 60s...", null, null);
          reconnectTimer = setTimeout(() => { reconnectAttempts = 0; startBot(); }, 60000);
        } else if (isLoggedOut || isBadSession) {
          console.log("[VPS-Bot] Session invalid — clearing auth and restarting");
          try {
            const { rmSync } = await import("fs");
            rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log("[VPS-Bot] Auth state cleared");
          } catch {}
          reconnectAttempts = 0;
          reportStatus("disconnected", null, "Session expired. Re-pairing automatically...", null, null);
          reconnectTimer = setTimeout(() => startBot(), 5000);
        } else if (isRestartRequired) {
          console.log("[VPS-Bot] Restart required, reconnecting immediately...");
          reconnectAttempts = 0;
          setTimeout(() => startBot(), 1000);
        } else {
          scheduleReconnect(`status ${statusCode}: ${errorMsg}`);
        }
      } else if (connection === "open") {
        clearTimers();
        qrCycleCount = 0;
        reconnectAttempts = 0;
        isStarting = false;
        const phone = newSock.user?.id?.split(":")[0] || newSock.user?.id?.split("@")[0] || null;
        currentPhone = phone;
        console.log(`[VPS-Bot] Connected as +${phone}`);
        console.log(`[VPS-Bot] WhatsApp is now active. Auth state saved — will auto-reconnect on restart.`);
        reportStatus("connected", phone, null, null, null);
        startKeepalive();
        startStatusReporter();
      }
    });

    newSock.ev.on("messaging-history.set", ({ chats, contacts, messages, isLatest }) => {
      console.log(`[VPS-Bot] History sync: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} msgs`);
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
          console.log(`[VPS-Bot] Message from linked device ${actualSender}`);
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
        console.log(`[VPS-Bot] Message from ${senderPhone} (${pushName || "?"}): "${text.trim().substring(0, 80)}"`);

        try {
          await newSock.sendPresenceUpdate("composing", jid);
        } catch {}

        const reply = await processMessage(senderPhone, text.trim(), pushName);

        try {
          await newSock.sendPresenceUpdate("paused", jid);
        } catch {}

        if (reply && reply.trim()) {
          await sendMessage(jid, reply);
          console.log(`[VPS-Bot] Reply sent to ${senderPhone} (${reply.length} chars)`);
        }
      }
    });
  } catch (error) {
    console.error("[VPS-Bot] Failed to start:", error.message);
    clearTimers();
    isStarting = false;
    sock = null;
    reportStatus("disconnected", null, `Start failed: ${error.message}`, null, null);
    scheduleReconnect("start error");
  }
}

process.on("SIGINT", async () => {
  console.log("\n[VPS-Bot] Shutting down gracefully...");
  clearTimers();
  await reportStatus("disconnected", currentPhone, "Manual shutdown", null, null);
  if (sock) { try { sock.end(undefined); } catch {} }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[VPS-Bot] SIGTERM received...");
  clearTimers();
  await reportStatus("disconnected", currentPhone, "Service stopped", null, null);
  if (sock) { try { sock.end(undefined); } catch {} }
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[VPS-Bot] Uncaught exception:", err.message);
  console.error(err.stack);
  if (!isStarting) {
    reportStatus("disconnected", currentPhone, "Crash: " + err.message, null, null);
    scheduleReconnect("uncaught exception");
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[VPS-Bot] Unhandled rejection:", reason);
});

loadConfig();
console.log("[VPS-Bot] OpenClaw WhatsApp VPS Bot (Baileys) starting...");
startBot().catch((err) => {
  console.error("[VPS-Bot] Fatal:", err);
  reportStatus("disconnected", null, "Fatal: " + err.message, null, null);
  setTimeout(() => startBot(), 30000);
});
