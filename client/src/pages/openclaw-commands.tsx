import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useInstance } from "@/hooks/use-instance";
import { useQuery } from "@tanstack/react-query";
import {
  Terminal,
  Copy,
  Check,
  Download,
  Server,
  Settings,
  Cpu,
  Shield,
  Stethoscope,
  Play,
  Square,
  RotateCcw,
  Eye,
  Wrench,
  Globe,
  Rocket,
  BookOpen,
} from "lucide-react";
import { useState } from "react";

interface CommandItem {
  title: string;
  command: string;
  description: string;
  flags?: string[];
  ssh?: string | null;
  important?: boolean;
}

interface CommandCategory {
  title: string;
  icon: React.ReactNode;
  description: string;
  commands: CommandItem[];
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs gap-1"
      data-testid={`button-copy-${label || "cmd"}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: "Copied!", description: "Command copied to clipboard." });
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function CommandBlock({ cmd, ssh, label }: { cmd: string; ssh?: string | null; label?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 font-mono text-xs border">
        <code className="break-all select-all" data-testid={`code-${label || "cmd"}`}>{cmd}</code>
        <CopyButton text={cmd} label={label} />
      </div>
      {ssh && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 font-mono text-xs border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 break-all">
            <Badge variant="outline" className="text-[10px] shrink-0">SSH</Badge>
            <code className="select-all">{ssh}</code>
          </div>
          <CopyButton text={ssh} label={`${label}-ssh`} />
        </div>
      )}
    </div>
  );
}

const installCommands: CommandCategory = {
  title: "Installation",
  icon: <Download className="h-4 w-4" />,
  description: "Install OpenClaw CLI on your server. Requires Node.js 22+.",
  commands: [
    {
      title: "Install OpenClaw CLI",
      command: "curl -fsSL https://get.openclaw.ai | bash",
      description: "One-line installer. Downloads and installs the latest OpenClaw CLI. For Windows, use WSL2 — PowerShell doesn't support the -fsSL flags.",
      important: true,
    },
    {
      title: "Install via npm",
      command: "npm install -g openclaw@latest",
      description: "Alternative: install directly via npm (requires Node.js 22+).",
    },
    {
      title: "Install via pnpm",
      command: "pnpm add -g openclaw@latest",
      description: "Alternative: install using pnpm package manager.",
    },
    {
      title: "Update OpenClaw",
      command: "openclaw update",
      description: "Update OpenClaw to the latest version.",
    },
  ],
};

const onboardingCommands: CommandCategory = {
  title: "Onboarding & Setup",
  icon: <Rocket className="h-4 w-4" />,
  description: "Initial setup and configuration wizard.",
  commands: [
    {
      title: "Interactive Onboarding",
      command: "openclaw onboard",
      description: "Full interactive setup wizard. Configures model auth, gateway settings, channels (Telegram, WhatsApp, Slack, Discord), workspace, and skills.",
      important: true,
    },
    {
      title: "Non-Interactive Onboarding",
      command: "openclaw onboard --non-interactive --accept-risk --mode local --auth-choice apiKey --openrouter-api-key \"YOUR_KEY\" --gateway-port 18789 --gateway-bind loopback",
      description: "Automated setup for scripts and CI. Set your provider, API key, port, and bind mode without prompts.",
      flags: ["--non-interactive", "--accept-risk", "--mode", "--auth-choice", "--gateway-port", "--gateway-bind"],
    },
    {
      title: "Skip Onboarding (Install Only)",
      command: "openclaw onboard --no-onboard",
      description: "Install dependencies without running the onboarding wizard. Useful for manual configuration.",
    },
  ],
};

const gatewayCommands: CommandCategory = {
  title: "Gateway Service",
  icon: <Server className="h-4 w-4" />,
  description: "Manage the OpenClaw gateway service lifecycle. The gateway is the main process that handles all communication.",
  commands: [
    {
      title: "Install Gateway Service",
      command: "openclaw gateway install",
      description: "Installs gateway as a supervised background service. Creates systemd service on Linux, launchd plist on macOS. Auto-generates a gateway token in ~/.openclaw/openclaw.json.",
      important: true,
    },
    {
      title: "Start Gateway",
      command: "openclaw gateway start",
      description: "Starts the gateway service. No-op if already running.",
    },
    {
      title: "Stop Gateway",
      command: "openclaw gateway stop",
      description: "Stops the gateway service (sends SIGTERM).",
    },
    {
      title: "Restart Gateway",
      command: "openclaw gateway restart",
      description: "Restarts the gateway service. Use after config changes.",
      important: true,
    },
    {
      title: "Gateway Status",
      command: "openclaw gateway status",
      description: "Shows gateway runtime status: PID, bind address, port, RPC probe results, and config differences.",
    },
    {
      title: "Probe Gateway",
      command: "openclaw gateway probe",
      description: "Quick health check to verify the gateway is responding.",
    },
    {
      title: "Run in Foreground",
      command: "openclaw gateway run",
      description: "Runs gateway in foreground mode for development/debugging. Not supervised.",
      flags: ["--port <port>", "--bind <loopback|lan|tailnet|auto|custom>", "--allow-unconfigured"],
    },
    {
      title: "Uninstall Gateway Service",
      command: "openclaw gateway uninstall",
      description: "Removes the gateway service definition from the system supervisor.",
    },
    {
      title: "Discover Gateways (mDNS)",
      command: "openclaw gateway discover",
      description: "Scans for gateway instances via mDNS/DNS-SD. Shows reachability, latency, and version.",
    },
  ],
};

const configCommands: CommandCategory = {
  title: "Configuration",
  icon: <Settings className="h-4 w-4" />,
  description: "Read and modify OpenClaw config (stored in ~/.openclaw/openclaw.json). Changes hot-reload automatically.",
  commands: [
    {
      title: "List All Config",
      command: "openclaw config list",
      description: "Show all current configuration values.",
    },
    {
      title: "Get a Config Value",
      command: "openclaw config get gateway.port",
      description: "Read a specific config key using dot notation.",
    },
    {
      title: "Set Gateway Mode",
      command: "openclaw config set gateway.mode local",
      description: "Set the gateway mode (local or remote).",
      important: true,
    },
    {
      title: "Set Gateway Port",
      command: "openclaw config set gateway.port 18789",
      description: "Change the WebSocket port (default: 18789).",
    },
    {
      title: "Set Gateway Bind",
      command: "openclaw config set gateway.bind loopback",
      description: "Set bind mode: loopback (localhost only), lan (all interfaces), tailnet, auto, or custom.",
    },
    {
      title: "Set Token Auth",
      command: "openclaw config set gateway.auth.mode token",
      description: "Enable token-based authentication for gateway access.",
    },
  ],
};

const nodeCommands: CommandCategory = {
  title: "Nodes",
  icon: <Cpu className="h-4 w-4" />,
  description: "Manage paired nodes (devices connected to your gateway).",
  commands: [
    {
      title: "List Nodes",
      command: "openclaw nodes list",
      description: "Lists all paired nodes (iOS, Android, desktop, etc.).",
    },
    {
      title: "Approve a Node",
      command: "openclaw nodes approve <node-id>",
      description: "Approves a pending node pairing request.",
    },
  ],
};

const diagnosticCommands: CommandCategory = {
  title: "Diagnostics & Logs",
  icon: <Stethoscope className="h-4 w-4" />,
  description: "Health checks, troubleshooting, and log access.",
  commands: [
    {
      title: "Run Doctor",
      command: "openclaw doctor",
      description: "Comprehensive health check: config validation, state migrations, service audits, security checks. Auto-fixes common issues.",
      important: true,
    },
    {
      title: "Health Check",
      command: "openclaw health",
      description: "Quick gateway health check.",
    },
    {
      title: "View Logs",
      command: "openclaw logs",
      description: "Stream or tail gateway logs.",
    },
    {
      title: "Check Model Status",
      command: "openclaw models status --json",
      description: "Verify that your LLM provider is registered and working.",
    },
  ],
};

const securityCommands: CommandCategory = {
  title: "Security",
  icon: <Shield className="h-4 w-4" />,
  description: "Best practices for securing your OpenClaw installation.",
  commands: [
    {
      title: "Protect Config File",
      command: "chmod 600 ~/.openclaw/openclaw.json",
      description: "Restrict config file permissions to owner-only read/write.",
      important: true,
    },
    {
      title: "Bind to Loopback Only",
      command: "openclaw config set gateway.bind loopback",
      description: "Restrict gateway to localhost. Use SSH tunnel or Tailscale for remote access.",
    },
    {
      title: "Enable Token Auth",
      command: "openclaw config set gateway.auth.mode token",
      description: "Require token authentication for all gateway connections.",
    },
  ],
};

const quickStartSteps: CommandItem[] = [
  {
    title: "Step 1: Install OpenClaw",
    command: "curl -fsSL https://get.openclaw.ai | bash",
    description: "Install the OpenClaw CLI on your VPS.",
    important: true,
  },
  {
    title: "Step 2: Run Onboarding",
    command: "openclaw onboard",
    description: "Interactive setup wizard — configures your API key, gateway, and channels.",
    important: true,
  },
  {
    title: "Step 3: Install Gateway Service",
    command: "openclaw gateway install",
    description: "Installs the gateway as a background service (systemd). Auto-generates a gateway token.",
    important: true,
  },
  {
    title: "Step 4: Start & Verify",
    command: "openclaw gateway restart && openclaw gateway probe",
    description: "Start the gateway and verify it's responding.",
    important: true,
  },
  {
    title: "Step 5: Get Your Gateway Token",
    command: "cat ~/.openclaw/openclaw.json | grep token",
    description: "Find your auto-generated 48-character hex gateway token for dashboard access.",
    important: true,
  },
  {
    title: "Step 6: Access Dashboard",
    command: "http://localhost:18789/?token=YOUR_TOKEN",
    description: "Open the native OpenClaw dashboard. For remote access, use SSH tunnel: ssh -N -L 18789:127.0.0.1:18789 user@your-server",
  },
];

const allCategories: CommandCategory[] = [
  installCommands,
  onboardingCommands,
  gatewayCommands,
  configCommands,
  nodeCommands,
  diagnosticCommands,
  securityCommands,
];

export default function OpenClawCommands() {
  const { toast } = useToast();
  const { selectedInstanceId } = useInstance();

  const { data: vpsData } = useQuery<any>({
    queryKey: [`/api/vps?instanceId=${selectedInstanceId ?? ""}`],
    enabled: !!selectedInstanceId,
  });

  const sshUser = vpsData?.sshUser || "root";
  const sshHost = vpsData?.vpsIp || "";
  const sshPort = vpsData?.vpsPort || 22;
  const sshPrefix = sshHost ? `ssh ${sshPort !== 22 ? `-p ${sshPort} ` : ""}${sshUser}@${sshHost}` : "";

  const addSsh = (cmd: string): string | null => {
    if (!sshPrefix) return null;
    return `${sshPrefix} "${cmd}"`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">OpenClaw Commands</h1>
        <p className="text-muted-foreground mt-1">
          Complete CLI reference for managing your OpenClaw gateway.
          {sshHost && (
            <span className="ml-2">
              <Badge variant="outline" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                VPS: {sshUser}@{sshHost}
              </Badge>
            </span>
          )}
        </p>
      </div>

      <Tabs defaultValue="quickstart" className="w-full">
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-commands">
          <TabsTrigger value="quickstart" data-testid="tab-quickstart">
            <Rocket className="h-4 w-4 mr-1.5" /> Quick Start
          </TabsTrigger>
          <TabsTrigger value="reference" data-testid="tab-reference">
            <BookOpen className="h-4 w-4 mr-1.5" /> Full Reference
          </TabsTrigger>
          <TabsTrigger value="troubleshoot" data-testid="tab-troubleshoot">
            <Wrench className="h-4 w-4 mr-1.5" /> Troubleshoot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4" /> Quick Start Guide
              </CardTitle>
              <CardDescription>
                Get your OpenClaw gateway connected and running in minutes. Follow these steps in order on your VPS.
                {!sshHost && (
                  <span className="block mt-1 text-yellow-600 dark:text-yellow-400">
                    Tip: Set up your VPS connection in Settings → VPS Connection to get ready-to-use SSH commands.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {quickStartSteps.map((step, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <h3 className="text-sm font-semibold" data-testid={`text-quickstart-step-${idx}`}>{step.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground ml-8">{step.description}</p>
                  <div className="ml-8">
                    <CommandBlock cmd={step.command} ssh={addSsh(step.command)} label={`quickstart-${idx}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" /> Config File Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                All OpenClaw configuration is stored in a single JSON file. The gateway watches this file and hot-reloads changes automatically.
              </p>
              <CommandBlock cmd="~/.openclaw/openclaw.json" label="config-path" />
              <div className="bg-muted/30 rounded-md p-3 text-xs space-y-1 border">
                <p className="font-medium">Key config sections:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li><code className="text-xs">gateway.mode</code> — "local" or "remote"</li>
                  <li><code className="text-xs">gateway.port</code> — WebSocket port (default: 18789)</li>
                  <li><code className="text-xs">gateway.bind</code> — loopback, lan, tailnet, auto, custom</li>
                  <li><code className="text-xs">gateway.auth.mode</code> — "token" recommended</li>
                  <li><code className="text-xs">gateway.auth.token</code> — 48-char hex (auto-generated)</li>
                  <li><code className="text-xs">channels.*</code> — Telegram, WhatsApp, Slack, Discord config</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reference" className="space-y-4 mt-4">
          {allCategories.map((cat, catIdx) => (
            <Card key={catIdx}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {cat.icon} {cat.title}
                </CardTitle>
                <CardDescription>{cat.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cat.commands.map((cmd, cmdIdx) => (
                  <div key={cmdIdx} className={`rounded-lg p-3 space-y-2 ${cmd.important ? "border-2 border-primary/30 bg-primary/5" : "border"}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium" data-testid={`text-cmd-title-${catIdx}-${cmdIdx}`}>{cmd.title}</h4>
                      {cmd.important && <Badge variant="default" className="text-[10px]">Key Command</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{cmd.description}</p>
                    <CommandBlock cmd={cmd.command} ssh={addSsh(cmd.command)} label={`ref-${catIdx}-${cmdIdx}`} />
                    {cmd.flags && cmd.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cmd.flags.map((flag, fi) => (
                          <Badge key={fi} variant="secondary" className="text-[10px] font-mono">{flag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="troubleshoot" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Quick Fix: Gateway Not Connecting
              </CardTitle>
              <CardDescription>Follow these steps to diagnose and fix gateway connection issues.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  step: 1,
                  title: "Run the Doctor",
                  description: "Checks config, diagnoses issues, and auto-fixes them.",
                  command: "openclaw doctor",
                },
                {
                  step: 2,
                  title: "Restart Gateway",
                  description: "Apply any fixes by restarting the gateway service.",
                  command: "openclaw gateway restart",
                },
                {
                  step: 3,
                  title: "Verify It's Working",
                  description: "Check if the gateway is responding to probes.",
                  command: "openclaw gateway probe",
                },
                {
                  step: 4,
                  title: "Check Status",
                  description: "Get detailed gateway status including PID, port, and bind address.",
                  command: "openclaw gateway status",
                },
                {
                  step: 5,
                  title: "Check Logs",
                  description: "Stream gateway logs to see error details.",
                  command: "openclaw logs",
                },
              ].map((item) => (
                <div key={item.step} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold shrink-0">
                      {item.step}
                    </div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground ml-8">{item.description}</p>
                  <div className="ml-8">
                    <CommandBlock cmd={item.command} ssh={addSsh(item.command)} label={`troubleshoot-${item.step}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Manual LLM Provider Fix
              </CardTitle>
              <CardDescription>If your LLM provider isn't responding, re-register it manually.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  step: 1,
                  title: "Check Provider Status",
                  description: "Verify which LLM providers are registered.",
                  command: "openclaw models status --json",
                },
                {
                  step: 2,
                  title: "Set API Key Environment Variable",
                  description: "Export your API key so OpenClaw can find it.",
                  command: "export OPENROUTER_API_KEY=\"your-key-here\"",
                },
                {
                  step: 3,
                  title: "Re-run Onboarding (Non-Interactive)",
                  description: "Force-register the provider and API key in config.",
                  command: "openclaw onboard --non-interactive --accept-risk --auth-choice apiKey --openrouter-api-key \"$OPENROUTER_API_KEY\"",
                },
                {
                  step: 4,
                  title: "Restart and Verify",
                  description: "Restart gateway and confirm the provider is active.",
                  command: "openclaw gateway restart && openclaw models status --json",
                },
              ].map((item) => (
                <div key={item.step} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold shrink-0">
                      {item.step}
                    </div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground ml-8">{item.description}</p>
                  <div className="ml-8">
                    <CommandBlock cmd={item.command} ssh={addSsh(item.command)} label={`llmfix-${item.step}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" /> Remote Access Setup
              </CardTitle>
              <CardDescription>Access your OpenClaw dashboard remotely via SSH tunnel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                By default, the gateway binds to localhost (loopback) for security. To access it remotely, use an SSH tunnel:
              </p>
              <CommandBlock
                cmd={sshHost
                  ? `ssh -N -L 18789:127.0.0.1:18789 ${sshUser}@${sshHost}${sshPort !== 22 ? ` -p ${sshPort}` : ""}`
                  : "ssh -N -L 18789:127.0.0.1:18789 user@your-server-ip"
                }
                label="ssh-tunnel"
              />
              <p className="text-xs text-muted-foreground">
                Then open <code className="bg-muted px-1 rounded">http://localhost:18789/?token=YOUR_TOKEN</code> in your browser.
              </p>
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Alternative:</strong> If you use Tailscale, set <code>gateway.bind</code> to <code>tailnet</code> for secure direct access without SSH tunneling.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
