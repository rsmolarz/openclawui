import {
  type Setting, type InsertSetting,
  type Machine, type InsertMachine,
  type ApiKey, type InsertApiKey,
  type VpsConnection, type InsertVpsConnection,
  type DockerService, type InsertDockerService,
  type OpenclawConfig, type InsertOpenclawConfig,
  settings, machines, apiKeys, vpsConnections, dockerServices, openclawConfig,
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

  getOpenclawConfig(): Promise<OpenclawConfig | undefined>;
  upsertOpenclawConfig(data: Partial<InsertOpenclawConfig>): Promise<OpenclawConfig>;
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
}

export const storage = new DatabaseStorage();
