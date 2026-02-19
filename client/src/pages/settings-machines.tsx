import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Monitor, Trash2, Wifi, WifiOff, Clock, Copy, RefreshCw, HelpCircle, ChevronDown, ChevronUp, Info, ExternalLink, Terminal } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertMachineSchema } from "@shared/schema";
import type { Machine, InsertMachine } from "@shared/schema";
import { z } from "zod";

const nodeFormSchema = insertMachineSchema.extend({
  name: z.string().min(1, "Node name is required"),
});

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected": return "default";
    case "paired": return "secondary";
    case "pending": return "outline";
    case "disconnected": return "destructive";
    default: return "outline";
  }
}

function NodeCard({
  machine,
  onDelete,
  onCopyCode,
}: {
  machine: Machine;
  onDelete: (id: string) => void;
  onCopyCode: (code: string) => void;
}) {
  return (
    <Card data-testid={`card-node-${machine.id}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight" data-testid={`text-node-name-${machine.id}`}>
                {machine.displayName || machine.name}
              </p>
              {machine.hostname && (
                <p className="text-xs text-muted-foreground mt-0.5">{machine.hostname}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={getStatusVariant(machine.status)}
              data-testid={`badge-node-status-${machine.id}`}
            >
              {machine.status === "connected" && <Wifi className="h-3 w-3 mr-1" />}
              {machine.status === "disconnected" && <WifiOff className="h-3 w-3 mr-1" />}
              {machine.status}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(machine.id)}
              data-testid={`button-delete-node-${machine.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">IP Address</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-ip-${machine.id}`}>
              {machine.ipAddress || "---"}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">OS</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-os-${machine.id}`}>
              {machine.os || "---"}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Last Seen</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-last-seen-${machine.id}`}>
              {machine.lastSeen
                ? new Date(machine.lastSeen).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>

        {machine.status === "pending" && (
          <div className="mt-3 rounded-md border border-dashed p-3 space-y-3" data-testid={`pending-steps-${machine.id}`}>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold">Waiting for pairing</span>
            </div>

            {machine.pairingCode && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground">Pairing Code:</span>
                  <code className="text-sm font-mono font-bold tracking-wider" data-testid={`text-pairing-code-${machine.id}`}>
                    {machine.pairingCode}
                  </code>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onCopyCode(machine.pairingCode!)}
                  data-testid={`button-copy-code-${machine.id}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <PendingNodeSteps machine={machine} onCopyText={onCopyCode} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InstallCommand({ label, command, onCopy }: { label: string; command: string; onCopy: (text: string) => void }) {
  return (
    <div className="rounded-md bg-muted/50 p-2 space-y-1">
      <p className="text-xs font-semibold">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs font-mono break-all">{command}</code>
        <Button size="icon" variant="ghost" onClick={() => onCopy(command)} className="shrink-0">
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function PendingNodeSteps({ machine, onCopyText }: { machine: Machine; onCopyText: (text: string) => void }) {
  const [showInstall, setShowInstall] = useState(false);
  const os = (machine.os || "").toLowerCase();

  const linuxInstall = "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard";
  const macInstall = "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard";
  const winInstall = "wsl --install   # restart, open Ubuntu, then run the Linux command above";

  const nodeRunCmd = `openclaw node run --host <gateway-ip> --port 18789 --display-name "${machine.displayName || machine.name || "My Node"}"`;
  const nodeInstallCmd = `openclaw node install --host <gateway-ip> --port 18789 --display-name "${machine.displayName || machine.name || "My Node"}"`;

  return (
    <div className="space-y-3" data-testid={`text-pending-instructions-${machine.id}`}>
      <p className="text-xs font-semibold text-muted-foreground">To get this node connected:</p>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold mt-0.5">1</span>
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              <strong>Install the OpenClaw CLI</strong> on <strong>{machine.displayName || machine.name}</strong> (no gateway setup needed)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInstall(!showInstall)}
              data-testid={`button-show-install-${machine.id}`}
            >
              <Terminal className="h-3.5 w-3.5 mr-1.5" />
              {showInstall ? "Hide install commands" : "Show install commands"}
            </Button>

            {showInstall && (
              <div className="space-y-2 mt-2">
                {(!os || os === "linux") && (
                  <InstallCommand label="Linux / WSL2" command={linuxInstall} onCopy={onCopyText} />
                )}
                {(!os || os === "macos") && (
                  <InstallCommand label="macOS" command={macInstall} onCopy={onCopyText} />
                )}
                {(!os || os === "windows") && (
                  <InstallCommand label="Windows (via WSL2)" command={winInstall} onCopy={onCopyText} />
                )}
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">--no-onboard</code> to skip the full gateway setup. Nodes only need the CLI installed — they connect to your existing gateway.
                  </p>
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <Link href="/node-setup" className="text-xs text-primary underline-offset-4 hover:underline inline-flex items-center gap-1" data-testid={`link-node-setup-${machine.id}`}>
                    Full step-by-step guide
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold mt-0.5">2</span>
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              <strong>Connect the node</strong> to your primary gateway (replace <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">&lt;gateway-ip&gt;</code> with your gateway's IP)
            </p>
            <div className="rounded-md bg-muted/50 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid={`text-node-run-cmd-${machine.id}`}>{nodeRunCmd}</code>
                <Button size="icon" variant="ghost" onClick={() => onCopyText(nodeRunCmd)} className="shrink-0" data-testid={`button-copy-node-run-${machine.id}`}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Or install as a background service:
            </p>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid={`text-node-install-cmd-${machine.id}`}>{nodeInstallCmd}</code>
                <Button size="icon" variant="ghost" onClick={() => onCopyText(nodeInstallCmd)} className="shrink-0" data-testid={`button-copy-node-install-${machine.id}`}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold mt-0.5">3</span>
          <p className="text-xs text-muted-foreground">
            Once the node connects, click <strong>Approve</strong> on this page — the status will change to <strong>paired</strong>
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-muted/30 p-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          You may need to set <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">OPENCLAW_GATEWAY_TOKEN</code> on the node machine first. Find the token in your primary gateway's config at <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">~/.openclaw/openclaw.json</code>.
        </p>
      </div>
    </div>
  );
}

function SetupInstructions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card data-testid="card-setup-instructions">
      <CardContent className="pt-5 pb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between gap-2 w-full text-left hover-elevate rounded-md p-1 -m-1"
          data-testid="button-toggle-instructions"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">How to Add a Node to Your OpenClaw Network</span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-dashed p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong>Important:</strong> Before adding nodes, you need a running gateway. If you haven't set one up yet, use the{" "}
                <Link href="/node-setup" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-0.5">
                  Node Setup Wizard <ExternalLink className="h-3 w-3" />
                </Link>{" "}
                for a full step-by-step guide.
              </p>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Install the OpenClaw CLI on the Node Machine
              </h4>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  On the machine you want to connect as a node, install the CLI with the <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">--no-onboard</code> flag (this skips gateway setup — nodes only need the CLI):
                </p>
                <div className="rounded-md bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-semibold">Linux / macOS / WSL2:</p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-mono break-all">curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard</code>
                  </div>
                </div>
                <div className="rounded-md bg-muted/30 p-2 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    <strong>Windows users:</strong> You must use WSL2 (Windows Subsystem for Linux). PowerShell's <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">curl</code> does not support Linux flags like <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">-fsSL</code>. Run <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">wsl --install</code> first if needed, then run the install command above inside WSL2.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Set the Gateway Token on the Node
              </h4>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  The node needs your gateway's authentication token to connect. Find this token in your gateway machine's config file at <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">~/.openclaw/openclaw.json</code> under <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">gateway.auth.token</code> (it's a 48-character hex string auto-generated during gateway install).
                </p>
                <p className="text-sm text-muted-foreground">
                  You can also find it in the <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">OpenClaw Config</Link> page under Gateway Settings.
                </p>
                <div className="rounded-md bg-muted/50 p-3 space-y-1">
                  <p className="text-xs font-semibold">Set the token on the node machine:</p>
                  <code className="text-xs font-mono break-all">export OPENCLAW_GATEWAY_TOKEN="your-48-char-hex-token-here"</code>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                Register the Node in This Dashboard
              </h4>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Click the <strong>"Register Node"</strong> button above and fill in:
                </p>
                <ul className="text-sm text-muted-foreground pl-4 list-disc space-y-1">
                  <li><strong>Node Name</strong> — A unique identifier (e.g., <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">office-pc-01</code>)</li>
                  <li><strong>Display Name</strong> — A friendly label (e.g., "Office Desktop")</li>
                  <li><strong>IP Address</strong> — The node machine's IP (use <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">hostname -I</code> on Linux or <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">ipconfig</code> on Windows to find it)</li>
                  <li><strong>Operating System</strong> — Windows, Linux, or macOS</li>
                  <li>A <strong>Pairing Code</strong> is automatically generated for you</li>
                </ul>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                Connect the Node to Your Gateway
              </h4>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  On the node machine, run the following command (replace <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">&lt;gateway-ip&gt;</code> with your gateway's IP address):
                </p>
                <div className="rounded-md bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-semibold">Test first (foreground mode):</p>
                  <code className="text-xs font-mono break-all">openclaw node run --host &lt;gateway-ip&gt; --port 18789 --display-name "My Node"</code>
                </div>
                <div className="rounded-md bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-semibold">Then install as a background service:</p>
                  <code className="text-xs font-mono break-all">openclaw node install --host &lt;gateway-ip&gt; --port 18789 --display-name "My Node"</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Using <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">node run</code> first lets you verify the connection works before installing as a service.
                </p>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
                Approve the Node
              </h4>
              <div className="pl-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Once the node connects to the gateway, come back to this page. The node will appear with <strong>"pending"</strong> status — click <strong>Approve</strong> and the status will change to <strong>"paired"</strong>.
                </p>
                <p className="text-sm text-muted-foreground">
                  You can also approve pending nodes on the <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">OpenClaw Config</Link> page under Node Approvals.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-dashed p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> If you're using Tailscale, you can use the Tailscale IP address (usually <strong>100.x.x.x</strong>) instead of the local network IP. This allows nodes to connect across different networks without port forwarding.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsMachines() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: machines, isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const form = useForm<InsertMachine>({
    resolver: zodResolver(nodeFormSchema),
    defaultValues: {
      name: "",
      hostname: "",
      ipAddress: "",
      os: "",
      location: "",
      status: "pending",
      pairingCode: generatePairingCode(),
      displayName: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertMachine) => {
      await apiRequest("POST", "/api/machines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node registered", description: "New node has been registered with a pairing code." });
      setDialogOpen(false);
      form.reset({
        name: "",
        hostname: "",
        ipAddress: "",
        os: "",
        location: "",
        status: "pending",
        pairingCode: generatePairingCode(),
        displayName: "",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to register node.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/machines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node removed", description: "Node has been deregistered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove node.", variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertMachine) => {
    createMutation.mutate(data);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Pairing code copied to clipboard." });
  };

  const handleRegeneratePairingCode = () => {
    form.setValue("pairingCode", generatePairingCode());
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full mb-4" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Node Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Register and manage computers connected to your OpenClaw network.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-node">
              <Plus className="h-4 w-4 mr-2" />
              Register Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Node</DialogTitle>
              <DialogDescription>Add a new computer to the OpenClaw network. Use the pairing code on the device to complete setup.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Node Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. office-pc-01" {...field} data-testid="input-node-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. John's Workstation" {...field} value={field.value ?? ""} data-testid="input-display-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hostname (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. node-01.local" {...field} value={field.value ?? ""} data-testid="input-hostname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IP Address (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 192.168.1.100" {...field} value={field.value ?? ""} data-testid="input-ip-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="os"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operating System</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-os">
                              <SelectValue placeholder="Select OS" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="linux">Linux</SelectItem>
                            <SelectItem value="windows">Windows</SelectItem>
                            <SelectItem value="macos">macOS</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Server Room A" {...field} value={field.value ?? ""} data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <FormLabel>Pairing Code</FormLabel>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2">
                      <code className="text-lg font-mono font-bold tracking-widest" data-testid="text-generated-pairing-code">
                        {form.watch("pairingCode")}
                      </code>
                    </div>
                    <Button type="button" size="icon" variant="outline" onClick={handleRegeneratePairingCode} data-testid="button-regenerate-code">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Enter this code on the device to pair it with this node.</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-node">
                    {createMutation.isPending ? "Registering..." : "Register Node"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <SetupInstructions />

      {machines && machines.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => (
            <NodeCard
              key={machine.id}
              machine={machine}
              onDelete={(id) => deleteMutation.mutate(id)}
              onCopyCode={handleCopyCode}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-sm font-semibold mb-1">No nodes registered</h3>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Register your first node to connect a computer to the OpenClaw network.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
