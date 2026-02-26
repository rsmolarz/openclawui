import { executeRawSSHCommand, buildSSHConfigFromVps } from "../server/ssh";
import { storage } from "../server/storage";
import { readFileSync } from "fs";
import { join } from "path";

async function deploy() {
  const instances = await storage.getInstances();
  const defaultInstance = instances.find(i => i.isDefault);
  if (!defaultInstance) { console.log("No default instance"); return; }
  const vps = await storage.getVpsConnection(defaultInstance.id);
  if (!vps) { console.log("No VPS"); return; }
  const sshConfig = buildSSHConfigFromVps(vps);

  const keys = await storage.getApiKeys();
  const activeKey = keys.find(k => k.active && k.name === "Production API");
  if (!activeKey) { console.log("No active API key found"); return; }

  const dashboardUrl = process.env.REPLIT_DEV_DOMAIN 
    ? "https://" + process.env.REPLIT_DEV_DOMAIN
    : "https://claw-settings.replit.app";

  console.log("Dashboard:", dashboardUrl);
  console.log("API key:", activeKey.key.substring(0, 10) + "...");

  await executeRawSSHCommand("mkdir -p /root/openclaw-whatsapp", sshConfig, 0, 10000);

  const pkgJson = readFileSync(join(process.cwd(), "vps-bot/package.json"), "utf8");
  await executeRawSSHCommand("cat > /root/openclaw-whatsapp/package.json << 'PKGEOF'\n" + pkgJson + "\nPKGEOF", sshConfig, 0, 10000);

  const botScript = readFileSync(join(process.cwd(), "vps-bot/index.mjs"), "utf8");
  let r = await executeRawSSHCommand("cat > /root/openclaw-whatsapp/index.mjs << 'BOTEOF'\n" + botScript + "\nBOTEOF", sshConfig, 0, 10000);
  console.log("Script uploaded:", r.success);

  const configJson = JSON.stringify({ dashboardUrl, apiKey: activeKey.key, botName: "OpenClaw AI" }, null, 2);
  await executeRawSSHCommand("cat > /root/openclaw-whatsapp/config.json << 'CFGEOF'\n" + configJson + "\nCFGEOF", sshConfig, 0, 10000);
  console.log("Config created");

  console.log("Installing dependencies on VPS...");
  r = await executeRawSSHCommand("cd /root/openclaw-whatsapp && /usr/bin/npm i --omit=dev 2>&1 | tail -15", sshConfig, 0, 120000);
  console.log(r.output?.substring(0, 500));
  console.log("Deps:", r.success ? "OK" : "FAIL");

  const svcLines = [
    "[Unit]",
    "Description=OpenClaw WhatsApp VPS Bot",
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    "User=root",
    "WorkingDirectory=/root/openclaw-whatsapp",
    "ExecStart=/usr/bin/node /root/openclaw-whatsapp/index.mjs",
    "Restart=always",
    "RestartSec=10",
    "Environment=NODE_ENV=production",
    "StandardOutput=journal",
    "StandardError=journal",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ];
  const svcContent = svcLines.join("\\n");
  r = await executeRawSSHCommand("printf '" + svcContent + "' > /etc/systemd/system/openclaw-whatsapp.service", sshConfig, 0, 10000);
  console.log("Systemd service:", r.success ? "OK" : "FAIL");

  r = await executeRawSSHCommand("systemctl daemon-reload && systemctl enable openclaw-whatsapp && systemctl restart openclaw-whatsapp", sshConfig, 0, 15000);
  console.log("Service started:", r.success ? "OK" : "FAIL");

  await new Promise(resolve => setTimeout(resolve, 5000));
  r = await executeRawSSHCommand("systemctl is-active openclaw-whatsapp 2>&1", sshConfig, 0, 10000);
  console.log("Active:", r.output?.trim());

  r = await executeRawSSHCommand("journalctl -u openclaw-whatsapp --no-pager -n 30 2>&1", sshConfig, 0, 10000);
  console.log("\n--- Logs ---");
  console.log(r.output);
}

deploy().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
