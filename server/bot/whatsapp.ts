import baileysDefault, {
  useMultiFileAuthState,
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
import * as fs from "fs";

const AUTH_DIR = "./whatsapp-auth";
const MAX_QR_RETRIES = 5;

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
  private isStarting = false;
  private qrCycleCount = 0;
  private usePairingCode = false;
  private pairingPhone: string | null = null;

  getStatus(): BotStatus {
    return { ...this.status };
  }

  hasAuthState(): boolean {
    try {
      return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
    } catch {
      return false;
    }
  }

  private clearAuthState(): void {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log("[WhatsApp] Auth state cleared");
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to clear auth state:", err);
    }
  }

  async startWithPairingCode(phoneNumber: string): Promise<void> {
    const cleaned = phoneNumber.replace(/[^0-9]/g, "");
    if (!cleaned || cleaned.length < 7) {
      throw new Error("Invalid phone number");
    }
    this.usePairingCode = true;
    this.pairingPhone = cleaned;
    if (this.hasAuthState()) {
      this.clearAuthState();
    }
    await this.start();
  }

  async start(): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    this.qrCycleCount = 0;

    try {
      this.status = { state: "connecting", qrDataUrl: null, pairingCode: null, phone: null, error: null };
      this.emit("status", this.status);

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      const sock = makeWASocket({
        auth: state,
        browser: this.usePairingCode ? ["Chrome (Linux)", "", ""] : ["OpenClaw", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 500,
        printQRInTerminal: false,
      });

      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

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
            console.log(`[WhatsApp] Pairing code generated: ${formattedCode} — enter in WhatsApp > Linked Devices > Link with phone number`);
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
          if (this.qrCycleCount > MAX_QR_RETRIES * 6) {
            console.log(`[WhatsApp] QR code expired after ${MAX_QR_RETRIES} cycles. Stopping bot. Use dashboard to restart.`);
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: "QR code expired. Try using 'Link with Phone Number' instead, or restart the bot.",
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
            console.log(`[WhatsApp] QR code generated (${this.qrCycleCount}) - scan with your phone`);
          } catch (err) {
            console.error("[WhatsApp] Failed to generate QR:", err);
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Connection closed. Status: ${statusCode}. LoggedOut: ${isLoggedOut}`);

          this.sock = null;
          this.isStarting = false;

          if (isLoggedOut) {
            console.log("[WhatsApp] Logged out — clearing auth state and restarting...");
            this.clearAuthState();
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: "Logged out from WhatsApp. Restarting...",
            };
            this.emit("status", this.status);
            this.reconnectTimer = setTimeout(() => this.start(), 3000);
          } else if (this.qrCycleCount > MAX_QR_RETRIES * 6) {
            console.log("[WhatsApp] Max QR retries reached. Bot stopped.");
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: "QR code expired after max retries. Try 'Link with Phone Number' instead.",
            };
            this.emit("status", this.status);
          } else {
            this.status = {
              state: "disconnected",
              qrDataUrl: null,
              pairingCode: null,
              phone: null,
              error: `Connection closed (${statusCode})`,
            };
            this.emit("status", this.status);
            this.reconnectTimer = setTimeout(() => this.start(), 5000);
          }
        } else if (connection === "open") {
          this.qrCycleCount = 0;
          this.usePairingCode = false;
          this.pairingPhone = null;
          const phone = sock.user?.id?.split(":")[0] || sock.user?.id?.split("@")[0] || null;
          this.status = { state: "connected", qrDataUrl: null, pairingCode: null, phone, error: null };
          this.emit("status", this.status);
          console.log(`[WhatsApp] Connected as ${phone}`);
        }
      });

      sock.ev.on("messages.upsert", async (m: any) => {
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";

          if (!text.trim()) continue;

          const jid = msg.key.remoteJid;
          if (!jid || jid === "status@broadcast") continue;

          const senderPhone = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
          const pushName = msg.pushName || undefined;

          await this.handleMessage(jid, senderPhone, text.trim(), pushName);
        }
      });
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      this.status = {
        state: "disconnected",
        qrDataUrl: null,
        pairingCode: null,
        phone: null,
        error: String(error),
      };
      this.emit("status", this.status);
      this.isStarting = false;
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

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
      }
      this.sock = null;
    }
    this.status = { state: "disconnected", qrDataUrl: null, pairingCode: null, phone: null, error: null };
    this.emit("status", this.status);
    this.isStarting = false;
    this.qrCycleCount = 0;
    this.usePairingCode = false;
    this.pairingPhone = null;
    console.log("[WhatsApp] Bot stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
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
