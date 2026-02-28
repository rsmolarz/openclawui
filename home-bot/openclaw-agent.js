#!/usr/bin/env node
const https = require("https");
const http = require("http");
const os = require("os");

const API_URL = process.env.OPENCLAW_URL || "https://claw-settings.replit.app/api/node/heartbeat";
const API_KEY = process.env.OPENCLAW_API_KEY;
if (!API_KEY) {
  console.error("ERROR: OPENCLAW_API_KEY environment variable is required.");
  console.error("Set it before running: export OPENCLAW_API_KEY=your_key_here");
  process.exit(1);
}
const DISPLAY_NAME = process.env.OPENCLAW_NODE_NAME || os.hostname();
const INTERVAL_MS = parseInt(process.env.OPENCLAW_INTERVAL || "30000", 10);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "";
}

function sendHeartbeat() {
  const data = JSON.stringify({
    hostname: os.hostname(),
    displayName: DISPLAY_NAME,
    os: os.platform(),
    ipAddress: getLocalIp(),
  });

  const url = new URL(API_URL);
  const transport = url.protocol === "https:" ? https : http;
  const req = transport.request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      "Content-Length": Buffer.byteLength(data),
    },
  }, (res) => {
    let body = "";
    res.on("data", (c) => body += c);
    res.on("end", () => {
      const ts = new Date().toLocaleTimeString();
      if (res.statusCode === 200) {
        console.log(`[${ts}] Heartbeat OK: ${body}`);
      } else {
        console.error(`[${ts}] Heartbeat failed (${res.statusCode}): ${body}`);
      }
    });
  });
  req.on("error", (e) => console.error(`[${new Date().toLocaleTimeString()}] Heartbeat error: ${e.message}`));
  req.write(data);
  req.end();
}

console.log("OpenClaw Node Agent v1.0");
console.log("========================");
console.log("Hostname:", os.hostname());
console.log("Display Name:", DISPLAY_NAME);
console.log("OS:", os.platform());
console.log("IP:", getLocalIp());
console.log("Reporting to:", API_URL);
console.log("Interval:", INTERVAL_MS / 1000, "seconds");
console.log("");

sendHeartbeat();
setInterval(sendHeartbeat, INTERVAL_MS);
