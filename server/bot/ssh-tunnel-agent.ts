import { Client } from "ssh2";
import * as https from "https";
import * as tls from "tls";
import * as net from "net";

interface TunnelConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export class SSHTunnelAgent extends https.Agent {
  private sshClient: Client | null = null;
  private proxyServer: net.Server | null = null;
  private proxyPort: number = 0;
  private tunnelConfig: TunnelConfig;
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (err: Error) => void;

  constructor(tunnelConfig: TunnelConfig) {
    super({ keepAlive: true });
    this.tunnelConfig = tunnelConfig;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.connectSSH();
      await this.startProxy();
      this.ready = true;
      this.readyResolve();
      console.log(`[SSH-Tunnel] Ready: local proxy on port ${this.proxyPort} → web.whatsapp.com:443 via VPS`);
    } catch (err: any) {
      console.error("[SSH-Tunnel] Initialization failed:", err.message);
      this.readyReject(err);
    }
  }

  private connectSSH(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on("ready", () => {
        console.log("[SSH-Tunnel] SSH connection established to VPS");
        this.sshClient = client;
        resolve();
      });

      client.on("error", (err) => {
        console.error("[SSH-Tunnel] SSH error:", err.message);
        reject(err);
      });

      client.on("close", () => {
        console.log("[SSH-Tunnel] SSH connection closed");
        this.sshClient = null;
        this.ready = false;
      });

      const config: any = {
        host: this.tunnelConfig.host,
        port: this.tunnelConfig.port,
        username: this.tunnelConfig.username,
        readyTimeout: 30000,
        keepaliveInterval: 15000,
      };

      if (this.tunnelConfig.privateKey) {
        config.privateKey = this.tunnelConfig.privateKey;
      } else if (this.tunnelConfig.password) {
        config.password = this.tunnelConfig.password;
      }

      client.connect(config);
    });
  }

  private startProxy(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((localSocket) => {
        if (!this.sshClient) {
          localSocket.destroy();
          return;
        }

        this.sshClient.forwardOut(
          "127.0.0.1",
          0,
          "web.whatsapp.com",
          443,
          (err, stream) => {
            if (err) {
              console.error("[SSH-Tunnel] forwardOut error:", err.message);
              localSocket.destroy();
              return;
            }

            stream.on("error", () => localSocket.destroy());
            localSocket.on("error", () => stream.destroy());

            localSocket.pipe(stream);
            stream.pipe(localSocket);
          }
        );
      });

      server.on("error", reject);

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        this.proxyPort = addr.port;
        this.proxyServer = server;
        resolve();
      });
    });
  }

  createConnection(options: any): tls.TLSSocket {
    const servername = options?.servername || options?.host || "web.whatsapp.com";
    const rawSocket = net.connect({ host: "127.0.0.1", port: this.proxyPort });
    const tlsSocket = tls.connect({
      socket: rawSocket,
      servername,
      rejectUnauthorized: true,
    });
    return tlsSocket;
  }

  waitReady(): Promise<void> {
    return this.readyPromise;
  }

  destroy(): void {
    if (this.proxyServer) {
      try { this.proxyServer.close(); } catch {}
      this.proxyServer = null;
    }
    if (this.sshClient) {
      try { this.sshClient.end(); } catch {}
      this.sshClient = null;
    }
    this.ready = false;
    this.proxyPort = 0;
    super.destroy();
  }
}

export async function createWhatsAppTunnelAgent(): Promise<SSHTunnelAgent | null> {
  const password = process.env.VPS_ROOT_PASSWORD;
  if (!password) {
    console.log("[SSH-Tunnel] No VPS_ROOT_PASSWORD set, WhatsApp will connect directly");
    return null;
  }

  const agent = new SSHTunnelAgent({
    host: "72.60.167.64",
    port: 22,
    username: "root",
    password,
  });

  try {
    await agent.waitReady();
    return agent;
  } catch (err: any) {
    console.error("[SSH-Tunnel] Failed to create tunnel agent:", err.message);
    try { agent.destroy(); } catch {}
    return null;
  }
}
