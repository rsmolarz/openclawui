import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Monitor, Trash2, Wifi, WifiOff, Copy, Info, ExternalLink, Terminal, ChevronDown, Clock, RefreshCw, Loader2, AlertCircle, CheckCircle2, Activity, Signal, ShieldCheck, ShieldX, Network, Link2, Zap, Server, ScreenShare, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertMachineSchema } from "@shared/schema";
import type { Machine, InsertMachine } from "@shared/schema";
import { useInstance } from "@/hooks/use-instance";
import { z } from "zod";

const nodeFormSchema = insertMachineSchema.extend({
  name: z.string().min(1, "Node name is required"),
});

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected": return "default";
    case "paired": return "secondary";
    case "pending": return "outline";
    case "disconnected": return "destructive";
    default: return "outline";
  }
}

const STATUS_OPTIONS = [
  { value: "connected", label: "Connected", icon: Wifi },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "disconnected", label: "Disconnected", icon: WifiOff },
] as const;

function ConnectCommandDialog({ machine, gatewayHost, gatewayPort, gatewayToken, vpsIp }: { machine: Machine; gatewayHost: string; gatewayPort: number; gatewayToken: string; vpsIp?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [shellMode, setShellMode] = useState<"powershell" | "wsl">("powershell");

  const isWindows = machine.os?.toLowerCase().includes("windows") || machine.os?.toLowerCase() === "windows";
  const nodeName = machine.hostname || machine.name;
  const proxyHost = window.location.hostname;

  const linuxInstallCmd = "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard";
  const linuxTokenCmd = `openclaw config set gateway.auth.token "${gatewayToken}"`;
  const linuxConnectCmd = `openclaw node run --host ${gatewayHost} --port ${gatewayPort} --display-name "${nodeName}"`;
  const linuxServiceInstall = `openclaw node install --host ${gatewayHost} --port ${gatewayPort} --display-name "${nodeName}"`;

  const psInstallCmd = `npm install -g openclaw@latest --ignore-scripts`;
  const psTokenCmd = `openclaw config set gateway.auth.token "${gatewayToken}"`;
  const psConnectCmd = `openclaw node run --host ${proxyHost} --port 443 --tls --display-name "${nodeName}"`;
  const psServiceInstall = `openclaw node install --host ${proxyHost} --port 443 --tls --display-name "${nodeName}"`;

  const wslInstallCmd = `wsl -e bash -c "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard"`;
  const wslTokenCmd = `wsl -e bash -c 'openclaw config set gateway.auth.token ${gatewayToken}'`;
  const wslConnectCmd = `wsl -e bash -c 'openclaw node run --host ${proxyHost} --port 443 --tls --display-name "${nodeName}"'`;
  const wslServiceInstall = `wsl -e bash -c 'openclaw node install --host ${proxyHost} --port 443 --tls --display-name "${nodeName}"'`;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Command copied to clipboard." });
  };

  const renderStep = (num: number, title: string, desc: string, cmd: string, testIdSuffix: string, isOptional?: boolean) => (
    <div className="flex items-start gap-3">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isOptional ? "bg-primary/70" : "bg-primary"} text-primary-foreground text-xs font-bold`}>{num}</span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-medium">
          {title}
          {isOptional && <Badge variant="secondary" className="ml-2 text-[10px]">Optional</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
        <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
          <pre className="text-xs font-mono break-all whitespace-pre-wrap m-0" data-testid={`text-${testIdSuffix}-${machine.id}`}>{cmd}</pre>
          <Button size="icon" variant="ghost" onClick={() => copyText(cmd)} className="shrink-0" data-testid={`button-copy-${testIdSuffix}-${machine.id}`}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={machine.status === "disconnected" ? "default" : "outline"}
          data-testid={`button-connect-${machine.id}`}
        >
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          {machine.status === "disconnected" ? "Reconnect" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Connect "{machine.displayName || machine.name}"
          </DialogTitle>
          <DialogDescription>
            Run these commands on <strong>{nodeName}</strong> to connect it to your gateway.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isWindows && (
            <div className="space-y-2">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-amber-700 dark:text-amber-400">Windows Machine</p>
                  <p className="text-muted-foreground mt-0.5">
                    Choose your shell below. PowerShell uses a TCP relay; WSL2 connects directly.
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 rounded-md bg-muted/50 p-1">
                <button
                  onClick={() => setShellMode("powershell")}
                  className={`flex-1 text-xs font-medium rounded px-3 py-1.5 transition-colors ${shellMode === "powershell" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid="button-shell-powershell"
                >
                  PowerShell
                </button>
                <button
                  onClick={() => setShellMode("wsl")}
                  className={`flex-1 text-xs font-medium rounded px-3 py-1.5 transition-colors ${shellMode === "wsl" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid="button-shell-wsl"
                >
                  WSL2
                </button>
              </div>
            </div>
          )}

          {isWindows && shellMode === "powershell" ? (
            <div className="space-y-3">
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2.5 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Connects via secure WSS through the dashboard proxy — no relay or port forwarding needed.
                </p>
              </div>
              {renderStep(1, "Install OpenClaw CLI", "Skip if already installed. Run PowerShell as Administrator. Requires Node.js.", psInstallCmd, "install-cmd")}
              {renderStep(2, "Set gateway token", "Configure the CLI with your gateway authentication token.", psTokenCmd, "token-cmd")}
              {renderStep(3, "Connect node", "Connects securely through the dashboard proxy via WSS (TLS).", psConnectCmd, "connect-cmd")}
              {renderStep(4, "Auto-start on boot", "Installs as a Windows service so the node reconnects automatically.", psServiceInstall, "service-cmd", true)}
            </div>
          ) : isWindows && shellMode === "wsl" ? (
            <div className="space-y-3">
              {renderStep(1, "Install OpenClaw CLI", "This runs the installer inside WSL2.", wslInstallCmd, "install-cmd")}
              {renderStep(2, "Set gateway token", "Configure the CLI with your gateway authentication token.", wslTokenCmd, "token-cmd")}
              {renderStep(3, "Connect node", "Runs the node in the current WSL2 session.", wslConnectCmd, "connect-cmd")}
              {renderStep(4, "Auto-start on boot", "Installs as a system service so the node reconnects automatically.", wslServiceInstall, "service-cmd", true)}
            </div>
          ) : (
            <div className="space-y-3">
              {renderStep(1, "Install OpenClaw CLI", "Skip if already installed.", linuxInstallCmd, "install-cmd")}
              {renderStep(2, "Set gateway token", "Configure the CLI with your gateway authentication token.", linuxTokenCmd, "token-cmd")}
              {renderStep(3, "Connect node", "Runs the node in the current terminal session.", linuxConnectCmd, "connect-cmd")}
              {renderStep(4, "Auto-start on boot", "Installs as a system service so the node reconnects automatically.", linuxServiceInstall, "service-cmd", true)}
            </div>
          )}

          {!gatewayToken && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Gateway token is not configured. Set it in{" "}
                <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">OpenClaw Config</Link> first.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemotePcEditDialog({ machine, onSave }: { machine: Machine; onSave: (id: string, alias: string) => void }) {
  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState(machine.remotePcAlias || "");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setAlias(machine.remotePcAlias || ""); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-edit-remotepc-${machine.id}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScreenShare className="h-5 w-5" />
            RemotePC Settings
          </DialogTitle>
          <DialogDescription>
            Set the RemotePC alias for "{machine.displayName || machine.name}" to enable quick remote access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">RemotePC Alias / Computer Name</label>
            <Input
              placeholder="e.g. PodcastPC or My-Desktop"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              data-testid={`input-remotepc-alias-${machine.id}`}
            />
            <p className="text-xs text-muted-foreground">
              This is the name your computer is registered under in RemotePC. You can find it in the RemotePC app under "Computer Name".
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => { onSave(machine.id, alias); setOpen(false); }}
            data-testid={`button-save-remotepc-${machine.id}`}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NodeCard({
  machine,
  onDelete,
  onStatusChange,
  onHealthCheck,
  onRemotePcSave,
  isCheckingHealth,
  healthResult,
  gatewayHost,
  gatewayPort,
  gatewayToken,
  vpsIp,
}: {
  machine: Machine;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onHealthCheck: (id: string) => void;
  onRemotePcSave: (id: string, alias: string) => void;
  isCheckingHealth: boolean;
  healthResult?: { status: string; lastChecked: string; results: { method: string; reachable: boolean; latencyMs?: number; error?: string }[]; noChecksPossible?: boolean } | null;
  gatewayHost: string;
  gatewayPort: number;
  gatewayToken: string;
  vpsIp?: string;
}) {
  const effectiveStatus = healthResult?.status || machine.status;
  return (
    <Card data-testid={`card-node-${machine.id}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${effectiveStatus === "connected" ? "bg-green-500/10" : effectiveStatus === "disconnected" ? "bg-destructive/10" : "bg-muted"}`}>
              <Monitor className={`h-5 w-5 ${effectiveStatus === "connected" ? "text-green-600" : effectiveStatus === "disconnected" ? "text-destructive" : "text-muted-foreground"}`} />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 cursor-pointer" data-testid={`button-status-${machine.id}`}>
                  <Badge
                    variant={getStatusVariant(effectiveStatus)}
                    data-testid={`badge-node-status-${machine.id}`}
                  >
                    {effectiveStatus === "connected" && <Wifi className="h-3 w-3 mr-1" />}
                    {effectiveStatus === "pending" && <Clock className="h-3 w-3 mr-1" />}
                    {effectiveStatus === "disconnected" && <WifiOff className="h-3 w-3 mr-1" />}
                    {effectiveStatus}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Badge>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onStatusChange(machine.id, opt.value)}
                    data-testid={`menu-status-${opt.value}-${machine.id}`}
                  >
                    <opt.icon className="h-4 w-4 mr-2" />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onHealthCheck(machine.id)}
                  disabled={isCheckingHealth}
                  data-testid={`button-health-check-${machine.id}`}
                >
                  {isCheckingHealth ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Check connectivity</TooltipContent>
            </Tooltip>
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

        <div className="mt-3 flex items-center gap-2">
          <ConnectCommandDialog machine={machine} gatewayHost={gatewayHost} gatewayPort={gatewayPort} gatewayToken={gatewayToken} vpsIp={vpsIp} />
          {machine.remotePcAlias ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(`https://login.remotepc.com/rpc/connect?computer=${encodeURIComponent(machine.remotePcAlias!)}`, "_blank")}
                  data-testid={`button-remote-into-${machine.id}`}
                >
                  <ScreenShare className="h-3.5 w-3.5" />
                  Remote Into
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open RemotePC session to {machine.remotePcAlias}</TooltipContent>
            </Tooltip>
          ) : null}
          <RemotePcEditDialog machine={machine} onSave={onRemotePcSave} />
          {machine.remotePcAlias && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <ScreenShare className="h-3 w-3" />
              {machine.remotePcAlias}
            </span>
          )}
        </div>

        {healthResult && (
          <div className={`mt-3 rounded-md p-2.5 text-xs ${healthResult.noChecksPossible ? "bg-muted/50 text-muted-foreground" : healthResult.status === "connected" ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`} data-testid={`health-result-${machine.id}`}>
            <div className="flex items-center gap-1.5">
              {healthResult.noChecksPossible ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>No IP or gateway available to check. Set an IP address or configure a gateway.</span>
                </>
              ) : healthResult.status === "connected" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Online
                    {healthResult.results[0]?.latencyMs != null && ` (${healthResult.results[0].latencyMs}ms)`}
                    {healthResult.results[0]?.method === "gateway" && " via gateway API"}
                    {healthResult.results[0]?.method === "gateway-ssh" && " via gateway paired list"}
                    {healthResult.results[0]?.method === "tcp" && " via direct TCP"}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  <span>Unreachable — {healthResult.results[0]?.error || "node did not respond"}</span>
                </>
              )}
            </div>
            <p className="text-[10px] mt-1 opacity-70">Checked {new Date(healthResult.lastChecked).toLocaleTimeString()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LiveStatusData {
  gateway: "online" | "offline" | "error" | "unknown";
  nodes: Array<{ name: string; id: string; ip: string; status: string; caps: string; version: string }>;
  devices: Array<{ requestId: string; name: string; role: string; ip: string; age: string; status: string }>;
  paired: Array<{ id: string; hostname?: string; name?: string; ip?: string; os?: string; requestId?: string }>;
  pending: Array<{ id: string; hostname?: string; name?: string; ip?: string; os?: string; requestId?: string }>;
  pairedCount: number;
  pendingCount: number;
  error?: string;
  source?: string;
}

function LiveGatewayBanner({ instanceId }: { instanceId: string | null }) {
  const { toast } = useToast();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const { data: liveStatus, isLoading: liveLoading, isFetching: liveFetching, refetch: refetchLive } = useQuery<LiveStatusData>({
    queryKey: ["/api/nodes/live-status", instanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/nodes/live-status?instanceId=${instanceId || ""}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to check gateway");
      const data = await resp.json();
      setLastChecked(new Date());
      return data;
    },
    enabled: !!instanceId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    try {
      await refetchLive();
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/paired", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", instanceId] });
      toast({ title: "Status refreshed", description: "Node statuses synced with the live gateway." });
    } catch {
      toast({ title: "Refresh failed", description: "Could not reach the gateway server.", variant: "destructive" });
    }
  };

  if (!instanceId) return null;

  const isOnline = liveStatus?.gateway === "online";
  const isOffline = liveStatus?.gateway === "offline";

  return (
    <Card className={`border-2 ${isOnline ? "border-green-500/30 bg-green-500/5" : isOffline ? "border-red-500/30 bg-red-500/5" : "border-muted"}`} data-testid="card-live-gateway-status">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isOnline ? "bg-green-500/20" : isOffline ? "bg-red-500/20" : "bg-muted"}`}>
              {liveLoading || liveFetching ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : isOnline ? (
                <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : isOffline ? (
                <WifiOff className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <Server className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold" data-testid="text-gateway-status">
                  {liveLoading ? "Checking gateway..." : isOnline ? "Gateway Online" : isOffline ? "Gateway Offline" : "Gateway Status Unknown"}
                </h3>
                {isOnline && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {liveStatus && !liveLoading && (
                  <>
                    <span className="text-xs text-muted-foreground" data-testid="text-live-paired">
                      <strong>{liveStatus.pairedCount}</strong> paired node{liveStatus.pairedCount !== 1 ? "s" : ""}
                      {liveStatus.paired?.length > 0 && (
                        <span className="ml-1">
                          ({liveStatus.paired.map((n: any) => n.displayName || n.hostname || n.clientId || n.id).join(", ")})
                        </span>
                      )}
                    </span>
                    {liveStatus.pendingCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/50" data-testid="badge-live-pending">
                        {liveStatus.pendingCount} pending
                      </Badge>
                    )}
                    {lastChecked && (
                      <span className="text-[10px] text-muted-foreground">
                        Checked {lastChecked.toLocaleTimeString()}
                      </span>
                    )}
                  </>
                )}
                {liveStatus?.error && (
                  <span className="text-xs text-red-500">{liveStatus.error}</span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant={isOnline ? "outline" : "default"}
            size="sm"
            onClick={handleRefresh}
            disabled={liveFetching}
            data-testid="button-refresh-live-status"
          >
            {liveFetching ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {liveFetching ? "Checking..." : "Refresh Live Status"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GatewayNodesLive({ instanceId }: { instanceId: string | null }) {
  const { toast } = useToast();

  const { data: liveStatus, isLoading, isFetching, refetch } = useQuery<LiveStatusData>({
    queryKey: ["/api/nodes/live-status-panel", instanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/nodes/live-status?instanceId=${instanceId || ""}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch live status");
      return resp.json();
    },
    enabled: !!instanceId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const allNodes: any[] = (liveStatus as any)?.allNodes ?? [];
  const gatewayConnectedCount = allNodes.filter((n: any) => n.source === "gateway" || n.status === "connected").length;
  const offlineCount = allNodes.filter((n: any) => n.status !== "connected").length;
  const hasNodes = allNodes.length > 0;

  if (!instanceId) return null;

  return (
    <Card data-testid="card-gateway-nodes-live">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Signal className="h-4 w-4" />
              All Nodes
            </CardTitle>
            <CardDescription>
              {gatewayConnectedCount} connected to gateway, {offlineCount} offline.
              {liveStatus?.source === "cli" && (
                <Badge variant="secondary" className="ml-2 text-[10px]">CLI</Badge>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
              toast({ title: "Refreshing", description: "Fetching latest node status..." });
            }}
            disabled={isFetching}
            data-testid="button-refresh-nodes-live"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading node status...</p>
          </div>
        ) : hasNodes ? (
          <div className="space-y-2">
            {allNodes.map((node: any, idx: number) => {
              const isConnected = node.status === "connected";
              const isOffline = node.status !== "connected";
              const truncatedId = (node.id || "").length > 12 ? `${node.id.slice(0, 12)}...` : (node.id || "");
              return (
                <div
                  key={node.id || idx}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-md ${isConnected ? "bg-muted/30" : "bg-muted/15 opacity-70"}`}
                  data-testid={`row-live-node-${node.id || idx}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isConnected ? "bg-green-500/10" : isOffline ? "bg-muted" : "bg-destructive/10"}`}>
                      {isConnected ? (
                        <Wifi className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-live-node-name-${node.id || idx}`}>{node.name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {node.source === "gateway" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] cursor-default">{truncatedId}</Badge>
                            </TooltipTrigger>
                            <TooltipContent>{node.id}</TooltipContent>
                          </Tooltip>
                        )}
                        {node.platform && (
                          <Badge variant="secondary" className="text-[10px]">{node.platform}</Badge>
                        )}
                        {node.ip && (
                          <span className="text-[10px] text-muted-foreground">{node.ip}</span>
                        )}
                        {node.caps && (
                          <Badge variant="secondary" className="text-[10px]">{node.caps}</Badge>
                        )}
                        {node.version && (
                          <span className="text-[10px] text-muted-foreground">v{node.version}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={isConnected ? "default" : "outline"}
                    className={`text-[10px] shrink-0 ${isConnected ? "" : "text-muted-foreground"}`}
                    data-testid={`badge-live-node-status-${node.id || idx}`}
                  >
                    {isConnected ? "Connected" : "Offline"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <Server className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {liveStatus?.gateway === "offline" ? "Gateway is offline. No node data available." : "No nodes detected on the gateway yet."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickStartGuide({ instanceId }: { instanceId: string | null }) {
  const { toast } = useToast();

  const { data: config } = useQuery<{ gatewayToken?: string; gatewayPort?: number }>({
    queryKey: ["/api/openclaw/config", instanceId],
    enabled: !!instanceId,
  });

  const { data: instance } = useQuery<{ serverUrl?: string }>({
    queryKey: ["/api/instances", instanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/instances`, { credentials: "include" });
      if (!resp.ok) return {};
      const list = await resp.json();
      return list.find((i: any) => i.id === instanceId) || {};
    },
    enabled: !!instanceId,
  });

  const gatewayToken = config?.gatewayToken || "";
  const gatewayPort = config?.gatewayPort || 18789;

  let gatewayHost = "<gateway-ip>";
  if (instance?.serverUrl) {
    try {
      const url = new URL(instance.serverUrl);
      gatewayHost = url.hostname;
    } catch {
      gatewayHost = instance.serverUrl.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    }
  }

  const proxyHost = typeof window !== "undefined" ? window.location.hostname : gatewayHost;

  const installCmdLinux = "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard";
  const installCmdWindows = "npm install -g openclaw@latest --ignore-scripts";
  const tokenCmdLinux = `openclaw config set gateway.auth.token "${gatewayToken}"`;
  const tokenCmdWindows = `openclaw config set gateway.auth.token "${gatewayToken}"`;
  const nodeRunCmdLinux = `openclaw node run --host ${gatewayHost} --port ${gatewayPort}`;
  const nodeRunCmdWindows = `openclaw node run --host ${proxyHost} --port 443 --tls`;
  const fullStep2Linux = `${tokenCmdLinux} && ${nodeRunCmdLinux}`;
  const fullStep2Windows = `${tokenCmdWindows}\n${nodeRunCmdWindows}`;

  const [quickStartOs, setQuickStartOs] = useState<"linux" | "windows">("linux");

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Command copied to clipboard." });
  };

  return (
    <Card data-testid="card-quick-start">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-semibold">Connect a Node in 3 Steps</h3>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5" data-testid="toggle-quick-start-os">
            <Button
              size="sm"
              variant={quickStartOs === "linux" ? "default" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setQuickStartOs("linux")}
              data-testid="button-quick-start-linux"
            >
              Linux / macOS
            </Button>
            <Button
              size="sm"
              variant={quickStartOs === "windows" ? "default" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setQuickStartOs("windows")}
              data-testid="button-quick-start-windows"
            >
              Windows
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Install the CLI</strong> on the machine you want to connect:
              </p>
              <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid="text-install-cmd">
                  {quickStartOs === "linux" ? installCmdLinux : installCmdWindows}
                </code>
                <Button size="icon" variant="ghost" onClick={() => copyText(quickStartOs === "linux" ? installCmdLinux : installCmdWindows)} className="shrink-0" data-testid="button-copy-install">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              {quickStartOs === "windows" && (
                <div className="rounded-md bg-muted/30 p-2 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Run this in <strong>PowerShell</strong> (as Administrator). The <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">--ignore-scripts</code> flag prevents native compilation errors on Windows. Connects securely via WSS through the dashboard proxy — no relay or port forwarding needed.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Set your gateway token and connect</strong> — copy and paste {quickStartOs === "windows" ? "these commands" : "this command"}:
              </p>
              <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" style={{ whiteSpace: quickStartOs === "windows" ? "pre-wrap" : undefined }} data-testid="text-full-connect-cmd">
                  {quickStartOs === "linux" ? fullStep2Linux : fullStep2Windows}
                </code>
                <Button size="icon" variant="ghost" onClick={() => copyText(quickStartOs === "linux" ? fullStep2Linux : fullStep2Windows)} className="shrink-0" data-testid="button-copy-connect">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              {!gatewayToken && (
                <div className="rounded-md bg-muted/30 p-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Gateway token not set yet. Add it in{" "}
                    <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">OpenClaw Config</Link>{" "}
                    or find it in <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">~/.openclaw/openclaw.json</code> on the gateway machine.
                  </p>
                </div>
              )}
              {gatewayHost === "<gateway-ip>" && (
                <div className="rounded-md bg-muted/30 p-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Server URL not set. Add it on the{" "}
                    <Link href="/settings/instances" className="text-primary underline-offset-4 hover:underline">Instances</Link> page to auto-fill the gateway IP.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Approve the node</strong> — it will appear in the "Pending Node Approvals" section below. Click <strong>Approve</strong> to add it to your network.
              </p>
              <p className="text-xs text-muted-foreground">
                Pending nodes are detected automatically. Hit <strong>Refresh Live Status</strong> above if you don't see it right away.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-dashed p-2.5 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Need the full walkthrough? Check the{" "}
            <Link href="/node-setup" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-0.5">
              Node Setup Wizard <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsMachines() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, any>>({});
  const [checkingHealthIds, setCheckingHealthIds] = useState<Set<string>>(new Set());
  const [sshNodeResult, setSSHNodeResult] = useState<{ output?: string; error?: string } | null>(null);
  const [sshNodeRunning, setSSHNodeRunning] = useState(false);
  const { selectedInstanceId } = useInstance();

  const { data: machines, isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: liveStatusData } = useQuery<any>({
    queryKey: ["/api/nodes/live-status-machines", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/nodes/live-status?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return null;
      return resp.json();
    },
    enabled: !!selectedInstanceId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const liveConnectedNames = new Set<string>();
  if (liveStatusData?.nodes) {
    for (const n of liveStatusData.nodes) {
      if (n.status === "connected") {
        if (n.name) liveConnectedNames.add(n.name.toLowerCase());
        if (n.id) liveConnectedNames.add(n.id.toLowerCase());
      }
    }
  }

  const machinesWithLiveStatus = (machines || []).map((m) => {
    const mIds = [m.hostname, m.name, m.displayName, m.ipAddress].filter(Boolean).map((s) => s!.toLowerCase());
    const isLiveConnected = mIds.some((mid) => liveConnectedNames.has(mid));
    return isLiveConnected ? { ...m, status: "connected" } : m;
  });

  const { data: gwConfig } = useQuery<{ gatewayToken?: string; gatewayPort?: number }>({
    queryKey: ["/api/openclaw/config", selectedInstanceId],
    enabled: !!selectedInstanceId,
  });

  const { data: gwInstance } = useQuery<{ serverUrl?: string }>({
    queryKey: ["/api/instances", selectedInstanceId, "gw"],
    queryFn: async () => {
      const resp = await fetch(`/api/instances`, { credentials: "include" });
      if (!resp.ok) return {};
      const list = await resp.json();
      return list.find((i: any) => i.id === selectedInstanceId) || {};
    },
    enabled: !!selectedInstanceId,
  });

  const { data: vpsConnection } = useQuery<{ vpsIp?: string }>({
    queryKey: ["/api/vps", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/vps?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return {};
      return resp.json();
    },
    enabled: !!selectedInstanceId,
  });

  const vpsIp = vpsConnection?.vpsIp || "";

  const gatewayToken = gwConfig?.gatewayToken || "";
  const gatewayPort = gwConfig?.gatewayPort || 18789;
  let gatewayHost = "<gateway-ip>";
  if (gwInstance?.serverUrl) {
    try {
      const url = new URL(gwInstance.serverUrl);
      gatewayHost = url.hostname;
    } catch {
      gatewayHost = gwInstance.serverUrl.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    }
  }

  interface PendingNode {
    id: string;
    hostname?: string;
    ip?: string;
    os?: string;
    location?: string;
    name?: string;
    displayName?: string;
    clientId?: string;
    platform?: string;
    role?: string;
  }

  const { data: pendingData, isLoading: pendingLoading } = useQuery<{ pending: PendingNode[]; source: string }>({
    queryKey: ["/api/nodes/pending", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/nodes/pending?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return { pending: [], source: "error" };
      return resp.json();
    },
    enabled: !!selectedInstanceId,
    refetchInterval: 30000,
  });

  const pendingNodes = pendingData?.pending ?? [];

  const { data: pairedData, isLoading: pairedLoading } = useQuery<{ paired: PendingNode[]; source: string }>({
    queryKey: ["/api/nodes/paired", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/nodes/paired?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return { paired: [], source: "error" };
      return resp.json();
    },
    enabled: !!selectedInstanceId,
    refetchInterval: 60000,
  });

  const pairedNodes = pairedData?.paired ?? [];

  const runSSHNodeCommand = async (action: string) => {
    setSSHNodeRunning(true);
    setSSHNodeResult(null);
    try {
      const resp = await apiRequest("POST", `/api/ssh/gateway/${action}`, { instanceId: selectedInstanceId });
      const data = await resp.json();
      setSSHNodeResult({ output: data.output, error: data.error });
      if (data.success) {
        toast({ title: "Command completed", description: `${action} executed successfully.` });
        queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", selectedInstanceId] });
        queryClient.invalidateQueries({ queryKey: ["/api/nodes/paired", selectedInstanceId] });
      } else {
        toast({ title: "Command failed", description: data.error || "SSH command did not succeed.", variant: "destructive" });
      }
    } catch (err: any) {
      setSSHNodeResult({ error: err.message || "Command failed" });
      toast({ title: "Error", description: err.message || "Failed to execute SSH command.", variant: "destructive" });
    } finally {
      setSSHNodeRunning(false);
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      const resp = await apiRequest("POST", `/api/nodes/approve?instanceId=${selectedInstanceId ?? ""}`, { node_id: nodeId });
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", selectedInstanceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config", selectedInstanceId] });
      toast({
        title: "Node approved",
        description: data.sshApproved
          ? "Node has been approved on the gateway and added to your network."
          : "Node has been approved locally. It will connect when the gateway syncs.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve node.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await apiRequest("POST", `/api/nodes/reject?instanceId=${selectedInstanceId ?? ""}`, { node_id: nodeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", selectedInstanceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config", selectedInstanceId] });
      toast({ title: "Node rejected", description: "Node has been removed from the pending list." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject node.", variant: "destructive" });
    },
  });

  const { data: probeResult } = useQuery<{ reachable: boolean; error?: string; serverUrl?: string }>({
    queryKey: ["/api/gateway/probe", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/gateway/probe?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return { reachable: false, error: "Request failed" };
      return resp.json();
    },
    enabled: !!selectedInstanceId,
    refetchInterval: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/gateway/sync?instanceId=${selectedInstanceId || ""}`, {});
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({
        title: "Synced from gateway",
        description: `Found ${data.total} node(s): ${data.created} added, ${data.updated} updated.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error?.message || "Could not reach the gateway. Check your server URL and gateway token.",
        variant: "destructive",
      });
    },
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
      displayName: "",
      remotePcAlias: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertMachine) => {
      await apiRequest("POST", "/api/machines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node added", description: "Node has been added to your inventory." });
      setDialogOpen(false);
      form.reset({
        name: "",
        hostname: "",
        ipAddress: "",
        os: "",
        location: "",
        status: "pending",
        displayName: "",
        remotePcAlias: "",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add node.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/machines/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status updated", description: "Node status has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const remotePcMutation = useMutation({
    mutationFn: async ({ id, remotePcAlias }: { id: string; remotePcAlias: string }) => {
      await apiRequest("PATCH", `/api/machines/${id}`, { remotePcAlias: remotePcAlias || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "RemotePC updated", description: "RemotePC alias has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update RemotePC alias.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/machines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node removed", description: "Node has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove node.", variant: "destructive" });
    },
  });

  const handleHealthCheck = async (machineId: string) => {
    setCheckingHealthIds((prev) => new Set(prev).add(machineId));
    try {
      const resp = await apiRequest("POST", `/api/machines/${machineId}/health-check?instanceId=${selectedInstanceId || ""}`);
      const result = await resp.json();
      setHealthResults((prev) => ({ ...prev, [machineId]: result }));
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({
        title: result.status === "connected" ? "Node is online" : result.noChecksPossible ? "Cannot check" : "Node unreachable",
        description: result.status === "connected"
          ? `Node responded successfully${result.results[0]?.latencyMs ? ` (${result.results[0].latencyMs}ms)` : ""}.`
          : result.noChecksPossible
          ? "Set an IP address or configure a gateway to check connectivity."
          : "Node did not respond to connectivity checks.",
        variant: result.status === "connected" ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Health check failed", description: err?.message || "Could not perform health check.", variant: "destructive" });
    } finally {
      setCheckingHealthIds((prev) => {
        const next = new Set(prev);
        next.delete(machineId);
        return next;
      });
    }
  };

  const handleCheckAllHealth = async () => {
    if (!machines || machines.length === 0) return;
    for (const machine of machines) {
      handleHealthCheck(machine.id);
    }
  };

  const onSubmit = (data: InsertMachine) => {
    createMutation.mutate(data);
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
            Nodes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track computers connected to your OpenClaw network.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {machines && machines.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleCheckAllHealth}
                  disabled={checkingHealthIds.size > 0}
                  data-testid="button-check-all-health"
                >
                  {checkingHealthIds.size > 0 ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-2" />
                  )}
                  Check All
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Run connectivity checks on all nodes</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-gateway"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync from Gateway
                {probeResult?.reachable && (
                  <CheckCircle2 className="h-3.5 w-3.5 ml-1.5 text-green-500" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {probeResult?.reachable
                ? `Connected to gateway at ${probeResult.serverUrl}`
                : "Gateway not directly reachable — sync may still work if the server is accessible."}
            </TooltipContent>
          </Tooltip>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-node">
              <Plus className="h-4 w-4 mr-2" />
              Add Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Node</DialogTitle>
              <DialogDescription>Track a computer in your OpenClaw network. The actual connection is handled through the CLI.</DialogDescription>
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
                        <Input placeholder="e.g. Office Desktop" {...field} value={field.value ?? ""} data-testid="input-display-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
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
                            <SelectItem value="windows">Windows (WSL2)</SelectItem>
                            <SelectItem value="macos">macOS</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="remotePcAlias"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RemotePC Alias (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. PodcastPC" {...field} value={field.value ?? ""} data-testid="input-remotepc-alias" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-node">
                    {createMutation.isPending ? "Adding..." : "Add Node"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <LiveGatewayBanner instanceId={selectedInstanceId} />

      <QuickStartGuide instanceId={selectedInstanceId} />

      <GatewayNodesLive instanceId={selectedInstanceId} />

      {pendingNodes.length > 0 && (
        <Card data-testid="card-pending-nodes">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="h-4 w-4" />
                  Pending Node Approvals
                </CardTitle>
                <CardDescription>
                  {pendingNodes.length} node{pendingNodes.length !== 1 ? "s" : ""} waiting for approval.
                  {(pendingData?.source === "gateway" || pendingData?.source === "cli") && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">Live from gateway</Badge>
                  )}
                  {pendingData?.source === "local" && (
                    <Badge variant="outline" className="ml-2 text-[10px]">Cached locally</Badge>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", selectedInstanceId] })}
                data-testid="button-refresh-pending"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`row-pending-node-${node.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-pending-hostname-${node.id}`}>
                          {node.hostname || node.name || node.id}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{node.id}</Badge>
                          {node.ip && node.ip !== "Unknown" && (
                            <span className="text-xs text-muted-foreground">{node.ip}</span>
                          )}
                          {node.os && node.os !== "Unknown" && (
                            <span className="text-xs text-muted-foreground">{node.os}</span>
                          )}
                          {node.location && node.location !== "Unknown" && (
                            <span className="text-xs text-muted-foreground">{node.location}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rejectMutation.mutate(node.id)}
                      disabled={rejectMutation.isPending || approveMutation.isPending}
                      data-testid={`button-reject-node-${node.id}`}
                    >
                      <ShieldX className="h-4 w-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(node.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      data-testid={`button-approve-node-${node.id}`}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 mr-1.5" />
                      )}
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking for pending nodes on the gateway...</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-gateway-nodes">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Signal className="h-4 w-4" />
                Gateway Node Management
              </CardTitle>
              <CardDescription>
                View and troubleshoot nodes directly on your gateway server via SSH.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/nodes/paired", selectedInstanceId] });
                  queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending", selectedInstanceId] });
                }}
                disabled={pairedLoading || pendingLoading}
                data-testid="button-refresh-gateway-nodes"
              >
                {(pairedLoading || pendingLoading) ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Paired Nodes</p>
              <p className="text-lg font-bold" data-testid="text-paired-count">{pairedNodes.length}</p>
              {pairedData?.source === "gateway" && (
                <Badge variant="secondary" className="text-[10px] mt-1">Live</Badge>
              )}
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Pending Approval</p>
              <p className="text-lg font-bold" data-testid="text-pending-count">{pendingNodes.length}</p>
              {pendingData?.source === "gateway" && (
                <Badge variant="secondary" className="text-[10px] mt-1">Live</Badge>
              )}
            </div>
          </div>

          {pairedNodes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paired Nodes on Gateway</p>
              {pairedNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30"
                  data-testid={`row-paired-node-${node.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-500/10">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{node.displayName || node.hostname || node.name || node.clientId || node.id}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {node.platform && (
                          <Badge variant="secondary" className="text-[10px]">{node.platform}</Badge>
                        )}
                        {node.role && (
                          <Badge variant="outline" className="text-[10px]">{node.role}</Badge>
                        )}
                        {node.ip && node.ip !== "Unknown" && (
                          <span className="text-[10px] text-muted-foreground">{node.ip}</span>
                        )}
                        {node.os && node.os !== "Unknown" && !node.platform && (
                          <span className="text-[10px] text-muted-foreground">{node.os}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[10px] shrink-0">Paired</Badge>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">SSH Troubleshooting</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("list-nodes")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-list-nodes"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Terminal className="h-3 w-3 mr-1.5" />}
                List Nodes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("check-config")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-check-config"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Info className="h-3 w-3 mr-1.5" />}
                Check Config
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("gateway-info")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-gateway-info"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Activity className="h-3 w-3 mr-1.5" />}
                Gateway Info
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("check-node-json")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-check-node-json"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Info className="h-3 w-3 mr-1.5" />}
                Node JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("diagnose")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-diagnose"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <AlertCircle className="h-3 w-3 mr-1.5" />}
                Diagnose
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSSHNodeCommand("view-log")}
                disabled={sshNodeRunning}
                data-testid="button-ssh-view-log"
              >
                {sshNodeRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Terminal className="h-3 w-3 mr-1.5" />}
                View Log
              </Button>
            </div>
            {sshNodeResult && (
              <div className="mt-3 rounded-md bg-muted/50 p-3" data-testid="ssh-node-output">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                  {sshNodeResult.output || sshNodeResult.error || "No output"}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {machinesWithLiveStatus && machinesWithLiveStatus.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tracked Nodes</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {machinesWithLiveStatus.map((machine) => (
              <NodeCard
                key={machine.id}
                machine={machine}
                onDelete={(id) => deleteMutation.mutate(id)}
                onStatusChange={(id, status) => updateMutation.mutate({ id, status })}
                onHealthCheck={handleHealthCheck}
                onRemotePcSave={(id, alias) => remotePcMutation.mutate({ id, remotePcAlias: alias })}
                isCheckingHealth={checkingHealthIds.has(machine.id)}
                healthResult={healthResults[machine.id] || null}
                gatewayHost={gatewayHost}
                gatewayPort={gatewayPort}
                gatewayToken={gatewayToken}
                vpsIp={vpsIp}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-sm font-semibold mb-1">No nodes tracked yet</h3>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Connect a node using the steps above, or use "Sync from Gateway" to import nodes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
