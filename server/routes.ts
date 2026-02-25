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
  gatewayPassword: z.string().nullable().optional(),
  websocketUrl: z.string().nullable().optional(),
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
  dockerProject: z.string().optional(),
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
  if (req.session.userId) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      storage.getInstanceByApiKey(token).then(instance => {
        if (instance) {
          (req as any).apiTokenInstanceId = instance.id;
          return next();
        }
        return res.status(401).json({ error: "Invalid API token" });
      }).catch(() => {
        return res.status(401).json({ error: "Authentication failed" });
      });
      return;
    }
  }

  storage.getAllUsers().then(users => {
    if (users.length === 1) {
      req.session.userId = users[0].id;
      req.session.save(() => next());
    } else {
      return res.status(401).json({ error: "Not authenticated. Provide a session cookie or Bearer token (instance API key) in the Authorization header." });
    }
  }).catch(() => {
    return res.status(401).json({ error: "Authentication failed" });
  });
}

async function resolveInstanceId(req: Request): Promise<string | null> {
  const instanceId = (req.query.instanceId as string) || (req.body?.instanceId as string);
  if (instanceId) return instanceId;
  const tokenInstanceId = (req as any).apiTokenInstanceId;
  if (tokenInstanceId) return tokenInstanceId;
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
      try {
        const allUsers = await storage.getAllUsers();
        if (allUsers.length === 1) {
          req.session.userId = allUsers[0].id;
          await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
          console.log("Auto-authenticated single user:", allUsers[0].displayName);
          return res.json({ user: allUsers[0] });
        }
      } catch {}
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

  app.get("/api/whatsapp-pair", async (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html><head><title>WhatsApp Pairing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}
.qr{margin:20px;padding:20px;background:#fff;border-radius:16px}
.qr img{max-width:300px;display:block}
.status{margin:10px;padding:8px 16px;border-radius:8px;font-size:14px}
.connected{background:#22c55e;color:#fff}
.waiting{background:#f59e0b;color:#000}
.error{background:#ef4444;color:#fff}
.code{font-size:48px;font-family:monospace;letter-spacing:8px;margin:20px;padding:20px;background:#1e293b;border-radius:12px;user-select:all}
h1{margin-bottom:0}p{color:#999;margin-top:8px}
input{padding:10px 16px;background:#222;border:1px solid #444;border-radius:8px;color:#fff;font-size:16px;width:200px;margin:4px}
button{margin:8px;padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px}
button:hover{background:#2563eb}
.btn-outline{background:transparent;border:1px solid #3b82f6}
.btn-outline:hover{background:#1e3a5f}
.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:16px}
.phone-form{display:flex;gap:8px;align-items:center;margin:16px}
</style></head>
<body><h1>OpenClaw WhatsApp</h1><p>Connect WhatsApp to your OpenClaw AI bot</p>
<div id="content"><p>Loading...</p></div>
<div class="actions">
<button onclick="restart()">Restart Bot (QR)</button>
<button class="btn-outline" onclick="showPhoneForm()">Link with Phone Number</button>
</div>
<div id="phone-form" style="display:none">
<p style="color:#ccc;font-size:14px">Enter phone number in international format (without +)</p>
<div class="phone-form">
<input id="phone" placeholder="48123456789" />
<button onclick="requestPairing()">Get Code</button>
</div>
</div>
<script>
function showPhoneForm(){document.getElementById('phone-form').style.display='block'}
async function requestPairing(){
  var ph=document.getElementById('phone').value.trim();
  if(!ph){alert('Enter a phone number');return}
  try{var r=await fetch('/api/whatsapp/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:ph})});
  if(!r.ok){var d=await r.json();alert(d.error||'Failed');return}
  document.getElementById('phone-form').style.display='none';
  document.getElementById('content').innerHTML='<div class="status waiting">Requesting pairing code...</div>';
  setTimeout(poll,2000)}catch(e){alert('Failed to request pairing code')}
}
async function poll(){try{const r=await fetch('/api/whatsapp/qr');const d=await r.json();const el=document.getElementById('content');
if(d.state==='connected'){el.innerHTML='<div class="status connected">Connected as +'+d.phone+'</div>';return}
if(d.state==='pairing_code_ready'&&d.pairingCode){el.innerHTML='<p style="color:#ccc">Enter this code in WhatsApp</p><div class="code">'+d.pairingCode+'</div><p style="color:#999;font-size:13px">WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number</p>';setTimeout(poll,5000);return}
if(d.state==='qr_ready'&&d.qrDataUrl){el.innerHTML='<div class="qr"><img src="'+d.qrDataUrl+'" alt="QR"></div><div class="status waiting">Waiting for scan...</div>'}
else{el.innerHTML='<div class="status waiting">'+d.state+'</div>'}}catch(e){document.getElementById('content').innerHTML='<div class="status error">Error loading</div>'}
setTimeout(poll,3000)}poll();
async function restart(){try{await fetch('/api/whatsapp/restart',{method:'POST'});document.getElementById('content').innerHTML='<p>Restarting...</p>';setTimeout(poll,5000)}catch(e){alert('Failed')}}
</script></body></html>`);
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
      const dataWithKey = { ...parsed.data, apiKey: randomBytes(32).toString("hex") };
      const instance = await storage.createInstance(dataWithKey);
      res.status(201).json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create instance" });
    }
  });

  app.patch("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const { regenerateApiKey, ...rest } = req.body;
      const updateData: any = {};

      if (Object.keys(rest).length > 0) {
        const updateSchema = insertInstanceSchema.partial();
        const parsed = updateSchema.safeParse(rest);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.message });
        }
        Object.assign(updateData, parsed.data);
      }

      if (regenerateApiKey) {
        updateData.apiKey = randomBytes(32).toString("hex");
      }

      const updated = await storage.updateInstance(req.params.id as string, updateData);
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

  // Gateway proxy: test if gateway is reachable
  app.get("/api/gateway/probe", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.json({ reachable: false, error: "No server URL configured for this instance" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;

      const serverUrl = instance.serverUrl;
      let parsedUrl: URL;
      try { parsedUrl = new URL(serverUrl); } catch { return res.json({ reachable: false, error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);

      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];
      const httpEndpoints = ["/__openclaw__/canvas/", "/api/health", "/"];

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      for (const proto of protocols) {
        const baseOrigin = `${proto}//${host}:${port}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        for (const endpoint of httpEndpoints) {
          try {
            const url = new URL(endpoint, baseOrigin);
            const resp = await fetch(url.toString(), { signal: controller.signal, headers });
            if (resp.ok || resp.status < 500) {
              clearTimeout(timeout);
              return res.json({ reachable: true, status: resp.status, serverUrl: `${proto}//${host}:${port}`, endpoint });
            }
          } catch {}
        }
        clearTimeout(timeout);
      }

      const net = await import("net");
      const tcpReachable = await new Promise<boolean>((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(5000);
        sock.on("connect", () => { sock.destroy(); resolve(true); });
        sock.on("error", () => { sock.destroy(); resolve(false); });
        sock.on("timeout", () => { sock.destroy(); resolve(false); });
        sock.connect(port, host);
      });

      if (tcpReachable) {
        return res.json({ reachable: true, status: 0, serverUrl: instance.serverUrl, endpoint: `tcp://${host}:${port}` });
      }

      return res.json({ reachable: false, error: `Gateway not responding on ${host}:${port}. Check that port ${port} is open in the VPS firewall.` });
    } catch (error) {
      res.status(500).json({ error: "Failed to probe gateway" });
    }
  });

  app.get("/api/gateway/probe-ssh", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ reachable: false, error: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) return res.json({ reachable: false, error: "No VPS configured", method: "ssh" });

      const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);
      const result = await executeSSHCommand("status", sshConfig);
      const output = result.output || "";
      const isRunning = output.includes("openclaw") || output.includes("18789");
      res.json({
        reachable: isRunning,
        method: "ssh",
        host: vps.vpsIp,
        output: output.substring(0, 500),
        error: isRunning ? undefined : "Gateway process not detected via SSH",
      });
    } catch (error: any) {
      res.json({ reachable: false, method: "ssh", error: error.message || "SSH probe failed" });
    }
  });

  app.get("/api/gateway/sync-config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) return res.status(400).json({ error: "No VPS configured" });

      const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);
      const result = await executeSSHCommand("read-gateway-json", sshConfig);
      const output = (result.output || "").trim();
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) return res.status(500).json({ error: parsed.error });
        const instance = await storage.getInstance(instanceId);
        const hostname = (() => {
          try { return new URL(instance?.serverUrl || "").hostname; } catch { return vps.vpsIp; }
        })();
        res.json({
          gatewayPort: parsed.port || 18789,
          gatewayBind: parsed.bind || "lan",
          gatewayToken: parsed.token || "",
          gatewayPassword: parsed.password || "",
          websocketUrl: `ws://${hostname}:${parsed.port || 18789}`,
        });
      } catch {
        res.status(500).json({ error: "Could not parse gateway config from VPS", raw: output.substring(0, 500) });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to sync config from VPS" });
    }
  });

  // Gateway proxy: proxy the native OpenClaw canvas UI (browser can't add Auth headers to window.open)
  app.get("/api/gateway/canvas", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;

      let parsedUrl: URL;
      try { parsedUrl = new URL(instance.serverUrl); } catch { return res.status(400).json({ error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);

      const rawPath = req.query.path?.toString() || "/__openclaw__/canvas/";
      const canvasPath = rawPath.startsWith("/") ? rawPath : "/__openclaw__/canvas/";

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];
      let resp: globalThis.Response | null = null;
      let workingProto = protocols[0];

      for (const proto of protocols) {
        const canvasUrl = `${proto}//${host}:${port}${canvasPath}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          resp = await fetch(canvasUrl, { headers, signal: controller.signal });
          clearTimeout(timeout);
          workingProto = proto;
          break;
        } catch {
          clearTimeout(timeout);
        }
      }

      if (!resp) {
        res.setHeader("Content-Type", "text/html");
        return res.status(502).send(`<!DOCTYPE html><html><head><title>Gateway Unreachable</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#ccc}
.box{text-align:center;max-width:480px;padding:2rem;border:1px solid #333;border-radius:12px;background:#1a1a1a}
h1{color:#ef4444;font-size:1.5rem}p{color:#999;line-height:1.6}
.btn{display:inline-block;margin-top:1rem;padding:.5rem 1.5rem;background:#333;color:#ccc;border:none;border-radius:6px;cursor:pointer;text-decoration:none}</style></head><body><div class="box">
<h1>Gateway Unreachable</h1>
<p>Could not connect to the OpenClaw gateway on this VPS. The server may be down or port 18789 may be blocked by a firewall.</p>
<p style="font-size:.85rem">Try using the <strong>SSH Remote Control</strong> buttons (Check Status, Diagnose, Open Port) in the dashboard to troubleshoot.</p>
<a class="btn" href="javascript:window.close()">Close</a></div></body></html>`);
      }

      const contentType = resp.headers.get("content-type") || "text/html";
      res.setHeader("Content-Type", contentType);
      res.status(resp.status);

      if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("javascript") && !contentType.includes("xml") && !contentType.includes("svg")) {
        const arrayBuf = await resp.arrayBuffer();
        return res.send(Buffer.from(arrayBuf));
      }

      const body = await resp.text();

      const proxyBase = `/api/gateway/canvas?instanceId=${instanceId}&path=`;

      let rewritten = body
        .replace(/\s+crossorigin\b/gi, '')
        .replace(/(href|src|action)="\/(?!\/)/g, `$1="${proxyBase}/`)
        .replace(/(href|src|action)="\.\/([^"]*)/g, (_m: string, attr: string, rest: string) => {
          const pathDir2 = canvasPath.endsWith("/") ? canvasPath : canvasPath.substring(0, canvasPath.lastIndexOf("/") + 1);
          return `${attr}="${proxyBase}${pathDir2}${rest}`;
        })
        .replace(/url\(["']?\/(?!\/)/g, `url("${proxyBase}/`)
        .replace(/url\(["']?\.\//g, () => {
          const pathDir2 = canvasPath.endsWith("/") ? canvasPath : canvasPath.substring(0, canvasPath.lastIndexOf("/") + 1);
          return `url("${proxyBase}${pathDir2}`;
        });

      if (contentType.includes("javascript") || contentType.includes("css")) {
        const baseUrl = `${workingProto}//${host}:${port}`;
        rewritten = rewritten.replace(new RegExp(baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/[^"\'\\s]*)', 'g'), (_m: string, p: string) => `${proxyBase}${p}`);
      }

      if (contentType.includes("html") && canvasPath === "/") {
        const infoScript = `<script>
(function(){
  var banner=document.createElement('div');
  banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#1e293b,#334155);color:#e2e8f0;padding:6px 16px;font:12px system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #475569';
  banner.innerHTML='<span>Read-only preview &mdash; proxied from your VPS. For full interactive access, use the SSH tunnel command from your dashboard settings.</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 4px">&times;</button>';
  document.addEventListener('DOMContentLoaded',function(){document.body.prepend(banner)});
})();
</script>`;
        rewritten = rewritten.replace(/<head>/i, `<head>${infoScript}`);
      }

      res.send(rewritten);
    } catch (error) {
      res.status(502).json({ error: "Failed to load OpenClaw canvas" });
    }
  });

  // Gateway proxy: restart the gateway service
  app.post("/api/gateway/restart", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured for this instance" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;
      if (!token) return res.status(400).json({ error: "No gateway token configured. Set it in OpenClaw Config or set an API key on the instance." });

      let parsedUrl: URL;
      try { parsedUrl = new URL(instance.serverUrl); } catch { return res.status(400).json({ error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);
      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];

      const restartEndpoints = ["/api/restart", "/api/v1/restart", "/api/gateway/restart", "/restart"];

      let lastStatus = 0;
      let lastError = "";
      for (const proto of protocols) {
        const baseOrigin = `${proto}//${host}:${port}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        for (const endpoint of restartEndpoints) {
          try {
            const url = new URL(endpoint, baseOrigin);
            const resp = await fetch(url.toString(), {
              method: "POST",
              signal: controller.signal,
              headers: { "Authorization": `Bearer ${token}` },
            });
            lastStatus = resp.status;
            if (resp.ok) {
              clearTimeout(timeout);
              let body: any = {};
              try { body = await resp.json(); } catch {}
              return res.json({ success: true, status: resp.status, endpoint, message: body.message || "Gateway restart signal sent", serverUrl: `${proto}//${host}:${port}` });
            }
            if (resp.status === 401 || resp.status === 403) {
              lastError = `Authentication failed (${resp.status}). Check your gateway token.`;
            }
          } catch {}
        }
        clearTimeout(timeout);
      }

      if (lastError) {
        return res.status(403).json({ error: lastError, status: lastStatus });
      }

      try {
        for (const proto of protocols) {
          const healthUrl = `${proto}//${host}:${port}/api/health`;
          const healthController = new AbortController();
          const healthTimeout = setTimeout(() => healthController.abort(), 5000);
          try {
            const healthResp = await fetch(healthUrl, {
              signal: healthController.signal,
              headers: { "Authorization": `Bearer ${token}` },
            });
            clearTimeout(healthTimeout);
            if (healthResp.ok) {
              return res.json({
                success: false,
                reachable: true,
                error: "Gateway is reachable but no restart API endpoint was found. You may need to restart the Docker container manually using: docker compose -p PROJECT restart",
              });
            }
          } catch { clearTimeout(healthTimeout); }
        }
      } catch {}

      return res.status(502).json({
        error: "Could not reach the gateway server. Check that the server URL is correct and the gateway is running.",
        tried: restartEndpoints,
        lastStatus: lastStatus || undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to restart gateway: " + (error.message || "Unknown error") });
    }
  });

  // Gateway proxy: sync nodes from native dashboard
  app.post("/api/gateway/sync", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured. Set it in Instance settings." });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;
      if (!token) return res.status(400).json({ error: "No gateway token configured. Set it in OpenClaw Config or set an API key on the instance." });

      // Try known gateway API endpoints for fetching sessions/nodes
      const endpoints = ["/api/sessions", "/api/nodes", "/api/v1/sessions", "/api/v1/nodes"];
      let gatewayNodes: any[] = [];
      let successEndpoint = "";

      for (const ep of endpoints) {
        try {
          const url = new URL(ep, instance.serverUrl);
          url.searchParams.set("token", token);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(url.toString(), { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) {
            const data = await resp.json();
            // Handle both array and object { sessions: [...] } or { nodes: [...] } responses
            if (Array.isArray(data)) {
              gatewayNodes = data;
            } else if (data.sessions) {
              gatewayNodes = Array.isArray(data.sessions) ? data.sessions : [];
            } else if (data.nodes) {
              gatewayNodes = Array.isArray(data.nodes) ? data.nodes : [];
            } else if (data.peers) {
              gatewayNodes = Array.isArray(data.peers) ? data.peers : [];
            } else if (data.data && Array.isArray(data.data)) {
              gatewayNodes = data.data;
            }
            successEndpoint = ep;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!successEndpoint) {
        return res.status(502).json({
          error: "Could not reach the gateway server. This usually means the server is behind a firewall or only accessible via Tailscale/VPN. You can add nodes manually instead using the Add Node button.",
          tried: endpoints,
        });
      }

      // Sync gateway nodes into our machines table
      const existingMachines = await storage.getMachines();
      let created = 0;
      let updated = 0;

      for (const gNode of gatewayNodes) {
        const nodeName = gNode.name || gNode.displayName || gNode.hostname || gNode.id || "Unknown Node";
        const nodeId = gNode.id || gNode.nodeId || gNode.peer_id || "";
        const status = (gNode.connected || gNode.status === "connected" || gNode.online) ? "connected" : "disconnected";
        const hostname = gNode.hostname || gNode.host || "";
        const ipAddress = gNode.ip || gNode.ipAddress || gNode.address || "";
        const os = gNode.os || gNode.platform || "";
        const capabilities = Array.isArray(gNode.capabilities) ? gNode.capabilities.join(", ") : (gNode.capabilities || "");

        // Match by hostname or name
        const existing = existingMachines.find(
          (m) => (m.hostname && m.hostname === hostname) || (m.name && m.name === nodeName) || (m.displayName && m.displayName === nodeName)
        );

        if (existing) {
          await storage.updateMachine(existing.id, {
            status,
            ...(hostname && { hostname }),
            ...(ipAddress && { ipAddress }),
            ...(os && { os }),
            ...(capabilities && { location: capabilities }),
          });
          updated++;
        } else {
          await storage.createMachine({
            name: nodeName,
            displayName: nodeName,
            hostname,
            ipAddress,
            os,
            status,
            location: capabilities || undefined,
          });
          created++;
        }
      }

      res.json({
        success: true,
        endpoint: successEndpoint,
        total: gatewayNodes.length,
        created,
        updated,
        nodes: gatewayNodes.map((n: any) => ({
          name: n.name || n.displayName || n.hostname || n.id,
          status: (n.connected || n.status === "connected" || n.online) ? "connected" : "disconnected",
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to sync from gateway: " + (error.message || "Unknown error") });
    }
  });

  app.post("/api/machines/:id/health-check", requireAuth, async (req, res) => {
    try {
      const machine = await storage.getMachine(req.params.id as string);
      if (!machine) return res.status(404).json({ error: "Node not found" });

      const instanceId = await resolveInstanceId(req);
      const results: { method: string; reachable: boolean; latencyMs?: number; error?: string }[] = [];

      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps?.vpsIp) {
          try {
            const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
            const sshConfig = buildSSHConfigFromVps(vps);
            const start = Date.now();
            const pairedResult = await executeSSHCommand("list-paired-nodes", sshConfig);
            const latency = Date.now() - start;

            if (pairedResult.success && pairedResult.output) {
              try {
                let parsed = JSON.parse(pairedResult.output.trim());
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
                if (Array.isArray(parsed)) {
                  const mIdentifiers = [machine.hostname, machine.name, machine.displayName].filter(Boolean).map((s: string) => s.toLowerCase());
                  const match = parsed.find((n: any) => {
                    const nIds = [n.displayName, n.hostname, n.name, n.clientId, n.id].filter(Boolean).map((s: string) => s.toLowerCase());
                    return mIdentifiers.some((mid) => nIds.includes(mid));
                  });

                  if (match) {
                    results.push({ method: "gateway-ssh", reachable: true, latencyMs: latency });
                    await storage.updateMachine(machine.id, { status: "connected", lastSeen: new Date() });
                    return res.json({ nodeId: machine.id, status: "connected", lastChecked: new Date().toISOString(), results });
                  } else {
                    results.push({ method: "gateway-ssh", reachable: false, error: "Node not found in gateway paired list" });
                  }
                }
              } catch {}
            }
          } catch {}
        }

        const instance = await storage.getInstance(instanceId);
        const config = await storage.getOpenclawConfig(instanceId);
        const token = config?.gatewayToken || instance?.apiKey;
        if (instance?.serverUrl && token) {
          const endpoints = ["/api/sessions", "/api/nodes", "/api/v1/sessions", "/api/v1/nodes"];
          for (const ep of endpoints) {
            try {
              const url = new URL(ep, instance.serverUrl);
              url.searchParams.set("token", token);
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const start = Date.now();
              const resp = await fetch(url.toString(), { signal: controller.signal });
              clearTimeout(timeout);
              if (resp.ok) {
                const data = await resp.json();
                const nodes = Array.isArray(data) ? data :
                  data.sessions || data.nodes || data.peers || data.data || [];
                const allNodes = Array.isArray(nodes) ? nodes : [];
                const match = allNodes.find((n: any) =>
                  (machine.hostname && (n.hostname === machine.hostname || n.host === machine.hostname)) ||
                  (machine.name && (n.name === machine.name || n.displayName === machine.name)) ||
                  (machine.displayName && (n.displayName === machine.displayName || n.name === machine.displayName)) ||
                  (machine.ipAddress && (n.ip === machine.ipAddress || n.ipAddress === machine.ipAddress || n.address === machine.ipAddress))
                );
                if (match) {
                  const isOnline = match.connected || match.status === "connected" || match.online;
                  const latency = Date.now() - start;
                  results.push({
                    method: "gateway",
                    reachable: !!isOnline,
                    latencyMs: latency,
                  });
                  const newStatus = isOnline ? "connected" : "disconnected";
                  await storage.updateMachine(machine.id, { status: newStatus, lastSeen: isOnline ? new Date() : (machine.lastSeen ?? undefined) });
                  return res.json({
                    nodeId: machine.id,
                    status: newStatus,
                    lastChecked: new Date().toISOString(),
                    results,
                  });
                }
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      if (machine.ipAddress) {
        try {
          const { Socket } = await import("net");
          const ports = [22, 80, 443, 18789];
          let tcpReachable = false;
          let tcpLatency = 0;
          for (const port of ports) {
            try {
              const start = Date.now();
              await new Promise<void>((resolve, reject) => {
                const socket = new Socket();
                socket.setTimeout(3000);
                socket.on("connect", () => { socket.destroy(); resolve(); });
                socket.on("error", reject);
                socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
                socket.connect(port, machine.ipAddress!);
              });
              tcpReachable = true;
              tcpLatency = Date.now() - start;
              break;
            } catch {
              continue;
            }
          }
          results.push({
            method: "tcp",
            reachable: tcpReachable,
            latencyMs: tcpReachable ? tcpLatency : undefined,
            error: tcpReachable ? undefined : "No open ports found on common ports (22, 80, 443, 18789)",
          });
          if (tcpReachable) {
            await storage.updateMachine(machine.id, { status: "connected", lastSeen: new Date() });
          }
        } catch (err) {
          results.push({ method: "tcp", reachable: false, error: String(err) });
        }
      }

      const isReachable = results.some(r => r.reachable);
      const newStatus = isReachable ? "connected" : (results.length > 0 ? "disconnected" : machine.status);
      if (results.length > 0) {
        await storage.updateMachine(machine.id, {
          status: newStatus,
          ...(isReachable ? { lastSeen: new Date() } : {}),
        });
      }

      res.json({
        nodeId: machine.id,
        status: newStatus,
        lastChecked: new Date().toISOString(),
        results,
        noChecksPossible: results.length === 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Health check failed: " + (error.message || "Unknown error") });
    }
  });

  app.get("/api/openclaw/deploy-commands", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });

      const config = await storage.getOpenclawConfig(instanceId);
      const instance = await storage.getInstance(instanceId);
      const vps = await storage.getVpsConnection(instanceId);
      const llmKeys = await storage.getLlmApiKeys();
      const activeKey = llmKeys.find(k => k.active);

      const gatewayPort = config?.gatewayPort ?? 18789;
      const gatewayBind = config?.gatewayBind ?? "127.0.0.1";
      const gatewayMode = config?.gatewayMode ?? "local";
      const gatewayToken = config?.gatewayToken ?? "";
      const defaultLlm = config?.defaultLlm ?? "deepseek/deepseek-chat";
      const sshUser = vps?.sshUser ?? "root";
      const sshHost = vps?.vpsIp ?? instance?.serverUrl?.replace(/^https?:\/\//, "").replace(/:\d+$/, "") ?? "";
      const sshPort = vps?.vpsPort ?? 22;

      const modelPrefix = defaultLlm.split("/")[0] || "openrouter";
      const knownProviders = ["openrouter", "anthropic", "openai", "deepseek", "google", "mistral", "cohere"];
      const provider = knownProviders.includes(modelPrefix) ? modelPrefix : "openrouter";
      const apiKeyPlaceholder = "YOUR_API_KEY";
      const hasRealKey = !!activeKey?.apiKey;

      const onboardCmd = `openclaw onboard --non-interactive --accept-risk --mode ${gatewayMode} --auth-choice apiKey --${provider}-api-key "${apiKeyPlaceholder}" --gateway-port ${gatewayPort} --gateway-bind ${gatewayBind === "127.0.0.1" ? "loopback" : gatewayBind}`;

      const shellExportVar = provider === "openrouter" ? "OPENROUTER_API_KEY" :
                             provider === "anthropic" ? "ANTHROPIC_API_KEY" :
                             provider === "openai" ? "OPENAI_API_KEY" :
                             provider === "deepseek" ? "DEEPSEEK_API_KEY" :
                             `${provider.toUpperCase()}_API_KEY`;

      const shellExport = `export ${shellExportVar}="${apiKeyPlaceholder}"`;

      const sshPrefix = sshHost ? `ssh ${sshPort !== 22 ? `-p ${sshPort} ` : ""}${sshUser}@${sshHost}` : "";

      const doctorFix = {
        step1_doctor: {
          title: "1. Run the Doctor",
          description: "Checks your OpenClaw config, diagnoses issues, and auto-fixes them. Run on your VPS.",
          command: "openclaw doctor",
          ssh: sshPrefix ? `${sshPrefix} "openclaw doctor"` : null,
        },
        step2_restart: {
          title: "2. Restart the Gateway",
          description: "Apply fixes by restarting the gateway service.",
          command: "openclaw gateway restart",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway restart"` : null,
        },
        step3_verify: {
          title: "3. Verify It's Working",
          description: "Check gateway status to confirm everything is running.",
          command: "openclaw gateway probe",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway probe"` : null,
        },
      };

      const manualFix = {
        step1_check: {
          title: "1. Check Provider Status",
          description: "Verify that your LLM provider is registered.",
          command: "openclaw models status --json",
          ssh: sshPrefix ? `${sshPrefix} "openclaw models status --json"` : null,
        },
        step2_onboard: {
          title: "2. Register Provider (Non-Interactive)",
          description: "Force-register the provider and bind your API key in ~/.openclaw/openclaw.json",
          command: onboardCmd,
          ssh: sshPrefix ? `${sshPrefix} '${onboardCmd}'` : null,
        },
        step3_persist: {
          title: "3. Set API Key Environment Variable",
          description: "Export your API key so OpenClaw can access it.",
          command: `export ${shellExportVar}="${apiKeyPlaceholder}"`,
          ssh: sshPrefix ? `${sshPrefix} "export ${shellExportVar}=${apiKeyPlaceholder}"` : null,
        },
        step4_restart: {
          title: "4. Restart Gateway",
          description: "Restart the gateway service to apply changes.",
          command: "openclaw gateway restart",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway restart"` : null,
        },
        step5_verify: {
          title: "5. Verify Connection",
          description: "Confirm the gateway is running and the model is loaded.",
          command: "openclaw gateway probe && openclaw models status --json",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway probe && openclaw models status --json"` : null,
        },
      };

      res.json({
        doctorFix,
        manualFix,
        hasRealKey,
        config: {
          provider,
          model: defaultLlm,
          gatewayPort,
          gatewayBind,
          gatewayMode,
          gatewayToken: gatewayToken ? "configured" : "not set",
          sshHost,
          sshUser,
          sshPort,
          envVar: shellExportVar,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate deploy commands" });
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

      let vpsPushResult: { success: boolean; error?: string } | null = null;
      try {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const updates: Record<string, any> = {};
          if (parsed.data.gatewayPort !== undefined) updates.port = parsed.data.gatewayPort;
          if (parsed.data.gatewayBind !== undefined) updates.bind = parsed.data.gatewayBind;
          if (parsed.data.gatewayToken !== undefined) updates["auth.token"] = parsed.data.gatewayToken;
          if (parsed.data.gatewayPassword !== undefined) updates["auth.password"] = parsed.data.gatewayPassword;
          if (parsed.data.defaultLlm !== undefined) updates.defaultModel = parsed.data.defaultLlm;
          if (parsed.data.fallbackLlm !== undefined) updates.fallbackModel = parsed.data.fallbackLlm;

          if (Object.keys(updates).length > 0) {
            const pyUpdates = JSON.stringify(updates).replace(/'/g, "\\'");
            const pushCmd = `python3 -c "
import json, os
f='/root/.openclaw/openclaw.json'
if not os.path.exists(f):
    print(json.dumps({'error':'Config file not found'}))
    exit(0)
d=json.load(open(f))
gw=d.setdefault('gateway',{})
updates=${pyUpdates}
for k,v in updates.items():
    parts=k.split('.')
    target=gw
    for p in parts[:-1]:
        target=target.setdefault(p,{})
    target[parts[-1]]=v
json.dump(d,open(f,'w'),indent=2)
print(json.dumps({'success':True,'updated':list(updates.keys())}))
"`;
            const result = await executeRawSSHCommand(pushCmd, sshConfig);
            if (result.success) {
              try {
                const parsed = JSON.parse(result.output.trim());
                vpsPushResult = parsed;
              } catch {
                vpsPushResult = { success: true };
              }
            } else {
              vpsPushResult = { success: false, error: result.error || result.output };
            }
          }
        }
      } catch (e: any) {
        vpsPushResult = { success: false, error: e.message };
      }

      res.json({ ...config, vpsPushResult });
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
      if (!instanceId) return res.json({ pending: [], source: "none" });

      const vps = instanceId ? await storage.getVpsConnection(instanceId) : null;
      if (vps?.vpsIp) {
        try {
          const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          const cliResult = await executeSSHCommand("cli-devices-list", sshConfig);
          if (cliResult.success && cliResult.output) {
            try {
              const cliParsed = JSON.parse(cliResult.output.trim());
              if (!cliParsed.error) {
                const devices = Array.isArray(cliParsed) ? cliParsed : (cliParsed.devices || cliParsed.data || Object.values(cliParsed));
                const pendingDevices = (devices as any[]).filter((d: any) => d.status === "pending" || d.state === "pending");
                const normalized = pendingDevices.map((d: any, idx: number) => ({
                  id: d.requestId || d.id || d.deviceId || `device-${idx}`,
                  hostname: d.name || d.hostname || d.displayName || d.requestId || `device-${idx}`,
                  name: d.name || d.hostname || d.displayName,
                  ip: d.ip || d.address || "Unknown",
                  os: d.os || d.platform || "Unknown",
                  role: d.role || "node",
                  age: d.age || "",
                  status: "pending",
                }));
                await storage.upsertOpenclawConfig(instanceId, { pendingNodes: normalized });
                return res.json({ pending: normalized, source: "cli" });
              }
            } catch {}
          }

          const result = await executeSSHCommand("list-pending-nodes", sshConfig);
          if (result.success && result.output) {
            try {
              let parsed = JSON.parse(result.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                parsed = Object.values(parsed);
              }
              if (Array.isArray(parsed) && parsed.length > 0) {
                const normalized = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n, ip: "Unknown", os: "Unknown", location: "Unknown", status: "pending" };
                  return {
                    id: n.requestId || n.id || n.deviceId || `device-${idx}`,
                    hostname: n.displayName || n.name || n.hostname || n.clientId || `device-${idx}`,
                    name: n.displayName || n.name || n.hostname || n.clientId,
                    ip: n.remoteIp || n.ip || n.address || "Unknown",
                    os: n.platform || n.os || "Unknown",
                    role: n.role || "node",
                    clientMode: n.clientMode || "node",
                    requestId: n.requestId,
                    deviceId: n.deviceId,
                    status: "pending",
                  };
                });
                await storage.upsertOpenclawConfig(instanceId, { pendingNodes: normalized });
                return res.json({ pending: normalized, source: "gateway" });
              }
            } catch {}
          }
        } catch {}
      }

      const config = await storage.getOpenclawConfig(instanceId);
      const localPending = ((config?.pendingNodes as any[]) ?? []).map((n: any, idx: number) => {
        if (typeof n === "string") return { id: n, hostname: n };
        const entry = { ...n };
        if (!entry.id) entry.id = entry.hostname || entry.name || `node-${idx}`;
        return entry;
      });
      res.json({ pending: localPending, source: "local" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending nodes" });
    }
  });

  app.post("/api/nodes/approve", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let sshApproved = false;
      let approvedNode: any = null;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildCliApproveCommand, buildApproveNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          try {
            const cliCmd = buildCliApproveCommand(node_id);
            console.log(`[nodes] CLI approve command: openclaw devices approve ${node_id}`);
            const cliResult = await executeRawSSHCommand(cliCmd, sshConfig);
            console.log(`[nodes] CLI approve result: success=${cliResult.success}, output=${cliResult.output?.substring(0, 200)}, error=${cliResult.error}`);
            if (cliResult.success && cliResult.output) {
              const trimmed = cliResult.output.trim();
              const jsonStart = trimmed.indexOf("{");
              const jsonStr = jsonStart >= 0 ? trimmed.substring(jsonStart) : trimmed;
              try {
                const cliParsed = JSON.parse(jsonStr);
                if (cliParsed.success || cliParsed.approved || cliParsed.device || !cliParsed.error) {
                  sshApproved = true;
                  approvedNode = cliParsed.device || cliParsed.node || cliParsed;
                }
              } catch (parseErr) {
                console.log(`[nodes] CLI output not JSON: ${trimmed.substring(0, 100)}`);
                if (trimmed.includes("approved") || trimmed.includes("Approved") || trimmed.includes("✓")) {
                  sshApproved = true;
                }
              }
            }
          } catch (cliErr: any) {
            console.log(`[nodes] CLI approve error: ${cliErr.message}`);
          }

          if (!sshApproved) {
            console.log(`[nodes] CLI failed, trying direct file approve for ${node_id}`);
            const cmd = buildApproveNodeCommand(node_id);
            const result = await executeRawSSHCommand(cmd, sshConfig);
            console.log(`[nodes] File approve result: success=${result.success}, output=${result.output?.substring(0, 200)}`);
            if (result.success && result.output) {
              try {
                const parsed = JSON.parse(result.output.trim());
                if (parsed.success) {
                  sshApproved = true;
                  approvedNode = parsed.node;
                } else if (parsed.error) {
                  console.log(`[nodes] File approve returned: ${parsed.error}`);
                }
              } catch {}
            }
          }
        } catch (sshErr: any) {
          console.log(`[nodes] SSH approve failed: ${sshErr.message}`);
        }
      }

      let localFound = false;
      const config = await storage.getOpenclawConfig(instanceId);
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          localFound = true;
          if (!approvedNode) approvedNode = pending[idx];
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig(instanceId, {
            pendingNodes: pending,
            nodesApproved: (config.nodesApproved ?? 0) + 1,
          });
        }
      }

      if (!sshApproved && !localFound) {
        return res.status(404).json({ error: "Node not found in pending list" });
      }

      if ((sshApproved || localFound) && approvedNode && typeof approvedNode === "object") {
        const nodeName = approvedNode.hostname || approvedNode.name || approvedNode.id || node_id;
        try {
          await storage.createMachine({
            name: nodeName,
            hostname: approvedNode.hostname || nodeName,
            ipAddress: approvedNode.ip || approvedNode.ipAddress || null,
            os: approvedNode.os || null,
            location: approvedNode.location || null,
            status: "connected",
            displayName: approvedNode.displayName || nodeName,
          });
        } catch {}
      }

      res.json({ success: true, sshApproved, node: approvedNode });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve node" });
    }
  });

  app.post("/api/nodes/reject", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let sshRejected = false;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildCliRejectCommand, buildRejectNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          try {
            const cliCmd = buildCliRejectCommand(node_id);
            const cliResult = await executeRawSSHCommand(cliCmd, sshConfig);
            if (cliResult.success && cliResult.output) {
              try {
                const cliParsed = JSON.parse(cliResult.output.trim());
                if (cliParsed.success || cliParsed.rejected || !cliParsed.error) {
                  sshRejected = true;
                }
              } catch {}
            }
          } catch {}

          if (!sshRejected) {
            const cmd = buildRejectNodeCommand(node_id);
            const result = await executeRawSSHCommand(cmd, sshConfig);
            if (result.success && result.output) {
              try {
                const parsed = JSON.parse(result.output.trim());
                if (parsed.success) sshRejected = true;
              } catch {}
            }
          }
        } catch {}
      }

      const config = await storage.getOpenclawConfig(instanceId);
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig(instanceId, { pendingNodes: pending });
        }
      }

      res.json({ success: true, sshRejected });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject node" });
    }
  });

  app.post("/api/nodes/remove", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let removed = false;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildRemoveDeviceCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const cmd = buildRemoveDeviceCommand(node_id);
          console.log(`[nodes] Removing device: ${node_id}`);
          const result = await executeRawSSHCommand(cmd, sshConfig);
          console.log(`[nodes] Remove result: success=${result.success}, output=${result.output?.substring(0, 300)}`);
          if (result.success && result.output) {
            try {
              const parsed = JSON.parse(result.output.trim());
              if (parsed.success) removed = true;
            } catch {}
          }
        } catch (e: any) {
          console.error(`[nodes] Remove error:`, e.message);
        }
      }

      res.json({ success: true, removed });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove device" });
    }
  });

  app.get("/api/nodes/paired", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ paired: [], source: "none" });

      const vps = instanceId ? await storage.getVpsConnection(instanceId) : null;
      if (vps?.vpsIp) {
        try {
          const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const result = await executeSSHCommand("list-paired-nodes", sshConfig);
          if (result.success && result.output) {
            try {
              let parsed = JSON.parse(result.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                parsed = Object.values(parsed);
              }
              if (Array.isArray(parsed)) {
                const normalized = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n, ip: "Unknown", os: "Unknown" };
                  const entry = { ...n };
                  if (!entry.id) entry.id = entry.hostname || entry.name || `node-${idx}`;
                  return entry;
                });
                return res.json({ paired: normalized, source: "gateway" });
              }
            } catch {}
          }
        } catch {}
      }

      res.json({ paired: [], source: "local" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch paired nodes" });
    }
  });

  app.get("/api/nodes/live-status", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ gateway: "unknown", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: "No instance" });

      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.json({ gateway: "unknown", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: "No VPS configured" });

      const config = await storage.getOpenclawConfig(instanceId);
      const gatewayPort = config?.gatewayPort || 18789;

      const { executeSSHCommand, executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      let nodes: any[] = [];
      let devices: any[] = [];
      let gatewayRunning = false;
      let usedCli = false;

      try {
        const nodesResult = await executeSSHCommand("cli-nodes-status", sshConfig);
        if (nodesResult.success && nodesResult.output) {
          try {
            const parsed = JSON.parse(nodesResult.output.trim());
            if (!parsed.error) {
              const rawNodes = Array.isArray(parsed) ? parsed : (parsed.nodes || parsed.data || Object.values(parsed));
              nodes = (rawNodes as any[]).map((n: any, idx: number) => ({
                name: n.name || n.displayName || n.hostname || `node-${idx}`,
                id: n.id || n.nodeId || n.deviceId || `node-${idx}`,
                ip: n.ip || n.address || "",
                status: n.status || "unknown",
                caps: n.caps || n.capabilities || "",
                version: n.version || "",
              }));
              gatewayRunning = true;
              usedCli = true;
            }
          } catch {}
        }
      } catch {}

      let cliPaired: any[] = [];
      let cliPending: any[] = [];

      try {
        const devicesResult = await executeSSHCommand("cli-devices-list", sshConfig);
        if (devicesResult.success && devicesResult.output) {
          try {
            const parsed = JSON.parse(devicesResult.output.trim());
            if (!parsed.error) {
              if (parsed.paired && Array.isArray(parsed.paired)) {
                cliPaired = parsed.paired.map((d: any, idx: number) => ({
                  requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                  name: d.name || d.hostname || d.displayName || `device-${idx}`,
                  displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                  role: d.role || "node",
                  ip: d.ip || d.address || d.remoteIp || "",
                  age: d.age || "",
                  status: "paired",
                }));
              }
              if (parsed.pending && Array.isArray(parsed.pending)) {
                cliPending = parsed.pending.map((d: any, idx: number) => ({
                  requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                  name: d.name || d.hostname || d.displayName || `device-${idx}`,
                  displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                  role: d.role || "node",
                  ip: d.ip || d.address || d.remoteIp || "",
                  age: d.age || "",
                  status: "pending",
                }));
              }
              if (cliPaired.length > 0 || cliPending.length > 0 || (parsed.paired && parsed.pending)) {
                devices = [...cliPaired, ...cliPending];
                if (!usedCli) gatewayRunning = true;
                usedCli = true;
              } else {
                const rawDevices = Array.isArray(parsed) ? parsed : (parsed.devices || parsed.data || Object.values(parsed));
                devices = (rawDevices as any[]).map((d: any, idx: number) => ({
                  requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                  name: d.name || d.hostname || d.displayName || `device-${idx}`,
                  displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                  role: d.role || "node",
                  ip: d.ip || d.address || d.remoteIp || "",
                  age: d.age || "",
                  status: d.status || "unknown",
                }));
                if (!usedCli) gatewayRunning = true;
                usedCli = true;
              }
            }
          } catch {}
        }
      } catch {}

      if (!usedCli) {
        const statusCmd = `ps aux | grep -E 'openclaw' | grep -v grep | head -5; echo '---LISTENING---'; ss -tlnp | grep ${gatewayPort} || echo 'not-listening'`;
        const statusResult = await executeRawSSHCommand(statusCmd, sshConfig);
        gatewayRunning = statusResult.success && statusResult.output ? (!statusResult.output.includes("not-listening") && statusResult.output.includes("openclaw")) : false;
      }

      let paired: any[] = [];
      let pending: any[] = [];

      if (usedCli && (cliPaired.length > 0 || cliPending.length > 0)) {
        paired = cliPaired;
        pending = cliPending;
      } else if (usedCli) {
        paired = devices.filter((d: any) => d.status === "paired");
        pending = devices.filter((d: any) => d.status === "pending");
      } else {
        try {
          const pairedResult = await executeSSHCommand("list-paired-nodes", sshConfig);
          if (pairedResult.success && pairedResult.output) {
            try {
              let parsed = JSON.parse(pairedResult.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
              if (Array.isArray(parsed)) {
                paired = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n };
                  return { id: n.id || n.deviceId || n.hostname || `node-${idx}`, ...n };
                });
              }
            } catch {}
          }
        } catch {}

        try {
          const pendingResult = await executeSSHCommand("list-pending-nodes", sshConfig);
          if (pendingResult.success && pendingResult.output) {
            try {
              let parsed = JSON.parse(pendingResult.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
              if (Array.isArray(parsed)) {
                pending = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n };
                  return { id: n.id || n.deviceId || n.hostname || `node-${idx}`, ...n };
                });
              }
            } catch {}
          }
        } catch {}
      }

      const allMachines = await storage.getMachines();
      const connectedIds = new Set<string>();
      for (const n of nodes) {
        if (n.status && n.status.includes("connected")) {
          const ids = [n.name, n.id].filter(Boolean);
          ids.forEach((id: string) => connectedIds.add(id.toLowerCase()));
        }
      }
      for (const n of paired) {
        const ids = [n.displayName, n.hostname, n.name, n.clientId, n.id, n.requestId].filter(Boolean);
        ids.forEach((id: string) => connectedIds.add(id.toLowerCase()));
      }

      for (const m of allMachines) {
        const mIdentifiers = [m.hostname, m.name, m.displayName].filter(Boolean).map((s: string) => s.toLowerCase());
        const isConnected = mIdentifiers.some((id) => connectedIds.has(id));

        if (isConnected && m.status !== "connected") {
          await storage.updateMachine(m.id, { status: "connected", lastSeen: new Date() });
        } else if (!isConnected && gatewayRunning && m.status === "connected") {
          await storage.updateMachine(m.id, { status: "disconnected" });
        }
      }

      res.json({
        gateway: gatewayRunning ? "online" : "offline",
        nodes,
        devices,
        paired,
        pending,
        pairedCount: paired.length,
        pendingCount: pending.length,
        gatewayProcess: gatewayRunning,
        source: usedCli ? "cli" : "file",
      });
    } catch (error: any) {
      res.status(500).json({ gateway: "error", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: error.message });
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

  app.get("/api/whatsapp/qr", async (_req, res) => {
    try {
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      res.json({
        qrDataUrl: status.qrDataUrl,
        pairingCode: status.pairingCode,
        state: status.state,
        phone: status.phone,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp/start", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      if (status.state === "disconnected" && status.error) {
        console.log("[WhatsApp] Start called with error state, doing fresh start");
        await bot.startFresh();
      } else {
        bot.clearError();
        bot.start();
      }
      res.json({ success: true, message: "WhatsApp bot starting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/pair", async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber || typeof phoneNumber !== "string") {
        return res.status(400).json({ error: "Phone number is required (e.g. 48123456789)" });
      }
      const cleaned = phoneNumber.replace(/[^0-9]/g, "");
      if (cleaned.length < 10 || cleaned.length > 15) {
        return res.status(400).json({ error: "Invalid phone number. Use international format without + (e.g. 48123456789)" });
      }
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      const currentStatus = bot.getStatus();
      if (currentStatus.state !== "disconnected") {
        await bot.stopGracefully();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      bot.startWithPairingCode(cleaned);
      res.json({ success: true, message: "Requesting pairing code..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to request pairing code" });
    }
  });

  app.post("/api/whatsapp/stop", requireAuth, async (req, res) => {
    try {
      const bot = await getWhatsappBot();
      await bot.stopGracefully();
      res.json({ success: true, message: "WhatsApp bot stopped (session preserved — will auto-reconnect on next restart)" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/restart", async (_req, res) => {
    try {
      const bot = await getWhatsappBot();
      await bot.restart();
      res.json({ success: true, message: "WhatsApp bot restarting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to restart WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/logout", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: false });
      }
      const bot = await getWhatsappBot();
      await bot.logout();
      res.json({ success: true, message: "WhatsApp session cleared. You can now generate a fresh QR code." });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout WhatsApp" });
    }
  });

  app.post("/api/whatsapp/start-fresh", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      await bot.startFresh();
      res.json({ success: true, message: "Starting fresh WhatsApp connection..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start fresh WhatsApp connection" });
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

  app.post("/api/whatsapp/approve-by-code", requireAuth, async (req, res) => {
    try {
      const { pairingCode } = req.body;
      if (!pairingCode || typeof pairingCode !== "string") {
        return res.status(400).json({ error: "Pairing code is required" });
      }
      console.log(`[WhatsApp] Approve by code request: "${pairingCode}"`);
      const session = await storage.approveWhatsappSessionByCode(pairingCode);
      if (!session) {
        console.log(`[WhatsApp] No session found for code: "${pairingCode}"`);
        return res.status(404).json({ error: "No pending session found with that pairing code" });
      }
      console.log(`[WhatsApp] Approved session: phone=${session.phone}, name=${session.displayName}`);
      if (!isProductionRuntime) {
        try {
          const bot = await getWhatsappBot();
          await bot.sendApprovalNotification(session.phone);
        } catch {}
      }
      res.json(session);
    } catch (error: any) {
      console.error(`[WhatsApp] Approve by code error:`, error);
      res.status(500).json({ error: "Failed to approve session by pairing code" });
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

  const validateApiKey = async (req: Request, res: Response, next: () => void) => {
    const apiKeyHeader = req.headers["x-api-key"] as string;
    if (!apiKeyHeader) {
      return res.status(401).json({ error: "API key required (X-API-Key header)" });
    }
    const keys = await storage.getApiKeys();
    const match = keys.find(k => k.key === apiKeyHeader && k.active);
    if (!match) {
      return res.status(403).json({ error: "Invalid or inactive API key" });
    }
    next();
  };

  let homeBotStatus: { state: string; phone: string | null; error: string | null; runtime: string; hostname: string | null; lastReport: Date | null } = {
    state: "disconnected", phone: null, error: null, runtime: "home-bot", hostname: null, lastReport: null,
  };

  app.post("/api/whatsapp/home-bot-status", validateApiKey as any, (req: Request, res: Response) => {
    const { state, phone, error, hostname } = req.body;
    homeBotStatus = {
      state: state || "disconnected",
      phone: phone || null,
      error: error || null,
      runtime: "home-bot",
      hostname: hostname || null,
      lastReport: new Date(),
    };
    res.json({ ok: true });
  });

  app.post("/api/whatsapp/home-bot-message", validateApiKey as any, async (req: Request, res: Response) => {
    try {
      const { phone, text, pushName } = req.body;
      if (!phone || !text) {
        return res.status(400).json({ error: "phone and text are required" });
      }

      const session = await storage.getWhatsappSessionByPhone(phone);

      if (!session || session.status === "pending") {
        const code = session?.pairingCode || randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
        await storage.upsertWhatsappSession(phone, {
          phone,
          displayName: pushName || null,
          status: "pending",
          pairingCode: code,
        });
        return res.json({
          reply: `Welcome to *OpenClaw AI*\n\nYour access is not yet approved.\n\nYour pairing code is: *${code}*\n\nPlease share this code with the administrator to get access.`,
          approved: false,
        });
      }

      if (session.status === "blocked") {
        return res.json({ reply: "Your access has been revoked. Contact the administrator.", approved: false });
      }

      if (session.status === "approved") {
        await storage.updateWhatsappSessionLastMessage(phone);
        const { chat } = await import("./bot/openrouter");
        const response = await chat(text, pushName || session.displayName || undefined);
        return res.json({ reply: response || "I couldn't generate a response.", approved: true });
      }

      res.json({ reply: "Unknown session status.", approved: false });
    } catch (error: any) {
      console.error("[Home-Bot API] Message processing error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      if (homeBotStatus.lastReport && (Date.now() - homeBotStatus.lastReport.getTime()) < 120000) {
        return res.json({
          state: homeBotStatus.state,
          qrDataUrl: null,
          pairingCode: null,
          phone: homeBotStatus.phone,
          error: homeBotStatus.error,
          runtime: "home-bot",
          hostname: homeBotStatus.hostname,
          enabled: true,
        });
      }

      if (homeBotStatus.lastReport) {
        return res.json({
          state: "disconnected",
          qrDataUrl: null,
          pairingCode: null,
          phone: homeBotStatus.phone,
          error: "Home bot has not reported in over 2 minutes. Check if it's still running on " + (homeBotStatus.hostname || "the host machine") + ".",
          runtime: "home-bot",
          hostname: homeBotStatus.hostname,
          enabled: true,
        });
      }

      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      const instanceId = await resolveInstanceId(req);
      let enabled = false;
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        enabled = !!config?.whatsappEnabled;
      }
      res.json({ ...status, runtime: "local", enabled });
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp status" });
    }
  });

  app.get("/api/whatsapp/home-bot-download", requireAuth, async (_req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const archiver = (await import("archiver")).default;

      const botDir = path.default.join(process.cwd(), "home-bot");
      if (!fs.existsSync(botDir)) {
        return res.status(404).json({ error: "Home bot files not found" });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=openclaw-whatsapp-bot.zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);
      archive.directory(botDir, "openclaw-whatsapp-bot");
      archive.finalize();
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create download" });
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
    { skillId: "gog", name: "Gog", description: "Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs. By @steipete.", category: "productivity", version: "1.0.0", icon: "Mail" },
    { skillId: "self-improving-agent", name: "Self-Improving Agent", description: "Captures learnings, errors, and corrections to enable continuous improvement. By @pskoett.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "ontology", name: "Ontology", description: "Typed knowledge graph for structured agent memory and composable skills. By @oswalpalash.", category: "ai", version: "1.0.0", icon: "Network" },
    { skillId: "tavily-web-search", name: "Tavily Web Search", description: "AI-optimized web search via Tavily API. Returns concise, relevant results for AI agents. By @arun-8687.", category: "research", version: "1.0.0", icon: "Search" },
    { skillId: "trello", name: "Trello", description: "Manage Trello boards, lists, and cards via the Trello REST API. By @steipete.", category: "productivity", version: "1.0.0", icon: "LayoutGrid" },
    { skillId: "slack", name: "Slack", description: "Control Slack from Clawbot via the Slack tool, including reacting to messages, posting, and channel management. By @steipete.", category: "communication", version: "1.0.0", icon: "Hash" },
    { skillId: "caldav-calendar", name: "CalDAV Calendar", description: "Sync and query CalDAV calendars (iCloud, Google, Fastmail, Nextcloud, etc.) using standard CalDAV protocol. By @Asleep123.", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "answer-overflow", name: "Answer Overflow", description: "Search indexed Discord community discussions via Answer Overflow. Find solutions from Discord servers. By @RhysSullivan.", category: "research", version: "1.0.0", icon: "MessageCircle" },
    { skillId: "github-integration", name: "GitHub", description: "Interact with GitHub repos, issues, PRs, and workflows. Create branches, review code, and manage releases.", category: "development", version: "1.0.0", icon: "GitBranch" },
    { skillId: "notion-sync", name: "Notion", description: "Read, create, and update Notion pages, databases, and blocks. Sync knowledge between agents and Notion.", category: "productivity", version: "1.0.0", icon: "BookOpen" },
    { skillId: "jira-integration", name: "Jira", description: "Create and manage Jira issues, sprints, and boards. Track project progress and update ticket status.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "stripe-payments", name: "Stripe", description: "Process payments, manage subscriptions, and query transaction data via Stripe API.", category: "development", version: "1.0.0", icon: "CreditCard" },
    { skillId: "twilio-sms", name: "Twilio SMS", description: "Send and receive SMS/MMS messages via Twilio. Manage phone numbers and messaging workflows.", category: "communication", version: "1.0.0", icon: "Smartphone" },
    { skillId: "google-sheets", name: "Google Sheets", description: "Read, write, and manage Google Sheets spreadsheets. Automate data entry and reporting.", category: "productivity", version: "1.0.0", icon: "Table" },
    { skillId: "google-drive", name: "Google Drive", description: "Upload, download, search, and organize files in Google Drive.", category: "productivity", version: "1.0.0", icon: "HardDrive" },
    { skillId: "linear-integration", name: "Linear", description: "Create and manage Linear issues, projects, and cycles. Streamline engineering workflows.", category: "productivity", version: "1.0.0", icon: "Target" },
    { skillId: "discord-bot", name: "Discord Bot", description: "Send messages, manage channels, and respond to events in Discord servers.", category: "communication", version: "1.0.0", icon: "MessageSquare" },
    { skillId: "telegram-bot", name: "Telegram Bot", description: "Send and receive Telegram messages, manage groups, and handle bot commands.", category: "communication", version: "1.0.0", icon: "Send" },
    { skillId: "rss-reader", name: "RSS Reader", description: "Monitor and parse RSS/Atom feeds. Get notified of new content from any feed source.", category: "research", version: "1.0.0", icon: "Rss" },
    { skillId: "pdf-generator", name: "PDF Generator", description: "Create professional PDF documents from templates, HTML, or markdown content.", category: "productivity", version: "1.0.0", icon: "FileText" },
    { skillId: "cron-jobs", name: "Cron Jobs", description: "Schedule recurring tasks with cron expressions. Automate backups, reports, and maintenance.", category: "system", version: "1.0.0", icon: "Clock" },
    { skillId: "prometheus-metrics", name: "Prometheus Metrics", description: "Query and visualize Prometheus metrics. Monitor system health and application performance.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "ollama-local", name: "Ollama Local", description: "Run local LLM inference via Ollama. Use local models for private, offline AI processing.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "vector-search", name: "Vector Search", description: "Semantic search over embeddings. Build and query vector databases for RAG and similarity matching.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "n8n-automation", name: "n8n Automation", description: "Trigger and manage n8n workflows. Connect OpenClaw to complex automation pipelines.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "tailscale-manager", name: "Tailscale Manager", description: "Manage Tailscale mesh VPN nodes, ACLs, and network routes from your agent.", category: "system", version: "1.0.0", icon: "Network" },
    { skillId: "cloudflare-dns", name: "Cloudflare DNS", description: "Manage Cloudflare DNS records, zones, and firewall rules. Automate domain configuration.", category: "system", version: "1.0.0", icon: "Shield" },
    { skillId: "spotify-player", name: "Spotify Player", description: "Control Spotify playback, manage playlists, and search for music.", category: "productivity", version: "1.0.0", icon: "Music" },
    { skillId: "youtube-search", name: "YouTube Search", description: "Search YouTube videos, get transcripts, and extract video metadata.", category: "research", version: "1.0.0", icon: "Youtube" },
    { skillId: "speech-to-text", name: "Speech to Text", description: "Transcribe audio files and live speech using Whisper and other ASR models.", category: "ai", version: "1.0.0", icon: "Mic" },
    { skillId: "image-generation", name: "Image Generation", description: "Generate images from text prompts using DALL-E, Stable Diffusion, and Flux models.", category: "ai", version: "1.1.0", icon: "Paintbrush" },
    { skillId: "code-review", name: "Code Review", description: "Automated code review with security scanning, style checks, and improvement suggestions.", category: "development", version: "1.0.0", icon: "GitPullRequest" },
    { skillId: "git-operations", name: "Git Operations", description: "Clone repos, create branches, commit changes, and manage Git workflows programmatically.", category: "development", version: "1.0.0", icon: "GitBranch" },
    { skillId: "regex-builder", name: "Regex Builder", description: "Build, test, and explain regular expressions with visual pattern matching.", category: "development", version: "1.0.0", icon: "Braces" },
    { skillId: "unit-test-generator", name: "Unit Test Generator", description: "Auto-generate unit tests for Python, JS, and TypeScript codebases with coverage reports.", category: "development", version: "1.0.0", icon: "TestTube" },
    { skillId: "ci-cd-pipeline", name: "CI/CD Pipeline", description: "Configure and trigger CI/CD pipelines on GitHub Actions, GitLab CI, and Jenkins.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "kubernetes-manager", name: "Kubernetes Manager", description: "Manage K8s clusters, deployments, pods, and services. Scale and monitor containerized apps.", category: "system", version: "1.0.0", icon: "Container" },
    { skillId: "ssl-certificate", name: "SSL Certificate Manager", description: "Issue, renew, and manage SSL/TLS certificates via Let's Encrypt and ACME protocol.", category: "system", version: "1.0.0", icon: "Lock" },
    { skillId: "dns-lookup", name: "DNS Lookup", description: "Perform DNS queries, check propagation, and diagnose domain resolution issues.", category: "system", version: "1.0.0", icon: "Globe" },
    { skillId: "port-scanner", name: "Port Scanner", description: "Scan open ports on hosts, check service availability, and detect security exposure.", category: "system", version: "1.0.0", icon: "Radar" },
    { skillId: "system-monitor", name: "System Monitor", description: "Real-time CPU, memory, disk, and network monitoring with alerts and historical trends.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "backup-manager", name: "Backup Manager", description: "Automated backup scheduling for databases, files, and configurations with S3/local targets.", category: "system", version: "1.0.0", icon: "HardDrive" },
    { skillId: "uptime-monitor", name: "Uptime Monitor", description: "Monitor website and API uptime with configurable intervals and alerting channels.", category: "system", version: "1.0.0", icon: "Wifi" },
    { skillId: "text-summarizer", name: "Text Summarizer", description: "Summarize long articles, documents, and conversations into concise key points.", category: "ai", version: "1.0.0", icon: "FileText" },
    { skillId: "entity-extraction", name: "Entity Extraction", description: "Extract named entities (people, organizations, dates, locations) from unstructured text.", category: "ai", version: "1.0.0", icon: "Tags" },
    { skillId: "intent-classifier", name: "Intent Classifier", description: "Classify user intents and route conversations to appropriate handlers or skills.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "agent-memory", name: "Agent Memory", description: "Persistent long-term memory for agents with automatic context recall and relevance scoring.", category: "ai", version: "2.0.0", icon: "Brain" },
    { skillId: "multi-agent-orchestrator", name: "Multi-Agent Orchestrator", description: "Coordinate multiple AI agents with task delegation, consensus, and result aggregation.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "prompt-library", name: "Prompt Library", description: "Manage, version, and A/B test prompt templates across different models and use cases.", category: "ai", version: "1.0.0", icon: "BookOpen" },
    { skillId: "fine-tune-manager", name: "Fine-Tune Manager", description: "Manage fine-tuning jobs on OpenAI, Together, and Replicate. Track datasets and model versions.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "content-moderation", name: "Content Moderation", description: "Detect and filter toxic, harmful, or inappropriate content using AI classifiers.", category: "ai", version: "1.0.0", icon: "Shield" },
    { skillId: "data-scraper", name: "Data Scraper", description: "Extract structured data from websites with CSS selectors, XPath, and headless browser support.", category: "research", version: "1.0.0", icon: "Globe" },
    { skillId: "arxiv-search", name: "arXiv Search", description: "Search and summarize academic papers from arXiv. Track new publications in your research areas.", category: "research", version: "1.0.0", icon: "BookOpen" },
    { skillId: "wikipedia-search", name: "Wikipedia Search", description: "Search and extract information from Wikipedia articles with section-level precision.", category: "research", version: "1.0.0", icon: "BookOpen" },
    { skillId: "hacker-news", name: "Hacker News", description: "Browse top stories, search discussions, and track trending tech topics on Hacker News.", category: "research", version: "1.0.0", icon: "Rss" },
    { skillId: "product-hunt", name: "Product Hunt", description: "Discover trending products, track launches, and analyze product metrics from Product Hunt.", category: "research", version: "1.0.0", icon: "Rocket" },
    { skillId: "reddit-search", name: "Reddit Search", description: "Search Reddit posts and comments, monitor subreddits, and track trending discussions.", category: "research", version: "1.0.0", icon: "MessageCircle" },
    { skillId: "google-calendar", name: "Google Calendar", description: "Full Google Calendar integration with event CRUD, availability checks, and meeting scheduling.", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "todoist", name: "Todoist", description: "Manage tasks, projects, and labels in Todoist. Sync priorities and due dates with agent workflows.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "asana", name: "Asana", description: "Create and manage Asana tasks, projects, and portfolios. Track team workloads and deadlines.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "airtable", name: "Airtable", description: "Read, write, and query Airtable bases. Build automated workflows around structured data.", category: "productivity", version: "1.0.0", icon: "Table" },
    { skillId: "confluence", name: "Confluence", description: "Create and update Confluence pages, search knowledge bases, and manage documentation spaces.", category: "productivity", version: "1.0.0", icon: "BookOpen" },
    { skillId: "figma-integration", name: "Figma", description: "Extract design tokens, component specs, and export assets from Figma files.", category: "development", version: "1.0.0", icon: "Paintbrush" },
    { skillId: "vercel-deploy", name: "Vercel Deploy", description: "Deploy and manage projects on Vercel. Trigger builds, check deployment status, and manage domains.", category: "development", version: "1.0.0", icon: "Globe" },
    { skillId: "aws-s3", name: "AWS S3", description: "Upload, download, and manage files in S3 buckets. Generate pre-signed URLs and manage access.", category: "system", version: "1.0.0", icon: "HardDrive" },
    { skillId: "redis-cache", name: "Redis Cache", description: "Interact with Redis for caching, pub/sub messaging, and session management.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "supabase", name: "Supabase", description: "Full Supabase integration with database queries, auth management, storage, and real-time subscriptions.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "firebase", name: "Firebase", description: "Manage Firestore documents, Firebase Auth users, Cloud Functions, and FCM push notifications.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "sentry-monitor", name: "Sentry Monitor", description: "Track and manage application errors, performance issues, and release health via Sentry.", category: "development", version: "1.0.0", icon: "AlertTriangle" },
    { skillId: "grafana-dashboard", name: "Grafana Dashboard", description: "Query Grafana dashboards, create panels, and set up alert rules for infrastructure monitoring.", category: "system", version: "1.0.0", icon: "BarChart3" },
    { skillId: "pagerduty", name: "PagerDuty", description: "Create and manage incidents, on-call schedules, and escalation policies via PagerDuty.", category: "system", version: "1.0.0", icon: "Bell" },
    { skillId: "datadog", name: "Datadog", description: "Query metrics, manage monitors, and analyze logs from Datadog observability platform.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "zapier-hooks", name: "Zapier Webhooks", description: "Trigger Zapier workflows and receive webhook events to connect 5000+ apps.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "make-automation", name: "Make (Integromat)", description: "Trigger and manage Make scenarios for visual workflow automation with 1000+ app connectors.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "openai-assistants", name: "OpenAI Assistants", description: "Create and manage OpenAI Assistants with tools, file search, and code interpreter capabilities.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "anthropic-claude", name: "Anthropic Claude", description: "Direct Anthropic API integration for Claude models with extended thinking and tool use.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "huggingface", name: "Hugging Face", description: "Run inference on Hugging Face models, manage datasets, and deploy custom ML pipelines.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "replicate-models", name: "Replicate Models", description: "Run open-source ML models on Replicate. Access Stable Diffusion, LLaMA, and 1000+ community models.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "elevenlabs-voice", name: "ElevenLabs Voice", description: "Generate realistic speech with ElevenLabs voice synthesis. Clone voices and manage voice library.", category: "ai", version: "1.0.0", icon: "Volume2" },
    { skillId: "deepgram-transcription", name: "Deepgram", description: "Real-time speech transcription with speaker diarization, sentiment analysis, and topic detection.", category: "ai", version: "1.0.0", icon: "Mic" },
    { skillId: "pinecone-vectordb", name: "Pinecone", description: "Manage Pinecone vector indexes for semantic search, RAG, and recommendation systems.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "weaviate-search", name: "Weaviate", description: "Hybrid vector + keyword search with Weaviate. Build multi-modal search and RAG pipelines.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "ip-geolocation", name: "IP Geolocation", description: "Look up geographic location, ISP, and threat intelligence data for IP addresses.", category: "research", version: "1.0.0", icon: "Globe" },
    { skillId: "weather-api", name: "Weather API", description: "Get current weather, forecasts, and historical weather data for any location worldwide.", category: "research", version: "1.0.0", icon: "Cloud" },
    { skillId: "currency-exchange", name: "Currency Exchange", description: "Real-time currency conversion rates and historical exchange data for 170+ currencies.", category: "research", version: "1.0.0", icon: "CreditCard" },
    { skillId: "stock-market", name: "Stock Market", description: "Real-time stock prices, company financials, market news, and technical analysis indicators.", category: "research", version: "1.0.0", icon: "BarChart3" },
    { skillId: "crypto-tracker", name: "Crypto Tracker", description: "Track cryptocurrency prices, portfolio values, DeFi metrics, and blockchain analytics.", category: "research", version: "1.0.0", icon: "CreditCard" },
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
      const doc = await storage.getDoc(String(req.params.id));
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
      const doc = await storage.updateDoc(String(req.params.id), partial);
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
      await storage.deleteDoc(String(req.params.id));
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
      const session = await storage.getNodeSetupSession(String(req.params.id));
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
      const session = await storage.updateNodeSetupSession(String(req.params.id), partial);
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

  // ──────────── Hostinger VPS Monitoring ────────────

  app.get("/api/hostinger/vms", requireAuth, async (_req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vms = await hostinger.listVMs();
      res.json(vms);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch VPS list from Hostinger" });
    }
  });

  app.get("/api/hostinger/vms/:vmId", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vm = await hostinger.getVM(Number(req.params.vmId));
      res.json(vm);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch VM details" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/metrics", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vmId = Number(req.params.vmId);
      const dateFrom = req.query.date_from as string | undefined;
      const dateTo = req.query.date_to as string | undefined;
      const vm = await hostinger.getVM(vmId);
      const metrics = await hostinger.getMetrics(vmId, dateFrom, dateTo, vm.memory);
      res.json(metrics);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch metrics" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/start", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.startVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to start VM" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/stop", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.stopVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to stop VM" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/restart", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.restartVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to restart VM" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/actions", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const actions = await hostinger.getActions(Number(req.params.vmId));
      res.json(actions);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch actions" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/docker", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const projects = await hostinger.listDockerProjects(Number(req.params.vmId));
      res.json(projects);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch Docker projects" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/docker/:projectName/containers", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const containers = await hostinger.getDockerContainers(Number(req.params.vmId), String(req.params.projectName));
      res.json(containers);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch containers" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/restart", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.restartDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to restart Docker project" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/start", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.startDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to start Docker project" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/stop", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.stopDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to stop Docker project" });
    }
  });

  app.get("/api/hostinger/firewalls", requireAuth, async (_req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const firewalls = await hostinger.listFirewalls();
      res.json(firewalls);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch firewalls" });
    }
  });

  app.get("/api/hostinger/firewalls/:firewallId", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const firewall = await hostinger.getFirewall(Number(req.params.firewallId));
      res.json(firewall);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch firewall" });
    }
  });

  app.post("/api/hostinger/firewalls/:firewallId/rules", requireAuth, async (req, res) => {
    try {
      const { z } = await import("zod");
      const firewallRuleSchema = z.object({
        protocol: z.enum(["tcp", "udp", "icmp"]),
        port: z.string().min(1).max(20),
        source: z.enum(["any", "custom"]),
        source_detail: z.string().optional(),
        action: z.enum(["accept", "drop"]),
      });
      const parsed = firewallRuleSchema.parse(req.body);
      const { hostinger } = await import("./hostinger");
      const result = await hostinger.createFirewallRule(Number(req.params.firewallId), parsed);
      res.json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid firewall rule data", details: error.errors });
      }
      res.status(502).json({ error: error.message || "Failed to create firewall rule" });
    }
  });

  app.post("/api/hostinger/firewalls/:firewallId/sync", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vmId = req.body.virtualMachineId ? Number(req.body.virtualMachineId) : undefined;
      await hostinger.syncFirewall(Number(req.params.firewallId), vmId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to sync firewall" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/backups", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const backups = await hostinger.listBackups(Number(req.params.vmId));
      res.json(backups);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch backups" });
    }
  });

  app.post("/api/hostinger/auto-open-port", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const port = String(req.body.port || "18789");
      const vms = await hostinger.listVMs();
      if (!vms.length) return res.status(404).json({ error: "No Hostinger VMs found" });

      const firewalls = await hostinger.listFirewalls();
      if (!firewalls.length) return res.status(404).json({ error: "No Hostinger firewalls found. Create one in the Hostinger panel first." });

      const instanceId = req.body.instanceId as string | undefined;
      let targetVmIp: string | null = null;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) targetVmIp = vps.vpsIp;
      }

      let targetFirewallId: number | null = null;
      if (targetVmIp) {
        for (const vm of vms) {
          const vmIps = vm.ip_addresses?.map((ip: any) => ip.address) || [];
          if (vmIps.includes(targetVmIp) && vm.firewall_group_id) {
            targetFirewallId = vm.firewall_group_id;
            break;
          }
        }
      }

      const targetFirewalls = targetFirewallId
        ? firewalls.filter((fw: any) => fw.id === targetFirewallId)
        : firewalls;

      let targetVmId: number | undefined;
      if (targetVmIp) {
        for (const vm of vms) {
          const vmIps = vm.ip_addresses?.map((ip: any) => ip.address) || [];
          if (vmIps.includes(targetVmIp)) {
            targetVmId = vm.id;
            break;
          }
        }
      }

      const results: Array<{ firewallId: number; firewallName: string; action: string }> = [];
      for (const fw of targetFirewalls) {
        const existing = fw.rules?.find((r: any) => r.port === port && r.protocol === "TCP" && r.source === "any");
        if (existing) {
          results.push({ firewallId: fw.id, firewallName: fw.name, action: "already_open" });
          continue;
        }
        await hostinger.createFirewallRule(fw.id, { protocol: "TCP", port, source: "any" });
        await hostinger.syncFirewall(fw.id, targetVmId);
        results.push({ firewallId: fw.id, firewallName: fw.name, action: "opened_and_synced" });
      }

      res.json({ success: true, port, results });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to open port via Hostinger API" });
    }
  });

  // ──────────── SSH Remote Gateway Control ────────────
  app.post("/api/ssh/gateway/:action", requireAuth, async (req, res) => {
    try {
      const { executeSSHCommand, listAllowedCommands, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const action = String(req.params.action);
      const allowed = listAllowedCommands();
      if (!allowed.includes(action)) {
        return res.status(400).json({ error: `Invalid action: ${action}. Allowed: ${allowed.join(", ")}` });
      }

      const instanceId = req.body?.instanceId as string | undefined;
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          sshConfig = buildSSHConfigFromVps(vps);
        }
      }
      if (!sshConfig) {
        sshConfig = getSSHConfig() || undefined;
      }

      const result = await executeSSHCommand(action, sshConfig);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "SSH command failed" });
    }
  });

  app.get("/api/ssh/gateway/actions", requireAuth, async (req, res) => {
    try {
      const { listAllowedCommands, getSSHConfig, buildSSHConfigFromVps } = await import("./ssh");
      const instanceId = req.query.instanceId as string | undefined;
      let config;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          config = buildSSHConfigFromVps(vps);
        }
      }
      if (!config) {
        config = getSSHConfig();
      }
      res.json({
        actions: listAllowedCommands(),
        configured: !!config,
        host: config?.host || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get SSH actions" });
    }
  });

  app.get("/api/openclaw/version-check", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.json({ error: "No VPS configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const dockerProject = config?.dockerProject || "claw";

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const versionCmd = [
        'cat /root/.openclaw/update-check.json 2>/dev/null || echo "NO_UPDATE_CHECK"',
        'echo "---PKG---"',
        'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
        'echo "---DOCKER---"',
        `docker compose -p ${dockerProject} exec -T gateway openclaw --version 2>/dev/null || docker exec $(docker ps -qf "name=${dockerProject}.*gateway" | head -1) openclaw --version 2>/dev/null || echo "NO_DOCKER"`,
        'echo "---DOCKER-IMAGE---"',
        `docker compose -p ${dockerProject} images 2>/dev/null | grep gateway | awk '{print $2":"$3}' || echo "NO_IMAGE"`,
        'echo "---NPM-LATEST---"',
        'npm view openclaw version 2>/dev/null || echo "NO_NPM"',
      ].join('; ');

      const result = await executeRawSSHCommand(versionCmd, sshConfig);
      const output = result.output?.trim() || "";

      const sections = output.split("---PKG---");
      const updateCheckRaw = sections[0]?.trim() || "";
      const afterPkg = sections[1] || "";
      const pkgParts = afterPkg.split("---DOCKER---");
      const pkgRaw = pkgParts[0]?.trim() || "";
      const afterDocker = pkgParts[1] || "";
      const dockerParts = afterDocker.split("---DOCKER-IMAGE---");
      const dockerVersionRaw = dockerParts[0]?.trim() || "";
      const afterImage = dockerParts[1] || "";
      const imageParts = afterImage.split("---NPM-LATEST---");
      const dockerImageRaw = imageParts[0]?.trim() || "";
      const npmLatestRaw = imageParts[1]?.trim() || "";

      let updateInfo: any = {};
      let currentVersion = "";
      let latestVersion = "unknown";

      if (npmLatestRaw && npmLatestRaw !== "NO_NPM") {
        const npmMatch = npmLatestRaw.match(/(\d+[\.\d-]+\S*)/);
        if (npmMatch) latestVersion = npmMatch[1];
      }

      if (updateCheckRaw && updateCheckRaw !== "NO_UPDATE_CHECK") {
        try {
          updateInfo = JSON.parse(updateCheckRaw);
          if (latestVersion === "unknown") {
            latestVersion = updateInfo.lastAvailableVersion || updateInfo.lastNotifiedVersion || "unknown";
          }
        } catch {}
      }

      if (pkgRaw && pkgRaw !== "NO_PKG") {
        const pkgMatch = pkgRaw.match(/"version"\s*:\s*"([^"]+)"/);
        if (pkgMatch) currentVersion = pkgMatch[1];
      }

      if (!currentVersion && dockerVersionRaw && dockerVersionRaw !== "NO_DOCKER") {
        const dockerMatch = dockerVersionRaw.match(/(\d+\.\d+[\.\d-]*\S*)/);
        if (dockerMatch) currentVersion = dockerMatch[1];
      }

      if (!currentVersion && updateInfo.lastNotifiedVersion) {
        currentVersion = updateInfo.lastNotifiedVersion;
      }

      const compareVersions = (a: string, b: string): number => {
        const normalize = (v: string) => v.replace(/-/g, ".").split(".").map(p => parseInt(p, 10) || 0);
        const pa = normalize(a);
        const pb = normalize(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
          const va = pa[i] || 0;
          const vb = pb[i] || 0;
          if (va !== vb) return va - vb;
        }
        return 0;
      };

      const hasUpdate = latestVersion !== "unknown" && currentVersion !== "" && currentVersion !== "unknown"
        && compareVersions(latestVersion, currentVersion) > 0;

      res.json({
        currentVersion: currentVersion || "unknown",
        latestVersion,
        hasUpdate,
        updateInfo,
        dockerImage: dockerImageRaw !== "NO_IMAGE" ? dockerImageRaw : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Version check failed" });
    }
  });

  app.post("/api/openclaw/update", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const dockerProject = config?.dockerProject || "claw";

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const hasDockerCmd = [
        `docker compose -p ${dockerProject} ps --format json 2>/dev/null | head -1`,
        'echo "---ALT---"',
        `docker ps --filter "name=${dockerProject}" --format "{{.Names}}" 2>/dev/null | head -1`,
        'echo "---ALT2---"',
        'docker ps --filter "name=openclaw" --format "{{.Names}}" 2>/dev/null | head -1',
      ].join('; ');
      const dockerCheck = await executeRawSSHCommand(hasDockerCmd, sshConfig);
      const dkOut = dockerCheck.output || "";
      const dkParts = dkOut.split("---ALT---");
      const composeOut = dkParts[0]?.trim() || "";
      const altParts = (dkParts[1] || "").split("---ALT2---");
      const filterOut = altParts[0]?.trim() || "";
      const anyOpenclawContainer = altParts[1]?.trim() || "";
      const isDocker = !!(composeOut && composeOut !== "[]") || !!filterOut || !!anyOpenclawContainer;
      const detectedContainer = filterOut || anyOpenclawContainer || "";

      const versionCheckCmd = [
        'npm view openclaw version 2>/dev/null || echo "NO_NPM"',
        'echo "---CUR---"',
        'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
      ].join('; ');
      const preCheck = await executeRawSSHCommand(versionCheckCmd, sshConfig);
      const preOut = preCheck.output || "";
      const preParts = preOut.split("---CUR---");
      const npmLatest = preParts[0]?.trim().match(/(\d+[\.\d-]+\S*)/)?.[1] || "";
      const curPkgMatch = preParts[1]?.trim().match(/"version"\s*:\s*"([^"]+)"/);
      const currentInstalled = curPkgMatch?.[1] || "";

      if (npmLatest && currentInstalled && npmLatest === currentInstalled && !isDocker) {
        return res.json({
          success: true,
          newVersion: currentInstalled,
          output: `Already at the latest version (${currentInstalled}). No update needed.`,
          method: "npm",
          alreadyLatest: true,
        });
      }

      let updateCmd: string;
      let method: string;
      if (isDocker) {
        method = "docker";
        const containerName = detectedContainer || `${dockerProject}.*gateway`;
        updateCmd = [
          `echo "Pulling latest Docker images..."`,
          `cd /root/${dockerProject} 2>/dev/null || cd /opt/${dockerProject} 2>/dev/null || cd $(find / -maxdepth 3 -name "docker-compose.yml" -path "*${dockerProject}*" -exec dirname {} \\; 2>/dev/null | head -1) 2>/dev/null || cd $(find / -maxdepth 3 -name "docker-compose.yml" -path "*openclaw*" -exec dirname {} \\; 2>/dev/null | head -1) 2>/dev/null`,
          `docker compose pull 2>&1 || docker pull $(docker inspect --format='{{.Config.Image}}' ${containerName} 2>/dev/null) 2>&1`,
          'echo "---RESTART---"',
          `docker compose down 2>&1 || true`,
          `docker compose up -d 2>&1 || docker restart ${containerName} 2>&1`,
          'sleep 5',
          'echo "---STATUS---"',
          `docker ps --filter "name=openclaw" --format "table {{.Names}}\\t{{.Status}}" 2>&1`,
          'echo "---VERSION---"',
          `docker exec ${containerName} openclaw --version 2>/dev/null || docker exec $(docker ps -qf "name=openclaw" | head -1) openclaw --version 2>/dev/null || echo "NO_VERSION"`,
        ].join('; ');
      } else {
        method = "npm";
        updateCmd = [
          'echo "Installing latest OpenClaw via npm..."',
          'npm install -g openclaw@latest 2>&1; NPM_EXIT=$?',
          'echo "---NPM_EXIT=$NPM_EXIT---"',
          'echo "---RESTART---"',
          'kill $(pgrep -f "openclaw gateway") $(pgrep -f "openclaw-gateway") 2>/dev/null || true',
          'sleep 2',
          'nohup openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &',
          'disown',
          'sleep 5',
          'echo "---VERSION---"',
          'openclaw --version 2>/dev/null || echo "NO_VERSION"',
          'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
          'echo "---GATEWAY---"',
          'curl -sf http://localhost:18789/health 2>/dev/null && echo "GATEWAY_OK" || echo "GATEWAY_DOWN"',
        ].join('; ');
      }

      const result = await executeRawSSHCommand(updateCmd, sshConfig, 2, 120000);

      const output = result.output || "";
      const stderr = result.error || "";
      const versionSection = output.split("---VERSION---")[1]?.split("---GATEWAY---")[0]?.trim() || "";
      const versionMatch = versionSection.match(/"version"\s*:\s*"([^"]+)"/) || versionSection.match(/(\d+\.\d+[\.\d-]*\S*)/);
      const newVersion = versionMatch ? versionMatch[1] : "";

      const hasNpmFail = output.includes("NPM_EXIT=1") || output.includes("npm ERR!");
      const gatewayOk = output.includes("GATEWAY_OK");
      const hasVersionOutput = newVersion && newVersion !== "NO_VERSION";
      const updateSucceeded = (hasVersionOutput || gatewayOk) && !hasNpmFail;

      res.json({
        success: updateSucceeded,
        newVersion: newVersion || "updated",
        output,
        method,
        gatewayRunning: gatewayOk,
        sshSuccess: result.success,
        sshError: stderr || undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Update failed" });
    }
  });

  app.post("/api/whatsapp/deploy-vps-bot", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const depsCmd = 'cd /root/openclaw-whatsapp-bot && npm i --production 2>&1';
      console.log("[VPS Bot] Installing dependencies...");
      const depsResult = await executeRawSSHCommand(depsCmd, sshConfig, 2, 120000);
      console.log("[VPS Bot] Deps result:", depsResult.success, depsResult.output?.substring(0, 200));

      const unitContent = [
        '[Unit]',
        'Description=OpenClaw WhatsApp Bot',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        'WorkingDirectory=/root/openclaw-whatsapp-bot',
        'ExecStart=/usr/bin/node /root/openclaw-whatsapp-bot/openclaw-whatsapp.js',
        'Restart=on-failure',
        'RestartSec=10',
        'StandardOutput=append:/tmp/whatsapp-bot.log',
        'StandardError=append:/tmp/whatsapp-bot.log',
        'Environment=NODE_ENV=production',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
      ].join('\\n');

      const startCmd = [
        `printf '${unitContent}' > /etc/systemd/system/openclaw-whatsapp.service`,
        'systemctl daemon-reload',
        'systemctl stop openclaw-whatsapp 2>/dev/null || true',
        'truncate -s 0 /tmp/whatsapp-bot.log 2>/dev/null || true',
        'systemctl start openclaw-whatsapp',
        'systemctl enable openclaw-whatsapp 2>/dev/null || true',
        'sleep 5',
        'systemctl is-active openclaw-whatsapp && echo "BOT_RUNNING" || echo "BOT_FAILED"',
        'echo "---LOG---"',
        'cat /tmp/whatsapp-bot.log 2>/dev/null | tail -30',
      ].join(' && ');

      console.log("[VPS Bot] Starting bot...");
      const result = await executeRawSSHCommand(startCmd, sshConfig, 2, 30000);
      const output = result.output || "";
      console.log("[VPS Bot] Start result:", output.substring(0, 300));
      const running = output.includes("BOT_RUNNING");
      const logSection = output.split("---LOG---")[1]?.trim() || "";

      res.json({
        success: running,
        output: `DEPS: ${depsResult.output?.substring(0, 500) || "empty"}\n\nSTART: ${output}`,
        log: logSection,
        depsSuccess: depsResult.success,
        depsError: depsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/stop-vps-bot", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const cmd = 'systemctl stop openclaw-whatsapp 2>/dev/null && systemctl disable openclaw-whatsapp 2>/dev/null; echo "STOPPED"';
      const result = await executeRawSSHCommand(cmd, sshConfig);
      res.json({ success: true, output: result.output });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/vps-bot-log", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const cmd = [
        'systemctl is-active openclaw-whatsapp 2>/dev/null && echo "STATUS:RUNNING" || (pgrep -f "openclaw-whatsapp.js" > /dev/null 2>&1 && echo "STATUS:RUNNING" || echo "STATUS:STOPPED")',
        'echo "---LOG---"',
        'cat /tmp/whatsapp-bot.log 2>/dev/null | tail -50',
      ].join('; ');
      const result = await executeRawSSHCommand(cmd, sshConfig);
      const output = result.output || "";
      const running = output.includes("STATUS:RUNNING");
      const log = output.split("---LOG---")[1]?.trim() || "";

      res.json({ running, log });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === AI Task Runner Routes ===
  const { processAiMessage } = await import("./ai-task-runner");
  const aiMessageSchema = z.object({ message: z.string().min(1).max(5000) });
  const aiConversationCreateSchema = z.object({ title: z.string().max(200).optional() });

  app.get("/api/ai/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const conversations = await storage.getAiConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/conversations", requireAuth, async (req, res) => {
    try {
      const parsed = aiConversationCreateSchema.safeParse(req.body);
      const userId = req.session.userId!;
      const instanceId = await resolveInstanceId(req);
      const conv = await storage.createAiConversation({
        userId,
        instanceId: instanceId || null,
        title: parsed.success ? (parsed.data.title || "New Conversation") : "New Conversation",
      });
      res.json(conv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await storage.getAiMessages(convId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const parsed = aiMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Message is required (1-5000 chars)" });
      }
      const { message } = parsed.data;
      const instanceId = conv.instanceId || (await resolveInstanceId(req)) || "";
      const result = await processAiMessage(conv.id, message, req.session.userId!, instanceId);
      res.json(result);
    } catch (error: any) {
      console.error("[AI Task Runner] Error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  app.delete("/api/ai/conversations/:id", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      await storage.deleteAiConversation(convId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
