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

      const rawPath = req.query.path?.toString() || "/";
      const allowedPrefixes = ["/", "/__openclaw__/", "/assets/"];
      const canvasPath = allowedPrefixes.some(p => rawPath.startsWith(p)) ? rawPath : "/";

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

      const body = await resp.text();

      const baseUrl = `${workingProto}//${host}:${port}`;
      const rewritten = body
        .replace(/(href|src|action)="\/(?!\/)/g, `$1="${baseUrl}/`)
        .replace(/url\(["']?\/(?!\/)/g, `url("${baseUrl}/`);

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
      if (!instanceId) return res.json({ pending: [], source: "none" });

      const vps = instanceId ? await storage.getVpsConnection(instanceId) : null;
      if (vps?.vpsIp) {
        try {
          const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const result = await executeSSHCommand("list-pending-nodes", sshConfig);
          if (result.success && result.output) {
            try {
              let parsed = JSON.parse(result.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                parsed = Object.values(parsed);
              }
              if (Array.isArray(parsed)) {
                const normalized = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n, ip: "Unknown", os: "Unknown", location: "Unknown" };
                  const entry = { ...n };
                  if (!entry.id) entry.id = entry.hostname || entry.name || `node-${idx}`;
                  return entry;
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
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildApproveNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const cmd = buildApproveNodeCommand(node_id);
          const result = await executeRawSSHCommand(cmd, sshConfig);
          if (result.success && result.output) {
            try {
              const parsed = JSON.parse(result.output.trim());
              if (parsed.success) {
                sshApproved = true;
                approvedNode = parsed.node;
              } else if (parsed.error) {
                console.log(`[nodes] SSH approve returned: ${parsed.error}`);
              }
            } catch {}
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
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildRejectNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const cmd = buildRejectNodeCommand(node_id);
          const result = await executeRawSSHCommand(cmd, sshConfig);
          if (result.success && result.output) {
            try {
              const parsed = JSON.parse(result.output.trim());
              if (parsed.success) sshRejected = true;
            } catch {}
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

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      const instanceId = await resolveInstanceId(req);
      const config = instanceId ? await storage.getOpenclawConfig(instanceId) : null;
      res.json({
        state: status.state,
        qrDataUrl: status.qrDataUrl,
        pairingCode: status.pairingCode,
        phone: status.phone,
        error: status.error,
        runtime: "local",
        enabled: config?.whatsappEnabled ?? true,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp status" });
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
      bot.start();
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
      await bot.stop();
      await new Promise(resolve => setTimeout(resolve, 1000));
      bot.startWithPairingCode(cleaned);
      res.json({ success: true, message: "Requesting pairing code..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to request pairing code" });
    }
  });

  app.post("/api/whatsapp/stop", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: false });
      }
      const bot = await getWhatsappBot();
      await bot.stop();
      res.json({ success: true, message: "WhatsApp bot stopped" });
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
      const session = await storage.approveWhatsappSessionByCode(pairingCode);
      if (!session) {
        return res.status(404).json({ error: "No pending session found with that pairing code" });
      }
      if (!isProductionRuntime) {
        try {
          const bot = await getWhatsappBot();
          await bot.sendApprovalNotification(session.phone);
        } catch {}
      }
      res.json(session);
    } catch (error) {
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

  return httpServer;
}
