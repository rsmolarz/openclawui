import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Cog, Network, MessageSquare, Globe, CheckCircle, XCircle, Shield, Key, Plus, Trash2, Eye, EyeOff, Play, Square, RotateCw, Phone, UserCheck, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import type { OpenclawConfig, DockerService, LlmApiKey, WhatsappSession } from "@shared/schema";

const OPENROUTER_MODELS = [
  { group: "Routing", models: [
    { value: "openrouter/auto", label: "Auto (Best Available)" },
    { value: "openrouter/free", label: "Free (Auto-select Free)" },
  ]},
  { group: "OpenAI", models: [
    { value: "openai/gpt-5", label: "GPT-5" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "openai/o3", label: "o3" },
    { value: "openai/o3-mini", label: "o3 Mini" },
    { value: "openai/o4-mini", label: "o4 Mini" },
    { value: "openai/gpt-4-turbo", label: "GPT-4 Turbo" },
  ]},
  { group: "Anthropic", models: [
    { value: "anthropic/claude-4-opus", label: "Claude 4 Opus" },
    { value: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" },
    { value: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
    { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
    { value: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
    { value: "anthropic/claude-3-opus", label: "Claude 3 Opus" },
    { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
  ]},
  { group: "Google", models: [
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "google/gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5" },
    { value: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
  ]},
  { group: "DeepSeek", models: [
    { value: "deepseek/deepseek-chat-v3", label: "DeepSeek V3" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
    { value: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528" },
    { value: "deepseek/deepseek-coder", label: "DeepSeek Coder" },
    { value: "deepseek/deepseek-prover-v2", label: "DeepSeek Prover V2" },
  ]},
  { group: "Meta (Llama)", models: [
    { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { value: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B" },
    { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
  ]},
  { group: "Mistral", models: [
    { value: "mistralai/mistral-large-2", label: "Mistral Large 2" },
    { value: "mistralai/mistral-medium-3", label: "Mistral Medium 3" },
    { value: "mistralai/mistral-small-3.1", label: "Mistral Small 3.1" },
    { value: "mistralai/codestral-2501", label: "Codestral" },
    { value: "mistralai/mixtral-8x22b-instruct", label: "Mixtral 8x22B" },
    { value: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B" },
    { value: "mistralai/ministral-8b", label: "Ministral 8B" },
  ]},
  { group: "xAI (Grok)", models: [
    { value: "x-ai/grok-4", label: "Grok 4" },
    { value: "x-ai/grok-3", label: "Grok 3" },
    { value: "x-ai/grok-3-mini", label: "Grok 3 Mini" },
    { value: "x-ai/grok-2", label: "Grok 2" },
  ]},
  { group: "Qwen", models: [
    { value: "qwen/qwen-3-235b-a22b", label: "Qwen 3 235B" },
    { value: "qwen/qwen-3-32b", label: "Qwen 3 32B" },
    { value: "qwen/qwen-3-14b", label: "Qwen 3 14B" },
    { value: "qwen/qwen-3-8b", label: "Qwen 3 8B" },
    { value: "qwen/qwen-2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B" },
    { value: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
    { value: "qwen/qwq-32b", label: "QwQ 32B (Reasoning)" },
  ]},
  { group: "Cohere", models: [
    { value: "cohere/command-r-plus", label: "Command R+" },
    { value: "cohere/command-r", label: "Command R" },
    { value: "cohere/command-a", label: "Command A" },
  ]},
  { group: "NVIDIA", models: [
    { value: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B" },
    { value: "nvidia/nemotron-mini-9b-v2", label: "Nemotron Mini 9B" },
  ]},
  { group: "Other", models: [
    { value: "perplexity/sonar-pro", label: "Perplexity Sonar Pro" },
    { value: "perplexity/sonar", label: "Perplexity Sonar" },
    { value: "microsoft/phi-4", label: "Microsoft Phi 4" },
    { value: "microsoft/mai-ds-r1", label: "Microsoft MAI DS R1" },
    { value: "amazon/nova-pro-v1", label: "Amazon Nova Pro" },
    { value: "amazon/nova-lite-v1", label: "Amazon Nova Lite" },
  ]},
  { group: "Local / Self-Hosted", models: [
    { value: "ollama", label: "Ollama (Local)" },
  ]},
];

const LLM_PROVIDERS = [
  "OpenRouter",
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepSeek",
  "Mistral",
  "Cohere",
  "xAI",
  "Perplexity",
  "Other",
];

function LlmModelSelect({ value, onChange, testId }: { value: string; onChange: (val: string) => void; testId: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {OPENROUTER_MODELS.map((group) => (
          <SelectGroup key={group.group}>
            <SelectLabel>{group.group}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SettingsOpenclaw() {
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery<OpenclawConfig | null>({
    queryKey: ["/api/openclaw/config"],
  });

  const { data: dockerServices, isLoading: dockerLoading } = useQuery<DockerService[]>({
    queryKey: ["/api/docker/services"],
  });

  const { data: llmKeys, isLoading: keysLoading } = useQuery<LlmApiKey[]>({
    queryKey: ["/api/llm-api-keys"],
  });

  interface BotStatus {
    state: "disconnected" | "connecting" | "qr_ready" | "connected";
    qrDataUrl: string | null;
    phone: string | null;
    error: string | null;
  }

  const { data: botStatus, isLoading: botStatusLoading } = useQuery<BotStatus>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: 3000,
  });

  const { data: whatsappSessions } = useQuery<WhatsappSession[]>({
    queryKey: ["/api/whatsapp/sessions"],
    refetchInterval: 5000,
  });

  const { data: pendingWaSessions } = useQuery<WhatsappSession[]>({
    queryKey: ["/api/whatsapp/pending"],
    refetchInterval: 5000,
  });

  const startBotMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whatsapp/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Bot starting", description: "WhatsApp bot is connecting..." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start bot.", variant: "destructive" });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whatsapp/stop");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Bot stopped", description: "WhatsApp bot disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to stop bot.", variant: "destructive" });
    },
  });

  const restartBotMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whatsapp/restart");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Bot restarting", description: "WhatsApp bot is reconnecting..." });
    },
  });

  const approveWaSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/whatsapp/approve/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/pending"] });
      toast({ title: "Session approved", description: "User can now chat with OpenClaw AI." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve session.", variant: "destructive" });
    },
  });

  const deleteWaSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/whatsapp/sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/pending"] });
      toast({ title: "Session removed", description: "WhatsApp session deleted." });
    },
  });

  const isLoading = configLoading || dockerLoading || keysLoading;

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

  const [newKey, setNewKey] = useState({ provider: "OpenRouter", label: "", apiKey: "", baseUrl: "" });
  const [showAddKey, setShowAddKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

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

  const createKeyMutation = useMutation({
    mutationFn: async (data: typeof newKey) => {
      await apiRequest("POST", "/api/llm-api-keys", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-api-keys"] });
      setNewKey({ provider: "OpenRouter", label: "", apiKey: "", baseUrl: "" });
      setShowAddKey(false);
      toast({ title: "API key added", description: "LLM API key has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add API key.", variant: "destructive" });
    },
  });

  const toggleKeyMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiRequest("PATCH", `/api/llm-api-keys/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-api-keys"] });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/llm-api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-api-keys"] });
      toast({ title: "Key deleted", description: "LLM API key removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete API key.", variant: "destructive" });
    },
  });

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "****";
    return key.slice(0, 4) + "****" + key.slice(-4);
  };

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
              <LlmModelSelect
                value={formValues.defaultLlm}
                onChange={(val) => setFormValues((p) => ({ ...p, defaultLlm: val }))}
                testId="select-default-llm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback_llm">Fallback LLM</Label>
              <LlmModelSelect
                value={formValues.fallbackLlm}
                onChange={(val) => setFormValues((p) => ({ ...p, fallbackLlm: val }))}
                testId="select-fallback-llm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              LLM API Keys
            </CardTitle>
            <CardDescription>Manage API keys for LLM providers used by your gateway.</CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowAddKey(!showAddKey)}
            data-testid="button-add-llm-key"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Key
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddKey && (
            <div className="border rounded-md p-4 space-y-4 bg-muted/30">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={newKey.provider} onValueChange={(val) => setNewKey((p) => ({ ...p, provider: val }))}>
                    <SelectTrigger data-testid="select-new-key-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g. Production Key"
                    value={newKey.label}
                    onChange={(e) => setNewKey((p) => ({ ...p, label: e.target.value }))}
                    data-testid="input-new-key-label"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={newKey.apiKey}
                    onChange={(e) => setNewKey((p) => ({ ...p, apiKey: e.target.value }))}
                    data-testid="input-new-key-value"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Base URL (optional)</Label>
                  <Input
                    placeholder="https://openrouter.ai/api/v1"
                    value={newKey.baseUrl}
                    onChange={(e) => setNewKey((p) => ({ ...p, baseUrl: e.target.value }))}
                    data-testid="input-new-key-base-url"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAddKey(false)} data-testid="button-cancel-add-key">
                  Cancel
                </Button>
                <Button
                  onClick={() => createKeyMutation.mutate(newKey)}
                  disabled={!newKey.label || !newKey.apiKey || createKeyMutation.isPending}
                  data-testid="button-save-new-key"
                >
                  {createKeyMutation.isPending ? "Saving..." : "Save Key"}
                </Button>
              </div>
            </div>
          )}

          {(!llmKeys || llmKeys.length === 0) && !showAddKey && (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-llm-keys-empty">
              No LLM API keys configured. Add one to connect your gateway to LLM providers.
            </p>
          )}

          {llmKeys && llmKeys.length > 0 && (
            <div className="space-y-3">
              {llmKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`row-llm-key-${key.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium" data-testid={`text-llm-key-label-${key.id}`}>{key.label}</p>
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-llm-key-provider-${key.id}`}>{key.provider}</Badge>
                      <Badge variant={key.active ? "default" : "secondary"} className="text-xs" data-testid={`badge-llm-key-status-${key.id}`}>
                        {key.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-muted-foreground font-mono" data-testid={`text-llm-key-value-${key.id}`}>
                        {visibleKeys.has(key.id) ? key.apiKey : maskKey(key.apiKey)}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleKeyVisibility(key.id)}
                        data-testid={`button-toggle-visibility-${key.id}`}
                      >
                        {visibleKeys.has(key.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                    {key.baseUrl && (
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-llm-key-baseurl-${key.id}`}>{key.baseUrl}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={key.active}
                      onCheckedChange={(checked) => toggleKeyMutation.mutate({ id: key.id, active: checked })}
                      data-testid={`switch-llm-key-active-${key.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteKeyMutation.mutate(key.id)}
                      disabled={deleteKeyMutation.isPending}
                      data-testid={`button-delete-llm-key-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp AI Bot
            </CardTitle>
            <CardDescription>Manage the WhatsApp AI bot powered by OpenRouter.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={botStatus?.state === "connected" ? "default" : botStatus?.state === "connecting" || botStatus?.state === "qr_ready" ? "secondary" : "destructive"}
              data-testid="badge-bot-status"
            >
              {botStatus?.state === "connected" ? "Connected" :
               botStatus?.state === "connecting" ? "Connecting..." :
               botStatus?.state === "qr_ready" ? "QR Ready" : "Disconnected"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {botStatus?.state === "disconnected" ? (
              <Button
                onClick={() => startBotMutation.mutate()}
                disabled={startBotMutation.isPending}
                data-testid="button-start-bot"
              >
                <Play className="h-4 w-4 mr-2" />
                {startBotMutation.isPending ? "Starting..." : "Start Bot"}
              </Button>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={() => stopBotMutation.mutate()}
                  disabled={stopBotMutation.isPending}
                  data-testid="button-stop-bot"
                >
                  <Square className="h-4 w-4 mr-2" />
                  {stopBotMutation.isPending ? "Stopping..." : "Stop Bot"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => restartBotMutation.mutate()}
                  disabled={restartBotMutation.isPending}
                  data-testid="button-restart-bot"
                >
                  <RotateCw className="h-4 w-4 mr-2" />
                  Restart
                </Button>
              </>
            )}
            {botStatus?.phone && (
              <div className="flex items-center gap-2 ml-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid="text-bot-phone">+{botStatus.phone}</span>
              </div>
            )}
          </div>

          {botStatus?.error && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm text-destructive" data-testid="text-bot-error">{botStatus.error}</p>
            </div>
          )}

          {botStatus?.state === "qr_ready" && botStatus.qrDataUrl && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground font-medium">Scan this QR code with WhatsApp</p>
              <img
                src={botStatus.qrDataUrl}
                alt="WhatsApp QR Code"
                className="rounded-md border"
                style={{ width: 260, height: 260 }}
                data-testid="img-whatsapp-qr"
              />
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Open WhatsApp on your phone, go to Settings, then Linked Devices, and scan this QR code.
              </p>
            </div>
          )}

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

      {pendingWaSessions && pendingWaSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending WhatsApp Approvals
            </CardTitle>
            <CardDescription>{pendingWaSessions.length} user{pendingWaSessions.length !== 1 ? "s" : ""} waiting for approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingWaSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`row-pending-wa-${session.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium" data-testid={`text-wa-phone-${session.id}`}>+{session.phone}</p>
                      {session.displayName && (
                        <span className="text-sm text-muted-foreground">{session.displayName}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">Code: {session.pairingCode}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => approveWaSessionMutation.mutate(session.id)}
                      disabled={approveWaSessionMutation.isPending}
                      data-testid={`button-approve-wa-${session.id}`}
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteWaSessionMutation.mutate(session.id)}
                      data-testid={`button-delete-wa-${session.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {whatsappSessions && whatsappSessions.filter(s => s.status === "approved").length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Approved WhatsApp Users
            </CardTitle>
            <CardDescription>Users with active WhatsApp AI access.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {whatsappSessions.filter(s => s.status === "approved").map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`row-approved-wa-${session.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">+{session.phone}</p>
                      {session.displayName && (
                        <span className="text-sm text-muted-foreground">{session.displayName}</span>
                      )}
                      <Badge variant="default" className="text-xs">Approved</Badge>
                    </div>
                    {session.lastMessageAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last message: {new Date(session.lastMessageAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteWaSessionMutation.mutate(session.id)}
                    data-testid={`button-remove-wa-${session.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
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
