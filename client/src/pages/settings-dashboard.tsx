import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/hooks/use-instance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Terminal, Copy, Loader2, Server, Globe, Key, Wifi } from "lucide-react";
import type { OpenclawConfig } from "@shared/schema";

export default function SettingsDashboard() {
  const { selectedInstanceId, selectedInstance } = useInstance();
  const { toast } = useToast();
  const instanceId = selectedInstanceId;

  const { data: config } = useQuery<OpenclawConfig>({
    queryKey: ["/api/openclaw/config", instanceId],
    enabled: !!instanceId,
  });

  const probeGatewayQuery = useQuery<{ reachable: boolean }>({
    queryKey: ["/api/openclaw/probe", instanceId],
    enabled: !!instanceId && !!selectedInstance?.serverUrl,
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
            Access and monitor your OpenClaw gateway's native dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          {liveStatusQuery.data?.gateway === "online" ? (
            <Badge variant="default" className="bg-green-600 text-white" data-testid="badge-gateway-live">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              Gateway Online
            </Badge>
          ) : liveStatusQuery.data?.gateway === "offline" ? (
            <Badge variant="destructive" data-testid="badge-gateway-live">Gateway Offline</Badge>
          ) : (
            <Badge variant="secondary" data-testid="badge-gateway-live">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Checking...
            </Badge>
          )}
        </div>
      </div>

      <Card data-testid="card-dashboard-access">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Native OpenClaw Dashboard
          </CardTitle>
          <CardDescription>
            The gateway dashboard requires a secure context (localhost). Use the SSH tunnel to access it from your local machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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

          {liveStatusQuery.data && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground min-w-28">Connected Nodes:</span>
              <span data-testid="text-node-counts">
                {liveStatusQuery.data.pairedCount} paired, {liveStatusQuery.data.pendingCount} pending
              </span>
            </div>
          )}
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
