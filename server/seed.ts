import { db } from "./db";
import { eq, isNull } from "drizzle-orm";
import { settings, machines, apiKeys, vpsConnections, dockerServices, openclawConfig, integrations, openclawInstances } from "@shared/schema";
import { randomUUID } from "crypto";

async function seedIntegrations() {
  const existingIntegrations = await db.select().from(integrations);
  if (existingIntegrations.length > 0) return;

  await db.insert(integrations).values([
    {
      name: "WhatsApp",
      type: "whatsapp",
      category: "messaging",
      enabled: true,
      status: "connected",
      description: "Connect WhatsApp Business API to send and receive messages through OpenClaw agents.",
      icon: "MessageCircle",
      config: { phone: "+13405140344", apiKey: "", webhookUrl: "" },
    },
    {
      name: "Telegram",
      type: "telegram",
      category: "messaging",
      enabled: false,
      status: "not_configured",
      description: "Integrate Telegram Bot API for agent messaging and notifications.",
      icon: "Send",
      config: { botToken: "", chatId: "", webhookUrl: "" },
    },
    {
      name: "Discord",
      type: "discord",
      category: "messaging",
      enabled: false,
      status: "not_configured",
      description: "Connect Discord bots to interact with users through channels and DMs.",
      icon: "Hash",
      config: { botToken: "", guildId: "", channelId: "" },
    },
    {
      name: "Slack",
      type: "slack",
      category: "messaging",
      enabled: false,
      status: "not_configured",
      description: "Integrate Slack workspace for team notifications and agent interactions.",
      icon: "MessagesSquare",
      config: { botToken: "", signingSecret: "", channelId: "" },
    },
    {
      name: "Tailscale",
      type: "tailscale",
      category: "networking",
      enabled: false,
      status: "not_configured",
      description: "Secure mesh VPN for connecting nodes across networks with zero-config networking.",
      icon: "Network",
      config: { authKey: "", tailnetName: "", hostname: "" },
    },
    {
      name: "Webhook",
      type: "webhook",
      category: "automation",
      enabled: false,
      status: "not_configured",
      description: "Send event notifications to external services via HTTP webhooks.",
      icon: "Webhook",
      config: { url: "", secret: "", events: [] },
    },
    {
      name: "MQTT",
      type: "mqtt",
      category: "iot",
      enabled: false,
      status: "not_configured",
      description: "Lightweight messaging protocol for IoT device communication with nodes.",
      icon: "Radio",
      config: { brokerUrl: "", username: "", password: "", topic: "" },
    },
    {
      name: "Email / SMTP",
      type: "email",
      category: "notifications",
      enabled: false,
      status: "not_configured",
      description: "Send email notifications and alerts through SMTP or transactional email providers.",
      icon: "Mail",
      config: { smtpHost: "", smtpPort: 587, username: "", password: "", fromAddress: "" },
    },
    {
      name: "OpenRouter",
      type: "openrouter",
      category: "ai",
      enabled: true,
      status: "connected",
      description: "Unified API gateway for accessing 200+ LLM models from all major providers.",
      icon: "Brain",
      config: { apiKey: "", defaultModel: "deepseek/deepseek-chat", fallbackModel: "openrouter/auto" },
    },
    {
      name: "n8n",
      type: "n8n",
      category: "automation",
      enabled: false,
      status: "not_configured",
      description: "Workflow automation platform for creating complex agent pipelines and triggers.",
      icon: "Workflow",
      config: { instanceUrl: "", apiKey: "", webhookPath: "" },
    },
  ]);
}

const CORRECT_VPS_IP = "72.60.167.64";
const CORRECT_SERVER_URL = `http://${CORRECT_VPS_IP}:18789`;
const CORRECT_WS_URL = `wss://${CORRECT_VPS_IP}:18789`;

const DOCKER_INSTANCE_NAME = "Hostinger Docker (OpenClaw)";
const DOCKER_SERVER_URL = `http://${CORRECT_VPS_IP}:45002`;

async function ensureDefaultInstance(): Promise<string> {
  const existing = await db.select().from(openclawInstances).where(eq(openclawInstances.isDefault, true));
  if (existing.length > 0) {
    const inst = existing[0];
    if (inst.serverUrl !== CORRECT_SERVER_URL) {
      await db.update(openclawInstances)
        .set({ serverUrl: CORRECT_SERVER_URL })
        .where(eq(openclawInstances.id, inst.id));
      console.log(`[Seed] Corrected instance serverUrl from ${inst.serverUrl} to ${CORRECT_SERVER_URL}`);
    }
    return inst.id;
  }
  const [instance] = await db.insert(openclawInstances).values({
    name: "Default Instance",
    description: "Primary OpenClaw server instance",
    serverUrl: CORRECT_SERVER_URL,
    status: "online",
    isDefault: true,
  }).returning();
  console.log("Created default OpenClaw instance:", instance.id);
  return instance.id;
}

async function ensureDockerInstance(): Promise<string | null> {
  const existing = await db.select().from(openclawInstances).where(eq(openclawInstances.name, DOCKER_INSTANCE_NAME));
  if (existing.length > 0) {
    const inst = existing[0];
    if (inst.serverUrl !== DOCKER_SERVER_URL) {
      await db.update(openclawInstances)
        .set({ serverUrl: DOCKER_SERVER_URL })
        .where(eq(openclawInstances.id, inst.id));
      console.log(`[Seed] Corrected Docker instance serverUrl to ${DOCKER_SERVER_URL}`);
    }
    return inst.id;
  }
  const [instance] = await db.insert(openclawInstances).values({
    name: DOCKER_INSTANCE_NAME,
    description: "Hostinger-managed OpenClaw Docker container on port 45002",
    serverUrl: DOCKER_SERVER_URL,
    status: "online",
    isDefault: false,
  }).returning();
  console.log("[Seed] Created Docker OpenClaw instance:", instance.id);

  await db.insert(vpsConnections).values({
    instanceId: instance.id,
    vpsIp: CORRECT_VPS_IP,
    vpsPort: 22,
    sshUser: "root",
    isConnected: true,
  });

  await db.insert(openclawConfig).values({
    instanceId: instance.id,
    gatewayPort: 45002,
    gatewayBind: "lan",
    gatewayMode: "docker",
    gatewayStatus: "online",
    websocketUrl: `ws://${CORRECT_VPS_IP}:45002`,
    dockerProject: "openclaw-nnfs",
  });

  await db.insert(dockerServices).values({
    instanceId: instance.id,
    serviceName: "openclaw-nnfs-openclaw-1",
    status: "running",
    port: 45002,
    image: "ghcr.io/hostinger/hvps-openclaw:latest",
  });

  console.log("[Seed] Seeded VPS, config, and docker data for Docker instance");
  return instance.id;
}

async function backfillInstanceIds(defaultInstanceId: string) {
  await db.update(openclawConfig).set({ instanceId: defaultInstanceId }).where(isNull(openclawConfig.instanceId));
  await db.update(vpsConnections).set({ instanceId: defaultInstanceId }).where(isNull(vpsConnections.instanceId));
  await db.update(dockerServices).set({ instanceId: defaultInstanceId }).where(isNull(dockerServices.instanceId));
  console.log("Backfilled instanceId on existing config/VPS/docker rows");
}

async function correctVpsData(defaultInstanceId: string) {
  const vpsRows = await db.select().from(vpsConnections).where(eq(vpsConnections.instanceId, defaultInstanceId));
  if (vpsRows.length > 0 && vpsRows[0].vpsIp !== CORRECT_VPS_IP) {
    await db.update(vpsConnections)
      .set({ vpsIp: CORRECT_VPS_IP })
      .where(eq(vpsConnections.id, vpsRows[0].id));
    console.log(`[Seed] Corrected VPS IP from ${vpsRows[0].vpsIp} to ${CORRECT_VPS_IP}`);
  }

  const configRows = await db.select().from(openclawConfig).where(eq(openclawConfig.instanceId, defaultInstanceId));
  if (configRows.length > 0) {
    const cfg = configRows[0];
    const updates: Record<string, any> = {};
    if (cfg.websocketUrl !== CORRECT_WS_URL) updates.websocketUrl = CORRECT_WS_URL;
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (token && cfg.gatewayToken !== token) updates.gatewayToken = token;
    if (Object.keys(updates).length > 0) {
      await db.update(openclawConfig).set(updates).where(eq(openclawConfig.id, cfg.id));
      console.log(`[Seed] Corrected openclaw config:`, Object.keys(updates).join(", "));
    }
  }
}

export async function seed() {
  const defaultInstanceId = await ensureDefaultInstance();
  await ensureDockerInstance();
  await backfillInstanceIds(defaultInstanceId);
  await correctVpsData(defaultInstanceId);
  await seedIntegrations();

  const existingSettings = await db.select().from(settings);
  if (existingSettings.length > 0) return;

  await db.insert(settings).values([
    { category: "general", key: "general.platform_name", value: "OpenClaw UI", label: "Platform Name", description: "Name of your arcade platform", type: "text" },
    { category: "general", key: "general.default_currency", value: "USD", label: "Default Currency", description: "Default currency for pricing", type: "select" },
    { category: "general", key: "general.timezone", value: "America/New_York", label: "Timezone", description: "Default timezone", type: "select" },
    { category: "general", key: "general.language", value: "en", label: "Language", description: "Default language", type: "select" },
    { category: "general", key: "general.support_email", value: "rsmolarz@rsmolarz.com", label: "Support Email", description: "Customer support email", type: "text" },
    { category: "general", key: "general.maintenance_mode", value: "false", label: "Maintenance Mode", description: "Enable maintenance mode", type: "toggle" },
  ]);

  await db.insert(settings).values([
    { category: "notifications", key: "notifications.email_enabled", value: "true", label: "Email Notifications", description: "Receive email alerts", type: "toggle" },
    { category: "notifications", key: "notifications.push_enabled", value: "true", label: "Push Notifications", description: "Receive push alerts", type: "toggle" },
    { category: "notifications", key: "notifications.inapp_enabled", value: "true", label: "In-App Notifications", description: "See in-app alerts", type: "toggle" },
    { category: "notifications", key: "notifications.machine_offline", value: "true", label: "Machine Offline", description: "Alert when machine goes offline", type: "toggle" },
    { category: "notifications", key: "notifications.low_stock", value: "true", label: "Low Prize Stock", description: "Alert when prizes run low", type: "toggle" },
    { category: "notifications", key: "notifications.revenue_milestone", value: "false", label: "Revenue Milestones", description: "Revenue achievement alerts", type: "toggle" },
    { category: "notifications", key: "notifications.maintenance_due", value: "true", label: "Maintenance Due", description: "Maintenance reminder alerts", type: "toggle" },
    { category: "notifications", key: "notifications.digest_frequency", value: "daily", label: "Digest Frequency", description: "Summary notification frequency", type: "select" },
  ]);

  await db.insert(settings).values([
    { category: "appearance", key: "appearance.theme", value: "light", label: "Theme", description: "Color theme preference", type: "select" },
    { category: "appearance", key: "appearance.font_size", value: "medium", label: "Font Size", description: "UI font size", type: "select" },
    { category: "appearance", key: "appearance.density", value: "comfortable", label: "Density", description: "UI density", type: "select" },
    { category: "appearance", key: "appearance.accent_color", value: "blue", label: "Accent Color", description: "Accent color theme", type: "select" },
  ]);

  await db.insert(apiKeys).values([
    { name: "Production API", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "admin", active: true },
    { name: "Mobile App", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: true },
    { name: "Analytics Service", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: false },
  ]);

  await db.insert(vpsConnections).values([
    { instanceId: defaultInstanceId, vpsIp: "72.60.167.64", vpsPort: 22, sshUser: "root", isConnected: true },
  ]);

  await db.insert(dockerServices).values([
    { instanceId: defaultInstanceId, serviceName: "openclaw-gateway", status: "running", port: 18789, image: "openclaw/gateway:latest", cpuUsage: 12.5, memoryUsage: 256 },
    { instanceId: defaultInstanceId, serviceName: "openclaw-api", status: "running", port: 3000, image: "openclaw/api:latest", cpuUsage: 8.2, memoryUsage: 192 },
    { instanceId: defaultInstanceId, serviceName: "redis", status: "running", port: 6379, image: "redis:7-alpine", cpuUsage: 2.1, memoryUsage: 64 },
    { instanceId: defaultInstanceId, serviceName: "postgres", status: "running", port: 5432, image: "postgres:16", cpuUsage: 5.4, memoryUsage: 384 },
    { instanceId: defaultInstanceId, serviceName: "whatsapp-bridge", status: "running", port: 8080, image: "openclaw/whatsapp:latest", cpuUsage: 3.0, memoryUsage: 128 },
  ]);

  await db.insert(openclawConfig).values([
    {
      instanceId: defaultInstanceId,
      gatewayPort: 18789,
      gatewayBind: "lan",
      gatewayMode: "local",
      gatewayStatus: "online",
      gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || null,
      websocketUrl: "ws://72.60.167.64:18789",
      defaultLlm: "deepseek/deepseek-chat",
      fallbackLlm: "openrouter/auto",
      whatsappEnabled: true,
      whatsappPhone: "+13405140344",
      tailscaleEnabled: false,
      tailscaleIp: "100.64.0.1",
      tailscaleStatus: "connected",
      nodesApproved: 5,
      pendingNodes: [],
      dockerProject: "claw",
    },
  ]);

  console.log("Database seeded successfully");
}
