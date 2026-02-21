import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useInstance } from "@/hooks/use-instance";
import { Save, Wifi, WifiOff, RefreshCw, Server, Terminal, Copy, Check, Clock, History } from "lucide-react";
import { useState, useEffect } from "react";
import type { VpsConnection, VpsConnectionLog } from "@shared/schema";

export default function SettingsVps() {
  const { toast } = useToast();
  const { selectedInstanceId } = useInstance();
  const [copiedCmd, setCopiedCmd] = useState(false);

  const { data: vps, isLoading } = useQuery<VpsConnection | null>({
    queryKey: ["/api/vps", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/vps?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch VPS");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const { data: connectionLogs } = useQuery<VpsConnectionLog[]>({
    queryKey: ["/api/vps/logs", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/vps/logs?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const [formValues, setFormValues] = useState({
    vpsIp: "187.77.194.205",
    vpsPort: 22,
    sshUser: "root",
    sshKeyPath: "",
  });

  useEffect(() => {
    if (vps) {
      setFormValues({
        vpsIp: vps.vpsIp,
        vpsPort: vps.vpsPort,
        sshUser: vps.sshUser,
        sshKeyPath: vps.sshKeyPath ?? "",
      });
    }
  }, [vps]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formValues) => {
      await apiRequest("POST", `/api/vps?instanceId=${selectedInstanceId ?? ""}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vps", selectedInstanceId] });
      toast({ title: "VPS settings saved", description: "Connection configuration updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save VPS settings.", variant: "destructive" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/vps/check?instanceId=${selectedInstanceId ?? ""}`);
      return res.json();
    },
    onSuccess: (data: { connected: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vps", selectedInstanceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/vps/logs", selectedInstanceId] });
      if (data.connected) {
        toast({ title: "Connected", description: "VPS connection is active." });
      } else {
        toast({ title: "Disconnected", description: "Unable to reach VPS.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Connection check failed.", variant: "destructive" });
    },
  });

  const sshCommand = vps
    ? `ssh ${vps.sshKeyPath ? `-i ${vps.sshKeyPath} ` : ""}${vps.sshUser}@${vps.vpsIp} -p ${vps.vpsPort}`
    : "";

  const copySshCommand = () => {
    navigator.clipboard.writeText(sshCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          VPS Connection
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your VPS server connection, SSH settings, and view connection history.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Connection Status</CardTitle>
            <CardDescription>Current state of your VPS connection.</CardDescription>
          </div>
          <Badge
            variant={vps?.isConnected ? "default" : "destructive"}
            data-testid="badge-vps-status"
          >
            {vps?.isConnected ? (
              <><Wifi className="h-3 w-3 mr-1" /> Connected</>
            ) : (
              <><WifiOff className="h-3 w-3 mr-1" /> Disconnected</>
            )}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 text-center mt-2">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">IP Address</p>
              <p className="text-sm font-semibold mt-1" data-testid="text-vps-ip">{vps?.vpsIp ?? "Not set"}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Port</p>
              <p className="text-sm font-semibold mt-1" data-testid="text-vps-port">{vps?.vpsPort ?? 22}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Last Checked</p>
              <p className="text-sm font-semibold mt-1" data-testid="text-vps-last-checked">
                {vps?.lastChecked ? new Date(vps.lastChecked).toLocaleString() : "Never"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
              data-testid="button-check-vps"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              {checkMutation.isPending ? "Checking..." : "Test Connection"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {sshCommand && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Quick SSH Command
            </CardTitle>
            <CardDescription>
              Copy this command to connect to your VPS from any terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <code className="flex-1 text-sm font-mono break-all" data-testid="text-ssh-command">
                {sshCommand}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={copySshCommand}
                data-testid="button-copy-ssh"
              >
                {copiedCmd ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            SSH Configuration
          </CardTitle>
          <CardDescription>Configure your VPS SSH connection details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vps_ip">VPS IP Address</Label>
              <Input
                id="vps_ip"
                value={formValues.vpsIp}
                onChange={(e) => setFormValues((p) => ({ ...p, vpsIp: e.target.value }))}
                placeholder="187.77.194.205"
                data-testid="input-vps-ip"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vps_port">SSH Port</Label>
              <Input
                id="vps_port"
                type="number"
                value={formValues.vpsPort}
                onChange={(e) => setFormValues((p) => ({ ...p, vpsPort: parseInt(e.target.value) || 22 }))}
                data-testid="input-vps-port"
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ssh_user">SSH User</Label>
              <Input
                id="ssh_user"
                value={formValues.sshUser}
                onChange={(e) => setFormValues((p) => ({ ...p, sshUser: e.target.value }))}
                placeholder="root"
                data-testid="input-ssh-user"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh_key_path" className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                SSH Key Path
              </Label>
              <Input
                id="ssh_key_path"
                value={formValues.sshKeyPath}
                onChange={(e) => setFormValues((p) => ({ ...p, sshKeyPath: e.target.value }))}
                placeholder="/root/.ssh/id_rsa"
                data-testid="input-ssh-key-path"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate(formValues)}
          disabled={saveMutation.isPending}
          data-testid="button-save-vps"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Connection History
          </CardTitle>
          <CardDescription>Recent connection test results.</CardDescription>
        </CardHeader>
        <CardContent>
          {connectionLogs && connectionLogs.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {connectionLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2 border-b last:border-0"
                  data-testid={`row-log-${log.id}`}
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    log.status === "connected" ? "bg-green-500" : "bg-red-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" data-testid={`text-log-message-${log.id}`}>
                      {log.message}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(log.checkedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8">
              <History className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No connection tests yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Test Connection" above to start tracking.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
