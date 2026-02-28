import type { GeminiProxySettings } from "./settings";

let cachedToken: string | null = null;
let cachedExpiryMs = 0;

function vertexBaseUrl(project: string, location: string): string {
  const host = (location && location !== "global")
    ? `https://${location}-aiplatform.googleapis.com`
    : "https://aiplatform.googleapis.com";

  return `${host}/v1/projects/${project}/locations/${location}/endpoints/openapi`;
}

async function getVertexToken(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = (tokenResp as any)?.token || tokenResp;
  if (!token) throw new Error("Failed to acquire Vertex access token.");

  cachedToken = token as string;
  cachedExpiryMs = (client.credentials as any)?.expiry_date || (Date.now() + 55 * 60 * 1000);
  return cachedToken!;
}

export interface UpstreamTarget {
  baseUrl: string;
  headers: Record<string, string>;
}

export async function getUpstream(settings: GeminiProxySettings): Promise<UpstreamTarget> {
  if (settings.upstream === "developer") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY for developer upstream.");

    return {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      headers: { "Authorization": `Bearer ${apiKey}` },
    };
  }

  if (settings.upstream === "vertex") {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    if (!project) throw new Error("Missing GOOGLE_CLOUD_PROJECT for vertex upstream.");

    const now = Date.now();
    if (!cachedToken || now > cachedExpiryMs - 60_000) {
      await getVertexToken();
    }

    return {
      baseUrl: vertexBaseUrl(project, location),
      headers: { "Authorization": `Bearer ${cachedToken}` },
    };
  }

  throw new Error(`Unknown upstream: ${settings.upstream}`);
}

export function clampRequestBody(body: any, settings: GeminiProxySettings): any {
  const out = structuredClone(body || {});
  const modelRaw = String(out.model || "");

  const modelId = modelRaw.includes("/") ? modelRaw.split("/").slice(-1)[0] : modelRaw;
  if (!settings.allowedModels.includes(modelId) && !settings.allowedModels.includes(modelRaw)) {
    const err: any = new Error(`Model not allowed: ${modelRaw}. Allowed: ${settings.allowedModels.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  if (typeof out.max_tokens === "number") {
    out.max_tokens = Math.min(out.max_tokens, settings.maxOutputTokens);
  } else {
    out.max_tokens = settings.maxOutputTokens;
  }

  if (settings.upstream === "vertex") {
    if (!String(out.model || "").startsWith("google/")) out.model = `google/${modelId}`;
  }

  if (settings.upstream === "developer") {
    if (String(out.model || "").startsWith("google/")) out.model = modelId;
  }

  return out;
}
