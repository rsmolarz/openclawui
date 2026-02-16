import { db } from "./db";
import { settings, machines, apiKeys } from "@shared/schema";
import { randomUUID } from "crypto";

export async function seed() {
  const existingSettings = await db.select().from(settings);
  if (existingSettings.length > 0) return;

  // General settings
  await db.insert(settings).values([
    { category: "general", key: "general.platform_name", value: "OpenClaw Arcade", label: "Platform Name", description: "Name of your arcade platform", type: "text" },
    { category: "general", key: "general.default_currency", value: "USD", label: "Default Currency", description: "Default currency for pricing", type: "select" },
    { category: "general", key: "general.timezone", value: "America/New_York", label: "Timezone", description: "Default timezone", type: "select" },
    { category: "general", key: "general.language", value: "en", label: "Language", description: "Default language", type: "select" },
    { category: "general", key: "general.support_email", value: "support@openclaw.com", label: "Support Email", description: "Customer support email", type: "text" },
    { category: "general", key: "general.maintenance_mode", value: "false", label: "Maintenance Mode", description: "Enable maintenance mode", type: "toggle" },
  ]);

  // Notification settings
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

  // Appearance settings
  await db.insert(settings).values([
    { category: "appearance", key: "appearance.theme", value: "light", label: "Theme", description: "Color theme preference", type: "select" },
    { category: "appearance", key: "appearance.font_size", value: "medium", label: "Font Size", description: "UI font size", type: "select" },
    { category: "appearance", key: "appearance.density", value: "comfortable", label: "Density", description: "UI density", type: "select" },
    { category: "appearance", key: "appearance.accent_color", value: "blue", label: "Accent Color", description: "Accent color theme", type: "select" },
  ]);

  // Seed machines
  await db.insert(machines).values([
    { name: "Claw Master Pro", location: "Main Floor, Zone A", status: "active", clawStrength: 65, playTime: 30, pricePerPlay: 100 },
    { name: "Mega Grabber", location: "Main Floor, Zone B", status: "active", clawStrength: 50, playTime: 25, pricePerPlay: 150 },
    { name: "Lucky Catcher", location: "Second Floor, Zone C", status: "maintenance", clawStrength: 40, playTime: 35, pricePerPlay: 75 },
    { name: "Prize Crane XL", location: "Entrance Lobby", status: "active", clawStrength: 70, playTime: 45, pricePerPlay: 200 },
    { name: "Mini Grabber", location: "Kids Corner", status: "offline", clawStrength: 30, playTime: 20, pricePerPlay: 50 },
  ]);

  // Seed API keys
  await db.insert(apiKeys).values([
    { name: "Production API", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "admin", active: true },
    { name: "Mobile App", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: true },
    { name: "Analytics Service", key: `oc_${randomUUID().replace(/-/g, "")}`, permissions: "read", active: false },
  ]);

  console.log("Database seeded successfully");
}
