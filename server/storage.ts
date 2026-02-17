import {
  type Setting, type InsertSetting,
  type Machine, type InsertMachine,
  type ApiKey, type InsertApiKey,
  type VpsConnection, type InsertVpsConnection,
  type DockerService, type InsertDockerService,
  type OpenclawConfig, type InsertOpenclawConfig,
  type LlmApiKey, type InsertLlmApiKey,
  type Integration, type InsertIntegration,
  type User, type InsertUser,
  type WhatsappSession, type InsertWhatsappSession,
  settings, machines, apiKeys, vpsConnections, dockerServices, openclawConfig, llmApiKeys, integrations, users, whatsappSessions,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getSettings(): Promise<Setting[]>;
  getSettingsByCategory(category: string): Promise<Setting[]>;
  upsertSetting(key: string, value: string): Promise<Setting>;
  bulkUpdateSettings(updates: { key: string; value: string }[]): Promise<void>;

  getMachines(): Promise<Machine[]>;
  getMachine(id: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: string, data: Partial<InsertMachine>): Promise<Machine | undefined>;
  deleteMachine(id: string): Promise<void>;

  getApiKeys(): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: string, data: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<void>;

  getVpsConnection(): Promise<VpsConnection | undefined>;
  upsertVpsConnection(data: Partial<InsertVpsConnection>): Promise<VpsConnection>;
  updateVpsConnectionStatus(id: string, isConnected: boolean): Promise<VpsConnection | undefined>;

  getDockerServices(): Promise<DockerService[]>;
  upsertDockerService(data: InsertDockerService): Promise<DockerService>;
  updateDockerServiceStatus(serviceName: string, status: string): Promise<DockerService | undefined>;

  getOpenclawConfig(): Promise<OpenclawConfig | undefined>;
  upsertOpenclawConfig(data: Partial<InsertOpenclawConfig>): Promise<OpenclawConfig>;

  getLlmApiKeys(): Promise<LlmApiKey[]>;
  createLlmApiKey(data: InsertLlmApiKey): Promise<LlmApiKey>;
  updateLlmApiKey(id: string, data: Partial<InsertLlmApiKey>): Promise<LlmApiKey | undefined>;
  deleteLlmApiKey(id: string): Promise<void>;

  getIntegrations(): Promise<Integration[]>;
  getIntegration(id: string): Promise<Integration | undefined>;
  createIntegration(data: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<void>;

  getUserByMedinvestId(medinvestId: string): Promise<User | undefined>;
  upsertUser(data: InsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;

  getWhatsappSessionByPhone(phone: string): Promise<WhatsappSession | undefined>;
  getWhatsappPendingSessions(): Promise<WhatsappSession[]>;
  getAllWhatsappSessions(): Promise<WhatsappSession[]>;
  upsertWhatsappSession(phone: string, data: Partial<InsertWhatsappSession>): Promise<WhatsappSession>;
  approveWhatsappSession(id: string): Promise<WhatsappSession | undefined>;
  deleteWhatsappSession(id: string): Promise<void>;
  updateWhatsappSessionLastMessage(phone: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }

  async getSettingsByCategory(category: string): Promise<Setting[]> {
    return db.select().from(settings).where(eq(settings.category, category));
  }

  async upsertSetting(key: string, value: string): Promise<Setting> {
    const existing = await db.select().from(settings).where(eq(settings.key, key));
    if (existing.length > 0) {
      const [updated] = await db
        .update(settings)
        .set({ value })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(settings)
      .values({ key, value, category: key.split(".")[0], label: key, type: "text" })
      .returning();
    return created;
  }

  async bulkUpdateSettings(updates: { key: string; value: string }[]): Promise<void> {
    for (const update of updates) {
      await this.upsertSetting(update.key, update.value);
    }
  }

  async getMachines(): Promise<Machine[]> {
    return db.select().from(machines);
  }

  async getMachine(id: string): Promise<Machine | undefined> {
    const [machine] = await db.select().from(machines).where(eq(machines.id, id));
    return machine;
  }

  async createMachine(machine: InsertMachine): Promise<Machine> {
    const [created] = await db.insert(machines).values(machine).returning();
    return created;
  }

  async updateMachine(id: string, data: Partial<InsertMachine>): Promise<Machine | undefined> {
    const [updated] = await db
      .update(machines)
      .set(data)
      .where(eq(machines.id, id))
      .returning();
    return updated;
  }

  async deleteMachine(id: string): Promise<void> {
    await db.delete(machines).where(eq(machines.id, id));
  }

  async getApiKeys(): Promise<ApiKey[]> {
    return db.select().from(apiKeys);
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key;
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const key = `oc_${randomUUID().replace(/-/g, "")}`;
    const [created] = await db
      .insert(apiKeys)
      .values({ ...apiKey, key })
      .returning();
    return created;
  }

  async updateApiKey(id: string, data: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const [updated] = await db
      .update(apiKeys)
      .set(data)
      .where(eq(apiKeys.id, id))
      .returning();
    return updated;
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  async getVpsConnection(): Promise<VpsConnection | undefined> {
    const [vps] = await db.select().from(vpsConnections);
    return vps;
  }

  async upsertVpsConnection(data: Partial<InsertVpsConnection>): Promise<VpsConnection> {
    const existing = await this.getVpsConnection();
    if (existing) {
      const [updated] = await db
        .update(vpsConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(vpsConnections.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(vpsConnections)
      .values(data as InsertVpsConnection)
      .returning();
    return created;
  }

  async updateVpsConnectionStatus(id: string, isConnected: boolean): Promise<VpsConnection | undefined> {
    const [updated] = await db
      .update(vpsConnections)
      .set({ isConnected, lastChecked: new Date(), updatedAt: new Date() })
      .where(eq(vpsConnections.id, id))
      .returning();
    return updated;
  }

  async getDockerServices(): Promise<DockerService[]> {
    return db.select().from(dockerServices);
  }

  async upsertDockerService(data: InsertDockerService): Promise<DockerService> {
    const [created] = await db.insert(dockerServices).values(data).returning();
    return created;
  }

  async updateDockerServiceStatus(serviceName: string, status: string): Promise<DockerService | undefined> {
    const [updated] = await db
      .update(dockerServices)
      .set({ status, lastChecked: new Date() })
      .where(eq(dockerServices.serviceName, serviceName))
      .returning();
    return updated;
  }

  async getOpenclawConfig(): Promise<OpenclawConfig | undefined> {
    const [config] = await db.select().from(openclawConfig);
    return config;
  }

  async upsertOpenclawConfig(data: Partial<InsertOpenclawConfig>): Promise<OpenclawConfig> {
    const existing = await this.getOpenclawConfig();
    if (existing) {
      const [updated] = await db
        .update(openclawConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(openclawConfig.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(openclawConfig)
      .values(data as InsertOpenclawConfig)
      .returning();
    return created;
  }

  async getLlmApiKeys(): Promise<LlmApiKey[]> {
    return db.select().from(llmApiKeys);
  }

  async createLlmApiKey(data: InsertLlmApiKey): Promise<LlmApiKey> {
    const [created] = await db.insert(llmApiKeys).values(data).returning();
    return created;
  }

  async updateLlmApiKey(id: string, data: Partial<InsertLlmApiKey>): Promise<LlmApiKey | undefined> {
    const [updated] = await db
      .update(llmApiKeys)
      .set(data)
      .where(eq(llmApiKeys.id, id))
      .returning();
    return updated;
  }

  async deleteLlmApiKey(id: string): Promise<void> {
    await db.delete(llmApiKeys).where(eq(llmApiKeys.id, id));
  }

  async getIntegrations(): Promise<Integration[]> {
    return db.select().from(integrations);
  }

  async getIntegration(id: string): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, id));
    return integration;
  }

  async createIntegration(data: InsertIntegration): Promise<Integration> {
    const [created] = await db.insert(integrations).values(data).returning();
    return created;
  }

  async updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration | undefined> {
    const [updated] = await db
      .update(integrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(integrations.id, id))
      .returning();
    return updated;
  }

  async deleteIntegration(id: string): Promise<void> {
    await db.delete(integrations).where(eq(integrations.id, id));
  }

  async getUserByMedinvestId(medinvestId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.medinvestId, medinvestId));
    return user;
  }

  async upsertUser(data: InsertUser): Promise<User> {
    const existing = await this.getUserByMedinvestId(data.medinvestId);
    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ displayName: data.displayName, email: data.email, username: data.username })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(users).values(data).returning();
    return created;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getWhatsappSessionByPhone(phone: string): Promise<WhatsappSession | undefined> {
    const [session] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.phone, phone));
    return session;
  }

  async getWhatsappPendingSessions(): Promise<WhatsappSession[]> {
    return db.select().from(whatsappSessions).where(eq(whatsappSessions.status, "pending"));
  }

  async getAllWhatsappSessions(): Promise<WhatsappSession[]> {
    return db.select().from(whatsappSessions);
  }

  async upsertWhatsappSession(phone: string, data: Partial<InsertWhatsappSession>): Promise<WhatsappSession> {
    const existing = await this.getWhatsappSessionByPhone(phone);
    if (existing) {
      const [updated] = await db
        .update(whatsappSessions)
        .set(data)
        .where(eq(whatsappSessions.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(whatsappSessions)
      .values({ phone, ...data } as any)
      .returning();
    return created;
  }

  async approveWhatsappSession(id: string): Promise<WhatsappSession | undefined> {
    const [updated] = await db
      .update(whatsappSessions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(whatsappSessions.id, id))
      .returning();
    return updated;
  }

  async deleteWhatsappSession(id: string): Promise<void> {
    await db.delete(whatsappSessions).where(eq(whatsappSessions.id, id));
  }

  async updateWhatsappSessionLastMessage(phone: string): Promise<void> {
    await db
      .update(whatsappSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(whatsappSessions.phone, phone));
  }
}

export const storage = new DatabaseStorage();
