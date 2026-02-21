import { Client } from "ssh2";

const SSH_TIMEOUT_MS = 15000;
const CMD_TIMEOUT_MS = 12000;

const ALLOWED_COMMANDS: Record<string, string> = {
  status: "ps aux | grep -E 'openclaw|openclaw-gateway' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'",
  start: "su - ubuntu -c 'nohup openclaw start > /tmp/openclaw.log 2>&1 &' && sleep 4 && ps aux | grep openclaw-gateway | grep -v grep && ss -tlnp | grep 18789 || echo 'Started but port may not be externally bound yet'",
  stop: "kill $(pgrep -f openclaw-gateway) $(pgrep -f 'openclaw start') $(pgrep -f 'openclaw node') 2>/dev/null; sleep 2 && (pgrep -f openclaw-gateway > /dev/null && echo 'Some processes still running, trying SIGKILL' && kill -9 $(pgrep -f openclaw-gateway) $(pgrep -f 'openclaw node') 2>/dev/null || echo 'OpenClaw processes stopped')",
  restart: "kill $(pgrep -f openclaw-gateway) $(pgrep -f 'openclaw start') $(pgrep -f 'openclaw node') 2>/dev/null; sleep 2; kill -9 $(pgrep -f openclaw-gateway) 2>/dev/null; sleep 1 && su - ubuntu -c 'nohup openclaw start > /tmp/openclaw.log 2>&1 &' && sleep 4 && ps aux | grep openclaw-gateway | grep -v grep && ss -tlnp | grep 18789 || echo 'Restarted but port may not be externally bound yet'",
  diagnose: "which openclaw && openclaw --version 2>/dev/null; echo '---PORTS---'; ss -tlnp | grep -E '18789|8080|3000'; echo '---PROCS---'; ps aux | grep -E 'openclaw|node' | grep -v grep; echo '---CONFIG---'; cat /etc/openclaw/config.yaml 2>/dev/null || cat ~/.openclaw/config.yaml 2>/dev/null || echo 'No config found'; echo '---FIREWALL---'; ufw status 2>/dev/null || iptables -L INPUT -n 2>/dev/null | head -20",
  "check-firewall": "ufw status verbose 2>/dev/null || iptables -L INPUT -n 2>/dev/null",
  "open-port": "ufw allow 18789/tcp 2>/dev/null && ufw reload 2>/dev/null && echo 'Port 18789 opened' || (iptables -I INPUT -p tcp --dport 18789 -j ACCEPT 2>/dev/null && echo 'Port 18789 opened via iptables')",
  "check-config": "cat /etc/openclaw/config.yaml 2>/dev/null || cat ~/.openclaw/config.yaml 2>/dev/null || cat /root/.openclaw/config.yaml 2>/dev/null || echo 'No config found'; echo '---ENV---'; env | grep -i openclaw 2>/dev/null || echo 'No openclaw env vars'",
  "bind-lan": "openclaw gateway config set --bind 0.0.0.0 2>/dev/null; openclaw config set gateway.bind 0.0.0.0 2>/dev/null; echo 'Bind set to 0.0.0.0 (LAN mode). Restart gateway to apply.'",
  "view-log": "tail -50 /tmp/openclaw.log 2>/dev/null || echo 'No log file found'",
};

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
}

interface SSHResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

function getDefaultConfig(): SSHConnectionConfig | null {
  const password = process.env.VPS_ROOT_PASSWORD;
  if (!password) return null;
  return {
    host: "72.60.167.64",
    port: 22,
    username: "root",
    password,
  };
}

export function buildSSHConfigFromVps(vps: { vpsIp: string; vpsPort: number; sshUser: string; sshKeyPath?: string | null }): SSHConnectionConfig {
  const config: SSHConnectionConfig = {
    host: vps.vpsIp,
    port: vps.vpsPort,
    username: vps.sshUser,
  };
  if (vps.sshKeyPath) {
    try {
      const fs = require("fs");
      config.privateKey = fs.readFileSync(vps.sshKeyPath, "utf8");
    } catch {}
  }
  if (!config.privateKey && process.env.VPS_ROOT_PASSWORD) {
    config.password = process.env.VPS_ROOT_PASSWORD;
  }
  return config;
}

export function getSSHConfig(overrides?: Partial<SSHConnectionConfig>): SSHConnectionConfig | null {
  const defaults = getDefaultConfig();
  if (!defaults && !overrides?.host) return null;
  return { ...defaults, ...overrides } as SSHConnectionConfig;
}

export function listAllowedCommands(): string[] {
  return Object.keys(ALLOWED_COMMANDS);
}

export async function executeSSHCommand(
  action: string,
  config?: SSHConnectionConfig
): Promise<SSHResult> {
  const command = ALLOWED_COMMANDS[action];
  if (!command) {
    return { success: false, output: "", error: `Unknown action: ${action}. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}` };
  }

  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured. Add a VPS connection or set VPS_ROOT_PASSWORD secret." };
  }

  return new Promise<SSHResult>((resolve) => {
    const conn = new Client();
    let resolved = false;

    const connectionTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        resolve({ success: false, output: "", error: "SSH connection timed out" });
      }
    }, SSH_TIMEOUT_MS);

    conn.on("ready", () => {
      clearTimeout(connectionTimeout);

      const cmdTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          conn.end();
          resolve({ success: false, output: "", error: "Command execution timed out" });
        }
      }, CMD_TIMEOUT_MS);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(cmdTimeout);
          if (!resolved) {
            resolved = true;
            conn.end();
            resolve({ success: false, output: "", error: err.message });
          }
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(cmdTimeout);
          if (!resolved) {
            resolved = true;
            conn.end();
            resolve({
              success: code === 0 || (action === "status" && stdout.trim().length > 0),
              output: stdout.trim(),
              error: stderr.trim() || undefined,
              exitCode: code,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(connectionTimeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, output: "", error: `SSH connection failed: ${err.message}` });
      }
    });

    conn.connect({
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.username || "root",
      password: sshConfig.password,
      privateKey: sshConfig.privateKey,
      readyTimeout: SSH_TIMEOUT_MS,
      algorithms: {
        kex: [
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
        ],
      },
    });
  });
}
