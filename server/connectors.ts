import { google } from "googleapis";
import { ReplitConnectors } from "@replit/connectors-sdk";

function getReplitToken(): string {
  const token = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!token) throw new Error("X-Replit-Token not found");
  return token;
}

async function getConnectorAccessToken(connectorName: string): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitToken();
  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );
  const data = await res.json();
  const settings = data.items?.[0];
  const accessToken =
    settings?.settings?.access_token ||
    settings?.settings?.oauth?.credentials?.access_token;
  if (!settings || !accessToken) throw new Error(`${connectorName} not connected`);
  return accessToken;
}

async function getConnectorSettings(connectorName: string): Promise<any> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitToken();
  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );
  const data = await res.json();
  return data.items?.[0];
}

// YouTube - uses googleapis
export async function getYouTubeClient() {
  const accessToken = await getConnectorAccessToken("youtube");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

// Google Sheets - uses googleapis
export async function getGoogleSheetsClient() {
  const accessToken = await getConnectorAccessToken("google-sheet");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

// Google Docs - uses googleapis
export async function getGoogleDocsClient() {
  const accessToken = await getConnectorAccessToken("google-docs");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: "v1", auth: oauth2Client });
}

// Google Drive - uses ReplitConnectors proxy
export function getGoogleDriveProxy() {
  return new ReplitConnectors();
}

// OneDrive - uses @microsoft/microsoft-graph-client access token
export async function getOneDriveAccessToken(): Promise<string> {
  return getConnectorAccessToken("onedrive");
}

// SharePoint - uses same Microsoft Graph pattern
export async function getSharePointAccessToken(): Promise<string> {
  return getConnectorAccessToken("sharepoint");
}

// Dropbox - returns access token for dropbox SDK
export async function getDropboxAccessToken(): Promise<string> {
  return getConnectorAccessToken("dropbox");
}

// Discord - returns access token
export async function getDiscordAccessToken(): Promise<string> {
  return getConnectorAccessToken("discord");
}

// Spotify - returns full credentials for SpotifyApi
export async function getSpotifyCredentials(): Promise<{
  accessToken: string;
  clientId: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const settings = await getConnectorSettings("spotify");
  const refreshToken = settings?.settings?.oauth?.credentials?.refresh_token;
  const accessToken =
    settings?.settings?.access_token ||
    settings?.settings?.oauth?.credentials?.access_token;
  const clientId = settings?.settings?.oauth?.credentials?.client_id;
  const expiresIn = settings?.settings?.oauth?.credentials?.expires_in;
  if (!accessToken || !clientId || !refreshToken)
    throw new Error("Spotify not connected");
  return { accessToken, clientId, refreshToken, expiresIn: expiresIn || 3600 };
}

// Notion - uses ReplitConnectors proxy
export function getNotionProxy() {
  return new ReplitConnectors();
}

// ElevenLabs - uses ReplitConnectors proxy
export function getElevenLabsProxy() {
  return new ReplitConnectors();
}

// SendGrid - returns API key and from email
export async function getSendGridCredentials(): Promise<{
  apiKey: string;
  fromEmail: string;
}> {
  const settings = await getConnectorSettings("sendgrid");
  if (
    !settings ||
    !settings.settings.api_key ||
    !settings.settings.from_email
  )
    throw new Error("SendGrid not connected");
  return {
    apiKey: settings.settings.api_key,
    fromEmail: settings.settings.from_email,
  };
}

export async function checkConnectorStatus(
  connectorName: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) return { connected: false, error: "No connector hostname" };
    const xReplitToken = getReplitToken();
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=false&connector_names=${connectorName}`,
      {
        headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      }
    );
    const data = await res.json();
    const item = data.items?.[0];
    return { connected: !!item };
  } catch (e: any) {
    return { connected: false, error: e.message };
  }
}

export const ALL_CONNECTORS = [
  { name: "youtube", label: "YouTube", category: "media" },
  { name: "google-sheet", label: "Google Sheets", category: "productivity", apiPrefix: "google-sheets" },
  { name: "google-docs", label: "Google Docs", category: "productivity" },
  { name: "google-drive", label: "Google Drive", category: "storage" },
  { name: "dropbox", label: "Dropbox", category: "storage" },
  { name: "onedrive", label: "OneDrive", category: "storage" },
  { name: "sharepoint", label: "SharePoint", category: "storage" },
  { name: "discord", label: "Discord", category: "messaging" },
  { name: "spotify", label: "Spotify", category: "media" },
  { name: "notion", label: "Notion", category: "productivity" },
  { name: "elevenlabs", label: "ElevenLabs", category: "ai" },
  { name: "sendgrid", label: "SendGrid", category: "email" },
  { name: "google-mail", label: "Gmail", category: "email" },
  { name: "google-calendar", label: "Google Calendar", category: "productivity" },
  { name: "github", label: "GitHub", category: "development" },
];
