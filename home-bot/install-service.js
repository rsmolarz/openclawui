import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { platform, userInfo, hostname } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const botDir = __dirname;
const botScript = join(botDir, "openclaw-whatsapp.js");

if (platform() === "win32") {
  installWindows();
} else {
  installLinux();
}

function installWindows() {
  console.log("\n=== Installing OpenClaw WhatsApp Bot as Windows Startup Task ===\n");

  const taskName = "OpenClawWhatsAppBot";
  const nodePath = process.execPath;

  try {
    execSync(`schtasks /query /tn "${taskName}" 2>nul`, { stdio: "pipe" });
    console.log(`Task "${taskName}" already exists. Removing old one...`);
    execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: "pipe" });
  } catch {}

  const cmd = `schtasks /create /tn "${taskName}" /tr "\\"${nodePath}\\" \\"${botScript}\\"" /sc onlogon /rl highest /f`;

  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`\nScheduled task "${taskName}" created successfully.`);
    console.log("  The bot will start automatically when you log in.\n");
    console.log("To start it now:");
    console.log(`  schtasks /run /tn "${taskName}"\n`);
    console.log("To remove:");
    console.log(`  schtasks /delete /tn "${taskName}" /f\n`);
  } catch (err) {
    console.error("Failed to create scheduled task. Try running as Administrator.");
    console.error(err.message);
  }
}

function installLinux() {
  console.log("\n=== Installing OpenClaw WhatsApp Bot as systemd Service ===\n");

  const serviceName = "openclaw-whatsapp";
  const nodePath = process.execPath;
  const user = userInfo().username;

  const serviceContent = `[Unit]
Description=OpenClaw WhatsApp AI Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${botDir}
ExecStart=${nodePath} ${botScript}
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

  const servicePath = `/etc/systemd/system/${serviceName}.service`;

  try {
    writeFileSync(servicePath, serviceContent);
    execSync("systemctl daemon-reload", { stdio: "inherit" });
    execSync(`systemctl enable ${serviceName}`, { stdio: "inherit" });
    execSync(`systemctl start ${serviceName}`, { stdio: "inherit" });
    console.log(`\nService "${serviceName}" installed and started.`);
    console.log(`\nUseful commands:`);
    console.log(`  sudo systemctl status ${serviceName}`);
    console.log(`  sudo journalctl -u ${serviceName} -f`);
    console.log(`  sudo systemctl stop ${serviceName}`);
    console.log(`  sudo systemctl restart ${serviceName}\n`);
  } catch (err) {
    console.error("Failed to install service. Try running with sudo.");
    console.error(err.message);
    console.log(`\nAlternatively, create ${servicePath} manually with:\n`);
    console.log(serviceContent);
  }
}
