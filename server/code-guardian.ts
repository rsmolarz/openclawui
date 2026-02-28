import { storage } from "./storage";
import { executeRawSSHCommand, buildSSHConfigFromVps, type SSHConnectionConfig } from "./ssh";
import type { InsertGuardianLog } from "@shared/schema";

async function getSSHConfig(): Promise<SSHConnectionConfig> {
  const instances = await storage.getInstances();
  const defaultInstance = instances.find(i => i.isDefault);
  if (!defaultInstance) throw new Error("No default instance");
  const vps = await storage.getVpsConnection(defaultInstance.id);
  if (!vps) throw new Error("No VPS connection");
  return buildSSHConfigFromVps(vps);
}

async function logCheck(data: InsertGuardianLog) {
  return storage.createGuardianLog(data);
}

let homeBotStatusRef: (() => { state: string; phone: string | null; error: string | null; hostname: string | null; lastReport: Date | null }) | null = null;
let autoScanInterval: NodeJS.Timeout | null = null;
let scanInProgress = false;

function setHomeBotStatusRef(fn: typeof homeBotStatusRef) {
  homeBotStatusRef = fn;
}

function startAutoScan(intervalMs = 15 * 60 * 1000) {
  if (autoScanInterval) clearInterval(autoScanInterval);
  autoScanInterval = setInterval(async () => {
    try {
      await scanSystem();
    } catch (err) {
      console.error("[Guardian] Auto-scan error:", err);
    }
  }, intervalMs);
  console.log(`[Guardian] Auto-scan started (every ${intervalMs / 60000} min)`);
}

function stopAutoScan() {
  if (autoScanInterval) {
    clearInterval(autoScanInterval);
    autoScanInterval = null;
  }
}

async function scanSystem(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;

  try {
    await runScan();
  } finally {
    scanInProgress = false;
  }
}

async function runScan(): Promise<void> {
  let sshConfig: SSHConnectionConfig;
  try {
    sshConfig = await getSSHConfig();
  } catch (err: any) {
    await logCheck({
      type: "error",
      severity: "critical",
      message: "Cannot get SSH config: " + err.message,
      details: err.message,
      status: "detected",
      source: "code-guardian",
    });
    return;
  }

  const result = await executeRawSSHCommand("echo ok", sshConfig);
  if (result.success && result.output.trim().includes("ok")) {
    await logCheck({
      type: "connectivity",
      severity: "info",
      message: "VPS SSH connectivity OK",
      details: result.output,
      status: "detected",
      source: "ssh-check",
    });
  } else {
    await logCheck({
      type: "connectivity",
      severity: "critical",
      message: "VPS SSH connectivity failed",
      details: result.error || result.output,
      status: "detected",
      source: "ssh-check",
    });
    return;
  }

  const gwResult = await executeRawSSHCommand("ss -tlnp | grep 18789", sshConfig);
  if (gwResult.success && gwResult.output.trim().length > 0) {
    await logCheck({
      type: "service",
      severity: "info",
      message: "Gateway is listening on port 18789",
      details: gwResult.output,
      status: "detected",
      source: "gateway-check",
    });
  } else {
    await logCheck({
      type: "service",
      severity: "critical",
      message: "Gateway is NOT listening on port 18789",
      details: gwResult.output || gwResult.error || "Port 18789 not found",
      status: "detected",
      source: "gateway-check",
    });
  }

  const vpsBotResult = await executeRawSSHCommand(
    "systemctl is-active openclaw-whatsapp 2>/dev/null; echo '---'; systemctl is-enabled openclaw-whatsapp 2>/dev/null; echo '---'; ps aux | grep -c '[o]penclaw-whatsapp' 2>/dev/null",
    sshConfig
  );
  const parts = vpsBotResult.output.split("---").map(s => s.trim());
  const svcActive = parts[0] === "active";
  const svcEnabled = parts[1] === "enabled";
  const procCount = parseInt(parts[2] || "0", 10);
  const vpsBotActive = svcActive || procCount > 0;
  const vpsBotEnabled = svcEnabled;

  if (vpsBotActive || vpsBotEnabled) {
    await logCheck({
      type: "service",
      severity: "warning",
      message: `VPS WhatsApp bot is ${vpsBotActive ? "running" : "enabled"} — conflicts with home-bot`,
      details: `The VPS bot fights with the home-bot for the same WhatsApp session, causing repeated disconnections. Status: ${vpsBotResult.output.trim()}`,
      status: "detected",
      source: "vps-bot-conflict",
    });
  } else {
    await logCheck({
      type: "service",
      severity: "info",
      message: "VPS WhatsApp bot is properly disabled (no conflict)",
      details: vpsBotResult.output.trim(),
      status: "detected",
      source: "vps-bot-conflict",
    });
  }

  if (homeBotStatusRef) {
    const hbStatus = homeBotStatusRef();
    const lastReportAge = hbStatus.lastReport ? Date.now() - hbStatus.lastReport.getTime() : Infinity;
    const isRecent = lastReportAge < 120000;
    const isConnected = isRecent && hbStatus.state === "connected";

    if (isConnected) {
      await logCheck({
        type: "service",
        severity: "info",
        message: `WhatsApp home-bot connected on ${hbStatus.hostname || "unknown"} (phone: ${hbStatus.phone || "?"})`,
        details: `State: ${hbStatus.state}, last report: ${Math.round(lastReportAge / 1000)}s ago`,
        status: "detected",
        source: "whatsapp-homebot",
      });
    } else if (isRecent && hbStatus.state !== "connected") {
      await logCheck({
        type: "disconnect",
        severity: "warning",
        message: `WhatsApp home-bot is ${hbStatus.state} on ${hbStatus.hostname || "unknown"}`,
        details: `State: ${hbStatus.state}, error: ${hbStatus.error || "none"}, last report: ${Math.round(lastReportAge / 1000)}s ago`,
        status: "detected",
        source: "whatsapp-homebot",
      });
    } else {
      await logCheck({
        type: "disconnect",
        severity: "critical",
        message: "WhatsApp home-bot is not reporting (offline or crashed)",
        details: `Last report was ${hbStatus.lastReport ? Math.round(lastReportAge / 1000) + "s ago" : "never"}.`,
        status: "detected",
        source: "whatsapp-homebot",
      });
    }
  }

  const nodesResult = await executeRawSSHCommand("openclaw nodes status 2>&1 || echo 'nodes check failed'", sshConfig);
  await logCheck({
    type: "connectivity",
    severity: nodesResult.success ? "info" : "warning",
    message: nodesResult.success ? "Node connectivity check completed" : "Node connectivity check failed",
    details: nodesResult.output || nodesResult.error || "",
    status: "detected",
    source: "nodes-check",
  });

  const diskResult = await executeRawSSHCommand("df -h /", sshConfig);
  if (diskResult.success) {
    const lines = diskResult.output.trim().split("\n");
    const dataLine = lines.find(l => l.includes("/"));
    const useMatch = dataLine?.match(/(\d+)%/);
    const usage = useMatch ? parseInt(useMatch[1], 10) : 0;
    await logCheck({
      type: "resource",
      severity: usage > 90 ? "critical" : usage > 80 ? "warning" : "info",
      message: usage > 90 ? `Disk usage critical: ${usage}%` : `Disk usage: ${usage}%`,
      details: diskResult.output,
      status: "detected",
      source: "disk-check",
    });
  }

  const memResult = await executeRawSSHCommand("free -m", sshConfig);
  if (memResult.success) {
    const memLine = memResult.output.split("\n").find(l => l.startsWith("Mem:"));
    if (memLine) {
      const mParts = memLine.split(/\s+/);
      const total = parseInt(mParts[1], 10);
      const used = parseInt(mParts[2], 10);
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      await logCheck({
        type: "resource",
        severity: pct > 90 ? "critical" : pct > 80 ? "warning" : "info",
        message: pct > 90 ? `Memory usage critical: ${pct}%` : `Memory usage: ${pct}%`,
        details: memResult.output,
        status: "detected",
        source: "memory-check",
      });
    }
  }

  const dockerResult = await executeRawSSHCommand(
    "docker ps --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}' 2>/dev/null || echo 'NO_DOCKER'",
    sshConfig
  );
  if (dockerResult.success && !dockerResult.output.includes("NO_DOCKER")) {
    const containerLines = dockerResult.output.trim().split("\n").filter(l => l.trim());
    const unhealthy = containerLines.filter(l => l.toLowerCase().includes("unhealthy") || l.toLowerCase().includes("exited"));
    if (unhealthy.length > 0) {
      await logCheck({
        type: "service",
        severity: "warning",
        message: `${unhealthy.length} Docker container(s) unhealthy or exited`,
        details: unhealthy.join("\n"),
        status: "detected",
        source: "docker-check",
      });
    } else {
      await logCheck({
        type: "service",
        severity: "info",
        message: `${containerLines.length} Docker container(s) running normally`,
        details: dockerResult.output.substring(0, 500),
        status: "detected",
        source: "docker-check",
      });
    }
  }

  const envCheckResult = await executeRawSSHCommand(
    "for k in OPENAI_API_KEY GITHUB_TOKEN GEMINI_API_KEY NOTION_API_KEY ELEVENLABS_API_KEY ANTHROPIC_API_KEY; do if [ -z \"$(grep -s $k /etc/openclaw-env /root/.bashrc 2>/dev/null | head -1)\" ]; then echo \"MISSING:$k\"; fi; done",
    sshConfig
  );
  if (envCheckResult.success) {
    const missingKeys = envCheckResult.output.split("\n").filter(l => l.startsWith("MISSING:")).map(l => l.replace("MISSING:", ""));
    if (missingKeys.length > 0) {
      await logCheck({
        type: "error",
        severity: "warning",
        message: `${missingKeys.length} API key(s) not configured on VPS: ${missingKeys.join(", ")}`,
        details: `These keys are missing from /etc/openclaw-env and /root/.bashrc. Use "Sync from Replit" to push them.`,
        status: "detected",
        source: "api-keys-check",
      });
    } else {
      await logCheck({
        type: "service",
        severity: "info",
        message: "All core API keys are configured on VPS",
        details: "Checked: OPENAI, GITHUB, GEMINI, NOTION, ELEVENLABS, ANTHROPIC",
        status: "detected",
        source: "api-keys-check",
      });
    }
  }

  try {
    const instances = await storage.getInstances();
    const defaultInstance = instances.find(i => i.isDefault);
    if (defaultInstance) {
      const integrations = await storage.getIntegrations();
      const webhookIntegrations = integrations.filter(i => i.enabled && i.config && typeof i.config === "object");
      for (const integration of webhookIntegrations.slice(0, 5)) {
        const config = integration.config as Record<string, any>;
        const webhookUrl = config.webhookUrl || config.url;
        if (webhookUrl && typeof webhookUrl === "string" && webhookUrl.startsWith("http")) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(webhookUrl, { method: "HEAD", signal: controller.signal }).catch(() => null);
            clearTimeout(timeout);
            if (!resp || !resp.ok) {
              await logCheck({
                type: "service",
                severity: "warning",
                message: `Webhook unreachable: ${integration.name} (${webhookUrl.substring(0, 60)})`,
                details: `HTTP status: ${resp?.status || "timeout/error"}`,
                status: "detected",
                source: "webhook-check",
              });
            }
          } catch {}
        }
      }
    }
  } catch {}
}

async function attemptFix(logId: string): Promise<void> {
  const logs = await storage.getGuardianLogs();
  const log = logs.find(l => l.id === logId);
  if (!log) throw new Error("Guardian log not found");

  await storage.updateGuardianLog(logId, { status: "fixing" });

  let sshConfig: SSHConnectionConfig;
  try {
    sshConfig = await getSSHConfig();
  } catch (err: any) {
    await storage.updateGuardianLog(logId, { status: "failed", resolution: "Cannot get SSH config: " + err.message });
    return;
  }

  if (log.source === "gateway-check" && log.severity !== "info") {
    const restartResult = await executeRawSSHCommand(
      "kill -9 $(pgrep -f 'openclaw gateway') 2>/dev/null; sleep 2; nohup openclaw gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 5; ss -tlnp | grep 18789",
      sshConfig
    );
    if (restartResult.success && restartResult.output.includes("18789")) {
      await storage.updateGuardianLog(logId, { status: "fixed", resolution: "Gateway restarted successfully" });
    } else {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "Gateway restart failed: " + (restartResult.output || restartResult.error) });
    }
    return;
  }

  if (log.source === "vps-bot-conflict" && log.severity !== "info") {
    const stopResult = await executeRawSSHCommand(
      "systemctl stop openclaw-whatsapp 2>/dev/null; systemctl disable openclaw-whatsapp 2>/dev/null; pkill -f 'openclaw-whatsapp' 2>/dev/null; sleep 1; systemctl is-active openclaw-whatsapp 2>/dev/null || echo 'stopped'",
      sshConfig
    );
    if (stopResult.success && (stopResult.output.includes("inactive") || stopResult.output.includes("stopped"))) {
      await storage.updateGuardianLog(logId, { status: "fixed", resolution: "VPS WhatsApp bot stopped and disabled." });
    } else {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "Failed to stop VPS bot: " + (stopResult.output || stopResult.error) });
    }
    return;
  }

  if (log.source === "whatsapp-homebot" && log.severity !== "info") {
    await storage.updateGuardianLog(logId, { status: "failed", resolution: "Home-bot runs on your local machine. Restart it manually." });
    return;
  }

  if (log.source === "docker-check" && log.severity !== "info") {
    const restartResult = await executeRawSSHCommand(
      "docker ps -q --filter 'status=exited' | xargs -r docker restart 2>&1; echo 'Done'; docker ps --format '{{.Names}} {{.Status}}' 2>&1",
      sshConfig
    );
    if (restartResult.success) {
      await storage.updateGuardianLog(logId, { status: "fixed", resolution: "Exited containers restarted. " + restartResult.output.substring(0, 200) });
    } else {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "Docker restart failed: " + (restartResult.output || restartResult.error) });
    }
    return;
  }

  if (log.source === "api-keys-check" && log.severity !== "info") {
    try {
      const keys: Record<string, string | undefined> = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GITHUB_TOKEN: process.env.OPENCLAW_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
        NOTION_API_KEY: process.env.NOTION_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      };
      const lines: string[] = [];
      for (const [k, v] of Object.entries(keys)) {
        if (v) lines.push(`grep -q "^${k}=" /etc/openclaw-env 2>/dev/null || echo '${k}="${v.replace(/'/g, "'\\''")}"' >> /etc/openclaw-env; grep -q "^export ${k}=" /root/.bashrc || echo 'export ${k}="${v.replace(/'/g, "'\\''")}"' >> /root/.bashrc`);
      }
      if (lines.length > 0) {
        const syncResult = await executeRawSSHCommand(lines.join(" && ") + " && echo 'synced'", sshConfig);
        if (syncResult.success && syncResult.output.includes("synced")) {
          await storage.updateGuardianLog(logId, { status: "fixed", resolution: "API keys synced from Replit to VPS" });
        } else {
          await storage.updateGuardianLog(logId, { status: "failed", resolution: "Sync failed: " + (syncResult.output || syncResult.error) });
        }
      } else {
        await storage.updateGuardianLog(logId, { status: "failed", resolution: "No API keys available in Replit secrets to sync" });
      }
    } catch (e: any) {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "Sync error: " + e.message });
    }
    return;
  }

  if (log.source === "disk-check" && log.severity !== "info") {
    const cleanResult = await executeRawSSHCommand(
      "rm -rf /tmp/* /var/tmp/* 2>/dev/null; apt-get clean 2>/dev/null; journalctl --vacuum-size=100M 2>/dev/null; df -h /",
      sshConfig
    );
    if (cleanResult.success) {
      await storage.updateGuardianLog(logId, { status: "fixed", resolution: "Temp files cleared. Current disk: " + cleanResult.output.trim() });
    } else {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "Disk cleanup failed: " + (cleanResult.output || cleanResult.error) });
    }
    return;
  }

  await storage.updateGuardianLog(logId, { status: "failed", resolution: "No automatic fix available for this issue type" });
}

export { scanSystem, attemptFix, setHomeBotStatusRef, startAutoScan, stopAutoScan };
