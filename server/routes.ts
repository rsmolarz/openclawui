import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMachineSchema, insertApiKeySchema, insertLlmApiKeySchema, insertIntegrationSchema, insertInstanceSchema, insertSkillSchema, insertDocSchema, insertNodeSetupSessionSchema } from "@shared/schema";
import { z } from "zod";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";

async function getWhatsappBot() {
  const { whatsappBot } = await import("./bot/whatsapp");
  return whatsappBot;
}

const bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })),
});

const openclawConfigUpdateSchema = z.object({
  gatewayPort: z.number().optional(),
  gatewayBind: z.string().optional(),
  gatewayMode: z.string().optional(),
  gatewayToken: z.string().nullable().optional(),
  defaultLlm: z.string().optional(),
  fallbackLlm: z.string().optional(),
  llmApiKey: z.string().nullable().optional(),
  whatsappEnabled: z.boolean().optional(),
  whatsappPhone: z.string().nullable().optional(),
  whatsappApiKey: z.string().nullable().optional(),
  tailscaleEnabled: z.boolean().optional(),
  tailscaleIp: z.string().nullable().optional(),
  pendingNodes: z.any().optional(),
  nodesApproved: z.number().optional(),
});

const vpsUpdateSchema = z.object({
  vpsIp: z.string().optional(),
  vpsPort: z.number().optional(),
  sshUser: z.string().optional(),
  sshKeyPath: z.string().nullable().optional(),
});

const MEDINVEST_BASE_URL = process.env.OPENCLAW_DID_BASE_URL || "https://did-login.replit.app";
const MEDINVEST_CLIENT_ID = process.env.OPENCLAW_DID_CLIENT_ID || "";
const MEDINVEST_CLIENT_SECRET = process.env.OPENCLAW_DID_SECRET || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const STATE_SECRET = process.env.SESSION_SECRET || "openclaw-dev-session-secret";

function getRedirectUri(req: Request): string {
  if (APP_BASE_URL) {
    return `${APP_BASE_URL}/api/auth/medinvest/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/auth/medinvest/callback`;
}

function createSignedState(): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const signature = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifySignedState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, timestamp, signature] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > 10 * 60 * 1000 || age < 0) return false;
  const expectedSig = createHmac("sha256", STATE_SECRET).update(`${nonce}.${timestamp}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function resolveInstanceId(req: Request): Promise<string | null> {
  const instanceId = (req.query.instanceId as string) || (req.body?.instanceId as string);
  if (instanceId) return instanceId;
  const defaultInstance = await storage.getDefaultInstance();
  return defaultInstance?.id ?? null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProductionRuntime = process.env.NODE_ENV === "production";

  app.get("/api/auth/me", async (req, res) => {
    console.log("Auth check - SID:", req.sessionID, "userId:", req.session.userId, "cookie:", !!req.headers.cookie);
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    try {
      const user = await storage.getUser(req.session.userId);
      res.json({ user: user ?? null });
    } catch {
      res.json({ user: null });
    }
  });

  app.get("/api/auth/medinvest/start", (req, res) => {
    if (!MEDINVEST_CLIENT_ID || !MEDINVEST_CLIENT_SECRET) {
      return res.status(503).json({ error: "OAuth not configured. Missing client credentials." });
    }
    const state = createSignedState();
    const redirectUri = getRedirectUri(req);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: MEDINVEST_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "did:read profile:read",
      state,
    });

    res.redirect(`${MEDINVEST_BASE_URL}/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/auth/medinvest/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error("OAuth error from provider:", error, req.query.error_description);
        return res.redirect(`/?error=${error}`);
      }

      if (!code || !state || typeof state !== "string" || !verifySignedState(state)) {
        console.error("OAuth state verification failed - code:", !!code, "state:", !!state, "valid:", typeof state === "string" && verifySignedState(state as string));
        return res.redirect("/?error=invalid_state");
      }

      const redirectUri = getRedirectUri(req);

      const tokenRes = await fetch(`${MEDINVEST_BASE_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: MEDINVEST_CLIENT_ID,
          client_secret: MEDINVEST_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        console.error("Token exchange failed:", await tokenRes.text());
        return res.redirect("/?error=token_failed");
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      const userInfoRes = await fetch(`${MEDINVEST_BASE_URL}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        console.error("UserInfo fetch failed:", await userInfoRes.text());
        return res.redirect("/?error=userinfo_failed");
      }

      const userInfo = await userInfoRes.json() as {
        sub: string;
        did: string;
        username: string;
        display_name?: string;
        email?: string;
      };

      console.log("OAuth userInfo received:", JSON.stringify(userInfo));

      const user = await storage.upsertUser({
        medinvestId: userInfo.sub,
        medinvestDid: userInfo.did,
        username: userInfo.username,
        displayName: userInfo.display_name || userInfo.username,
        email: userInfo.email || null,
      });

      console.log("User upserted:", user.id, user.username);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.redirect("/?error=session_failed");
        }
        console.log("Session saved successfully. SID:", req.sessionID, "userId:", req.session.userId);
        res.redirect("/");
      });
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/instances", requireAuth, async (_req, res) => {
    try {
      const instances = await storage.getInstances();
      res.json(instances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch instances" });
    }
  });

  app.get("/api/instances/default", requireAuth, async (_req, res) => {
    try {
      const instance = await storage.getDefaultInstance();
      res.json(instance ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch default instance" });
    }
  });

  app.get("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const instance = await storage.getInstance(req.params.id as string);
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }
      res.json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch instance" });
    }
  });

  app.post("/api/instances", requireAuth, async (req, res) => {
    try {
      const parsed = insertInstanceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const instance = await storage.createInstance(parsed.data);
      res.status(201).json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create instance" });
    }
  });

  app.patch("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertInstanceSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateInstance(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Instance not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update instance" });
    }
  });

  app.delete("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const instance = await storage.getInstance(req.params.id as string);
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }
      if (instance.isDefault) {
        return res.status(400).json({ error: "Cannot delete the default instance" });
      }
      await storage.deleteInstance(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete instance" });
    }
  });

  app.get("/api/settings", requireAuth, async (_req, res) => {
    try {
      const allSettings = await storage.getSettings();
      res.json(allSettings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings/bulk", requireAuth, async (req, res) => {
    try {
      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      await storage.bulkUpdateSettings(parsed.data.updates);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/machines", requireAuth, async (_req, res) => {
    try {
      const allMachines = await storage.getMachines();
      res.json(allMachines);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch machines" });
    }
  });

  app.post("/api/machines", requireAuth, async (req, res) => {
    try {
      const parsed = insertMachineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const machine = await storage.createMachine(parsed.data);
      res.status(201).json(machine);
    } catch (error) {
      res.status(500).json({ error: "Failed to create machine" });
    }
  });

  app.patch("/api/machines/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertMachineSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateMachine(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/machines/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMachine(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete machine" });
    }
  });

  app.get("/api/api-keys", requireAuth, async (_req, res) => {
    try {
      const keys = await storage.getApiKeys();
      res.json(keys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/api-keys", requireAuth, async (req, res) => {
    try {
      const parsed = insertApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const apiKey = await storage.createApiKey(parsed.data);
      res.status(201).json(apiKey);
    } catch (error) {
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.patch("/api/api-keys/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateApiKey(req.params.id as string, req.body);
      if (!updated) {
        return res.status(404).json({ error: "API key not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.delete("/api/api-keys/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteApiKey(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.get("/api/vps", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const vps = await storage.getVpsConnection(instanceId);
      res.json(vps ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch VPS connection" });
    }
  });

  app.post("/api/vps", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const parsed = vpsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const vps = await storage.upsertVpsConnection(instanceId, parsed.data);
      res.json(vps);
    } catch (error) {
      res.status(500).json({ error: "Failed to update VPS connection" });
    }
  });

  app.post("/api/vps/check", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ connected: false, message: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) {
        await storage.createVpsConnectionLog({ instanceId, status: "error", message: "No VPS configured" });
        return res.json({ connected: false, message: "No VPS configured" });
      }
      const hasValidConfig = !!(vps.vpsIp && vps.vpsPort && vps.sshUser);
      const updated = await storage.updateVpsConnectionStatus(vps.id, hasValidConfig);
      const statusMsg = hasValidConfig
        ? `Connected to ${vps.sshUser}@${vps.vpsIp}:${vps.vpsPort}`
        : `Connection failed — missing configuration`;
      await storage.createVpsConnectionLog({
        instanceId,
        status: hasValidConfig ? "connected" : "error",
        message: statusMsg,
      });
      res.json({ connected: hasValidConfig, vps: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to check VPS" });
    }
  });

  app.get("/api/docker/services", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const services = await storage.getDockerServices(instanceId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Docker services" });
    }
  });

  app.get("/api/openclaw/config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const config = await storage.getOpenclawConfig(instanceId);
      if (config && Array.isArray(config.pendingNodes)) {
        config.pendingNodes = (config.pendingNodes as any[]).map((n: any) => {
          if (typeof n === "string") {
            return { id: n, hostname: n, ip: "Pending discovery", os: "Pending discovery", location: "Pending discovery" };
          }
          return n;
        });
      }
      res.json(config ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OpenClaw config" });
    }
  });

  app.post("/api/openclaw/config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const parsed = openclawConfigUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.upsertOpenclawConfig(instanceId, parsed.data);
      if (parsed.data.whatsappEnabled !== undefined) {
        await storage.updateDockerServiceStatus("whatsapp-bridge", parsed.data.whatsappEnabled ? "running" : "stopped", instanceId);
        if (!isProductionRuntime) {
          try {
            const bot = await getWhatsappBot();
            if (parsed.data.whatsappEnabled && !bot.isConnected()) {
              bot.start();
            } else if (!parsed.data.whatsappEnabled && (bot.isConnected() || bot.getStatus().state !== "disconnected")) {
              await bot.stop();
            }
          } catch {}
        }
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update OpenClaw config" });
    }
  });

  app.get("/api/status", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ vps_connected: false, openclaw_status: "offline", docker_services: 0, services: [] });
      const vps = await storage.getVpsConnection(instanceId);
      const docker = await storage.getDockerServices(instanceId);
      const config = await storage.getOpenclawConfig(instanceId);
      res.json({
        vps_connected: vps?.isConnected ?? false,
        openclaw_status: config?.gatewayStatus ?? "offline",
        docker_services: docker.length,
        services: docker.map((d) => ({
          name: d.serviceName,
          status: d.status,
          port: d.port,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  app.get("/api/nodes/pending", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ pending: [] });
      const config = await storage.getOpenclawConfig(instanceId);
      res.json({ pending: (config?.pendingNodes as any[]) ?? [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending nodes" });
    }
  });

  app.post("/api/nodes/approve", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      const config = await storage.getOpenclawConfig(instanceId);
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig(instanceId, {
            pendingNodes: pending,
            nodesApproved: (config.nodesApproved ?? 0) + 1,
          });
          return res.json({ success: true });
        }
      }
      res.status(404).json({ error: "Node not found" });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve node" });
    }
  });

  app.get("/api/llm-api-keys", requireAuth, async (_req, res) => {
    try {
      const keys = await storage.getLlmApiKeys();
      res.json(keys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch LLM API keys" });
    }
  });

  app.post("/api/llm-api-keys", requireAuth, async (req, res) => {
    try {
      const parsed = insertLlmApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const key = await storage.createLlmApiKey(parsed.data);
      res.status(201).json(key);
    } catch (error) {
      res.status(500).json({ error: "Failed to create LLM API key" });
    }
  });

  app.patch("/api/llm-api-keys/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertLlmApiKeySchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateLlmApiKey(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "LLM API key not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update LLM API key" });
    }
  });

  app.delete("/api/llm-api-keys/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteLlmApiKey(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete LLM API key" });
    }
  });

  app.get("/api/integrations", requireAuth, async (_req, res) => {
    try {
      const all = await storage.getIntegrations();
      res.json(all);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations", requireAuth, async (req, res) => {
    try {
      const parsed = insertIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const integration = await storage.createIntegration(parsed.data);
      res.status(201).json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to create integration" });
    }
  });

  app.patch("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertIntegrationSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateIntegration(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  app.delete("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteIntegration(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  app.get("/api/whatsapp/status", requireAuth, async (req, res) => {
    try {
      if (isProductionRuntime) {
        const instanceId = await resolveInstanceId(req);
        const config = instanceId ? await storage.getOpenclawConfig(instanceId) : null;
        res.json({
          state: "external",
          qrDataUrl: null,
          phone: config?.whatsappPhone || null,
          error: null,
          runtime: "external",
          enabled: config?.whatsappEnabled ?? false,
        });
      } else {
        const bot = await getWhatsappBot();
        const status = bot.getStatus();
        res.json({ ...status, runtime: "local", enabled: true });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp status" });
    }
  });

  app.get("/api/whatsapp/qr", requireAuth, async (_req, res) => {
    try {
      if (isProductionRuntime) {
        return res.json({ qrDataUrl: null, state: "external", phone: null });
      }
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      res.json({
        qrDataUrl: status.qrDataUrl,
        state: status.state,
        phone: status.phone,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp/start", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (isProductionRuntime) {
        if (instanceId) {
          const config = await storage.getOpenclawConfig(instanceId);
          if (!config?.whatsappEnabled) {
            await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
          }
        }
        return res.json({ success: true, message: "WhatsApp enabled. Bot will start on your OpenClaw server." });
      }
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      bot.start();
      res.json({ success: true, message: "WhatsApp bot starting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/stop", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (isProductionRuntime) {
        if (instanceId) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: false });
        }
        return res.json({ success: true, message: "WhatsApp disabled. Bot will stop on your OpenClaw server." });
      }
      const bot = await getWhatsappBot();
      await bot.stop();
      res.json({ success: true, message: "WhatsApp bot stopped" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/restart", requireAuth, async (_req, res) => {
    try {
      if (isProductionRuntime) {
        return res.json({ success: true, message: "Restart signal sent. Bot will restart on your OpenClaw server." });
      }
      const bot = await getWhatsappBot();
      await bot.restart();
      res.json({ success: true, message: "WhatsApp bot restarting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to restart WhatsApp bot" });
    }
  });

  app.get("/api/whatsapp/sessions", requireAuth, async (_req, res) => {
    try {
      const sessions = await storage.getAllWhatsappSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp sessions" });
    }
  });

  app.get("/api/whatsapp/pending", requireAuth, async (_req, res) => {
    try {
      const pending = await storage.getWhatsappPendingSessions();
      res.json(pending);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending sessions" });
    }
  });

  app.post("/api/whatsapp/approve/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.approveWhatsappSession(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (!isProductionRuntime) {
        try {
          const bot = await getWhatsappBot();
          await bot.sendApprovalNotification(session.phone);
        } catch {}
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve session" });
    }
  });

  app.delete("/api/whatsapp/sessions/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWhatsappSession(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  const SKILLS_CATALOG = [
    { skillId: "web-search", name: "Web Search", description: "Search the web for real-time information, news, and answers", category: "research", version: "1.2.0", icon: "Search" },
    { skillId: "code-execution", name: "Code Execution", description: "Execute Python, JavaScript, and shell scripts in a sandboxed environment", category: "development", version: "2.0.0", icon: "Terminal" },
    { skillId: "file-management", name: "File Management", description: "Read, write, and manage files on connected nodes", category: "system", version: "1.1.0", icon: "FolderOpen" },
    { skillId: "image-analysis", name: "Image Analysis", description: "Analyze and describe images using vision models", category: "ai", version: "1.0.0", icon: "Eye" },
    { skillId: "document-qa", name: "Document Q&A", description: "Extract answers from uploaded PDFs, DOCX, and text documents", category: "research", version: "1.3.0", icon: "FileText" },
    { skillId: "api-caller", name: "API Caller", description: "Make HTTP requests to external APIs with authentication support", category: "development", version: "1.0.0", icon: "Globe" },
    { skillId: "database-query", name: "Database Query", description: "Execute read-only SQL queries against connected databases", category: "development", version: "1.1.0", icon: "Database" },
    { skillId: "email-sender", name: "Email Sender", description: "Compose and send emails via configured SMTP providers", category: "communication", version: "1.0.0", icon: "Mail" },
    { skillId: "calendar-manager", name: "Calendar Manager", description: "Create, read, and manage calendar events", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "text-to-speech", name: "Text to Speech", description: "Convert text responses to natural-sounding audio", category: "ai", version: "1.0.0", icon: "Volume2" },
    { skillId: "translation", name: "Translation", description: "Translate text between 100+ languages in real time", category: "ai", version: "1.2.0", icon: "Languages" },
    { skillId: "math-solver", name: "Math Solver", description: "Solve complex mathematical equations and show step-by-step solutions", category: "research", version: "1.0.0", icon: "Calculator" },
    { skillId: "screenshot-capture", name: "Screenshot Capture", description: "Take screenshots of websites and applications", category: "system", version: "1.0.0", icon: "Camera" },
    { skillId: "data-visualization", name: "Data Visualization", description: "Create charts, graphs, and visual dashboards from data", category: "productivity", version: "1.1.0", icon: "BarChart3" },
    { skillId: "task-scheduler", name: "Task Scheduler", description: "Schedule and automate recurring tasks with cron-like expressions", category: "system", version: "1.0.0", icon: "Clock" },
    { skillId: "sentiment-analysis", name: "Sentiment Analysis", description: "Analyze the sentiment and tone of text messages and documents", category: "ai", version: "1.0.0", icon: "Heart" },
    { skillId: "knowledge-base", name: "Knowledge Base", description: "Build and query a custom RAG knowledge base from uploaded documents", category: "research", version: "2.0.0", icon: "BookOpen" },
    { skillId: "webhook-listener", name: "Webhook Listener", description: "Receive and process incoming webhook events from external services", category: "development", version: "1.0.0", icon: "Webhook" },
    { skillId: "json-transformer", name: "JSON Transformer", description: "Parse, transform, and restructure JSON data between formats", category: "development", version: "1.0.0", icon: "Braces" },
    { skillId: "password-generator", name: "Password Generator", description: "Generate secure passwords and manage temporary credentials", category: "system", version: "1.0.0", icon: "KeyRound" },
    { skillId: "whatsapp-messaging", name: "WhatsApp Messaging", description: "Send and receive WhatsApp messages through the connected bot", category: "communication", version: "1.0.0", icon: "MessageSquare" },
    { skillId: "docker-manager", name: "Docker Manager", description: "Start, stop, and monitor Docker containers on connected VPS", category: "system", version: "1.0.0", icon: "Container" },
    { skillId: "log-analyzer", name: "Log Analyzer", description: "Parse, search, and analyze application and system logs", category: "development", version: "1.0.0", icon: "ScrollText" },
    { skillId: "network-scanner", name: "Network Scanner", description: "Scan and discover devices on the local or Tailscale network", category: "system", version: "1.0.0", icon: "Radar" },
  ];

  app.get("/api/skills", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      res.json(installed);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch skills" });
    }
  });

  app.get("/api/skills/catalog", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      const installedIds = new Set(installed.map(s => s.skillId));
      const catalog = SKILLS_CATALOG.map(s => ({
        ...s,
        installed: installedIds.has(s.skillId),
      }));
      res.json(catalog);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch skills catalog" });
    }
  });

  app.post("/api/skills", requireAuth, async (req, res) => {
    try {
      const data = insertSkillSchema.parse(req.body);
      const existing = await storage.getSkillBySkillId(data.skillId);
      if (existing) {
        return res.status(409).json({ error: "Skill already installed" });
      }
      const skill = await storage.createSkill(data);
      res.json(skill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to install skill" });
    }
  });

  app.patch("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertSkillSchema.partial();
      const data = updateSchema.parse(req.body);
      const skill = await storage.updateSkill(req.params.id as string, data);
      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(skill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSkill(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove skill" });
    }
  });

  // ── Documentation Hub ──
  app.get("/api/docs", requireAuth, async (_req, res) => {
    try {
      const allDocs = await storage.getDocs();
      res.json(allDocs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch docs" });
    }
  });

  app.get("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getDoc(req.params.id);
      if (!doc) return res.status(404).json({ error: "Doc not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch doc" });
    }
  });

  app.post("/api/docs", requireAuth, async (req, res) => {
    try {
      const parsed = insertDocSchema.parse(req.body);
      const doc = await storage.createDoc(parsed);
      res.json(doc);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid doc data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create doc" });
    }
  });

  app.patch("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      const partial = insertDocSchema.partial().parse(req.body);
      const doc = await storage.updateDoc(req.params.id, partial);
      if (!doc) return res.status(404).json({ error: "Doc not found" });
      res.json(doc);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid doc data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update doc" });
    }
  });

  app.delete("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteDoc(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete doc" });
    }
  });

  // ── VPS Connection Logs ──
  app.get("/api/vps/logs", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const logs = await storage.getVpsConnectionLogs(instanceId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch VPS logs" });
    }
  });

  // ── Node Setup Wizard ──
  app.get("/api/node-setup", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const sessions = await storage.getNodeSetupSessions(instanceId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setup sessions" });
    }
  });

  app.get("/api/node-setup/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.getNodeSetupSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setup session" });
    }
  });

  app.post("/api/node-setup", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      const parsed = insertNodeSetupSessionSchema.partial().parse(req.body);
      const session = await storage.createNodeSetupSession({
        ...parsed,
        instanceId: instanceId ?? undefined,
        os: parsed.os ?? "linux",
        currentStep: 0,
        totalSteps: 5,
        status: "in_progress",
        completedSteps: [],
      } as any);
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create setup session" });
    }
  });

  app.patch("/api/node-setup/:id", requireAuth, async (req, res) => {
    try {
      const partial = insertNodeSetupSessionSchema.partial().parse(req.body);
      const session = await storage.updateNodeSetupSession(req.params.id, partial);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update setup session" });
    }
  });

  // ── Onboarding Checklist ──
  app.get("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const checklist = await storage.getOnboardingChecklist(userId, instanceId);
      res.json(checklist ?? { steps: {}, dismissed: false });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch onboarding" });
    }
  });

  app.patch("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const { steps, dismissed } = req.body;
      const checklist = await storage.upsertOnboardingChecklist(userId, instanceId, {
        ...(steps !== undefined ? { steps } : {}),
        ...(dismissed !== undefined ? { dismissed } : {}),
      });
      res.json(checklist);
    } catch (error) {
      res.status(500).json({ error: "Failed to update onboarding" });
    }
  });

  return httpServer;
}
