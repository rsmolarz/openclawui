import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  type: text("type").notNull().default("text"),
});

export const machines = pgTable("machines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("active"),
  clawStrength: integer("claw_strength").notNull().default(50),
  playTime: integer("play_time").notNull().default(30),
  pricePerPlay: integer("price_per_play").notNull().default(100),
  lastMaintenance: timestamp("last_maintenance"),
});

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  key: text("key").notNull(),
  permissions: text("permissions").notNull().default("read"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsed: timestamp("last_used"),
});

export const vpsConnections = pgTable("vps_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vpsIp: text("vps_ip").notNull().default("187.77.192.215"),
  vpsPort: integer("vps_port").notNull().default(22),
  sshUser: text("ssh_user").notNull().default("root"),
  sshKeyPath: text("ssh_key_path"),
  isConnected: boolean("is_connected").notNull().default(false),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dockerServices = pgTable("docker_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull().default("stopped"),
  port: integer("port"),
  image: text("image"),
  containerId: text("container_id"),
  cpuUsage: real("cpu_usage"),
  memoryUsage: real("memory_usage"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const openclawConfig = pgTable("openclaw_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gatewayPort: integer("gateway_port").notNull().default(18789),
  gatewayBind: text("gateway_bind").notNull().default("127.0.0.1"),
  gatewayMode: text("gateway_mode").notNull().default("local"),
  gatewayToken: text("gateway_token"),
  gatewayStatus: text("gateway_status").notNull().default("offline"),
  defaultLlm: text("default_llm").notNull().default("openrouter/deepseek-chat"),
  fallbackLlm: text("fallback_llm").notNull().default("openrouter/auto"),
  llmApiKey: text("llm_api_key"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  whatsappPhone: text("whatsapp_phone"),
  whatsappApiKey: text("whatsapp_api_key"),
  tailscaleEnabled: boolean("tailscale_enabled").notNull().default(false),
  tailscaleIp: text("tailscale_ip"),
  tailscaleStatus: text("tailscale_status"),
  nodesApproved: integer("nodes_approved").notNull().default(0),
  pendingNodes: jsonb("pending_nodes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, lastMaintenance: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, key: true, createdAt: true, lastUsed: true });
export const insertVpsConnectionSchema = createInsertSchema(vpsConnections).omit({ id: true, isConnected: true, lastChecked: true, createdAt: true, updatedAt: true });
export const insertDockerServiceSchema = createInsertSchema(dockerServices).omit({ id: true, lastChecked: true, createdAt: true });
export const insertOpenclawConfigSchema = createInsertSchema(openclawConfig).omit({ id: true, gatewayStatus: true, createdAt: true, updatedAt: true });

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type VpsConnection = typeof vpsConnections.$inferSelect;
export type InsertVpsConnection = z.infer<typeof insertVpsConnectionSchema>;
export type DockerService = typeof dockerServices.$inferSelect;
export type InsertDockerService = z.infer<typeof insertDockerServiceSchema>;
export type OpenclawConfig = typeof openclawConfig.$inferSelect;
export type InsertOpenclawConfig = z.infer<typeof insertOpenclawConfigSchema>;
