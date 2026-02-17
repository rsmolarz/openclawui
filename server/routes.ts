import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMachineSchema, insertApiKeySchema, insertLlmApiKeySchema, insertIntegrationSchema } from "@shared/schema";
import { z } from "zod";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { whatsappBot } from "./bot/whatsapp";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      const updated = await storage.updateMachine(req.params.id, parsed.data);
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
      await storage.deleteMachine(req.params.id);
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
      const updated = await storage.updateApiKey(req.params.id, req.body);
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
      await storage.deleteApiKey(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.get("/api/vps", requireAuth, async (_req, res) => {
    try {
      const vps = await storage.getVpsConnection();
      res.json(vps ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch VPS connection" });
    }
  });

  app.post("/api/vps", requireAuth, async (req, res) => {
    try {
      const parsed = vpsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const vps = await storage.upsertVpsConnection(parsed.data);
      res.json(vps);
    } catch (error) {
      res.status(500).json({ error: "Failed to update VPS connection" });
    }
  });

  app.post("/api/vps/check", requireAuth, async (_req, res) => {
    try {
      const vps = await storage.getVpsConnection();
      if (!vps) {
        return res.json({ connected: false, message: "No VPS configured" });
      }
      const hasValidConfig = !!(vps.vpsIp && vps.vpsPort && vps.sshUser);
      const updated = await storage.updateVpsConnectionStatus(vps.id, hasValidConfig);
      res.json({ connected: hasValidConfig, vps: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to check VPS" });
    }
  });

  app.get("/api/docker/services", requireAuth, async (_req, res) => {
    try {
      const services = await storage.getDockerServices();
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Docker services" });
    }
  });

  app.get("/api/openclaw/config", requireAuth, async (_req, res) => {
    try {
      const config = await storage.getOpenclawConfig();
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
      const parsed = openclawConfigUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.upsertOpenclawConfig(parsed.data);
      if (parsed.data.whatsappEnabled !== undefined) {
        await storage.updateDockerServiceStatus("whatsapp-bridge", parsed.data.whatsappEnabled ? "running" : "stopped");
        if (parsed.data.whatsappEnabled && !whatsappBot.isConnected()) {
          whatsappBot.start();
        } else if (!parsed.data.whatsappEnabled && (whatsappBot.isConnected() || whatsappBot.getStatus().state !== "disconnected")) {
          await whatsappBot.stop();
        }
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update OpenClaw config" });
    }
  });

  app.get("/api/status", async (_req, res) => {
    try {
      const vps = await storage.getVpsConnection();
      const docker = await storage.getDockerServices();
      const config = await storage.getOpenclawConfig();
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

  app.get("/api/nodes/pending", requireAuth, async (_req, res) => {
    try {
      const config = await storage.getOpenclawConfig();
      res.json({ pending: (config?.pendingNodes as any[]) ?? [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending nodes" });
    }
  });

  app.post("/api/nodes/approve", requireAuth, async (req, res) => {
    try {
      const { node_id } = req.body;
      const config = await storage.getOpenclawConfig();
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig({
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
      const updated = await storage.updateLlmApiKey(req.params.id, parsed.data);
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
      await storage.deleteLlmApiKey(req.params.id);
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
      const updated = await storage.updateIntegration(req.params.id, parsed.data);
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
      await storage.deleteIntegration(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  const isProductionRuntime = process.env.NODE_ENV === "production";

  app.get("/api/whatsapp/status", requireAuth, async (_req, res) => {
    try {
      if (isProductionRuntime) {
        const config = await storage.getOpenclawConfig();
        res.json({
          state: "external",
          qrDataUrl: null,
          phone: config?.whatsappPhone || null,
          error: null,
          runtime: "external",
          enabled: config?.whatsappEnabled ?? false,
        });
      } else {
        const status = whatsappBot.getStatus();
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
      const status = whatsappBot.getStatus();
      res.json({
        qrDataUrl: status.qrDataUrl,
        state: status.state,
        phone: status.phone,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp/start", requireAuth, async (_req, res) => {
    try {
      if (isProductionRuntime) {
        const config = await storage.getOpenclawConfig();
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig({ whatsappEnabled: true });
        }
        return res.json({ success: true, message: "WhatsApp enabled. Bot will start on your OpenClaw server." });
      }
      const config = await storage.getOpenclawConfig();
      if (!config?.whatsappEnabled) {
        await storage.upsertOpenclawConfig({ whatsappEnabled: true });
      }
      whatsappBot.start();
      res.json({ success: true, message: "WhatsApp bot starting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/stop", requireAuth, async (_req, res) => {
    try {
      if (isProductionRuntime) {
        await storage.upsertOpenclawConfig({ whatsappEnabled: false });
        return res.json({ success: true, message: "WhatsApp disabled. Bot will stop on your OpenClaw server." });
      }
      await whatsappBot.stop();
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
      await whatsappBot.restart();
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
      const session = await storage.approveWhatsappSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      try {
        await whatsappBot.sendApprovalNotification(session.phone);
      } catch {
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve session" });
    }
  });

  app.delete("/api/whatsapp/sessions/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWhatsappSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  return httpServer;
}
