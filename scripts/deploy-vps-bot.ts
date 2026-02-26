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

  const devUrl = process.env.REPLIT_DEV_DOMAIN
    ? "https://" + process.env.REPLIT_DEV_DOMAIN
    : "https://claw-settings.replit.app";
  const prodUrl = "https://claw-settings.replit.app";

  console.log("Dev URL:", devUrl);
  console.log("Prod URL:", prodUrl);
  console.log("API key:", activeKey.key.substring(0, 10) + "...");

  console.log("\n--- Stopping existing service ---");
  await executeRawSSHCommand("systemctl stop openclaw-whatsapp 2>/dev/null || true", sshConfig, 0, 10000);

  console.log("--- Uploading files ---");
  await executeRawSSHCommand("mkdir -p /root/openclaw-whatsapp", sshConfig, 0, 10000);

  const pkgJson = readFileSync(join(process.cwd(), "vps-bot/package.json"), "utf8");
  await executeRawSSHCommand("cat > /root/openclaw-whatsapp/package.json << 'PKGEOF'\n" + pkgJson + "\nPKGEOF", sshConfig, 0, 10000);

  const botScript = readFileSync(join(process.cwd(), "vps-bot/index.mjs"), "utf8");
  let r = await executeRawSSHCommand("cat > /root/openclaw-whatsapp/index.mjs << 'BOTEOF'\n" + botScript + "\nBOTEOF", sshConfig, 0, 10000);
  console.log("Script uploaded:", r.success);

  const configJson = JSON.stringify({
    dashboardUrl: devUrl,
    dashboardUrlProd: prodUrl,
    apiKey: activeKey.key,
    botName: "OpenClaw AI",
    phoneNumber: "13405140344",
    usePairingCode: true,
  }, null, 2);
  await executeRawSSHCommand("cat > /root/openclaw-whatsapp/config.json << 'CFGEOF'\n" + configJson + "\nCFGEOF", sshConfig, 0, 10000);
  console.log("Config with phone 13405140344 and pairing code mode");

  console.log("--- Checking dependencies ---");
  r = await executeRawSSHCommand("cd /root/openclaw-whatsapp && ls node_modules/@whiskeysockets/baileys/lib/index.js 2>/dev/null && echo 'DEPS_OK' || echo 'NEED_DEPS'", sshConfig, 0, 10000);
  if (r.output?.includes("NEED_DEPS")) {
    console.log("Installing dependencies...");
    r = await executeRawSSHCommand("cd /root/openclaw-whatsapp && /usr/bin/npm i --omit=dev 2>&1 | tail -5", sshConfig, 0, 120000);
    console.log(r.output);
  } else {
    console.log("Dependencies already installed");
  }

  console.log("--- Clearing old auth state ---");
  await executeRawSSHCommand("rm -rf /root/openclaw-whatsapp/auth_state/*", sshConfig, 0, 10000);

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

  console.log("--- Starting service ---");
  r = await executeRawSSHCommand("systemctl daemon-reload && systemctl enable openclaw-whatsapp && systemctl start openclaw-whatsapp", sshConfig, 0, 15000);
  console.log("Service started:", r.success ? "OK" : "FAIL");

  console.log("--- Waiting for pairing code ---");
  await new Promise(resolve => setTimeout(resolve, 8000));
  r = await executeRawSSHCommand("journalctl -u openclaw-whatsapp --no-pager -n 20 --since '15 seconds ago' 2>&1", sshConfig, 0, 10000);
  console.log(r.output);
}

deploy().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
