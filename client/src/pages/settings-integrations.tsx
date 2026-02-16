import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Send,
  Hash,
  MessagesSquare,
  Network,
  Webhook,
  Radio,
  Mail,
  Brain,
  Workflow,
  Plus,
  Settings,
  Trash2,
  ExternalLink,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Integration } from "@shared/schema";

const iconMap: Record<string, LucideIcon> = {
  MessageCircle,
  Send,
  Hash,
  MessagesSquare,
  Network,
  Webhook,
  Radio,
  Mail,
  Brain,
  Workflow,
};

const categoryLabels: Record<string, string> = {
  messaging: "Messaging",
  networking: "Networking",
  automation: "Automation",
  iot: "IoT",
  notifications: "Notifications",
  ai: "AI / LLM",
};

const categoryOrder = ["messaging", "ai", "networking", "automation", "notifications", "iot"];

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  connected: "default",
  configured: "secondary",
  not_configured: "outline",
  error: "destructive",
  disconnected: "destructive",
};

function getConfigFields(type: string): { key: string; label: string; sensitive?: boolean }[] {
  switch (type) {
    case "whatsapp":
      return [
        { key: "phone", label: "Phone Number" },
        { key: "apiKey", label: "API Key", sensitive: true },
        { key: "webhookUrl", label: "Webhook URL" },
      ];
    case "telegram":
      return [
        { key: "botToken", label: "Bot Token", sensitive: true },
        { key: "chatId", label: "Chat ID" },
        { key: "webhookUrl", label: "Webhook URL" },
      ];
    case "discord":
      return [
        { key: "botToken", label: "Bot Token", sensitive: true },
        { key: "guildId", label: "Server (Guild) ID" },
        { key: "channelId", label: "Channel ID" },
      ];
    case "slack":
      return [
        { key: "botToken", label: "Bot Token", sensitive: true },
        { key: "signingSecret", label: "Signing Secret", sensitive: true },
        { key: "channelId", label: "Channel ID" },
      ];
    case "tailscale":
      return [
        { key: "authKey", label: "Auth Key", sensitive: true },
        { key: "tailnetName", label: "Tailnet Name" },
        { key: "hostname", label: "Hostname" },
      ];
    case "webhook":
      return [
        { key: "url", label: "Webhook URL" },
        { key: "secret", label: "Secret", sensitive: true },
      ];
    case "mqtt":
      return [
        { key: "brokerUrl", label: "Broker URL" },
        { key: "username", label: "Username" },
        { key: "password", label: "Password", sensitive: true },
        { key: "topic", label: "Topic" },
      ];
    case "email":
      return [
        { key: "smtpHost", label: "SMTP Host" },
        { key: "smtpPort", label: "SMTP Port" },
        { key: "username", label: "Username" },
        { key: "password", label: "Password", sensitive: true },
        { key: "fromAddress", label: "From Address" },
      ];
    case "openrouter":
      return [
        { key: "apiKey", label: "API Key", sensitive: true },
        { key: "defaultModel", label: "Default Model" },
        { key: "fallbackModel", label: "Fallback Model" },
      ];
    case "n8n":
      return [
        { key: "instanceUrl", label: "Instance URL" },
        { key: "apiKey", label: "API Key", sensitive: true },
        { key: "webhookPath", label: "Webhook Path" },
      ];
    default:
      return [];
  }
}

function IntegrationCard({
  integration,
  onConfigure,
  onToggle,
  onDelete,
}: {
  integration: Integration;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const Icon = iconMap[integration.icon || ""] || Settings;

  return (
    <Card data-testid={`card-integration-${integration.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold" data-testid={`text-integration-name-${integration.id}`}>
                  {integration.name}
                </h3>
                <Badge
                  variant={statusColors[integration.status] || "outline"}
                  className="text-[10px]"
                  data-testid={`badge-integration-status-${integration.id}`}
                >
                  {integration.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {integration.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  {categoryLabels[integration.category] || integration.category}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={integration.enabled}
              onCheckedChange={onToggle}
              data-testid={`switch-integration-${integration.id}`}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onConfigure}
            data-testid={`button-configure-${integration.id}`}
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            Configure
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive"
            data-testid={`button-delete-integration-${integration.id}`}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const availableIntegrations = [
  { name: "WhatsApp", type: "whatsapp", category: "messaging", icon: "MessageCircle", description: "Connect WhatsApp Business API to send and receive messages through OpenClaw agents." },
  { name: "Telegram", type: "telegram", category: "messaging", icon: "Send", description: "Integrate Telegram Bot API for agent messaging and notifications." },
  { name: "Discord", type: "discord", category: "messaging", icon: "Hash", description: "Connect Discord bots to interact with users through channels and DMs." },
  { name: "Slack", type: "slack", category: "messaging", icon: "MessagesSquare", description: "Integrate Slack workspace for team notifications and agent interactions." },
  { name: "Tailscale", type: "tailscale", category: "networking", icon: "Network", description: "Secure mesh VPN for connecting nodes across networks." },
  { name: "Webhook", type: "webhook", category: "automation", icon: "Webhook", description: "Send event notifications to external services via HTTP webhooks." },
  { name: "MQTT", type: "mqtt", category: "iot", icon: "Radio", description: "Lightweight messaging protocol for IoT device communication." },
  { name: "Email / SMTP", type: "email", category: "notifications", icon: "Mail", description: "Send email notifications and alerts through SMTP providers." },
  { name: "OpenRouter", type: "openrouter", category: "ai", icon: "Brain", description: "Unified API gateway for accessing 200+ LLM models." },
  { name: "n8n", type: "n8n", category: "automation", icon: "Workflow", description: "Workflow automation platform for agent pipelines." },
];

export default function SettingsIntegrations() {
  const { toast } = useToast();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: integrationsList, isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const newStatus = enabled ? "configured" : "not_configured";
      await apiRequest("PATCH", `/api/integrations/${id}`, { enabled, status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: () => {
      toast({ title: "Failed to update integration", variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, config, status }: { id: string; config: Record<string, unknown>; status: string }) => {
      await apiRequest("PATCH", `/api/integrations/${id}`, { config, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setConfigDialogOpen(false);
      toast({ title: "Configuration saved" });
    },
    onError: () => {
      toast({ title: "Failed to save configuration", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; category: string; icon: string; description: string }) => {
      const fields = getConfigFields(data.type);
      const defaultConfig: Record<string, string> = {};
      fields.forEach((f) => { defaultConfig[f.key] = ""; });
      await apiRequest("POST", "/api/integrations", {
        ...data,
        enabled: false,
        status: "not_configured",
        config: defaultConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setAddDialogOpen(false);
      toast({ title: "Integration added" });
    },
    onError: () => {
      toast({ title: "Failed to add integration", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove integration", variant: "destructive" });
    },
  });

  const openConfigDialog = (integration: Integration) => {
    setSelectedIntegration(integration);
    const config = (integration.config as Record<string, unknown>) || {};
    const values: Record<string, string> = {};
    const fields = getConfigFields(integration.type);
    fields.forEach((f) => {
      values[f.key] = String(config[f.key] ?? "");
    });
    setConfigValues(values);
    setConfigDialogOpen(true);
  };

  const saveConfig = () => {
    if (!selectedIntegration) return;
    const hasValues = Object.values(configValues).some((v) => v.trim() !== "");
    const status = hasValues ? "configured" : "not_configured";
    updateConfigMutation.mutate({
      id: selectedIntegration.id,
      config: configValues,
      status,
    });
  };

  const filtered = (integrationsList || []).filter((i) => {
    if (filterCategory !== "all" && i.category !== filterCategory) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const existingTypes = new Set((integrationsList || []).map((i) => i.type));
  const addableIntegrations = availableIntegrations.filter((a) => !existingTypes.has(a.type));

  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat] || cat,
      items: filtered.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Integrations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect external services and platforms to extend OpenClaw capabilities.
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          disabled={addableIntegrations.length === 0}
          data-testid="button-add-integration"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Integration
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-integrations"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOrder.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabels[cat] || cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ExternalLink className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery || filterCategory !== "all"
                ? "No integrations match your filter."
                : "No integrations configured yet. Add one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map((group) => (
          <div key={group.category} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </h2>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {group.items.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onConfigure={() => openConfigDialog(integration)}
                  onToggle={(enabled) => toggleMutation.mutate({ id: integration.id, enabled })}
                  onDelete={() => deleteMutation.mutate(integration.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure {selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Update the connection settings for this integration.
            </DialogDescription>
          </DialogHeader>
          {selectedIntegration && (
            <div className="space-y-4 py-2">
              {getConfigFields(selectedIntegration.type).map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`config-${field.key}`} className="text-sm">
                    {field.label}
                  </Label>
                  <Input
                    id={`config-${field.key}`}
                    type={field.sensitive ? "password" : "text"}
                    value={configValues[field.key] || ""}
                    onChange={(e) =>
                      setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    data-testid={`input-config-${field.key}`}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)} data-testid="button-cancel-config">
              Cancel
            </Button>
            <Button
              onClick={saveConfig}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>
              Choose an integration to add to your OpenClaw platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto py-2">
            {addableIntegrations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                All available integrations have been added.
              </p>
            ) : (
              addableIntegrations.map((item) => {
                const Icon = iconMap[item.icon] || Settings;
                return (
                  <div
                    key={item.type}
                    className="flex items-center gap-3 p-3 rounded-md hover-elevate cursor-pointer"
                    onClick={() => addMutation.mutate(item)}
                    data-testid={`button-add-${item.type}`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {item.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {categoryLabels[item.category] || item.category}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
