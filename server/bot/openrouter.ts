import { storage } from "../storage";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

function stripModelPrefix(model: string): string {
  if (model.startsWith("openrouter/")) {
    return model.slice("openrouter/".length);
  }
  return model;
}

async function callModel(model: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_BASE_URL || "https://openclaw.ai",
      "X-Title": "OpenClaw AI Gateway",
    },
    body: JSON.stringify({
      model: stripModelPrefix(model),
      messages,
      max_tokens: 3000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as OpenRouterResponse;

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  return data.choices?.[0]?.message?.content || "I couldn't generate a response.";
}

export async function chat(userMessage: string, senderName?: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    return "OpenClaw is not configured yet. The admin needs to set up an OpenRouter API key.";
  }

  const config = await storage.getOpenclawConfig();
  const primaryModel = config?.defaultLlm || "openrouter/deepseek-chat";
  const fallbackModel = config?.fallbackLlm || "openrouter/auto";

  const systemPrompt = `You are OpenClaw, a helpful AI assistant available via WhatsApp. You are concise, friendly, and knowledgeable. Keep responses brief and suitable for mobile reading. If asked about yourself, you are an AI gateway powered by OpenClaw.${senderName ? ` The user's name is ${senderName}.` : ""}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    return await callModel(primaryModel, messages);
  } catch (primaryError) {
    console.error(`[OpenClaw] Primary model (${primaryModel}) failed:`, primaryError);

    if (fallbackModel && fallbackModel !== primaryModel) {
      try {
        console.log(`[OpenClaw] Falling back to ${fallbackModel}`);
        return await callModel(fallbackModel, messages);
      } catch (fallbackError) {
        console.error(`[OpenClaw] Fallback model (${fallbackModel}) also failed:`, fallbackError);
      }
    }

    return "I'm having trouble processing your request right now. Please try again in a moment.";
  }
}
