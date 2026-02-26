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
  type OpenclawInstance, type InsertInstance,
  type Skill, type InsertSkill,
  type Doc, type InsertDoc,
  type VpsConnectionLog, type InsertVpsConnectionLog,
  type NodeSetupSession, type InsertNodeSetupSession,
  type OnboardingChecklist, type InsertOnboardingChecklist,
  type AiConversation, type InsertAiConversation,
  type AiMessage, type InsertAiMessage,
  type GuardianLog, type InsertGuardianLog,
  type FeatureProposal, type InsertFeatureProposal,
  settings, machines, apiKeys, vpsConnections, dockerServices, openclawConfig, llmApiKeys, integrations, users, whatsappSessions, openclawInstances, skills,
  docs, vpsConnectionLogs, nodeSetupSessions, onboardingChecklist,
  aiConversations, aiMessages, guardianLogs, featureProposals,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getSettings(): Promise<Setting[]>;
  getSettingsByCategory(category: string): Promise<Setting[]>;
  upsertSetting(key: string, value: string): Promise<Setting>;
  bulkUpdateSettings(updates: { key: string; value: string }[]): Promise<void>;

  getMachines(): Promise<Machine[]>;
  getMachine(id: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: string, data: Partial<InsertMachine> & { lastSeen?: Date }): Promise<Machine | undefined>;
  deleteMachine(id: string): Promise<void>;

  getApiKeys(): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: string, data: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<void>;

  getInstances(): Promise<OpenclawInstance[]>;
  getInstance(id: string): Promise<OpenclawInstance | undefined>;
  getDefaultInstance(): Promise<OpenclawInstance | undefined>;
  getInstanceByApiKey(apiKey: string): Promise<OpenclawInstance | undefined>;
  createInstance(data: InsertInstance): Promise<OpenclawInstance>;
  updateInstance(id: string, data: Partial<InsertInstance>): Promise<OpenclawInstance | undefined>;
  deleteInstance(id: string): Promise<void>;

  getVpsConnection(instanceId: string): Promise<VpsConnection | undefined>;
  upsertVpsConnection(instanceId: string, data: Partial<InsertVpsConnection>): Promise<VpsConnection>;
  updateVpsConnectionStatus(id: string, isConnected: boolean): Promise<VpsConnection | undefined>;

  getDockerServices(instanceId: string): Promise<DockerService[]>;
  upsertDockerService(data: InsertDockerService): Promise<DockerService>;
  updateDockerServiceStatus(serviceName: string, status: string, instanceId?: string): Promise<DockerService | undefined>;

  getOpenclawConfig(instanceId: string): Promise<OpenclawConfig | undefined>;
  upsertOpenclawConfig(instanceId: string, data: Partial<InsertOpenclawConfig>): Promise<OpenclawConfig>;

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
  getAllUsers(): Promise<User[]>;

  getWhatsappSessionByPhone(phone: string): Promise<WhatsappSession | undefined>;
  getWhatsappPendingSessions(): Promise<WhatsappSession[]>;
  getAllWhatsappSessions(): Promise<WhatsappSession[]>;
  upsertWhatsappSession(phone: string, data: Partial<InsertWhatsappSession>): Promise<WhatsappSession>;
  approveWhatsappSession(id: string): Promise<WhatsappSession | undefined>;
  approveWhatsappSessionByCode(pairingCode: string): Promise<WhatsappSession | undefined>;
  deleteWhatsappSession(id: string): Promise<void>;
  updateWhatsappSessionLastMessage(phone: string): Promise<void>;

  getSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | undefined>;
  getSkillBySkillId(skillId: string): Promise<Skill | undefined>;
  createSkill(data: InsertSkill): Promise<Skill>;
  updateSkill(id: string, data: Partial<InsertSkill>): Promise<Skill | undefined>;
  deleteSkill(id: string): Promise<void>;

  getDocs(): Promise<Doc[]>;
  getDoc(id: string): Promise<Doc | undefined>;
  getDocBySlug(slug: string): Promise<Doc | undefined>;
  createDoc(data: InsertDoc): Promise<Doc>;
  updateDoc(id: string, data: Partial<InsertDoc>): Promise<Doc | undefined>;
  deleteDoc(id: string): Promise<void>;

  getVpsConnectionLogs(instanceId: string): Promise<VpsConnectionLog[]>;
  createVpsConnectionLog(data: InsertVpsConnectionLog): Promise<VpsConnectionLog>;

  getNodeSetupSessions(instanceId: string): Promise<NodeSetupSession[]>;
  getNodeSetupSession(id: string): Promise<NodeSetupSession | undefined>;
  createNodeSetupSession(data: InsertNodeSetupSession): Promise<NodeSetupSession>;
  updateNodeSetupSession(id: string, data: Partial<InsertNodeSetupSession>): Promise<NodeSetupSession | undefined>;

  getOnboardingChecklist(userId: string, instanceId: string): Promise<OnboardingChecklist | undefined>;
  upsertOnboardingChecklist(userId: string, instanceId: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist>;

  getAiConversations(userId: string): Promise<AiConversation[]>;
  getAiConversation(id: string): Promise<AiConversation | undefined>;
  createAiConversation(data: InsertAiConversation): Promise<AiConversation>;
  deleteAiConversation(id: string): Promise<void>;
  updateAiConversationTitle(id: string, title: string): Promise<void>;

  getAiMessages(conversationId: string): Promise<AiMessage[]>;
  createAiMessage(data: InsertAiMessage): Promise<AiMessage>;

  getGuardianLogs(limit?: number): Promise<GuardianLog[]>;
  createGuardianLog(data: InsertGuardianLog): Promise<GuardianLog>;
  updateGuardianLog(id: string, data: Partial<InsertGuardianLog>): Promise<GuardianLog | undefined>;

  getFeatureProposals(): Promise<FeatureProposal[]>;
  getFeatureProposal(id: string): Promise<FeatureProposal | undefined>;
  createFeatureProposal(data: InsertFeatureProposal): Promise<FeatureProposal>;
  updateFeatureProposal(id: string, data: Partial<InsertFeatureProposal>): Promise<FeatureProposal | undefined>;
  deleteFeatureProposal(id: string): Promise<void>;
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

  async updateMachine(id: string, data: Partial<InsertMachine> & { lastSeen?: Date }): Promise<Machine | undefined> {
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

  async getInstances(): Promise<OpenclawInstance[]> {
    return db.select().from(openclawInstances);
  }

  async getInstance(id: string): Promise<OpenclawInstance | undefined> {
    const [instance] = await db.select().from(openclawInstances).where(eq(openclawInstances.id, id));
    return instance;
  }

  async getDefaultInstance(): Promise<OpenclawInstance | undefined> {
    const [instance] = await db.select().from(openclawInstances).where(eq(openclawInstances.isDefault, true));
    return instance;
  }

  async getInstanceByApiKey(apiKey: string): Promise<OpenclawInstance | undefined> {
    const [instance] = await db.select().from(openclawInstances).where(eq(openclawInstances.apiKey, apiKey));
    return instance;
  }

  async createInstance(data: InsertInstance): Promise<OpenclawInstance> {
    const [created] = await db.insert(openclawInstances).values(data).returning();
    return created;
  }

  async updateInstance(id: string, data: Partial<InsertInstance>): Promise<OpenclawInstance | undefined> {
    const [updated] = await db
      .update(openclawInstances)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(openclawInstances.id, id))
      .returning();
    return updated;
  }

  async deleteInstance(id: string): Promise<void> {
    await db.delete(openclawConfig).where(eq(openclawConfig.instanceId, id));
    await db.delete(vpsConnections).where(eq(vpsConnections.instanceId, id));
    await db.delete(dockerServices).where(eq(dockerServices.instanceId, id));
    await db.delete(openclawInstances).where(eq(openclawInstances.id, id));
  }

  async getVpsConnection(instanceId: string): Promise<VpsConnection | undefined> {
    const [vps] = await db.select().from(vpsConnections).where(eq(vpsConnections.instanceId, instanceId));
    return vps;
  }

  async upsertVpsConnection(instanceId: string, data: Partial<InsertVpsConnection>): Promise<VpsConnection> {
    const existing = await this.getVpsConnection(instanceId);
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
      .values({ ...data, instanceId } as InsertVpsConnection)
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

  async getDockerServices(instanceId: string): Promise<DockerService[]> {
    return db.select().from(dockerServices).where(eq(dockerServices.instanceId, instanceId));
  }

  async upsertDockerService(data: InsertDockerService): Promise<DockerService> {
    const [created] = await db.insert(dockerServices).values(data).returning();
    return created;
  }

  async updateDockerServiceStatus(serviceName: string, status: string, instanceId?: string): Promise<DockerService | undefined> {
    if (instanceId) {
      const services = await db.select().from(dockerServices)
        .where(eq(dockerServices.instanceId, instanceId));
      const target = services.find(s => s.serviceName === serviceName);
      if (target) {
        const [updated] = await db
          .update(dockerServices)
          .set({ status, lastChecked: new Date() })
          .where(eq(dockerServices.id, target.id))
          .returning();
        return updated;
      }
      return undefined;
    }
    const [updated] = await db
      .update(dockerServices)
      .set({ status, lastChecked: new Date() })
      .where(eq(dockerServices.serviceName, serviceName))
      .returning();
    return updated;
  }

  async getOpenclawConfig(instanceId: string): Promise<OpenclawConfig | undefined> {
    const [config] = await db.select().from(openclawConfig).where(eq(openclawConfig.instanceId, instanceId));
    return config;
  }

  async upsertOpenclawConfig(instanceId: string, data: Partial<InsertOpenclawConfig>): Promise<OpenclawConfig> {
    const existing = await this.getOpenclawConfig(instanceId);
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
      .values({ ...data, instanceId } as InsertOpenclawConfig)
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

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
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

  async approveWhatsappSessionByCode(pairingCode: string): Promise<WhatsappSession | undefined> {
    const normalized = pairingCode.trim().toUpperCase();
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.pairingCode, normalized));
    if (!session) return undefined;
    if (session.status === "approved") return session;
    const [updated] = await db
      .update(whatsappSessions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(whatsappSessions.id, session.id))
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

  async getSkills(): Promise<Skill[]> {
    return db.select().from(skills);
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    return skill;
  }

  async getSkillBySkillId(skillId: string): Promise<Skill | undefined> {
    const [skill] = await db.select().from(skills).where(eq(skills.skillId, skillId));
    return skill;
  }

  async createSkill(data: InsertSkill): Promise<Skill> {
    const [created] = await db.insert(skills).values(data).returning();
    return created;
  }

  async updateSkill(id: string, data: Partial<InsertSkill>): Promise<Skill | undefined> {
    const [updated] = await db
      .update(skills)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(skills.id, id))
      .returning();
    return updated;
  }

  async deleteSkill(id: string): Promise<void> {
    await db.delete(skills).where(eq(skills.id, id));
  }

  async getDocs(): Promise<Doc[]> {
    return db.select().from(docs).orderBy(desc(docs.updatedAt));
  }

  async getDoc(id: string): Promise<Doc | undefined> {
    const [doc] = await db.select().from(docs).where(eq(docs.id, id));
    return doc;
  }

  async getDocBySlug(slug: string): Promise<Doc | undefined> {
    const [doc] = await db.select().from(docs).where(eq(docs.slug, slug));
    return doc;
  }

  async createDoc(data: InsertDoc): Promise<Doc> {
    const [created] = await db.insert(docs).values(data).returning();
    return created;
  }

  async updateDoc(id: string, data: Partial<InsertDoc>): Promise<Doc | undefined> {
    const [updated] = await db
      .update(docs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(docs.id, id))
      .returning();
    return updated;
  }

  async deleteDoc(id: string): Promise<void> {
    await db.delete(docs).where(eq(docs.id, id));
  }

  async getVpsConnectionLogs(instanceId: string): Promise<VpsConnectionLog[]> {
    return db.select().from(vpsConnectionLogs)
      .where(eq(vpsConnectionLogs.instanceId, instanceId))
      .orderBy(desc(vpsConnectionLogs.checkedAt))
      .limit(50);
  }

  async createVpsConnectionLog(data: InsertVpsConnectionLog): Promise<VpsConnectionLog> {
    const [created] = await db.insert(vpsConnectionLogs).values(data).returning();
    return created;
  }

  async getNodeSetupSessions(instanceId: string): Promise<NodeSetupSession[]> {
    return db.select().from(nodeSetupSessions)
      .where(eq(nodeSetupSessions.instanceId, instanceId))
      .orderBy(desc(nodeSetupSessions.updatedAt));
  }

  async getNodeSetupSession(id: string): Promise<NodeSetupSession | undefined> {
    const [session] = await db.select().from(nodeSetupSessions).where(eq(nodeSetupSessions.id, id));
    return session;
  }

  async createNodeSetupSession(data: InsertNodeSetupSession): Promise<NodeSetupSession> {
    const [created] = await db.insert(nodeSetupSessions).values(data).returning();
    return created;
  }

  async updateNodeSetupSession(id: string, data: Partial<InsertNodeSetupSession>): Promise<NodeSetupSession | undefined> {
    const [updated] = await db
      .update(nodeSetupSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(nodeSetupSessions.id, id))
      .returning();
    return updated;
  }

  async getOnboardingChecklist(userId: string, instanceId: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db.select().from(onboardingChecklist)
      .where(and(eq(onboardingChecklist.userId, userId), eq(onboardingChecklist.instanceId, instanceId)));
    return checklist;
  }

  async upsertOnboardingChecklist(userId: string, instanceId: string, data: Partial<InsertOnboardingChecklist>): Promise<OnboardingChecklist> {
    const existing = await this.getOnboardingChecklist(userId, instanceId);
    if (existing) {
      const [updated] = await db
        .update(onboardingChecklist)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(onboardingChecklist.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(onboardingChecklist)
      .values({ userId, instanceId, ...data } as any)
      .returning();
    return created;
  }

  async getAiConversations(userId: string): Promise<AiConversation[]> {
    return db.select().from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.createdAt));
  }

  async getAiConversation(id: string): Promise<AiConversation | undefined> {
    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
    return conv;
  }

  async createAiConversation(data: InsertAiConversation): Promise<AiConversation> {
    const [conv] = await db.insert(aiConversations).values(data).returning();
    return conv;
  }

  async deleteAiConversation(id: string): Promise<void> {
    await db.delete(aiMessages).where(eq(aiMessages.conversationId, id));
    await db.delete(aiConversations).where(eq(aiConversations.id, id));
  }

  async updateAiConversationTitle(id: string, title: string): Promise<void> {
    await db.update(aiConversations).set({ title }).where(eq(aiConversations.id, id));
  }

  async getAiMessages(conversationId: string): Promise<AiMessage[]> {
    return db.select().from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(aiMessages.createdAt);
  }

  async createAiMessage(data: InsertAiMessage): Promise<AiMessage> {
    const [msg] = await db.insert(aiMessages).values(data).returning();
    return msg;
  }

  async getGuardianLogs(limit = 100): Promise<GuardianLog[]> {
    return db.select().from(guardianLogs).orderBy(desc(guardianLogs.createdAt)).limit(limit);
  }

  async createGuardianLog(data: InsertGuardianLog): Promise<GuardianLog> {
    const [log] = await db.insert(guardianLogs).values(data).returning();
    return log;
  }

  async updateGuardianLog(id: string, data: Partial<InsertGuardianLog>): Promise<GuardianLog | undefined> {
    const [log] = await db.update(guardianLogs).set(data).where(eq(guardianLogs.id, id)).returning();
    return log;
  }

  async getFeatureProposals(): Promise<FeatureProposal[]> {
    return db.select().from(featureProposals).orderBy(desc(featureProposals.createdAt));
  }

  async getFeatureProposal(id: string): Promise<FeatureProposal | undefined> {
    const [proposal] = await db.select().from(featureProposals).where(eq(featureProposals.id, id));
    return proposal;
  }

  async createFeatureProposal(data: InsertFeatureProposal): Promise<FeatureProposal> {
    const [proposal] = await db.insert(featureProposals).values(data).returning();
    return proposal;
  }

  async updateFeatureProposal(id: string, data: Partial<InsertFeatureProposal>): Promise<FeatureProposal | undefined> {
    const [proposal] = await db.update(featureProposals).set({ ...data, updatedAt: new Date() }).where(eq(featureProposals.id, id)).returning();
    return proposal;
  }

  async deleteFeatureProposal(id: string): Promise<void> {
    await db.delete(featureProposals).where(eq(featureProposals.id, id));
  }
}

export const storage = new DatabaseStorage();
