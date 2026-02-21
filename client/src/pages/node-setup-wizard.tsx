import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useInstance } from "@/hooks/use-instance";
import {
  Monitor, Check, Copy, ChevronRight, ChevronLeft,
  RotateCcw, Cpu, Shield, Download, Terminal, Wifi, ArrowRight
} from "lucide-react";
import { useState } from "react";
import type { NodeSetupSession } from "@shared/schema";

const OS_OPTIONS = [
  { value: "docker", label: "Docker / Hostinger VPS (Recommended)", icon: Monitor },
  { value: "linux", label: "Linux (Ubuntu/Debian)", icon: Monitor },
  { value: "linux-rhel", label: "Linux (RHEL/CentOS)", icon: Monitor },
  { value: "macos", label: "macOS", icon: Monitor },
  { value: "windows", label: "Windows", icon: Monitor },
];

interface SetupStep {
  title: string;
  description: string;
  icon: React.ElementType;
  commands: Record<string, string[]>;
  tip: string;
}

const SETUP_STEPS: SetupStep[] = [
  {
    title: "Install OpenClaw CLI",
    description: "Install the OpenClaw command-line tool on the node machine. This only installs the CLI — it does NOT set up a full gateway.",
    icon: Download,
    commands: {
      docker: [
        "# OpenClaw is ALREADY INSTALLED inside your Docker container.",
        "# Do NOT run the install script on the host — it will fail.",
        "",
        "# Step 1 — Find your container name:",
        "docker ps --format '{{.Names}}'",
        "",
        "# Look for a name like 'claw-openclaw-1' or 'openclaw-openclaw-1'.",
        "# Use that name in place of CONTAINER_NAME below:",
        "docker exec -it CONTAINER_NAME openclaw --version",
        "",
        "# Tip: If using Hostinger Docker Manager, go to",
        "# VPS → Docker Manager → Projects → Terminal tab.",
        "# Inside the terminal, just run: openclaw --version",
      ],
      linux: [
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
      ],
      "linux-rhel": [
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
      ],
      macos: [
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
      ],
      windows: [
        "# IMPORTANT: These commands do NOT work in PowerShell or CMD.",
        "# You MUST use WSL2 (Windows Subsystem for Linux).",
        "",
        "# Step A — Open PowerShell as Administrator and run:",
        "wsl --install",
        "",
        "# Step B — Restart your computer.",
        "# Step C — Open 'Ubuntu' from the Start Menu.",
        "# Step D — Inside the Ubuntu terminal, run:",
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
      ],
    },
    tip: "Docker/Hostinger users: OpenClaw is pre-installed in the container. Do NOT run the install script on the host — it requires dependencies (like Homebrew on macOS) that aren't available on server hosts. Use the Docker Manager terminal or 'docker exec' instead.",
  },
  {
    title: "Configure Gateway Mode",
    description: "Before the gateway will start, you need to tell it to run in local mode. Then install and start the background service.",
    icon: Cpu,
    commands: {
      docker: [
        "# The Docker container is already configured with local mode.",
        "# If your gateway isn't working, run the doctor to auto-fix.",
        "",
        "# Replace CONTAINER_NAME with your actual container name",
        "# (found in Step 1 using 'docker ps'):",
        "docker exec -it CONTAINER_NAME openclaw doctor",
        "",
        "# Then restart the Docker project (replace PROJECT with yours):",
        "docker compose -p PROJECT restart",
        "",
        "# Verify it's running:",
        "docker exec -it CONTAINER_NAME openclaw gateway probe",
      ],
      linux: [
        "# Set local mode (required — gateway won't start without this):",
        "openclaw config set gateway.mode local",
        "",
        "# Install as a background service:",
        "openclaw gateway install",
        "",
        "# Start the service:",
        "openclaw gateway restart",
        "",
        "# Verify it's running:",
        "openclaw gateway probe",
      ],
      "linux-rhel": [
        "openclaw config set gateway.mode local",
        "openclaw gateway install",
        "openclaw gateway restart",
        "openclaw gateway probe",
      ],
      macos: [
        "openclaw config set gateway.mode local",
        "openclaw gateway install",
        "openclaw gateway restart",
        "openclaw gateway probe",
      ],
      windows: [
        "# In WSL2 Ubuntu terminal:",
        "openclaw config set gateway.mode local",
        "openclaw gateway install",
        "openclaw gateway restart",
        "openclaw gateway probe",
      ],
    },
    tip: "The 'gateway install' command auto-generates a security token and saves it to ~/.openclaw/openclaw.json. The probe should return 'Reachable: yes' and 'RPC: ok' when ready.",
  },
  {
    title: "Get Your Gateway Token",
    description: "Find the auto-generated gateway token. You'll need this to connect nodes and access the native dashboard.",
    icon: Shield,
    commands: {
      docker: [
        "# View your gateway token from inside the container.",
        "# Replace CONTAINER_NAME with your actual container name:",
        "docker exec -it CONTAINER_NAME cat /root/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# Or use the Hostinger Docker Manager terminal and run:",
        "cat ~/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# Access the native dashboard at:",
        "# http://YOUR_VPS_IP:18789/?token=YOUR_TOKEN_HERE",
      ],
      linux: [
        "# View your gateway token:",
        "cat ~/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# You can also open the native dashboard with the token:",
        "# http://localhost:18789/?token=YOUR_TOKEN_HERE",
        "",
        "# For remote access via SSH tunnel from your local computer:",
        "# ssh -N -L 18789:127.0.0.1:18789 user@your-server-ip",
        "# Then open http://localhost:18789/?token=YOUR_TOKEN_HERE",
      ],
      "linux-rhel": [
        "cat ~/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# Open native dashboard: http://localhost:18789/?token=YOUR_TOKEN_HERE",
      ],
      macos: [
        "cat ~/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# Open native dashboard: http://localhost:18789/?token=YOUR_TOKEN_HERE",
      ],
      windows: [
        "# In WSL2 Ubuntu terminal:",
        "cat ~/.openclaw/openclaw.json | grep -A2 '\"token\"'",
        "",
        "# Open in your Windows browser:",
        "# http://localhost:18789/?token=YOUR_TOKEN_HERE",
      ],
    },
    tip: "Save this token somewhere safe. You need it to: (1) access the native OpenClaw dashboard, (2) connect nodes, and (3) link this instance to the management dashboard.",
  },
  {
    title: "Connect a Node (Optional)",
    description: "To add another machine as a node to this gateway, run these on the node machine. Skip this step if you only have one machine.",
    icon: Wifi,
    commands: {
      docker: [
        "# For Docker deployments, additional nodes need the CLI installed",
        "# on the separate node machine (not in the Docker container).",
        "",
        "# On the NODE machine:",
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
        "",
        "# Set the gateway token from your primary machine:",
        "export OPENCLAW_GATEWAY_TOKEN=\"PASTE_YOUR_TOKEN_HERE\"",
        "",
        "# Connect to the gateway (use your VPS IP — no angle brackets!):",
        "openclaw node install --host YOUR_VPS_IP --port 18789 --display-name \"My Node\"",
        "openclaw node restart",
      ],
      linux: [
        "# On the NODE machine (not the gateway):",
        "",
        "# 1. Install CLI only (no gateway setup):",
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
        "",
        "# 2. Set the gateway token from your primary machine:",
        "export OPENCLAW_GATEWAY_TOKEN=\"PASTE_YOUR_TOKEN_HERE\"",
        "",
        "# 3. Connect to the gateway (replace YOUR_GATEWAY_IP with the actual IP):",
        "openclaw node install --host YOUR_GATEWAY_IP --port 18789 --display-name \"My Node\"",
        "openclaw node restart",
      ],
      "linux-rhel": [
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
        "export OPENCLAW_GATEWAY_TOKEN=\"PASTE_YOUR_TOKEN_HERE\"",
        "openclaw node install --host YOUR_GATEWAY_IP --port 18789 --display-name \"My Node\"",
        "openclaw node restart",
      ],
      macos: [
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
        "export OPENCLAW_GATEWAY_TOKEN=\"PASTE_YOUR_TOKEN_HERE\"",
        "openclaw node install --host YOUR_GATEWAY_IP --port 18789 --display-name \"My Node\"",
        "openclaw node restart",
      ],
      windows: [
        "# All commands in WSL2 Ubuntu terminal:",
        "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
        "export OPENCLAW_GATEWAY_TOKEN=\"PASTE_YOUR_TOKEN_HERE\"",
        "openclaw node install --host YOUR_GATEWAY_IP --port 18789 --display-name \"My Node\"",
        "openclaw node restart",
      ],
    },
    tip: "Replace YOUR_GATEWAY_IP with the IP of your primary machine (e.g. 187.77.194.205). Replace PASTE_YOUR_TOKEN_HERE with the token from Step 3. Do NOT use angle brackets — just paste the values directly.",
  },
  {
    title: "Approve & Verify",
    description: "Approve any pending nodes and verify everything is connected.",
    icon: Terminal,
    commands: {
      docker: [
        "# From your VPS host via docker exec.",
        "# Replace CONTAINER_NAME with your actual container name:",
        "docker exec -it CONTAINER_NAME openclaw nodes pending",
        "docker exec -it CONTAINER_NAME openclaw nodes approve REQUEST_ID",
        "",
        "# Check all nodes are connected:",
        "docker exec -it CONTAINER_NAME openclaw nodes status",
        "",
        "# Full health check:",
        "docker exec -it CONTAINER_NAME openclaw status",
      ],
      linux: [
        "# On the PRIMARY machine — approve pending nodes:",
        "openclaw nodes pending",
        "openclaw nodes approve REQUEST_ID",
        "",
        "# Check all nodes are connected:",
        "openclaw nodes status",
        "",
        "# Full health check:",
        "openclaw status",
      ],
      "linux-rhel": [
        "openclaw nodes pending",
        "openclaw nodes approve REQUEST_ID",
        "openclaw nodes status",
        "openclaw status",
      ],
      macos: [
        "openclaw nodes pending",
        "openclaw nodes approve REQUEST_ID",
        "openclaw nodes status",
        "openclaw status",
      ],
      windows: [
        "# In WSL2 Ubuntu terminal (on primary machine):",
        "openclaw nodes pending",
        "openclaw nodes approve REQUEST_ID",
        "openclaw nodes status",
        "openclaw status",
      ],
    },
    tip: "You can also approve nodes from the Settings > Nodes page in this dashboard, or from the native OpenClaw dashboard at localhost:18789.",
  },
];

function CommandBlock({ commands, os }: { commands: Record<string, string[]>; os: string }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const cmds = commands[os] || commands.linux;

  const copyCommand = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-2">
      {cmds.map((cmd, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 font-mono text-sm"
          data-testid={`text-command-${idx}`}
        >
          <code className="flex-1 break-all text-xs">{cmd}</code>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copyCommand(cmd, idx)}
            data-testid={`button-copy-command-${idx}`}
          >
            {copiedIdx === idx ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      ))}
    </div>
  );
}

function ActiveWizard({
  session,
  onBack,
}: {
  session: NodeSetupSession;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(session.currentStep);
  const [completedSteps, setCompletedSteps] = useState<number[]>(
    (session.completedSteps as number[]) ?? []
  );
  const os = session.os;
  const step = SETUP_STEPS[currentStep];

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/node-setup/${session.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/node-setup"] });
    },
  });

  const markStepDone = () => {
    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    setCompletedSteps(newCompleted);

    const isLast = currentStep === SETUP_STEPS.length - 1;
    const allDone = newCompleted.length === SETUP_STEPS.length;

    updateMutation.mutate({
      currentStep: isLast ? currentStep : currentStep + 1,
      completedSteps: newCompleted,
      status: allDone ? "completed" : "in_progress",
    });

    if (isLast && allDone) {
      toast({ title: "Setup Complete", description: "Your node has been configured successfully." });
    } else if (!isLast) {
      setCurrentStep(currentStep + 1);
    }
  };

  const allDone = completedSteps.length === SETUP_STEPS.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack} data-testid="button-back-to-list">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        <Badge variant="secondary" data-testid="badge-os">
          {OS_OPTIONS.find((o) => o.value === os)?.label ?? os}
        </Badge>
        <Badge variant={allDone ? "default" : "outline"} data-testid="badge-progress">
          {completedSteps.length}/{SETUP_STEPS.length} steps
        </Badge>
      </div>

      <div className="flex gap-1 mb-4">
        {SETUP_STEPS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentStep(idx)}
            className={`flex-1 h-2 rounded-full transition-colors ${
              completedSteps.includes(idx)
                ? "bg-primary"
                : idx === currentStep
                ? "bg-primary/50"
                : "bg-muted"
            }`}
            data-testid={`button-step-indicator-${idx}`}
          />
        ))}
      </div>

      {allDone ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2" data-testid="text-setup-complete">Setup Complete</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Your OpenClaw node has been configured. Head to the Nodes page to manage it.
            </p>
            <Button className="mt-6" onClick={() => window.location.href = "/settings/machines"} data-testid="button-go-to-nodes">
              <ArrowRight className="h-4 w-4 mr-2" /> Go to Nodes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base" data-testid="text-step-title">
                  Step {currentStep + 1}: {step.title}
                </CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CommandBlock commands={step.commands} os={os} />

            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Tip:</span> {step.tip}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                disabled={currentStep === 0}
                onClick={() => setCurrentStep(currentStep - 1)}
                data-testid="button-prev-step"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button
                onClick={markStepDone}
                disabled={updateMutation.isPending}
                data-testid="button-complete-step"
              >
                {completedSteps.includes(currentStep) ? (
                  currentStep === SETUP_STEPS.length - 1 ? "Finish" : "Next"
                ) : (
                  "Mark Complete & Continue"
                )}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function NodeSetupWizard() {
  const { toast } = useToast();
  const { selectedInstanceId } = useInstance();
  const [selectedOs, setSelectedOs] = useState("linux");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery<NodeSetupSession[]>({
    queryKey: ["/api/node-setup", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/node-setup?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const createMutation = useMutation({
    mutationFn: async (os: string) => {
      const res = await apiRequest("POST", `/api/node-setup?instanceId=${selectedInstanceId ?? ""}`, { os });
      return res.json();
    },
    onSuccess: (data: NodeSetupSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/node-setup", selectedInstanceId] });
      setActiveSessionId(data.id);
      toast({ title: "Wizard started", description: "Follow the steps to set up your node." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start setup wizard.", variant: "destructive" });
    },
  });

  const activeSession = activeSessionId
    ? sessions?.find((s) => s.id === activeSessionId)
    : null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Node Setup Wizard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Follow these steps to install and connect a new OpenClaw node.
          </p>
        </div>
        <ActiveWizard
          session={activeSession}
          onBack={() => setActiveSessionId(null)}
        />
      </div>
    );
  }

  const inProgressSessions = sessions?.filter((s) => s.status === "in_progress") ?? [];
  const completedSessions = sessions?.filter((s) => s.status === "completed") ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Node Setup Wizard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Step-by-step guide to install and connect an OpenClaw node to your instance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start New Setup</CardTitle>
          <CardDescription>
            Choose your operating system and follow the guided installation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OS_OPTIONS.map((os) => (
              <button
                key={os.value}
                onClick={() => setSelectedOs(os.value)}
                className={`flex items-center gap-3 p-3 rounded-md border text-left transition-colors toggle-elevate ${
                  selectedOs === os.value ? "toggle-elevated border-primary" : ""
                }`}
                data-testid={`button-os-${os.value}`}
              >
                <os.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">{os.label}</span>
              </button>
            ))}
          </div>
          <Button
            onClick={() => createMutation.mutate(selectedOs)}
            disabled={createMutation.isPending}
            data-testid="button-start-wizard"
          >
            {createMutation.isPending ? "Starting..." : "Start Installation Wizard"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      {inProgressSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">In Progress</h2>
          {inProgressSessions.map((s) => (
            <Card
              key={s.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setActiveSessionId(s.id)}
              data-testid={`card-session-${s.id}`}
            >
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {OS_OPTIONS.find((o) => o.value === s.os)?.label ?? s.os}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Step {s.currentStep + 1} of {s.totalSteps} — Started {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {Math.round(((s.completedSteps as number[])?.length ?? 0) / s.totalSteps * 100)}%
                  </Badge>
                  <Button size="icon" variant="ghost" data-testid={`button-resume-${s.id}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {completedSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Completed</h2>
          {completedSessions.map((s) => (
            <Card key={s.id} data-testid={`card-session-completed-${s.id}`}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {OS_OPTIONS.find((o) => o.value === s.os)?.label ?? s.os}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Completed {new Date(s.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge>Complete</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
