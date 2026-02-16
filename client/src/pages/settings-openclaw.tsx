import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Cog, Network, MessageSquare, Globe, CheckCircle, XCircle, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import type { OpenclawConfig, DockerService } from "@shared/schema";

export default function SettingsOpenclaw() {
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery<OpenclawConfig | null>({
    queryKey: ["/api/openclaw/config"],
  });

  const { data: dockerServices, isLoading: dockerLoading } = useQuery<DockerService[]>({
    queryKey: ["/api/docker/services"],
  });

  const isLoading = configLoading || dockerLoading;

  const [formValues, setFormValues] = useState({
    gatewayPort: 18789,
    gatewayBind: "127.0.0.1",
    gatewayMode: "local",
    defaultLlm: "openrouter/deepseek-chat",
    fallbackLlm: "openrouter/auto",
    whatsappEnabled: false,
    whatsappPhone: "",
    tailscaleEnabled: false,
  });

  useEffect(() => {
    if (config) {
      setFormValues({
        gatewayPort: config.gatewayPort,
        gatewayBind: config.gatewayBind,
        gatewayMode: config.gatewayMode,
        defaultLlm: config.defaultLlm,
        fallbackLlm: config.fallbackLlm,
        whatsappEnabled: config.whatsappEnabled,
        whatsappPhone: config.whatsappPhone ?? "",
        tailscaleEnabled: config.tailscaleEnabled,
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formValues) => {
      await apiRequest("POST", "/api/openclaw/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/docker/services"] });
      toast({ title: "Configuration saved", description: "OpenClaw settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await apiRequest("POST", "/api/nodes/approve", { node_id: nodeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config"] });
      toast({ title: "Node approved", description: "Node has been approved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve node.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  interface PendingNode {
    id: string;
    hostname: string;
    ip: string;
    os: string;
    location: string;
  }

  const rawNodes = (config?.pendingNodes as any[]) ?? [];
  const pendingNodes: PendingNode[] = rawNodes.map((n) =>
    typeof n === "string" ? { id: n, hostname: n, ip: "Unknown", os: "Unknown", location: "Unknown" } : n
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          OpenClaw Config
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure gateway, LLM, integrations, and node management.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-gateway-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Cog className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Gateway</p>
            </div>
            <Badge variant={config?.gatewayStatus === "online" ? "default" : "destructive"}>
              {config?.gatewayStatus ?? "offline"}
            </Badge>
          </CardContent>
        </Card>
        <Card data-testid="card-llm-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Default LLM</p>
            </div>
            <p className="text-sm font-semibold" data-testid="text-default-llm">{config?.defaultLlm ?? "none"}</p>
            <p className="text-xs text-muted-foreground mt-1">Fallback: {config?.fallbackLlm ?? "none"}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-nodes-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Approved Nodes</p>
            </div>
            <p className="text-sm font-semibold">{config?.nodesApproved ?? 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-tailscale-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Tailscale</p>
            </div>
            <Badge variant={config?.tailscaleEnabled ? "default" : "secondary"}>
              {config?.tailscaleEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Gateway Settings
          </CardTitle>
          <CardDescription>Configure the OpenClaw gateway server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="gateway_port">Port</Label>
              <Input
                id="gateway_port"
                type="number"
                value={formValues.gatewayPort}
                onChange={(e) => setFormValues((p) => ({ ...p, gatewayPort: parseInt(e.target.value) || 18789 }))}
                data-testid="input-gateway-port"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gateway_bind">Bind Address</Label>
              <Input
                id="gateway_bind"
                value={formValues.gatewayBind}
                onChange={(e) => setFormValues((p) => ({ ...p, gatewayBind: e.target.value }))}
                data-testid="input-gateway-bind"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gateway_mode">Mode</Label>
              <Select value={formValues.gatewayMode} onValueChange={(val) => setFormValues((p) => ({ ...p, gatewayMode: val }))}>
                <SelectTrigger data-testid="select-gateway-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default_llm">Default LLM</Label>
              <Select value={formValues.defaultLlm} onValueChange={(val) => setFormValues((p) => ({ ...p, defaultLlm: val }))}>
                <SelectTrigger data-testid="select-default-llm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter/deepseek-chat">OpenRouter / DeepSeek Chat</SelectItem>
                  <SelectItem value="openrouter/auto">OpenRouter / Auto</SelectItem>
                  <SelectItem value="openrouter/gpt-4o">OpenRouter / GPT-4o</SelectItem>
                  <SelectItem value="openrouter/claude-sonnet">OpenRouter / Claude Sonnet</SelectItem>
                  <SelectItem value="openrouter/llama-3">OpenRouter / Llama 3</SelectItem>
                  <SelectItem value="openrouter/mixtral">OpenRouter / Mixtral</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback_llm">Fallback LLM</Label>
              <Select value={formValues.fallbackLlm} onValueChange={(val) => setFormValues((p) => ({ ...p, fallbackLlm: val }))}>
                <SelectTrigger data-testid="select-fallback-llm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter/auto">OpenRouter / Auto</SelectItem>
                  <SelectItem value="openrouter/deepseek-chat">OpenRouter / DeepSeek Chat</SelectItem>
                  <SelectItem value="openrouter/gpt-4o">OpenRouter / GPT-4o</SelectItem>
                  <SelectItem value="openrouter/claude-sonnet">OpenRouter / Claude Sonnet</SelectItem>
                  <SelectItem value="openrouter/llama-3">OpenRouter / Llama 3</SelectItem>
                  <SelectItem value="openrouter/mixtral">OpenRouter / Mixtral</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp Integration
            </CardTitle>
            <CardDescription>Connect WhatsApp messaging to your platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div>
                <Label>WhatsApp Bridge</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Enable the WhatsApp messaging bridge</p>
              </div>
              <Switch
                checked={formValues.whatsappEnabled}
                onCheckedChange={(checked) => setFormValues((p) => ({ ...p, whatsappEnabled: checked }))}
                data-testid="switch-whatsapp-enabled"
              />
            </div>
            {formValues.whatsappEnabled && (
              <div className="space-y-2">
                <Label htmlFor="whatsapp_phone">WhatsApp Phone Number</Label>
                <Input
                  id="whatsapp_phone"
                  value={formValues.whatsappPhone}
                  onChange={(e) => setFormValues((p) => ({ ...p, whatsappPhone: e.target.value }))}
                  placeholder="+1 234 567 8900"
                  data-testid="input-whatsapp-phone"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Tailscale VPN
            </CardTitle>
            <CardDescription>Secure mesh networking for your nodes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div>
                <Label>Tailscale Network</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Enable Tailscale mesh VPN</p>
              </div>
              <Switch
                checked={formValues.tailscaleEnabled}
                onCheckedChange={(checked) => setFormValues((p) => ({ ...p, tailscaleEnabled: checked }))}
                data-testid="switch-tailscale-enabled"
              />
            </div>
            {config?.tailscaleIp && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Tailscale IP</p>
                <p className="text-sm font-semibold mt-1" data-testid="text-tailscale-ip">{config.tailscaleIp}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dockerServices && dockerServices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Docker Services</CardTitle>
            <CardDescription>Running containers on your VPS.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dockerServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`row-docker-service-${service.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {service.status === "running" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium" data-testid={`text-docker-name-${service.id}`}>{service.serviceName}</p>
                      <p className="text-xs text-muted-foreground">{service.image}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {service.port && (
                      <span className="text-xs text-muted-foreground">:{service.port}</span>
                    )}
                    <Badge variant={service.status === "running" ? "default" : "secondary"}>
                      {service.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingNodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4" />
              Pending Node Approvals
            </CardTitle>
            <CardDescription>{pendingNodes.length} node{pendingNodes.length !== 1 ? "s" : ""} waiting for approval.</CardDescription>
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
                      <p className="text-sm font-medium" data-testid={`text-node-hostname-${node.id}`}>{node.hostname}</p>
                      <Badge variant="secondary" className="text-xs">{node.id}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground" data-testid={`text-node-ip-${node.id}`}>{node.ip}</span>
                      <span className="text-xs text-muted-foreground">{node.os}</span>
                      <span className="text-xs text-muted-foreground">{node.location}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => approveMutation.mutate(node.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-node-${node.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate(formValues)}
          disabled={saveMutation.isPending}
          data-testid="button-save-openclaw"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
