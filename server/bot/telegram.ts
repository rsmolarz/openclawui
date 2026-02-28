import { chat } from "./openrouter";
import { storage } from "../storage";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = "https://api.telegram.org/bot";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name?: string;
      last_name?: string;
      username?: string;
      title?: string;
    };
    date: number;
    text?: string;
  };
}

let pollingActive = false;
let pollingTimer: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
let botInfo: { id: number; username: string; first_name: string } | null = null;
let connectionState: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
let connectionError: string | null = null;
let messageCount = 0;

async function telegramRequest(method: string, body?: any): Promise<any> {
  const response = await fetch(`${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as any;
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
  }
  return data.result;
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const maxLen = 4096;
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  for (const chunk of chunks) {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
    }).catch(async () => {
      await telegramRequest("sendMessage", {
        chat_id: chatId,
        text: chunk,
      });
    });
  }
}

async function handleMessage(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || msg.from.is_bot) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
  const username = msg.from.username || String(msg.from.id);

  if (text === "/start") {
    await sendMessage(chatId,
      `👋 Welcome to *OpenClaw*!\n\nI'm your AI-powered agent coordinator. I manage skills, nodes, and automation across your connected devices. Send me any message and I'll help.\n\nCommands:\n/start - Show this message\n/status - Check bot status\n/help - Get help`
    );
    return;
  }

  if (text === "/status") {
    await sendMessage(chatId,
      `🟢 *OpenClaw AI Bot*\n\nStatus: Online\nPlatform: Telegram\nMessages handled: ${messageCount}\nBot: @${botInfo?.username || "unknown"}`
    );
    return;
  }

  if (text === "/help") {
    let skillsList = "";
    try {
      const skills = await storage.getSkills();
      const enabled = skills.filter(s => s.enabled);
      if (enabled.length > 0) {
        skillsList = `\n\n*Installed Skills (${enabled.length}):*\n${enabled.slice(0, 15).map(s => `• ${s.name}`).join("\n")}${enabled.length > 15 ? `\n...and ${enabled.length - 15} more` : ""}`;
      }
    } catch {}
    await sendMessage(chatId,
      `*OpenClaw Help*\n\nI'm your AI agent coordinator. I orchestrate tasks across your connected nodes and skills.\n\nI can help with:\n• Running skills on connected devices\n• General questions and analysis\n• Code and tech questions\n• Writing and editing${skillsList}\n\nSend any message to get started.`
    );
    return;
  }

  console.log(`[Telegram] Message from ${senderName} (@${username}): "${text.substring(0, 80)}"`);
  messageCount++;

  try {
    await telegramRequest("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {}

  try {
    const reply = await chat(text, senderName, "Telegram");
    await sendMessage(chatId, reply);
    console.log(`[Telegram] Reply sent to ${senderName} (${reply.length} chars)`);
  } catch (err: any) {
    console.error(`[Telegram] Error processing message:`, err.message);
    await sendMessage(chatId, "Sorry, I'm having trouble processing your request. Please try again.");
  }
}

async function pollUpdates(): Promise<void> {
  if (!pollingActive) return;

  try {
    const updates: TelegramUpdate[] = await telegramRequest("getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 25,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      lastUpdateId = update.update_id;
      try {
        await handleMessage(update);
      } catch (err: any) {
        console.error(`[Telegram] Error handling update ${update.update_id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[Telegram] Polling error:`, err.message);
    if (err.message.includes("401") || err.message.includes("Unauthorized")) {
      connectionState = "error";
      connectionError = "Invalid bot token";
      pollingActive = false;
      console.error("[Telegram] Bot token is invalid. Stopping.");
      return;
    }
    if (err.message.includes("Conflict") || err.message.includes("terminated by other")) {
      console.warn("[Telegram] Another bot instance is running. Retrying in 10s...");
      connectionState = "connecting";
      connectionError = "Another instance running — retrying";
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (pollingActive) {
    pollingTimer = setTimeout(pollUpdates, 500);
  }
}

export async function startTelegramBot(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    connectionState = "disconnected";
    connectionError = "No bot token configured";
    return;
  }

  if (pollingActive) {
    console.log("[Telegram] Already running");
    return;
  }

  connectionState = "connecting";
  connectionError = null;

  try {
    botInfo = await telegramRequest("getMe");
    console.log(`[Telegram] Connected as @${botInfo!.username} (${botInfo!.first_name})`);

    await telegramRequest("deleteWebhook", { drop_pending_updates: false });

    pollingActive = true;
    connectionState = "connected";
    pollUpdates();
    console.log("[Telegram] Long-polling started");
  } catch (err: any) {
    console.error("[Telegram] Failed to start:", err.message);
    connectionState = "error";
    connectionError = err.message;
  }
}

export function stopTelegramBot(): void {
  pollingActive = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
  connectionState = "disconnected";
  console.log("[Telegram] Bot stopped");
}

export function getTelegramStatus() {
  return {
    state: connectionState,
    error: connectionError,
    botUsername: botInfo?.username || null,
    botName: botInfo?.first_name || null,
    messageCount,
    enabled: !!TELEGRAM_BOT_TOKEN,
  };
}
