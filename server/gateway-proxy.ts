import http from "http";
import { URL } from "url";
import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { storage } from "./storage";

const PROXY_PATH_PREFIX = "/gateway-proxy";
const WS_PROXY_PATH = "/gateway-ws";

async function getGatewayUrl(instanceId?: string): Promise<string | null> {
  try {
    const instances = await storage.getInstances();
    const instance = instanceId
      ? instances.find((i) => String(i.id) === instanceId)
      : instances.find((i) => i.isDefault) || instances[0];
    if (!instance?.serverUrl) return null;
    return instance.serverUrl;
  } catch {
    return null;
  }
}

export function setupGatewayProxy(app: Express, httpServer: Server) {
  app.use((req: Request, res: Response, next) => {
    if (!req.path.startsWith(PROXY_PATH_PREFIX + "/")) return next();

    const pathAfterPrefix = req.path.slice(PROXY_PATH_PREFIX.length + 1);
    const slashIdx = pathAfterPrefix.indexOf("/");
    const instanceId = slashIdx === -1 ? pathAfterPrefix : pathAfterPrefix.slice(0, slashIdx);
    const afterWildcard = slashIdx === -1 ? "" : pathAfterPrefix.slice(slashIdx + 1);

    (async () => {
    const targetBase = await getGatewayUrl(instanceId);
    if (!targetBase) {
      res.status(502).json({ error: "No gateway URL configured for this instance" });
      return;
    }
    const targetUrl = new URL(afterWildcard, targetBase);
    targetUrl.search = new URL(req.url, "http://localhost").search;

    const parsedTarget = new URL(targetBase);

    const fwdHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key !== "connection" && key !== "upgrade" && key !== "host" && typeof value === "string") {
        fwdHeaders[key] = value;
      }
    }
    fwdHeaders["host"] = `${parsedTarget.hostname}:${parsedTarget.port || 80}`;

    const options: http.RequestOptions = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || 80,
      path: `/${afterWildcard}${targetUrl.search}`,
      method: req.method,
      headers: fwdHeaders,
      timeout: 15000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";

      if (contentType.includes("text/html")) {
        let body = "";
        proxyRes.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        proxyRes.on("end", () => {
          const basePath = `${PROXY_PATH_PREFIX}/${instanceId}/`;
          let modified = body
            .replace(/(href|src)="\.?\//g, `$1="${basePath}`)
            .replace(/(href|src)="\.\//g, `$1="${basePath}`);

          const proto = req.get("x-forwarded-proto") || req.protocol;
          const wsUrl = `${proto === "https" ? "wss" : "ws"}://${req.get("host")}${WS_PROXY_PATH}/${instanceId}`;

          const injectScript = `
<script>
(function() {
  const _OrigWS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    if (url && (url.includes('${parsedTarget.hostname}') || url.includes('localhost:${parsedTarget.port}'))) {
      url = '${wsUrl}';
    }
    return new _OrigWS(url, protocols);
  };
  window.WebSocket.prototype = _OrigWS.prototype;
  window.WebSocket.CONNECTING = _OrigWS.CONNECTING;
  window.WebSocket.OPEN = _OrigWS.OPEN;
  window.WebSocket.CLOSING = _OrigWS.CLOSING;
  window.WebSocket.CLOSED = _OrigWS.CLOSED;
})();
</script>`;

          modified = modified.replace("<head>", `<head>${injectScript}`);

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (key !== "content-length" && key !== "content-encoding" && key !== "transfer-encoding" && value) {
              headers[key] = Array.isArray(value) ? value.join(", ") : value;
            }
          }
          headers["content-length"] = Buffer.byteLength(modified).toString();

          res.writeHead(proxyRes.statusCode || 200, headers);
          res.end(modified);
        });
      } else {
        const headers: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) headers[key] = value;
        }
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on("error", (err) => {
      console.error("[gateway-proxy] HTTP proxy error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Gateway unreachable" });
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Gateway timeout" });
      }
    });

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      if ((req as any).rawBody) {
        proxyReq.write((req as any).rawBody);
      }
    }
    proxyReq.end();
    })().catch((err) => {
      console.error("[gateway-proxy] Error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy error" });
      }
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (request, socket, head) => {
    const url = request.url || "";

    console.log(`[gateway-proxy] Upgrade request: url=${url}, headers=${JSON.stringify({
      host: request.headers.host,
      upgrade: request.headers.upgrade,
      connection: request.headers.connection,
      origin: request.headers.origin,
    })}`);

    if (url.startsWith("/vite-hmr") || url.startsWith("/__vite")) {
      return;
    }

    let instanceId: string | undefined;

    if (url.startsWith(WS_PROXY_PATH)) {
      const pathParts = url.replace(WS_PROXY_PATH + "/", "").split("?");
      instanceId = pathParts[0]?.split("/")[0];
    } else if (url === "/" || url === "" || url.startsWith("/?")) {
      instanceId = undefined;
    } else if (url.startsWith("/node-ws")) {
      instanceId = undefined;
    } else {
      console.log(`[gateway-proxy] Ignoring upgrade for unmatched path: ${url}`);
      return;
    }

    const targetBase = await getGatewayUrl(instanceId);
    if (!targetBase) {
      console.log(`[gateway-proxy] No gateway URL configured, destroying socket`);
      socket.destroy();
      return;
    }

    const parsedTarget = new URL(targetBase);
    const wsTargetUrl = `ws://${parsedTarget.hostname}:${parsedTarget.port || 18789}`;
    const source = instanceId ? `explicit:${instanceId}` : "node-root";

    console.log(`[gateway-proxy] Proxying WS ${source} -> ${wsTargetUrl}`);

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      console.log(`[gateway-proxy] Client WebSocket upgraded successfully (source: ${source})`);
      
      const fwdHeaders: Record<string, string> = {};
      if (request.headers.authorization) {
        fwdHeaders.authorization = request.headers.authorization;
      }
      for (const [key, value] of Object.entries(request.headers)) {
        if (key.startsWith("x-openclaw") && typeof value === "string") {
          fwdHeaders[key] = value;
        }
      }
      
      const gatewayWs = new WebSocket(wsTargetUrl, {
        headers: fwdHeaders,
      });

      gatewayWs.on("open", () => {
        console.log(`[gateway-proxy] WS connected to ${wsTargetUrl} (source: ${source})`);
      });

      gatewayWs.on("message", (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      gatewayWs.on("close", (code, reason) => {
        console.log(`[gateway-proxy] Gateway WS closed: code=${code}, reason=${reason?.toString()}`);
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(code, reason);
        }
      });

      gatewayWs.on("error", (err) => {
        console.error("[gateway-proxy] WS gateway error:", err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, "gateway error");
        }
      });

      clientWs.on("message", (data, isBinary) => {
        const preview = isBinary ? `[binary ${(data as Buffer).length}b]` : String(data).slice(0, 120);
        console.log(`[gateway-proxy] Client->Gateway: ${preview}`);
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.send(data, { binary: isBinary });
        }
      });

      clientWs.on("close", (code, reason) => {
        console.log(`[gateway-proxy] Client WS closed: code=${code}, reason=${reason?.toString()}`);
        if (gatewayWs.readyState === WebSocket.OPEN || gatewayWs.readyState === WebSocket.CONNECTING) {
          gatewayWs.close();
        }
      });

      clientWs.on("error", (err) => {
        console.error("[gateway-proxy] WS client error:", err.message);
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.close();
        }
      });
    });
  });

  console.log("[gateway-proxy] HTTP proxy at /gateway-proxy/:instanceId/*, WS proxy at /gateway-ws/:instanceId and / (root)");
}
