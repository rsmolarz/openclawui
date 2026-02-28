import fs from "fs";
import path from "path";

export function ensureVertexCredentialsFile(): string | null {
  const json = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  const dir = path.resolve(".secrets");
  const file = path.join(dir, "gcp-service-account.json");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(file)) fs.writeFileSync(file, json, { mode: 0o600 });

  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  return file;
}
