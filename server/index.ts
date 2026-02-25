import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import pg from "pg";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.set("trust proxy", 1);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  await pool.end();

  const PgStore = connectPgSimple(session);
  const isProduction = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || "openclaw-dev-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      },
    }),
  );

  const { seed } = await import("./seed");
  await seed();
  await registerRoutes(httpServer, app);

  const { setupGatewayProxy } = await import("./gateway-proxy");
  setupGatewayProxy(app, httpServer);

  try {
    const { hostinger } = await import("./hostinger");
    const portResult = await hostinger.ensurePortsOpen(["22", "18789"]);
    if (portResult.checked) {
      const opened = portResult.results.filter(r => r.action === "opened");
      if (opened.length > 0) {
        log(`Auto-opened firewall ports: ${opened.map(r => `${r.port} on ${r.firewallName}`).join(", ")}`, "hostinger");
      } else {
        log("Firewall ports 22 & 18789 already open", "hostinger");
      }
    }
  } catch (err) {
    console.error("[Hostinger] Auto port check skipped:", err);
  }

  (async () => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const instances = await storage.getInstances();
        const firstInstance = instances[0];
        const config = firstInstance ? await storage.getOpenclawConfig(String(firstInstance.id)) : undefined;
        if (config?.whatsappEnabled) {
          const { whatsappBot } = await import("./bot/whatsapp");
          const hasSession = await whatsappBot.checkAndLoadAuthState();
          if (hasSession) {
            console.log("[OpenClaw] WhatsApp has existing session, auto-reconnecting...");
            try {
              await whatsappBot.start();
              console.log("[OpenClaw] WhatsApp auto-reconnect initiated successfully");
            } catch (startErr) {
              console.error("[OpenClaw] WhatsApp auto-reconnect failed:", startErr);
            }
          } else {
            console.log("[OpenClaw] WhatsApp enabled but no session found. Waiting for user to pair via dashboard.");
          }
        } else {
          console.log("[OpenClaw] WhatsApp not enabled in config. Skipping auto-start.");
        }
        break;
      } catch (err) {
        console.error(`[OpenClaw] WhatsApp auto-start attempt ${attempt}/${maxRetries} failed:`, err);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        }
      }
    }
  })();

  setInterval(async () => {
    try {
      const instances = await storage.getInstances();
      const firstInstance = instances[0];
      const config = firstInstance ? await storage.getOpenclawConfig(String(firstInstance.id)) : undefined;
      if (!config?.whatsappEnabled) return;

      const { whatsappBot } = await import("./bot/whatsapp");
      const status = whatsappBot.getStatus();
      if (status.state === "disconnected" && !status.error) {
        const hasSession = await whatsappBot.checkAndLoadAuthState();
        if (hasSession) {
          console.log("[OpenClaw] Health check: bot is disconnected with valid session, auto-reconnecting...");
          await whatsappBot.start();
        }
      }
    } catch {}
  }, 120000);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const gracefulShutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    try {
      const { whatsappBot } = await import("./bot/whatsapp");
      if (whatsappBot.isConnected() || whatsappBot.getStatus().state !== "disconnected") {
        log("Stopping WhatsApp bot (session preserved in database)...");
        await whatsappBot.stopGracefully();
      }
    } catch {}
    httpServer.close(() => {
      log("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  const port = parseInt(process.env.PORT || "5000", 10);

  const killPortHolder = async (waitMs = 1000) => {
    try {
      const { execSync } = await import("child_process");
      const pids = execSync(`fuser ${port}/tcp 2>/dev/null || true`, { encoding: "utf-8" }).trim();
      if (pids) {
        const myPid = process.pid;
        const pidList = pids.split(/\s+/).filter(p => p && parseInt(p) !== myPid);
        if (pidList.length > 0) {
          log(`Killing stale processes on port ${port}: ${pidList.join(", ")}`);
          execSync(`kill -9 ${pidList.join(" ")} 2>/dev/null || true`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    } catch {}
  };

  const waitForPortFree = async (maxWaitMs = 10000) => {
    const { execSync } = await import("child_process");
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const pids = execSync(`fuser ${port}/tcp 2>/dev/null || true`, { encoding: "utf-8" }).trim();
        const myPid = process.pid;
        const otherPids = pids.split(/\s+/).filter(p => p && parseInt(p) !== myPid);
        if (otherPids.length === 0) return true;
        execSync(`kill -9 ${otherPids.join(" ")} 2>/dev/null || true`);
      } catch {
        return true;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  };

  const net = await import("net");
  const tryBindPort = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const tester = net.createServer();
      tester.once("error", () => { resolve(false); });
      tester.once("listening", () => { tester.close(() => resolve(true)); });
      tester.listen({ port, host: "0.0.0.0", exclusive: false });
    });
  };

  await killPortHolder(2000);
  await waitForPortFree(8000);

  let portRetries = 0;
  const MAX_PORT_RETRIES = 5;

  const startListening = () => {
    httpServer.listen({ port, host: "0.0.0.0", exclusive: false }, () => {
      log(`serving on port ${port}${portRetries > 0 ? ` (after retry ${portRetries})` : ""}`);
    });
  };

  httpServer.on("error", async (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && portRetries < MAX_PORT_RETRIES) {
      portRetries++;
      log(`Port ${port} in use (attempt ${portRetries}/${MAX_PORT_RETRIES}) — killing old process and retrying...`);
      await killPortHolder(2000);
      await waitForPortFree(5000);
      await new Promise(r => setTimeout(r, 1000));
      startListening();
    } else if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} still in use after ${MAX_PORT_RETRIES} retries. Exiting.`);
      process.exit(1);
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });

  startListening();
})();
