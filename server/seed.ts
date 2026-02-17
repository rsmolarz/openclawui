import { db } from "./db";
import { eq } from "drizzle-orm";
import { settings, machines, apiKeys, vpsConnections, dockerServices, openclawConfig, integrations } from "@shared/schema";
import { randomUUID } from "crypto";

const defaultNodeDetails: Record<string, { hostname: string; ip: string; os: string; location: string }> = {
  "node-alpha-7": { hostname: "arcade-pc-front-01", ip: "192.168.1.42", os: "Ubuntu 22.04", location: "Main Floor, Zone A" },
  "node-beta-12": { hostname: "arcade-pc-back-03", ip: "192.168.1.78", os: "Debian 12", location: "Second Floor, Zone C" },
};

async function migrateNodeData() {
  const configs = await db.select().from(openclawConfig);
  for (const cfg of configs) {
    if (Array.isArray(cfg.pendingNodes)) {
      const nodes = cfg.pendingNodes as any[];
      const hasStringNodes = nodes.some((n) => typeof n === "string");
      if (hasStringNodes) {
        const enriched = nodes.map((n: any) => {
          if (typeof n === "string") {
            const details = defaultNodeDetails[n];
            return details ? { id: n, ...details } : { id: n, hostname: n, ip: "Pending discovery", os: "Pending discovery", location: "Pending discovery" };
          }
          return n;
        });
        await db.update(openclawConfig).set({ pendingNodes: enriched, updatedAt: new Date() }).where(eq(openclawConfig.id, cfg.id));
      }
    }
    if (cfg.whatsappEnabled) {
      await db.update(dockerServices).set({ status: "running", lastChecked: new Date() }).where(eq(dockerServices.serviceName, "whatsapp-bridge"));
    }
  }
}

async function seedIntegrations() {
  const existingIntegrations = await db.select().from(integrations);
  if (existingIntegrations.length > 0) return;

  await db.insert(integrations).values([
    {
      name: "WhatsApp",
      type: "whatsapp",
      category: "messaging",
      enabled: false,
      status: "not_configured",
      description: "Connect WhatsApp Business API to send and receive messages through OpenClaw agents.",
      icon: "MessageCircle",
      config: { phone: "", apiKey: "", webhookUrl: "" },
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
      enabled: true,
      status: "connected",
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
      config: { apiKey: "", defaultModel: "deepseek-chat", fallbackModel: "auto" },
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

export async function seed() {
  await migrateNodeData();
  await seedIntegrations();

  const existingSettings = await db.select().from(settings);
  if (existingSettings.length > 0) return;

  await db.insert(settings).values([
    { category: "general", key: "general.platform_name", value: "OpenClaw Arcade", label: "Platform Name", description: "Name of your arcade platform", type: "text" },
    { category: "general", key: "general.default_currency", value: "USD", label: "Default Currency", description: "Default currency for pricing", type: "select" },
    { category: "general", key: "general.timezone", value: "America/New_York", label: "Timezone", description: "Default timezone", type: "select" },
    { category: "general", key: "general.language", value: "en", label: "Language", description: "Default language", type: "select" },
    { category: "general", key: "general.support_email", value: "support@openclaw.com", label: "Support Email", description: "Customer support email", type: "text" },
    { category: "general", key: "general.maintenance_mode", value: "false", label: "Maintenance Mode", description: "Enable maintenance mode", type: "toggle" },
  ]);

  await db.insert(settings).values([
    { category: "notifications", key: "notifications.email_enabled", value: "true", label: "Email Notifications", description: "Receive email alerts", type: "toggle" },
    { category: "notifications", key: "notifications.push_enabled", value: "false", label: "Push Notifications", description: "Receive push alerts", type: "toggle" },
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

  // No seed machines - users add their own nodes/computers via the dashboard

  await db.insert(apiKeys).values([
    { name: "Production API", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "admin", active: true },
    { name: "Mobile App", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: true },
    { name: "Analytics Service", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: false },
  ]);

  await db.insert(vpsConnections).values([
    { vpsIp: "187.77.192.215", vpsPort: 22, sshUser: "root", isConnected: false },
  ]);

  await db.insert(dockerServices).values([
    { serviceName: "openclaw-gateway", status: "running", port: 18789, image: "openclaw/gateway:latest", cpuUsage: 12.5, memoryUsage: 256 },
    { serviceName: "openclaw-api", status: "running", port: 3000, image: "openclaw/api:latest", cpuUsage: 8.2, memoryUsage: 192 },
    { serviceName: "redis", status: "running", port: 6379, image: "redis:7-alpine", cpuUsage: 2.1, memoryUsage: 64 },
    { serviceName: "postgres", status: "running", port: 5432, image: "postgres:16", cpuUsage: 5.4, memoryUsage: 384 },
    { serviceName: "whatsapp-bridge", status: "stopped", port: 8080, image: "openclaw/whatsapp:latest", cpuUsage: 0, memoryUsage: 0 },
  ]);

  await db.insert(openclawConfig).values([
    {
      gatewayPort: 18789,
      gatewayBind: "127.0.0.1",
      gatewayMode: "local",
      gatewayStatus: "online",
      defaultLlm: "deepseek/deepseek-chat",
      fallbackLlm: "openrouter/auto",
      whatsappEnabled: false,
      tailscaleEnabled: true,
      tailscaleIp: "100.64.0.1",
      tailscaleStatus: "connected",
      nodesApproved: 3,
      pendingNodes: [
        { id: "node-alpha-7", hostname: "arcade-pc-front-01", ip: "192.168.1.42", os: "Ubuntu 22.04", location: "Main Floor, Zone A" },
        { id: "node-beta-12", hostname: "arcade-pc-back-03", ip: "192.168.1.78", os: "Debian 12", location: "Second Floor, Zone C" },
      ],
    },
  ]);

  console.log("Database seeded successfully");
}
