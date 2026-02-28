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

export async function generateImage(prompt: string): Promise<Buffer | null> {
  if (OPENAI_API_KEY) {
    try {
      console.log(`[NanoBanana] Generating image via OpenAI DALL-E: "${prompt.substring(0, 80)}"`);
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NanoBanana] OpenAI image gen failed (${response.status}): ${errorText}`);
        return null;
      }

      const data = await response.json() as any;
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        console.error("[NanoBanana] No image data in OpenAI response");
        return null;
      }

      console.log("[NanoBanana] Image generated successfully via OpenAI DALL-E");
      return Buffer.from(b64, "base64");
    } catch (err: any) {
      console.error("[NanoBanana] OpenAI image gen error:", err.message);
    }
  }

  if (GEMINI_API_KEY) {
    try {
      console.log(`[NanoBanana] Generating image via Gemini Imagen: "${prompt.substring(0, 80)}"`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NanoBanana] Gemini image gen failed (${response.status}): ${errorText}`);
        return null;
      }

      const data = await response.json() as any;
      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          console.log("[NanoBanana] Image generated successfully via Gemini");
          return Buffer.from(part.inlineData.data, "base64");
        }
      }
      console.error("[NanoBanana] No image data in Gemini response");
    } catch (err: any) {
      console.error("[NanoBanana] Gemini image gen error:", err.message);
    }
  }

  console.error("[NanoBanana] No image generation API available (need OPENAI_API_KEY or GEMINI_API_KEY)");
  return null;
}

export interface ChatResponse {
  text: string;
  imagePrompt?: string;
}

export async function chat(userMessage: string, senderName?: string, platform?: string): Promise<ChatResponse> {
  const hasOpenRouter = !!OPENROUTER_API_KEY;
  const hasOpenAI = !!OPENAI_API_KEY;
  const hasGemini = !!GEMINI_API_KEY;

  if (!hasOpenRouter && !hasOpenAI && !hasGemini) {
    console.error("[OpenClaw] No AI API keys configured (OPENROUTER, OPENAI, or GEMINI)");
    return { text: "OpenClaw AI is not configured. The admin needs to set up an API key." };
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

  let imageGenContext = "";
  const hasImageGen = !!(OPENAI_API_KEY || GEMINI_API_KEY);
  if (hasImageGen) {
    imageGenContext = `\n\nIMAGE GENERATION (Nano Banana Pro):\nYou CAN generate images! When the user asks you to create, generate, draw, or design an image, logo, illustration, or any visual content, you MUST respond with the special tag [GENERATE_IMAGE: detailed prompt here] somewhere in your message. Write a detailed, descriptive prompt inside the tag that will produce the best image. For example:\n- User: "make me a logo for my app" → Your response should include [GENERATE_IMAGE: A modern, clean logo for...]\n- User: "draw a cat" → Your response should include [GENERATE_IMAGE: A cute cat...]\nAlways include a brief text message along with the tag to let the user know you're generating their image. NEVER say you cannot generate images — you absolutely can via Nano Banana Pro.`;
  }

  const platformLabel = platform || "messaging";
  const systemPrompt = `You are OpenClaw, a powerful AI assistant and agent coordinator available via ${platformLabel}. You orchestrate tasks across connected devices and skills. You are concise, friendly, and knowledgeable. Keep responses brief and suitable for mobile reading. If asked about yourself, you are OpenClaw — an AI-powered agent that manages skills, nodes, and automation. You are NOT a generic chatbot.${senderName ? ` The user's name is ${senderName}.` : ""}${skillsContext}${nodesContext}${imageGenContext}`;

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
      return parseImageResponse(result);
    } catch (err: any) {
      console.error(`[OpenClaw] ${provider.name} failed:`, err.message);
    }
  }

  return { text: "I'm having trouble processing your request right now. Please try again in a moment." };
}

function parseImageResponse(response: string): ChatResponse {
  const imageMatch = response.match(/\[GENERATE_IMAGE:\s*([\s\S]*?)\]/);
  if (imageMatch) {
    const imagePrompt = imageMatch[1].trim();
    const text = response.replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, "").trim();
    return { text: text || "Generating your image now...", imagePrompt };
  }
  return { text: response };
}
