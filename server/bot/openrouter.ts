import { storage } from "../storage";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
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

async function callOpenRouter(model: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

  const data = await response.json() as LLMResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content || "I couldn't generate a response.";
}

async function callOpenAI(model: string, messages: ChatMessage[]): Promise<string> {
  const openaiModel = model.includes("/") ? "gpt-4o-mini" : model;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel,
      messages,
      max_tokens: 3000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as LLMResponse;
  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content || "I couldn't generate a response.";
}

async function callGemini(messages: ChatMessage[]): Promise<string> {
  const systemMsg = messages.find(m => m.role === "system");
  const userMsgs = messages.filter(m => m.role !== "system");

  const contents = userMsgs.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: any = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  body.generationConfig = { maxOutputTokens: 3000, temperature: 0.7 };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No content in Gemini response");
  return text;
}

export async function chat(userMessage: string, senderName?: string, platform?: string): Promise<string> {
  const hasOpenRouter = !!OPENROUTER_API_KEY;
  const hasOpenAI = !!OPENAI_API_KEY;
  const hasGemini = !!GEMINI_API_KEY;

  if (!hasOpenRouter && !hasOpenAI && !hasGemini) {
    console.error("[OpenClaw] No AI API keys configured (OPENROUTER, OPENAI, or GEMINI)");
    return "OpenClaw AI is not configured. The admin needs to set up an API key.";
  }

  const instances = await storage.getInstances();
  const firstInstance = instances[0];
  const config = firstInstance ? await storage.getOpenclawConfig(String(firstInstance.id)) : undefined;
  const primaryModel = config?.defaultLlm || "deepseek/deepseek-chat";
  const fallbackModel = config?.fallbackLlm || "openrouter/auto";

  let skillsContext = "";
  let nodesContext = "";
  try {
    const [skills, machines] = await Promise.all([
      storage.getSkills(),
      storage.getMachines(),
    ]);
    const enabledSkills = skills.filter(s => s.enabled);
    if (enabledSkills.length > 0) {
      const skillList = enabledSkills.map(s => `- **${s.name}**: ${s.description || s.category}`).join("\n");
      skillsContext = `\n\nYOU HAVE THE FOLLOWING SKILLS INSTALLED AND ACTIVE — these are YOUR capabilities, not external services:\n${skillList}\n\nCRITICAL RULES FOR SKILLS:\n1. You MUST acknowledge these skills by name when a user asks about them.\n2. NEVER say "I don't have access to" or "I'm not familiar with" any skill listed above.\n3. When a user asks you to do something covered by a skill, confirm you have that skill and explain what it can do.\n4. If a user asks "can you see skill X?" and X is in the list above, answer YES and describe it.\n5. These skills run on your connected nodes — you coordinate their execution.\n6. You are not a generic chatbot. You are OpenClaw with these specific installed capabilities.`;
    }
    const connectedNodes = machines.filter(m => m.status === "connected");
    if (connectedNodes.length > 0) {
      const nodeList = connectedNodes.map(m => `- ${m.displayName || m.hostname || m.name} (${m.os || "unknown"})`).join("\n");
      nodesContext = `\n\nYou are connected to the following nodes/devices:\n${nodeList}`;
    }
  } catch (err: any) {
    console.error("[OpenClaw] Failed to load skills/nodes context:", err.message);
  }

  const platformLabel = platform || "messaging";
  const systemPrompt = `You are OpenClaw, a powerful AI assistant and agent coordinator available via ${platformLabel}. You orchestrate tasks across connected devices and skills. You are concise, friendly, and knowledgeable. Keep responses brief and suitable for mobile reading. If asked about yourself, you are OpenClaw — an AI-powered agent that manages skills, nodes, and automation. You are NOT a generic chatbot.${senderName ? ` The user's name is ${senderName}.` : ""}${skillsContext}${nodesContext}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const providers: Array<{ name: string; fn: () => Promise<string> }> = [];

  if (hasOpenRouter) {
    providers.push({ name: `OpenRouter/${primaryModel}`, fn: () => callOpenRouter(primaryModel, messages) });
    if (fallbackModel && fallbackModel !== primaryModel) {
      providers.push({ name: `OpenRouter/${fallbackModel}`, fn: () => callOpenRouter(fallbackModel, messages) });
    }
  }
  if (hasOpenAI) {
    providers.push({ name: "OpenAI/gpt-4o-mini", fn: () => callOpenAI("gpt-4o-mini", messages) });
  }
  if (hasGemini) {
    providers.push({ name: "Gemini/2.0-flash", fn: () => callGemini(messages) });
  }

  for (const provider of providers) {
    try {
      console.log(`[OpenClaw] Trying ${provider.name} for ${senderName || "unknown"} via ${platformLabel}`);
      const result = await provider.fn();
      console.log(`[OpenClaw] ${provider.name} succeeded (${result.length} chars)`);
      return result;
    } catch (err: any) {
      console.error(`[OpenClaw] ${provider.name} failed:`, err.message);
    }
  }

  return "I'm having trouble processing your request right now. Please try again in a moment.";
}
