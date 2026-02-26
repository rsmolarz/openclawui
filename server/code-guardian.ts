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

async function scanSystem(): Promise<void> {
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

  const waResult = await executeRawSSHCommand("systemctl is-active openclaw-whatsapp", sshConfig);
  const waActive = waResult.success && waResult.output.trim() === "active";
  await logCheck({
    type: "service",
    severity: waActive ? "info" : "warning",
    message: waActive ? "WhatsApp bot is active" : "WhatsApp bot is not active",
    details: waResult.output || waResult.error || "",
    status: "detected",
    source: "whatsapp-check",
  });

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
      const parts = memLine.split(/\s+/);
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
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
}

async function attemptFix(logId: string): Promise<void> {
  const logs = await storage.getGuardianLogs();
  const log = logs.find(l => l.id === logId);
  if (!log) throw new Error("Guardian log not found");

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

  if (log.source === "whatsapp-check" && log.severity !== "info") {
    const restartResult = await executeRawSSHCommand("systemctl restart openclaw-whatsapp && sleep 3 && systemctl is-active openclaw-whatsapp", sshConfig);
    if (restartResult.success && restartResult.output.trim().includes("active")) {
      await storage.updateGuardianLog(logId, { status: "fixed", resolution: "WhatsApp bot restarted successfully" });
    } else {
      await storage.updateGuardianLog(logId, { status: "failed", resolution: "WhatsApp bot restart failed: " + (restartResult.output || restartResult.error) });
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

export { scanSystem, attemptFix };
