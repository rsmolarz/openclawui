import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Wifi, WifiOff, RefreshCw, Server, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import type { VpsConnection } from "@shared/schema";

export default function SettingsVps() {
  const { toast } = useToast();

  const { data: vps, isLoading } = useQuery<VpsConnection | null>({
    queryKey: ["/api/vps"],
  });

  const [formValues, setFormValues] = useState({
    vpsIp: "187.77.192.215",
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
      await apiRequest("POST", "/api/vps", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vps"] });
      toast({ title: "VPS settings saved", description: "Connection configuration updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save VPS settings.", variant: "destructive" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vps/check");
      return res.json();
    },
    onSuccess: (data: { connected: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vps"] });
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
          Manage your VPS server connection and SSH settings.
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
                placeholder="187.77.192.215"
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
    </div>
  );
}
