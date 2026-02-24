import { Client } from "ssh2";

const SSH_TIMEOUT_MS = 30000;
const CMD_TIMEOUT_MS = 30000;

const ALLOWED_COMMANDS: Record<string, string> = {
  status: "ps aux | grep -E 'openclaw' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'",
  start: "nohup openclaw gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 5 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp | grep 18789 || echo 'Started but port may not be externally bound yet'",
  stop: "kill -9 $(pgrep -f 'openclaw gateway') $(pgrep -f 'openclaw-gateway') $(pgrep -f 'openclaw node') 2>/dev/null; sleep 1; pgrep -f openclaw > /dev/null && kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 1 && echo 'OpenClaw processes stopped'",
  restart: "kill -9 $(pgrep -f 'openclaw') 2>/dev/null; sleep 2; nohup openclaw gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 5; ps aux | grep openclaw | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'; echo '---LOG---'; tail -10 /tmp/openclaw.log",
  diagnose: "which openclaw && openclaw --version 2>/dev/null; echo '---PORTS---'; ss -tlnp | grep -E '18789|8080|3000'; echo '---PROCS---'; ps aux | grep -E 'openclaw|node' | grep -v grep; echo '---CONFIG---'; cat /etc/openclaw/config.yaml 2>/dev/null || cat ~/.openclaw/config.yaml 2>/dev/null || cat /root/.openclaw/config.yaml 2>/dev/null || echo 'No config found'; echo '---FIREWALL---'; ufw status 2>/dev/null || iptables -L INPUT -n 2>/dev/null | head -20",
  "check-firewall": "ufw status verbose 2>/dev/null || iptables -L INPUT -n 2>/dev/null",
  "open-port": "ufw allow 18789/tcp 2>/dev/null && ufw reload 2>/dev/null && echo 'Port 18789 opened' || (iptables -I INPUT -p tcp --dport 18789 -j ACCEPT 2>/dev/null && echo 'Port 18789 opened via iptables')",
  "check-config": "echo '---openclaw.json---'; cat /root/.openclaw/openclaw.json 2>/dev/null || echo 'Not found'; echo '---node.json---'; cat /root/.openclaw/node.json 2>/dev/null || echo 'Not found'; echo '---pending.json---'; cat /root/.openclaw/devices/pending.json 2>/dev/null || echo 'Not found'; echo '---paired.json---'; cat /root/.openclaw/devices/paired.json 2>/dev/null || echo 'Not found'; echo '---ENV---'; env | grep -i openclaw 2>/dev/null || echo 'No openclaw env vars'",
  "fix-binding": "sed -i 's/\"bind\": \"lan\"/\"bind\": \"0.0.0.0\"/g' /root/.openclaw/openclaw.json && sed -i 's/\"host\": \"127.0.0.1\"/\"host\": \"0.0.0.0\"/g' /root/.openclaw/node.json && echo 'Config updated. Verify:' && grep -A2 bind /root/.openclaw/openclaw.json && grep host /root/.openclaw/node.json && echo '---Now killing processes---' && kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 3 && echo '---Starting gateway---' && nohup openclaw gateway --port 18789 > /tmp/openclaw.log 2>&1 & sleep 7 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp | grep 18789 && echo '---LOG---' && tail -10 /tmp/openclaw.log || echo 'Port 18789 still not listening externally'",
  "find-config-location": "find / -maxdepth 4 -name '*.yaml' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.yml' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.json' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.toml' -path '*openclaw*' 2>/dev/null; echo '---NPM---'; ls -la /usr/lib/node_modules/openclaw/ 2>/dev/null | head -20; echo '---BIN---'; which openclaw-gateway; file $(which openclaw-gateway) 2>/dev/null; ls -la /usr/local/bin/openclaw* 2>/dev/null; echo '---OPENCLAW-DIR---'; ls -la /usr/lib/node_modules/openclaw/dist/ 2>/dev/null | head -20",
  "try-env-bind": "kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 2; nohup env OPENCLAW_HOST=0.0.0.0 OPENCLAW_BIND=0.0.0.0 HOST=0.0.0.0 GATEWAY_HOST=0.0.0.0 openclaw gateway --port 18789 > /tmp/openclaw.log 2>&1 & sleep 6; ps aux | grep openclaw | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789; echo '---LOG---'; tail -20 /tmp/openclaw.log",
  "view-log": "tail -80 /tmp/openclaw.log 2>/dev/null || echo 'No log file found'",
  "all-ports": "ss -tlnp; echo '---NETSTAT---'; netstat -tlnp 2>/dev/null || echo 'No netstat'",
  "gateway-help": "openclaw gateway --help 2>&1; echo '---CONFIGURE-HELP---'; openclaw configure --help 2>&1",
  "check-node-json": "cat /root/.openclaw/node.json && echo '---OPENCLAW-JSON-GATEWAY---' && cat /root/.openclaw/openclaw.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get(\"gateway\",{}), indent=2))'",
  "set-gateway-mode": "python3 -c \"import json; f='/root/.openclaw/openclaw.json'; d=json.load(open(f)); d['gateway']['bind']='lan'; json.dump(d,open(f,'w'),indent=2); print('Updated gateway config:'); print(json.dumps(d['gateway'],indent=2))\"",
  "set-gateway-lan-no-ts": "python3 -c \"import json; f='/root/.openclaw/openclaw.json'; d=json.load(open(f)); d['gateway']['bind']='lan'; d['gateway']['tailscale']={'mode':'off','resetOnExit':True}; json.dump(d,open(f,'w'),indent=2); print('Updated gateway config:'); print(json.dumps(d['gateway'],indent=2))\"",
  "fix-and-restart": "nohup openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw.log 2>&1 & sleep 10 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp && echo '---LOG---' && tail -30 /tmp/openclaw.log",
  "gateway-stop": "openclaw gateway stop 2>&1 && sleep 2 && kill -9 $(pgrep -f openclaw) 2>/dev/null; echo 'Gateway stopped'; ps aux | grep openclaw | grep -v grep || echo 'No openclaw processes'",
  "gateway-start-lan": "rm -f /tmp/oc.log; nohup openclaw gateway run --bind lan --port 18789 --force --verbose > /tmp/oc.log 2>&1 & echo 'Started PID:' $! && sleep 15 && echo '---PROCS---' && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp && echo '---LOG---' && cat /tmp/oc.log",
  "read-oc-log": "cat /tmp/oc.log 2>/dev/null || echo 'No log'",
  "list-nodes": "openclaw node list 2>/dev/null || openclaw nodes 2>/dev/null || echo 'Could not list nodes'",
  "list-pending-nodes": "cat /root/.openclaw/devices/pending.json 2>/dev/null || echo '[]'",
  "list-paired-nodes": "cat /root/.openclaw/devices/paired.json 2>/dev/null || echo '[]'",
  "gateway-info": "openclaw gateway status 2>/dev/null; echo '---TOKEN---'; openclaw gateway token 2>/dev/null || echo 'No token command'; echo '---VERSION---'; openclaw --version 2>/dev/null",
  "check-systemd": "systemctl list-units --type=service | grep -i openclaw; echo '---SERVICE---'; systemctl cat openclaw 2>/dev/null || systemctl cat openclaw-gateway 2>/dev/null || echo 'No systemd service found'; echo '---STATUS---'; systemctl status openclaw 2>/dev/null || systemctl status openclaw-gateway 2>/dev/null || echo 'No systemd status'; echo '---SUPERVISOR---'; supervisorctl status 2>/dev/null || echo 'No supervisor'; echo '---PM2---'; pm2 list 2>/dev/null || echo 'No pm2'",
  "fix-systemd-binding": "SVC=$(systemctl list-unit-files | grep -i openclaw | awk '{print $1}' | head -1); if [ -n \"$SVC\" ]; then systemctl stop $SVC; SVCFILE=$(systemctl show -p FragmentPath $SVC | cut -d= -f2); if [ -f \"$SVCFILE\" ]; then sed -i 's/--host 127.0.0.1/--host 0.0.0.0/g' $SVCFILE; sed -i 's/--host localhost/--host 0.0.0.0/g' $SVCFILE; systemctl daemon-reload; systemctl start $SVC; sleep 3; echo \"Updated and restarted $SVC\"; cat $SVCFILE; echo '---PORTS---'; ss -tlnp | grep 18789; else echo \"Service file not found for $SVC\"; fi; else echo 'No openclaw systemd service found'; fi",
  "cli-devices-list": `openclaw devices list --url ws://127.0.0.1:18789 --token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["gateway"]["auth"]["token"])')" --json 2>&1 || echo '{"error":"command failed"}'`,
  "cli-nodes-status": `openclaw nodes status --url ws://127.0.0.1:18789 --token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["gateway"]["auth"]["token"])')" --json 2>&1 || echo '{"error":"command failed"}'`,
  "cli-nodes-pending": `openclaw nodes pending --url ws://127.0.0.1:18789 --token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["gateway"]["auth"]["token"])')" --json 2>&1 || echo '{"error":"command failed"}'`,
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

export function buildApproveNodeCommand(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid node ID for approval");
  }
  return `python3 -c "
import json, os, sys
pending_path = '/root/.openclaw/devices/pending.json'
paired_path = '/root/.openclaw/devices/paired.json'
node_id = '${safeId}'
if not os.path.exists(pending_path):
    print(json.dumps({'error': 'No pending.json found'})); sys.exit(1)
with open(pending_path) as f:
    pending = json.load(f)
if isinstance(pending, dict):
    pending = list(pending.values()) if pending else []
node = None
remaining = []
for n in pending:
    nid = n.get('id','') if isinstance(n, dict) else str(n)
    if nid == node_id:
        node = n
    else:
        remaining.append(n)
if not node:
    print(json.dumps({'error': 'Node not found in pending'})); sys.exit(1)
paired = []
if os.path.exists(paired_path):
    with open(paired_path) as f:
        paired = json.load(f)
    if isinstance(paired, dict):
        paired = list(paired.values()) if paired else []
paired.append(node)
os.makedirs(os.path.dirname(pending_path), exist_ok=True)
with open(pending_path, 'w') as f:
    json.dump(remaining, f, indent=2)
with open(paired_path, 'w') as f:
    json.dump(paired, f, indent=2)
print(json.dumps({'success': True, 'node': node, 'remaining_pending': len(remaining), 'total_paired': len(paired)}))
"`;
}

export function buildCliApproveCommand(requestId: string): string {
  const safeId = requestId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid request ID for approval");
  }
  return `openclaw devices approve "${safeId}" --url ws://127.0.0.1:18789 --token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[\"gateway\"][\"auth\"][\"token\"])')" --json 2>&1`;
}

export function buildCliRejectCommand(requestId: string): string {
  const safeId = requestId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid request ID for rejection");
  }
  return `openclaw devices reject "${safeId}" --url ws://127.0.0.1:18789 --token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[\"gateway\"][\"auth\"][\"token\"])')" --json 2>&1`;
}

export function buildRejectNodeCommand(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid node ID for rejection");
  }
  return `python3 -c "
import json, os, sys
pending_path = '/root/.openclaw/devices/pending.json'
node_id = '${safeId}'
if not os.path.exists(pending_path):
    print(json.dumps({'error': 'No pending.json found'})); sys.exit(1)
with open(pending_path) as f:
    pending = json.load(f)
if isinstance(pending, dict):
    pending = list(pending.values()) if pending else []
remaining = []
removed = False
for n in pending:
    nid = n.get('id','') if isinstance(n, dict) else str(n)
    if nid == node_id:
        removed = True
    else:
        remaining.append(n)
if not removed:
    print(json.dumps({'error': 'Node not found in pending'})); sys.exit(1)
with open(pending_path, 'w') as f:
    json.dump(remaining, f, indent=2)
print(json.dumps({'success': True, 'remaining_pending': len(remaining)}))
"`;
}

export async function executeRawSSHCommand(
  command: string,
  config?: SSHConnectionConfig,
  retries = 1,
  cmdTimeoutMs?: number
): Promise<SSHResult> {
  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured." };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await executeSSHOnce(command, "raw", sshConfig, cmdTimeoutMs);
    if (result.success || attempt === retries) return result;
    if (result.error?.includes("timed out") || result.error?.includes("connection failed")) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return result;
  }

  return { success: false, output: "", error: "SSH failed after retries" };
}

export async function executeSSHCommand(
  action: string,
  config?: SSHConnectionConfig,
  retries = 1
): Promise<SSHResult> {
  const command = ALLOWED_COMMANDS[action];
  if (!command) {
    return { success: false, output: "", error: `Unknown action: ${action}. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}` };
  }

  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured. Add a VPS connection or set VPS_ROOT_PASSWORD secret." };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await executeSSHOnce(command, action, sshConfig);
    if (result.success || attempt === retries) return result;
    if (result.error?.includes("timed out") || result.error?.includes("connection failed")) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return result;
  }

  return { success: false, output: "", error: "SSH failed after retries" };
}

function executeSSHOnce(
  command: string,
  action: string,
  sshConfig: SSHConnectionConfig,
  cmdTimeoutMs?: number
): Promise<SSHResult> {
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
      }, cmdTimeoutMs || CMD_TIMEOUT_MS);

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
