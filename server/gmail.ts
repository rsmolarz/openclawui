import { google } from 'googleapis';

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );
  const data = await res.json();
  const item = data.items?.[0];

  const accessToken =
    item?.settings?.access_token ||
    item?.settings?.oauth?.credentials?.access_token;

  if (!item || !accessToken) {
    throw new Error('Gmail not connected');
  }

  const scope =
    item?.settings?.scope ||
    item?.settings?.oauth?.credentials?.scope ||
    '';

  return { accessToken, scope };
}

export async function getUncachableGmailClient() {
  const { accessToken } = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)[:\s="']+([a-zA-Z0-9_\-\.]{20,})/gi,
  /(?:secret|token|password|credential)[:\s="']+([a-zA-Z0-9_\-\.]{16,})/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-proj-[a-zA-Z0-9_\-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_\-]{20,}/g,
  /gsk_[a-zA-Z0-9]{20,}/g,
  /xoxb-[0-9\-]+/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /glpat-[a-zA-Z0-9\-_]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
  /AKIA[0-9A-Z]{16}/g,
  /[a-f0-9]{32,}/g,
  /omi_dev_[a-zA-Z0-9]+/g,
  /whsec_[a-zA-Z0-9]+/g,
  /re_[a-zA-Z0-9_]{20,}/g,
  /SG\.[a-zA-Z0-9_\-]{22,}/g,
  /AIza[a-zA-Z0-9_\-]{35}/g,
];

function classifySecret(value: string, context: string): string {
  const lower = context.toLowerCase();
  if (value.startsWith("sk-proj-") || value.startsWith("sk-") && !value.startsWith("sk-ant-")) return "OpenAI";
  if (value.startsWith("sk-ant-")) return "Anthropic";
  if (value.startsWith("gsk_")) return "Groq";
  if (value.startsWith("ghp_") || value.startsWith("github_pat_")) return "GitHub";
  if (value.startsWith("glpat-")) return "GitLab";
  if (value.startsWith("AKIA")) return "AWS";
  if (value.startsWith("omi_dev_")) return "Omi";
  if (value.startsWith("whsec_")) return "Stripe Webhook";
  if (value.startsWith("re_")) return "Resend";
  if (value.startsWith("SG.")) return "SendGrid";
  if (value.startsWith("AIza")) return "Google API";
  if (value.startsWith("xoxb-")) return "Slack";
  if (lower.includes("openai")) return "OpenAI";
  if (lower.includes("anthropic") || lower.includes("claude")) return "Anthropic";
  if (lower.includes("stripe")) return "Stripe";
  if (lower.includes("twilio")) return "Twilio";
  if (lower.includes("sendgrid")) return "SendGrid";
  if (lower.includes("github")) return "GitHub";
  if (lower.includes("gemini") || lower.includes("google")) return "Google";
  if (lower.includes("openrouter")) return "OpenRouter";
  if (lower.includes("notion")) return "Notion";
  if (lower.includes("linear")) return "Linear";
  if (lower.includes("telegram")) return "Telegram";
  if (lower.includes("hostinger")) return "Hostinger";
  if (lower.includes("cloudflare")) return "Cloudflare";
  if (lower.includes("vercel")) return "Vercel";
  if (lower.includes("supabase")) return "Supabase";
  if (lower.includes("firebase")) return "Firebase";
  if (lower.includes("aws") || lower.includes("amazon")) return "AWS";
  if (lower.includes("heroku")) return "Heroku";
  if (lower.includes("railway")) return "Railway";
  if (lower.includes("render")) return "Render";
  if (lower.includes("replit")) return "Replit";
  return "Unknown";
}

export interface FoundSecret {
  service: string;
  maskedValue: string;
  fullValue: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
  emailSnippet: string;
  messageId: string;
}

function extractTextFromParts(parts: any[]): string {
  let text = "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += Buffer.from(part.body.data, "base64url").toString("utf-8");
    } else if (part.parts) {
      text += extractTextFromParts(part.parts);
    }
  }
  return text;
}

export async function scanEmailsForSecrets(maxResults = 50): Promise<FoundSecret[]> {
  const { accessToken, scope } = await getAccessToken();

  const hasReadScope = scope.includes('gmail.readonly') || scope.includes('gmail.modify') || scope.includes('mail.google.com');
  if (!hasReadScope) {
    throw new Error(
      'INSUFFICIENT_SCOPE: The Gmail connector does not have read access. ' +
      'Current scopes are limited to addon-level access. ' +
      'Gmail scan requires the gmail.readonly scope which is not available through the current connector configuration.'
    );
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const searchQueries = [
    "subject:(API key OR api_key OR API token)",
    "subject:(welcome OR getting started OR signup) (api key OR token OR secret)",
    "subject:(your credentials OR your key OR your token OR your secret)",
    "subject:(password reset OR new password)",
    "from:(noreply OR no-reply) (api key OR token OR secret key)",
  ];

  const allMessageIds = new Set<string>();
  const foundSecrets: FoundSecret[] = [];

  for (const query of searchQueries) {
    try {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.ceil(maxResults / searchQueries.length),
      });

      if (listRes.data.messages) {
        for (const msg of listRes.data.messages) {
          if (msg.id) allMessageIds.add(msg.id);
        }
      }
    } catch (err: any) {
      if (err.message?.includes("Insufficient Permission") || err.code === 403) {
        throw new Error(
          'INSUFFICIENT_SCOPE: Gmail API returned "Insufficient Permission". ' +
          'The connector lacks gmail.readonly scope needed to search and read emails.'
        );
      }
      console.error(`[Gmail] Search query failed: ${query}`, err.message);
    }
  }

  const messageIds = Array.from(allMessageIds).slice(0, maxResults);

  for (const msgId of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });

      const headers = msgRes.data.payload?.headers || [];
      const subject = headers.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
      const from = headers.find((h: any) => h.name?.toLowerCase() === "from")?.value || "";
      const date = headers.find((h: any) => h.name?.toLowerCase() === "date")?.value || "";
      const snippet = msgRes.data.snippet || "";

      let body = "";
      if (msgRes.data.payload?.body?.data) {
        body = Buffer.from(msgRes.data.payload.body.data, "base64url").toString("utf-8");
      } else if (msgRes.data.payload?.parts) {
        body = extractTextFromParts(msgRes.data.payload.parts);
      }

      const context = `${subject} ${from} ${snippet}`;
      const fullText = `${subject}\n${body}`;

      for (const pattern of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
          const value = match[1] || match[0];
          if (value.length < 16 || value.length > 200) continue;
          if (/^[0-9a-f]+$/i.test(value) && value.length < 32) continue;

          const service = classifySecret(value, context);
          const masked = value.substring(0, 6) + "•".repeat(Math.min(16, value.length - 6));

          const duplicate = foundSecrets.find(s => s.fullValue === value);
          if (!duplicate) {
            foundSecrets.push({
              service,
              maskedValue: masked,
              fullValue: value,
              emailSubject: subject,
              emailFrom: from,
              emailDate: date,
              emailSnippet: snippet.substring(0, 200),
              messageId: msgId,
            });
          }
        }
      }
    } catch (err: any) {
      console.error(`[Gmail] Failed to read message ${msgId}:`, err.message);
    }
  }

  return foundSecrets;
}

export function isGmailConfigured(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}
