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
  hostname: text("hostname"),
  ipAddress: text("ip_address"),
  os: text("os"),
  location: text("location"),
  status: text("status").notNull().default("pending"),
  pairingCode: text("pairing_code"),
  displayName: text("display_name"),
  remotePcAlias: text("remote_pc_alias"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const openclawInstances = pgTable("openclaw_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  serverUrl: text("server_url"),
  apiKey: text("api_key"),
  status: text("status").notNull().default("offline"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vpsConnections = pgTable("vps_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instanceId: varchar("instance_id"),
  vpsIp: text("vps_ip").notNull().default("187.77.194.205"),
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
  instanceId: varchar("instance_id"),
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
  instanceId: varchar("instance_id"),
  gatewayPort: integer("gateway_port").notNull().default(18789),
  gatewayBind: text("gateway_bind").notNull().default("127.0.0.1"),
  gatewayMode: text("gateway_mode").notNull().default("local"),
  gatewayToken: text("gateway_token"),
  gatewayPassword: text("gateway_password"),
  websocketUrl: text("websocket_url"),
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
  dockerProject: text("docker_project").notNull().default("claw"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const llmApiKeys = pgTable("llm_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, lastSeen: true, createdAt: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, key: true, createdAt: true, lastUsed: true });
export const insertInstanceSchema = createInsertSchema(openclawInstances).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVpsConnectionSchema = createInsertSchema(vpsConnections).omit({ id: true, isConnected: true, lastChecked: true, createdAt: true, updatedAt: true });
export const insertDockerServiceSchema = createInsertSchema(dockerServices).omit({ id: true, lastChecked: true, createdAt: true });
export const insertOpenclawConfigSchema = createInsertSchema(openclawConfig).omit({ id: true, gatewayStatus: true, createdAt: true, updatedAt: true });

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type OpenclawInstance = typeof openclawInstances.$inferSelect;
export type InsertInstance = z.infer<typeof insertInstanceSchema>;
export type VpsConnection = typeof vpsConnections.$inferSelect;
export type InsertVpsConnection = z.infer<typeof insertVpsConnectionSchema>;
export type DockerService = typeof dockerServices.$inferSelect;
export type InsertDockerService = z.infer<typeof insertDockerServiceSchema>;
export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  status: text("status").notNull().default("not_configured"),
  description: text("description"),
  icon: text("icon"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  medinvestId: text("medinvest_id").notNull().unique(),
  medinvestDid: text("medinvest_did").notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waAuthState = pgTable("wa_auth_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name"),
  status: text("status").notNull().default("pending"),
  pairingCode: text("pairing_code"),
  approvedAt: timestamp("approved_at"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const skills = pgTable("skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillId: text("skill_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  version: text("version").notNull().default("1.0.0"),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").notNull().default("active"),
  icon: text("icon"),
  config: jsonb("config"),
  installedAt: timestamp("installed_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSkillSchema = createInsertSchema(skills).omit({ id: true, installedAt: true, updatedAt: true });
export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;

export const docs = pgTable("docs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull().default("guide"),
  content: text("content").notNull().default(""),
  tags: text("tags").array(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vpsConnectionLogs = pgTable("vps_connection_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instanceId: varchar("instance_id"),
  status: text("status").notNull(),
  message: text("message"),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

export const nodeSetupSessions = pgTable("node_setup_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instanceId: varchar("instance_id"),
  os: text("os").notNull().default("linux"),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(5),
  status: text("status").notNull().default("in_progress"),
  machineId: varchar("machine_id"),
  completedSteps: jsonb("completed_steps").$type<number[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const onboardingChecklist = pgTable("onboarding_checklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  instanceId: varchar("instance_id"),
  steps: jsonb("steps").$type<Record<string, boolean>>().notNull().default({}),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  instanceId: varchar("instance_id"),
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolName: text("tool_name"),
  toolInput: text("tool_input"),
  toolOutput: text("tool_output"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({ id: true, createdAt: true });
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;

export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({ id: true, createdAt: true });
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;

export const insertDocSchema = createInsertSchema(docs).omit({ id: true, createdAt: true, updatedAt: true });
export type Doc = typeof docs.$inferSelect;
export type InsertDoc = z.infer<typeof insertDocSchema>;

export const insertVpsConnectionLogSchema = createInsertSchema(vpsConnectionLogs).omit({ id: true, checkedAt: true });
export type VpsConnectionLog = typeof vpsConnectionLogs.$inferSelect;
export type InsertVpsConnectionLog = z.infer<typeof insertVpsConnectionLogSchema>;

export const insertNodeSetupSessionSchema = createInsertSchema(nodeSetupSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type NodeSetupSession = typeof nodeSetupSessions.$inferSelect;
export type InsertNodeSetupSession = z.infer<typeof insertNodeSetupSessionSchema>;

export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklist).omit({ id: true, createdAt: true, updatedAt: true });
export type OnboardingChecklist = typeof onboardingChecklist.$inferSelect;
export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;

export const guardianLogs = pgTable("guardian_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  details: text("details"),
  status: text("status").notNull().default("detected"),
  source: text("source"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const featureProposals = pgTable("feature_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("enhancement"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("proposed"),
  proposedBy: text("proposed_by").notNull().default("agent"),
  rationale: text("rationale"),
  implementationPlan: text("implementation_plan"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGuardianLogSchema = createInsertSchema(guardianLogs).omit({ id: true, createdAt: true });
export const insertFeatureProposalSchema = createInsertSchema(featureProposals).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true });

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertIntegrationSchema = createInsertSchema(integrations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLlmApiKeySchema = createInsertSchema(llmApiKeys).omit({ id: true, createdAt: true });
export const insertWhatsappSessionSchema = createInsertSchema(whatsappSessions).omit({ id: true, approvedAt: true, lastMessageAt: true, createdAt: true });
export type OpenclawConfig = typeof openclawConfig.$inferSelect;
export type InsertOpenclawConfig = z.infer<typeof insertOpenclawConfigSchema>;
export type LlmApiKey = typeof llmApiKeys.$inferSelect;
export type InsertLlmApiKey = z.infer<typeof insertLlmApiKeySchema>;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export type InsertWhatsappSession = z.infer<typeof insertWhatsappSessionSchema>;
export type GuardianLog = typeof guardianLogs.$inferSelect;
export type InsertGuardianLog = z.infer<typeof insertGuardianLogSchema>;
export type FeatureProposal = typeof featureProposals.$inferSelect;
export type InsertFeatureProposal = z.infer<typeof insertFeatureProposalSchema>;

export const automationJobs = pgTable("automation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  command: text("command").notNull(),
  template: text("template"),
  enabled: boolean("enabled").notNull().default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  status: text("status").notNull().default("pending"),
  output: text("output"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const metricsEvents = pgTable("metrics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  category: text("category").notNull(),
  value: real("value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAutomationJobSchema = createInsertSchema(automationJobs).omit({ id: true, lastRun: true, nextRun: true, createdAt: true });
export const insertAutomationRunSchema = createInsertSchema(automationRuns).omit({ id: true, startedAt: true, completedAt: true });
export const insertMetricsEventSchema = createInsertSchema(metricsEvents).omit({ id: true, createdAt: true });

export type AutomationJob = typeof automationJobs.$inferSelect;
export type InsertAutomationJob = z.infer<typeof insertAutomationJobSchema>;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type InsertAutomationRun = z.infer<typeof insertAutomationRunSchema>;
export type MetricsEvent = typeof metricsEvents.$inferSelect;
export type InsertMetricsEvent = z.infer<typeof insertMetricsEventSchema>;
