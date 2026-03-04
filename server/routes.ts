import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMachineSchema, insertApiKeySchema, insertLlmApiKeySchema, insertIntegrationSchema, insertInstanceSchema, insertSkillSchema, insertDocSchema, insertNodeSetupSessionSchema, insertEmailWorkflowSchema, insertReplitProjectSchema, insertHealthLogSchema, insertGroceryItemSchema, insertFinancialTransactionSchema, insertHabitSchema, insertHabitCompletionSchema, insertMeetingPrepSchema, insertFocusSessionSchema, insertLifeEventSchema } from "@shared/schema";
import { z } from "zod";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import multer from "multer";
import { writeFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const voiceTokens = new Map<string, { userId: string; expiresAt: number }>();

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg", "audio/x-m4a", "audio/mp3", "video/webm", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const TMP_AUDIO_DIR = join(process.cwd(), ".tmp-audio");
if (!existsSync(TMP_AUDIO_DIR)) {
  mkdirSync(TMP_AUDIO_DIR, { recursive: true });
}

const ttsAudioCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

function requireAuthOrVoiceToken(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const voiceSession = voiceTokens.get(token);
      if (voiceSession && voiceSession.expiresAt > Date.now()) {
        (req as any).voiceTokenUserId = voiceSession.userId;
        return next();
      }
      storage.getInstanceByApiKey(token).then(instance => {
        if (instance) {
          (req as any).apiTokenInstanceId = instance.id;
          return next();
        }
        return res.status(401).json({ error: "Invalid or expired token" });
      }).catch(() => {
        return res.status(401).json({ error: "Authentication failed" });
      });
      return;
    }
  }

  storage.getAllUsers().then(users => {
    if (users.length === 1) {
      req.session.userId = users[0].id;
      req.session.save(() => next());
    } else {
      return res.status(401).json({ error: "Not authenticated. Provide a session cookie or Bearer token." });
    }
  }).catch(() => {
    return res.status(401).json({ error: "Authentication failed" });
  });
}

async function getWhatsappBot() {
  const { whatsappBot } = await import("./bot/whatsapp");
  return whatsappBot;
}

const bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })),
});

const openclawConfigUpdateSchema = z.object({
  gatewayPort: z.number().optional(),
  gatewayBind: z.string().optional(),
  gatewayMode: z.string().optional(),
  gatewayToken: z.string().nullable().optional(),
  gatewayPassword: z.string().nullable().optional(),
  websocketUrl: z.string().nullable().optional(),
  defaultLlm: z.string().optional(),
  fallbackLlm: z.string().optional(),
  llmApiKey: z.string().nullable().optional(),
  whatsappEnabled: z.boolean().optional(),
  whatsappPhone: z.string().nullable().optional(),
  whatsappApiKey: z.string().nullable().optional(),
  tailscaleEnabled: z.boolean().optional(),
  tailscaleIp: z.string().nullable().optional(),
  pendingNodes: z.any().optional(),
  nodesApproved: z.number().optional(),
  dockerProject: z.string().optional(),
});

const vpsUpdateSchema = z.object({
  vpsIp: z.string().optional(),
  vpsPort: z.number().optional(),
  sshUser: z.string().optional(),
  sshKeyPath: z.string().nullable().optional(),
});

const MEDINVEST_BASE_URL = process.env.OPENCLAW_DID_BASE_URL || "https://did-login.replit.app";
const MEDINVEST_CLIENT_ID = process.env.OPENCLAW_DID_CLIENT_ID || "";
const MEDINVEST_CLIENT_SECRET = process.env.OPENCLAW_DID_SECRET || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const STATE_SECRET = process.env.SESSION_SECRET || "openclaw-dev-session-secret";

function getRedirectUri(req: Request): string {
  if (APP_BASE_URL) {
    return `${APP_BASE_URL}/api/auth/medinvest/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/auth/medinvest/callback`;
}

function createSignedState(): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const signature = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifySignedState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, timestamp, signature] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > 10 * 60 * 1000 || age < 0) return false;
  const expectedSig = createHmac("sha256", STATE_SECRET).update(`${nonce}.${timestamp}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      storage.getInstanceByApiKey(token).then(instance => {
        if (instance) {
          (req as any).apiTokenInstanceId = instance.id;
          return next();
        }
        return res.status(401).json({ error: "Invalid API token" });
      }).catch(() => {
        return res.status(401).json({ error: "Authentication failed" });
      });
      return;
    }
  }

  storage.getAllUsers().then(users => {
    if (users.length === 1) {
      req.session.userId = users[0].id;
      req.session.save(() => next());
    } else {
      return res.status(401).json({ error: "Not authenticated. Provide a session cookie or Bearer token (instance API key) in the Authorization header." });
    }
  }).catch(() => {
    return res.status(401).json({ error: "Authentication failed" });
  });
}

function logAudit(action: string, actionType: string, details?: string, userId?: string) {
  storage.createAuditLog({ action, actionType, details: details ?? null, userId: userId ?? null }).catch(() => {});
}

async function resolveInstanceId(req: Request): Promise<string | null> {
  const instanceId = (req.query.instanceId as string) || (req.body?.instanceId as string);
  if (instanceId) return instanceId;
  const tokenInstanceId = (req as any).apiTokenInstanceId;
  if (tokenInstanceId) return tokenInstanceId;
  const defaultInstance = await storage.getDefaultInstance();
  return defaultInstance?.id ?? null;
}

function getNodeSkillContent(skillName: string): { skillMd: string; handlerPy: string } | null {
  const skills: Record<string, { skillMd: string; handlerPy: string }> = {
    "system-agent": {
      skillMd: `---
name: system.agent
description: Full local system control for any OS. Allows OpenClaw to read/write files, run commands, inspect system state, and control native software.
tools:
  - run_command
  - read_file
  - write_file
  - list_directory
  - get_process_list
  - start_process
  - stop_process
---

You can execute system commands, read and write files, inspect processes, and control applications locally.`,
      handlerPy: `import subprocess
import os

def run_command(command: str):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}

def read_file(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return {"error": str(e)}

def write_file(path: str, content: str):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}

def list_directory(path: str):
    try:
        return os.listdir(path)
    except Exception as e:
        return {"error": str(e)}

def get_process_list():
    try:
        result = subprocess.run("ps aux --sort=-%mem | head -20", shell=True, capture_output=True, text=True)
        return result.stdout
    except Exception as e:
        return {"error": str(e)}

def start_process(command: str):
    try:
        subprocess.Popen(command, shell=True)
        return {"status": "started"}
    except Exception as e:
        return {"error": str(e)}

def stop_process(process_name: str):
    try:
        subprocess.run(f"pkill -f {process_name}", shell=True)
        return {"status": "stopped"}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "windows-admin": {
      skillMd: `---
name: windows.admin
description: Full Windows administrative control via PowerShell. Allows registry edits, service control, system configuration, and native software automation.
tools:
  - run_powershell
  - get_services
  - start_service
  - stop_service
  - get_registry_value
  - set_registry_value
  - list_installed_programs
---

You can fully administer Windows using PowerShell, including registry edits, services, and system configuration.`,
      handlerPy: `import subprocess

def run_powershell(command: str):
    try:
        result = subprocess.run(["powershell", "-Command", command], capture_output=True, text=True, timeout=30)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}

def get_services():
    return run_powershell("Get-Service | Select Name,Status | ConvertTo-Json")

def start_service(service_name: str):
    return run_powershell(f"Start-Service -Name '{service_name}'")

def stop_service(service_name: str):
    return run_powershell(f"Stop-Service -Name '{service_name}'")

def list_installed_programs():
    return run_powershell("Get-ItemProperty HKLM:\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\* | Select DisplayName | ConvertTo-Json")

def get_registry_value(path: str, name: str):
    return run_powershell(f"Get-ItemProperty -Path 'HKCU:\\\\{path}' -Name '{name}' | ConvertTo-Json")

def set_registry_value(path: str, name: str, value: str):
    return run_powershell(f"Set-ItemProperty -Path 'HKCU:\\\\{path}' -Name '{name}' -Value '{value}'")`,
    },
    "ui-automation": {
      skillMd: `---
name: ui.automation
description: Full UI automation. Allows OpenClaw to click, type, open apps, and control native software visually.
tools:
  - click
  - type_text
  - move_mouse
  - press_key
  - open_application
  - focus_window
---

You can control any application visually by clicking, typing, and interacting with UI elements.`,
      handlerPy: `import pyautogui
import subprocess

def click(x: int, y: int):
    pyautogui.click(x, y)
    return {"status": "clicked", "x": x, "y": y}

def move_mouse(x: int, y: int):
    pyautogui.moveTo(x, y)
    return {"status": "moved", "x": x, "y": y}

def type_text(text: str):
    pyautogui.write(text)
    return {"status": "typed", "text": text}

def press_key(key: str):
    pyautogui.press(key)
    return {"status": "pressed", "key": key}

def open_application(path: str):
    subprocess.Popen(path, shell=True)
    return {"status": "opened", "path": path}

def focus_window(window_title: str):
    try:
        import pygetwindow as gw
        windows = gw.getWindowsWithTitle(window_title)
        if windows:
            windows[0].activate()
            return {"status": "focused", "window": window_title}
        return {"error": "window not found"}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "screen-vision": {
      skillMd: `---
name: screen.vision
description: Screen vision and OCR. Allows OpenClaw to see screen, detect text, and locate UI elements.
tools:
  - capture_screen
  - find_text
  - click_text
---

You can capture the screen, find text, and interact with UI elements visually.`,
      handlerPy: `import pyautogui
import pytesseract
from PIL import ImageGrab

def capture_screen():
    img = ImageGrab.grab()
    img.save("/tmp/screenshot.png")
    return {"status": "captured", "path": "/tmp/screenshot.png"}

def find_text(text: str):
    img = ImageGrab.grab()
    import cv2
    import numpy as np
    img_np = np.array(img)
    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
    for i, word in enumerate(data["text"]):
        if text.lower() in word.lower():
            return {"found": True, "x": data["left"][i], "y": data["top"][i]}
    return {"found": False}

def click_text(text: str):
    result = find_text(text)
    if result.get("found"):
        pyautogui.click(result["x"], result["y"])
        return {"status": "clicked", "text": text}
    return {"error": "text not found"}`,
    },
    "homeassistant-agent": {
      skillMd: `---
name: homeassistant.agent
description: Full Home Assistant control. Manage lights, switches, sensors, automations, and scenes.
tools:
  - ha_call_service
  - ha_get_states
  - ha_get_state
  - ha_trigger_automation
---

You can control Home Assistant devices, read sensor states, and trigger automations.
Requires HA_URL and HA_TOKEN environment variables.`,
      handlerPy: `import os
import json
try:
    import requests
except ImportError:
    import subprocess
    subprocess.run(["pip", "install", "requests"], capture_output=True)
    import requests

HA_URL = os.environ.get("HA_URL", "http://homeassistant.local:8123")
HA_TOKEN = os.environ.get("HA_TOKEN", "")

def _headers():
    return {"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"}

def ha_call_service(domain: str, service: str, entity_id: str = None, data: dict = None):
    url = f"{HA_URL}/api/services/{domain}/{service}"
    payload = data or {}
    if entity_id:
        payload["entity_id"] = entity_id
    r = requests.post(url, headers=_headers(), json=payload, timeout=10)
    return {"status": r.status_code, "response": r.text[:500]}

def ha_get_states():
    r = requests.get(f"{HA_URL}/api/states", headers=_headers(), timeout=10)
    states = r.json()
    return [{"entity_id": s["entity_id"], "state": s["state"]} for s in states[:50]]

def ha_get_state(entity_id: str):
    r = requests.get(f"{HA_URL}/api/states/{entity_id}", headers=_headers(), timeout=10)
    return r.json()

def ha_trigger_automation(automation_id: str):
    return ha_call_service("automation", "trigger", automation_id)`,
    },
    "webhook-agent": {
      skillMd: `---
name: webhook.agent
description: Webhook listener for receiving HTTP requests from Stream Deck, Companion, or external triggers.
tools:
  - start_listener
  - get_recent_events
---

Receive and process incoming webhook events on a configurable port.`,
      handlerPy: `import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

recent_events = []

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        event = {"path": self.path, "body": body, "method": "POST"}
        recent_events.append(event)
        if len(recent_events) > 50:
            recent_events.pop(0)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, format, *args):
        pass

def start_listener(port: int = 3000):
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return {"status": "listening", "port": port}

def get_recent_events():
    return recent_events[-20:]`,
    },
    "keyboard-agent": {
      skillMd: `---
name: keyboard.agent
description: Keyboard and hotkey control. Send keystrokes, shortcuts, and hotkey combos to native applications.
tools:
  - send_keys
  - send_hotkey
  - type_string
---

You can send keyboard commands and hotkey combinations to control native applications.`,
      handlerPy: `import pyautogui
import time

def send_keys(key: str):
    pyautogui.press(key)
    return {"status": "pressed", "key": key}

def send_hotkey(*keys):
    pyautogui.hotkey(*keys)
    return {"status": "hotkey_sent", "keys": list(keys)}

def type_string(text: str, interval: float = 0.02):
    pyautogui.write(text, interval=interval)
    return {"status": "typed", "length": len(text)}`,
    },
    "process-manager": {
      skillMd: `---
name: process.manager
description: Process lifecycle management. Start, stop, monitor, and list running processes.
tools:
  - list_processes
  - start_process
  - stop_process
  - process_info
---

Monitor and control running processes on the local system.`,
      handlerPy: `import subprocess
import os

def list_processes(sort_by: str = "mem"):
    sort_flag = "-%mem" if sort_by == "mem" else "-%cpu"
    result = subprocess.run(f"ps aux --sort={sort_flag} | head -25", shell=True, capture_output=True, text=True)
    return result.stdout

def start_process(command: str):
    subprocess.Popen(command, shell=True)
    return {"status": "started", "command": command}

def stop_process(name: str):
    result = subprocess.run(f"pkill -f '{name}'", shell=True, capture_output=True, text=True)
    return {"status": "signal_sent", "name": name, "returncode": result.returncode}

def process_info(pid: int):
    result = subprocess.run(f"ps -p {pid} -o pid,ppid,user,%cpu,%mem,stat,start,time,command", shell=True, capture_output=True, text=True)
    return result.stdout`,
    },
    "streamdeck-agent": {
      skillMd: `---
name: streamdeck.agent
description: Stream Deck integration via webhooks. Maps physical buttons to OpenClaw actions, system commands, and Home Assistant automations.
tools:
  - register_action
  - list_actions
  - execute_action
  - start_webhook_server
---

Receive Stream Deck button presses via HTTP webhooks and execute mapped actions.
Supports direct webhook (Stream Deck → OpenClaw) and Companion relay (Stream Deck → Companion → OpenClaw).

Architecture:
  Stream Deck → Companion (optional) → HTTP POST → This skill → OpenClaw actions

Usage:
  POST http://localhost:3001/streamdeck?action=<action_name>`,
      handlerPy: `import json
import os
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
from urllib.parse import urlparse, parse_qs

registered_actions = {}
action_log = []

def register_action(name: str, command: str, action_type: str = "shell"):
    registered_actions[name] = {"command": command, "type": action_type}
    return {"status": "registered", "name": name, "type": action_type}

def list_actions():
    return registered_actions

def execute_action(name: str):
    action = registered_actions.get(name)
    if not action:
        return {"error": f"Action '{name}' not found"}
    try:
        if action["type"] == "shell":
            result = subprocess.run(action["command"], shell=True, capture_output=True, text=True, timeout=30)
            entry = {"action": name, "status": "success", "output": result.stdout[:500]}
        elif action["type"] == "ha_service":
            import requests
            ha_url = os.environ.get("HA_URL", "http://homeassistant.local:8123")
            ha_token = os.environ.get("HA_TOKEN", "")
            parts = action["command"].split("/")
            domain, service = parts[0], parts[1]
            entity = parts[2] if len(parts) > 2 else None
            payload = {"entity_id": entity} if entity else {}
            r = requests.post(f"{ha_url}/api/services/{domain}/{service}",
                headers={"Authorization": f"Bearer {ha_token}", "Content-Type": "application/json"},
                json=payload, timeout=10)
            entry = {"action": name, "status": "success", "ha_status": r.status_code}
        else:
            entry = {"action": name, "status": "error", "error": f"Unknown type: {action['type']}"}
        action_log.append(entry)
        if len(action_log) > 100:
            action_log.pop(0)
        return entry
    except Exception as e:
        return {"error": str(e)}

class StreamDeckHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        action_name = params.get("action", [None])[0]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        if not action_name and body:
            try:
                data = json.loads(body)
                action_name = data.get("action")
            except:
                pass
        if action_name:
            result = execute_action(action_name)
        else:
            result = {"error": "No action specified. Use ?action=name or {action: name} in body"}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def log_message(self, format, *args):
        pass

def start_webhook_server(port: int = 3001):
    server = HTTPServer(("0.0.0.0", port), StreamDeckHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return {"status": "listening", "port": port, "endpoint": f"http://localhost:{port}/streamdeck?action=<name>"}`,
    },
    "companion-agent": {
      skillMd: `---
name: companion.agent
description: Bitfocus Companion integration. Control Companion buttons, pages, and actions via its HTTP/TCP API.
tools:
  - press_button
  - release_button
  - set_page
  - get_config
  - trigger_action
---

Control Bitfocus Companion programmatically. Send button presses, page changes, and trigger custom actions.
Requires COMPANION_URL environment variable (default: http://localhost:8000).`,
      handlerPy: `import os
import json
try:
    import requests
except ImportError:
    import subprocess
    subprocess.run(["pip", "install", "requests"], capture_output=True)
    import requests

COMPANION_URL = os.environ.get("COMPANION_URL", "http://localhost:8000")

def press_button(page: int, bank: int):
    try:
        r = requests.get(f"{COMPANION_URL}/press/bank/{page}/{bank}", timeout=5)
        return {"status": "pressed", "page": page, "bank": bank, "response": r.status_code}
    except Exception as e:
        return {"error": str(e)}

def release_button(page: int, bank: int):
    try:
        r = requests.get(f"{COMPANION_URL}/release/bank/{page}/{bank}", timeout=5)
        return {"status": "released", "page": page, "bank": bank, "response": r.status_code}
    except Exception as e:
        return {"error": str(e)}

def set_page(page: int, surface: str = "default"):
    try:
        r = requests.get(f"{COMPANION_URL}/set/page/{page}", timeout=5)
        return {"status": "page_set", "page": page, "response": r.status_code}
    except Exception as e:
        return {"error": str(e)}

def get_config():
    try:
        r = requests.get(f"{COMPANION_URL}/api/config", timeout=5)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def trigger_action(action_id: str, options: dict = None):
    try:
        r = requests.post(f"{COMPANION_URL}/api/action/{action_id}",
            json=options or {}, timeout=5)
        return {"status": "triggered", "action": action_id, "response": r.status_code}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "api-agent": {
      skillMd: `---
name: api.agent
description: Generic REST API caller. Make HTTP requests to any API endpoint with authentication support.
tools:
  - api_get
  - api_post
  - api_put
  - api_delete
  - set_default_headers
---

Make authenticated HTTP requests to any REST API. Supports GET, POST, PUT, DELETE with custom headers and JSON payloads.`,
      handlerPy: `import json
import os
try:
    import requests
except ImportError:
    import subprocess
    subprocess.run(["pip", "install", "requests"], capture_output=True)
    import requests

default_headers = {}

def set_default_headers(headers: dict):
    global default_headers
    default_headers = headers
    return {"status": "headers_set", "count": len(headers)}

def _make_request(method: str, url: str, headers: dict = None, data: dict = None):
    try:
        hdrs = {**default_headers, **(headers or {})}
        r = requests.request(method, url, headers=hdrs, json=data, timeout=30)
        try:
            body = r.json()
        except:
            body = r.text[:2000]
        return {"status": r.status_code, "body": body}
    except Exception as e:
        return {"error": str(e)}

def api_get(url: str, headers: dict = None):
    return _make_request("GET", url, headers)

def api_post(url: str, data: dict = None, headers: dict = None):
    return _make_request("POST", url, headers, data)

def api_put(url: str, data: dict = None, headers: dict = None):
    return _make_request("PUT", url, headers, data)

def api_delete(url: str, headers: dict = None):
    return _make_request("DELETE", url, headers)`,
    },
    "filesystem-agent": {
      skillMd: `---
name: filesystem.agent
description: Advanced filesystem operations. Watch directories, search files, manage permissions, and handle archives.
tools:
  - search_files
  - watch_directory
  - get_file_info
  - set_permissions
  - create_archive
  - extract_archive
  - find_large_files
---

Advanced file system operations beyond basic read/write. Search, watch, archive, and manage file permissions.`,
      handlerPy: `import os
import subprocess
import json
import stat

def search_files(directory: str, pattern: str, max_results: int = 50):
    try:
        result = subprocess.run(
            f"find {directory} -name '{pattern}' -type f 2>/dev/null | head -{max_results}",
            shell=True, capture_output=True, text=True, timeout=15)
        files = [f for f in result.stdout.strip().split("\\n") if f]
        return {"count": len(files), "files": files}
    except Exception as e:
        return {"error": str(e)}

def get_file_info(path: str):
    try:
        st = os.stat(path)
        return {
            "path": path,
            "size": st.st_size,
            "mode": oct(st.st_mode),
            "uid": st.st_uid,
            "gid": st.st_gid,
            "modified": st.st_mtime,
            "is_dir": os.path.isdir(path),
        }
    except Exception as e:
        return {"error": str(e)}

def set_permissions(path: str, mode: str):
    try:
        subprocess.run(f"chmod {mode} '{path}'", shell=True, check=True)
        return {"status": "permissions_set", "path": path, "mode": mode}
    except Exception as e:
        return {"error": str(e)}

def create_archive(source: str, output: str, format: str = "tar.gz"):
    try:
        if format == "tar.gz":
            subprocess.run(f"tar -czf '{output}' '{source}'", shell=True, check=True, timeout=120)
        elif format == "zip":
            subprocess.run(f"zip -r '{output}' '{source}'", shell=True, check=True, timeout=120)
        return {"status": "created", "output": output}
    except Exception as e:
        return {"error": str(e)}

def extract_archive(archive: str, destination: str):
    try:
        if archive.endswith(".tar.gz") or archive.endswith(".tgz"):
            subprocess.run(f"tar -xzf '{archive}' -C '{destination}'", shell=True, check=True, timeout=120)
        elif archive.endswith(".zip"):
            subprocess.run(f"unzip -o '{archive}' -d '{destination}'", shell=True, check=True, timeout=120)
        return {"status": "extracted", "destination": destination}
    except Exception as e:
        return {"error": str(e)}

def find_large_files(directory: str = "/", min_size_mb: int = 100, max_results: int = 20):
    try:
        result = subprocess.run(
            f"find {directory} -type f -size +{min_size_mb}M -exec ls -lh {{}} \\\\; 2>/dev/null | sort -k5 -rh | head -{max_results}",
            shell=True, capture_output=True, text=True, timeout=30)
        return result.stdout
    except Exception as e:
        return {"error": str(e)}

def watch_directory(path: str, duration: int = 10):
    try:
        result = subprocess.run(
            f"inotifywait -m -r -t {duration} --format '%T %e %w%f' --timefmt '%H:%M:%S' '{path}' 2>/dev/null || echo 'inotifywait not available'",
            shell=True, capture_output=True, text=True, timeout=duration + 5)
        events = [e for e in result.stdout.strip().split("\\n") if e]
        return {"events": events[:50]}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "docker-agent": {
      skillMd: `---
name: docker.agent
description: Docker container management. List, start, stop, inspect containers. View logs and manage images.
tools:
  - docker_ps
  - docker_start
  - docker_stop
  - docker_restart
  - docker_logs
  - docker_inspect
  - docker_images
  - docker_compose_up
  - docker_compose_down
---

Full Docker container lifecycle management. Control containers, view logs, manage images, and run docker-compose.`,
      handlerPy: `import subprocess
import json

def _run(cmd: str, timeout: int = 30):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}

def docker_ps(all: bool = False):
    flag = "-a" if all else ""
    return _run(f"docker ps {flag} --format '{{{{.ID}}}}\\t{{{{.Names}}}}\\t{{{{.Status}}}}\\t{{{{.Ports}}}}'")

def docker_start(container: str):
    return _run(f"docker start {container}")

def docker_stop(container: str):
    return _run(f"docker stop {container}")

def docker_restart(container: str):
    return _run(f"docker restart {container}")

def docker_logs(container: str, lines: int = 50):
    return _run(f"docker logs --tail {lines} {container}")

def docker_inspect(container: str):
    result = _run(f"docker inspect {container}")
    if result.get("stdout"):
        try:
            data = json.loads(result["stdout"])
            if data:
                c = data[0]
                return {
                    "id": c.get("Id", "")[:12],
                    "name": c.get("Name"),
                    "state": c.get("State", {}).get("Status"),
                    "image": c.get("Config", {}).get("Image"),
                    "ports": c.get("NetworkSettings", {}).get("Ports"),
                    "mounts": [m.get("Source") + ":" + m.get("Destination") for m in c.get("Mounts", [])],
                }
        except:
            pass
    return result

def docker_images():
    return _run("docker images --format '{{{{.Repository}}}}:{{{{.Tag}}}}\\t{{{{.Size}}}}\\t{{{{.ID}}}}'")

def docker_compose_up(path: str = ".", detach: bool = True):
    flag = "-d" if detach else ""
    return _run(f"cd '{path}' && docker compose up {flag}", timeout=120)

def docker_compose_down(path: str = "."):
    return _run(f"cd '{path}' && docker compose down", timeout=60)`,
    },
    "ssh-agent": {
      skillMd: `---
name: ssh.agent
description: Remote SSH execution. Run commands on remote servers, transfer files, and manage SSH connections.
tools:
  - ssh_exec
  - ssh_upload
  - ssh_download
  - ssh_tunnel
---

Execute commands on remote servers via SSH. Transfer files with SCP. Requires SSH key or password auth.
Set SSH_HOST, SSH_USER, SSH_KEY_PATH environment variables.`,
      handlerPy: `import subprocess
import os

SSH_HOST = os.environ.get("SSH_HOST", "")
SSH_USER = os.environ.get("SSH_USER", "root")
SSH_KEY_PATH = os.environ.get("SSH_KEY_PATH", os.path.expanduser("~/.ssh/id_rsa"))

def _ssh_opts():
    opts = "-o StrictHostKeyChecking=no -o ConnectTimeout=10"
    if SSH_KEY_PATH and os.path.exists(SSH_KEY_PATH):
        opts += f" -i {SSH_KEY_PATH}"
    return opts

def ssh_exec(command: str, host: str = None, user: str = None):
    h = host or SSH_HOST
    u = user or SSH_USER
    if not h:
        return {"error": "No host specified. Set SSH_HOST env var or pass host parameter."}
    try:
        result = subprocess.run(
            f"ssh {_ssh_opts()} {u}@{h} '{command}'",
            shell=True, capture_output=True, text=True, timeout=30)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}

def ssh_upload(local_path: str, remote_path: str, host: str = None, user: str = None):
    h = host or SSH_HOST
    u = user or SSH_USER
    try:
        result = subprocess.run(
            f"scp {_ssh_opts()} '{local_path}' {u}@{h}:'{remote_path}'",
            shell=True, capture_output=True, text=True, timeout=120)
        return {"status": "uploaded" if result.returncode == 0 else "failed", "stderr": result.stderr}
    except Exception as e:
        return {"error": str(e)}

def ssh_download(remote_path: str, local_path: str, host: str = None, user: str = None):
    h = host or SSH_HOST
    u = user or SSH_USER
    try:
        result = subprocess.run(
            f"scp {_ssh_opts()} {u}@{h}:'{remote_path}' '{local_path}'",
            shell=True, capture_output=True, text=True, timeout=120)
        return {"status": "downloaded" if result.returncode == 0 else "failed", "stderr": result.stderr}
    except Exception as e:
        return {"error": str(e)}

def ssh_tunnel(local_port: int, remote_port: int, host: str = None, user: str = None):
    h = host or SSH_HOST
    u = user or SSH_USER
    try:
        subprocess.Popen(
            f"ssh {_ssh_opts()} -N -L {local_port}:localhost:{remote_port} {u}@{h}",
            shell=True)
        return {"status": "tunnel_started", "local_port": local_port, "remote_port": remote_port}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "mqtt-agent": {
      skillMd: `---
name: mqtt.agent
description: MQTT messaging for IoT devices. Publish, subscribe, and manage MQTT topics for smart home and sensor data.
tools:
  - mqtt_publish
  - mqtt_subscribe
  - mqtt_list_topics
---

MQTT messaging client for IoT device communication. Publish commands and subscribe to sensor data.
Requires MQTT_BROKER (default: localhost:1883). Optional: MQTT_USER, MQTT_PASS.`,
      handlerPy: `import os
import json
import subprocess
import threading
import time

MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "")
MQTT_PASS = os.environ.get("MQTT_PASS", "")

received_messages = []

def _auth_flags():
    flags = ""
    if MQTT_USER:
        flags += f" -u '{MQTT_USER}'"
    if MQTT_PASS:
        flags += f" -P '{MQTT_PASS}'"
    return flags

def mqtt_publish(topic: str, payload: str, retain: bool = False):
    try:
        retain_flag = "-r" if retain else ""
        cmd = f"mosquitto_pub -h {MQTT_BROKER} -p {MQTT_PORT}{_auth_flags()} -t '{topic}' -m '{payload}' {retain_flag}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return {"status": "published", "topic": topic, "payload": payload}
        return {"error": result.stderr or "publish failed"}
    except Exception as e:
        return {"error": str(e)}

def mqtt_subscribe(topic: str, duration: int = 5, max_messages: int = 20):
    try:
        cmd = f"timeout {duration} mosquitto_sub -h {MQTT_BROKER} -p {MQTT_PORT}{_auth_flags()} -t '{topic}' -C {max_messages} -v 2>/dev/null"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=duration + 5)
        messages = [line for line in result.stdout.strip().split("\\n") if line]
        return {"topic": topic, "messages": messages}
    except Exception as e:
        return {"error": str(e)}

def mqtt_list_topics(duration: int = 3):
    try:
        cmd = f"timeout {duration} mosquitto_sub -h {MQTT_BROKER} -p {MQTT_PORT}{_auth_flags()} -t '#' -v 2>/dev/null"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=duration + 5)
        topics = set()
        for line in result.stdout.strip().split("\\n"):
            if line:
                parts = line.split(" ", 1)
                if parts:
                    topics.add(parts[0])
        return {"topics": sorted(topics)}
    except Exception as e:
        return {"error": str(e)}`,
    },
    "desktop-control": {
      skillMd: `---
name: desktop.control
description: Advanced desktop automation with pixel-perfect mouse control, keyboard input, screen capture, window management, clipboard, and drag-and-drop. The most comprehensive desktop control skill for OpenClaw.
tools:
  - move_mouse
  - move_relative
  - click
  - double_click
  - right_click
  - middle_click
  - drag
  - scroll
  - get_mouse_position
  - type_text
  - press
  - hotkey
  - key_down
  - key_up
  - screenshot
  - get_pixel_color
  - get_screen_size
  - find_on_screen
  - get_all_windows
  - activate_window
  - get_active_window
  - copy_to_clipboard
  - get_from_clipboard
  - pause
---

Advanced desktop automation with pixel-perfect mouse, keyboard, screen capture, window management, and clipboard control.
Requires: pip install pyautogui pillow pygetwindow pyperclip
Optional: pip install opencv-python (for image recognition)
Safety: failsafe enabled by default (move mouse to corner to abort). Approval mode available.`,
      handlerPy: `import pyautogui
import time
import sys
from typing import Tuple, Optional, List
from pathlib import Path
import logging

pyautogui.MINIMUM_DURATION = 0
pyautogui.MINIMUM_SLEEP = 0
pyautogui.PAUSE = 0

logger = logging.getLogger(__name__)

_failsafe = True
pyautogui.FAILSAFE = True
_screen_w, _screen_h = pyautogui.size()

def move_mouse(x: int, y: int, duration: float = 0, smooth: bool = True):
    if smooth and duration > 0:
        pyautogui.moveTo(x, y, duration=duration, tween=pyautogui.easeInOutQuad)
    else:
        pyautogui.moveTo(x, y, duration=duration)
    return {"status": "moved", "x": x, "y": y}

def move_relative(x_offset: int, y_offset: int, duration: float = 0):
    pyautogui.move(x_offset, y_offset, duration=duration)
    pos = pyautogui.position()
    return {"status": "moved", "x": pos.x, "y": pos.y}

def click(x: int = None, y: int = None, button: str = "left", clicks: int = 1, interval: float = 0.1):
    pyautogui.click(x=x, y=y, clicks=clicks, interval=interval, button=button)
    pos = pyautogui.position()
    return {"status": "clicked", "button": button, "clicks": clicks, "x": pos.x, "y": pos.y}

def double_click(x: int = None, y: int = None):
    pyautogui.doubleClick(x=x, y=y)
    return {"status": "double_clicked", "x": x, "y": y}

def right_click(x: int = None, y: int = None):
    pyautogui.rightClick(x=x, y=y)
    return {"status": "right_clicked", "x": x, "y": y}

def middle_click(x: int = None, y: int = None):
    pyautogui.middleClick(x=x, y=y)
    return {"status": "middle_clicked"}

def drag(start_x: int, start_y: int, end_x: int, end_y: int, duration: float = 0.5, button: str = "left"):
    pyautogui.moveTo(start_x, start_y)
    pyautogui.drag(end_x - start_x, end_y - start_y, duration=duration, button=button)
    return {"status": "dragged", "from": [start_x, start_y], "to": [end_x, end_y]}

def scroll(clicks: int, x: int = None, y: int = None):
    pyautogui.scroll(clicks, x=x, y=y)
    return {"status": "scrolled", "clicks": clicks}

def get_mouse_position():
    pos = pyautogui.position()
    return {"x": pos.x, "y": pos.y}

def type_text(text: str, interval: float = 0, wpm: int = None):
    if wpm:
        interval = 60.0 / (wpm * 5)
    pyautogui.write(text, interval=interval)
    return {"status": "typed", "length": len(text)}

def press(key: str, presses: int = 1, interval: float = 0.05):
    pyautogui.press(key, presses=presses, interval=interval)
    return {"status": "pressed", "key": key, "presses": presses}

def hotkey(*keys):
    pyautogui.hotkey(*keys)
    return {"status": "hotkey", "keys": list(keys)}

def key_down(key: str):
    pyautogui.keyDown(key)
    return {"status": "key_down", "key": key}

def key_up(key: str):
    pyautogui.keyUp(key)
    return {"status": "key_up", "key": key}

def screenshot(filename: str = None, region: tuple = None):
    img = pyautogui.screenshot(region=region)
    path = filename or "/tmp/screenshot.png"
    img.save(path)
    return {"status": "captured", "path": path, "size": [img.width, img.height]}

def get_pixel_color(x: int, y: int):
    r, g, b = pyautogui.pixel(x, y)
    return {"r": r, "g": g, "b": b, "hex": f"#{r:02x}{g:02x}{b:02x}"}

def get_screen_size():
    w, h = pyautogui.size()
    return {"width": w, "height": h}

def find_on_screen(image_path: str, confidence: float = 0.8):
    try:
        location = pyautogui.locateOnScreen(image_path, confidence=confidence)
        if location:
            center = pyautogui.center(location)
            return {"found": True, "x": center.x, "y": center.y, "region": [location.left, location.top, location.width, location.height]}
        return {"found": False}
    except Exception as e:
        return {"error": str(e)}

def get_all_windows():
    try:
        import pygetwindow as gw
        return [{"title": w.title, "visible": w.visible} for w in gw.getAllWindows() if w.title.strip()]
    except Exception as e:
        return {"error": str(e)}

def activate_window(title: str):
    try:
        import pygetwindow as gw
        windows = gw.getWindowsWithTitle(title)
        if windows:
            windows[0].activate()
            return {"status": "activated", "window": title}
        return {"error": "window not found"}
    except Exception as e:
        return {"error": str(e)}

def get_active_window():
    try:
        import pygetwindow as gw
        w = gw.getActiveWindow()
        return {"title": w.title if w else None}
    except Exception as e:
        return {"error": str(e)}

def copy_to_clipboard(text: str):
    try:
        import pyperclip
        pyperclip.copy(text)
        return {"status": "copied", "length": len(text)}
    except Exception as e:
        return {"error": str(e)}

def get_from_clipboard():
    try:
        import pyperclip
        text = pyperclip.paste()
        return {"text": text}
    except Exception as e:
        return {"error": str(e)}

def pause(seconds: float):
    time.sleep(seconds)
    return {"status": "paused", "seconds": seconds}`,
    },
    "gohighlevel": {
      skillMd: `---
name: gohighlevel
description: GoHighLevel CRM integration — manage contacts, calendars, conversations, opportunities, pipelines, payments, blogs, email templates, and social media posts via GHL API.
tools:
  - get_contacts
  - create_contact
  - update_contact
  - get_contact
  - get_calendar_events
  - search_conversations
  - send_message
  - get_opportunities
  - get_pipelines
  - update_opportunity
  - get_blogs
  - create_blog_post
  - list_transactions
  - create_social_post
---

GoHighLevel CRM skill for OpenClaw. Manage your entire GHL sub-account from any node — contacts, calendar events, conversations, opportunities, payments, blogs, and social media.

Requires GHL_API_KEY and GHL_LOCATION_ID environment variables.`,
      handlerPy: `import os
import json
import urllib.request
import urllib.parse

GHL_BASE = "https://services.leadconnectorhq.com"
API_KEY = os.environ.get("GHL_API_KEY", "")
LOCATION_ID = os.environ.get("GHL_LOCATION_ID", "")

def _headers():
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Version": "2021-07-28",
    }

def _request(method, path, data=None, params=None):
    url = f"{GHL_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def get_contacts(query="", limit=20):
    return _request("GET", "/contacts/", params={"locationId": LOCATION_ID, "query": query, "limit": limit})

def create_contact(first_name="", last_name="", email="", phone="", tags=None):
    body = {"locationId": LOCATION_ID, "firstName": first_name, "lastName": last_name}
    if email: body["email"] = email
    if phone: body["phone"] = phone
    if tags: body["tags"] = tags
    return _request("POST", "/contacts/", data=body)

def update_contact(contact_id, **fields):
    return _request("PUT", f"/contacts/{contact_id}", data=fields)

def get_contact(contact_id):
    return _request("GET", f"/contacts/{contact_id}")

def get_calendar_events(start_time, end_time, calendar_id=None):
    params = {"locationId": LOCATION_ID, "startTime": start_time, "endTime": end_time}
    if calendar_id: params["calendarId"] = calendar_id
    return _request("GET", "/calendars/events", params=params)

def search_conversations(contact_id):
    return _request("GET", "/conversations/search", params={"locationId": LOCATION_ID, "contactId": contact_id})

def send_message(contact_id, message, message_type="SMS"):
    return _request("POST", "/conversations/messages", data={"type": message_type, "contactId": contact_id, "message": message})

def get_opportunities(pipeline_id=None, query=""):
    params = {"locationId": LOCATION_ID}
    if pipeline_id: params["pipelineId"] = pipeline_id
    if query: params["q"] = query
    return _request("GET", "/opportunities/search", params=params)

def get_pipelines():
    return _request("GET", "/opportunities/pipelines", params={"locationId": LOCATION_ID})

def update_opportunity(opportunity_id, **fields):
    return _request("PUT", f"/opportunities/{opportunity_id}", data=fields)

def get_blogs(limit=20):
    return _request("GET", "/blogs/site/all", params={"locationId": LOCATION_ID, "limit": limit, "skip": 0})

def create_blog_post(blog_id, title, raw_html, description="", status="DRAFT"):
    return _request("POST", "/blogs/posts", data={
        "locationId": LOCATION_ID, "blogId": blog_id, "title": title,
        "rawHTML": raw_html, "description": description, "status": status,
        "author": "", "categories": [], "imageUrl": "", "imageAltText": "",
        "urlSlug": title.lower().replace(" ", "-"), "publishedAt": "",
    })

def list_transactions(limit=20):
    return _request("GET", "/payments/transactions", params={"locationId": LOCATION_ID, "limit": limit})

def create_social_post(account_id, post_type, media_url="", content=""):
    return _request("POST", "/social-media-posting/post", data={
        "accountId": account_id, "type": post_type,
        "mediaUrls": [media_url] if media_url else [], "content": content,
    })`,
    },
  };
  return skills[skillName] || null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProductionRuntime = process.env.NODE_ENV === "production";

  app.get("/api/public/home-bot/:file", async (req, res) => {
    const fs = await import("fs");
    const path = await import("path");
    const allowed = ["package.json", "config.json", "openclaw-whatsapp.js", "install-service.js"];
    const file = req.params.file;
    if (!allowed.includes(file)) return res.status(404).send("Not found");

    const botDir = path.default.join(process.cwd(), "home-bot");
    const filePath = path.default.join(botDir, file);
    if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

    if (file === "config.json") {
      try {
        const keys = await storage.getApiKeys();
        const activeKey = keys.find((k: any) => k.active && k.permissions === "admin");
        const openclawConfig = await storage.getOpenclawConfig(
          (await storage.getInstances()).find((i: any) => i.isDefault)?.id || ""
        );
        const phone = openclawConfig?.whatsappPhone?.replace(/[^0-9]/g, "") || "";
        const devDomain = process.env.REPLIT_DEV_DOMAIN;
        const dashboardUrl = devDomain ? `https://${devDomain}` : "https://claw-settings.replit.app";
        return res.json({
          dashboardUrl,
          apiKey: activeKey?.key || "YOUR_API_KEY_HERE",
          phoneNumber: phone,
          botName: "OpenClaw AI",
          usePairingCode: true,
          autoRestart: true,
        });
      } catch { /* fall through to static file */ }
    }

    res.sendFile(filePath);
  });

  app.get("/api/public/home-bot-setup", async (_req, res) => {
    const keys = await storage.getApiKeys();
    const activeKey = keys.find((k: any) => k.active && k.permissions === "admin");
    const apiKey = activeKey?.key || "YOUR_API_KEY_HERE";
    const baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN || "claw-settings.replit.app"}`;

    res.setHeader("Content-Type", "text/plain");
    res.send(`# OpenClaw WhatsApp Bot - Quick Setup
# Run these commands in PowerShell on your home computer:

mkdir C:\\openclaw-bot -Force
cd C:\\openclaw-bot
Invoke-WebRequest ${baseUrl}/api/public/home-bot/package.json -OutFile package.json
Invoke-WebRequest ${baseUrl}/api/public/home-bot/config.json -OutFile config.json
Invoke-WebRequest ${baseUrl}/api/public/home-bot/openclaw-whatsapp.js -OutFile openclaw-whatsapp.js
Invoke-WebRequest ${baseUrl}/api/public/home-bot/install-service.js -OutFile install-service.js
npm install
npm start

# A pairing code will appear. Enter it in WhatsApp:
# Settings > Linked Devices > Link a Device > Link with phone number
`);
  });

  app.get("/api/auth/me", async (req, res) => {
    console.log("Auth check - SID:", req.sessionID, "userId:", req.session.userId, "cookie:", !!req.headers.cookie);
    if (!req.session.userId) {
      try {
        const allUsers = await storage.getAllUsers();
        if (allUsers.length === 1) {
          req.session.userId = allUsers[0].id;
          await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
          console.log("Auto-authenticated single user:", allUsers[0].displayName);
          return res.json({ user: allUsers[0] });
        }
      } catch {}
      return res.json({ user: null });
    }
    try {
      const user = await storage.getUser(req.session.userId);
      res.json({ user: user ?? null });
    } catch {
      res.json({ user: null });
    }
  });

  app.get("/api/auth/medinvest/start", (req, res) => {
    if (!MEDINVEST_CLIENT_ID || !MEDINVEST_CLIENT_SECRET) {
      return res.status(503).json({ error: "OAuth not configured. Missing client credentials." });
    }
    const state = createSignedState();
    const redirectUri = getRedirectUri(req);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: MEDINVEST_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "did:read profile:read",
      state,
    });

    res.redirect(`${MEDINVEST_BASE_URL}/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/auth/medinvest/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error("OAuth error from provider:", error, req.query.error_description);
        return res.redirect(`/?error=${error}`);
      }

      if (!code || !state || typeof state !== "string" || !verifySignedState(state)) {
        console.error("OAuth state verification failed - code:", !!code, "state:", !!state, "valid:", typeof state === "string" && verifySignedState(state as string));
        return res.redirect("/?error=invalid_state");
      }

      const redirectUri = getRedirectUri(req);

      const tokenRes = await fetch(`${MEDINVEST_BASE_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: MEDINVEST_CLIENT_ID,
          client_secret: MEDINVEST_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        console.error("Token exchange failed:", await tokenRes.text());
        return res.redirect("/?error=token_failed");
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      const userInfoRes = await fetch(`${MEDINVEST_BASE_URL}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        console.error("UserInfo fetch failed:", await userInfoRes.text());
        return res.redirect("/?error=userinfo_failed");
      }

      const userInfo = await userInfoRes.json() as {
        sub: string;
        did: string;
        username: string;
        display_name?: string;
        email?: string;
      };

      console.log("OAuth userInfo received:", JSON.stringify(userInfo));

      const user = await storage.upsertUser({
        medinvestId: userInfo.sub,
        medinvestDid: userInfo.did,
        username: userInfo.username,
        displayName: userInfo.display_name || userInfo.username,
        email: userInfo.email || null,
      });

      console.log("User upserted:", user.id, user.username);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.redirect("/?error=session_failed");
        }
        console.log("Session saved successfully. SID:", req.sessionID, "userId:", req.session.userId);
        res.redirect("/");
      });
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect("/?error=auth_failed");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/whatsapp-pair", async (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html><head><title>WhatsApp Pairing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}
.qr{margin:20px;padding:20px;background:#fff;border-radius:16px}
.qr img{max-width:300px;display:block}
.status{margin:10px;padding:8px 16px;border-radius:8px;font-size:14px}
.connected{background:#22c55e;color:#fff}
.waiting{background:#f59e0b;color:#000}
.error{background:#ef4444;color:#fff}
.code{font-size:48px;font-family:monospace;letter-spacing:8px;margin:20px;padding:20px;background:#1e293b;border-radius:12px;user-select:all}
h1{margin-bottom:0}p{color:#999;margin-top:8px}
input{padding:10px 16px;background:#222;border:1px solid #444;border-radius:8px;color:#fff;font-size:16px;width:200px;margin:4px}
button{margin:8px;padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px}
button:hover{background:#2563eb}
.btn-outline{background:transparent;border:1px solid #3b82f6}
.btn-outline:hover{background:#1e3a5f}
.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:16px}
.phone-form{display:flex;gap:8px;align-items:center;margin:16px}
</style></head>
<body><h1>OpenClaw WhatsApp</h1><p>Connect WhatsApp to your OpenClaw AI bot</p>
<div id="content"><p>Loading...</p></div>
<div class="actions">
<button onclick="restart()">Restart Bot (QR)</button>
<button class="btn-outline" onclick="showPhoneForm()">Link with Phone Number</button>
</div>
<div id="phone-form" style="display:none">
<p style="color:#ccc;font-size:14px">Enter phone number in international format (without +)</p>
<div class="phone-form">
<input id="phone" placeholder="48123456789" />
<button onclick="requestPairing()">Get Code</button>
</div>
</div>
<script>
function showPhoneForm(){document.getElementById('phone-form').style.display='block'}
async function requestPairing(){
  var ph=document.getElementById('phone').value.trim();
  if(!ph){alert('Enter a phone number');return}
  try{var r=await fetch('/api/whatsapp/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:ph})});
  if(!r.ok){var d=await r.json();alert(d.error||'Failed');return}
  document.getElementById('phone-form').style.display='none';
  document.getElementById('content').innerHTML='<div class="status waiting">Requesting pairing code...</div>';
  setTimeout(poll,2000)}catch(e){alert('Failed to request pairing code')}
}
async function poll(){try{const r=await fetch('/api/whatsapp/qr');const d=await r.json();const el=document.getElementById('content');
if(d.state==='connected'){el.innerHTML='<div class="status connected">Connected as +'+d.phone+'</div>';return}
if(d.state==='pairing_code_ready'&&d.pairingCode){el.innerHTML='<p style="color:#ccc">Enter this code in WhatsApp</p><div class="code">'+d.pairingCode+'</div><p style="color:#999;font-size:13px">WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number</p>';setTimeout(poll,5000);return}
if(d.state==='qr_ready'&&d.qrDataUrl){el.innerHTML='<div class="qr"><img src="'+d.qrDataUrl+'" alt="QR"></div><div class="status waiting">Waiting for scan...</div>'}
else{el.innerHTML='<div class="status waiting">'+d.state+'</div>'}}catch(e){document.getElementById('content').innerHTML='<div class="status error">Error loading</div>'}
setTimeout(poll,3000)}poll();
async function restart(){try{await fetch('/api/whatsapp/restart',{method:'POST'});document.getElementById('content').innerHTML='<p>Restarting...</p>';setTimeout(poll,5000)}catch(e){alert('Failed')}}
</script></body></html>`);
  });

  app.get("/api/instances", requireAuth, async (_req, res) => {
    try {
      const instances = await storage.getInstances();
      res.json(instances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch instances" });
    }
  });

  app.get("/api/instances/default", requireAuth, async (_req, res) => {
    try {
      const instance = await storage.getDefaultInstance();
      res.json(instance ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch default instance" });
    }
  });

  app.get("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const instance = await storage.getInstance(req.params.id as string);
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }
      res.json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch instance" });
    }
  });

  app.post("/api/instances", requireAuth, async (req, res) => {
    try {
      const parsed = insertInstanceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const dataWithKey = { ...parsed.data, apiKey: randomBytes(32).toString("hex") };
      const instance = await storage.createInstance(dataWithKey);
      logAudit(`Created instance "${parsed.data.name}"`, "instance_change", undefined, req.session.userId);
      res.status(201).json(instance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create instance" });
    }
  });

  app.patch("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const { regenerateApiKey, ...rest } = req.body;
      const updateData: any = {};

      if (Object.keys(rest).length > 0) {
        const updateSchema = insertInstanceSchema.partial();
        const parsed = updateSchema.safeParse(rest);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.message });
        }
        Object.assign(updateData, parsed.data);
      }

      if (regenerateApiKey) {
        updateData.apiKey = randomBytes(32).toString("hex");
      }

      const updated = await storage.updateInstance(req.params.id as string, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Instance not found" });
      }
      logAudit(`Updated instance "${updated.name}"`, "instance_change", undefined, req.session.userId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update instance" });
    }
  });

  app.delete("/api/instances/:id", requireAuth, async (req, res) => {
    try {
      const instance = await storage.getInstance(req.params.id as string);
      if (!instance) {
        return res.status(404).json({ error: "Instance not found" });
      }
      if (instance.isDefault) {
        return res.status(400).json({ error: "Cannot delete the default instance" });
      }
      logAudit(`Deleted instance "${instance.name}"`, "instance_change", undefined, req.session.userId);
      await storage.deleteInstance(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete instance" });
    }
  });

  app.get("/api/settings", requireAuth, async (_req, res) => {
    try {
      const allSettings = await storage.getSettings();
      res.json(allSettings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings/bulk", requireAuth, async (req, res) => {
    try {
      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      await storage.bulkUpdateSettings(parsed.data.updates);
      logAudit(`Updated ${parsed.data.updates.length} settings`, "settings_update", parsed.data.updates.map((u: any) => u.key).join(", "), req.session.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/machines", requireAuth, async (_req, res) => {
    try {
      const allMachines = await storage.getMachines();
      res.json(allMachines);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch machines" });
    }
  });

  app.post("/api/machines", requireAuth, async (req, res) => {
    try {
      const parsed = insertMachineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const machine = await storage.createMachine(parsed.data);
      logAudit(`Created node "${parsed.data.name}"`, "machine_change", JSON.stringify(parsed.data), req.session.userId);
      res.status(201).json(machine);
    } catch (error) {
      res.status(500).json({ error: "Failed to create machine" });
    }
  });

  app.patch("/api/machines/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertMachineSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateMachine(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Node not found" });
      }
      logAudit(`Updated node "${updated.displayName || updated.name}"`, "machine_change", JSON.stringify(parsed.data), req.session.userId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/machines/:id", requireAuth, async (req, res) => {
    try {
      logAudit(`Deleted node ${req.params.id}`, "machine_change", undefined, req.session.userId);
      await storage.deleteMachine(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete machine" });
    }
  });

  app.post("/api/machines/dedup", requireAuth, async (_req, res) => {
    try {
      const allMachines = await storage.getMachines();
      const hostnameMap = new Map<string, any[]>();
      for (const m of allMachines) {
        const key = (m.hostname || "").toLowerCase();
        if (!key) continue;
        if (!hostnameMap.has(key)) hostnameMap.set(key, []);
        hostnameMap.get(key)!.push(m);
      }
      let removed = 0;
      for (const [hostname, dupes] of hostnameMap) {
        if (dupes.length <= 1) continue;
        const best = dupes.sort((a: any, b: any) => {
          if (a.displayName && a.displayName !== a.hostname && (!b.displayName || b.displayName === b.hostname)) return -1;
          if (b.displayName && b.displayName !== b.hostname && (!a.displayName || a.displayName === a.hostname)) return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        })[0];
        for (const d of dupes) {
          if (d.id === best.id) continue;
          await storage.deleteMachine(d.id);
          removed++;
          console.log(`[dedup] Removed duplicate machine: ${d.displayName || d.name} (${d.id}) - kept ${best.displayName || best.name} (${best.id})`);
        }
      }
      res.json({ success: true, removed, remaining: allMachines.length - removed });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to deduplicate machines", details: error.message });
    }
  });

  // Gateway proxy: test if gateway is reachable
  app.get("/api/gateway/probe", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.json({ reachable: false, error: "No server URL configured for this instance" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;

      const serverUrl = instance.serverUrl;
      let parsedUrl: URL;
      try { parsedUrl = new URL(serverUrl); } catch { return res.json({ reachable: false, error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);

      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];
      const httpEndpoints = ["/__openclaw__/canvas/", "/api/health", "/"];

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      for (const proto of protocols) {
        const baseOrigin = `${proto}//${host}:${port}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        for (const endpoint of httpEndpoints) {
          try {
            const url = new URL(endpoint, baseOrigin);
            const resp = await fetch(url.toString(), { signal: controller.signal, headers });
            if (resp.ok || resp.status < 500) {
              clearTimeout(timeout);
              return res.json({ reachable: true, status: resp.status, serverUrl: `${proto}//${host}:${port}`, endpoint });
            }
          } catch {}
        }
        clearTimeout(timeout);
      }

      const net = await import("net");
      const tcpReachable = await new Promise<boolean>((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(5000);
        sock.on("connect", () => { sock.destroy(); resolve(true); });
        sock.on("error", () => { sock.destroy(); resolve(false); });
        sock.on("timeout", () => { sock.destroy(); resolve(false); });
        sock.connect(port, host);
      });

      if (tcpReachable) {
        return res.json({ reachable: true, status: 0, serverUrl: instance.serverUrl, endpoint: `tcp://${host}:${port}` });
      }

      return res.json({ reachable: false, error: `Gateway not responding on ${host}:${port}. Check that port ${port} is open in the VPS firewall.` });
    } catch (error) {
      res.status(500).json({ error: "Failed to probe gateway" });
    }
  });

  app.get("/api/gateway/probe-ssh", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ reachable: false, error: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) return res.json({ reachable: false, error: "No VPS configured", method: "ssh" });

      const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);
      const result = await executeSSHCommand("status", sshConfig);
      const output = result.output || "";
      const isRunning = output.includes("openclaw") || output.includes("18789");
      res.json({
        reachable: isRunning,
        method: "ssh",
        host: vps.vpsIp,
        output: output.substring(0, 500),
        error: isRunning ? undefined : "Gateway process not detected via SSH",
      });
    } catch (error: any) {
      res.json({ reachable: false, method: "ssh", error: error.message || "SSH probe failed" });
    }
  });

  app.get("/api/gateway/health", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) return res.json({ error: "No VPS configured", ok: false });

      const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);
      const result = await executeSSHCommand("gateway-call-health", sshConfig);
      if (result.success && result.output) {
        try {
          const data = JSON.parse(result.output.trim());
          return res.json(data);
        } catch {
          return res.json({ ok: false, error: "Failed to parse health response", raw: result.output?.substring(0, 500) });
        }
      }
      return res.json({ ok: false, error: result.output || "Health check failed" });
    } catch (error: any) {
      res.json({ ok: false, error: error.message || "Gateway health check failed" });
    }
  });

  app.get("/api/gateway/sync-config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) return res.status(400).json({ error: "No VPS configured" });

      const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);
      const result = await executeSSHCommand("read-gateway-json", sshConfig);
      const output = (result.output || "").trim();
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) return res.status(500).json({ error: parsed.error });
        const instance = await storage.getInstance(instanceId);
        const serverUrl = instance?.serverUrl || "";
        const hostname = (() => {
          try { return new URL(serverUrl).hostname; } catch { return vps.vpsIp; }
        })();
        const wsProtocol = (() => {
          try { return new URL(serverUrl).protocol === "https:" ? "wss" : "ws"; } catch { return "ws"; }
        })();
        res.json({
          gatewayPort: parsed.port || 18789,
          gatewayBind: parsed.bind || "lan",
          gatewayToken: parsed.token || "",
          gatewayPassword: parsed.password || "",
          websocketUrl: `${wsProtocol}://${hostname}:${parsed.port || 18789}`,
        });
      } catch {
        res.status(500).json({ error: "Could not parse gateway config from VPS", raw: output.substring(0, 500) });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to sync config from VPS" });
    }
  });

  // Gateway proxy: proxy the native OpenClaw canvas UI (browser can't add Auth headers to window.open)
  app.get("/api/gateway/canvas", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;

      let parsedUrl: URL;
      try { parsedUrl = new URL(instance.serverUrl); } catch { return res.status(400).json({ error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);

      const rawPath = req.query.path?.toString() || "/__openclaw__/canvas/";
      const canvasPath = rawPath.startsWith("/") ? rawPath : "/__openclaw__/canvas/";

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];
      let resp: globalThis.Response | null = null;
      let workingProto = protocols[0];

      for (const proto of protocols) {
        const canvasUrl = `${proto}//${host}:${port}${canvasPath}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          resp = await fetch(canvasUrl, { headers, signal: controller.signal });
          clearTimeout(timeout);
          workingProto = proto;
          break;
        } catch {
          clearTimeout(timeout);
        }
      }

      if (!resp) {
        res.setHeader("Content-Type", "text/html");
        return res.status(502).send(`<!DOCTYPE html><html><head><title>Gateway Unreachable</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#ccc}
.box{text-align:center;max-width:480px;padding:2rem;border:1px solid #333;border-radius:12px;background:#1a1a1a}
h1{color:#ef4444;font-size:1.5rem}p{color:#999;line-height:1.6}
.btn{display:inline-block;margin-top:1rem;padding:.5rem 1.5rem;background:#333;color:#ccc;border:none;border-radius:6px;cursor:pointer;text-decoration:none}</style></head><body><div class="box">
<h1>Gateway Unreachable</h1>
<p>Could not connect to the OpenClaw gateway on this VPS. The server may be down or port 18789 may be blocked by a firewall.</p>
<p style="font-size:.85rem">Try using the <strong>SSH Remote Control</strong> buttons (Check Status, Diagnose, Open Port) in the dashboard to troubleshoot.</p>
<a class="btn" href="javascript:window.close()">Close</a></div></body></html>`);
      }

      const contentType = resp.headers.get("content-type") || "text/html";
      res.setHeader("Content-Type", contentType);
      res.status(resp.status);

      if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("javascript") && !contentType.includes("xml") && !contentType.includes("svg")) {
        const arrayBuf = await resp.arrayBuffer();
        return res.send(Buffer.from(arrayBuf));
      }

      const body = await resp.text();

      const proxyBase = `/api/gateway/canvas?instanceId=${instanceId}&path=`;

      let rewritten = body
        .replace(/\s+crossorigin\b/gi, '')
        .replace(/(href|src|action)="\/(?!\/)/g, `$1="${proxyBase}/`)
        .replace(/(href|src|action)="\.\/([^"]*)/g, (_m: string, attr: string, rest: string) => {
          const pathDir2 = canvasPath.endsWith("/") ? canvasPath : canvasPath.substring(0, canvasPath.lastIndexOf("/") + 1);
          return `${attr}="${proxyBase}${pathDir2}${rest}`;
        })
        .replace(/url\(["']?\/(?!\/)/g, `url("${proxyBase}/`)
        .replace(/url\(["']?\.\//g, () => {
          const pathDir2 = canvasPath.endsWith("/") ? canvasPath : canvasPath.substring(0, canvasPath.lastIndexOf("/") + 1);
          return `url("${proxyBase}${pathDir2}`;
        });

      if (contentType.includes("javascript") || contentType.includes("css")) {
        const baseUrl = `${workingProto}//${host}:${port}`;
        rewritten = rewritten.replace(new RegExp(baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/[^"\'\\s]*)', 'g'), (_m: string, p: string) => `${proxyBase}${p}`);
      }

      if (contentType.includes("html") && canvasPath === "/") {
        const infoScript = `<script>
(function(){
  var banner=document.createElement('div');
  banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#1e293b,#334155);color:#e2e8f0;padding:6px 16px;font:12px system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #475569';
  banner.innerHTML='<span>Read-only preview &mdash; proxied from your VPS. For full interactive access, use the SSH tunnel command from your dashboard settings.</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 4px">&times;</button>';
  document.addEventListener('DOMContentLoaded',function(){document.body.prepend(banner)});
})();
</script>`;
        rewritten = rewritten.replace(/<head>/i, `<head>${infoScript}`);
      }

      res.send(rewritten);
    } catch (error) {
      res.status(502).json({ error: "Failed to load OpenClaw canvas" });
    }
  });

  // Gateway proxy: restart the gateway service
  app.post("/api/gateway/restart", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured for this instance" });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;
      if (!token) return res.status(400).json({ error: "No gateway token configured. Set it in OpenClaw Config or set an API key on the instance." });

      let parsedUrl: URL;
      try { parsedUrl = new URL(instance.serverUrl); } catch { return res.status(400).json({ error: "Invalid server URL" }); }
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port) || (config?.gatewayPort ?? 18789);
      const protocols = parsedUrl.protocol === "https:" ? ["https:", "http:"] : ["http:", "https:"];

      const restartEndpoints = ["/api/restart", "/api/v1/restart", "/api/gateway/restart", "/restart"];

      let lastStatus = 0;
      let lastError = "";
      for (const proto of protocols) {
        const baseOrigin = `${proto}//${host}:${port}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        for (const endpoint of restartEndpoints) {
          try {
            const url = new URL(endpoint, baseOrigin);
            const resp = await fetch(url.toString(), {
              method: "POST",
              signal: controller.signal,
              headers: { "Authorization": `Bearer ${token}` },
            });
            lastStatus = resp.status;
            if (resp.ok) {
              clearTimeout(timeout);
              let body: any = {};
              try { body = await resp.json(); } catch {}
              return res.json({ success: true, status: resp.status, endpoint, message: body.message || "Gateway restart signal sent", serverUrl: `${proto}//${host}:${port}` });
            }
            if (resp.status === 401 || resp.status === 403) {
              lastError = `Authentication failed (${resp.status}). Check your gateway token.`;
            }
          } catch {}
        }
        clearTimeout(timeout);
      }

      if (lastError) {
        return res.status(403).json({ error: lastError, status: lastStatus });
      }

      try {
        for (const proto of protocols) {
          const healthUrl = `${proto}//${host}:${port}/api/health`;
          const healthController = new AbortController();
          const healthTimeout = setTimeout(() => healthController.abort(), 5000);
          try {
            const healthResp = await fetch(healthUrl, {
              signal: healthController.signal,
              headers: { "Authorization": `Bearer ${token}` },
            });
            clearTimeout(healthTimeout);
            if (healthResp.ok) {
              return res.json({
                success: false,
                reachable: true,
                error: "Gateway is reachable but no restart API endpoint was found. You may need to restart the Docker container manually using: docker compose -p PROJECT restart",
              });
            }
          } catch { clearTimeout(healthTimeout); }
        }
      } catch {}

      return res.status(502).json({
        error: "Could not reach the gateway server. Check that the server URL is correct and the gateway is running.",
        tried: restartEndpoints,
        lastStatus: lastStatus || undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to restart gateway: " + (error.message || "Unknown error") });
    }
  });

  // Gateway proxy: sync nodes from native dashboard
  app.post("/api/gateway/sync", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const instance = await storage.getInstance(instanceId);
      if (!instance?.serverUrl) return res.status(400).json({ error: "No server URL configured. Set it in Instance settings." });
      const config = await storage.getOpenclawConfig(instanceId);
      const token = config?.gatewayToken || instance.apiKey;
      if (!token) return res.status(400).json({ error: "No gateway token configured. Set it in OpenClaw Config or set an API key on the instance." });

      let gatewayNodes: any[] = [];
      let syncMethod = "";
      let connectedNodeNames = new Set<string>();

      const vpsConn = await storage.getVpsConnection(instanceId);
      let sshConfig: any = null;
      if (vpsConn?.vpsIp) {
        const { buildSSHConfigFromVps } = await import("./ssh");
        sshConfig = buildSSHConfigFromVps(vpsConn);

        try {
          const cached = await getCachedNodeList(sshConfig);
          if (cached && cached.nodes.length > 0) {
            gatewayNodes = cached.nodes;
            syncMethod = "gateway-call-node-list";
            for (const n of cached.nodes) {
              if (n.connected) {
                const name = (n.displayName || n.name || n.hostname || "").toLowerCase();
                if (name) connectedNodeNames.add(name);
              }
            }
          }
        } catch {}

        if (!syncMethod) {
          try {
            const nodeResult = await executeSSHCommand("list-nodes", sshConfig);
            if (nodeResult.success && nodeResult.output) {
              try {
                const parsed = JSON.parse(nodeResult.output.trim());
                if (Array.isArray(parsed)) {
                  gatewayNodes = parsed;
                  syncMethod = "ssh-cli";
                } else if (parsed && typeof parsed === "object") {
                  gatewayNodes = Object.values(parsed);
                  syncMethod = "ssh-cli";
                }
              } catch {}
            }
          } catch {}
        }

        if (sshConfig && syncMethod) {
          try {
            const devicesResult = await executeSSHCommand("cli-devices-list", sshConfig);
            if (devicesResult.success && devicesResult.output) {
              try {
                const parsed = JSON.parse(devicesResult.output.trim());
                if (!parsed.error) {
                  const pairedDevices = parsed.paired || [];
                  const pendingDevices = parsed.pending || [];
                  const allDevices = [...pairedDevices, ...pendingDevices];

                  for (const dev of allDevices) {
                    const devName = (dev.name || dev.hostname || dev.displayName || "").toLowerCase();
                    const devId = (dev.requestId || dev.id || dev.deviceId || "").toLowerCase();
                    const alreadyInList = gatewayNodes.some((n: any) => {
                      const nNames = [n.name, n.displayName, n.hostname, n.nodeId, n.id]
                        .filter(Boolean).map((s: string) => s.toLowerCase());
                      return nNames.includes(devName) || nNames.includes(devId);
                    });
                    if (!alreadyInList && (devName || devId)) {
                      gatewayNodes.push({
                        name: dev.name || dev.hostname || dev.displayName || devId,
                        displayName: dev.displayName || dev.name || dev.hostname || devId,
                        hostname: dev.hostname || dev.name || "",
                        ip: dev.ip || dev.address || dev.remoteIp || "",
                        platform: dev.os || dev.platform || "",
                        connected: false,
                        status: pairedDevices.includes(dev) ? "paired" : "pending",
                      });
                    }
                  }
                }
              } catch {}
            }
          } catch {}

          try {
            const [pairedResult, pendingResult] = await Promise.all([
              executeSSHCommand("list-paired-nodes", sshConfig),
              executeSSHCommand("list-pending-nodes", sshConfig),
            ]);

            const processFileNodes = (result: any, isPaired: boolean) => {
              if (!result.success || !result.output) return;
              try {
                let parsed = JSON.parse(result.output.trim());
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
                if (!Array.isArray(parsed)) return;
                for (const entry of parsed) {
                  const entryName = typeof entry === "string" ? entry : (entry.name || entry.hostname || entry.displayName || entry.id || "");
                  if (!entryName) continue;
                  const alreadyInList = gatewayNodes.some((n: any) => {
                    const nNames = [n.name, n.displayName, n.hostname, n.nodeId, n.id]
                      .filter(Boolean).map((s: string) => s.toLowerCase());
                    return nNames.includes(entryName.toLowerCase());
                  });
                  if (!alreadyInList) {
                    const nodeData = typeof entry === "string"
                      ? { name: entry, hostname: entry, connected: false, status: isPaired ? "paired" : "pending" }
                      : { ...entry, name: entry.name || entry.hostname || entry.id, connected: false, status: isPaired ? "paired" : "pending" };
                    gatewayNodes.push(nodeData);
                  }
                }
              } catch {}
            };

            processFileNodes(pairedResult, true);
            processFileNodes(pendingResult, false);
          } catch {}
        }
      }

      if (!syncMethod) {
        const endpoints = ["/api/sessions", "/api/nodes", "/api/v1/sessions", "/api/v1/nodes"];
        for (const ep of endpoints) {
          try {
            const url = new URL(ep, instance.serverUrl);
            url.searchParams.set("token", token);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const resp = await fetch(url.toString(), { signal: controller.signal });
            clearTimeout(timeout);
            if (resp.ok) {
              const data = await resp.json();
              if (Array.isArray(data)) gatewayNodes = data;
              else if (data.sessions) gatewayNodes = Array.isArray(data.sessions) ? data.sessions : [];
              else if (data.nodes) gatewayNodes = Array.isArray(data.nodes) ? data.nodes : [];
              else if (data.peers) gatewayNodes = Array.isArray(data.peers) ? data.peers : [];
              else if (data.data && Array.isArray(data.data)) gatewayNodes = data.data;
              syncMethod = ep;
              break;
            }
          } catch { continue; }
        }
      }

      if (!syncMethod) {
        return res.status(502).json({
          error: "Could not reach the gateway server via SSH or HTTP API. You can add nodes manually using the Add Node button.",
        });
      }

      const existingMachines = await storage.getMachines();
      let created = 0;
      let updated = 0;

      for (const gNode of gatewayNodes) {
        const nodeName = gNode.name || gNode.displayName || gNode.hostname || gNode.id || "Unknown Node";
        const status = (gNode.connected || gNode.status === "connected" || gNode.online) ? "connected" : "disconnected";
        const hostname = gNode.hostname || gNode.host || gNode.name || "";
        const ipAddress = gNode.ip || gNode.ipAddress || gNode.address || "";
        const os = gNode.os || gNode.platform || "";

        const existing = existingMachines.find(
          (m) => {
            const mIds = [m.hostname, m.name, m.displayName, m.ipAddress].filter(Boolean).map((s) => s!.toLowerCase());
            const nIds = [hostname, nodeName, gNode.id, gNode.nodeId, gNode.requestId, gNode.deviceId].filter(Boolean).map((s: string) => s.toLowerCase());
            return mIds.some((mid) => nIds.includes(mid));
          }
        );

        if (existing) {
          await storage.updateMachine(existing.id, {
            status,
            ...(hostname && { hostname }),
            ...(ipAddress && { ipAddress }),
            ...(os && { os }),
            lastSeen: new Date(),
          });
          updated++;
        } else {
          await storage.createMachine({
            name: nodeName,
            displayName: nodeName,
            hostname,
            ipAddress,
            os,
            status,
          });
          created++;
        }
      }

      const allMachinesAfterSync = await storage.getMachines();
      const nonWhatsappMachines = allMachinesAfterSync.filter((m: any) => m.os !== "WhatsApp");
      const connectedCount = nonWhatsappMachines.filter((m: any) => m.status === "connected").length;
      const offlineCount = nonWhatsappMachines.filter((m: any) => m.status !== "connected").length;

      res.json({
        success: true,
        endpoint: syncMethod,
        total: nonWhatsappMachines.length,
        gatewayFound: gatewayNodes.length,
        connectedCount,
        offlineCount,
        created,
        updated,
        nodes: nonWhatsappMachines.map((m: any) => ({
          name: m.displayName || m.name || m.hostname,
          status: m.status || "disconnected",
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to sync from gateway: " + (error.message || "Unknown error") });
    }
  });

  let nodeListCache: { nodes: any[]; timestamp: number } | null = null;
  const NODE_LIST_CACHE_TTL = 15000;

  async function getCachedNodeList(sshConfig: any): Promise<{ nodes: any[]; latencyMs: number } | null> {
    if (nodeListCache && Date.now() - nodeListCache.timestamp < NODE_LIST_CACHE_TTL) {
      return { nodes: nodeListCache.nodes, latencyMs: 0 };
    }
    const { executeSSHCommand } = await import("./ssh");
    const start = Date.now();
    const result = await executeSSHCommand("gateway-call-node-list", sshConfig);
    const latency = Date.now() - start;
    if (result.success && result.output) {
      try {
        const parsed = JSON.parse(result.output.trim());
        if (!parsed.error && parsed.nodes && Array.isArray(parsed.nodes)) {
          nodeListCache = { nodes: parsed.nodes, timestamp: Date.now() };
          return { nodes: parsed.nodes, latencyMs: latency };
        }
      } catch {}
    }
    return null;
  }

  app.post("/api/machines/:id/health-check", requireAuth, async (req, res) => {
    try {
      const machine = await storage.getMachine(req.params.id as string);
      if (!machine) return res.status(404).json({ error: "Node not found" });

      const instanceId = await resolveInstanceId(req);
      const results: { method: string; reachable: boolean; latencyMs?: number; error?: string }[] = [];

      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps?.vpsIp) {
          try {
            const { buildSSHConfigFromVps } = await import("./ssh");
            const sshConfig = buildSSHConfigFromVps(vps);
            const cached = await getCachedNodeList(sshConfig);

            if (cached) {
              const mIdentifiers = [machine.hostname, machine.name, machine.displayName].filter(Boolean).map((s: string) => s.toLowerCase());
              const match = cached.nodes.find((n: any) => {
                const nIds = [n.displayName, n.hostname, n.name, n.clientId, n.nodeId, n.id].filter(Boolean).map((s: string) => s.toLowerCase());
                return n.connected && mIdentifiers.some((mid: string) => nIds.includes(mid));
              });

              if (match) {
                results.push({ method: "gateway-ssh", reachable: true, latencyMs: cached.latencyMs });
                await storage.updateMachine(machine.id, { status: "connected", lastSeen: new Date() });
                return res.json({ nodeId: machine.id, status: "connected", lastChecked: new Date().toISOString(), results });
              } else {
                results.push({ method: "gateway-ssh", reachable: false, error: "Node not found in gateway connected list" });
              }
            }
          } catch {}
        }

        const instance = await storage.getInstance(instanceId);
        const config = await storage.getOpenclawConfig(instanceId);
        const token = config?.gatewayToken || instance?.apiKey;
        if (instance?.serverUrl && token) {
          const endpoints = ["/api/sessions", "/api/nodes", "/api/v1/sessions", "/api/v1/nodes"];
          for (const ep of endpoints) {
            try {
              const url = new URL(ep, instance.serverUrl);
              url.searchParams.set("token", token);
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const start = Date.now();
              const resp = await fetch(url.toString(), { signal: controller.signal });
              clearTimeout(timeout);
              if (resp.ok) {
                const data = await resp.json();
                const nodes = Array.isArray(data) ? data :
                  data.sessions || data.nodes || data.peers || data.data || [];
                const allNodes = Array.isArray(nodes) ? nodes : [];
                const match = allNodes.find((n: any) =>
                  (machine.hostname && (n.hostname === machine.hostname || n.host === machine.hostname)) ||
                  (machine.name && (n.name === machine.name || n.displayName === machine.name)) ||
                  (machine.displayName && (n.displayName === machine.displayName || n.name === machine.displayName)) ||
                  (machine.ipAddress && (n.ip === machine.ipAddress || n.ipAddress === machine.ipAddress || n.address === machine.ipAddress))
                );
                if (match) {
                  const isOnline = match.connected || match.status === "connected" || match.online;
                  const latency = Date.now() - start;
                  results.push({
                    method: "gateway",
                    reachable: !!isOnline,
                    latencyMs: latency,
                  });
                  const newStatus = isOnline ? "connected" : "disconnected";
                  await storage.updateMachine(machine.id, { status: newStatus, lastSeen: isOnline ? new Date() : (machine.lastSeen ?? undefined) });
                  return res.json({
                    nodeId: machine.id,
                    status: newStatus,
                    lastChecked: new Date().toISOString(),
                    results,
                  });
                }
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      if (machine.ipAddress) {
        try {
          const { Socket } = await import("net");
          const ports = [22, 80, 443, 18789];
          let tcpReachable = false;
          let tcpLatency = 0;
          for (const port of ports) {
            try {
              const start = Date.now();
              await new Promise<void>((resolve, reject) => {
                const socket = new Socket();
                socket.setTimeout(3000);
                socket.on("connect", () => { socket.destroy(); resolve(); });
                socket.on("error", reject);
                socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
                socket.connect(port, machine.ipAddress!);
              });
              tcpReachable = true;
              tcpLatency = Date.now() - start;
              break;
            } catch {
              continue;
            }
          }
          results.push({
            method: "tcp",
            reachable: tcpReachable,
            latencyMs: tcpReachable ? tcpLatency : undefined,
            error: tcpReachable ? undefined : "No open ports found on common ports (22, 80, 443, 18789)",
          });
          if (tcpReachable) {
            await storage.updateMachine(machine.id, { status: "connected", lastSeen: new Date() });
          }
        } catch (err) {
          results.push({ method: "tcp", reachable: false, error: String(err) });
        }
      }

      const isReachable = results.some(r => r.reachable);
      const newStatus = isReachable ? "connected" : (results.length > 0 ? "disconnected" : machine.status);
      if (results.length > 0) {
        await storage.updateMachine(machine.id, {
          status: newStatus,
          ...(isReachable ? { lastSeen: new Date() } : {}),
        });
      }

      res.json({
        nodeId: machine.id,
        status: newStatus,
        lastChecked: new Date().toISOString(),
        results,
        noChecksPossible: results.length === 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Health check failed: " + (error.message || "Unknown error") });
    }
  });

  app.get("/api/openclaw/deploy-commands", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });

      const config = await storage.getOpenclawConfig(instanceId);
      const instance = await storage.getInstance(instanceId);
      const vps = await storage.getVpsConnection(instanceId);
      const llmKeys = await storage.getLlmApiKeys();
      const activeKey = llmKeys.find(k => k.active);

      const gatewayPort = config?.gatewayPort ?? 18789;
      const gatewayBind = config?.gatewayBind ?? "127.0.0.1";
      const gatewayMode = config?.gatewayMode ?? "local";
      const gatewayToken = config?.gatewayToken ?? "";
      const defaultLlm = config?.defaultLlm ?? "deepseek/deepseek-chat";
      const sshUser = vps?.sshUser ?? "root";
      const sshHost = vps?.vpsIp ?? instance?.serverUrl?.replace(/^https?:\/\//, "").replace(/:\d+$/, "") ?? "";
      const sshPort = vps?.vpsPort ?? 22;

      const modelPrefix = defaultLlm.split("/")[0] || "openrouter";
      const knownProviders = ["openrouter", "anthropic", "openai", "deepseek", "google", "mistral", "cohere"];
      const provider = knownProviders.includes(modelPrefix) ? modelPrefix : "openrouter";
      const apiKeyPlaceholder = "YOUR_API_KEY";
      const hasRealKey = !!activeKey?.apiKey;

      const onboardCmd = `openclaw onboard --non-interactive --accept-risk --mode ${gatewayMode} --auth-choice apiKey --${provider}-api-key "${apiKeyPlaceholder}" --gateway-port ${gatewayPort} --gateway-bind ${gatewayBind === "127.0.0.1" ? "loopback" : gatewayBind}`;

      const shellExportVar = provider === "openrouter" ? "OPENROUTER_API_KEY" :
                             provider === "anthropic" ? "ANTHROPIC_API_KEY" :
                             provider === "openai" ? "OPENAI_API_KEY" :
                             provider === "deepseek" ? "DEEPSEEK_API_KEY" :
                             `${provider.toUpperCase()}_API_KEY`;

      const shellExport = `export ${shellExportVar}="${apiKeyPlaceholder}"`;

      const sshPrefix = sshHost ? `ssh ${sshPort !== 22 ? `-p ${sshPort} ` : ""}${sshUser}@${sshHost}` : "";

      const doctorFix = {
        step1_doctor: {
          title: "1. Run the Doctor",
          description: "Checks your OpenClaw config, diagnoses issues, and auto-fixes them. Run on your VPS.",
          command: "openclaw doctor",
          ssh: sshPrefix ? `${sshPrefix} "openclaw doctor"` : null,
        },
        step2_restart: {
          title: "2. Restart the Gateway",
          description: "Apply fixes by restarting the gateway service.",
          command: "openclaw gateway restart",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway restart"` : null,
        },
        step3_verify: {
          title: "3. Verify It's Working",
          description: "Check gateway status to confirm everything is running.",
          command: "openclaw gateway probe",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway probe"` : null,
        },
      };

      const manualFix = {
        step1_check: {
          title: "1. Check Provider Status",
          description: "Verify that your LLM provider is registered.",
          command: "openclaw models status --json",
          ssh: sshPrefix ? `${sshPrefix} "openclaw models status --json"` : null,
        },
        step2_onboard: {
          title: "2. Register Provider (Non-Interactive)",
          description: "Force-register the provider and bind your API key in ~/.openclaw/openclaw.json",
          command: onboardCmd,
          ssh: sshPrefix ? `${sshPrefix} '${onboardCmd}'` : null,
        },
        step3_persist: {
          title: "3. Set API Key Environment Variable",
          description: "Export your API key so OpenClaw can access it.",
          command: `export ${shellExportVar}="${apiKeyPlaceholder}"`,
          ssh: sshPrefix ? `${sshPrefix} "export ${shellExportVar}=${apiKeyPlaceholder}"` : null,
        },
        step4_restart: {
          title: "4. Restart Gateway",
          description: "Restart the gateway service to apply changes.",
          command: "openclaw gateway restart",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway restart"` : null,
        },
        step5_verify: {
          title: "5. Verify Connection",
          description: "Confirm the gateway is running and the model is loaded.",
          command: "openclaw gateway probe && openclaw models status --json",
          ssh: sshPrefix ? `${sshPrefix} "openclaw gateway probe && openclaw models status --json"` : null,
        },
      };

      res.json({
        doctorFix,
        manualFix,
        hasRealKey,
        config: {
          provider,
          model: defaultLlm,
          gatewayPort,
          gatewayBind,
          gatewayMode,
          gatewayToken: gatewayToken ? "configured" : "not set",
          sshHost,
          sshUser,
          sshPort,
          envVar: shellExportVar,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate deploy commands" });
    }
  });

  app.get("/api/api-keys", requireAuth, async (_req, res) => {
    try {
      const keys = await storage.getApiKeys();
      res.json(keys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/api-keys", requireAuth, async (req, res) => {
    try {
      const parsed = insertApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const apiKey = await storage.createApiKey(parsed.data);
      logAudit(`Created API key "${parsed.data.name}"`, "api_key_change", undefined, req.session.userId);
      res.status(201).json(apiKey);
    } catch (error) {
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.patch("/api/api-keys/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateApiKey(req.params.id as string, req.body);
      if (!updated) {
        return res.status(404).json({ error: "API key not found" });
      }
      logAudit(`Updated API key "${updated.name}"`, "api_key_change", undefined, req.session.userId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.delete("/api/api-keys/:id", requireAuth, async (req, res) => {
    try {
      logAudit(`Deleted API key ${req.params.id}`, "api_key_change", undefined, req.session.userId);
      await storage.deleteApiKey(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.get("/api/vps", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const vps = await storage.getVpsConnection(instanceId);
      res.json(vps ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch VPS connection" });
    }
  });

  app.post("/api/vps", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const parsed = vpsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const vps = await storage.upsertVpsConnection(instanceId, parsed.data);
      res.json(vps);
    } catch (error) {
      res.status(500).json({ error: "Failed to update VPS connection" });
    }
  });

  app.post("/api/vps/check", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ connected: false, message: "No instance specified" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps) {
        await storage.createVpsConnectionLog({ instanceId, status: "error", message: "No VPS configured" });
        return res.json({ connected: false, message: "No VPS configured" });
      }
      const hasValidConfig = !!(vps.vpsIp && vps.vpsPort && vps.sshUser);
      const updated = await storage.updateVpsConnectionStatus(vps.id, hasValidConfig);
      const statusMsg = hasValidConfig
        ? `Connected to ${vps.sshUser}@${vps.vpsIp}:${vps.vpsPort}`
        : `Connection failed — missing configuration`;
      await storage.createVpsConnectionLog({
        instanceId,
        status: hasValidConfig ? "connected" : "error",
        message: statusMsg,
      });
      res.json({ connected: hasValidConfig, vps: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to check VPS" });
    }
  });

  app.get("/api/docker/services", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const services = await storage.getDockerServices(instanceId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Docker services" });
    }
  });

  app.get("/api/openclaw/config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const config = await storage.getOpenclawConfig(instanceId);
      if (config && Array.isArray(config.pendingNodes)) {
        config.pendingNodes = (config.pendingNodes as any[]).map((n: any) => {
          if (typeof n === "string") {
            return { id: n, hostname: n, ip: "Pending discovery", os: "Pending discovery", location: "Pending discovery" };
          }
          return n;
        });
      }
      res.json(config ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OpenClaw config" });
    }
  });

  app.post("/api/openclaw/config", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const parsed = openclawConfigUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const config = await storage.upsertOpenclawConfig(instanceId, parsed.data);
      logAudit("Updated OpenClaw config", "config_change", Object.keys(parsed.data).join(", "), req.session.userId);
      if (parsed.data.whatsappEnabled !== undefined) {
        await storage.updateDockerServiceStatus("whatsapp-bridge", parsed.data.whatsappEnabled ? "running" : "stopped", instanceId);
        if (!isProductionRuntime) {
          try {
            const bot = await getWhatsappBot();
            if (parsed.data.whatsappEnabled && !bot.isConnected()) {
              bot.start();
            } else if (!parsed.data.whatsappEnabled && (bot.isConnected() || bot.getStatus().state !== "disconnected")) {
              await bot.stop();
            }
          } catch {}
        }
      }

      let vpsPushResult: { success: boolean; error?: string } | null = null;
      try {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const updates: Record<string, any> = {};
          if (parsed.data.gatewayPort !== undefined) updates.port = parsed.data.gatewayPort;
          if (parsed.data.gatewayBind !== undefined) updates.bind = parsed.data.gatewayBind;
          if (parsed.data.gatewayToken !== undefined) updates["auth.token"] = parsed.data.gatewayToken;
          if (parsed.data.gatewayPassword !== undefined) updates["auth.password"] = parsed.data.gatewayPassword;
          if (parsed.data.defaultLlm !== undefined) updates.defaultModel = parsed.data.defaultLlm;
          if (parsed.data.fallbackLlm !== undefined) updates.fallbackModel = parsed.data.fallbackLlm;

          if (Object.keys(updates).length > 0) {
            const pyUpdates = JSON.stringify(updates).replace(/'/g, "\\'");
            const pushCmd = `python3 -c "
import json, os
f='/root/.openclaw/openclaw.json'
if not os.path.exists(f):
    print(json.dumps({'error':'Config file not found'}))
    exit(0)
d=json.load(open(f))
gw=d.setdefault('gateway',{})
updates=${pyUpdates}
for k,v in updates.items():
    parts=k.split('.')
    target=gw
    for p in parts[:-1]:
        target=target.setdefault(p,{})
    target[parts[-1]]=v
json.dump(d,open(f,'w'),indent=2)
print(json.dumps({'success':True,'updated':list(updates.keys())}))
"`;
            const result = await executeRawSSHCommand(pushCmd, sshConfig);
            if (result.success) {
              try {
                const parsed = JSON.parse(result.output.trim());
                vpsPushResult = parsed;
              } catch {
                vpsPushResult = { success: true };
              }
            } else {
              vpsPushResult = { success: false, error: result.error || result.output };
            }
          }
        }
      } catch (e: any) {
        vpsPushResult = { success: false, error: e.message };
      }

      res.json({ ...config, vpsPushResult });
    } catch (error) {
      res.status(500).json({ error: "Failed to update OpenClaw config" });
    }
  });

  app.get("/api/status", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ vps_connected: false, openclaw_status: "offline", docker_services: 0, services: [] });
      const vps = await storage.getVpsConnection(instanceId);
      const docker = await storage.getDockerServices(instanceId);
      const config = await storage.getOpenclawConfig(instanceId);
      res.json({
        vps_connected: vps?.isConnected ?? false,
        openclaw_status: config?.gatewayStatus ?? "offline",
        docker_services: docker.length,
        services: docker.map((d) => ({
          name: d.serviceName,
          status: d.status,
          port: d.port,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  app.get("/api/nodes/pending", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ pending: [], source: "none" });

      const vps = instanceId ? await storage.getVpsConnection(instanceId) : null;
      if (vps?.vpsIp) {
        try {
          const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          const cliResult = await executeSSHCommand("cli-devices-list", sshConfig);
          if (cliResult.success && cliResult.output) {
            try {
              const cliParsed = JSON.parse(cliResult.output.trim());
              if (!cliParsed.error) {
                const devices = Array.isArray(cliParsed) ? cliParsed : (cliParsed.devices || cliParsed.data || Object.values(cliParsed));
                const pendingDevices = (devices as any[]).filter((d: any) => d.status === "pending" || d.state === "pending");
                const normalized = pendingDevices.map((d: any, idx: number) => ({
                  id: d.requestId || d.id || d.deviceId || `device-${idx}`,
                  hostname: d.name || d.hostname || d.displayName || d.requestId || `device-${idx}`,
                  name: d.name || d.hostname || d.displayName,
                  ip: d.ip || d.address || "Unknown",
                  os: d.os || d.platform || "Unknown",
                  role: d.role || "node",
                  age: d.age || "",
                  status: "pending",
                }));
                await storage.upsertOpenclawConfig(instanceId, { pendingNodes: normalized });
                return res.json({ pending: normalized, source: "cli" });
              }
            } catch {}
          }

          const result = await executeSSHCommand("list-pending-nodes", sshConfig);
          if (result.success && result.output) {
            try {
              let parsed = JSON.parse(result.output.trim());
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                parsed = Object.values(parsed);
              }
              if (Array.isArray(parsed) && parsed.length > 0) {
                const normalized = parsed.map((n: any, idx: number) => {
                  if (typeof n === "string") return { id: n, hostname: n, ip: "Unknown", os: "Unknown", location: "Unknown", status: "pending" };
                  return {
                    id: n.requestId || n.id || n.deviceId || `device-${idx}`,
                    hostname: n.displayName || n.name || n.hostname || n.clientId || `device-${idx}`,
                    name: n.displayName || n.name || n.hostname || n.clientId,
                    ip: n.remoteIp || n.ip || n.address || "Unknown",
                    os: n.platform || n.os || "Unknown",
                    role: n.role || "node",
                    clientMode: n.clientMode || "node",
                    requestId: n.requestId,
                    deviceId: n.deviceId,
                    status: "pending",
                  };
                });
                await storage.upsertOpenclawConfig(instanceId, { pendingNodes: normalized });
                return res.json({ pending: normalized, source: "gateway" });
              }
            } catch {}
          }
        } catch {}
      }

      const config = await storage.getOpenclawConfig(instanceId);
      const localPending = ((config?.pendingNodes as any[]) ?? []).map((n: any, idx: number) => {
        if (typeof n === "string") return { id: n, hostname: n };
        const entry = { ...n };
        if (!entry.id) entry.id = entry.hostname || entry.name || `node-${idx}`;
        return entry;
      });
      res.json({ pending: localPending, source: "local" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending nodes" });
    }
  });

  app.post("/api/nodes/approve", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let sshApproved = false;
      let approvedNode: any = null;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildCliApproveCommand, buildApproveNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          try {
            const cliCmd = buildCliApproveCommand(node_id);
            console.log(`[nodes] CLI approve command: openclaw devices approve ${node_id}`);
            const cliResult = await executeRawSSHCommand(cliCmd, sshConfig);
            console.log(`[nodes] CLI approve result: success=${cliResult.success}, output=${cliResult.output?.substring(0, 200)}, error=${cliResult.error}`);
            if (cliResult.success && cliResult.output) {
              const trimmed = cliResult.output.trim();
              const jsonStart = trimmed.indexOf("{");
              const jsonStr = jsonStart >= 0 ? trimmed.substring(jsonStart) : trimmed;
              try {
                const cliParsed = JSON.parse(jsonStr);
                if (cliParsed.success || cliParsed.approved || cliParsed.device || !cliParsed.error) {
                  sshApproved = true;
                  approvedNode = cliParsed.device || cliParsed.node || cliParsed;
                }
              } catch (parseErr) {
                console.log(`[nodes] CLI output not JSON: ${trimmed.substring(0, 100)}`);
                if (trimmed.includes("approved") || trimmed.includes("Approved") || trimmed.includes("✓")) {
                  sshApproved = true;
                }
              }
            }
          } catch (cliErr: any) {
            console.log(`[nodes] CLI approve error: ${cliErr.message}`);
          }

          if (!sshApproved) {
            console.log(`[nodes] CLI failed, trying direct file approve for ${node_id}`);
            const cmd = buildApproveNodeCommand(node_id);
            const result = await executeRawSSHCommand(cmd, sshConfig);
            console.log(`[nodes] File approve result: success=${result.success}, output=${result.output?.substring(0, 200)}`);
            if (result.success && result.output) {
              try {
                const parsed = JSON.parse(result.output.trim());
                if (parsed.success) {
                  sshApproved = true;
                  approvedNode = parsed.node;
                } else if (parsed.error) {
                  console.log(`[nodes] File approve returned: ${parsed.error}`);
                }
              } catch {}
            }
          }
        } catch (sshErr: any) {
          console.log(`[nodes] SSH approve failed: ${sshErr.message}`);
        }
      }

      let localFound = false;
      const config = await storage.getOpenclawConfig(instanceId);
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          localFound = true;
          if (!approvedNode) approvedNode = pending[idx];
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig(instanceId, {
            pendingNodes: pending,
            nodesApproved: (config.nodesApproved ?? 0) + 1,
          });
        }
      }

      if (!sshApproved && !localFound) {
        return res.status(404).json({ error: "Node not found in pending list" });
      }

      if ((sshApproved || localFound) && approvedNode && typeof approvedNode === "object") {
        const nodeName = approvedNode.hostname || approvedNode.name || approvedNode.id || node_id;
        try {
          await storage.createMachine({
            name: nodeName,
            hostname: approvedNode.hostname || nodeName,
            ipAddress: approvedNode.ip || approvedNode.ipAddress || null,
            os: approvedNode.os || null,
            location: approvedNode.location || null,
            status: "connected",
            displayName: approvedNode.displayName || nodeName,
          });
        } catch {}
      }

      res.json({ success: true, sshApproved, node: approvedNode });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve node" });
    }
  });

  app.post("/api/nodes/reject", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let sshRejected = false;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildCliRejectCommand, buildRejectNodeCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);

          try {
            const cliCmd = buildCliRejectCommand(node_id);
            const cliResult = await executeRawSSHCommand(cliCmd, sshConfig);
            if (cliResult.success && cliResult.output) {
              try {
                const cliParsed = JSON.parse(cliResult.output.trim());
                if (cliParsed.success || cliParsed.rejected || !cliParsed.error) {
                  sshRejected = true;
                }
              } catch {}
            }
          } catch {}

          if (!sshRejected) {
            const cmd = buildRejectNodeCommand(node_id);
            const result = await executeRawSSHCommand(cmd, sshConfig);
            if (result.success && result.output) {
              try {
                const parsed = JSON.parse(result.output.trim());
                if (parsed.success) sshRejected = true;
              } catch {}
            }
          }
        } catch {}
      }

      const config = await storage.getOpenclawConfig(instanceId);
      if (config && config.pendingNodes) {
        const pending = config.pendingNodes as any[];
        const idx = pending.findIndex((n: any) => (typeof n === "string" ? n === node_id : n.id === node_id));
        if (idx >= 0) {
          pending.splice(idx, 1);
          await storage.upsertOpenclawConfig(instanceId, { pendingNodes: pending });
        }
      }

      res.json({ success: true, sshRejected });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject node" });
    }
  });

  app.post("/api/nodes/remove", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance specified" });
      const { node_id } = req.body;
      if (!node_id) return res.status(400).json({ error: "node_id is required" });

      const vps = await storage.getVpsConnection(instanceId);
      let removed = false;

      if (vps?.vpsIp) {
        try {
          const { executeRawSSHCommand, buildSSHConfigFromVps, buildRemoveDeviceCommand } = await import("./ssh");
          const sshConfig = buildSSHConfigFromVps(vps);
          const cmd = buildRemoveDeviceCommand(node_id);
          console.log(`[nodes] Removing device: ${node_id}`);
          const result = await executeRawSSHCommand(cmd, sshConfig);
          console.log(`[nodes] Remove result: success=${result.success}, output=${result.output?.substring(0, 300)}`);
          if (result.success && result.output) {
            try {
              const parsed = JSON.parse(result.output.trim());
              if (parsed.success) removed = true;
            } catch {}
          }
        } catch (e: any) {
          console.error(`[nodes] Remove error:`, e.message);
        }
      }

      res.json({ success: true, removed });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove device" });
    }
  });

  app.get("/api/nodes/paired", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ paired: [], source: "none" });

      let gatewayNodes: any[] = [];
      let source = "tracked";

      const vps = instanceId ? await storage.getVpsConnection(instanceId) : null;
      if (vps?.vpsIp) {
        const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
        const sshConfig = buildSSHConfigFromVps(vps);

        try {
          const nodeListResult = await executeSSHCommand("gateway-call-node-list", sshConfig);
          if (nodeListResult.success && nodeListResult.output) {
            const parsed = JSON.parse(nodeListResult.output.trim());
            if (!parsed.error && parsed.nodes && Array.isArray(parsed.nodes)) {
              const connectedNodes = parsed.nodes.filter((n: any) => n.connected);
              gatewayNodes = connectedNodes.map((n: any, idx: number) => ({
                id: n.nodeId || n.id || `node-${idx}`,
                hostname: n.displayName || n.name || n.hostname || `node-${idx}`,
                displayName: n.displayName || n.name || n.hostname || `node-${idx}`,
                name: n.displayName || n.name || n.hostname || `node-${idx}`,
                clientId: n.nodeId || n.id || `node-${idx}`,
                ip: n.ip || n.address || "",
                os: n.platform || "",
                version: n.version || "",
                status: "paired",
                connected: true,
              }));
              source = "gateway";
            }
          }
        } catch {}

        if (gatewayNodes.length === 0) {
          try {
            const result = await executeSSHCommand("list-paired-nodes", sshConfig);
            if (result.success && result.output) {
              try {
                let parsed = JSON.parse(result.output.trim());
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                  parsed = Object.values(parsed);
                }
                if (Array.isArray(parsed)) {
                  gatewayNodes = parsed.map((n: any, idx: number) => {
                    if (typeof n === "string") return { id: n, hostname: n, ip: "Unknown", os: "Unknown", status: "paired", connected: true };
                    const entry = { ...n, status: "paired", connected: true };
                    if (!entry.id) entry.id = entry.hostname || entry.name || `node-${idx}`;
                    return entry;
                  });
                  source = "gateway";
                }
              } catch {}
            }
          } catch {}
        }
      }

      const machines = await storage.getMachines();
      const trackedNodes = machines
        .filter(m => m.status === "connected")
        .map(m => ({
          id: String(m.id),
          hostname: m.hostname || m.name,
          displayName: m.displayName || m.hostname || m.name,
          name: m.displayName || m.hostname || m.name,
          clientId: String(m.id),
          ip: m.ipAddress || "",
          os: m.os || "",
          status: "paired",
          connected: true,
        }));

      const seenNames = new Set(gatewayNodes.map((n: any) => (n.name || n.hostname || "").toLowerCase()));
      const merged = [...gatewayNodes];
      for (const tn of trackedNodes) {
        const name = (tn.name || tn.hostname || "").toLowerCase();
        if (!seenNames.has(name)) {
          merged.push(tn);
          seenNames.add(name);
        }
      }

      return res.json({ paired: merged, source });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch paired nodes" });
    }
  });

  app.get("/api/nodes/live-status", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ gateway: "unknown", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: "No instance" });

      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.json({ gateway: "unknown", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: "No VPS configured" });

      const config = await storage.getOpenclawConfig(instanceId);
      const gatewayPort = config?.gatewayPort || 18789;

      const { executeSSHCommand, executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      let nodes: any[] = [];
      let devices: any[] = [];
      let gatewayRunning = false;
      let usedCli = false;
      let nodeListNodes: any[] = [];

      try {
        const cached = await getCachedNodeList(sshConfig);
        if (cached) {
              nodeListNodes = cached.nodes;
              nodes = cached.nodes.map((n: any, idx: number) => ({
                name: n.displayName || n.name || n.hostname || `node-${idx}`,
                id: n.nodeId || n.id || n.deviceId || `node-${idx}`,
                ip: n.ip || n.address || "",
                status: n.connected ? "connected" : "disconnected",
                caps: n.caps || n.capabilities || "",
                version: n.version || "",
                platform: n.platform || "",
                connectedAtMs: n.connectedAtMs || 0,
              }));
              gatewayRunning = true;
              usedCli = true;
        }
      } catch {}

      if (!usedCli) {
        try {
          const nodesResult = await executeSSHCommand("cli-nodes-status", sshConfig);
          if (nodesResult.success && nodesResult.output) {
            try {
              const parsed = JSON.parse(nodesResult.output.trim());
              if (!parsed.error) {
                const rawNodes = Array.isArray(parsed) ? parsed : (parsed.nodes || parsed.data || Object.values(parsed));
                nodes = (rawNodes as any[]).map((n: any, idx: number) => ({
                  name: n.name || n.displayName || n.hostname || `node-${idx}`,
                  id: n.id || n.nodeId || n.deviceId || `node-${idx}`,
                  ip: n.ip || n.address || "",
                  status: n.status || "unknown",
                  caps: n.caps || n.capabilities || "",
                  version: n.version || "",
                }));
                gatewayRunning = true;
                usedCli = true;
              }
            } catch {}
          }
        } catch {}
      }

      let cliPaired: any[] = [];
      let cliPending: any[] = [];

      if (nodeListNodes.length > 0) {
        cliPaired = nodeListNodes.filter((n: any) => n.connected).map((n: any, idx: number) => ({
          requestId: n.nodeId || n.id || `node-${idx}`,
          id: n.nodeId || n.id || `node-${idx}`,
          name: n.displayName || n.name || n.hostname || `node-${idx}`,
          displayName: n.displayName || n.name || n.hostname || `node-${idx}`,
          hostname: n.displayName || n.name || n.hostname || `node-${idx}`,
          clientId: n.nodeId || n.id || `node-${idx}`,
          role: "node",
          ip: n.ip || n.address || "",
          os: n.platform || "",
          version: n.version || "",
          status: "paired",
          connected: true,
        }));
      } else {
        try {
          const devicesResult = await executeSSHCommand("cli-devices-list", sshConfig);
          if (devicesResult.success && devicesResult.output) {
            try {
              const parsed = JSON.parse(devicesResult.output.trim());
              if (!parsed.error) {
                if (parsed.paired && Array.isArray(parsed.paired)) {
                  cliPaired = parsed.paired.map((d: any, idx: number) => ({
                    requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                    name: d.name || d.hostname || d.displayName || `device-${idx}`,
                    displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                    role: d.role || "node",
                    ip: d.ip || d.address || d.remoteIp || "",
                    age: d.age || "",
                    status: "paired",
                  }));
                }
                if (parsed.pending && Array.isArray(parsed.pending)) {
                  cliPending = parsed.pending.map((d: any, idx: number) => ({
                    requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                    name: d.name || d.hostname || d.displayName || `device-${idx}`,
                    displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                    role: d.role || "node",
                    ip: d.ip || d.address || d.remoteIp || "",
                    age: d.age || "",
                    status: "pending",
                  }));
                }
                if (cliPaired.length > 0 || cliPending.length > 0 || (parsed.paired && parsed.pending)) {
                  devices = [...cliPaired, ...cliPending];
                  if (!usedCli) gatewayRunning = true;
                  usedCli = true;
                } else {
                  const rawDevices = Array.isArray(parsed) ? parsed : (parsed.devices || parsed.data || Object.values(parsed));
                  devices = (rawDevices as any[]).map((d: any, idx: number) => ({
                    requestId: d.requestId || d.id || d.deviceId || `device-${idx}`,
                    name: d.name || d.hostname || d.displayName || `device-${idx}`,
                    displayName: d.displayName || d.name || d.hostname || `device-${idx}`,
                    role: d.role || "node",
                    ip: d.ip || d.address || d.remoteIp || "",
                    age: d.age || "",
                    status: d.status || "unknown",
                  }));
                  if (!usedCli) gatewayRunning = true;
                  usedCli = true;
                }
              }
            } catch {}
          }
        } catch {}
      }

      if (!usedCli) {
        try {
          const statusCmd = `ps aux | grep -E 'openclaw' | grep -v grep | head -5; echo '---LISTENING---'; ss -tlnp | grep ${gatewayPort} || echo 'not-listening'`;
          const statusResult = await executeRawSSHCommand(statusCmd, sshConfig);
          gatewayRunning = statusResult.success && statusResult.output ? (!statusResult.output.includes("not-listening") && statusResult.output.includes("openclaw")) : false;
        } catch (e: any) {
          console.error("[live-status] SSH status check failed:", e.message);
        }
      }

      let paired: any[] = cliPaired;
      let pending: any[] = cliPending;

      if (paired.length === 0 && pending.length === 0 && !nodeListNodes.length) {
        if (usedCli) {
          paired = devices.filter((d: any) => d.status === "paired");
          pending = devices.filter((d: any) => d.status === "pending");
        } else {
          try {
            const pairedResult = await executeSSHCommand("list-paired-nodes", sshConfig);
            if (pairedResult.success && pairedResult.output) {
              try {
                let parsed = JSON.parse(pairedResult.output.trim());
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
                if (Array.isArray(parsed)) {
                  paired = parsed.map((n: any, idx: number) => {
                    if (typeof n === "string") return { id: n, hostname: n };
                    return { id: n.id || n.deviceId || n.hostname || `node-${idx}`, ...n };
                  });
                }
              } catch {}
            }
          } catch {}

          try {
            const pendingResult = await executeSSHCommand("list-pending-nodes", sshConfig);
            if (pendingResult.success && pendingResult.output) {
              try {
                let parsed = JSON.parse(pendingResult.output.trim());
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = Object.values(parsed);
                if (Array.isArray(parsed)) {
                  pending = parsed.map((n: any, idx: number) => {
                    if (typeof n === "string") return { id: n, hostname: n };
                    return { id: n.id || n.deviceId || n.hostname || `node-${idx}`, ...n };
                  });
                }
              } catch {}
            }
          } catch {}
        }
      }

      const allMachines = await storage.getMachines();

      const pairedNames = new Set(paired.map((n: any) => (n.displayName || n.hostname || n.name || "").toLowerCase()));
      const trackedAsPaired = allMachines
        .filter(m => m.status === "connected")
        .filter(m => {
          const name = (m.displayName || m.hostname || m.name || "").toLowerCase();
          return !pairedNames.has(name);
        })
        .map(m => ({
          requestId: String(m.id),
          id: String(m.id),
          name: m.displayName || m.hostname || m.name,
          displayName: m.displayName || m.hostname || m.name,
          hostname: m.hostname || m.name,
          clientId: String(m.id),
          role: "node",
          ip: m.ipAddress || "",
          os: m.os || "",
          status: "paired",
          connected: true,
        }));
      paired = [...paired, ...trackedAsPaired];

      const connectedIds = new Set<string>();
      for (const n of nodes) {
        if (n.status && n.status.includes("connected")) {
          const ids = [n.name, n.id].filter(Boolean);
          ids.forEach((id: string) => connectedIds.add(id.toLowerCase()));
        }
      }
      for (const n of paired) {
        const ids = [n.displayName, n.hostname, n.name, n.clientId, n.id, n.requestId].filter(Boolean);
        ids.forEach((id: string) => connectedIds.add(id.toLowerCase()));
      }

      for (const m of allMachines) {
        const mIdentifiers = [m.hostname, m.name, m.displayName, m.ipAddress].filter(Boolean).map((s: string) => s.toLowerCase());
        const isConnected = mIdentifiers.some((id) => connectedIds.has(id));

        if (isConnected && m.status !== "connected") {
          await storage.updateMachine(m.id, { status: "connected", lastSeen: new Date() });
        }
      }

      const trackedMachines = allMachines
        .filter((m: any) => m.os !== "WhatsApp")
        .map((m: any) => {
          const mIds = [m.hostname, m.name, m.displayName, m.ipAddress].filter(Boolean).map((s: string) => s.toLowerCase());
          const matchedGatewayNode = nodes.find((n: any) => {
            const nIds = [n.name, n.id].filter(Boolean).map((s: string) => s.toLowerCase());
            return mIds.some((mid: string) => nIds.includes(mid));
          });
          return {
            id: m.id,
            name: m.displayName || m.hostname || m.name,
            hostname: m.hostname || m.name,
            ip: m.ipAddress || matchedGatewayNode?.ip || "",
            os: m.os || matchedGatewayNode?.platform || "",
            status: matchedGatewayNode ? "connected" : (m.status === "connected" ? "connected" : (m.status || "disconnected")),
            caps: matchedGatewayNode?.caps || "",
            version: matchedGatewayNode?.version || "",
            platform: matchedGatewayNode?.platform || m.os || "",
            lastSeen: m.lastSeen,
            source: matchedGatewayNode ? "gateway" : "database",
          };
        });

      const gatewayOnlyRaw = nodes.filter((n: any) => {
        const nIds = [n.name, n.id].filter(Boolean).map((s: string) => s.toLowerCase());
        return !allMachines.some((m: any) => {
          const mIds = [m.hostname, m.name, m.displayName, m.ipAddress].filter(Boolean).map((s: string) => s.toLowerCase());
          return mIds.some((mid: string) => nIds.includes(mid));
        });
      });

      const gatewayOnlyNodes = [];
      for (const n of gatewayOnlyRaw) {
        try {
          const unmatchedMachine = allMachines.find((m: any) => {
            if (m.os === "WhatsApp") return false;
            const alreadyMatched = trackedMachines.some((t: any) => t.id === m.id && t.source === "gateway");
            if (alreadyMatched) return false;
            const osPlatform = n.platform === "darwin" ? "macos" : n.platform;
            if (m.os && osPlatform && m.os.toLowerCase() === osPlatform.toLowerCase()) return true;
            if (!m.hostname && !m.ipAddress) return true;
            return false;
          });

          if (unmatchedMachine) {
            await storage.updateMachine(unmatchedMachine.id, {
              hostname: n.name,
              status: "connected",
              lastSeen: new Date(),
              os: unmatchedMachine.os || (n.platform === "darwin" ? "macos" : n.platform) || undefined,
            });
            console.log(`[live-status] Linked gateway node ${n.name} to existing machine: ${unmatchedMachine.displayName || unmatchedMachine.name} (${unmatchedMachine.id})`);
            const idx = trackedMachines.findIndex((t: any) => t.id === unmatchedMachine.id);
            if (idx >= 0) {
              trackedMachines[idx] = {
                ...trackedMachines[idx],
                hostname: n.name,
                status: "connected",
                caps: n.caps || "",
                version: n.version || "",
                platform: n.platform || "",
                source: "gateway",
              };
            }
          } else {
            const created = await storage.createMachine({
              name: n.name,
              hostname: n.name,
              ipAddress: n.ip || null,
              os: n.platform === "darwin" ? "macos" : n.platform || "linux",
              displayName: n.name,
              status: "connected",
            });
            console.log(`[live-status] Auto-created machine for gateway node: ${n.name} (${created.id})`);
            gatewayOnlyNodes.push({
              id: created.id,
              name: created.displayName || n.name,
              hostname: n.name,
              ip: n.ip || "",
              os: created.os || n.platform || "",
              status: "connected",
              caps: n.caps || "",
              version: n.version || "",
              platform: n.platform || "",
              lastSeen: new Date().toISOString(),
              source: "gateway",
            });
          }
        } catch (e: any) {
          console.error(`[live-status] Error syncing gateway node ${n.name}:`, e.message);
          gatewayOnlyNodes.push({
            id: n.id,
            name: n.name,
            hostname: n.name,
            ip: n.ip || "",
            os: n.platform || "",
            status: "connected",
            caps: n.caps || "",
            version: n.version || "",
            platform: n.platform || "",
            lastSeen: null,
            source: "gateway",
          });
        }
      }

      const allNodes = [...trackedMachines, ...gatewayOnlyNodes];

      res.json({
        gateway: gatewayRunning ? "online" : "offline",
        nodes,
        devices,
        paired,
        pending,
        pairedCount: paired.length,
        pendingCount: pending.length,
        gatewayProcess: gatewayRunning,
        source: usedCli ? "cli" : "file",
        allNodes,
        totalTracked: allNodes.length,
      });
    } catch (error: any) {
      console.error("[live-status] Top-level error:", error.message);
      try {
        const allMachines = await storage.getMachines();
        const fallbackNodes = allMachines
          .filter((m: any) => m.os !== "WhatsApp")
          .map((m: any) => ({
            id: m.id,
            name: m.displayName || m.hostname || m.name,
            hostname: m.hostname || m.name,
            ip: m.ipAddress || "",
            os: m.os || "",
            status: m.status || "disconnected",
            caps: "",
            version: "",
            platform: m.os || "",
            lastSeen: m.lastSeen,
            source: "database",
          }));
        res.json({ gateway: "error", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: error.message, allNodes: fallbackNodes, totalTracked: fallbackNodes.length });
      } catch {
        res.status(500).json({ gateway: "error", nodes: [], devices: [], paired: [], pending: [], pairedCount: 0, pendingCount: 0, error: error.message, allNodes: [], totalTracked: 0 });
      }
    }
  });

  app.get("/api/llm-api-keys", requireAuth, async (_req, res) => {
    try {
      const keys = await storage.getLlmApiKeys();
      res.json(keys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch LLM API keys" });
    }
  });

  app.post("/api/llm-api-keys", requireAuth, async (req, res) => {
    try {
      const parsed = insertLlmApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const key = await storage.createLlmApiKey(parsed.data);
      res.status(201).json(key);
    } catch (error) {
      res.status(500).json({ error: "Failed to create LLM API key" });
    }
  });

  app.patch("/api/llm-api-keys/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertLlmApiKeySchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateLlmApiKey(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "LLM API key not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update LLM API key" });
    }
  });

  app.delete("/api/llm-api-keys/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteLlmApiKey(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete LLM API key" });
    }
  });

  app.get("/api/integrations", requireAuth, async (_req, res) => {
    try {
      const all = await storage.getIntegrations();

      const enriched = await Promise.all(all.map(async (integration) => {
        if (integration.type === "telegram") {
          try {
            const { getTelegramStatus } = await import("./bot/telegram");
            const tgStatus = getTelegramStatus();
            const liveStatus = tgStatus.state === "connected" ? "connected"
              : tgStatus.state === "connecting" ? "connecting"
              : tgStatus.state === "error" ? "error"
              : tgStatus.enabled ? "disconnected" : "not_configured";
            return { ...integration, status: liveStatus };
          } catch { return integration; }
        }
        if (integration.type === "whatsapp") {
          try {
            const { getWhatsAppStatus } = await import("./bot/whatsapp");
            const waStatus = getWhatsAppStatus();
            const liveStatus = waStatus.state === "connected" ? "connected"
              : waStatus.state === "connecting" ? "connecting"
              : "disconnected";
            return { ...integration, status: liveStatus };
          } catch { return integration; }
        }
        return integration;
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations", requireAuth, async (req, res) => {
    try {
      const parsed = insertIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const integration = await storage.createIntegration(parsed.data);
      res.status(201).json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to create integration" });
    }
  });

  app.patch("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertIntegrationSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const updated = await storage.updateIntegration(req.params.id as string, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  app.delete("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteIntegration(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  app.get("/api/whatsapp/qr", async (_req, res) => {
    try {
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      res.json({
        qrDataUrl: status.qrDataUrl,
        pairingCode: status.pairingCode,
        state: status.state,
        phone: status.phone,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get QR code" });
    }
  });

  app.post("/api/whatsapp/start", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      if (status.state === "disconnected" && status.error) {
        console.log("[WhatsApp] Start called with error state, doing fresh start");
        await bot.startFresh();
      } else {
        bot.clearError();
        bot.start();
      }
      res.json({ success: true, message: "WhatsApp bot starting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/pair", async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber || typeof phoneNumber !== "string") {
        return res.status(400).json({ error: "Phone number is required (e.g. 48123456789)" });
      }
      const cleaned = phoneNumber.replace(/[^0-9]/g, "");
      if (cleaned.length < 10 || cleaned.length > 15) {
        return res.status(400).json({ error: "Invalid phone number. Use international format without + (e.g. 48123456789)" });
      }
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      const currentStatus = bot.getStatus();
      if (currentStatus.state !== "disconnected") {
        await bot.stopGracefully();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      bot.startWithPairingCode(cleaned);
      res.json({ success: true, message: "Requesting pairing code..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to request pairing code" });
    }
  });

  app.post("/api/whatsapp/stop", requireAuth, async (req, res) => {
    try {
      const bot = await getWhatsappBot();
      await bot.stopGracefully();
      res.json({ success: true, message: "WhatsApp bot stopped (session preserved — will auto-reconnect on next restart)" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/restart", async (_req, res) => {
    try {
      const bot = await getWhatsappBot();
      await bot.restart();
      res.json({ success: true, message: "WhatsApp bot restarting..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to restart WhatsApp bot" });
    }
  });

  app.post("/api/whatsapp/logout", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: false });
      }
      const bot = await getWhatsappBot();
      await bot.logout();
      res.json({ success: true, message: "WhatsApp session cleared. You can now generate a fresh QR code." });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout WhatsApp" });
    }
  });

  app.post("/api/whatsapp/start-fresh", async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (instanceId) {
        const config = await storage.getOpenclawConfig(instanceId);
        if (!config?.whatsappEnabled) {
          await storage.upsertOpenclawConfig(instanceId, { whatsappEnabled: true });
        }
      }
      const bot = await getWhatsappBot();
      await bot.startFresh();
      res.json({ success: true, message: "Starting fresh WhatsApp connection..." });
    } catch (error) {
      res.status(500).json({ error: "Failed to start fresh WhatsApp connection" });
    }
  });

  app.get("/api/whatsapp/sessions", requireAuth, async (_req, res) => {
    try {
      const sessions = await storage.getAllWhatsappSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp sessions" });
    }
  });

  app.get("/api/whatsapp/pending", requireAuth, async (_req, res) => {
    try {
      const pending = await storage.getWhatsappPendingSessions();
      res.json(pending);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending sessions" });
    }
  });

  app.post("/api/whatsapp/approve/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.approveWhatsappSession(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (!isProductionRuntime) {
        try {
          const bot = await getWhatsappBot();
          await bot.sendApprovalNotification(session.phone);
        } catch {}
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve session" });
    }
  });

  app.post("/api/whatsapp/approve-by-code", requireAuth, async (req, res) => {
    try {
      const { pairingCode } = req.body;
      if (!pairingCode || typeof pairingCode !== "string") {
        return res.status(400).json({ error: "Pairing code is required" });
      }
      console.log(`[WhatsApp] Approve by code request: "${pairingCode}"`);
      const session = await storage.approveWhatsappSessionByCode(pairingCode);
      if (!session) {
        console.log(`[WhatsApp] No session found for code: "${pairingCode}"`);
        return res.status(404).json({ error: "No pending session found with that pairing code" });
      }
      console.log(`[WhatsApp] Approved session: phone=${session.phone}, name=${session.displayName}`);
      if (!isProductionRuntime) {
        try {
          const bot = await getWhatsappBot();
          await bot.sendApprovalNotification(session.phone);
        } catch {}
      }
      res.json(session);
    } catch (error: any) {
      console.error(`[WhatsApp] Approve by code error:`, error);
      res.status(500).json({ error: "Failed to approve session by pairing code" });
    }
  });

  app.delete("/api/whatsapp/sessions/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWhatsappSession(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  const validateApiKey = async (req: Request, res: Response, next: () => void) => {
    const apiKeyHeader = req.headers["x-api-key"] as string;
    if (!apiKeyHeader) {
      return res.status(401).json({ error: "API key required (X-API-Key header)" });
    }
    const keys = await storage.getApiKeys();
    const match = keys.find(k => k.key === apiKeyHeader && k.active);
    if (!match) {
      return res.status(403).json({ error: "Invalid or inactive API key" });
    }
    next();
  };

  app.post("/api/node/heartbeat", validateApiKey as any, async (req: Request, res: Response) => {
    try {
      const { hostname, displayName, os, ipAddress, remotePcAlias } = req.body;
      if (!hostname) {
        return res.status(400).json({ error: "hostname is required" });
      }

      const machines = await storage.getMachines();
      const existing = machines.find(m => {
        const mIds = [m.hostname, m.name, m.displayName, m.remotePcAlias].filter(Boolean).map(s => s!.toLowerCase());
        return mIds.includes(hostname.toLowerCase()) || (displayName && mIds.includes(displayName.toLowerCase()));
      });

      if (existing) {
        await storage.updateMachine(existing.id, {
          status: "connected",
          lastSeen: new Date(),
          ...(ipAddress && { ipAddress }),
          ...(os && !existing.os && { os }),
          ...(displayName && { displayName }),
          ...(remotePcAlias && { remotePcAlias }),
        });
        return res.json({ ok: true, nodeId: existing.id, name: existing.displayName || existing.name });
      } else {
        const machine = await storage.createMachine({
          name: displayName || hostname,
          hostname,
          displayName: displayName || hostname,
          ipAddress: ipAddress || "",
          os: os || "unknown",
          status: "connected",
        });
        return res.json({ ok: true, nodeId: machine.id, name: machine.displayName || machine.name, created: true });
      }
    } catch (error: any) {
      console.error("[Node Heartbeat] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/node/agent-script", async (_req: Request, res: Response) => {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_BASE_URL || "https://claw-settings.replit.app";
    const script = `#!/usr/bin/env node
const https = require("https");
const http = require("http");
const os = require("os");

const API_URL = "${baseUrl}/api/node/heartbeat";
const API_KEY = process.env.OPENCLAW_API_KEY || "PASTE_YOUR_API_KEY_HERE";
const INTERVAL_MS = 30000;

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
    displayName: os.hostname(),
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
        console.log(\`[\${ts}] Heartbeat OK: \${body}\`);
      } else {
        console.error(\`[\${ts}] Heartbeat failed (\${res.statusCode}): \${body}\`);
      }
    });
  });
  req.on("error", (e) => console.error(\`[\${new Date().toLocaleTimeString()}] Heartbeat error: \${e.message}\`));
  req.write(data);
  req.end();
}

console.log("OpenClaw Node Agent starting...");
console.log("Hostname:", os.hostname());
console.log("OS:", os.platform());
console.log("IP:", getLocalIp());
console.log("Reporting to:", API_URL);
console.log("Interval: every", INTERVAL_MS / 1000, "seconds");
console.log("");

sendHeartbeat();
setInterval(sendHeartbeat, INTERVAL_MS);
`;
    res.type("application/javascript").send(script);
  });

  // On startup, set all tracked nodes to "connected" so they persist across restarts
  try {
    const allMachines = await storage.getMachines();
    for (const m of allMachines) {
      if (m.status !== "connected") {
        await storage.updateMachine(m.id, { status: "connected", lastSeen: new Date() });
      }
    }
    console.log(`[Nodes] Set ${allMachines.length} tracked nodes to connected`);
  } catch (e: any) {
    console.error("[Nodes] Failed to set nodes connected on startup:", e.message);
  }

  // ===== Periodic Skill Discovery (hourly) =====
  const SKILL_CHECK_INTERVAL = 1 * 60 * 60 * 1000;
  let lastSkillCheck: Date | null = null;
  let skillCheckRunning = false;
  let newSkillCount = 0;
  let newSkillNames: string[] = [];
  let previousNewCount = 0;

  async function checkForNewSkills() {
    if (skillCheckRunning) return;
    skillCheckRunning = true;
    try {
      const installed = await storage.getSkills();
      const installedIds = new Set(installed.map(s => s.skillId));
      const newSkills = SKILLS_CATALOG.filter(s => !installedIds.has(s.skillId));

      previousNewCount = newSkillCount;
      newSkillCount = newSkills.length;
      newSkillNames = newSkills.map(s => s.name);

      if (newSkills.length > 0) {
        console.log(`[Skills] Found ${newSkills.length} new skills available in catalog`);
      }

      let vpsSkillsChecked = false;
      try {
        const allInstances = await storage.getInstances();
        const defaultInstance = allInstances[0];
        if (defaultInstance) {
          const vps = await storage.getVpsConnection(defaultInstance.id);
          if (vps?.vpsIp) {
            const { executeSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
            const sshConfig = buildSSHConfigFromVps(vps);

            try {
              const result = await executeSSHCommand("check-skill-status", sshConfig);
              if (result.success && result.output) {
                vpsSkillsChecked = true;
                const lines = result.output.split("\n");
                const missingCount = lines.filter((l: string) => l.includes("✗") || l.includes("missing")).length;
                const installedCount = lines.filter((l: string) => l.includes("✓")).length;
                console.log(`[Skills] VPS check: ${installedCount} installed, ${missingCount} missing`);
              }
            } catch {}

            try {
              await executeSSHCommand("clawhub-install-missing", sshConfig);
              console.log(`[Skills] ClawHub sync completed on VPS`);
            } catch {}
          }
        }
      } catch {}

      if (!vpsSkillsChecked) {
        console.log(`[Skills] VPS not available for skill check, catalog-only check completed`);
      }

      lastSkillCheck = new Date();
      console.log(`[Skills] Periodic check complete: ${installed.length} installed, ${newSkillCount} new available`);
    } catch (e: any) {
      console.error("[Skills] Periodic check failed:", e.message);
    } finally {
      skillCheckRunning = false;
    }
  }

  setTimeout(() => checkForNewSkills(), 30000);
  setInterval(checkForNewSkills, SKILL_CHECK_INTERVAL);
  console.log(`[Skills] Periodic skill discovery enabled (every ${SKILL_CHECK_INTERVAL / 3600000}h)`);

  app.get("/api/skills/check-status", requireAuth, async (_req, res) => {
    const nextCheck = lastSkillCheck
      ? new Date(lastSkillCheck.getTime() + SKILL_CHECK_INTERVAL)
      : new Date(Date.now() + 30000);
    res.json({
      lastCheck: lastSkillCheck?.toISOString() || null,
      nextCheck: nextCheck.toISOString(),
      intervalHours: SKILL_CHECK_INTERVAL / 3600000,
      isRunning: skillCheckRunning,
      newSkillCount,
      newSkillNames: newSkillNames.slice(0, 10),
    });
  });

  app.get("/api/skills/new-count", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      const installedIds = new Set(installed.map(s => s.skillId));
      const available = SKILLS_CATALOG.filter(s => !installedIds.has(s.skillId));
      res.json({
        count: available.length,
        names: available.slice(0, 5).map(s => s.name),
        lastCheck: lastSkillCheck?.toISOString() || null,
      });
    } catch {
      res.json({ count: newSkillCount, names: newSkillNames.slice(0, 5), lastCheck: lastSkillCheck?.toISOString() || null });
    }
  });

  app.post("/api/skills/check-now", requireAuth, async (_req, res) => {
    if (skillCheckRunning) {
      return res.json({ message: "Skill check already in progress", running: true });
    }
    checkForNewSkills();
    res.json({ message: "Skill check started", running: true });
  });

  // ===== Gemini Anti-Gravity Proxy =====
  const { loadSettings: loadGeminiSettings, saveSettings: saveGeminiSettings } = await import("./gemini/settings");
  const { getUpstream: getGeminiUpstream, clampRequestBody: clampGeminiBody } = await import("./gemini/upstream");
  const { ensureVertexCredentialsFile } = await import("./gemini/vertex-auth");
  const { Readable } = await import("stream");

  ensureVertexCredentialsFile();

  const GEMINI_PROXY_KEY = process.env.GEMINI_PROXY_API_KEY || "";

  function requireGeminiProxyAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: { message: "Missing Bearer token" } });
    if (!GEMINI_PROXY_KEY) return res.status(500).json({ error: { message: "Proxy API key not configured" } });
    if (match[1] !== GEMINI_PROXY_KEY) return res.status(403).json({ error: { message: "Invalid proxy token" } });
    next();
  }

  let geminiRpmCount = 0;
  let geminiRpmWindowStart = Date.now();

  function geminiRateLimit(req: Request, res: Response, next: NextFunction) {
    const settings = loadGeminiSettings();
    const now = Date.now();
    if (now - geminiRpmWindowStart > 60_000) {
      geminiRpmCount = 0;
      geminiRpmWindowStart = now;
    }
    geminiRpmCount++;
    if (geminiRpmCount > settings.rpmLimit) {
      return res.status(429).json({ error: { message: "Rate limit exceeded", type: "rate_limit" } });
    }
    next();
  }

  async function proxyToGemini(req: Request, res: Response, route: string) {
    const settings = loadGeminiSettings();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      const upstream = await getGeminiUpstream(settings);
      const url = `${upstream.baseUrl}${route}`;

      const outgoingBody =
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : JSON.stringify(clampGeminiBody(req.body, settings));

      const upstreamRes = await fetch(url, {
        method: req.method,
        headers: {
          "content-type": "application/json",
          ...upstream.headers,
        },
        body: outgoingBody,
        signal: controller.signal,
      });

      res.status(upstreamRes.status);

      for (const [k, v] of upstreamRes.headers.entries()) {
        if (["connection", "transfer-encoding", "keep-alive"].includes(k.toLowerCase())) continue;
        res.setHeader(k, v);
      }

      if (!upstreamRes.body) return res.end();
      Readable.fromWeb(upstreamRes.body as any).pipe(res);
    } catch (e: any) {
      const status = e.statusCode || (e.name === "AbortError" ? 504 : 500);
      res.status(status).json({
        error: {
          message: e.name === "AbortError" ? "Upstream timeout" : (e.message || "Proxy error"),
          type: e.name === "AbortError" ? "timeout" : "proxy_error",
        },
      });
    } finally {
      clearTimeout(t);
    }
  }

  app.get("/api/gemini-proxy/health", (_req: Request, res: Response) => {
    const settings = loadGeminiSettings();
    res.json({
      ok: true,
      upstream: settings.upstream,
      allowedModels: settings.allowedModels,
      maxOutputTokens: settings.maxOutputTokens,
      rpmLimit: settings.rpmLimit,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      hasVertexProject: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
      hasADCFile: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      hasServiceAccountJson: Boolean(process.env.GCP_SERVICE_ACCOUNT_JSON),
    });
  });

  app.get("/api/gemini-proxy/settings", requireAuth, (_req: Request, res: Response) => {
    const settings = loadGeminiSettings();
    res.json({
      settings,
      env: {
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        hasVertexProject: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
        hasADCFile: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        hasServiceAccountJson: Boolean(process.env.GCP_SERVICE_ACCOUNT_JSON),
        hasProxyKey: Boolean(GEMINI_PROXY_KEY),
      },
    });
  });

  const geminiSettingsSchema = z.object({
    upstream: z.enum(["developer", "vertex"]).optional(),
    allowedModels: z.array(z.string().min(1)).min(1).optional(),
    maxOutputTokens: z.number().int().min(1).max(65536).optional(),
    rpmLimit: z.number().int().min(1).max(10000).optional(),
    timeoutMs: z.number().int().min(1000).max(600000).optional(),
  });

  app.post("/api/gemini-proxy/settings", requireAuth, (req: Request, res: Response) => {
    try {
      const parsed = geminiSettingsSchema.parse(req.body);
      const updated = saveGeminiSettings(parsed);
      res.json({ ok: true, settings: updated });
    } catch (e: any) {
      if (e.name === "ZodError") {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini-proxy/test", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = loadGeminiSettings();
      const upstream = await getGeminiUpstream(settings);
      const testModel = settings.allowedModels[0] || "gemini-2.5-flash";
      const body = {
        model: settings.upstream === "vertex" ? `google/${testModel}` : testModel,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say hello in one sentence." },
        ],
        max_tokens: 64,
      };

      const url = `${upstream.baseUrl}/chat/completions`;
      const upstreamRes = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...upstream.headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(settings.timeoutMs),
      });

      const data = await upstreamRes.json();
      res.json({
        ok: upstreamRes.ok,
        status: upstreamRes.status,
        model: testModel,
        upstream: settings.upstream,
        response: data,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/gemini-proxy/v1/chat/completions", requireGeminiProxyAuth, geminiRateLimit, (req: Request, res: Response) => {
    proxyToGemini(req, res, "/chat/completions");
  });

  app.post("/api/gemini-proxy/v1/embeddings", requireGeminiProxyAuth, geminiRateLimit, (req: Request, res: Response) => {
    proxyToGemini(req, res, "/embeddings");
  });

  app.get("/api/gemini-proxy/v1/models", requireGeminiProxyAuth, (req: Request, res: Response) => {
    proxyToGemini(req, res, "/models");
  });

  console.log("[Gemini] Anti-Gravity proxy routes registered");

  const homeBotStatusByHost: Map<string, { state: string; phone: string | null; error: string | null; runtime: string; hostname: string; lastReport: Date; qrDataUrl?: string | null; pairingCode?: string | null }> = new Map();

  function getResolvedHomeBotStatus(): { state: string; phone: string | null; error: string | null; runtime: string; hostname: string | null; lastReport: Date | null; qrDataUrl?: string | null; pairingCode?: string | null } {
    const now = Date.now();
    const staleThreshold = 120000;
    let best: { state: string; phone: string | null; error: string | null; runtime: string; hostname: string | null; lastReport: Date | null; qrDataUrl?: string | null; pairingCode?: string | null } | null = null;

    for (const [host, entry] of homeBotStatusByHost.entries()) {
      if (now - entry.lastReport.getTime() > staleThreshold) continue;
      if (!best) { best = entry; continue; }
      if (entry.lastReport.getTime() > (best.lastReport?.getTime() || 0)) { best = entry; continue; }
    }

    return best || { state: "disconnected", phone: null, error: null, runtime: "home-bot", hostname: null, lastReport: null, qrDataUrl: null, pairingCode: null };
  }

  (async () => {
    try {
      const { setHomeBotStatusRef } = await import("./code-guardian");
      setHomeBotStatusRef(() => getResolvedHomeBotStatus());
    } catch {}
  })();

  app.post("/api/whatsapp/home-bot-status", validateApiKey as any, (req: Request, res: Response) => {
    const { state, phone, error, hostname, qrDataUrl, pairingCode } = req.body;
    const host = hostname || "unknown";
    homeBotStatusByHost.set(host, {
      state: state || "disconnected",
      phone: phone || null,
      error: error || null,
      runtime: "home-bot",
      hostname: host,
      lastReport: new Date(),
      qrDataUrl: qrDataUrl || null,
      pairingCode: pairingCode || null,
    });
    res.json({ ok: true });
  });

  app.post("/api/whatsapp/home-bot-message", validateApiKey as any, async (req: Request, res: Response) => {
    try {
      const { phone, text, pushName } = req.body;
      if (!phone || !text) {
        return res.status(400).json({ error: "phone and text are required" });
      }

      const session = await storage.getWhatsappSessionByPhone(phone);

      if (!session || session.status === "pending") {
        const code = session?.pairingCode || randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
        await storage.upsertWhatsappSession(phone, {
          phone,
          displayName: pushName || null,
          status: "pending",
          pairingCode: code,
        });
        return res.json({
          reply: `Welcome to *OpenClaw AI*\n\nYour access is not yet approved.\n\nYour pairing code is: *${code}*\n\nPlease share this code with the administrator to get access.`,
          approved: false,
        });
      }

      if (session.status === "blocked") {
        return res.json({ reply: "Your access has been revoked. Contact the administrator.", approved: false });
      }

      if (session.status === "approved") {
        await storage.updateWhatsappSessionLastMessage(phone);
        const { chat, generateImage } = await import("./bot/openrouter");

        const conversationUserId = `whatsapp:${phone}`;
        let conversations = await storage.getAiConversations(conversationUserId);
        let conversation = conversations[0];
        if (!conversation) {
          conversation = await storage.createAiConversation({
            userId: conversationUserId,
            instanceId: null,
            title: `WhatsApp: ${pushName || phone}`,
          });
        }

        const pastMessages = await storage.getRecentAiMessages(conversation.id, 20);
        const history = pastMessages
          .filter(m => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
          .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

        const response = await chat(text, pushName || session.displayName || undefined, "WhatsApp", history);

        await storage.createAiMessage({
          conversationId: conversation.id,
          role: "user",
          content: text,
        });
        const assistantContent = response.text || (response.imagePrompt ? `[Generated image: ${response.imagePrompt}]` : "");
        if (assistantContent) {
          await storage.createAiMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: assistantContent,
          });
        }

        let imageBase64: string | null = null;
        if (response.imagePrompt) {
          const imageBuffer = await generateImage(response.imagePrompt);
          if (imageBuffer) {
            imageBase64 = imageBuffer.toString("base64");
          }
        }
        return res.json({
          reply: response.text || "I couldn't generate a response.",
          approved: true,
          imageBase64,
          imagePrompt: response.imagePrompt || null,
        });
      }

      res.json({ reply: "Unknown session status.", approved: false });
    } catch (error: any) {
      console.error("[Home-Bot API] Message processing error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const homeBotStatus = getResolvedHomeBotStatus();

      if (homeBotStatus.lastReport && (Date.now() - homeBotStatus.lastReport.getTime()) < 120000) {
        return res.json({
          state: homeBotStatus.state,
          qrDataUrl: homeBotStatus.qrDataUrl || null,
          pairingCode: homeBotStatus.pairingCode || null,
          phone: homeBotStatus.phone,
          error: homeBotStatus.error,
          runtime: "home-bot",
          hostname: homeBotStatus.hostname,
          enabled: true,
        });
      }

      if (homeBotStatus.lastReport) {
        return res.json({
          state: "disconnected",
          qrDataUrl: null,
          pairingCode: null,
          phone: homeBotStatus.phone,
          error: "Home bot has not reported in over 2 minutes. Check if it's still running on " + (homeBotStatus.hostname || "the host machine") + ".",
          runtime: "home-bot",
          hostname: homeBotStatus.hostname,
          enabled: true,
        });
      }

      const instanceId = await resolveInstanceId(req);
      let ocConfig: any = null;
      let enabled = false;
      if (instanceId) {
        ocConfig = await storage.getOpenclawConfig(instanceId);
        enabled = !!ocConfig?.whatsappEnabled;
      }

      if (enabled) {
        try {
          const { executeRawSSHCommand, getSSHConfig, buildSSHConfigFromVps } = await import("./ssh");
          let sshConfig;
          if (instanceId) {
            const vps = await storage.getVpsConnection(instanceId);
            if (vps) sshConfig = buildSSHConfigFromVps(vps);
          }
          if (!sshConfig) sshConfig = getSSHConfig() || undefined;

          if (sshConfig) {
            const result = await executeRawSSHCommand(
              `SERVICE_ACTIVE=$(systemctl is-active openclaw-whatsapp 2>/dev/null || echo "inactive"); HAS_AUTH=$(ls /root/openclaw-whatsapp/auth_state/creds.json 2>/dev/null && echo "yes" || echo "no"); LOG_TAIL=$(journalctl -u openclaw-whatsapp --no-pager -n 10 2>/dev/null || echo ""); echo "SERVICE=$SERVICE_ACTIVE"; echo "HAS_AUTH=$HAS_AUTH"; echo "---LOG---"; echo "$LOG_TAIL" | tail -5`,
              sshConfig, 0, 10000
            );
            if (result.output) {
              const serviceActive = result.output.includes("SERVICE=active");
              const hasAuth = result.output.includes("HAS_AUTH=yes");
              const lastLogLines = result.output.split("---LOG---")[1]?.trim() || "";
              const isQrReady = lastLogLines.includes("QR code ready");
              const isConnectedOpen = lastLogLines.includes("Connected as");
              const vpsHostname = sshConfig.host || "VPS";
              const configPhone = ocConfig?.whatsappPhone?.replace(/^\+/, "") || null;

              if (serviceActive) {
                if (isConnectedOpen && hasAuth) {
                  return res.json({
                    state: "connected",
                    qrDataUrl: null,
                    pairingCode: null,
                    phone: configPhone,
                    error: null,
                    runtime: "vps-bot",
                    hostname: vpsHostname,
                    enabled: true,
                  });
                } else if (isQrReady) {
                  return res.json({
                    state: "qr_ready",
                    qrDataUrl: null,
                    pairingCode: null,
                    phone: null,
                    error: "VPS bot is waiting for QR scan. Open the WhatsApp settings page to scan.",
                    runtime: "vps-bot",
                    hostname: vpsHostname,
                    enabled: true,
                  });
                } else {
                  return res.json({
                    state: "connecting",
                    qrDataUrl: null,
                    pairingCode: null,
                    phone: null,
                    error: "VPS bot is running, waiting for connection...",
                    runtime: "vps-bot",
                    hostname: vpsHostname,
                    enabled: true,
                  });
                }
              }
            }
          }
        } catch {}
      }

      const bot = await getWhatsappBot();
      const status = bot.getStatus();
      res.json({ ...status, runtime: "local", enabled });
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp status" });
    }
  });

  app.get("/api/whatsapp/home-bot-download", requireAuth, async (_req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const archiver = (await import("archiver")).default;

      const botDir = path.default.join(process.cwd(), "home-bot");
      if (!fs.existsSync(botDir)) {
        return res.status(404).json({ error: "Home bot files not found" });
      }

      const keys = await storage.getApiKeys();
      const activeKey = keys.find(k => k.active && k.permissions === "admin");
      const openclawConfig = await storage.getOpenclawConfig(
        (await storage.getInstances()).find(i => i.isDefault)?.id || ""
      );
      const phone = openclawConfig?.whatsappPhone?.replace(/[^0-9]/g, "") || "";

      const prodUrl = process.env.REPLIT_DEPLOYMENT_URL
        ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
        : process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : "https://claw-settings.replit.app";

      const dynamicConfig = JSON.stringify({
        dashboardUrl: "https://claw-settings.replit.app",
        dashboardUrlDev: prodUrl !== "https://claw-settings.replit.app" ? prodUrl : undefined,
        apiKey: activeKey?.key || "YOUR_API_KEY_HERE",
        phoneNumber: phone,
        botName: "OpenClaw AI",
        usePairingCode: true,
        autoRestart: true,
      }, null, 2);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=openclaw-whatsapp-bot.zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      const files = fs.readdirSync(botDir);
      for (const file of files) {
        if (file === "config.json") {
          archive.append(dynamicConfig, { name: "openclaw-whatsapp-bot/config.json" });
        } else {
          const filePath = path.default.join(botDir, file);
          if (fs.statSync(filePath).isFile()) {
            archive.file(filePath, { name: `openclaw-whatsapp-bot/${file}` });
          }
        }
      }

      archive.finalize();
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create download" });
    }
  });

  const SKILLS_CATALOG = [
    { skillId: "web-search", name: "Web Search", description: "Search the web for real-time information, news, and answers", category: "research", version: "1.2.0", icon: "Search" },
    { skillId: "code-execution", name: "Code Execution", description: "Execute Python, JavaScript, and shell scripts in a sandboxed environment", category: "development", version: "2.0.0", icon: "Terminal" },
    { skillId: "file-management", name: "File Management", description: "Read, write, and manage files on connected nodes", category: "system", version: "1.1.0", icon: "FolderOpen" },
    { skillId: "image-analysis", name: "Image Analysis", description: "Analyze and describe images using vision models", category: "ai", version: "1.0.0", icon: "Eye" },
    { skillId: "document-qa", name: "Document Q&A", description: "Extract answers from uploaded PDFs, DOCX, and text documents", category: "research", version: "1.3.0", icon: "FileText" },
    { skillId: "api-caller", name: "API Caller", description: "Make HTTP requests to external APIs with authentication support", category: "development", version: "1.0.0", icon: "Globe" },
    { skillId: "database-query", name: "Database Query", description: "Execute read-only SQL queries against connected databases", category: "development", version: "1.1.0", icon: "Database" },
    { skillId: "email-sender", name: "Email Sender", description: "Compose and send emails via configured SMTP providers", category: "communication", version: "1.0.0", icon: "Mail" },
    { skillId: "calendar-manager", name: "Calendar Manager", description: "Create, read, and manage calendar events", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "text-to-speech", name: "Text to Speech", description: "Convert text responses to natural-sounding audio", category: "ai", version: "1.0.0", icon: "Volume2" },
    { skillId: "translation", name: "Translation", description: "Translate text between 100+ languages in real time", category: "ai", version: "1.2.0", icon: "Languages" },
    { skillId: "math-solver", name: "Math Solver", description: "Solve complex mathematical equations and show step-by-step solutions", category: "research", version: "1.0.0", icon: "Calculator" },
    { skillId: "screenshot-capture", name: "Screenshot Capture", description: "Take screenshots of websites and applications", category: "system", version: "1.0.0", icon: "Camera" },
    { skillId: "data-visualization", name: "Data Visualization", description: "Create charts, graphs, and visual dashboards from data", category: "productivity", version: "1.1.0", icon: "BarChart3" },
    { skillId: "task-scheduler", name: "Task Scheduler", description: "Schedule and automate recurring tasks with cron-like expressions", category: "system", version: "1.0.0", icon: "Clock" },
    { skillId: "sentiment-analysis", name: "Sentiment Analysis", description: "Analyze the sentiment and tone of text messages and documents", category: "ai", version: "1.0.0", icon: "Heart" },
    { skillId: "knowledge-base", name: "Knowledge Base", description: "Build and query a custom RAG knowledge base from uploaded documents", category: "research", version: "2.0.0", icon: "BookOpen" },
    { skillId: "webhook-listener", name: "Webhook Listener", description: "Receive and process incoming webhook events from external services", category: "development", version: "1.0.0", icon: "Webhook" },
    { skillId: "json-transformer", name: "JSON Transformer", description: "Parse, transform, and restructure JSON data between formats", category: "development", version: "1.0.0", icon: "Braces" },
    { skillId: "password-generator", name: "Password Generator", description: "Generate secure passwords and manage temporary credentials", category: "system", version: "1.0.0", icon: "KeyRound" },
    { skillId: "whatsapp-messaging", name: "WhatsApp Messaging", description: "Send and receive WhatsApp messages through the connected bot", category: "communication", version: "1.0.0", icon: "MessageSquare" },
    { skillId: "docker-manager", name: "Docker Manager", description: "Start, stop, and monitor Docker containers on connected VPS", category: "system", version: "1.0.0", icon: "Container" },
    { skillId: "log-analyzer", name: "Log Analyzer", description: "Parse, search, and analyze application and system logs", category: "development", version: "1.0.0", icon: "ScrollText" },
    { skillId: "network-scanner", name: "Network Scanner", description: "Scan and discover devices on the local or Tailscale network", category: "system", version: "1.0.0", icon: "Radar" },
    { skillId: "gog", name: "Gog", description: "Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs. By @steipete.", category: "productivity", version: "1.0.0", icon: "Mail" },
    { skillId: "self-improving-agent", name: "Self-Improving Agent", description: "Captures learnings, errors, and corrections to enable continuous improvement. By @pskoett.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "ontology", name: "Ontology", description: "Typed knowledge graph for structured agent memory and composable skills. By @oswalpalash.", category: "ai", version: "1.0.0", icon: "Network" },
    { skillId: "tavily-web-search", name: "Tavily Web Search", description: "AI-optimized web search via Tavily API. Returns concise, relevant results for AI agents. By @arun-8687.", category: "research", version: "1.0.0", icon: "Search" },
    { skillId: "trello", name: "Trello", description: "Manage Trello boards, lists, and cards via the Trello REST API. By @steipete.", category: "productivity", version: "1.0.0", icon: "LayoutGrid" },
    { skillId: "slack", name: "Slack", description: "Control Slack from Clawbot via the Slack tool, including reacting to messages, posting, and channel management. By @steipete.", category: "communication", version: "1.0.0", icon: "Hash" },
    { skillId: "caldav-calendar", name: "CalDAV Calendar", description: "Sync and query CalDAV calendars (iCloud, Google, Fastmail, Nextcloud, etc.) using standard CalDAV protocol. By @Asleep123.", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "answer-overflow", name: "Answer Overflow", description: "Search indexed Discord community discussions via Answer Overflow. Find solutions from Discord servers. By @RhysSullivan.", category: "research", version: "1.0.0", icon: "MessageCircle" },
    { skillId: "github-integration", name: "GitHub", description: "Interact with GitHub repos, issues, PRs, and workflows. Create branches, review code, and manage releases.", category: "development", version: "1.0.0", icon: "GitBranch" },
    { skillId: "notion-sync", name: "Notion", description: "Read, create, and update Notion pages, databases, and blocks. Sync knowledge between agents and Notion.", category: "productivity", version: "1.0.0", icon: "BookOpen" },
    { skillId: "jira-integration", name: "Jira", description: "Create and manage Jira issues, sprints, and boards. Track project progress and update ticket status.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "stripe-payments", name: "Stripe", description: "Process payments, manage subscriptions, and query transaction data via Stripe API.", category: "development", version: "1.0.0", icon: "CreditCard" },
    { skillId: "twilio-sms", name: "Twilio SMS", description: "Send and receive SMS/MMS messages via Twilio. Manage phone numbers and messaging workflows.", category: "communication", version: "1.0.0", icon: "Smartphone" },
    { skillId: "google-sheets", name: "Google Sheets", description: "Read, write, and manage Google Sheets spreadsheets. Automate data entry and reporting.", category: "productivity", version: "1.0.0", icon: "Table" },
    { skillId: "google-drive", name: "Google Drive", description: "Upload, download, search, and organize files in Google Drive.", category: "productivity", version: "1.0.0", icon: "HardDrive" },
    { skillId: "linear-integration", name: "Linear", description: "Create and manage Linear issues, projects, and cycles. Streamline engineering workflows.", category: "productivity", version: "1.0.0", icon: "Target" },
    { skillId: "discord-bot", name: "Discord Bot", description: "Send messages, manage channels, and respond to events in Discord servers.", category: "communication", version: "1.0.0", icon: "MessageSquare" },
    { skillId: "telegram-bot", name: "Telegram Bot", description: "Send and receive Telegram messages, manage groups, and handle bot commands.", category: "communication", version: "1.0.0", icon: "Send" },
    { skillId: "rss-reader", name: "RSS Reader", description: "Monitor and parse RSS/Atom feeds. Get notified of new content from any feed source.", category: "research", version: "1.0.0", icon: "Rss" },
    { skillId: "pdf-generator", name: "PDF Generator", description: "Create professional PDF documents from templates, HTML, or markdown content.", category: "productivity", version: "1.0.0", icon: "FileText" },
    { skillId: "cron-jobs", name: "Cron Jobs", description: "Schedule recurring tasks with cron expressions. Automate backups, reports, and maintenance.", category: "system", version: "1.0.0", icon: "Clock" },
    { skillId: "prometheus-metrics", name: "Prometheus Metrics", description: "Query and visualize Prometheus metrics. Monitor system health and application performance.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "ollama-local", name: "Ollama Local", description: "Run local LLM inference via Ollama. Use local models for private, offline AI processing.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "vector-search", name: "Vector Search", description: "Semantic search over embeddings. Build and query vector databases for RAG and similarity matching.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "n8n-automation", name: "n8n Automation", description: "Trigger and manage n8n workflows. Connect OpenClaw to complex automation pipelines.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "tailscale-manager", name: "Tailscale Manager", description: "Manage Tailscale mesh VPN nodes, ACLs, and network routes from your agent.", category: "system", version: "1.0.0", icon: "Network" },
    { skillId: "cloudflare-dns", name: "Cloudflare DNS", description: "Manage Cloudflare DNS records, zones, and firewall rules. Automate domain configuration.", category: "system", version: "1.0.0", icon: "Shield" },
    { skillId: "spotify-player", name: "Spotify Player", description: "Control Spotify playback, manage playlists, and search for music.", category: "productivity", version: "1.0.0", icon: "Music" },
    { skillId: "youtube-search", name: "YouTube Search", description: "Search YouTube videos, get transcripts, and extract video metadata.", category: "research", version: "1.0.0", icon: "Youtube" },
    { skillId: "speech-to-text", name: "Speech to Text", description: "Transcribe audio files and live speech using Whisper and other ASR models.", category: "ai", version: "1.0.0", icon: "Mic" },
    { skillId: "image-generation", name: "Image Generation", description: "Generate images from text prompts using DALL-E, Stable Diffusion, and Flux models.", category: "ai", version: "1.1.0", icon: "Paintbrush" },
    { skillId: "code-review", name: "Code Review", description: "Automated code review with security scanning, style checks, and improvement suggestions.", category: "development", version: "1.0.0", icon: "GitPullRequest" },
    { skillId: "git-operations", name: "Git Operations", description: "Clone repos, create branches, commit changes, and manage Git workflows programmatically.", category: "development", version: "1.0.0", icon: "GitBranch" },
    { skillId: "regex-builder", name: "Regex Builder", description: "Build, test, and explain regular expressions with visual pattern matching.", category: "development", version: "1.0.0", icon: "Braces" },
    { skillId: "unit-test-generator", name: "Unit Test Generator", description: "Auto-generate unit tests for Python, JS, and TypeScript codebases with coverage reports.", category: "development", version: "1.0.0", icon: "TestTube" },
    { skillId: "ci-cd-pipeline", name: "CI/CD Pipeline", description: "Configure and trigger CI/CD pipelines on GitHub Actions, GitLab CI, and Jenkins.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "kubernetes-manager", name: "Kubernetes Manager", description: "Manage K8s clusters, deployments, pods, and services. Scale and monitor containerized apps.", category: "system", version: "1.0.0", icon: "Container" },
    { skillId: "ssl-certificate", name: "SSL Certificate Manager", description: "Issue, renew, and manage SSL/TLS certificates via Let's Encrypt and ACME protocol.", category: "system", version: "1.0.0", icon: "Lock" },
    { skillId: "dns-lookup", name: "DNS Lookup", description: "Perform DNS queries, check propagation, and diagnose domain resolution issues.", category: "system", version: "1.0.0", icon: "Globe" },
    { skillId: "port-scanner", name: "Port Scanner", description: "Scan open ports on hosts, check service availability, and detect security exposure.", category: "system", version: "1.0.0", icon: "Radar" },
    { skillId: "system-monitor", name: "System Monitor", description: "Real-time CPU, memory, disk, and network monitoring with alerts and historical trends.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "backup-manager", name: "Backup Manager", description: "Automated backup scheduling for databases, files, and configurations with S3/local targets.", category: "system", version: "1.0.0", icon: "HardDrive" },
    { skillId: "uptime-monitor", name: "Uptime Monitor", description: "Monitor website and API uptime with configurable intervals and alerting channels.", category: "system", version: "1.0.0", icon: "Wifi" },
    { skillId: "text-summarizer", name: "Text Summarizer", description: "Summarize long articles, documents, and conversations into concise key points.", category: "ai", version: "1.0.0", icon: "FileText" },
    { skillId: "entity-extraction", name: "Entity Extraction", description: "Extract named entities (people, organizations, dates, locations) from unstructured text.", category: "ai", version: "1.0.0", icon: "Tags" },
    { skillId: "intent-classifier", name: "Intent Classifier", description: "Classify user intents and route conversations to appropriate handlers or skills.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "agent-memory", name: "Agent Memory", description: "Persistent long-term memory for agents with automatic context recall and relevance scoring.", category: "ai", version: "2.0.0", icon: "Brain" },
    { skillId: "multi-agent-orchestrator", name: "Multi-Agent Orchestrator", description: "Coordinate multiple AI agents with task delegation, consensus, and result aggregation.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "prompt-library", name: "Prompt Library", description: "Manage, version, and A/B test prompt templates across different models and use cases.", category: "ai", version: "1.0.0", icon: "BookOpen" },
    { skillId: "fine-tune-manager", name: "Fine-Tune Manager", description: "Manage fine-tuning jobs on OpenAI, Together, and Replicate. Track datasets and model versions.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "content-moderation", name: "Content Moderation", description: "Detect and filter toxic, harmful, or inappropriate content using AI classifiers.", category: "ai", version: "1.0.0", icon: "Shield" },
    { skillId: "data-scraper", name: "Data Scraper", description: "Extract structured data from websites with CSS selectors, XPath, and headless browser support.", category: "research", version: "1.0.0", icon: "Globe" },
    { skillId: "arxiv-search", name: "arXiv Search", description: "Search and summarize academic papers from arXiv. Track new publications in your research areas.", category: "research", version: "1.0.0", icon: "BookOpen" },
    { skillId: "wikipedia-search", name: "Wikipedia Search", description: "Search and extract information from Wikipedia articles with section-level precision.", category: "research", version: "1.0.0", icon: "BookOpen" },
    { skillId: "hacker-news", name: "Hacker News", description: "Browse top stories, search discussions, and track trending tech topics on Hacker News.", category: "research", version: "1.0.0", icon: "Rss" },
    { skillId: "product-hunt", name: "Product Hunt", description: "Discover trending products, track launches, and analyze product metrics from Product Hunt.", category: "research", version: "1.0.0", icon: "Rocket" },
    { skillId: "reddit-search", name: "Reddit Search", description: "Search Reddit posts and comments, monitor subreddits, and track trending discussions.", category: "research", version: "1.0.0", icon: "MessageCircle" },
    { skillId: "google-calendar", name: "Google Calendar", description: "Full Google Calendar integration with event CRUD, availability checks, and meeting scheduling.", category: "productivity", version: "1.0.0", icon: "Calendar" },
    { skillId: "todoist", name: "Todoist", description: "Manage tasks, projects, and labels in Todoist. Sync priorities and due dates with agent workflows.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "asana", name: "Asana", description: "Create and manage Asana tasks, projects, and portfolios. Track team workloads and deadlines.", category: "productivity", version: "1.0.0", icon: "ClipboardList" },
    { skillId: "airtable", name: "Airtable", description: "Read, write, and query Airtable bases. Build automated workflows around structured data.", category: "productivity", version: "1.0.0", icon: "Table" },
    { skillId: "confluence", name: "Confluence", description: "Create and update Confluence pages, search knowledge bases, and manage documentation spaces.", category: "productivity", version: "1.0.0", icon: "BookOpen" },
    { skillId: "figma-integration", name: "Figma", description: "Extract design tokens, component specs, and export assets from Figma files.", category: "development", version: "1.0.0", icon: "Paintbrush" },
    { skillId: "vercel-deploy", name: "Vercel Deploy", description: "Deploy and manage projects on Vercel. Trigger builds, check deployment status, and manage domains.", category: "development", version: "1.0.0", icon: "Globe" },
    { skillId: "aws-s3", name: "AWS S3", description: "Upload, download, and manage files in S3 buckets. Generate pre-signed URLs and manage access.", category: "system", version: "1.0.0", icon: "HardDrive" },
    { skillId: "redis-cache", name: "Redis Cache", description: "Interact with Redis for caching, pub/sub messaging, and session management.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "supabase", name: "Supabase", description: "Full Supabase integration with database queries, auth management, storage, and real-time subscriptions.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "firebase", name: "Firebase", description: "Manage Firestore documents, Firebase Auth users, Cloud Functions, and FCM push notifications.", category: "development", version: "1.0.0", icon: "Database" },
    { skillId: "sentry-monitor", name: "Sentry Monitor", description: "Track and manage application errors, performance issues, and release health via Sentry.", category: "development", version: "1.0.0", icon: "AlertTriangle" },
    { skillId: "grafana-dashboard", name: "Grafana Dashboard", description: "Query Grafana dashboards, create panels, and set up alert rules for infrastructure monitoring.", category: "system", version: "1.0.0", icon: "BarChart3" },
    { skillId: "pagerduty", name: "PagerDuty", description: "Create and manage incidents, on-call schedules, and escalation policies via PagerDuty.", category: "system", version: "1.0.0", icon: "Bell" },
    { skillId: "datadog", name: "Datadog", description: "Query metrics, manage monitors, and analyze logs from Datadog observability platform.", category: "system", version: "1.0.0", icon: "Activity" },
    { skillId: "zapier-hooks", name: "Zapier Webhooks", description: "Trigger Zapier workflows and receive webhook events to connect 5000+ apps.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "make-automation", name: "Make (Integromat)", description: "Trigger and manage Make scenarios for visual workflow automation with 1000+ app connectors.", category: "development", version: "1.0.0", icon: "Workflow" },
    { skillId: "openai-assistants", name: "OpenAI Assistants", description: "Create and manage OpenAI Assistants with tools, file search, and code interpreter capabilities.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "anthropic-claude", name: "Anthropic Claude", description: "Direct Anthropic API integration for Claude models with extended thinking and tool use.", category: "ai", version: "1.0.0", icon: "Brain" },
    { skillId: "huggingface", name: "Hugging Face", description: "Run inference on Hugging Face models, manage datasets, and deploy custom ML pipelines.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "replicate-models", name: "Replicate Models", description: "Run open-source ML models on Replicate. Access Stable Diffusion, LLaMA, and 1000+ community models.", category: "ai", version: "1.0.0", icon: "Cpu" },
    { skillId: "elevenlabs-voice", name: "ElevenLabs Voice", description: "Generate realistic speech with ElevenLabs voice synthesis. Clone voices and manage voice library.", category: "ai", version: "1.0.0", icon: "Volume2" },
    { skillId: "deepgram-transcription", name: "Deepgram", description: "Real-time speech transcription with speaker diarization, sentiment analysis, and topic detection.", category: "ai", version: "1.0.0", icon: "Mic" },
    { skillId: "pinecone-vectordb", name: "Pinecone", description: "Manage Pinecone vector indexes for semantic search, RAG, and recommendation systems.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "weaviate-search", name: "Weaviate", description: "Hybrid vector + keyword search with Weaviate. Build multi-modal search and RAG pipelines.", category: "ai", version: "1.0.0", icon: "Waypoints" },
    { skillId: "ip-geolocation", name: "IP Geolocation", description: "Look up geographic location, ISP, and threat intelligence data for IP addresses.", category: "research", version: "1.0.0", icon: "Globe" },
    { skillId: "weather-api", name: "Weather API", description: "Get current weather, forecasts, and historical weather data for any location worldwide.", category: "research", version: "1.0.0", icon: "Cloud" },
    { skillId: "currency-exchange", name: "Currency Exchange", description: "Real-time currency conversion rates and historical exchange data for 170+ currencies.", category: "research", version: "1.0.0", icon: "CreditCard" },
    { skillId: "stock-market", name: "Stock Market", description: "Real-time stock prices, company financials, market news, and technical analysis indicators.", category: "research", version: "1.0.0", icon: "BarChart3" },
    { skillId: "crypto-tracker", name: "Crypto Tracker", description: "Track cryptocurrency prices, portfolio values, DeFi metrics, and blockchain analytics.", category: "research", version: "1.0.0", icon: "CreditCard" },
    { skillId: "nano-banana-pro", name: "Nano Banana Pro", description: "AI image generation and editing via multimodal LLMs (Gemini, OpenAI, etc.)", category: "ai", version: "1.0.0", icon: "Paintbrush" },
  ];

  app.get("/api/skills", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      res.json(installed);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch skills" });
    }
  });

  app.get("/api/skills/catalog", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      const installedIds = new Set(installed.map(s => s.skillId));
      const catalog = SKILLS_CATALOG.map(s => ({
        ...s,
        installed: installedIds.has(s.skillId),
      }));
      res.json(catalog);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch skills catalog" });
    }
  });

  app.post("/api/skills", requireAuth, async (req, res) => {
    try {
      const data = insertSkillSchema.parse(req.body);
      const existing = await storage.getSkillBySkillId(data.skillId);
      if (existing) {
        return res.status(409).json({ error: "Skill already installed" });
      }
      const skill = await storage.createSkill(data);

      try {
        const { executeRawSSHCommand: rawSSH } = await import("./ssh");
        const instances = await storage.getInstances();
        const inst = instances[0];
        if (inst) {
          const vpsConn = await storage.getVpsConnection(String(inst.id));
          if (vpsConn?.vpsIp) {
            const sshConfig = { host: vpsConn.vpsIp, port: vpsConn.vpsPort || 22, username: vpsConn.sshUser || "root" };
            await rawSSH(`openclaw skills install ${data.skillId} 2>&1 || echo 'skill registered'`, sshConfig);
            console.log(`[skills] Installed ${data.skillId} on VPS via SSH`);
          }
        }
      } catch (e: any) {
        console.error(`[skills] VPS install for ${data.skillId} failed:`, e.message);
      }

      res.json(skill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to install skill" });
    }
  });

  app.post("/api/skills/install-all", requireAuth, async (_req, res) => {
    try {
      const installed = await storage.getSkills();
      const installedIds = new Set(installed.map(s => s.skillId));
      let dbInstalled = 0;

      const installedMap = new Map(installed.map(s => [s.skillId, s]));
      for (const skill of SKILLS_CATALOG) {
        const existing = installedMap.get(skill.skillId);
        if (!existing) {
          await storage.createSkill({
            skillId: skill.skillId,
            name: skill.name,
            description: skill.description,
            category: skill.category,
            version: skill.version,
            enabled: true,
            status: "installed",
          });
          dbInstalled++;
        } else if (existing.description !== skill.description || existing.name !== skill.name || existing.category !== skill.category) {
          await storage.updateSkill(String(existing.id), {
            name: skill.name,
            description: skill.description,
            category: skill.category,
          });
        }
      }

      let vpsResult = "";
      try {
        const { executeRawSSHCommand: rawSSH, executeSSHCommand: sshCmd, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
        const instances = await storage.getInstances();
        const inst = instances.find(i => i.isDefault) || instances[0];
        let sshConfig;
        if (inst) {
          const vpsConn = await storage.getVpsConnection(String(inst.id));
          if (vpsConn) {
            sshConfig = buildSSHConfigFromVps(vpsConn);
          }
        }
        if (!sshConfig) {
          sshConfig = getSSHConfig() || undefined;
        }
        if (sshConfig) {
          const skillIds = SKILLS_CATALOG.map(s => s.skillId).join(" ");
          const result = await rawSSH(
            `for skill in ${skillIds}; do openclaw skills install "$skill" 2>/dev/null; done; echo '---SYNC---'; openclaw skills list 2>&1 | head -5`,
            sshConfig,
            1,
            120000
          );
          vpsResult = result.output || "";
          console.log(`[skills] Bulk installed ${SKILLS_CATALOG.length} skills on VPS`);

          try {
            const syncResult = await sshCmd("clawhub-install-missing", sshConfig);
            if (syncResult.output) {
              console.log("[skills] ClawHub sync result:", syncResult.output.slice(0, 500));
            }
          } catch (e2: any) {
            console.error("[skills] ClawHub sync failed:", e2.message);
          }
        } else {
          vpsResult = "No SSH config available";
        }
      } catch (e: any) {
        console.error("[skills] VPS bulk install failed:", e.message);
        vpsResult = `VPS sync error: ${e.message}`;
      }

      res.json({
        success: true,
        totalCatalog: SKILLS_CATALOG.length,
        newlyRegistered: dbInstalled,
        previouslyInstalled: SKILLS_CATALOG.length - dbInstalled,
        vpsResult: vpsResult.slice(0, 2000),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to install all skills", details: error.message });
    }
  });

  app.patch("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertSkillSchema.partial();
      const data = updateSchema.parse(req.body);
      const skill = await storage.updateSkill(req.params.id as string, data);
      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(skill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSkill(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove skill" });
    }
  });

  // ── Documentation Hub ──
  app.get("/api/docs", requireAuth, async (_req, res) => {
    try {
      const allDocs = await storage.getDocs();
      res.json(allDocs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch docs" });
    }
  });

  app.get("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getDoc(String(req.params.id));
      if (!doc) return res.status(404).json({ error: "Doc not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch doc" });
    }
  });

  app.post("/api/docs", requireAuth, async (req, res) => {
    try {
      const parsed = insertDocSchema.parse(req.body);
      const doc = await storage.createDoc(parsed);
      res.json(doc);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid doc data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create doc" });
    }
  });

  app.patch("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      const partial = insertDocSchema.partial().parse(req.body);
      const doc = await storage.updateDoc(String(req.params.id), partial);
      if (!doc) return res.status(404).json({ error: "Doc not found" });
      res.json(doc);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid doc data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update doc" });
    }
  });

  app.delete("/api/docs/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteDoc(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete doc" });
    }
  });

  // ── VPS Connection Logs ──
  app.get("/api/vps/logs", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const logs = await storage.getVpsConnectionLogs(instanceId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch VPS logs" });
    }
  });

  // ── Node Setup Wizard ──
  app.get("/api/node-setup", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json([]);
      const sessions = await storage.getNodeSetupSessions(instanceId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setup sessions" });
    }
  });

  app.get("/api/node-setup/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.getNodeSetupSession(String(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setup session" });
    }
  });

  app.post("/api/node-setup", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      const parsed = insertNodeSetupSessionSchema.partial().parse(req.body);
      const session = await storage.createNodeSetupSession({
        ...parsed,
        instanceId: instanceId ?? undefined,
        os: parsed.os ?? "linux",
        currentStep: 0,
        totalSteps: 5,
        status: "in_progress",
        completedSteps: [],
      } as any);
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create setup session" });
    }
  });

  app.patch("/api/node-setup/:id", requireAuth, async (req, res) => {
    try {
      const partial = insertNodeSetupSessionSchema.partial().parse(req.body);
      const session = await storage.updateNodeSetupSession(String(req.params.id), partial);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update setup session" });
    }
  });

  // ── Onboarding Checklist ──
  app.get("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json(null);
      const checklist = await storage.getOnboardingChecklist(userId, instanceId);
      res.json(checklist ?? { steps: {}, dismissed: false });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch onboarding" });
    }
  });

  app.patch("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const { steps, dismissed } = req.body;
      const checklist = await storage.upsertOnboardingChecklist(userId, instanceId, {
        ...(steps !== undefined ? { steps } : {}),
        ...(dismissed !== undefined ? { dismissed } : {}),
      });
      res.json(checklist);
    } catch (error) {
      res.status(500).json({ error: "Failed to update onboarding" });
    }
  });

  // ──────────── Hostinger VPS Monitoring ────────────

  app.get("/api/hostinger/vms", requireAuth, async (_req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vms = await hostinger.listVMs();
      res.json(vms);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch VPS list from Hostinger" });
    }
  });

  app.get("/api/hostinger/vms/:vmId", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vm = await hostinger.getVM(Number(req.params.vmId));
      res.json(vm);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch VM details" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/metrics", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vmId = Number(req.params.vmId);
      const dateFrom = req.query.date_from as string | undefined;
      const dateTo = req.query.date_to as string | undefined;
      const vm = await hostinger.getVM(vmId);
      const metrics = await hostinger.getMetrics(vmId, dateFrom, dateTo, vm.memory);
      res.json(metrics);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch metrics" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/start", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.startVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to start VM" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/stop", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.stopVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to stop VM" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/restart", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const action = await hostinger.restartVM(Number(req.params.vmId));
      res.json(action);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to restart VM" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/actions", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const actions = await hostinger.getActions(Number(req.params.vmId));
      res.json(actions);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch actions" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/docker", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const projects = await hostinger.listDockerProjects(Number(req.params.vmId));
      res.json(projects);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch Docker projects" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/docker/:projectName/containers", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const containers = await hostinger.getDockerContainers(Number(req.params.vmId), String(req.params.projectName));
      res.json(containers);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch containers" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/restart", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.restartDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to restart Docker project" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/start", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.startDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to start Docker project" });
    }
  });

  app.post("/api/hostinger/vms/:vmId/docker/:projectName/stop", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      await hostinger.stopDockerProject(Number(req.params.vmId), String(req.params.projectName));
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to stop Docker project" });
    }
  });

  app.get("/api/hostinger/firewalls", requireAuth, async (_req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const firewalls = await hostinger.listFirewalls();
      res.json(firewalls);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch firewalls" });
    }
  });

  app.get("/api/hostinger/firewalls/:firewallId", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const firewall = await hostinger.getFirewall(Number(req.params.firewallId));
      res.json(firewall);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch firewall" });
    }
  });

  app.post("/api/hostinger/firewalls/:firewallId/rules", requireAuth, async (req, res) => {
    try {
      const { z } = await import("zod");
      const firewallRuleSchema = z.object({
        protocol: z.enum(["tcp", "udp", "icmp"]),
        port: z.string().min(1).max(20),
        source: z.enum(["any", "custom"]),
        source_detail: z.string().optional(),
        action: z.enum(["accept", "drop"]),
      });
      const parsed = firewallRuleSchema.parse(req.body);
      const { hostinger } = await import("./hostinger");
      const result = await hostinger.createFirewallRule(Number(req.params.firewallId), parsed);
      res.json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid firewall rule data", details: error.errors });
      }
      res.status(502).json({ error: error.message || "Failed to create firewall rule" });
    }
  });

  app.post("/api/hostinger/firewalls/:firewallId/sync", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const vmId = req.body.virtualMachineId ? Number(req.body.virtualMachineId) : undefined;
      await hostinger.syncFirewall(Number(req.params.firewallId), vmId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to sync firewall" });
    }
  });

  app.get("/api/hostinger/vms/:vmId/backups", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const backups = await hostinger.listBackups(Number(req.params.vmId));
      res.json(backups);
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to fetch backups" });
    }
  });

  app.post("/api/hostinger/auto-open-port", requireAuth, async (req, res) => {
    try {
      const { hostinger } = await import("./hostinger");
      const port = String(req.body.port || "18789");
      const vms = await hostinger.listVMs();
      if (!vms.length) return res.status(404).json({ error: "No Hostinger VMs found" });

      const firewalls = await hostinger.listFirewalls();
      if (!firewalls.length) return res.status(404).json({ error: "No Hostinger firewalls found. Create one in the Hostinger panel first." });

      const instanceId = req.body.instanceId as string | undefined;
      let targetVmIp: string | null = null;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) targetVmIp = vps.vpsIp;
      }

      let targetFirewallId: number | null = null;
      if (targetVmIp) {
        for (const vm of vms) {
          const vmIps = vm.ip_addresses?.map((ip: any) => ip.address) || [];
          if (vmIps.includes(targetVmIp) && vm.firewall_group_id) {
            targetFirewallId = vm.firewall_group_id;
            break;
          }
        }
      }

      const targetFirewalls = targetFirewallId
        ? firewalls.filter((fw: any) => fw.id === targetFirewallId)
        : firewalls;

      let targetVmId: number | undefined;
      if (targetVmIp) {
        for (const vm of vms) {
          const vmIps = vm.ip_addresses?.map((ip: any) => ip.address) || [];
          if (vmIps.includes(targetVmIp)) {
            targetVmId = vm.id;
            break;
          }
        }
      }

      const results: Array<{ firewallId: number; firewallName: string; action: string }> = [];
      for (const fw of targetFirewalls) {
        const existing = fw.rules?.find((r: any) => r.port === port && r.protocol === "TCP" && r.source === "any");
        if (existing) {
          results.push({ firewallId: fw.id, firewallName: fw.name, action: "already_open" });
          continue;
        }
        await hostinger.createFirewallRule(fw.id, { protocol: "TCP", port, source: "any" });
        await hostinger.syncFirewall(fw.id, targetVmId);
        results.push({ firewallId: fw.id, firewallName: fw.name, action: "opened_and_synced" });
      }

      res.json({ success: true, port, results });
    } catch (error: any) {
      res.status(502).json({ error: error.message || "Failed to open port via Hostinger API" });
    }
  });

  // ──────────── SSH Remote Gateway Control ────────────
  const SKILL_API_KEYS = [
    { key: "OPENAI_API_KEY", label: "OpenAI", description: "AI image gen, Whisper transcription, GPT models", prefix: "sk-", skills: ["openai-image-gen", "openai-whisper-api", "nano-banana-pro"] },
    { key: "GITHUB_TOKEN", label: "GitHub", description: "Repo management, PRs, issues via gh CLI", prefix: "github_pat_", skills: ["github", "gh-issues"] },
    { key: "NOTION_API_KEY", label: "Notion", description: "Page and database management", prefix: "ntn_", skills: ["notion"] },
    { key: "GEMINI_API_KEY", label: "Google Gemini", description: "Gemini AI image gen and CLI", prefix: "AIza", skills: ["gemini", "nano-banana-pro"] },
    { key: "ELEVENLABS_API_KEY", label: "ElevenLabs", description: "Text-to-speech via sag CLI", prefix: "", skills: ["sag"] },
    { key: "DISCORD_BOT_TOKEN", label: "Discord", description: "Discord bot integration", prefix: "", skills: ["discord"] },
    { key: "SLACK_BOT_TOKEN", label: "Slack", description: "Slack workspace integration", prefix: "xoxb-", skills: ["slack"] },
    { key: "TRELLO_API_KEY", label: "Trello", description: "Board, list, and card management", prefix: "", skills: ["trello"] },
    { key: "TRELLO_TOKEN", label: "Trello Token", description: "Trello user auth token", prefix: "", skills: ["trello"] },
    { key: "SPOTIFY_CLIENT_ID", label: "Spotify Client ID", description: "Spotify playback control", prefix: "", skills: ["spotify-player"] },
    { key: "SPOTIFY_CLIENT_SECRET", label: "Spotify Secret", description: "Spotify API auth", prefix: "", skills: ["spotify-player"] },
    { key: "GOOGLE_PLACES_API_KEY", label: "Google Places", description: "Place search and details via goplaces", prefix: "AIza", skills: ["goplaces"] },
    { key: "X_BEARER_TOKEN", label: "X (Twitter)", description: "X/Twitter API access via xurl", prefix: "", skills: ["xurl"] },
    { key: "ANTHROPIC_API_KEY", label: "Anthropic", description: "Claude AI models for chat and code generation", prefix: "sk-ant-", skills: ["anthropic", "nano-banana-pro"] },
    { key: "PERPLEXITY_API_KEY", label: "Perplexity", description: "Perplexity AI search-augmented models", prefix: "pplx-", skills: ["perplexity"] },
    { key: "GROQ_API_KEY", label: "Groq", description: "Ultra-fast LLM inference with Groq hardware", prefix: "gsk_", skills: ["groq", "nano-banana-pro"] },
    { key: "HUGGINGFACE_API_KEY", label: "HuggingFace", description: "Access to open-source ML models and inference API", prefix: "hf_", skills: ["huggingface"] },
    { key: "PINECONE_API_KEY", label: "Pinecone", description: "Vector database for embeddings and semantic search", prefix: "", skills: ["pinecone"] },
    { key: "SUPABASE_API_KEY", label: "Supabase", description: "Backend-as-a-service with Postgres, auth, and storage", prefix: "eyJ", skills: ["supabase"] },
    { key: "AIRTABLE_API_KEY", label: "Airtable", description: "Spreadsheet-database hybrid for structured data", prefix: "pat", skills: ["airtable"] },
    { key: "ZAPIER_API_KEY", label: "Zapier", description: "Workflow automation and app integrations", prefix: "", skills: ["zapier"] },
    { key: "LINEAR_API_KEY", label: "Linear", description: "Issue tracking and project management", prefix: "lin_api_", skills: ["linear"] },
    { key: "AWS_ACCESS_KEY_ID", label: "AWS Access Key", description: "AWS services access key ID", prefix: "AKIA", skills: ["aws"] },
    { key: "AWS_SECRET_ACCESS_KEY", label: "AWS Secret Key", description: "AWS services secret access key", prefix: "", skills: ["aws"] },
    { key: "CLOUDFLARE_API_TOKEN", label: "Cloudflare", description: "DNS, CDN, Workers, and edge computing", prefix: "", skills: ["cloudflare"] },
    { key: "RESEND_API_KEY", label: "Resend", description: "Transactional email delivery API", prefix: "re_", skills: ["resend"] },
    { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID", description: "Twilio account identifier for SMS and voice", prefix: "AC", skills: ["twilio"] },
    { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token", description: "Twilio authentication token for API access", prefix: "", skills: ["twilio"] },
    { key: "META_ADS_ACCESS_TOKEN", label: "Meta Ads", description: "Meta/Facebook Ads API for campaign management and performance", prefix: "", skills: ["meta-ads"] },
    { key: "META_AD_ACCOUNT_ID", label: "Meta Ad Account ID", description: "Meta/Facebook Ads account identifier", prefix: "act_", skills: ["meta-ads"] },
    { key: "PODPAGE_API_KEY", label: "Podpage", description: "Podcast page management and episode publishing", prefix: "", skills: ["podpage"] },
    { key: "CLOVER_API_TOKEN", label: "Clover POS", description: "Clover POS transactions, inventory, and payments", prefix: "", skills: ["clover"] },
    { key: "CLOVER_MERCHANT_ID", label: "Clover Merchant ID", description: "Clover POS merchant identifier", prefix: "", skills: ["clover"] },
    { key: "ATT_API_KEY", label: "AT&T", description: "AT&T telecom order management and support", prefix: "", skills: ["att"] },
    { key: "VOYA_API_KEY", label: "Voya Financial", description: "Voya retirement and investment account management", prefix: "", skills: ["voya"] },
  ];

  app.get("/api/ssh/skill-keys", requireAuth, async (req, res) => {
    try {
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });

      const keyNames = SKILL_API_KEYS.map(k => k.key).join("|");
      const cmd = `cat /etc/openclaw-env 2>/dev/null; echo '---BASHRC---'; grep -E '^export (${keyNames})=' /root/.bashrc 2>/dev/null | sed 's/^export //'`;
      const result = await executeRawSSHCommand(cmd, sshConfig, 1, 15000);

      const envValues: Record<string, string> = {};
      if (result.output) {
        const lines = result.output.split("\n");
        for (const line of lines) {
          if (line === "---BASHRC---") continue;
          const match = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
          if (match && SKILL_API_KEYS.some(k => k.key === match[1])) {
            envValues[match[1]] = match[2];
          }
        }
      }

      const keys = SKILL_API_KEYS.map(k => ({
        ...k,
        configured: !!envValues[k.key],
        maskedValue: envValues[k.key]
          ? envValues[k.key].substring(0, 6) + "•".repeat(Math.max(0, envValues[k.key].length - 10)) + envValues[k.key].substring(envValues[k.key].length - 4)
          : null,
      }));

      res.json({ keys });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ssh/skill-keys/reveal", requireAuth, async (req, res) => {
    try {
      const { password, key } = req.body;
      if (!password) return res.status(400).json({ error: "Password required" });

      const instances = await storage.getInstances();
      const defaultInstance = instances.find(i => i.isDefault) || instances[0];
      const cfg = defaultInstance ? await storage.getOpenclawConfig(defaultInstance.id) : undefined;
      if (!cfg || password !== cfg.gatewayPassword) {
        return res.status(403).json({ error: "Invalid password" });
      }

      if (!SKILL_API_KEYS.some(k => k.key === key)) {
        return res.status(400).json({ error: "Unknown key" });
      }

      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });

      const cmd = `grep -E '^(export )?${key}=' /etc/openclaw-env /root/.bashrc 2>/dev/null | head -1 | sed 's/.*=//' | sed 's/^"//' | sed 's/"$//'`;
      const result = await executeRawSSHCommand(cmd, sshConfig, 1, 10000);
      const value = result.output?.trim() || "";
      res.json({ key, value });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ssh/skill-keys/update", requireAuth, async (req, res) => {
    try {
      const { key, value, password } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: "key and value required" });
      if (!password) return res.status(400).json({ error: "Password required" });
      if (!SKILL_API_KEYS.some(k => k.key === key)) return res.status(400).json({ error: "Unknown key" });

      const instances = await storage.getInstances();
      const defaultInstance = instances.find(i => i.isDefault) || instances[0];
      const cfg = defaultInstance ? await storage.getOpenclawConfig(defaultInstance.id) : undefined;
      if (!cfg || password !== cfg.gatewayPassword) {
        return res.status(403).json({ error: "Invalid password" });
      }

      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });

      const escaped = value.replace(/"/g, '\\"');

      if (!value) {
        const removeCmd = `sed -i '/^${key}=/d' /etc/openclaw-env 2>/dev/null; sed -i '/^export ${key}=/d' /root/.bashrc 2>/dev/null; echo 'removed'`;
        const result = await executeRawSSHCommand(removeCmd, sshConfig, 1, 15000);
        return res.json({ success: result.success, action: "removed" });
      }

      const envLine = `${key}="${escaped}"`;
      const bashrcLine = `export ${key}="${escaped}"`;
      const updateCmd = [
        `grep -q "^${key}=" /etc/openclaw-env 2>/dev/null && sed -i "s|^${key}=.*|${envLine}|" /etc/openclaw-env || echo '${envLine}' >> /etc/openclaw-env`,
        `grep -q "^export ${key}=" /root/.bashrc && sed -i "s|^export ${key}=.*|${bashrcLine}|" /root/.bashrc || echo '${bashrcLine}' >> /root/.bashrc`,
        `systemctl daemon-reload && systemctl restart openclaw-gateway 2>/dev/null`,
        `echo 'updated'`,
      ].join(" && ");

      const result = await executeRawSSHCommand(updateCmd, sshConfig, 1, 30000);
      res.json({ success: result.success, action: "updated" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ssh/push-env-keys", requireAuth, async (req, res) => {
    try {
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });

      const keys: Record<string, string | undefined> = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GITHUB_TOKEN: process.env.OPENCLAW_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
        NOTION_API_KEY: process.env.NOTION_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        HUGGINGFACE_TOKEN: process.env.HUGGINGFACE_TOKEN,
        PINECONE_API_KEY: process.env.PINECONE_API_KEY,
        SUPABASE_KEY: process.env.SUPABASE_KEY,
        AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
        ZAPIER_API_KEY: process.env.ZAPIER_API_KEY,
        LINEAR_API_KEY: process.env.LINEAR_API_KEY,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      };

      const lines: string[] = [];
      const set: string[] = [];
      const skipped: string[] = [];

      for (const [k, v] of Object.entries(keys)) {
        if (v) {
          lines.push(`export ${k}="${v.replace(/"/g, '\\"')}"`);
          set.push(k);
        } else {
          skipped.push(k);
        }
      }

      if (lines.length === 0) {
        return res.json({ success: false, error: "No API keys found in Replit secrets" });
      }

      const envFileLines = lines.map(l => l.replace("export ", ""));
      const envFileContent = envFileLines.join("\\n");

      const bashrcCmd = lines.map(line => {
        const key = line.split("=")[0].replace("export ", "");
        return `grep -q "^export ${key}=" /root/.bashrc && sed -i "s|^export ${key}=.*|${line.replace(/\|/g, '\\|')}|" /root/.bashrc || echo '${line}' >> /root/.bashrc`;
      }).join(" && ");

      const envFileCmd = `printf '${envFileContent}\\n' > /etc/openclaw-env`;
      const systemdPatch = `grep -q '^EnvironmentFile=' /etc/systemd/system/openclaw-gateway.service || sed -i '/^\\[Service\\]/a EnvironmentFile=/etc/openclaw-env' /etc/systemd/system/openclaw-gateway.service`;
      const waBotPatch = `test -f /etc/systemd/system/openclaw-whatsapp.service && (grep -q '^EnvironmentFile=' /etc/systemd/system/openclaw-whatsapp.service || sed -i '/^\\[Service\\]/a EnvironmentFile=/etc/openclaw-env' /etc/systemd/system/openclaw-whatsapp.service) || true`;
      const reloadAndRestart = `systemctl daemon-reload && systemctl restart openclaw-gateway && sleep 2 && systemctl is-active openclaw-gateway`;

      const cmd = `${bashrcCmd} && ${envFileCmd} && ${systemdPatch} && ${waBotPatch} && ${reloadAndRestart} && echo "---SET---" && cat /etc/openclaw-env | sed 's/=.*/=***/' && echo "---DONE---"`;

      const result = await executeRawSSHCommand(cmd, sshConfig, 1, 45000);
      res.json({ success: result.success, set, skipped, output: result.output?.substring(0, 500) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ssh/setup-clawhub-auth", requireAuth, async (req, res) => {
    try {
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Token required" });

      const configObj = JSON.stringify({ registry: "https://clawhub.ai", token: token });
      const cmd = `mkdir -p /root/.config/clawhub && printf '%s' '${configObj.replace(/'/g, "'\\''")}' > /root/.config/clawhub/config.json && cat /root/.config/clawhub/config.json && echo '---DONE---'`;
      const result = await executeRawSSHCommand(cmd, sshConfig, 1, 15000);
      res.json({ success: result.success, output: result.output?.substring(0, 500) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ssh/setup-github-auth", requireAuth, async (req, res) => {
    try {
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(500).json({ error: "No SSH config" });
      const token = process.env.OPENCLAW_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
      if (!token) return res.status(400).json({ error: "OPENCLAW_GITHUB_TOKEN not set in secrets" });

      const cmd = `echo "${token.replace(/"/g, '\\"')}" | gh auth login --with-token 2>&1 && gh auth status 2>&1`;
      const result = await executeRawSSHCommand(cmd, sshConfig, 1, 30000);
      res.json({ success: result.success, output: result.output?.substring(0, 500) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ssh/gateway/:action", requireAuth, async (req, res) => {
    try {
      const { executeSSHCommand, listAllowedCommands, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const action = String(req.params.action);
      const allowed = listAllowedCommands();
      if (!allowed.includes(action)) {
        return res.status(400).json({ error: `Invalid action: ${action}. Allowed: ${allowed.join(", ")}` });
      }

      const instanceId = req.body?.instanceId as string | undefined;
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          sshConfig = buildSSHConfigFromVps(vps);
        }
      }
      if (!sshConfig) {
        sshConfig = getSSHConfig() || undefined;
      }

      const result = await executeSSHCommand(action, sshConfig);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "SSH command failed" });
    }
  });

  app.get("/api/ssh/gateway/actions", requireAuth, async (req, res) => {
    try {
      const { listAllowedCommands, getSSHConfig, buildSSHConfigFromVps } = await import("./ssh");
      const instanceId = req.query.instanceId as string | undefined;
      let config;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          config = buildSSHConfigFromVps(vps);
        }
      }
      if (!config) {
        config = getSSHConfig();
      }
      res.json({
        actions: listAllowedCommands(),
        configured: !!config,
        host: config?.host || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get SSH actions" });
    }
  });

  app.get("/api/openclaw/version-check", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.json({ error: "No VPS configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const dockerProject = config?.dockerProject || "claw";

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const versionCmd = [
        'cat /root/.openclaw/update-check.json 2>/dev/null || echo "NO_UPDATE_CHECK"',
        'echo "---PKG---"',
        'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
        'echo "---DOCKER---"',
        `docker compose -p ${dockerProject} exec -T gateway openclaw --version 2>/dev/null || docker exec $(docker ps -qf "name=${dockerProject}.*gateway" | head -1) openclaw --version 2>/dev/null || echo "NO_DOCKER"`,
        'echo "---DOCKER-IMAGE---"',
        `docker compose -p ${dockerProject} images 2>/dev/null | grep gateway | awk '{print $2":"$3}' || echo "NO_IMAGE"`,
        'echo "---NPM-LATEST---"',
        'npm view openclaw version 2>/dev/null || echo "NO_NPM"',
      ].join('; ');

      const result = await executeRawSSHCommand(versionCmd, sshConfig);
      const output = result.output?.trim() || "";

      const sections = output.split("---PKG---");
      const updateCheckRaw = sections[0]?.trim() || "";
      const afterPkg = sections[1] || "";
      const pkgParts = afterPkg.split("---DOCKER---");
      const pkgRaw = pkgParts[0]?.trim() || "";
      const afterDocker = pkgParts[1] || "";
      const dockerParts = afterDocker.split("---DOCKER-IMAGE---");
      const dockerVersionRaw = dockerParts[0]?.trim() || "";
      const afterImage = dockerParts[1] || "";
      const imageParts = afterImage.split("---NPM-LATEST---");
      const dockerImageRaw = imageParts[0]?.trim() || "";
      const npmLatestRaw = imageParts[1]?.trim() || "";

      let updateInfo: any = {};
      let currentVersion = "";
      let latestVersion = "unknown";

      if (npmLatestRaw && npmLatestRaw !== "NO_NPM") {
        const npmMatch = npmLatestRaw.match(/(\d+[\.\d-]+\S*)/);
        if (npmMatch) latestVersion = npmMatch[1];
      }

      if (updateCheckRaw && updateCheckRaw !== "NO_UPDATE_CHECK") {
        try {
          updateInfo = JSON.parse(updateCheckRaw);
          if (latestVersion === "unknown") {
            latestVersion = updateInfo.lastAvailableVersion || updateInfo.lastNotifiedVersion || "unknown";
          }
        } catch {}
      }

      if (pkgRaw && pkgRaw !== "NO_PKG") {
        const pkgMatch = pkgRaw.match(/"version"\s*:\s*"([^"]+)"/);
        if (pkgMatch) currentVersion = pkgMatch[1];
      }

      if (!currentVersion && dockerVersionRaw && dockerVersionRaw !== "NO_DOCKER") {
        const dockerMatch = dockerVersionRaw.match(/(\d+\.\d+[\.\d-]*\S*)/);
        if (dockerMatch) currentVersion = dockerMatch[1];
      }

      if (!currentVersion && updateInfo.lastNotifiedVersion) {
        currentVersion = updateInfo.lastNotifiedVersion;
      }

      const compareVersions = (a: string, b: string): number => {
        const normalize = (v: string) => v.replace(/-/g, ".").split(".").map(p => parseInt(p, 10) || 0);
        const pa = normalize(a);
        const pb = normalize(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
          const va = pa[i] || 0;
          const vb = pb[i] || 0;
          if (va !== vb) return va - vb;
        }
        return 0;
      };

      const hasUpdate = latestVersion !== "unknown" && currentVersion !== "" && currentVersion !== "unknown"
        && compareVersions(latestVersion, currentVersion) > 0;

      res.json({
        currentVersion: currentVersion || "unknown",
        latestVersion,
        hasUpdate,
        updateInfo,
        dockerImage: dockerImageRaw !== "NO_IMAGE" ? dockerImageRaw : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Version check failed" });
    }
  });

  app.post("/api/openclaw/update", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });
      const config = await storage.getOpenclawConfig(instanceId);
      const dockerProject = config?.dockerProject || "claw";

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const hasDockerCmd = [
        `docker compose -p ${dockerProject} ps --format json 2>/dev/null | head -1`,
        'echo "---ALT---"',
        `docker ps --filter "name=${dockerProject}" --format "{{.Names}}" 2>/dev/null | head -1`,
        'echo "---ALT2---"',
        'docker ps --filter "name=openclaw" --format "{{.Names}}" 2>/dev/null | head -1',
      ].join('; ');
      const dockerCheck = await executeRawSSHCommand(hasDockerCmd, sshConfig);
      const dkOut = dockerCheck.output || "";
      const dkParts = dkOut.split("---ALT---");
      const composeOut = dkParts[0]?.trim() || "";
      const altParts = (dkParts[1] || "").split("---ALT2---");
      const filterOut = altParts[0]?.trim() || "";
      const anyOpenclawContainer = altParts[1]?.trim() || "";
      const isDocker = !!(composeOut && composeOut !== "[]") || !!filterOut || !!anyOpenclawContainer;
      const detectedContainer = filterOut || anyOpenclawContainer || "";

      const versionCheckCmd = [
        'npm view openclaw version 2>/dev/null || echo "NO_NPM"',
        'echo "---CUR---"',
        'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
      ].join('; ');
      const preCheck = await executeRawSSHCommand(versionCheckCmd, sshConfig);
      const preOut = preCheck.output || "";
      const preParts = preOut.split("---CUR---");
      const npmLatest = preParts[0]?.trim().match(/(\d+[\.\d-]+\S*)/)?.[1] || "";
      const curPkgMatch = preParts[1]?.trim().match(/"version"\s*:\s*"([^"]+)"/);
      const currentInstalled = curPkgMatch?.[1] || "";

      if (npmLatest && currentInstalled && npmLatest === currentInstalled && !isDocker) {
        return res.json({
          success: true,
          newVersion: currentInstalled,
          output: `Already at the latest version (${currentInstalled}). No update needed.`,
          method: "npm",
          alreadyLatest: true,
        });
      }

      let updateCmd: string;
      let method: string;
      if (isDocker) {
        method = "docker";
        const containerName = detectedContainer || `${dockerProject}.*gateway`;
        updateCmd = [
          `echo "Pulling latest Docker images..."`,
          `cd /root/${dockerProject} 2>/dev/null || cd /opt/${dockerProject} 2>/dev/null || cd $(find / -maxdepth 3 -name "docker-compose.yml" -path "*${dockerProject}*" -exec dirname {} \\; 2>/dev/null | head -1) 2>/dev/null || cd $(find / -maxdepth 3 -name "docker-compose.yml" -path "*openclaw*" -exec dirname {} \\; 2>/dev/null | head -1) 2>/dev/null`,
          `docker compose pull 2>&1 || docker pull $(docker inspect --format='{{.Config.Image}}' ${containerName} 2>/dev/null) 2>&1`,
          'echo "---RESTART---"',
          `docker compose down 2>&1 || true`,
          `docker compose up -d 2>&1 || docker restart ${containerName} 2>&1`,
          'sleep 5',
          'echo "---STATUS---"',
          `docker ps --filter "name=openclaw" --format "table {{.Names}}\\t{{.Status}}" 2>&1`,
          'echo "---VERSION---"',
          `docker exec ${containerName} openclaw --version 2>/dev/null || docker exec $(docker ps -qf "name=openclaw" | head -1) openclaw --version 2>/dev/null || echo "NO_VERSION"`,
        ].join('; ');
      } else {
        method = "npm";
        updateCmd = [
          'echo "Installing latest OpenClaw via npm..."',
          'npm install -g openclaw@latest 2>&1; NPM_EXIT=$?',
          'echo "---NPM_EXIT=$NPM_EXIT---"',
          'echo "---RESTART---"',
          'kill $(pgrep -f "openclaw gateway") $(pgrep -f "openclaw-gateway") 2>/dev/null || true',
          'sleep 2',
          'nohup openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 & disown',
          'sleep 5',
          'echo "---VERSION---"',
          'openclaw --version 2>/dev/null || echo "NO_VERSION"',
          'for p in /usr/local/lib/node_modules/openclaw /usr/lib/node_modules/openclaw /root/.npm-global/lib/node_modules/openclaw; do [ -f "$p/package.json" ] && grep \'"version"\' "$p/package.json" | head -1 && break; done 2>/dev/null || echo "NO_PKG"',
          'echo "---GATEWAY---"',
          'curl -sf http://localhost:18789/health 2>/dev/null && echo "GATEWAY_OK" || echo "GATEWAY_DOWN"',
        ].join('; ');
      }

      const result = await executeRawSSHCommand(updateCmd, sshConfig, 2, 120000);

      const output = result.output || "";
      const stderr = result.error || "";
      const versionSection = output.split("---VERSION---")[1]?.split("---GATEWAY---")[0]?.trim() || "";
      const versionMatch = versionSection.match(/"version"\s*:\s*"([^"]+)"/) || versionSection.match(/(\d+\.\d+[\.\d-]*\S*)/);
      const newVersion = versionMatch ? versionMatch[1] : "";

      const hasNpmFail = output.includes("NPM_EXIT=1") || output.includes("npm ERR!");
      const gatewayOk = output.includes("GATEWAY_OK");
      const hasVersionOutput = newVersion && newVersion !== "NO_VERSION";
      const updateSucceeded = (hasVersionOutput || gatewayOk) && !hasNpmFail;

      res.json({
        success: updateSucceeded,
        newVersion: newVersion || "updated",
        output,
        method,
        gatewayRunning: gatewayOk,
        sshSuccess: result.success,
        sshError: stderr || undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Update failed" });
    }
  });

  app.post("/api/whatsapp/deploy-vps-bot", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const depsCmd = 'cd /root/openclaw-whatsapp-bot && npm i --production 2>&1';
      console.log("[VPS Bot] Installing dependencies...");
      const depsResult = await executeRawSSHCommand(depsCmd, sshConfig, 2, 120000);
      console.log("[VPS Bot] Deps result:", depsResult.success, depsResult.output?.substring(0, 200));

      const unitContent = [
        '[Unit]',
        'Description=OpenClaw WhatsApp Bot',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        'WorkingDirectory=/root/openclaw-whatsapp-bot',
        'ExecStart=/usr/bin/node /root/openclaw-whatsapp-bot/openclaw-whatsapp.js',
        'Restart=on-failure',
        'RestartSec=10',
        'StandardOutput=append:/tmp/whatsapp-bot.log',
        'StandardError=append:/tmp/whatsapp-bot.log',
        'Environment=NODE_ENV=production',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
      ].join('\\n');

      const startCmd = [
        `printf '${unitContent}' > /etc/systemd/system/openclaw-whatsapp.service`,
        'systemctl daemon-reload',
        'systemctl stop openclaw-whatsapp 2>/dev/null || true',
        'truncate -s 0 /tmp/whatsapp-bot.log 2>/dev/null || true',
        'systemctl start openclaw-whatsapp',
        'systemctl enable openclaw-whatsapp 2>/dev/null || true',
        'sleep 5',
        'systemctl is-active openclaw-whatsapp && echo "BOT_RUNNING" || echo "BOT_FAILED"',
        'echo "---LOG---"',
        'cat /tmp/whatsapp-bot.log 2>/dev/null | tail -30',
      ].join(' && ');

      console.log("[VPS Bot] Starting bot...");
      const result = await executeRawSSHCommand(startCmd, sshConfig, 2, 30000);
      const output = result.output || "";
      console.log("[VPS Bot] Start result:", output.substring(0, 300));
      const running = output.includes("BOT_RUNNING");
      const logSection = output.split("---LOG---")[1]?.trim() || "";

      res.json({
        success: running,
        output: `DEPS: ${depsResult.output?.substring(0, 500) || "empty"}\n\nSTART: ${output}`,
        log: logSection,
        depsSuccess: depsResult.success,
        depsError: depsResult.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/stop-vps-bot", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const cmd = 'systemctl stop openclaw-whatsapp 2>/dev/null && systemctl disable openclaw-whatsapp 2>/dev/null; echo "STOPPED"';
      const result = await executeRawSSHCommand(cmd, sshConfig);
      res.json({ success: true, output: result.output });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/vps-bot-log", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const vps = await storage.getVpsConnection(instanceId);
      if (!vps?.vpsIp) return res.status(400).json({ error: "No VPS configured" });

      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const sshConfig = buildSSHConfigFromVps(vps);

      const cmd = [
        'systemctl is-active openclaw-whatsapp 2>/dev/null && echo "STATUS:RUNNING" || (pgrep -f "openclaw-whatsapp.js" > /dev/null 2>&1 && echo "STATUS:RUNNING" || echo "STATUS:STOPPED")',
        'echo "---LOG---"',
        'cat /tmp/whatsapp-bot.log 2>/dev/null | tail -50',
      ].join('; ');
      const result = await executeRawSSHCommand(cmd, sshConfig);
      const output = result.output || "";
      const running = output.includes("STATUS:RUNNING");
      const log = output.split("---LOG---")[1]?.trim() || "";

      res.json({ running, log });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === AI Task Runner Routes ===
  const { processAiMessage } = await import("./ai-task-runner");
  const aiMessageSchema = z.object({ message: z.string().min(1).max(5000) });
  const aiConversationCreateSchema = z.object({ title: z.string().max(200).optional() });

  app.get("/api/ai/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const conversations = await storage.getAiConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/conversations", requireAuth, async (req, res) => {
    try {
      const parsed = aiConversationCreateSchema.safeParse(req.body);
      const userId = req.session.userId!;
      const instanceId = await resolveInstanceId(req);
      const conv = await storage.createAiConversation({
        userId,
        instanceId: instanceId || null,
        title: parsed.success ? (parsed.data.title || "New Conversation") : "New Conversation",
      });
      res.json(conv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await storage.getAiMessages(convId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const parsed = aiMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Message is required (1-5000 chars)" });
      }
      const { message } = parsed.data;
      const instanceId = conv.instanceId || (await resolveInstanceId(req)) || "";
      const result = await processAiMessage(conv.id, message, req.session.userId!, instanceId);
      res.json(result);
    } catch (error: any) {
      console.error("[AI Task Runner] Error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  app.delete("/api/ai/conversations/:id", requireAuth, async (req, res) => {
    try {
      const convId = String(req.params.id);
      const conv = await storage.getAiConversation(convId);
      if (!conv || conv.userId !== req.session.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      await storage.deleteAiConversation(convId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/guardian/fix-whatsapp", requireAuth, async (req, res) => {
    try {
      const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
      const instances = await storage.getInstances();
      const defaultInstance = instances.find(i => i.isDefault);
      if (!defaultInstance) return res.status(400).json({ error: "No default instance" });
      const vps = await storage.getVpsConnection(defaultInstance.id);
      if (!vps) return res.status(400).json({ error: "No VPS connection" });
      const sshConfig = buildSSHConfigFromVps(vps);

      const stopResult = await executeRawSSHCommand(
        "systemctl stop openclaw-whatsapp 2>/dev/null; systemctl disable openclaw-whatsapp 2>/dev/null; pkill -f 'openclaw-whatsapp' 2>/dev/null; pkill -f 'whatsapp-web.js' 2>/dev/null; pkill -f 'whatsapp-bot' 2>/dev/null; sleep 1; echo DONE",
        sshConfig, 0, 15000
      );

      await storage.createGuardianLog({
        type: "fix",
        severity: "info",
        message: "VPS WhatsApp bot stopped and disabled via quick-fix",
        details: stopResult.output || "VPS bot stopped",
        status: "fixed",
        source: "vps-bot-conflict",
      });

      res.json({ success: true, message: "VPS WhatsApp bot stopped and disabled. Home-bot should stabilize." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/guardian/whatsapp-health", requireAuth, async (_req, res) => {
    try {
      const homeBotStatus = getResolvedHomeBotStatus();
      const lastReportAge = homeBotStatus.lastReport ? Date.now() - homeBotStatus.lastReport.getTime() : null;

      let vpsBotActive = false;
      try {
        const { executeRawSSHCommand, buildSSHConfigFromVps } = await import("./ssh");
        const instances = await storage.getInstances();
        const defaultInstance = instances.find(i => i.isDefault);
        if (defaultInstance) {
          const vps = await storage.getVpsConnection(defaultInstance.id);
          if (vps) {
            const sshConfig = buildSSHConfigFromVps(vps);
            const r = await executeRawSSHCommand(
              "systemctl is-active openclaw-whatsapp 2>/dev/null; echo '---'; ps aux | grep -c '[o]penclaw-whatsapp' 2>/dev/null; echo '---'; ps aux | grep -c '[w]hatsapp-web.js' 2>/dev/null",
              sshConfig, 0, 10000
            );
            if (r.success) {
              const parts = r.output.split("---").map(s => s.trim());
              const svcActive = parts[0] === "active";
              const procCount = parseInt(parts[1] || "0", 10) + parseInt(parts[2] || "0", 10);
              vpsBotActive = svcActive || procCount > 0;
            }
          }
        }
      } catch {}

      res.json({
        homeBotState: homeBotStatus.state,
        homeBotPhone: homeBotStatus.phone,
        homeBotHostname: homeBotStatus.hostname,
        homeBotError: homeBotStatus.error,
        homeBotLastReportAge: lastReportAge ? Math.round(lastReportAge / 1000) : null,
        homeBotOnline: lastReportAge !== null && lastReportAge < 120000 && homeBotStatus.state === "connected",
        vpsBotActive,
        hasConflict: vpsBotActive && lastReportAge !== null && lastReportAge < 120000,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/guardian/logs", requireAuth, async (req, res) => {
    try {
      const logs = await storage.getGuardianLogs(200);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/guardian/scan", requireAuth, async (req, res) => {
    try {
      const { scanSystem } = await import("./code-guardian");
      await scanSystem();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/guardian/fix/:id", requireAuth, async (req, res) => {
    try {
      const logId = req.params.id;
      const logs = await storage.getGuardianLogs(200);
      const log = logs.find(l => l.id === logId);
      if (!log) return res.status(404).json({ error: "Guardian log not found" });
      if (log.status === "fixed") return res.status(400).json({ error: "Issue already fixed" });
      const { attemptFix } = await import("./code-guardian");
      await attemptFix(logId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/features", requireAuth, async (req, res) => {
    try {
      const proposals = await storage.getFeatureProposals();
      res.json(proposals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/features/generate", requireAuth, async (req, res) => {
    try {
      const { generateProposals } = await import("./feature-agent");
      const proposals = await generateProposals();
      res.json(proposals);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/features/:id", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["proposed", "approved", "rejected", "implementing", "completed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const updated = await storage.updateFeatureProposal(req.params.id, {
        status,
        ...(status === "approved" || status === "rejected" ? { reviewedAt: new Date() } as any : {}),
      });
      if (!updated) return res.status(404).json({ error: "Proposal not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/features/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteFeatureProposal(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/feature-docs/send-email", requireAuth, async (req, res) => {
    try {
      const { to, subject, body } = req.body;
      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Missing to, subject, or body" });
      }
      const { getUncachableGmailClient } = await import("./gmail");
      const gmail = await getUncachableGmailClient();
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      ).toString("base64url");
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/feature-docs/send-replit", requireAuth, async (req, res) => {
    try {
      const { slug, featureMarkdown, featureTitle } = req.body;
      if (!slug || !featureMarkdown) {
        return res.status(400).json({ error: "Missing slug or featureMarkdown" });
      }
      const filename = featureTitle
        ? featureTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + "-feature-doc.md"
        : "feature-doc.md";
      const replitProject = await storage.getReplitProjects?.();
      const matchedProject = replitProject?.find((p: any) =>
        p.slug?.includes(slug) || p.url?.includes(slug) || p.replitId === slug
      );
      if (matchedProject && matchedProject.replitId) {
        res.json({
          success: true,
          method: "reference",
          message: `Feature doc "${featureTitle}" prepared for project ${slug}. Copy the markdown file to the target project's feature-docs/ directory.`,
          filename,
          projectId: matchedProject.replitId,
        });
      } else {
        res.json({
          success: true,
          method: "manual",
          message: `Feature doc "${featureTitle}" ready. Save the downloaded file to the target project at feature-docs/${filename}`,
          filename,
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/telegram/status", requireAuth, async (_req, res) => {
    try {
      const { getTelegramStatus } = await import("./bot/telegram");
      res.json(getTelegramStatus());
    } catch (error: any) {
      res.json({ state: "error", error: error.message, enabled: false });
    }
  });

  app.post("/api/telegram/start", requireAuth, async (_req, res) => {
    try {
      const { startTelegramBot } = await import("./bot/telegram");
      await startTelegramBot();
      const { getTelegramStatus } = await import("./bot/telegram");
      res.json(getTelegramStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/telegram/stop", requireAuth, async (_req, res) => {
    try {
      const { stopTelegramBot } = await import("./bot/telegram");
      stopTelegramBot();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/messaging/platforms", requireAuth, async (_req, res) => {
    try {
      const homeBotStatus = getResolvedHomeBotStatus();
      const { getTelegramStatus } = await import("./bot/telegram");
      const telegramStatus = getTelegramStatus();

      const platforms = [
        {
          id: "whatsapp",
          name: "WhatsApp",
          state: homeBotStatus.state,
          phone: homeBotStatus.phone,
          hostname: homeBotStatus.hostname,
          error: homeBotStatus.error,
          enabled: true,
        },
        {
          id: "telegram",
          name: "Telegram",
          state: telegramStatus.state,
          botUsername: telegramStatus.botUsername,
          botName: telegramStatus.botName,
          messageCount: telegramStatus.messageCount,
          error: telegramStatus.error,
          enabled: telegramStatus.enabled,
        },
        {
          id: "slack",
          name: "Slack",
          state: "not_configured",
          error: null,
          enabled: false,
        },
      ];

      res.json(platforms);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const skillTriggerLog: Array<{ timestamp: string; source: string; action: string; payload: any; result: string }> = [];

  app.post("/api/webhooks/skill-trigger", async (req: Request, res: Response) => {
    try {
      const { action, source, payload } = req.body;
      const sourceLabel = source || req.headers["x-trigger-source"] || "unknown";

      if (!action) {
        return res.status(400).json({ error: "Missing 'action' field. Send {action: 'action_name', source: 'streamdeck', payload: {...}}" });
      }

      const entry = {
        timestamp: new Date().toISOString(),
        source: sourceLabel as string,
        action,
        payload: payload || {},
        result: "received",
      };

      skillTriggerLog.push(entry);
      if (skillTriggerLog.length > 200) skillTriggerLog.shift();

      console.log(`[Webhook] Skill trigger: action=${action} source=${sourceLabel}`);

      res.json({ status: "ok", action, source: sourceLabel, timestamp: entry.timestamp });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/webhooks/skill-trigger/log", requireAuth, async (_req: Request, res: Response) => {
    res.json(skillTriggerLog.slice(-50));
  });

  app.post("/api/custom-skills/create", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, description, tools, handlerCode } = req.body;
      if (!name || !description) {
        return res.status(400).json({ error: "name and description are required" });
      }

      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "");
      const toolsList = tools || [];
      const toolsYaml = toolsList.length > 0 ? toolsList.map((t: string) => `  - ${t}`).join("\n") : "  - run";

      const skillMd = `---
name: ${safeName}
description: ${description}
tools:
${toolsYaml}
---

${description}`;

      const handlerPy = handlerCode || `import subprocess

def run(command: str):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}`;

      const { executeSSHCommand } = await import("./ssh");
      const vps = await storage.getVpsConnection();
      if (!vps) {
        return res.status(400).json({ error: "No VPS connection configured" });
      }

      const sshConfig = {
        host: vps.vpsIp,
        port: vps.vpsPort || 22,
        username: vps.sshUser || "root",
        privateKey: vps.sshKeyPath || undefined,
      };

      const skillPath = `/root/.openclaw/skills/${safeName}`;
      await executeSSHCommand(sshConfig, `mkdir -p '${skillPath}'`);
      await executeSSHCommand(sshConfig, `cat > '${skillPath}/SKILL.md' << 'SKILLEOF'\n${skillMd}\nSKILLEOF`);
      await executeSSHCommand(sshConfig, `cat > '${skillPath}/handler.py' << 'HANDLEREOF'\n${handlerPy}\nHANDLEREOF`);

      res.json({
        status: "created",
        name: safeName,
        path: skillPath,
        files: ["SKILL.md", "handler.py"],
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/custom-skills/templates", requireAuth, async (_req: Request, res: Response) => {
    const templates = [
      {
        name: "webhook-listener",
        label: "Webhook Listener",
        description: "HTTP server that listens for incoming webhooks from Stream Deck, Companion, or external services",
        tools: ["start_listener", "get_events"],
        handler: `from http.server import HTTPServer, BaseHTTPRequestHandler
import threading, json

events = []

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else ""
        events.append({"path": self.path, "body": body})
        if len(events) > 50: events.pop(0)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')
    def log_message(self, *a): pass

def start_listener(port: int = 3000):
    server = HTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return {"status": "listening", "port": port}

def get_events():
    return events[-20:]`,
      },
      {
        name: "ha-controller",
        label: "Home Assistant Controller",
        description: "Control Home Assistant devices, automations, and scenes via REST API",
        tools: ["ha_call_service", "ha_get_states"],
        handler: `import os, json
try:
    import requests
except ImportError:
    import subprocess; subprocess.run(["pip","install","requests"], capture_output=True); import requests

HA_URL = os.environ.get("HA_URL", "http://homeassistant.local:8123")
HA_TOKEN = os.environ.get("HA_TOKEN", "")

def _h():
    return {"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"}

def ha_call_service(domain: str, service: str, entity_id: str = None):
    payload = {"entity_id": entity_id} if entity_id else {}
    r = requests.post(f"{HA_URL}/api/services/{domain}/{service}", headers=_h(), json=payload, timeout=10)
    return {"status": r.status_code}

def ha_get_states():
    r = requests.get(f"{HA_URL}/api/states", headers=_h(), timeout=10)
    return [{"entity_id": s["entity_id"], "state": s["state"]} for s in r.json()[:50]]`,
      },
      {
        name: "shell-automation",
        label: "Shell Automation",
        description: "Run shell commands and scripts on the local system",
        tools: ["run_command", "run_script"],
        handler: `import subprocess, os

def run_command(command: str):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except Exception as e:
        return {"error": str(e)}

def run_script(path: str):
    if not os.path.exists(path):
        return {"error": f"Script not found: {path}"}
    return run_command(f"bash '{path}'")`,
      },
      {
        name: "api-integration",
        label: "REST API Integration",
        description: "Connect to any REST API with configurable authentication",
        tools: ["api_call"],
        handler: `import json, os
try:
    import requests
except ImportError:
    import subprocess; subprocess.run(["pip","install","requests"], capture_output=True); import requests

API_BASE = os.environ.get("CUSTOM_API_BASE", "")
API_KEY = os.environ.get("CUSTOM_API_KEY", "")

def api_call(method: str, path: str, data: dict = None, headers: dict = None):
    url = f"{API_BASE}{path}" if API_BASE else path
    hdrs = {"Authorization": f"Bearer {API_KEY}", **(headers or {})} if API_KEY else (headers or {})
    try:
        r = requests.request(method, url, headers=hdrs, json=data, timeout=30)
        try: body = r.json()
        except: body = r.text[:2000]
        return {"status": r.status_code, "body": body}
    except Exception as e:
        return {"error": str(e)}`,
      },
    ];
    res.json(templates);
  });

  app.post("/api/webhooks/github", async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const event = req.headers["x-github-event"] as string;
      const deliveryId = req.headers["x-github-delivery"] as string;

      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (webhookSecret && signature) {
        const body = JSON.stringify(req.body);
        const expected = "sha256=" + createHmac("sha256", webhookSecret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          console.warn("[GitHub Webhook] Invalid signature for delivery:", deliveryId);
          return res.status(401).json({ error: "Invalid signature" });
        }
      }

      const payload = req.body;
      const repo = payload.repository?.full_name || "unknown";
      const sender = payload.sender?.login || "unknown";

      let message = "";
      let severity: "info" | "warning" | "critical" = "info";
      let details = "";

      switch (event) {
        case "push": {
          const branch = payload.ref?.replace("refs/heads/", "") || "unknown";
          const commits = payload.commits || [];
          const commitMessages = commits.map((c: any) => `• ${c.message?.split("\n")[0]} (${c.author?.username || c.author?.name})`).join("\n");
          message = `Push to ${repo}/${branch}: ${commits.length} commit(s) by ${sender}`;
          details = commitMessages || "No commit details";
          break;
        }
        case "pull_request": {
          const action = payload.action;
          const pr = payload.pull_request;
          message = `PR #${pr?.number} ${action}: "${pr?.title}" on ${repo} by ${sender}`;
          details = `Branch: ${pr?.head?.ref} → ${pr?.base?.ref}\nURL: ${pr?.html_url}\n${pr?.body?.substring(0, 500) || ""}`;
          if (action === "opened" || action === "reopened") severity = "warning";
          break;
        }
        case "issues": {
          const action = payload.action;
          const issue = payload.issue;
          message = `Issue #${issue?.number} ${action}: "${issue?.title}" on ${repo} by ${sender}`;
          details = `URL: ${issue?.html_url}\nLabels: ${issue?.labels?.map((l: any) => l.name).join(", ") || "none"}\n${issue?.body?.substring(0, 500) || ""}`;
          break;
        }
        case "issue_comment": {
          const issue = payload.issue;
          const comment = payload.comment;
          message = `Comment on #${issue?.number} "${issue?.title}" in ${repo} by ${sender}`;
          details = `${comment?.body?.substring(0, 500) || ""}\nURL: ${comment?.html_url}`;
          break;
        }
        case "workflow_run": {
          const run = payload.workflow_run;
          const conclusion = run?.conclusion;
          message = `Workflow "${run?.name}" ${run?.status} on ${repo} (${conclusion || "in progress"})`;
          details = `Branch: ${run?.head_branch}\nURL: ${run?.html_url}`;
          if (conclusion === "failure") severity = "critical";
          else if (conclusion === "success") severity = "info";
          break;
        }
        case "release": {
          const release = payload.release;
          message = `Release ${payload.action}: ${release?.tag_name} on ${repo} by ${sender}`;
          details = `Name: ${release?.name}\nURL: ${release?.html_url}\n${release?.body?.substring(0, 500) || ""}`;
          break;
        }
        case "ping": {
          message = `GitHub webhook ping from ${repo}`;
          details = `Zen: ${payload.zen}\nHook ID: ${payload.hook_id}`;
          break;
        }
        default: {
          message = `GitHub event "${event}" on ${repo} by ${sender}`;
          details = JSON.stringify(payload).substring(0, 1000);
          break;
        }
      }

      await storage.createGuardianLog({
        type: "service",
        severity,
        message,
        details,
        status: "detected",
        source: `github-webhook:${event}`,
      });

      console.log(`[GitHub Webhook] ${event} from ${repo} by ${sender} (delivery: ${deliveryId})`);

      if (event === "workflow_run" && payload.workflow_run?.conclusion === "failure") {
        try {
          const { scanSystem } = await import("./code-guardian");
          scanSystem().catch(() => {});
        } catch {}
      }

      res.json({ received: true, event, repo, delivery: deliveryId });
    } catch (error: any) {
      console.error("[GitHub Webhook] Error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  app.get("/api/files/list", requireAuth, async (req: Request, res: Response) => {
    try {
      const dirPath = (req.query.path as string) || "/root";
      const safePath = dirPath.replace(/\.\./g, "").replace(/[;&|`$]/g, "");
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig();
      if (!sshConfig) return res.status(500).json({ error: "No SSH connection configured" });
      const result = await executeRawSSHCommand(
        `ls -la --time-style=long-iso ${JSON.stringify(safePath)} 2>/dev/null | tail -n +2`,
        sshConfig
      );
      if (!result.success) return res.status(500).json({ error: result.error || "Failed to list directory" });
      const entries: Array<{ name: string; type: string; size: number; modified: string; permissions: string }> = [];
      const lines = result.output.split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 8) continue;
        const permissions = parts[0];
        const size = parseInt(parts[4], 10) || 0;
        const date = parts[5];
        const time = parts[6];
        const name = parts.slice(7).join(" ").replace(/ -> .*$/, "");
        if (name === "." || name === "..") continue;
        let type = "file";
        if (permissions.startsWith("d")) type = "directory";
        else if (permissions.startsWith("l")) type = "symlink";
        else if (!permissions.startsWith("-")) type = "other";
        entries.push({ name, type, size, modified: `${date} ${time}`, permissions });
      }
      entries.sort((a, b) => {
        if (a.type === "directory" && b.type !== "directory") return -1;
        if (a.type !== "directory" && b.type === "directory") return 1;
        return a.name.localeCompare(b.name);
      });
      res.json({ path: safePath, entries });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to list directory" });
    }
  });

  app.get("/api/files/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const filePath = (req.query.path as string);
      if (!filePath) return res.status(400).json({ error: "Path is required" });
      const safePath = filePath.replace(/\.\./g, "").replace(/[;&|`$]/g, "");
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig();
      if (!sshConfig) return res.status(500).json({ error: "No SSH connection configured" });
      const sizeCheck = await executeRawSSHCommand(
        `stat --printf='%s' ${JSON.stringify(safePath)} 2>/dev/null || echo 'NOT_FOUND'`,
        sshConfig
      );
      if (sizeCheck.output.includes("NOT_FOUND")) {
        return res.status(404).json({ error: "File not found" });
      }
      const fileSize = parseInt(sizeCheck.output.trim(), 10);
      if (fileSize > 1024 * 1024) {
        return res.status(400).json({ error: "File too large to edit (>1MB)" });
      }
      const result = await executeRawSSHCommand(
        `cat ${JSON.stringify(safePath)}`,
        sshConfig,
        1,
        30000
      );
      if (!result.success) return res.status(500).json({ error: result.error || "Failed to read file" });
      res.json({ path: safePath, content: result.output });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to read file" });
    }
  });

  app.post("/api/files/write", requireAuth, async (req: Request, res: Response) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || typeof content !== "string") {
        return res.status(400).json({ error: "Path and content are required" });
      }
      const safePath = filePath.replace(/\.\./g, "").replace(/[;&|`$]/g, "");
      const { executeRawSSHCommand, getSSHConfig } = await import("./ssh");
      const sshConfig = getSSHConfig();
      if (!sshConfig) return res.status(500).json({ error: "No SSH connection configured" });
      const b64 = Buffer.from(content, "utf8").toString("base64");
      const result = await executeRawSSHCommand(
        `echo '${b64}' | base64 -d > ${JSON.stringify(safePath)}`,
        sshConfig,
        1,
        30000
      );
      if (!result.success) return res.status(500).json({ error: result.error || "Failed to write file" });
      res.json({ success: true, path: safePath });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to write file" });
    }
  });

  app.get("/api/webhooks/github/info", requireAuth, async (_req: Request, res: Response) => {
    const baseUrl = process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`
      : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : null;

    const deployedUrl = "https://claw-settings.replit.app";

    res.json({
      webhookUrl: `${deployedUrl}/api/webhooks/github`,
      devUrl: baseUrl ? `${baseUrl}/api/webhooks/github` : null,
      secretConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
      supportedEvents: ["push", "pull_request", "issues", "issue_comment", "workflow_run", "release", "ping"],
      instructions: "Add this URL as a webhook in your GitHub repo: Settings → Webhooks → Add webhook. Set Content-Type to application/json. Optionally set a secret and add GITHUB_WEBHOOK_SECRET to your environment.",
    });
  });

  app.get("/api/marketplace/plugins", requireAuth, async (req, res) => {
    try {
      let plugins: any[] = [];
      let installed: string[] = [];
      let sshConnected = false;

      try {
        const { executeSSHCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
        const instanceId = await resolveInstanceId(req);
        let sshConfig;
        if (instanceId) {
          const vps = await storage.getVpsConnection(instanceId);
          if (vps) sshConfig = buildSSHConfigFromVps(vps);
        }
        if (!sshConfig) sshConfig = getSSHConfig() || undefined;

        if (sshConfig) {
          const sshTimeout = new Promise<[any, any]>((_, reject) => setTimeout(() => reject(new Error("SSH timeout (5s)")), 5000));
          const [listResult, installedResult] = await Promise.race([
            Promise.all([
              executeSSHCommand("plugins-list", sshConfig),
              executeSSHCommand("plugins-installed", sshConfig),
            ]),
            sshTimeout,
          ]);
          sshConnected = listResult.success || installedResult.success;

          try {
            const parsed = JSON.parse(listResult.output || "[]");
            if (Array.isArray(parsed)) plugins = parsed;
          } catch {}

          try {
            const parsed = JSON.parse(installedResult.output || "[]");
            if (Array.isArray(parsed)) installed = parsed.map((p: any) => typeof p === "string" ? p : p.name || p.id || "");
          } catch {
            const lines = (installedResult.output || "").split("\n").filter((l: string) => l.trim());
            installed = lines;
          }
        }
      } catch (sshErr: any) {
        console.log("[Marketplace] SSH unavailable, using catalog:", sshErr.message?.slice(0, 80));
      }

      if (plugins.length === 0) {
        plugins = [
          { name: "whatsapp", description: "WhatsApp messaging integration for sending and receiving messages", category: "messaging", author: "openclaw" },
          { name: "discord", description: "Discord bot integration for server management and messaging", category: "messaging", author: "openclaw" },
          { name: "voice-call", description: "Voice call capabilities with speech-to-text and text-to-speech", category: "communication", author: "openclaw" },
          { name: "slack", description: "Slack workspace integration for team messaging and notifications", category: "messaging", author: "openclaw" },
          { name: "telegram", description: "Telegram bot integration for messaging and group management", category: "messaging", author: "openclaw" },
          { name: "notion", description: "Notion workspace integration for notes, databases, and wikis", category: "productivity", author: "openclaw" },
          { name: "trello", description: "Trello board integration for project and task management", category: "productivity", author: "openclaw" },
          { name: "obsidian", description: "Obsidian vault integration for knowledge management", category: "productivity", author: "openclaw" },
          { name: "spotify-player", description: "Spotify playback control and music search", category: "media", author: "openclaw" },
          { name: "openai-whisper", description: "OpenAI Whisper speech-to-text transcription", category: "ai", author: "openclaw" },
          { name: "openai-whisper-api", description: "OpenAI Whisper API for cloud-based transcription", category: "ai", author: "openclaw" },
          { name: "openai-image-gen", description: "OpenAI DALL-E image generation from text prompts", category: "ai", author: "openclaw" },
          { name: "apple-notes", description: "Apple Notes integration for reading and creating notes", category: "productivity", author: "openclaw" },
          { name: "apple-reminders", description: "Apple Reminders integration for task management", category: "productivity", author: "openclaw" },
          { name: "bear-notes", description: "Bear notes app integration for markdown notes", category: "productivity", author: "openclaw" },
          { name: "things-mac", description: "Things 3 task manager integration for macOS", category: "productivity", author: "openclaw" },
          { name: "bluebubbles", description: "BlueBubbles iMessage integration for messaging", category: "messaging", author: "openclaw" },
          { name: "camsnap", description: "Camera snapshot capture from connected devices", category: "media", author: "openclaw" },
          { name: "gifgrep", description: "GIF search and sharing integration", category: "media", author: "openclaw" },
          { name: "imsg", description: "iMessage integration for Apple messaging", category: "messaging", author: "openclaw" },
          { name: "nano-pdf", description: "PDF generation and processing utilities", category: "utilities", author: "openclaw" },
          { name: "nano-banana-pro", description: "AI image generation and editing via multimodal LLMs (Gemini, OpenAI, etc.)", category: "ai", author: "openclaw" },
          { name: "peekaboo", description: "Screen peek and screenshot capture utility", category: "utilities", author: "openclaw" },
          { name: "sag", description: "Smart Agent Gateway for multi-agent orchestration", category: "ai", author: "openclaw" },
          { name: "model-usage", description: "LLM model usage tracking and analytics", category: "ai", author: "openclaw" },
          { name: "session-logs", description: "Session logging and history tracking", category: "utilities", author: "openclaw" },
          { name: "blogwatcher", description: "Blog and RSS feed monitoring with notifications", category: "utilities", author: "openclaw" },
          { name: "blucli", description: "Bluetooth device control and management CLI", category: "hardware", author: "openclaw" },
          { name: "sonoscli", description: "Sonos speaker control and playback management", category: "media", author: "openclaw" },
          { name: "eightctl", description: "Eight Sleep smart mattress control", category: "hardware", author: "openclaw" },
          { name: "openhue", description: "Philips Hue smart lighting control", category: "hardware", author: "openclaw" },
          { name: "ordercli", description: "Order management and tracking integration", category: "utilities", author: "openclaw" },
          { name: "songsee", description: "Song identification and lyrics lookup", category: "media", author: "openclaw" },
          { name: "gog", description: "GOG gaming platform integration", category: "media", author: "openclaw" },
          { name: "system-agent", description: "Full local system control — run commands, read/write files, inspect processes, and control applications on any node", category: "node-control", author: "openclaw" },
          { name: "windows-admin", description: "Windows administrative control via PowerShell — registry edits, service management, system configuration", category: "node-control", author: "openclaw" },
          { name: "ui-automation", description: "Visual UI automation — click buttons, type text, control mouse, and operate native apps without an API", category: "node-control", author: "openclaw" },
          { name: "desktop-control", description: "Advanced desktop automation — pixel-perfect mouse, keyboard, screen capture, window management, clipboard, drag-and-drop, and image recognition", category: "node-control", author: "openclaw" },
          { name: "screen-vision", description: "Screen vision and OCR — capture screen, find text, locate UI elements, and click automatically", category: "node-control", author: "openclaw" },
          { name: "homeassistant-agent", description: "Home Assistant full control — lights, switches, sensors, automations, scenes, and service calls via HA REST API", category: "smart-home", author: "openclaw" },
          { name: "webhook-agent", description: "Webhook listener skill — receive HTTP requests from Stream Deck, Companion, or any external trigger", category: "node-control", author: "openclaw" },
          { name: "api-agent", description: "Universal REST API caller — send HTTP requests to any service endpoint with auth, headers, and body", category: "node-control", author: "openclaw" },
          { name: "streamdeck-agent", description: "Stream Deck integration — trigger OpenClaw workflows from Stream Deck buttons via webhook or Companion", category: "hardware", author: "openclaw" },
          { name: "keyboard-agent", description: "Keyboard and hotkey control — send keystrokes, shortcuts, and hotkey combos to native applications", category: "node-control", author: "openclaw" },
          { name: "process-manager", description: "Process lifecycle management — start, stop, monitor, and list running processes on any connected node", category: "node-control", author: "openclaw" },
          { name: "filesystem-agent", description: "Advanced filesystem operations — watch directories, sync files, compress/extract archives, and manage permissions", category: "node-control", author: "openclaw" },
          { name: "docker-agent", description: "Docker container management — start, stop, restart, logs, and inspect containers and images", category: "devops", author: "openclaw" },
          { name: "ssh-agent", description: "SSH remote control — execute commands on remote machines, transfer files, and manage tunnels", category: "devops", author: "openclaw" },
          { name: "mqtt-agent", description: "MQTT IoT device control — publish/subscribe to topics for smart home and sensor automation", category: "smart-home", author: "openclaw" },
          { name: "companion-agent", description: "Bitfocus Companion integration — control Stream Deck buttons, pages, and actions via Companion API", category: "hardware", author: "openclaw" },
          { name: "gohighlevel", description: "GoHighLevel CRM — contacts, calendars, conversations, opportunities, pipelines, payments, blogs, email templates, and social media posting", category: "crm", author: "openclaw" },
        ];
      }

      const pluginsWithStatus = plugins.map((p: any) => {
        const pluginName = typeof p === "string" ? p : (p.name || p.id || "");
        return {
          name: pluginName,
          description: typeof p === "object" ? (p.description || "") : "",
          category: typeof p === "object" ? (p.category || "general") : "general",
          author: typeof p === "object" ? (p.author || "openclaw") : "openclaw",
          installed: installed.some((i: string) => i.toLowerCase().includes(pluginName.toLowerCase())),
        };
      });

      res.json({ plugins: pluginsWithStatus, sshConnected });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch plugins" });
    }
  });

  app.post("/api/marketplace/plugins/:name/install", requireAuth, async (req, res) => {
    try {
      const { executeSSHCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const pluginName = String(req.params.name).replace(/[^a-zA-Z0-9_\-]/g, "");
      const instanceId = await resolveInstanceId(req);
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) sshConfig = buildSSHConfigFromVps(vps);
      }
      if (!sshConfig) sshConfig = getSSHConfig() || undefined;

      const { executeSSHRawCommand } = await import("./ssh");
      const result = await executeSSHRawCommand(
        `openclaw plugins install ${pluginName} 2>&1 && openclaw plugins enable ${pluginName} 2>&1 && echo "INSTALL_SUCCESS"`,
        sshConfig
      );

      res.json({
        success: result.success && (result.output || "").includes("INSTALL_SUCCESS"),
        output: result.output,
        error: result.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to install plugin" });
    }
  });

  app.post("/api/marketplace/plugins/:name/uninstall", requireAuth, async (req, res) => {
    try {
      const pluginName = String(req.params.name).replace(/[^a-zA-Z0-9_\-]/g, "");
      const instanceId = await resolveInstanceId(req);
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) {
          const { buildSSHConfigFromVps } = await import("./ssh");
          sshConfig = buildSSHConfigFromVps(vps);
        }
      }
      if (!sshConfig) {
        const { getSSHConfig } = await import("./ssh");
        sshConfig = getSSHConfig() || undefined;
      }

      const { executeSSHRawCommand } = await import("./ssh");
      const result = await executeSSHRawCommand(
        `openclaw plugins disable ${pluginName} 2>&1 && echo "UNINSTALL_SUCCESS"`,
        sshConfig
      );

      res.json({
        success: result.success && (result.output || "").includes("UNINSTALL_SUCCESS"),
        output: result.output,
        error: result.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to uninstall plugin" });
    }
  });

  app.post("/api/marketplace/node-skills/deploy", requireAuth, async (req, res) => {
    try {
      const { skillName, nodeName } = req.body;
      if (!skillName) return res.status(400).json({ error: "skillName required" });

      const { executeSSHRawCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const instanceId = await resolveInstanceId(req);
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) sshConfig = buildSSHConfigFromVps(vps);
      }
      if (!sshConfig) sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.status(400).json({ error: "No SSH connection available" });

      const safeName = String(skillName).replace(/[^a-zA-Z0-9_\-\.]/g, "");
      const targetPath = nodeName
        ? `/home/${nodeName}/.openclaw/skills/${safeName}`
        : `/root/.openclaw/skills/${safeName}`;

      const skillContent = getNodeSkillContent(safeName);
      if (!skillContent) {
        const result = await executeSSHRawCommand(
          `openclaw skills install ${safeName} 2>&1 && echo "DEPLOY_SUCCESS"`,
          sshConfig
        );
        return res.json({
          success: result.success && (result.output || "").includes("DEPLOY_SUCCESS"),
          output: result.output,
          method: "openclaw-cli",
        });
      }

      const cmds = [
        `mkdir -p "${targetPath}"`,
        `cat > "${targetPath}/SKILL.md" << 'SKILLEOF'\n${skillContent.skillMd}\nSKILLEOF`,
        `cat > "${targetPath}/handler.py" << 'HANDLEREOF'\n${skillContent.handlerPy}\nHANDLEREOF`,
        `echo "DEPLOY_SUCCESS"`,
      ];

      const result = await executeSSHRawCommand(cmds.join(" && "), sshConfig);
      res.json({
        success: result.success && (result.output || "").includes("DEPLOY_SUCCESS"),
        output: result.output,
        method: "direct-deploy",
        path: targetPath,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to deploy skill" });
    }
  });

  app.get("/api/marketplace/node-skills/installed", requireAuth, async (req, res) => {
    try {
      const { executeSSHRawCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const instanceId = await resolveInstanceId(req);
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) sshConfig = buildSSHConfigFromVps(vps);
      }
      if (!sshConfig) sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.json({ skills: [], error: "No SSH connection" });

      const result = await executeSSHRawCommand(
        `ls -1 /root/.openclaw/skills/ 2>/dev/null || echo "NO_SKILLS_DIR"`,
        sshConfig
      );

      const skills = (result.output || "")
        .split("\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s && s !== "NO_SKILLS_DIR");

      res.json({ skills, success: result.success });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to list node skills" });
    }
  });

  app.get("/api/marketplace/node-skills/discover", requireAuth, async (req, res) => {
    try {
      const { executeSSHRawCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const instanceId = await resolveInstanceId(req);
      let sshConfig;
      if (instanceId) {
        const vps = await storage.getVpsConnection(instanceId);
        if (vps) sshConfig = buildSSHConfigFromVps(vps);
      }
      if (!sshConfig) sshConfig = getSSHConfig() || undefined;
      if (!sshConfig) return res.json({ skills: [], error: "No SSH connection available" });

      const listResult = await executeSSHRawCommand(
        `for d in /root/.openclaw/skills/*/; do
          name=$(basename "$d");
          desc="";
          if [ -f "$d/SKILL.md" ]; then
            desc=$(head -5 "$d/SKILL.md" | grep -i "description" | head -1 | sed 's/.*description[: ]*//' | tr -d '"' | head -c 200);
          fi
          if [ -z "$desc" ] && [ -f "$d/handler.py" ]; then
            desc=$(head -3 "$d/handler.py" | grep '#' | head -1 | sed 's/^#\\s*//' | head -c 200);
          fi
          echo "$name|||$desc";
        done 2>/dev/null || echo "NO_SKILLS"`,
        sshConfig
      );

      if (!listResult.success || (listResult.output || "").includes("NO_SKILLS")) {
        return res.json({ skills: [], sshConnected: true });
      }

      const skills = (listResult.output || "")
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line && line.includes("|||"))
        .map((line: string) => {
          const [name, description] = line.split("|||");
          return {
            name: name.trim(),
            description: (description || "").trim() || `${name.trim()} skill from VPS node`,
            category: "node-skill",
            author: "node",
            installed: true,
            source: "vps",
          };
        });

      res.json({ skills, sshConnected: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to discover node skills" });
    }
  });

  app.get("/api/system-stats", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const instance = await storage.getInstance(instanceId);
      const vps = instance ? await storage.getVpsConfig(instanceId) : null;

      const { executeSSHRawCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const sshConfig = vps?.vpsIp
        ? buildSSHConfigFromVps({ vpsIp: vps.vpsIp, vpsPort: vps.vpsPort || 22, sshUser: vps.sshUser || "root", sshKeyPath: vps.sshKeyPath })
        : getSSHConfig();

      if (!sshConfig) return res.status(400).json({ error: "No SSH credentials configured" });

      const cmd = `echo '===CPU===' && top -bn1 | head -5 && echo '===MEM===' && free -m && echo '===DISK===' && df -h / && echo '===UPTIME===' && uptime && echo '===LOAD===' && cat /proc/loadavg && echo '===NET===' && cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1`;
      const result = await executeSSHRawCommand(cmd, sshConfig);

      if (!result.success) {
        return res.json({ success: false, error: result.error });
      }

      const output = result.output || "";
      const sections: Record<string, string> = {};
      let currentSection = "";
      for (const line of output.split("\n")) {
        if (line.startsWith("===") && line.endsWith("===")) {
          currentSection = line.replace(/===/g, "").trim();
          sections[currentSection] = "";
        } else if (currentSection) {
          sections[currentSection] += line + "\n";
        }
      }

      let cpuUsage = 0;
      const cpuMatch = (sections["CPU"] || "").match(/(\d+[\.,]\d+)\s*id/);
      if (cpuMatch) {
        cpuUsage = Math.round(100 - parseFloat(cpuMatch[1].replace(",", ".")));
      }

      let memTotal = 0, memUsed = 0, memFree = 0;
      const memLines = (sections["MEM"] || "").split("\n");
      for (const ml of memLines) {
        const memMatch = ml.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (memMatch) {
          memTotal = parseInt(memMatch[1]);
          memUsed = parseInt(memMatch[2]);
          memFree = parseInt(memMatch[3]);
        }
      }

      let diskTotal = "", diskUsed = "", diskAvail = "", diskUsePercent = 0;
      const diskLines = (sections["DISK"] || "").split("\n");
      for (const dl of diskLines) {
        const diskMatch = dl.match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
        if (diskMatch) {
          diskTotal = diskMatch[1];
          diskUsed = diskMatch[2];
          diskAvail = diskMatch[3];
          diskUsePercent = parseInt(diskMatch[4]);
        }
      }

      let loadAvg = [0, 0, 0];
      const loadMatch = (sections["LOAD"] || "").match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (loadMatch) {
        loadAvg = [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])];
      }

      let uptimeStr = (sections["UPTIME"] || "").trim();

      let netRx = 0, netTx = 0;
      const netMatch = (sections["NET"] || "").match(/:\s*(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      if (netMatch) {
        netRx = parseInt(netMatch[1]);
        netTx = parseInt(netMatch[2]);
      }

      res.json({
        success: true,
        timestamp: Date.now(),
        cpu: { usage: cpuUsage },
        memory: { total: memTotal, used: memUsed, free: memFree, percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0 },
        disk: { total: diskTotal, used: diskUsed, available: diskAvail, percent: diskUsePercent },
        load: loadAvg,
        uptime: uptimeStr,
        network: { rxBytes: netRx, txBytes: netTx },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch system stats" });
    }
  });

  app.get("/api/gateway-logs", requireAuth, async (req, res) => {
    try {
      const instanceId = await resolveInstanceId(req);
      if (!instanceId) return res.status(400).json({ error: "No instance" });
      const instance = await storage.getInstance(instanceId);
      const vps = instance ? await storage.getVpsConfig(instanceId) : null;

      const { executeSSHRawCommand, buildSSHConfigFromVps, getSSHConfig } = await import("./ssh");
      const sshConfig = vps?.vpsIp
        ? buildSSHConfigFromVps({ vpsIp: vps.vpsIp, vpsPort: vps.vpsPort || 22, sshUser: vps.sshUser || "root", sshKeyPath: vps.sshKeyPath })
        : getSSHConfig();

      if (!sshConfig) return res.status(400).json({ error: "No SSH credentials configured" });

      const lines = parseInt(req.query.lines as string) || 50;
      const cmd = `tail -${Math.min(lines, 200)} /tmp/oc.log 2>/dev/null || tail -${Math.min(lines, 200)} /tmp/openclaw.log 2>/dev/null || journalctl -u openclaw --no-pager -n ${Math.min(lines, 200)} 2>/dev/null || echo 'No gateway logs found'`;
      const result = await executeSSHRawCommand(cmd, sshConfig);

      res.json({
        success: result.success,
        logs: result.output || "",
        error: result.error,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch gateway logs" });
    }
  });

  app.get("/api/automation/jobs", requireAuth, async (_req, res) => {
    try {
      const jobs = await storage.getAutomationJobs();
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch automation jobs" });
    }
  });

  app.get("/api/automation/jobs/:id", requireAuth, async (req, res) => {
    try {
      const job = await storage.getAutomationJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.post("/api/automation/jobs", requireAuth, async (req, res) => {
    try {
      const { insertAutomationJobSchema } = await import("@shared/schema");
      const parsed = insertAutomationJobSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { getNextRun } = await import("./automation");
      const nextRun = getNextRun(parsed.data.schedule);
      const job = await storage.createAutomationJob(parsed.data);
      await storage.updateAutomationJob(job.id, { nextRun });
      const updated = await storage.getAutomationJob(job.id);
      res.status(201).json(updated);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create automation job" });
    }
  });

  app.patch("/api/automation/jobs/:id", requireAuth, async (req, res) => {
    try {
      const { insertAutomationJobSchema } = await import("@shared/schema");
      const updateSchema = insertAutomationJobSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const updateData: any = { ...parsed.data };
      if (parsed.data.schedule) {
        const { getNextRun } = await import("./automation");
        updateData.nextRun = getNextRun(parsed.data.schedule);
      }
      const updated = await storage.updateAutomationJob(req.params.id, updateData);
      if (!updated) return res.status(404).json({ error: "Job not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  app.delete("/api/automation/jobs/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteAutomationJob(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  app.post("/api/automation/jobs/:id/run", requireAuth, async (req, res) => {
    try {
      const job = await storage.getAutomationJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const { executeJob } = await import("./automation");
      executeJob(job).catch(err => console.error("[Automation] Manual run failed:", err.message));
      res.json({ success: true, message: "Job execution started" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to run job" });
    }
  });

  app.get("/api/automation/jobs/:id/runs", requireAuth, async (req, res) => {
    try {
      const runs = await storage.getAutomationRuns(req.params.id);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch runs" });
    }
  });

  app.get("/api/metrics", requireAuth, async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 1000;
      const events = await storage.getMetricsEvents(category, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch metrics events" });
    }
  });

  app.get("/api/metrics/summary", requireAuth, async (_req, res) => {
    try {
      const events = await storage.getMetricsEvents(undefined, 5000);
      const totalMessages = events.filter((e) => e.category === "whatsapp").length;
      const totalApiCalls = events.filter((e) => e.category === "api_call").length;
      const uptimeEvents = events.filter((e) => e.category === "node_uptime");
      const avgUptime =
        uptimeEvents.length > 0
          ? uptimeEvents.reduce((sum, e) => sum + (e.value ?? 0), 0) / uptimeEvents.length
          : 0;
      const guardianIssues = events.filter(
        (e) => e.category === "guardian" && e.type === "issue_detected"
      ).length;
      res.json({ totalMessages, totalApiCalls, avgUptime, guardianIssues });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch metrics summary" });
    }
  });

  app.post("/api/metrics", requireAuth, async (req, res) => {
    try {
      const { type, category, value, metadata } = req.body;
      if (!type || !category) {
        return res.status(400).json({ error: "type and category are required" });
      }
      const event = await storage.createMetricsEvent({ type, category, value, metadata });
      res.status(201).json(event);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create metrics event" });
    }
  });

  const codeUpgrades: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    diff: string;
    status: string;
    createdAt: string;
  }> = [];

  app.get("/api/admin/code-upgrades", requireAuth, async (_req, res) => {
    res.json(codeUpgrades);
  });

  app.post("/api/admin/code-upgrades/generate", requireAuth, async (_req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: "OPENAI_API_KEY not configured" });

      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a code upgrade agent for the OpenClaw Dashboard (Express + React + TypeScript). 
Suggest 3 practical code improvements. Return JSON array with objects having: title, description, category (one of: performance, security, refactor, feature, cleanup), priority (high/medium/low), diff (suggested code change as a unified diff or pseudocode).`
          },
          {
            role: "user",
            content: "Analyze the OpenClaw Dashboard codebase and suggest 3 code upgrades. Focus on: error handling improvements, security hardening, performance optimizations, or code cleanup opportunities."
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });

      const parsed = JSON.parse(content);
      const suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions || parsed.upgrades || [];

      for (const s of suggestions) {
        codeUpgrades.push({
          id: crypto.randomUUID(),
          title: s.title || "Untitled",
          description: s.description || "",
          category: s.category || "refactor",
          priority: s.priority || "medium",
          diff: s.diff || "",
          status: "proposed",
          createdAt: new Date().toISOString(),
        });
      }

      res.json({ success: true, count: suggestions.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/code-upgrades/:id", requireAuth, async (req, res) => {
    const upgrade = codeUpgrades.find(u => u.id === req.params.id);
    if (!upgrade) return res.status(404).json({ error: "Not found" });
    if (req.body.status) upgrade.status = req.body.status;
    res.json(upgrade);
  });

  app.delete("/api/admin/code-upgrades/:id", requireAuth, async (req, res) => {
    const idx = codeUpgrades.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    codeUpgrades.splice(idx, 1);
    res.json({ success: true });
  });

  app.get("/api/email-workflows", requireAuth, async (_req, res) => {
    try {
      const workflows = await storage.getEmailWorkflows();
      res.json(workflows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/email-workflows/:id", requireAuth, async (req, res) => {
    try {
      const wf = await storage.getEmailWorkflow(req.params.id);
      if (!wf) return res.status(404).json({ error: "Workflow not found" });
      res.json(wf);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/email-workflows", requireAuth, async (req, res) => {
    try {
      const parsed = insertEmailWorkflowSchema.parse(req.body);
      const wf = await storage.createEmailWorkflow(parsed);
      res.json(wf);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/email-workflows/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        category: z.string().optional(),
        triggerPattern: z.string().optional(),
        triggerSource: z.string().optional(),
        action: z.string().optional(),
        actionConfig: z.any().optional(),
        enabled: z.boolean().optional(),
      });
      const parsed = updateSchema.parse(req.body);
      const wf = await storage.updateEmailWorkflow(req.params.id, parsed);
      if (!wf) return res.status(404).json({ error: "Workflow not found" });
      res.json(wf);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/email-workflows/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteEmailWorkflow(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  setTimeout(async () => {
    try {
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.NODE_ENV !== "development") {
        const { startTelegramBot } = await import("./bot/telegram");
        await startTelegramBot();
      } else if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log("[Telegram] Skipped auto-start in development (production instance handles polling)");
      }
    } catch (err: any) {
      console.error("[Startup] Telegram auto-start failed:", err.message);
    }
    try {
      const { startAutomationScheduler } = await import("./automation");
      startAutomationScheduler();
    } catch (err: any) {
      console.error("[Startup] Automation scheduler failed:", err.message);
    }
    try {
      const { startAutoScan } = await import("./code-guardian");
      startAutoScan();
    } catch (err: any) {
      console.error("[Startup] Guardian auto-scan failed:", err.message);
    }
  }, 3000);

  // ── Replit Projects ──────────────────────────────────────
  app.get("/api/replit-projects", requireAuth, async (_req, res) => {
    try {
      const projects = await storage.getReplitProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch replit projects" });
    }
  });

  app.get("/api/replit-projects/evaluation", requireAuth, async (_req, res) => {
    try {
      const evaluation = await storage.getLatestProjectEvaluation();
      if (!evaluation) return res.json(null);
      res.json({
        ...evaluation,
        projectScores: JSON.parse(evaluation.projectScores),
        recommendations: evaluation.recommendations ? JSON.parse(evaluation.recommendations) : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch evaluation" });
    }
  });

  app.get("/api/replit-projects/:id", requireAuth, async (req, res) => {
    try {
      const project = await storage.getReplitProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/replit-projects", requireAuth, async (req, res) => {
    try {
      const parsed = insertReplitProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const project = await storage.createReplitProject(parsed.data);
      logAudit(`Added Replit project "${parsed.data.title}"`, "replit_project", undefined, req.session.userId);
      res.status(201).json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/replit-projects/:id", requireAuth, async (req, res) => {
    try {
      const updateSchema = insertReplitProjectSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const updated = await storage.updateReplitProject(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Project not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/replit-projects/:id", requireAuth, async (req, res) => {
    try {
      logAudit(`Deleted Replit project ${req.params.id}`, "replit_project", undefined, req.session.userId);
      await storage.deleteReplitProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  app.post("/api/replit-projects/sync", requireAuth, async (req, res) => {
    try {
      let username = (req.body.username || process.env.REPLIT_USERNAME || process.env.REPL_OWNER || "").trim();
      if (!username) {
        return res.status(400).json({ error: "Provide a username in the request body or set REPLIT_USERNAME in Secrets." });
      }

      if (username.includes("replit.com/@")) {
        const m = username.match(/@([a-zA-Z0-9_-]+)/);
        if (m) username = m[1];
      }
      if (username.includes("replit.com/")) {
        const parts = username.split("/").filter(Boolean);
        username = parts[parts.length - 1];
      }
      if (username.includes("://") || username.includes(".")) {
        return res.status(400).json({ error: `"${username}" looks like a URL, not a username. Enter just your Replit username (e.g. "rsmolarz").` });
      }

      const allRepls: any[] = [];
      let source = "none";

      const sid = process.env.REPLIT_SID;
      const gqlHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://replit.com",
        "Referer": `https://replit.com/@${username}`,
      };
      if (sid) gqlHeaders["Cookie"] = `connect.sid=${sid}`;

      let after: string | null = null;
      let pageCount = 0;
      const MAX_PAGES = 10;

      while (pageCount < MAX_PAGES) {
        pageCount++;
        const gqlQuery = {
          operationName: "ProfilePublicRepls",
          variables: { username, after: after || "", search: "" },
          query: `query ProfilePublicRepls($username: String!, $after: String, $search: String) {
            user: userByUsername(username: $username) {
              id
              profileRepls: profileRepls(after: $after, search: $search) {
                items { id title url description(plainText: true) iconUrl likeCount publishedAs publicForkCount templateInfo { label } }
                pageInfo { hasNextPage nextCursor }
              }
            }
          }`,
        };

        try {
          const gqlRes = await Promise.race([
            fetch("https://replit.com/graphql", { method: "POST", headers: gqlHeaders, body: JSON.stringify(gqlQuery) }),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("GQL timeout")), 8000)),
          ]);

          if (gqlRes.ok) {
            const gqlData = await gqlRes.json();

            if (gqlData?.errors?.some((e: any) => e.extensions?.code === "PERSISTED_QUERY_NOT_FOUND" || e.message?.includes("Persisted query"))) {
              console.log("[Replit Sync] GraphQL requires persisted query hashes, trying HTML scraping");
              break;
            }
            if (gqlData?.errors?.some((e: any) => e.message?.includes("Persisted query hash required"))) {
              console.log("[Replit Sync] GraphQL requires persisted query hashes");
              break;
            }

            const user = gqlData?.data?.user || gqlData?.data?.userByUsername;
            if (!user) {
              if (allRepls.length === 0 && !gqlData?.errors) {
                return res.status(404).json({ error: `User "${username}" not found on Replit.` });
              }
              break;
            }

            const items = user.profileRepls?.items || user.publicRepls?.items || [];
            for (const r of items) {
              const slug = r.url?.split("/").pop() || r.title?.toLowerCase().replace(/\s+/g, "-") || "";
              allRepls.push({
                id: r.id,
                slug,
                title: r.title,
                description: r.description,
                url: r.url || `https://replit.com/@${username}/${slug}`,
                language: r.language || null,
                imageUrl: r.iconUrl || r.imageUrl || null,
                isPrivate: r.isPrivate ?? false,
                deployment: r.deployment || (r.publishedAs ? { id: "deployed" } : null),
                hostedUrl: r.hostedUrl || (r.publishedAs ? `https://${slug}.replit.app` : null),
              });
            }

            source = "graphql";
            const pageInfo = user.profileRepls?.pageInfo || user.publicRepls?.pageInfo;
            if (!pageInfo?.hasNextPage || !pageInfo.nextCursor) break;
            after = pageInfo.nextCursor;
          } else {
            const errText = await gqlRes.text().catch(() => "");
            console.error(`[Replit Sync] GraphQL ${gqlRes.status}: ${errText.slice(0, 200)}`);
            break;
          }
        } catch (gqlErr: any) {
          console.log("[Replit Sync] GraphQL unavailable:", gqlErr.message?.slice(0, 100));
          break;
        }
      }

      if (allRepls.length === 0) {
        try {
          const htmlHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
          };
          if (sid) htmlHeaders["Cookie"] = `connect.sid=${sid}`;

          const profileRes = await fetch(`https://replit.com/@${username}`, { headers: htmlHeaders });
          if (profileRes.ok) {
            const html = await profileRes.text();
            const match = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/);
            if (match) {
              const nextData = JSON.parse(match[1]);
              const apollo = nextData?.props?.apolloState || {};
              for (const [key, value] of Object.entries(apollo)) {
                if (key.startsWith("Repl:") && typeof value === "object" && value !== null) {
                  const v = value as any;
                  if (v.title || v.slug) {
                    allRepls.push({
                      id: v.id || key.replace("Repl:", ""),
                      slug: v.slug, title: v.title, description: v.description,
                      url: v.url, language: v.language, imageUrl: v.imageUrl || v.iconUrl,
                      isPrivate: v.isPrivate, deployment: v.deployment, hostedUrl: v.hostedUrl,
                    });
                  }
                }
              }
              if (allRepls.length > 0) source = "html";
            }

            if (allRepls.length === 0) {
              const linkPattern = new RegExp(`/@${username}/([a-zA-Z0-9_-]+)`, "g");
              const slugs = new Set<string>();
              let m;
              while ((m = linkPattern.exec(html)) !== null) {
                if (!["settings", "repls", "profile", "account"].includes(m[1])) slugs.add(m[1]);
              }
              for (const slug of slugs) {
                allRepls.push({
                  id: slug, slug, title: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                  description: null, url: `https://replit.com/@${username}/${slug}`,
                  language: null, imageUrl: null, isPrivate: false, deployment: null, hostedUrl: null,
                });
              }
              if (allRepls.length > 0) source = "html-links";
            }
          }
        } catch (e: any) {
          console.error("[Replit Sync] HTML fallback failed:", e.message);
        }
      }

      let created = 0;
      let updated = 0;

      for (const repl of allRepls) {
        if (!repl.slug && !repl.title) continue;
        const replitId = String(repl.id);
        const slug = repl.slug || repl.title;

        const existingById = await storage.getReplitProjectByReplitId(replitId);
        const existingBySlug = !existingById ? await storage.getReplitProjectBySlug(slug) : null;
        const existing = existingById || existingBySlug;
        const deploymentUrl = repl.hostedUrl || (repl.deployment ? `https://${repl.slug}.replit.app` : null);

        if (existing) {
          await storage.updateReplitProject(existing.id, {
            title: repl.title || repl.slug || existing.title,
            slug: repl.slug || existing.slug,
            description: repl.description || existing.description,
            url: repl.url || existing.url || `https://replit.com/@${username}/${repl.slug}`,
            language: repl.language || existing.language,
            imageUrl: repl.imageUrl || existing.imageUrl,
            isPrivate: repl.isPrivate ?? existing.isPrivate ?? false,
            deploymentUrl: deploymentUrl || existing.deploymentUrl,
            replitId: replitId !== slug ? replitId : existing.replitId,
            lastSynced: new Date(),
          });
          updated++;
        } else {
          await storage.createReplitProject({
            slug, title: repl.title || slug,
            description: repl.description || null,
            url: repl.url || `https://replit.com/@${username}/${slug}`,
            language: repl.language || null, imageUrl: repl.imageUrl || null,
            isPrivate: repl.isPrivate ?? false, replitId: replitId !== slug ? replitId : null,
            deploymentUrl, status: "active",
            deploymentStatus: repl.deployment ? "deployed" : null,
            lastSynced: new Date(), notes: null, tags: null, progress: 0,
          });
          created++;
        }
      }

      logAudit(`Synced Replit projects from profile (${created} new, ${updated} updated)`, "replit_project", undefined, req.session.userId);
      res.json({
        total: allRepls.length, created, updated, source,
        note: allRepls.length === 0
          ? "Replit's API requires persisted query hashes, so auto-sync is currently limited. Use bulk import to add projects manually — paste project names or URLs, one per line."
          : undefined,
      });
    } catch (error: any) {
      console.error("[Replit Sync] Error:", error.message);
      res.status(500).json({ error: "Failed to sync from Replit", details: error.message });
    }
  });

  app.post("/api/replit-projects/bulk-import", requireAuth, async (req, res) => {
    try {
      const { projects, text } = req.body;
      const username = req.body.username || process.env.REPLIT_USERNAME || "user";
      const existingProjects = await storage.getReplitProjects();

      let parsedProjects: any[] = [];

      if (text && typeof text === "string") {
        const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#") && !l.startsWith("//"));
        for (const line of lines) {
          const urlMatch = line.match(/replit\.com\/@([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
          if (urlMatch) {
            const slug = urlMatch[2];
            const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            parsedProjects.push({ slug, title, url: line.startsWith("http") ? line : `https://${line}`, language: null });
          } else if (line.includes(".replit.app")) {
            const appMatch = line.match(/([a-zA-Z0-9_-]+)\.replit\.app/);
            if (appMatch) {
              const slug = appMatch[1];
              const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
              parsedProjects.push({ slug, title, url: `https://replit.com/@${username}/${slug}`, deploymentUrl: line.startsWith("http") ? line : `https://${line}`, language: null });
            }
          } else {
            const slug = line.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
            if (slug) {
              parsedProjects.push({ slug, title: line, url: `https://replit.com/@${username}/${slug}`, language: null });
            }
          }
        }
      } else if (Array.isArray(projects) && projects.length > 0) {
        parsedProjects = projects;
      } else {
        return res.status(400).json({ error: "Provide either 'text' (one project per line) or 'projects' array" });
      }

      if (parsedProjects.length === 0) {
        return res.status(400).json({ error: "No valid projects found in input" });
      }

      const seenSlugs = new Set<string>();
      let created = 0;
      let skipped = 0;

      for (const proj of parsedProjects) {
        if (!proj.title && !proj.slug) { skipped++; continue; }
        const slug = proj.slug || proj.title.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        if (seenSlugs.has(slug)) { skipped++; continue; }
        seenSlugs.add(slug);
        const exists = existingProjects.find(p => p.slug === slug || (proj.replitId && p.replitId === String(proj.replitId)));
        if (exists) { skipped++; continue; }

        await storage.createReplitProject({
          slug,
          title: proj.title || slug,
          description: proj.description || null,
          url: proj.url || `https://replit.com/@${username}/${slug}`,
          language: proj.language || null,
          imageUrl: proj.imageUrl || null,
          isPrivate: proj.isPrivate ?? false,
          replitId: proj.replitId ? String(proj.replitId) : null,
          deploymentUrl: proj.deploymentUrl || null,
          status: proj.status || "active",
          deploymentStatus: null,
          lastSynced: null,
          notes: proj.notes || null,
          tags: proj.tags || null,
          progress: proj.progress || 0,
        });
        created++;
      }

      logAudit(`Bulk imported ${created} Replit projects (${skipped} skipped)`, "replit_project", undefined, req.session.userId);
      res.json({ created, skipped, total: parsedProjects.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to bulk import", details: error.message });
    }
  });

  app.post("/api/replit-projects/:id/check-deployment", requireAuth, async (req, res) => {
    try {
      const project = await storage.getReplitProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.deploymentUrl) {
        return res.json({ status: "no_deployment", message: "No deployment URL configured" });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const healthRes = await fetch(project.deploymentUrl, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

        const status = healthRes.ok ? "healthy" : "unhealthy";
        await storage.updateReplitProject(project.id, { deploymentStatus: status });
        res.json({ status, statusCode: healthRes.status, url: project.deploymentUrl });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        const status = fetchErr.name === "AbortError" ? "timeout" : "unreachable";
        await storage.updateReplitProject(project.id, { deploymentStatus: status });
        res.json({ status, error: fetchErr.message, url: project.deploymentUrl });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to check deployment" });
    }
  });

  // ── Voice Chat ──
  app.post("/api/voice/chat", requireAuth, async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const chatHistory = (history || []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const { chat } = await import("./bot/openrouter");
      const response = await chat(message, "Voice User", "voice-chat", chatHistory);

      logAudit("Voice chat message", "voice_chat", undefined, req.session.userId);
      res.json({ text: response.text, imagePrompt: response.imagePrompt || null });
    } catch (error: any) {
      console.error("[Voice Chat] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/voice/tts", requireAuth, async (req, res) => {
    try {
      const { text, voice } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      const selectedVoice = validVoices.includes(voice) ? voice : "nova";

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "OpenAI API key not configured for TTS" });
      }

      const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text.substring(0, 4096),
          voice: selectedVoice,
          response_format: "mp3",
        }),
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        console.error("[TTS] OpenAI error:", errText);
        return res.status(502).json({ error: "TTS generation failed" });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Transfer-Encoding", "chunked");

      let clientClosed = false;
      req.on("close", () => { clientClosed = true; });

      if (ttsRes.body) {
        const reader = (ttsRes.body as any).getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || clientClosed) break;
            res.write(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
          res.end();
        }
      } else {
        const arrayBuffer = await ttsRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } catch (error: any) {
      console.error("[TTS] Error:", error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.end();
      }
    }
  });

  // ── Streaming Voice API (Watch App) ──

  app.get("/api/voice/session", requireAuthOrVoiceToken, async (req, res) => {
    try {
      const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasLLM = hasOpenAI || !!process.env.OPENROUTER_API_KEY || !!process.env.GEMINI_API_KEY;
      res.json({
        authenticated: true,
        userId: req.session.userId || (req as any).voiceTokenUserId || null,
        voices,
        capabilities: {
          stt: hasOpenAI,
          tts: hasOpenAI,
          chat: hasLLM,
        },
        status: "ready",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/voice/token", requireAuth, async (req, res) => {
    try {
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      const userId = req.session.userId || "unknown";
      voiceTokens.set(token, { userId: String(userId), expiresAt });

      Array.from(voiceTokens.entries()).forEach(([k, v]) => {
        if (v.expiresAt < Date.now()) voiceTokens.delete(k);
      });

      logAudit("Voice API token generated", "voice_token", undefined, req.session.userId);
      res.json({ token, expiresAt: new Date(expiresAt).toISOString(), expiresIn: "24h" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/voice/stt", requireAuthOrVoiceToken, voiceUpload.single("audio"), async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "OpenAI API key not configured for STT" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided. Send as multipart with field name 'audio'." });
      }

      const formData = new FormData();
      const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
      const ext = req.file.originalname?.split(".").pop() || "webm";
      formData.append("file", audioBlob, `audio.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("language", (req.body?.language as string) || "en");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        console.error("[STT] Whisper error:", errText);
        return res.status(502).json({ error: "Speech-to-text failed", details: errText });
      }

      const result = await whisperRes.json() as any;
      logAudit("Voice STT transcription", "voice_stt", undefined, req.session.userId || (req as any).voiceTokenUserId);
      res.json({ transcript: result.text });
    } catch (error: any) {
      console.error("[STT] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/voice/stream-chat", requireAuthOrVoiceToken, voiceUpload.single("audio"), async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "OpenAI API key not configured" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided. Send as multipart with field name 'audio'." });
      }

      const formData = new FormData();
      const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
      const ext = req.file.originalname?.split(".").pop() || "webm";
      formData.append("file", audioBlob, `audio.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("language", (req.body?.language as string) || "en");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        console.error("[StreamChat] Whisper error:", errText);
        return res.status(502).json({ error: "Speech-to-text failed", details: errText });
      }

      const whisperResult = await whisperRes.json() as any;
      const transcript = whisperResult.text;

      if (!transcript || !transcript.trim()) {
        return res.json({ transcript: "", response: "", audioUrl: null });
      }

      let chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (req.body?.history) {
        try {
          const parsed = typeof req.body.history === "string" ? JSON.parse(req.body.history) : req.body.history;
          chatHistory = (parsed || []).map((m: any) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        } catch {}
      }

      const { chat } = await import("./bot/openrouter");
      const llmResponse = await chat(transcript, "Watch User", "voice-stream", chatHistory);

      const voice = (req.body?.voice as string) || "nova";
      const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      const selectedVoice = validVoices.includes(voice) ? voice : "nova";

      const audioId = randomBytes(8).toString("hex");
      let audioUrl: string | null = null;

      try {
        const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: llmResponse.text.substring(0, 4096),
            voice: selectedVoice,
            response_format: "mp3",
          }),
        });

        if (ttsRes.ok) {
          const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
          ttsAudioCache.set(audioId, {
            buffer: audioBuffer,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });

          Array.from(ttsAudioCache.entries()).forEach(([k, v]) => {
            if (v.expiresAt < Date.now()) ttsAudioCache.delete(k);
          });

          const protocol = req.headers["x-forwarded-proto"] || req.protocol;
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          audioUrl = `${protocol}://${host}/api/voice/audio/${audioId}`;
        }
      } catch (ttsErr: any) {
        console.error("[StreamChat] TTS error:", ttsErr.message);
      }

      logAudit("Voice stream-chat", "voice_stream", undefined, req.session.userId || (req as any).voiceTokenUserId);
      res.json({
        transcript,
        response: llmResponse.text,
        audioUrl,
        imagePrompt: llmResponse.imagePrompt || null,
      });
    } catch (error: any) {
      console.error("[StreamChat] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/voice/audio/:audioId", requireAuthOrVoiceToken, async (req, res) => {
    const entry = ttsAudioCache.get(req.params.audioId);
    if (!entry || entry.expiresAt < Date.now()) {
      ttsAudioCache.delete(req.params.audioId);
      return res.status(404).json({ error: "Audio not found or expired" });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", entry.buffer.length.toString());
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(entry.buffer);
  });

  // ── Omi Integration ──
  app.get("/api/omi/status", requireAuth, async (_req, res) => {
    try {
      const { isOmiConfigured, checkOmiConnection } = await import("./omi");
      if (!isOmiConfigured()) {
        return res.json({ configured: false, connected: false, error: "OMI_API_KEY not set" });
      }
      const status = await checkOmiConnection();
      res.json({ configured: true, ...status });
    } catch (error: any) {
      res.json({ configured: false, connected: false, error: error.message });
    }
  });

  app.get("/api/omi/memories", requireAuth, async (req, res) => {
    try {
      const { fetchOmiMemories, isOmiConfigured } = await import("./omi");
      if (!isOmiConfigured()) return res.status(400).json({ error: "OMI_API_KEY not configured" });
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const memories = await fetchOmiMemories(limit, offset);
      res.json(memories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/omi/action-items", requireAuth, async (_req, res) => {
    try {
      const { fetchOmiActionItems, isOmiConfigured } = await import("./omi");
      if (!isOmiConfigured()) return res.status(400).json({ error: "OMI_API_KEY not configured" });
      const items = await fetchOmiActionItems();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/omi/analyze", requireAuth, async (_req, res) => {
    try {
      const { fetchOmiMemories, isOmiConfigured } = await import("./omi");
      if (!isOmiConfigured()) return res.status(400).json({ error: "OMI_API_KEY not configured" });

      const memories = await fetchOmiMemories(30);
      if (!memories || memories.length === 0) {
        return res.json({ todos: [], recommendations: "No recent conversations found to analyze." });
      }

      const conversationSummaries = memories.map((m: any, i: number) => {
        const title = m.structured?.title || m.structured?.overview || `Conversation ${i + 1}`;
        const transcript = m.transcript_segments?.map((s: any) => `${s.speaker || "Speaker"}: ${s.text}`).join("\n") || m.structured?.overview || "";
        const actionItems = m.structured?.action_items?.map((a: any) => `- ${a.description || a}`).join("\n") || "";
        return `### ${title} (${m.created_at || "unknown date"})\n${transcript.substring(0, 500)}\n${actionItems ? `Action items:\n${actionItems}` : ""}`;
      }).join("\n\n");

      const { chat } = await import("./bot/openrouter");
      const prompt = `You are a personal efficiency coach analyzing recent conversations from an AI wearable device. The user is a doctor/entrepreneur managing multiple tech projects.

Here are the recent conversations:
${conversationSummaries}

Please respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "todos": [
    {"content": "task description", "priority": "high|medium|low", "source": "conversation title"}
  ],
  "recommendations": "3-5 bullet points on how to be more efficient based on what you see in these conversations",
  "insights": "brief summary of patterns you notice (time usage, repeated topics, missed opportunities)"
}`;

      const response = await chat(prompt, "System", "omi-analyzer");
      let parsed;
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { todos: [], recommendations: response.text, insights: "" };
      } catch {
        parsed = { todos: [], recommendations: response.text, insights: "" };
      }

      for (const todo of (parsed.todos || [])) {
        await storage.createOmiTodo({
          content: todo.content,
          source: todo.source || null,
          sourceTitle: todo.source || null,
          status: "pending",
          priority: todo.priority || "medium",
          completedAt: null,
        });
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("[Omi Analyze] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/omi/todos", requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const todos = await storage.getOmiTodos(status);
      res.json(todos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch todos" });
    }
  });

  app.post("/api/omi/todos", requireAuth, async (req, res) => {
    try {
      const { content, priority, source, sourceTitle } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Content is required" });
      const todo = await storage.createOmiTodo({
        content: content.trim(),
        priority: priority || "medium",
        source: source || "manual",
        sourceTitle: sourceTitle || null,
        status: "pending",
        completedAt: null,
      });
      res.json(todo);
    } catch (error) {
      res.status(500).json({ error: "Failed to create todo" });
    }
  });

  app.patch("/api/omi/todos/:id", requireAuth, async (req, res) => {
    try {
      const validStatuses = ["pending", "done", "dismissed"];
      const status = req.body.status;
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      const updates: any = { status };
      if (status === "done") updates.completedAt = new Date();
      const todo = await storage.updateOmiTodo(req.params.id, updates);
      if (!todo) return res.status(404).json({ error: "Todo not found" });
      res.json(todo);
    } catch (error) {
      res.status(500).json({ error: "Failed to update todo" });
    }
  });

  app.delete("/api/omi/todos/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteOmiTodo(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete todo" });
    }
  });

  // ── Secrets Inventory ──
  app.get("/api/secrets/inventory", requireAuth, async (_req, res) => {
    try {
      const secrets = [
        { key: "DATABASE_URL", category: "core", label: "PostgreSQL Database", usedBy: ["Database connections", "Session store"], required: true },
        { key: "SESSION_SECRET", category: "core", label: "Session Encryption Secret", usedBy: ["Express session encryption"], required: true },
        { key: "APP_BASE_URL", category: "core", label: "Application Base URL", usedBy: ["OAuth callbacks", "Webhook URLs"], required: false },

        { key: "OPENCLAW_DID_BASE_URL", category: "auth", label: "MedInvest DID Base URL", usedBy: ["OAuth 2.0 login"], required: true },
        { key: "OPENCLAW_DID_CLIENT_ID", category: "auth", label: "MedInvest DID Client ID", usedBy: ["OAuth 2.0 login"], required: true },
        { key: "OPENCLAW_DID_SECRET", category: "auth", label: "MedInvest DID Client Secret", usedBy: ["OAuth 2.0 login"], required: true },

        { key: "OPENROUTER_API_KEY", category: "ai", label: "OpenRouter API Key", usedBy: ["LLM chat", "AI Task Runner", "SOP Generator", "Voice Chat"], required: true },
        { key: "OPENAI_API_KEY", category: "ai", label: "OpenAI API Key", usedBy: ["Whisper STT", "TTS voice", "DALL-E images", "Code analysis"], required: true },
        { key: "GEMINI_API_KEY", category: "ai", label: "Google Gemini API Key", usedBy: ["Gemini Proxy", "Image generation fallback"], required: false },
        { key: "ANTHROPIC_API_KEY", category: "ai", label: "Anthropic API Key", usedBy: ["Claude models via OpenRouter"], required: false },
        { key: "PERPLEXITY_API_KEY", category: "ai", label: "Perplexity API Key", usedBy: ["Search-augmented LLM"], required: false },
        { key: "GROQ_API_KEY", category: "ai", label: "Groq API Key", usedBy: ["Fast inference models"], required: false },
        { key: "ELEVENLABS_API_KEY", category: "ai", label: "ElevenLabs API Key", usedBy: ["Voice synthesis"], required: false },

        { key: "GEMINI_PROXY_API_KEY", category: "proxy", label: "Gemini Proxy Auth Token", usedBy: ["Gemini Anti-Gravity Proxy authentication"], required: false },
        { key: "GOOGLE_CLOUD_PROJECT", category: "proxy", label: "Google Cloud Project ID", usedBy: ["Vertex AI endpoint"], required: false },
        { key: "GOOGLE_CLOUD_LOCATION", category: "proxy", label: "Google Cloud Location", usedBy: ["Vertex AI region"], required: false },
        { key: "GCP_SERVICE_ACCOUNT_JSON", category: "proxy", label: "GCP Service Account JSON", usedBy: ["Vertex AI authentication"], required: false },

        { key: "TELEGRAM_BOT_TOKEN", category: "messaging", label: "Telegram Bot Token", usedBy: ["Telegram bot"], required: false },
        { key: "TWILIO_ACCOUNT_SID", category: "messaging", label: "Twilio Account SID", usedBy: ["SMS/WhatsApp via Twilio"], required: false },
        { key: "TWILIO_AUTH_TOKEN", category: "messaging", label: "Twilio Auth Token", usedBy: ["SMS/WhatsApp via Twilio"], required: false },
        { key: "RESEND_API_KEY", category: "messaging", label: "Resend API Key", usedBy: ["Email delivery"], required: false },

        { key: "HOSTINGER_API_KEY", category: "infra", label: "Hostinger API Key", usedBy: ["VPS monitoring", "Firewall management"], required: false },
        { key: "VPS_ROOT_PASSWORD", category: "infra", label: "VPS Root Password", usedBy: ["SSH tunnel agent", "Direct SSH access"], required: false },
        { key: "OPENCLAW_API_KEY", category: "infra", label: "OpenClaw Gateway API Key", usedBy: ["Node heartbeat auth", "Agent script"], required: false },
        { key: "OPENCLAW_GATEWAY_TOKEN", category: "infra", label: "OpenClaw Gateway Token", usedBy: ["Gateway proxy auth"], required: false },

        { key: "REPLIT_SID", category: "replit", label: "Replit Session ID", usedBy: ["Replit project sync", "GraphQL API"], required: false },
        { key: "REPLIT_USERNAME", category: "replit", label: "Replit Username", usedBy: ["Replit project sync", "Profile URL"], required: false },
        { key: "OMI_API_KEY", category: "replit", label: "Omi Wearable API Key", usedBy: ["Omi memories", "SOP Generator", "Todo extraction"], required: false },

        { key: "OPENCLAW_GITHUB_TOKEN", category: "integrations", label: "GitHub Token (OpenClaw)", usedBy: ["GitHub webhooks", "Repo access"], required: false },
        { key: "GITHUB_TOKEN", category: "integrations", label: "GitHub Token (Fallback)", usedBy: ["GitHub API fallback"], required: false },
        { key: "GITHUB_WEBHOOK_SECRET", category: "integrations", label: "GitHub Webhook Secret", usedBy: ["Webhook signature verification"], required: false },
        { key: "NOTION_API_KEY", category: "integrations", label: "Notion API Key", usedBy: ["Notion integration"], required: false },
        { key: "LINEAR_API_KEY", category: "integrations", label: "Linear API Key", usedBy: ["Linear issue tracking"], required: false },
        { key: "HUGGINGFACE_TOKEN", category: "integrations", label: "Hugging Face Token", usedBy: ["Model inference"], required: false },
        { key: "PINECONE_API_KEY", category: "integrations", label: "Pinecone API Key", usedBy: ["Vector database"], required: false },
        { key: "SUPABASE_KEY", category: "integrations", label: "Supabase Key", usedBy: ["Supabase backend"], required: false },
        { key: "AIRTABLE_API_KEY", category: "integrations", label: "Airtable API Key", usedBy: ["Airtable integration"], required: false },
        { key: "ZAPIER_API_KEY", category: "integrations", label: "Zapier API Key", usedBy: ["Zapier automation"], required: false },

        { key: "AWS_ACCESS_KEY_ID", category: "cloud", label: "AWS Access Key ID", usedBy: ["AWS services"], required: false },
        { key: "AWS_SECRET_ACCESS_KEY", category: "cloud", label: "AWS Secret Access Key", usedBy: ["AWS services"], required: false },
        { key: "CLOUDFLARE_API_TOKEN", category: "cloud", label: "Cloudflare API Token", usedBy: ["DNS/CDN management"], required: false },
      ];

      const inventory = secrets.map(s => ({
        ...s,
        isSet: !!process.env[s.key],
        maskedPreview: process.env[s.key]
          ? `${process.env[s.key]!.substring(0, 4)}${"•".repeat(Math.min(20, process.env[s.key]!.length - 4))}`
          : null,
      }));

      const categories = {
        core: "Core Infrastructure",
        auth: "Authentication",
        ai: "AI / LLM Providers",
        proxy: "Gemini Proxy",
        messaging: "Messaging & Communication",
        infra: "VPS & Infrastructure",
        replit: "Replit & Wearables",
        integrations: "Third-Party Integrations",
        cloud: "Cloud Providers",
      };

      const totalSet = inventory.filter(s => s.isSet).length;
      const totalRequired = inventory.filter(s => s.required).length;
      const requiredSet = inventory.filter(s => s.required && s.isSet).length;
      const missingRequired = inventory.filter(s => s.required && !s.isSet);

      res.json({
        inventory,
        categories,
        summary: {
          total: inventory.length,
          configured: totalSet,
          missing: inventory.length - totalSet,
          requiredTotal: totalRequired,
          requiredConfigured: requiredSet,
          missingRequired: missingRequired.map(s => s.key),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch secrets inventory" });
    }
  });

  app.post("/api/secrets/scan-gmail", requireAuth, async (_req, res) => {
    try {
      const { isGmailConfigured, scanEmailsForSecrets } = await import("./gmail");
      if (!isGmailConfigured()) {
        return res.status(400).json({ error: "Gmail integration not configured. Connect Gmail in Replit integrations." });
      }

      const secrets = await scanEmailsForSecrets(50);

      const safe = secrets.map(s => ({
        service: s.service,
        maskedValue: s.maskedValue,
        emailSubject: s.emailSubject,
        emailFrom: s.emailFrom,
        emailDate: s.emailDate,
        emailSnippet: s.emailSnippet,
        messageId: s.messageId,
      }));

      logAudit(`Gmail scan found ${safe.length} potential secrets`, "secrets_scan", undefined, req.session.userId);
      res.json({ found: safe.length, secrets: safe });
    } catch (error: any) {
      console.error("[Gmail Scan] Error:", error.message);
      if (error.message?.includes("not connected") || error.message?.includes("Token")) {
        return res.status(400).json({ error: "Gmail not connected. Please reconnect the Gmail integration." });
      }
      res.status(500).json({ error: "Failed to scan Gmail", details: error.message });
    }
  });

  app.get("/api/secrets/gmail-secret/:messageId", requireAuth, async (req, res) => {
    try {
      const { scanEmailsForSecrets } = await import("./gmail");
      const allSecrets = await scanEmailsForSecrets(100);
      const matching = allSecrets.filter(s => s.messageId === req.params.messageId);
      if (matching.length === 0) {
        return res.status(404).json({ error: "Secret not found in that email" });
      }
      res.json(matching.map(s => ({
        service: s.service,
        value: s.fullValue,
        maskedValue: s.maskedValue,
      })));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch secret details" });
    }
  });

  app.get("/api/secrets/replit-envs", requireAuth, async (_req, res) => {
    try {
      const sid = process.env.REPLIT_SID;
      const username = process.env.REPLIT_USERNAME;
      if (!sid || !username) {
        return res.status(400).json({ error: "REPLIT_SID and REPLIT_USERNAME secrets required for Replit env scanning" });
      }

      const replsResponse = await fetch("https://replit.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `connect.sid=${sid}`,
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          query: `query GetUserRepls($username: String!, $after: String) {
            userByUsername(username: $username) {
              repls(after: $after, count: 50) {
                items {
                  id
                  title
                  slug
                  language
                  url
                }
              }
            }
          }`,
          variables: { username },
        }),
      });

      if (!replsResponse.ok) {
        return res.status(502).json({ error: "Failed to reach Replit API" });
      }

      const replsData = await replsResponse.json();
      const repls = replsData?.data?.userByUsername?.repls?.items || [];

      const results: any[] = [];
      for (const repl of repls.slice(0, 30)) {
        try {
          const envResponse = await fetch("https://replit.com/graphql", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: `connect.sid=${sid}`,
              "X-Requested-With": "XMLHttpRequest",
              "User-Agent": "Mozilla/5.0",
            },
            body: JSON.stringify({
              query: `query GetReplSecrets($id: String!) {
                repl(id: $id) {
                  id
                  title
                  secrets {
                    key
                  }
                }
              }`,
              variables: { id: repl.id },
            }),
          });

          if (envResponse.ok) {
            const envData = await envResponse.json();
            const secrets = envData?.data?.repl?.secrets || [];
            if (secrets.length > 0) {
              results.push({
                id: repl.id,
                title: repl.title,
                slug: repl.slug,
                language: repl.language,
                url: repl.url,
                secretKeys: secrets.map((s: any) => s.key),
                secretCount: secrets.length,
              });
            }
          }
        } catch {}
      }

      res.json({
        totalRepls: repls.length,
        replsWithSecrets: results.length,
        repls: results,
      });
    } catch (error: any) {
      console.error("[Replit Envs] Error:", error.message);
      res.status(500).json({ error: "Failed to scan Replit secrets", details: error.message });
    }
  });

  // ── Omi SOPs ──
  function safeParseJsonArray(val: string | null | undefined): string[] {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function serializeSop(s: any) {
    return {
      ...s,
      steps: safeParseJsonArray(s.steps),
      triggers: safeParseJsonArray(s.triggers),
      tools: safeParseJsonArray(s.tools),
      tips: safeParseJsonArray(s.tips),
      sourceMemoryIds: safeParseJsonArray(s.sourceMemoryIds),
    };
  }

  app.get("/api/omi/sops", requireAuth, async (_req, res) => {
    try {
      const sops = await storage.getOmiSops();
      res.json(sops.map(serializeSop));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SOPs" });
    }
  });

  app.get("/api/omi/sops/:id", requireAuth, async (req, res) => {
    try {
      const sop = await storage.getOmiSop(req.params.id);
      if (!sop) return res.status(404).json({ error: "SOP not found" });
      res.json(serializeSop(sop));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SOP" });
    }
  });

  app.post("/api/omi/sops/generate", requireAuth, async (_req, res) => {
    try {
      const { isOmiConfigured, fetchOmiMemories } = await import("./omi");
      if (!isOmiConfigured()) {
        return res.status(400).json({ error: "OMI_API_KEY not configured" });
      }

      const memories = await fetchOmiMemories(100);
      if (!memories || memories.length === 0) {
        return res.status(400).json({ error: "No Omi memories found. Use your Omi device to record conversations first." });
      }

      const memoryData = memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        tags: m.tags,
        created_at: m.created_at,
      }));

      const { chat } = await import("./bot/openrouter");
      const prompt = `You are an SOP (Standard Operating Procedure) generator. Analyze the following conversation memories from a wearable AI device and generate structured SOPs for recurring processes, workflows, and daily activities you identify.

MEMORIES:
${JSON.stringify(memoryData, null, 2)}

Generate SOPs for EACH distinct process or recurring activity you identify. For each SOP, provide:

Return ONLY a valid JSON array with this structure (no markdown, no extra text):
[
  {
    "title": "Name of the procedure",
    "category": "Category (e.g. medical, business, personal, health, communication, technical)",
    "overview": "Brief 1-2 sentence description of what this procedure covers",
    "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
    "triggers": ["When to start this process - e.g. 'Patient presents with X', 'Weekly on Monday'],
    "frequency": "How often this is done (daily, weekly, as-needed, per-patient, etc.)",
    "tools": ["Tools, equipment, or resources needed"],
    "tips": ["Pro tips, common mistakes to avoid, or efficiency notes"],
    "sourceMemoryIds": ["list of memory IDs that informed this SOP"]
  }
]

Generate at least 3 SOPs if the data supports it. Focus on actionable, practical procedures based on what you observe in the conversations. Be specific with steps — each should be a clear action.`;

      const response = await chat(prompt, "SOP Generator", "sop-generation", []);

      let sops: any[];
      try {
        let text = response.text.trim();
        if (text.startsWith("```")) {
          text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        sops = JSON.parse(text);
      } catch (parseErr) {
        const jsonMatch = response.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          sops = JSON.parse(jsonMatch[0]);
        } else {
          console.error("[SOP] Failed to parse LLM response:", response.text.substring(0, 500));
          return res.status(500).json({ error: "Failed to parse SOP output from AI. Try again." });
        }
      }

      if (!Array.isArray(sops) || sops.length === 0) {
        return res.status(400).json({ error: "AI could not identify any recurring processes from your conversations." });
      }

      const ensureArray = (val: any): string[] => {
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === "string") return [val];
        return [];
      };

      const created: any[] = [];
      for (const sop of sops) {
        if (!sop.title || !sop.steps) continue;
        const steps = ensureArray(sop.steps);
        if (steps.length === 0) continue;
        const triggers = ensureArray(sop.triggers);
        const tools = ensureArray(sop.tools);
        const tips = ensureArray(sop.tips);
        const sourceMemoryIds = ensureArray(sop.sourceMemoryIds);

        const saved = await storage.createOmiSop({
          title: String(sop.title).slice(0, 500),
          category: String(sop.category || "general").slice(0, 100),
          overview: String(sop.overview || "").slice(0, 2000),
          steps: JSON.stringify(steps),
          triggers: triggers.length > 0 ? JSON.stringify(triggers) : null,
          frequency: sop.frequency ? String(sop.frequency).slice(0, 100) : null,
          tools: tools.length > 0 ? JSON.stringify(tools) : null,
          tips: tips.length > 0 ? JSON.stringify(tips) : null,
          sourceMemoryIds: sourceMemoryIds.length > 0 ? JSON.stringify(sourceMemoryIds) : null,
          status: "draft",
        });
        created.push(serializeSop(saved));
      }

      logAudit(`Generated ${created.length} SOPs from Omi memories`, "omi_sop", undefined, req.session.userId);
      res.json({ generated: created.length, sops: created, memoriesAnalyzed: memories.length });
    } catch (error: any) {
      console.error("[SOP] Error:", error.message);
      res.status(500).json({ error: "Failed to generate SOPs", details: error.message });
    }
  });

  app.patch("/api/omi/sops/:id", requireAuth, async (req, res) => {
    try {
      const validStatuses = ["draft", "active", "archived"];
      const updates: any = {};
      if (req.body.status) {
        if (!validStatuses.includes(req.body.status)) {
          return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        updates.status = req.body.status;
      }
      if (req.body.title) updates.title = String(req.body.title).slice(0, 500);
      if (req.body.overview) updates.overview = String(req.body.overview).slice(0, 2000);
      if (req.body.steps && Array.isArray(req.body.steps)) updates.steps = JSON.stringify(req.body.steps);
      if (req.body.category) updates.category = String(req.body.category).slice(0, 100);
      if (req.body.triggers && Array.isArray(req.body.triggers)) updates.triggers = JSON.stringify(req.body.triggers);
      if (req.body.tools && Array.isArray(req.body.tools)) updates.tools = JSON.stringify(req.body.tools);
      if (req.body.tips && Array.isArray(req.body.tips)) updates.tips = JSON.stringify(req.body.tips);
      if (req.body.frequency) updates.frequency = String(req.body.frequency).slice(0, 100);

      const sop = await storage.updateOmiSop(req.params.id, updates);
      if (!sop) return res.status(404).json({ error: "SOP not found" });
      res.json(serializeSop(sop));
    } catch (error) {
      res.status(500).json({ error: "Failed to update SOP" });
    }
  });

  app.delete("/api/omi/sops/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteOmiSop(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete SOP" });
    }
  });

  // ── AI Project Evaluator ──
  app.post("/api/replit-projects/evaluate", requireAuth, async (_req, res) => {
    try {
      const projects = await storage.getReplitProjects();
      if (projects.length === 0) {
        return res.status(400).json({ error: "No projects to evaluate" });
      }

      const projectList = projects.map(p => ({
        title: p.title,
        slug: p.slug,
        description: p.description || "No description",
        language: p.language || "Unknown",
        status: p.status,
        progress: p.progress,
        isPrivate: p.isPrivate,
        hasDeployment: !!p.deploymentUrl,
        deploymentStatus: p.deploymentStatus || "none",
        tags: p.tags || [],
        notes: p.notes || "",
      }));

      const { chat } = await import("./bot/openrouter");
      const prompt = `You are a strategic business advisor for a doctor/entrepreneur (J. Ryan Smolarz, M.D., M.B.A.) who builds tech products. Evaluate each of his Replit projects and help him prioritize his time.

His key goals:
1. REVENUE: Which projects can generate the most money (SaaS, tools, services)?
2. PERSONAL BRAND: Which projects build his professional reputation fastest (as a doctor-entrepreneur)?
3. MARKET INEFFICIENCY: Which projects help identify and exploit market inefficiencies for trading/investing?

Here are his projects:
${JSON.stringify(projectList, null, 2)}

Respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "scores": [
    {
      "slug": "project-slug",
      "title": "Project Title",
      "revenue": {"score": 8, "reason": "brief reason"},
      "brand": {"score": 6, "reason": "brief reason"},
      "trading": {"score": 3, "reason": "brief reason"},
      "timeEstimate": "5 hrs/week",
      "composite": 7.2,
      "nextActions": ["action 1", "action 2", "action 3"]
    }
  ],
  "topPriority": "slug of highest priority project",
  "timeAllocation": "Brief recommendation on how to split time across top 5 projects",
  "overallStrategy": "2-3 sentence strategic recommendation"
}

Score each project 1-10 on revenue, brand, and trading. Composite = weighted average (revenue 40%, brand 30%, trading 30%). Sort scores by composite descending.`;

      const response = await chat(prompt, "System", "project-evaluator");
      let parsed;
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      if (!parsed || !parsed.scores) {
        return res.status(502).json({ error: "Failed to parse AI evaluation", raw: response.text });
      }

      const evaluation = await storage.createProjectEvaluation({
        projectScores: JSON.stringify(parsed.scores),
        recommendations: JSON.stringify({
          topPriority: parsed.topPriority,
          timeAllocation: parsed.timeAllocation,
          overallStrategy: parsed.overallStrategy,
        }),
        evaluatedAt: new Date(),
      });

      logAudit(`AI evaluated ${projects.length} projects`, "replit_project", undefined, _req.session.userId);
      res.json({ evaluation, parsed });
    } catch (error: any) {
      console.error("[Project Evaluate] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const actionType = (req.query.actionType as string) || undefined;
      const [logs, total] = await Promise.all([
        storage.getAuditLogs(page, limit, actionType),
        storage.getAuditLogCount(actionType),
      ]);
      res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ===== AUTOMATION HUB ROUTES =====

  // Health Logs
  app.get("/api/oura/daily-summary", requireAuth, async (_req, res) => {
    try {
      const token = process.env.OURA_API_TOKEN;
      if (!token) {
        return res.json({ configured: false });
      }
      const today = new Date().toISOString().split("T")[0];
      const [sleepRes, readinessRes, activityRes] = await Promise.all([
        fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${today}&end_date=${today}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${today}&end_date=${today}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [sleepData, readinessData, activityData] = await Promise.all([sleepRes.json(), readinessRes.json(), activityRes.json()]);
      const sleep = sleepData?.data?.[0] || null;
      const readiness = readinessData?.data?.[0] || null;
      const activity = activityData?.data?.[0] || null;
      let hrv = null;
      try {
        const hrvRes = await fetch(`https://api.ouraring.com/v2/usercollection/heartrate?start_date=${today}&end_date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
        const hrvData = await hrvRes.json();
        if (hrvData?.data?.length) {
          const bpms = hrvData.data.map((d: any) => d.bpm).filter(Boolean);
          hrv = { average: bpms.length ? Math.round(bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length) : null };
        }
      } catch {}
      res.json({ configured: true, sleep: sleep ? { score: sleep.score } : null, readiness: readiness ? { score: readiness.score } : null, activity: activity ? { score: activity.score } : null, hrv });
    } catch (e: any) {
      res.json({ configured: true, error: e.message });
    }
  });

  app.get("/api/health-logs", requireAuth, async (_req, res) => {
    try { res.json(await storage.getHealthLogs()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/health-logs/date/:date", requireAuth, async (req, res) => {
    try { const log = await storage.getHealthLogByDate(req.params.date); res.json(log || null); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/health-logs", requireAuth, async (req, res) => {
    try { const data = insertHealthLogSchema.parse(req.body); res.json(await storage.createHealthLog(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/health-logs/:id", requireAuth, async (req, res) => {
    try { const data = insertHealthLogSchema.partial().parse(req.body); const log = await storage.updateHealthLog(req.params.id, data); if (!log) return res.status(404).json({ error: "Not found" }); res.json(log); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Grocery Items
  app.get("/api/grocery-items", requireAuth, async (_req, res) => {
    try { res.json(await storage.getGroceryItems()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/grocery-items", requireAuth, async (req, res) => {
    try { const data = insertGroceryItemSchema.parse(req.body); res.json(await storage.createGroceryItem(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/grocery-items/:id", requireAuth, async (req, res) => {
    try { const data = insertGroceryItemSchema.partial().parse(req.body); const item = await storage.updateGroceryItem(req.params.id, data); if (!item) return res.status(404).json({ error: "Not found" }); res.json(item); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/grocery-items/:id", requireAuth, async (req, res) => {
    try { await storage.deleteGroceryItem(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/grocery-items/ai-suggest", requireAuth, async (req, res) => {
    try {
      const { mealPlan } = req.body;
      if (!mealPlan) return res.status(400).json({ error: "mealPlan required" });
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No AI API key configured" });
      const isOpenRouter = !process.env.OPENAI_API_KEY;
      const response = await fetch(isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini", messages: [{ role: "system", content: "Generate a grocery list from this meal plan. Return ONLY a JSON array of objects with {name, quantity, category}. Categories: Produce, Dairy, Meat, Bakery, Frozen, Pantry, Beverages, Other." }, { role: "user", content: mealPlan }], temperature: 0.3 }),
      });
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || "[]";
      const match = text.match(/\[[\s\S]*\]/);
      const items = match ? JSON.parse(match[0]) : [];
      res.json(items);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Financial Transactions
  app.get("/api/financial-transactions", requireAuth, async (_req, res) => {
    try { res.json(await storage.getFinancialTransactions()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/financial-transactions", requireAuth, async (req, res) => {
    try { const data = insertFinancialTransactionSchema.parse(req.body); res.json(await storage.createFinancialTransaction(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/financial-transactions/:id", requireAuth, async (req, res) => {
    try { await storage.deleteFinancialTransaction(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Habits
  app.get("/api/habits", requireAuth, async (_req, res) => {
    try { res.json(await storage.getHabits()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/habits", requireAuth, async (req, res) => {
    try { const data = insertHabitSchema.parse(req.body); res.json(await storage.createHabit(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/habits/:id", requireAuth, async (req, res) => {
    try { await storage.deleteHabit(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/habit-completions", requireAuth, async (req, res) => {
    try { const habitId = req.query.habitId as string | undefined; res.json(await storage.getHabitCompletions(habitId)); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/habit-completions", requireAuth, async (req, res) => {
    try { const data = insertHabitCompletionSchema.parse(req.body); res.json(await storage.createHabitCompletion(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/habit-completions/:id", requireAuth, async (req, res) => {
    try { await storage.deleteHabitCompletion(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/habits/analyze-omi", requireAuth, async (_req, res) => {
    try {
      const { fetchOmiMemories, isOmiConfigured } = await import("./omi");
      if (!isOmiConfigured()) return res.status(400).json({ error: "OMI_API_KEY not configured" });
      const memories = await fetchOmiMemories(50);
      if (!memories || memories.length === 0) return res.json({ habits: [], timeBlocks: [], insights: "" });

      const conversationSummaries = memories.map((m: any, i: number) => {
        const title = m.structured?.title || m.structured?.overview || `Conversation ${i + 1}`;
        const transcript = m.transcript_segments?.map((s: any) => `${s.speaker || "Speaker"}: ${s.text}`).join("\n") || m.structured?.overview || "";
        const duration = m.structured?.duration_minutes || "";
        const startTime = m.started_at || m.created_at || "";
        return `### ${title} (${startTime}${duration ? `, ~${duration}min` : ""})\n${transcript.substring(0, 600)}`;
      }).join("\n\n");

      const { chat } = await import("./bot/openrouter");
      const prompt = `You are analyzing conversations from an AI wearable device to identify the user's daily routines and habits. Break down what they do in 15-minute increments where possible.

Here are the recent conversations:
${conversationSummaries}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "habits": [
    {"name": "habit description", "frequency": "daily|weekly", "category": "health|work|social|personal|routine", "timeOfDay": "morning|afternoon|evening|night", "confidence": "high|medium|low"}
  ],
  "timeBlocks": [
    {"time": "HH:MM", "duration": 15, "activity": "what they do", "category": "health|work|social|personal|routine"}
  ],
  "insights": "2-3 sentences about patterns noticed in their daily routine"
}`;

      const response = await chat(prompt, "System", "habit-analyzer");
      let parsed;
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { habits: [], timeBlocks: [], insights: "" };
      } catch {
        parsed = { habits: [], timeBlocks: [], insights: response.text };
      }

      const created = [];
      for (const h of (parsed.habits || [])) {
        const existing = await storage.getHabits();
        const alreadyExists = existing.some(e => e.name.toLowerCase() === h.name.toLowerCase());
        if (!alreadyExists) {
          const habit = await storage.createHabit({
            name: h.name,
            frequency: h.frequency || "daily",
            category: h.category || "routine",
            target: 1,
          });
          created.push(habit);
        }
      }

      res.json({ ...parsed, createdCount: created.length });
    } catch (e: any) {
      console.error("[Habits] Omi analysis error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Google Calendar
  app.get("/api/google-calendar/events", requireAuth, async (req, res) => {
    try {
      const { getUpcomingEvents } = await import("./googleCalendar");
      const maxResults = parseInt(req.query.maxResults as string) || 20;
      const events = await getUpcomingEvents(maxResults);
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/google-calendar/today", requireAuth, async (_req, res) => {
    try {
      const { getTodayEvents } = await import("./googleCalendar");
      const events = await getTodayEvents();
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/google-calendar/range", requireAuth, async (req, res) => {
    try {
      const { getEventsForRange } = await import("./googleCalendar");
      const timeMin = req.query.timeMin as string;
      const timeMax = req.query.timeMax as string;
      if (!timeMin || !timeMax) return res.status(400).json({ error: "timeMin and timeMax required" });
      const events = await getEventsForRange(timeMin, timeMax);
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/google-calendar/sync-to-life-events", requireAuth, async (_req, res) => {
    try {
      const { getUpcomingEvents } = await import("./googleCalendar");
      const events = await getUpcomingEvents(50);
      const existingLifeEvents = await storage.getLifeEvents();
      let synced = 0;
      for (const gcalEvent of events) {
        const title = gcalEvent.summary || "Untitled Event";
        const start = gcalEvent.start?.dateTime || gcalEvent.start?.date || "";
        const dateStr = start.substring(0, 10);
        const alreadyExists = existingLifeEvents.some(
          (e: any) => e.title === title && e.date === dateStr
        );
        if (!alreadyExists && dateStr) {
          await storage.createLifeEvent({
            title,
            description: gcalEvent.description || "",
            date: dateStr,
            endDate: gcalEvent.end?.dateTime?.substring(0, 10) || gcalEvent.end?.date || null,
            category: "work",
            color: null,
          });
          synced++;
        }
      }
      res.json({ synced, total: events.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/meeting-reminder", requireAuth, async (req, res) => {
    try {
      const { meetingTitle, meetingTime, methods, wifePhone } = req.body;
      if (!meetingTitle) return res.status(400).json({ error: "meetingTitle required" });
      const results: { method: string; status: string; error?: string }[] = [];

      if (methods?.includes("whatsapp") && wifePhone) {
        try {
          const { whatsappBot } = await import("./bot/whatsapp");
          const jid = wifePhone.replace("+", "") + "@s.whatsapp.net";
          await whatsappBot.sendMessage(
            jid,
            `Hey! Just a reminder - Ryan has a meeting: "${meetingTitle}" at ${meetingTime || "soon"}. Can you make sure he's ready?`
          );
          results.push({ method: "whatsapp", status: "sent" });
        } catch (e: any) {
          results.push({ method: "whatsapp", status: "failed", error: e.message });
        }
      }

      if (methods?.includes("email")) {
        try {
          const { getUncachableGmailClient } = await import("./gmail");
          const gmail = await getUncachableGmailClient();
          const userEmail = "rsmolarz@rsmolarz.com";
          const raw = Buffer.from(
            `From: ${userEmail}\r\nTo: ${userEmail}\r\nSubject: Meeting Reminder: ${meetingTitle}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nReminder: You have a meeting "${meetingTitle}" at ${meetingTime || "soon"}. Don't forget!`
          ).toString("base64url");
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          results.push({ method: "email", status: "sent" });
        } catch (e: any) {
          results.push({ method: "email", status: "failed", error: e.message });
        }
      }

      if (methods?.includes("whatsapp_self")) {
        try {
          const { whatsappBot } = await import("./bot/whatsapp");
          const status = whatsappBot.getStatus();
          if (status.phone) {
            const selfJid = status.phone.replace("+", "") + "@s.whatsapp.net";
            await whatsappBot.sendMessage(
              selfJid,
              `MEETING REMINDER: "${meetingTitle}" at ${meetingTime || "soon"}. Get ready!`
            );
            results.push({ method: "whatsapp_self", status: "sent" });
          } else {
            results.push({ method: "whatsapp_self", status: "failed", error: "WhatsApp not connected" });
          }
        } catch (e: any) {
          results.push({ method: "whatsapp_self", status: "failed", error: e.message });
        }
      }

      res.json({ results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Meeting Preps
  app.get("/api/meeting-preps", requireAuth, async (_req, res) => {
    try { res.json(await storage.getMeetingPreps()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/meeting-preps/:id", requireAuth, async (req, res) => {
    try { const prep = await storage.getMeetingPrep(req.params.id); if (!prep) return res.status(404).json({ error: "Not found" }); res.json(prep); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/meeting-preps", requireAuth, async (req, res) => {
    try { const data = insertMeetingPrepSchema.parse(req.body); res.json(await storage.createMeetingPrep(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/meeting-preps/:id", requireAuth, async (req, res) => {
    try { await storage.deleteMeetingPrep(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/meeting-preps/generate", requireAuth, async (req, res) => {
    try {
      const { subject, attendeeName, attendeeCompany } = req.body;
      if (!subject) return res.status(400).json({ error: "subject required" });
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No AI API key configured" });
      const isOpenRouter = !process.env.OPENAI_API_KEY;
      const response = await fetch(isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini", messages: [{ role: "system", content: "Generate a meeting preparation brief. Return JSON: {backgroundBrief: string, talkingPoints: string[], questions: string[], objections: [{objection: string, response: string}]}" }, { role: "user", content: `Meeting: ${subject}${attendeeName ? `\nAttendee: ${attendeeName}` : ""}${attendeeCompany ? ` from ${attendeeCompany}` : ""}` }], temperature: 0.5 }),
      });
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || "{}";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      const prep = await storage.createMeetingPrep({
        subject,
        attendeeName: attendeeName || null,
        attendeeCompany: attendeeCompany || null,
        backgroundBrief: parsed.backgroundBrief || "",
        talkingPoints: JSON.stringify(parsed.talkingPoints || []),
        questions: JSON.stringify(parsed.questions || []),
        objections: JSON.stringify(parsed.objections || []),
      });
      res.json(prep);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Focus Sessions
  app.get("/api/focus-sessions", requireAuth, async (_req, res) => {
    try { res.json(await storage.getFocusSessions()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/focus-sessions", requireAuth, async (req, res) => {
    try { const data = insertFocusSessionSchema.parse(req.body); res.json(await storage.createFocusSession(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Life Events
  app.get("/api/life-events", requireAuth, async (_req, res) => {
    try { res.json(await storage.getLifeEvents()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/life-events", requireAuth, async (req, res) => {
    try { const data = insertLifeEventSchema.parse(req.body); res.json(await storage.createLifeEvent(data)); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.patch("/api/life-events/:id", requireAuth, async (req, res) => {
    try { const data = insertLifeEventSchema.partial().parse(req.body); const event = await storage.updateLifeEvent(req.params.id, data); if (!event) return res.status(404).json({ error: "Not found" }); res.json(event); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.delete("/api/life-events/:id", requireAuth, async (req, res) => {
    try { await storage.deleteLifeEvent(req.params.id); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Home Automation (Home Assistant proxy)
  app.get("/api/home-automation/states", requireAuth, async (_req, res) => {
    try {
      const hassToken = process.env.HASS_TOKEN;
      const hassUrl = process.env.HASS_URL || "http://homeassistant.local:8123";
      if (!hassToken) return res.json({ configured: false, states: [] });
      const response = await fetch(`${hassUrl}/api/states`, { headers: { Authorization: `Bearer ${hassToken}`, "Content-Type": "application/json" } });
      if (!response.ok) return res.status(response.status).json({ error: "Home Assistant returned " + response.status });
      const states = await response.json();
      res.json({ configured: true, states });
    } catch (e: any) { res.json({ configured: false, error: e.message, states: [] }); }
  });
  app.post("/api/home-automation/toggle", requireAuth, async (req, res) => {
    try {
      const { entityId } = req.body;
      const hassToken = process.env.HASS_TOKEN;
      const hassUrl = process.env.HASS_URL || "http://homeassistant.local:8123";
      if (!hassToken) return res.status(400).json({ error: "HASS_TOKEN not configured" });
      const domain = entityId.split(".")[0];
      const response = await fetch(`${hassUrl}/api/services/${domain}/toggle`, { method: "POST", headers: { Authorization: `Bearer ${hassToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: entityId }) });
      if (!response.ok) return res.status(response.status).json({ error: "Toggle failed" });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // SOP Library AI generate
  app.post("/api/sop-library/generate", requireAuth, async (req, res) => {
    try {
      const { title, description } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "No AI API key configured" });
      const isOpenRouter = !process.env.OPENAI_API_KEY;
      const response = await fetch(isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini", messages: [{ role: "system", content: "Generate a Standard Operating Procedure (SOP). Return JSON: {title: string, category: string, overview: string, steps: [{step: number, title: string, description: string}]}" }, { role: "user", content: `SOP Title: ${title}${description ? `\nDescription: ${description}` : ""}` }], temperature: 0.4 }),
      });
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || "{}";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      res.json(parsed);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Zoom Integration
  app.get("/api/zoom/status", requireAuth, async (_req, res) => {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    res.json({ configured: !!(accountId && clientId && clientSecret) });
  });

  async function getZoomAccessToken(): Promise<string> {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    if (!accountId || !clientId || !clientSecret) throw new Error("Zoom credentials not configured");
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const resp = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=account_credentials&account_id=${accountId}`,
    });
    if (!resp.ok) throw new Error(`Zoom auth failed: ${resp.status}`);
    const data = await resp.json() as any;
    return data.access_token;
  }

  app.get("/api/zoom/meetings", requireAuth, async (req, res) => {
    try {
      const token = await getZoomAccessToken();
      const type = (req.query.type as string) || "upcoming";
      const resp = await fetch(`https://api.zoom.us/v2/users/me/meetings?type=${type}&page_size=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Zoom API error: ${resp.status}`);
      const data = await resp.json();
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/zoom/meetings", requireAuth, async (req, res) => {
    try {
      const token = await getZoomAccessToken();
      const { topic, startTime, duration, agenda, type: meetingType } = req.body;
      if (!topic) return res.status(400).json({ error: "topic required" });
      const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          type: meetingType || 2,
          start_time: startTime || new Date(Date.now() + 3600000).toISOString(),
          duration: duration || 30,
          agenda: agenda || "",
          settings: { join_before_host: true, waiting_room: false, auto_recording: "none" },
        }),
      });
      if (!resp.ok) throw new Error(`Zoom create meeting error: ${resp.status}`);
      const meeting = await resp.json();
      res.json(meeting);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/zoom/meetings/:meetingId", requireAuth, async (req, res) => {
    try {
      const token = await getZoomAccessToken();
      const resp = await fetch(`https://api.zoom.us/v2/meetings/${req.params.meetingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok && resp.status !== 204) throw new Error(`Zoom delete error: ${resp.status}`);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Microsoft Teams / Outlook Integration
  app.get("/api/teams/status", requireAuth, async (_req, res) => {
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    const tenantId = process.env.MS_TENANT_ID;
    res.json({ configured: !!(clientId && clientSecret && tenantId) });
  });

  async function getMSGraphToken(): Promise<string> {
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    const tenantId = process.env.MS_TENANT_ID;
    if (!clientId || !clientSecret || !tenantId) throw new Error("Microsoft credentials not configured");
    const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}&scope=https://graph.microsoft.com/.default`,
    });
    if (!resp.ok) throw new Error(`MS auth failed: ${resp.status}`);
    const data = await resp.json() as any;
    return data.access_token;
  }

  app.get("/api/teams/meetings", requireAuth, async (_req, res) => {
    try {
      const token = await getMSGraphToken();
      const userId = process.env.MS_USER_ID || "me";
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 7 * 86400000).toISOString();
      const resp = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${now}&endDateTime=${future}&$top=30&$orderby=start/dateTime&$filter=isOnlineMeeting eq true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) throw new Error(`MS Graph error: ${resp.status}`);
      const data = await resp.json();
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/teams/meetings", requireAuth, async (req, res) => {
    try {
      const token = await getMSGraphToken();
      const userId = process.env.MS_USER_ID || "me";
      const { subject, startTime, endTime, body: meetingBody, attendees } = req.body;
      if (!subject) return res.status(400).json({ error: "subject required" });
      const start = startTime || new Date(Date.now() + 3600000).toISOString();
      const end = endTime || new Date(new Date(start).getTime() + 1800000).toISOString();
      const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body: { contentType: "text", content: meetingBody || "" },
          start: { dateTime: start, timeZone: "UTC" },
          end: { dateTime: end, timeZone: "UTC" },
          isOnlineMeeting: true,
          onlineMeetingProvider: "teamsForBusiness",
          attendees: (attendees || []).map((email: string) => ({
            emailAddress: { address: email },
            type: "required",
          })),
        }),
      });
      if (!resp.ok) throw new Error(`MS Graph create error: ${resp.status}`);
      const event = await resp.json();
      res.json(event);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/teams/meetings/:eventId", requireAuth, async (req, res) => {
    try {
      const token = await getMSGraphToken();
      const userId = process.env.MS_USER_ID || "me";
      const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}/events/${req.params.eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok && resp.status !== 204) throw new Error(`MS Graph delete error: ${resp.status}`);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Daily Briefing
  app.get("/api/daily-briefing", requireAuth, async (_req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.json({ actionPlan: "Configure an AI API key to get your daily briefing.", quote: "The journey of a thousand miles begins with a single step." });
      const isOpenRouter = !process.env.OPENAI_API_KEY;
      const [machines, projects] = await Promise.all([storage.getMachines(), storage.getReplitProjects()]);
      const context = `Machines: ${machines.length} nodes (${machines.filter(m => m.status === "online").length} online). Projects: ${projects.length} total. Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
      const response = await fetch(isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini", messages: [{ role: "system", content: "Generate a short morning briefing for an AI agent operator. Return JSON: {actionPlan: string (3-5 action items as numbered list), quote: string (motivational quote)}" }, { role: "user", content: context }], temperature: 0.7 }),
      });
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || "{}";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { actionPlan: "Start your day strong!", quote: "Every expert was once a beginner." };
      res.json(parsed);
    } catch (e: any) { res.json({ actionPlan: "Error generating briefing: " + e.message, quote: "Keep going." }); }
  });

  app.post("/api/replit-projects/orchestrate", requireAuth, async (req, res) => {
    try {
      const { prompt, projectIds, scope } = req.body;
      if (!prompt) return res.status(400).json({ error: "prompt is required" });
      const allProjects = await storage.getReplitProjects();
      const selected = projectIds?.length
        ? allProjects.filter(p => projectIds.includes(p.id))
        : scope === "active" ? allProjects.filter(p => p.status === "active")
        : scope === "deployed" ? allProjects.filter(p => p.deploymentUrl)
        : allProjects;
      if (selected.length === 0) return res.status(400).json({ error: "No projects matched the selection" });

      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(400).json({ error: "No AI API key configured" });
      const isOpenRouter = !process.env.OPENAI_API_KEY;

      const projectContext = selected.map(p => `- ${p.title} (${p.slug}): ${p.language || "unknown"} | status=${p.status} | ${p.description || "no description"} | url=${p.url}`).join("\n");

      const response = await fetch(isOpenRouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: isOpenRouter ? "openai/gpt-4o" : "gpt-4o",
          messages: [
            { role: "system", content: `You are an expert software architect. The user manages multiple Replit projects and wants to apply a change across them. Analyze the request and generate a detailed implementation plan for EACH project.

Return valid JSON:
{
  "summary": "Brief summary of what will be done",
  "plans": [
    {
      "projectSlug": "slug",
      "projectTitle": "title",
      "applicable": true/false,
      "reason": "Why this project is/isn't applicable",
      "steps": ["step 1", "step 2"],
      "estimatedEffort": "low/medium/high",
      "filesLikelyAffected": ["file1.ts", "file2.tsx"],
      "codeSnippet": "Optional: key code change if straightforward"
    }
  ],
  "sharedPattern": "Common pattern or code that applies to all applicable projects",
  "risks": ["potential risk 1"],
  "order": "Recommended order of implementation"
}` },
            { role: "user", content: `Projects:\n${projectContext}\n\nRequest: ${prompt}` }
          ],
          temperature: 0.3,
        }),
      });
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || "{}";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { summary: "Failed to generate plan", plans: [] };
      res.json({ orchestration: parsed, projectCount: selected.length, projectNames: selected.map(p => p.title) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
