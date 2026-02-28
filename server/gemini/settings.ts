import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(".data");
const SETTINGS_PATH = path.join(DATA_DIR, "gemini-proxy-settings.json");

export interface GeminiProxySettings {
  upstream: "developer" | "vertex";
  allowedModels: string[];
  maxOutputTokens: number;
  rpmLimit: number;
  timeoutMs: number;
}

const DEFAULTS: GeminiProxySettings = {
  upstream: (process.env.PROXY_UPSTREAM as "developer" | "vertex") || "developer",
  allowedModels: (process.env.ALLOWED_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",").map(s => s.trim()).filter(Boolean),
  maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS || 4096),
  rpmLimit: Number(process.env.RPM_LIMIT || 30),
  timeoutMs: Number(process.env.TIMEOUT_MS || 90000),
};

export function loadSettings(): GeminiProxySettings {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: Partial<GeminiProxySettings>): GeminiProxySettings {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const current = loadSettings();
  const merged = { ...current, ...next };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}
