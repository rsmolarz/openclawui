import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/hooks/use-instance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink, Terminal, Copy, Loader2, Server, Globe, Key, Wifi,
  Monitor, ChevronDown, ChevronUp, MessageSquare, Bot, Clock,
  RefreshCw, CheckCircle, XCircle, Activity, Users, Smartphone
} from "lucide-react";
import type { OpenclawConfig } from "@shared/schema";

interface GatewayHealth {
  ok: boolean;
  ts?: number;
  durationMs?: number;
  error?: string;
  channels?: {
    whatsapp?: {
      configured: boolean;
      linked: boolean;
      running: boolean;
      connected: boolean;
      self?: { e164: string | null; jid: string | null };
      lastConnectedAt?: string | null;
      lastDisconnect?: any;
      lastMessageAt?: string | null;
      lastError?: string | null;
      accounts?: Record<string, any>;
    };
  };
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  heartbeatSeconds?: number;
  defaultAgentId?: string;
  agents?: Array<{
    agentId: string;
    isDefault: boolean;
    heartbeat?: { enabled: boolean; every: string };
    sessions?: {
      count: number;
      recent: Array<{ key: string; updatedAt: number; age: number }>;
    };
  }>;
  sessions?: {
    count: number;
    recent: Array<{ key: string; updatedAt: number; age: number }>;
  };
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ ok, label, loading }: { ok: boolean; label: string; loading?: boolean }) {
  if (loading) return <Badge variant="secondary" data-testid={`badge-${label.toLowerCase()}`}><Loader2 className="h-3 w-3 mr-1 animate-spin" />{label}</Badge>;
  return ok
    ? <Badge variant="default" className="bg-green-600 text-white" data-testid={`badge-${label.toLowerCase()}`}><CheckCircle className="h-3 w-3 mr-1" />{label}</Badge>
    : <Badge variant="destructive" data-testid={`badge-${label.toLowerCase()}`}><XCircle className="h-3 w-3 mr-1" />{label}</Badge>;
}

export default function SettingsDashboard() {
  const { selectedInstanceId, selectedInstance } = useInstance();
  const { toast } = useToast();
  const instanceId = selectedInstanceId;
  const [showSshTunnel, setShowSshTunnel] = useState(false);

  const { data: config } = useQuery<OpenclawConfig>({
    queryKey: ["/api/openclaw/config", instanceId],
    enabled: !!instanceId,
  });

  const probeGatewayQuery = useQuery<{ reachable: boolean }>({
    queryKey: ["/api/gateway/probe", instanceId],
    enabled: !!instanceId && !!selectedInstance?.serverUrl,
    refetchInterval: 30000,
  });

  const healthQuery = useQuery<GatewayHealth>({
    queryKey: ["/api/gateway/health", instanceId],
    enabled: !!instanceId,
    refetchInterval: 30000,
  });

  const liveStatusQuery = useQuery<{
    gateway: string;
    pairedCount: number;
    pendingCount: number;
  }>({
    queryKey: ["/api/nodes/live-status", instanceId],
    enabled: !!instanceId,
    refetchInterval: 60000,
  });

  const getPort = () => {
    try {
      const u = new URL(selectedInstance?.serverUrl || "");
      return u.port || config?.gatewayPort || 18789;
    } catch {
      return config?.gatewayPort || 18789;
    }
  };

  const getHost = () => {
    try {
      return new URL(selectedInstance?.serverUrl || "").hostname;
    } catch {
      return "your-vps-ip";
    }
  };

  const sshCmd = `ssh -L ${getPort()}:localhost:${getPort()} root@${getHost()}`;
  const dashboardLocalUrl = `http://localhost:${getPort()}/`;
  const nativeDashboardUrl = `/gateway-proxy/${instanceId}/`;

  const handleOpenDashboard = () => {
    window.open(nativeDashboardUrl, "_blank", "noopener,noreferrer");
  };

  const health = healthQuery.data;
  const whatsapp = health?.channels?.whatsapp;

  if (!instanceId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground">Select an instance to view its dashboard access details.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gateway status and monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              healthQuery.refetch();
              liveStatusQuery.refetch();
              probeGatewayQuery.refetch();
            }}
            disabled={healthQuery.isFetching}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${healthQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {health?.ok ? (
            <Badge variant="default" className="bg-green-600 text-white" data-testid="badge-gateway-live">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              Gateway Online
            </Badge>
          ) : healthQuery.isLoading ? (
            <Badge variant="secondary" data-testid="badge-gateway-live">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Checking...
            </Badge>
          ) : (
            <Badge variant="destructive" data-testid="badge-gateway-live">Gateway Offline</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-gateway-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${health?.ok ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                <Activity className={`h-5 w-5 ${health?.ok ? "text-green-600" : "text-red-600"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gateway</p>
                <p className="text-lg font-bold" data-testid="text-gateway-status">{health?.ok ? "Online" : healthQuery.isLoading ? "..." : "Offline"}</p>
              </div>
            </div>
            {health?.durationMs != null && (
              <p className="text-xs text-muted-foreground" data-testid="text-health-latency">Health check: {health.durationMs}ms</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-whatsapp-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${whatsapp?.connected ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                <MessageSquare className={`h-5 w-5 ${whatsapp?.connected ? "text-green-600" : "text-amber-600"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">WhatsApp (Gateway)</p>
                <p className="text-lg font-bold" data-testid="text-whatsapp-gw-status">
                  {healthQuery.isLoading ? "..." : whatsapp?.connected ? "Connected" : whatsapp?.linked ? "Disconnected" : whatsapp?.configured ? "Not Linked" : "Not Configured"}
                </p>
              </div>
            </div>
            {whatsapp?.self?.e164 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Smartphone className="h-3 w-3" />
                {whatsapp.self.e164}
              </p>
            )}
            {!whatsapp?.linked && whatsapp !== undefined && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid="text-whatsapp-hint">
                Run `openclaw channels login` on VPS to re-link
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-nodes-summary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Devices</p>
                <p className="text-lg font-bold" data-testid="text-device-counts">
                  {liveStatusQuery.isLoading ? "..." : `${liveStatusQuery.data?.pairedCount ?? 0} paired`}
                </p>
              </div>
            </div>
            {liveStatusQuery.data?.pendingCount ? (
              <p className="text-xs text-amber-600" data-testid="text-pending-count">
                {liveStatusQuery.data.pendingCount} pending approval
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {health?.agents && health.agents.length > 0 && (
        <Card data-testid="card-agents">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {health.agents.map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30" data-testid={`agent-${agent.agentId}`}>
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {agent.agentId}
                        {agent.isDefault && <Badge variant="secondary" className="ml-2 text-[10px]">default</Badge>}
                      </p>
                      {agent.heartbeat?.enabled && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Heartbeat every {agent.heartbeat.every}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{agent.sessions?.count ?? 0} session(s)</p>
                    {agent.sessions?.recent?.[0] && (
                      <p className="text-xs text-muted-foreground">
                        Last active: {formatAge(agent.sessions.recent[0].age)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {health?.error && !health.ok && (
        <Card className="border-destructive" data-testid="card-health-error">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <XCircle className="h-4 w-4" />
              <p className="text-sm font-medium">Gateway Health Error</p>
            </div>
            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded" data-testid="text-health-error">
              {health.error}
            </p>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-dashboard-access">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Native OpenClaw Dashboard
          </CardTitle>
          <CardDescription>
            Access the gateway's built-in control UI. For best results, use the SSH tunnel method below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              onClick={handleOpenDashboard}
              disabled={!probeGatewayQuery.data?.reachable && !health?.ok}
              className="gap-2"
              data-testid="button-open-dashboard"
            >
              <ExternalLink className="h-4 w-4" />
              Open Dashboard
            </Button>
            {probeGatewayQuery.isLoading ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking gateway...
              </span>
            ) : probeGatewayQuery.data?.reachable ? (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                Gateway reachable
              </span>
            ) : (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                Proxy may require device approval — use SSH tunnel for reliable access
              </span>
            )}
          </div>

          <div className="border-t pt-4">
            <button
              onClick={() => setShowSshTunnel(!showSshTunnel)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              data-testid="button-toggle-ssh-tunnel"
            >
              {showSshTunnel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <Terminal className="h-4 w-4" />
              SSH Tunnel Access (Recommended)
            </button>

            {showSshTunnel && (
              <div className="mt-3 space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border space-y-3" data-testid="ssh-tunnel-section">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Terminal className="h-4 w-4" />
                    Step 1: Open SSH Tunnel
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Run this command in your terminal to create a secure tunnel to the gateway:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-background px-3 py-2 rounded text-xs flex-1 truncate border font-mono" data-testid="text-ssh-cmd">
                      {sshCmd}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(sshCmd);
                        toast({ title: "Copied", description: "SSH tunnel command copied. Run this in your terminal." });
                      }}
                      data-testid="button-copy-ssh"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border space-y-3" data-testid="open-dashboard-section">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    Step 2: Open Dashboard
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Once the tunnel is running, open this URL in your browser:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-background px-3 py-2 rounded text-xs flex-1 truncate border font-mono" data-testid="text-dashboard-local-url">
                      {dashboardLocalUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(dashboardLocalUrl);
                        toast({ title: "Copied", description: "Dashboard URL copied. Open this in your browser after starting the SSH tunnel." });
                      }}
                      data-testid="button-copy-dashboard-url"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-connection-details">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Connection Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground min-w-28">Server URL:</span>
            <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate" data-testid="text-server-url">
              {selectedInstance?.serverUrl || "Not configured"}
            </code>
            {selectedInstance?.serverUrl && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(selectedInstance!.serverUrl!);
                  toast({ title: "Copied", description: "Server URL copied." });
                }}
                data-testid="button-copy-server-url"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground min-w-28">WebSocket URL:</span>
            <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate" data-testid="text-ws-url">
              {config?.websocketUrl || `ws://${getHost()}:${getPort()}`}
            </code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const ws = config?.websocketUrl || `ws://${getHost()}:${getPort()}`;
                navigator.clipboard.writeText(ws);
                toast({ title: "Copied", description: "WebSocket URL copied." });
              }}
              data-testid="button-copy-ws-url"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>

          {config?.gatewayToken && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground min-w-28">Gateway Token:</span>
              <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate font-mono" data-testid="text-gateway-token">
                {config.gatewayToken.slice(0, 8)}...{config.gatewayToken.slice(-8)}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(config.gatewayToken!);
                  toast({ title: "Copied", description: "Gateway token copied." });
                }}
                data-testid="button-copy-token"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground min-w-28">Port Reachable:</span>
            {probeGatewayQuery.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : probeGatewayQuery.data?.reachable ? (
              <Badge variant="default" className="bg-green-600 text-white text-xs" data-testid="badge-port-status">
                <Wifi className="h-3 w-3 mr-1" />
                Yes
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs" data-testid="badge-port-status">
                Unreachable
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {config?.gatewayToken && (
        <Card data-testid="card-bearer-auth">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Access
            </CardTitle>
            <CardDescription>
              Use this Bearer token to authenticate API requests to the gateway.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-3 py-2 rounded text-xs flex-1 truncate border font-mono" data-testid="text-bearer-header">
                Authorization: Bearer {config.gatewayToken.slice(0, 12)}...
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`Authorization: Bearer ${config.gatewayToken}`);
                  toast({ title: "Copied", description: "Authorization header copied." });
                }}
                data-testid="button-copy-bearer"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy Header
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}