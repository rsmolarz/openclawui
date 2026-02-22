import baileysDefault, {
  DisconnectReason,
} from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
const makeWASocket = (baileysDefault as any).default || baileysDefault;
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { chat } from "./openrouter";
import { EventEmitter } from "events";
import { useDbAuthState, hasDbAuthState, clearAllDbAuthState } from "./db-auth-state";
const MAX_QR_RETRIES = 5;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const KEEPALIVE_INTERVAL_MS = 25000;
const START_TIMEOUT_MS = 45000;

export interface BotStatus {
  state: "disconnected" | "connecting" | "qr_ready" | "pairing_code_ready" | "connected";
  qrDataUrl: string | null;
  pairingCode: string | null;
  phone: string | null;
  error: string | null;
}

class WhatsAppBot extends EventEmitter {
  private sock: WASocket | null = null;
  private status: BotStatus = {
    state: "disconnected",
    qrDataUrl: null,
    pairingCode: null,
    phone: null,
    error: null,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private startTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isStarting = false;
  private qrCycleCount = 0;
  private usePairingCode = false;
  private pairingPhone: string | null = null;
  private reconnectAttempts = 0;
  private autoReconnect = true;
  private _hasDbAuth = false;
  private _clearAuthFn: (() => Promise<void>) | null = null;
  private lastPongTime = 0;

  getStatus(): BotStatus {
    return { ...this.status };
  }

  hasAuthState(): boolean {
    return this._hasDbAuth;
  }

  async checkAndLoadAuthState(): Promise<boolean> {
    return this.checkDbAuth();
  }

  private async checkDbAuth(): Promise<boolean> {
    try {
      this._hasDbAuth = await hasDbAuthState();
      return this._hasDbAuth;
    } catch {
      return false;
    }
  }

  private async clearAuthState(): Promise<void> {
    try {
      await clearAllDbAuthState();
      this._hasDbAuth = false;
    } catch (err) {
      console.error("[WhatsApp] Failed to clear auth state:", err);
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.startTimeoutTimer) {
      clearTimeout(this.startTimeoutTimer);
      this.startTimeoutTimer = null;
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.lastPongTime = Date.now();
    this.keepaliveTimer = setInterval(async () => {
      if (!this.sock || this.status.state !== "connected") {
        return;
      }
      try {
        await this.sock.sendPresenceUpdate("available");
        this.lastPongTime = Date.now();
      } catch (err) {
        const silentMs = Date.now() - this.lastPongTime;
        console.warn(`[WhatsApp] Keepalive failed (silent for ${Math.round(silentMs / 1000)}s):`, String(err));
        if (silentMs > KEEPALIVE_INTERVAL_MS * 3) {
          console.error("[WhatsApp] Connection appears dead — forcing reconnect");
          this.handleDeadConnection();
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private handleDeadConnection(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.sock) {
      try { this.sock.end(undefined); } catch {}
      this.sock = null;
    }
    this.isStarting = false;
    if (this.autoReconnect) {
      this.reconnectAttempts++;
      const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
      console.log(`[WhatsApp] Scheduling reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);
      this.status = {
        state: "connecting",
        qrDataUrl: null,
        pairingCode: null,
        phone: this.status.phone,
        error: `Reconnecting... (connection lost)`,
      };
      this.emit("status", this.status);
      this.reconnectTimer = setTimeout(() => this.start(), delay);
    }
  }

  async startWithPairingCode(phoneNumber: string): Promise<void> {
    const cleaned = phoneNumber.replace(/[^0-9]/g, "");
    if (!cleaned || cleaned.length < 7) {
      throw new Error("Invalid phone number");
    }
    this.usePairingCode = true;
    this.pairingPhone = cleaned;
    await this.checkDbAuth();
    if (this.hasAuthState()) {
      await this.clearAuthState();
    }
    await this.start();
  }

  async start(): Promise<void> {
    if (this.isStarting && this.sock) {
      console.log("[WhatsApp] Already starting, skipping duplicate start()");
      return;
    }

    if (this.isStarting && !this.sock) {
      console.log("[WhatsApp] isStarting flag stuck without socket, resetting");
    }

    this.isStarting = true;
    this.autoReconnect = true;
    this.clearTimers();
    this.qrCycleCount = 0;

    try {
      this.status = { state: "connecting", qrDataUrl: null, pairingCode: null, phone: null, error: null };
      this.emit("status", this.status);

      await this.checkDbAuth();
      console.log(`[WhatsApp] Starting connection (existing session: ${this._hasDbAuth})`);
      const { state, saveCreds, clearAll } = await useDbAuthState();
      this._clearAuthFn = clearAll;

      this.startTimeoutTimer = setTimeout(() => {
        if (this.status.state === "connecting") {
          console.error("[WhatsApp] Start timeout — no QR or connection event received in 45s");
          this.isStarting = false;
          if (this.sock) {
            try { this.sock.end(undefined); } catch {}
            this.sock = null;
          }
          if (this.autoReconnect && this._hasDbAuth) {
            this.reconnectAttempts++;
            const delay = RECONNECT_DELAY_MS;
            console.log(`[WhatsApp] Retrying after timeout in ${delay / 1000}s`);
            this.status = { state: "connecting", qrDataUrl: null, pairingCode: null, phone: null, error: "Connection timed out, retrying..." };
            this.emit("status", this.status);
            this.reconnectTimer = setTimeout(() => this.start(), delay);
          } else {
            this.status = { state: "disconnected", qrDataUrl: null, pairingCode: null, phone: null, error: "Connection timed out. Click Start to try again." };
            this.emit("status", this.status);
          }
        }
      }, START_TIMEOUT_MS);

      const sock = makeWASocket({
        auth: state,
        browser: this.usePairingCode ? ["Chrome (Linux)", "", ""] : ["OpenClaw", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 250,
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        getMessage: async (key: any) => {
          return { conversation: "" };
        },
      });

      this.sock = sock;

      sock.ev.on("messaging-history.set", ({ chats, contacts, messages, isLatest }: any) => {
        console.log(`[WhatsApp] History sync: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages, isLatest=${isLatest}`);
      });

      sock.ev.on("creds.update", async () => {
        try {
          await saveCreds();
        } catch (err) {
          console.error("[WhatsApp] CRITICAL: Failed to save credentials:", err);
        }
      });

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (this.startTimeoutTimer && (qr || connection)) {
          clearTimeout(this.startTimeoutTimer);
          this.startTimeoutTimer = null;
        }

        if (qr && this.usePairingCode && this.pairingPhone) {
          try {
            const code = await sock.requestPairingCode(this.pairingPhone);
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
            this.status = {
              state: "pairing_code_ready",
              qrDataUrl: null,
              pairingCode: formattedCode,
              phone: null,
              error: null,
            };
            this.emit("status", this.status);
            console.log(`[WhatsApp] Pairing code generated: ${formattedCode}`);
            this.usePairingCode = false;
          } catch (err) {
            console.error("[WhatsApp] Failed to request pairing code:", err);
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: `Failed to generate pairing code: ${String(err)}`,
            };
            this.emit("status", this.status);
            this.isStarting = false;
            this.usePairingCode = false;
          }
          return;
        }

        if (qr && !this.usePairingCode) {
          this.qrCycleCount++;
          if (this.qrCycleCount > MAX_QR_RETRIES) {
            console.log(`[WhatsApp] QR code expired after ${MAX_QR_RETRIES} cycles. Stopping.`);
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: "QR code expired. Try 'Link with Phone Number' instead, or click Start again.",
            };
            this.emit("status", this.status);
            this.isStarting = false;
            if (this.sock) {
              try { this.sock.end(undefined); } catch {}
              this.sock = null;
            }
            return;
          }
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            this.status = { state: "qr_ready", qrDataUrl, pairingCode: null, phone: null, error: null };
            this.emit("status", this.status);
            console.log(`[WhatsApp] QR code ready (cycle ${this.qrCycleCount}/${MAX_QR_RETRIES}) — scan with your phone`);
          } catch (err) {
            console.error("[WhatsApp] Failed to generate QR data URL:", err);
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMsg = (lastDisconnect?.error as Boom)?.message || "unknown";
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired;
          const isConnectionLost = statusCode === DisconnectReason.connectionLost;
          const isTimedOut = statusCode === DisconnectReason.timedOut;
          const isBadSession = statusCode === DisconnectReason.badSession;
          const isConflict = statusCode === 440 || errorMsg.includes("conflict");

          console.log(`[WhatsApp] Connection closed: status=${statusCode}, reason="${errorMsg}", loggedOut=${isLoggedOut}`);

          this.clearTimers();
          this.sock = null;
          this.isStarting = false;

          if (isConflict) {
            console.log("[WhatsApp] Conflict detected — another session replaced this one. Stopping to avoid reconnect loop.");
            this.autoReconnect = false;
            this.reconnectAttempts = 0;
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: this.status.phone,
              error: "Another WhatsApp session replaced this connection. Click Start to reconnect (make sure only one instance is running).",
            };
            this.emit("status", this.status);
          } else if (isLoggedOut || isBadSession) {
            console.log("[WhatsApp] Session invalid — clearing auth state");
            await this.clearAuthState();
            this.reconnectAttempts = 0;
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: isLoggedOut
                ? "Logged out from WhatsApp. Click Start to reconnect."
                : "Bad session. Click Start to create a new connection.",
            };
            this.emit("status", this.status);
          } else if (this.autoReconnect) {
            await this.checkDbAuth();
            const hasSession = this.hasAuthState();

            if (!hasSession && (isTimedOut || statusCode === 408)) {
              console.log("[WhatsApp] No session + timeout. User must re-start manually.");
              this.status = {
                state: "disconnected",
                qrDataUrl: null,
                pairingCode: null,
                phone: null,
                error: "Connection timed out. Click Start to try again.",
              };
              this.emit("status", this.status);
              return;
            }

            this.reconnectAttempts++;
            const delay = hasSession
              ? Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS)
              : RECONNECT_DELAY_MS;

            const reason = isRestartRequired ? "restart required" :
              isConnectionLost ? "connection lost" :
              isTimedOut ? "timed out" : `status ${statusCode}`;

            console.log(`[WhatsApp] Auto-reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}, reason: ${reason}, hasSession: ${hasSession})`);

            this.status = {
              state: "connecting",
              qrDataUrl: null,
              pairingCode: null,
              phone: this.status.phone,
              error: `Reconnecting... (${reason})`,
            };
            this.emit("status", this.status);
            this.reconnectTimer = setTimeout(() => this.start(), delay);
          } else {
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: `Connection closed (${statusCode})`,
            };
            this.emit("status", this.status);
          }
        } else if (connection === "open") {
          this.clearTimers();
          this.qrCycleCount = 0;
          this.reconnectAttempts = 0;
          this.usePairingCode = false;
          this.pairingPhone = null;
          this._hasDbAuth = true;
          this.isStarting = false;
          const phone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0] || null;
          this.status = { state: "connected", qrDataUrl: null, pairingCode: null, phone, error: null };
          this.emit("status", this.status);
          console.log(`[WhatsApp] Connected as ${phone} — starting keepalive`);
          this.startKeepalive();
        }
      });

      sock.ev.on("messages.upsert", async (m: any) => {
        const messageType = m.type;
        const messageCount = m.messages?.length || 0;
        console.log(`[WhatsApp] messages.upsert event: type=${messageType}, count=${messageCount}`);

        if (messageType !== "notify" && messageType !== "append") return;

        for (const msg of m.messages) {
          const jid = msg.key?.remoteJid;
          const fromMe = msg.key?.fromMe;
          const hasMessage = !!msg.message;

          if (fromMe) continue;
          if (!hasMessage) {
            continue;
          }

          if (!jid || jid === "status@broadcast") continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            msg.message.buttonsResponseMessage?.selectedDisplayText ||
            msg.message.listResponseMessage?.title ||
            msg.message.templateButtonReplyMessage?.selectedDisplayText ||
            "";

          if (!text.trim()) {
            console.log(`[WhatsApp] Non-text message from ${jid} (type: ${Object.keys(msg.message).join(", ")})`);
            continue;
          }

          const isGroup = jid.endsWith("@g.us");
          const senderPhone = isGroup
            ? (msg.key.participant || jid).replace("@s.whatsapp.net", "").replace("@g.us", "")
            : jid.replace("@s.whatsapp.net", "");
          const pushName = msg.pushName || undefined;

          console.log(`[WhatsApp] Text message from ${senderPhone} (${pushName || "unknown"}) in ${isGroup ? "group" : "DM"}: "${text.trim().substring(0, 80)}"`);

          await this.handleMessage(isGroup ? jid : jid, senderPhone, text.trim(), pushName);
        }
      });
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      this.clearTimers();
      this.status = {
        state: "disconnected",
        qrDataUrl: null,
        pairingCode: null,
        phone: null,
        error: String(error),
      };
      this.emit("status", this.status);
      this.isStarting = false;

      if (this.autoReconnect && this._hasDbAuth) {
        this.reconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * 2, MAX_RECONNECT_DELAY_MS);
        console.log(`[WhatsApp] Retrying after error in ${delay / 1000}s`);
        this.reconnectTimer = setTimeout(() => this.start(), delay);
      }
    }
  }

  private async handleMessage(jid: string, phone: string, text: string, pushName?: string): Promise<void> {
    try {
      console.log(`[WhatsApp] Incoming message from ${phone} (${pushName || "unknown"}): "${text.substring(0, 100)}"`);

      const session = await storage.getWhatsappSessionByPhone(phone);
      console.log(`[WhatsApp] Session for ${phone}: ${session ? `status=${session.status}` : "none"}`);

      if (!session || session.status === "pending") {
        const code = session?.pairingCode || generatePairingCode();

        await storage.upsertWhatsappSession(phone, {
          phone,
          displayName: pushName || null,
          status: "pending",
          pairingCode: code,
        });

        console.log(`[WhatsApp] New/pending user ${phone} assigned pairing code: ${code}`);

        await this.sendMessage(jid,
          `Welcome to *OpenClaw AI*\n\n` +
          `Your access is not yet approved.\n\n` +
          `Your pairing code is: *${code}*\n\n` +
          `Please share this code with the administrator to get access.`
        );
        return;
      }

      if (session.status === "blocked") {
        console.log(`[WhatsApp] Blocked user ${phone} tried to send a message`);
        await this.sendMessage(jid, "Your access has been revoked. Contact the administrator.");
        return;
      }

      if (session.status === "approved") {
        await storage.updateWhatsappSessionLastMessage(phone);

        console.log(`[WhatsApp] Processing AI response for approved user ${phone}...`);
        await this.sendTyping(jid);

        const startTime = Date.now();
        try {
          const timeoutMs = 90000;
          const response = await Promise.race([
            chat(text, pushName || session.displayName || undefined),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("AI response timed out after 90s")), timeoutMs)
            ),
          ]);
          const elapsed = Date.now() - startTime;
          console.log(`[WhatsApp] AI response generated in ${elapsed}ms (${response.length} chars) for ${phone}`);

          if (response && response.trim()) {
            await this.sendMessage(jid, response);
            console.log(`[WhatsApp] Reply sent to ${phone}`);
          } else {
            console.error(`[WhatsApp] Empty response from AI for ${phone}`);
            await this.sendMessage(jid, "I couldn't generate a response. Please try again.");
          }
        } catch (chatError) {
          const elapsed = Date.now() - startTime;
          console.error(`[WhatsApp] AI chat failed after ${elapsed}ms for ${phone}:`, chatError);
          await this.sendMessage(jid, "Sorry, I'm having trouble right now. Please try again in a moment.");
        }
      }
    } catch (error) {
      console.error(`[WhatsApp] Error handling message from ${phone}:`, error);
      await this.sendMessage(jid, "Sorry, something went wrong. Please try again.");
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, { text });
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message to ${jid}:`, error);
    }
  }

  private async sendTyping(jid: string): Promise<void> {
    if (!this.sock) return;
    try {
      await this.sock.sendPresenceUpdate("composing", jid);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.sock.sendPresenceUpdate("paused", jid);
    } catch {
    }
  }

  async stopGracefully(): Promise<void> {
    this.autoReconnect = false;
    this.clearTimers();
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.isStarting = false;
    console.log("[WhatsApp] Graceful shutdown complete (session preserved in database)");
  }

  async stop(): Promise<void> {
    this.autoReconnect = false;
    this.clearTimers();
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.status = { state: "disconnected", qrDataUrl: null, pairingCode: null, phone: null, error: null };
    this.emit("status", this.status);
    this.isStarting = false;
    this.qrCycleCount = 0;
    this.usePairingCode = false;
    this.pairingPhone = null;
    this.reconnectAttempts = 0;
    console.log("[WhatsApp] Bot stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start();
  }

  async logout(): Promise<void> {
    await this.stop();
    await this.clearAuthState();
    console.log("[WhatsApp] Logged out — auth state cleared. Ready for fresh QR.");
  }

  async startFresh(): Promise<void> {
    await this.stop();
    await this.clearAuthState();
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.start();
  }

  isConnected(): boolean {
    return this.status.state === "connected";
  }

  async sendApprovalNotification(phone: string): Promise<void> {
    if (!this.isConnected()) return;
    const jid = `${phone}@s.whatsapp.net`;
    await this.sendMessage(jid,
      `Your access to *OpenClaw AI* has been approved!\n\n` +
      `You can now send me any message and I'll respond with AI-powered answers.\n\n` +
      `Try asking me anything!`
    );
  }
}

function generatePairingCode(): string {
  return randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
}

export const whatsappBot = new WhatsAppBot();
