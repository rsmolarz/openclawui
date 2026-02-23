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
import { Save, Cog, Network, MessageSquare, Globe, CheckCircle, XCircle, Shield, Key, Plus, Trash2, Eye, EyeOff, Play, Square, RotateCw, Phone, UserCheck, Clock, ExternalLink, Copy, Smartphone, Terminal, ChevronDown, ChevronRight, Wrench, Sparkles, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useInstance } from "@/hooks/use-instance";
import type { OpenclawConfig, DockerService, LlmApiKey, WhatsappSession, OpenclawInstance } from "@shared/schema";

const OPENROUTER_MODELS = [
  { group: "Routing", models: [
    { value: "openrouter/auto", label: "Auto (Best Available)" },
    { value: "openrouter/free", label: "Free (Auto-select Free)" },
  ]},
  { group: "DeepSeek", models: [
    { value: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3 0324" },
    { value: "deepseek/deepseek-chat-v3", label: "DeepSeek V3" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
    { value: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528" },
    { value: "deepseek/deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill Llama 70B" },
    { value: "deepseek/deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 Distill Qwen 32B" },
    { value: "deepseek/deepseek-r1-distill-qwen-14b", label: "DeepSeek R1 Distill Qwen 14B" },
    { value: "deepseek/deepseek-coder", label: "DeepSeek Coder" },
    { value: "deepseek/deepseek-prover-v2", label: "DeepSeek Prover V2" },
    { value: "deepseek/deepseek-v2.5", label: "DeepSeek V2.5" },
  ]},
  { group: "OpenAI", models: [
    { value: "openai/gpt-5", label: "GPT-5" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "openai/gpt-4o-2024-11-20", label: "GPT-4o (Nov 2024)" },
    { value: "openai/gpt-4o-mini-2024-07-18", label: "GPT-4o Mini (Jul 2024)" },
    { value: "openai/o3", label: "o3" },
    { value: "openai/o3-mini", label: "o3 Mini" },
    { value: "openai/o4-mini", label: "o4 Mini" },
    { value: "openai/o1", label: "o1" },
    { value: "openai/o1-mini", label: "o1 Mini" },
    { value: "openai/o1-preview", label: "o1 Preview" },
    { value: "openai/gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "openai/gpt-4-turbo-preview", label: "GPT-4 Turbo Preview" },
    { value: "openai/gpt-4", label: "GPT-4" },
    { value: "openai/gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    { value: "openai/gpt-3.5-turbo-0125", label: "GPT-3.5 Turbo 0125" },
    { value: "openai/chatgpt-4o-latest", label: "ChatGPT 4o Latest" },
  ]},
  { group: "Anthropic", models: [
    { value: "anthropic/claude-4-opus", label: "Claude 4 Opus" },
    { value: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" },
    { value: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
    { value: "anthropic/claude-3.7-sonnet:thinking", label: "Claude 3.7 Sonnet (Thinking)" },
    { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
    { value: "anthropic/claude-3.5-sonnet-20240620", label: "Claude 3.5 Sonnet (Jun 2024)" },
    { value: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
    { value: "anthropic/claude-3.5-haiku-20241022", label: "Claude 3.5 Haiku (Oct 2024)" },
    { value: "anthropic/claude-3-opus", label: "Claude 3 Opus" },
    { value: "anthropic/claude-3-sonnet", label: "Claude 3 Sonnet" },
    { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
  ]},
  { group: "Google", models: [
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro Preview" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview" },
    { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "google/gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "google/gemini-2.0-flash-thinking", label: "Gemini 2.0 Flash Thinking" },
    { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5" },
    { value: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
    { value: "google/gemini-flash-1.5-8b", label: "Gemini Flash 1.5 8B" },
    { value: "google/gemma-3-27b-it", label: "Gemma 3 27B" },
    { value: "google/gemma-3-12b-it", label: "Gemma 3 12B" },
    { value: "google/gemma-3-4b-it", label: "Gemma 3 4B" },
    { value: "google/gemma-2-27b-it", label: "Gemma 2 27B" },
    { value: "google/gemma-2-9b-it", label: "Gemma 2 9B" },
  ]},
  { group: "Meta (Llama)", models: [
    { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { value: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B" },
    { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
    { value: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B" },
    { value: "meta-llama/llama-3-8b-instruct", label: "Llama 3 8B" },
    { value: "meta-llama/llama-guard-3-8b", label: "Llama Guard 3 8B" },
  ]},
  { group: "Mistral", models: [
    { value: "mistralai/mistral-large-2", label: "Mistral Large 2" },
    { value: "mistralai/mistral-large-2411", label: "Mistral Large 2411" },
    { value: "mistralai/mistral-medium-3", label: "Mistral Medium 3" },
    { value: "mistralai/mistral-small-3.1", label: "Mistral Small 3.1" },
    { value: "mistralai/mistral-small-2503", label: "Mistral Small 2503" },
    { value: "mistralai/codestral-2501", label: "Codestral 2501" },
    { value: "mistralai/codestral-mamba", label: "Codestral Mamba" },
    { value: "mistralai/mixtral-8x22b-instruct", label: "Mixtral 8x22B" },
    { value: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B" },
    { value: "mistralai/ministral-8b", label: "Ministral 8B" },
    { value: "mistralai/ministral-3b", label: "Ministral 3B" },
    { value: "mistralai/mistral-7b-instruct", label: "Mistral 7B" },
    { value: "mistralai/pixtral-large-2411", label: "Pixtral Large" },
    { value: "mistralai/pixtral-12b-2409", label: "Pixtral 12B" },
  ]},
  { group: "xAI (Grok)", models: [
    { value: "x-ai/grok-4", label: "Grok 4" },
    { value: "x-ai/grok-3", label: "Grok 3" },
    { value: "x-ai/grok-3-fast", label: "Grok 3 Fast" },
    { value: "x-ai/grok-3-mini", label: "Grok 3 Mini" },
    { value: "x-ai/grok-3-mini-fast", label: "Grok 3 Mini Fast" },
    { value: "x-ai/grok-2", label: "Grok 2" },
    { value: "x-ai/grok-2-mini", label: "Grok 2 Mini" },
    { value: "x-ai/grok-2-vision", label: "Grok 2 Vision" },
  ]},
  { group: "Qwen", models: [
    { value: "qwen/qwen-3-235b-a22b", label: "Qwen 3 235B" },
    { value: "qwen/qwen-3-32b", label: "Qwen 3 32B" },
    { value: "qwen/qwen-3-14b", label: "Qwen 3 14B" },
    { value: "qwen/qwen-3-8b", label: "Qwen 3 8B" },
    { value: "qwen/qwen-3-4b", label: "Qwen 3 4B" },
    { value: "qwen/qwen-3-1.7b", label: "Qwen 3 1.7B" },
    { value: "qwen/qwen-2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B" },
    { value: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
    { value: "qwen/qwen-2.5-32b-instruct", label: "Qwen 2.5 32B" },
    { value: "qwen/qwen-2.5-7b-instruct", label: "Qwen 2.5 7B" },
    { value: "qwen/qwq-32b", label: "QwQ 32B (Reasoning)" },
    { value: "qwen/qvq-72b-preview", label: "QVQ 72B Vision (Preview)" },
  ]},
  { group: "Cohere", models: [
    { value: "cohere/command-r-plus", label: "Command R+" },
    { value: "cohere/command-r-plus-08-2024", label: "Command R+ (Aug 2024)" },
    { value: "cohere/command-r", label: "Command R" },
    { value: "cohere/command-r-08-2024", label: "Command R (Aug 2024)" },
    { value: "cohere/command-a", label: "Command A" },
  ]},
  { group: "NVIDIA", models: [
    { value: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B" },
    { value: "nvidia/llama-3.1-nemotron-ultra-253b-v1", label: "Nemotron Ultra 253B" },
    { value: "nvidia/nemotron-mini-9b-v2", label: "Nemotron Mini 9B" },
  ]},
  { group: "Microsoft", models: [
    { value: "microsoft/phi-4", label: "Phi 4" },
    { value: "microsoft/phi-4-multimodal-instruct", label: "Phi 4 Multimodal" },
    { value: "microsoft/phi-3.5-mini-128k-instruct", label: "Phi 3.5 Mini 128K" },
    { value: "microsoft/phi-3-medium-128k-instruct", label: "Phi 3 Medium 128K" },
    { value: "microsoft/phi-3-mini-128k-instruct", label: "Phi 3 Mini 128K" },
    { value: "microsoft/mai-ds-r1", label: "MAI DS R1" },
    { value: "microsoft/wizardlm-2-8x22b", label: "WizardLM 2 8x22B" },
  ]},
  { group: "Amazon", models: [
    { value: "amazon/nova-pro-v1", label: "Nova Pro" },
    { value: "amazon/nova-lite-v1", label: "Nova Lite" },
    { value: "amazon/nova-micro-v1", label: "Nova Micro" },
  ]},
  { group: "Perplexity", models: [
    { value: "perplexity/sonar-pro", label: "Sonar Pro" },
    { value: "perplexity/sonar", label: "Sonar" },
    { value: "perplexity/sonar-reasoning", label: "Sonar Reasoning" },
    { value: "perplexity/sonar-reasoning-pro", label: "Sonar Reasoning Pro" },
    { value: "perplexity/r1-1776", label: "R1 1776" },
  ]},
  { group: "AI21", models: [
    { value: "ai21/jamba-1.5-large", label: "Jamba 1.5 Large" },
    { value: "ai21/jamba-1.5-mini", label: "Jamba 1.5 Mini" },
    { value: "ai21/jamba-instruct", label: "Jamba Instruct" },
  ]},
  { group: "Databricks", models: [
    { value: "databricks/dbrx-instruct", label: "DBRX Instruct" },
  ]},
  { group: "01.AI (Yi)", models: [
    { value: "01-ai/yi-large", label: "Yi Large" },
    { value: "01-ai/yi-large-turbo", label: "Yi Large Turbo" },
    { value: "01-ai/yi-1.5-34b-chat", label: "Yi 1.5 34B" },
  ]},
  { group: "Nous Research", models: [
    { value: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 405B" },
    { value: "nousresearch/hermes-3-llama-3.1-70b", label: "Hermes 3 70B" },
    { value: "nousresearch/hermes-2-pro-llama-3-8b", label: "Hermes 2 Pro 8B" },
    { value: "nousresearch/nous-hermes-2-mixtral-8x7b-sft", label: "Hermes 2 Mixtral" },
  ]},
  { group: "Inflection", models: [
    { value: "inflection/inflection-3-pi", label: "Inflection 3 Pi" },
    { value: "inflection/inflection-3-productivity", label: "Inflection 3 Productivity" },
  ]},
  { group: "Other", models: [
    { value: "cognitivecomputations/dolphin-mixtral-8x22b", label: "Dolphin Mixtral 8x22B" },
    { value: "sao10k/l3.3-euryale-70b", label: "Euryale 70B" },
    { value: "sophosympatheia/rogue-rose-103b-v0.2", label: "Rogue Rose 103B" },
    { value: "thedrummer/rocinante-12b", label: "Rocinante 12B" },
    { value: "eva-unit-01/eva-llama-3.33-70b", label: "EVA Llama 70B" },
    { value: "moonshotai/moonlight-16b-a3b", label: "Moonshot 16B" },
    { value: "featherless/qwerky-72b", label: "Qwerky 72B" },
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
  const [search, setSearch] = useState("");
  const lowerSearch = search.toLowerCase();

  const allModels = OPENROUTER_MODELS.flatMap(g => g.models);
  const selectedLabel = allModels.find(m => m.value === value)?.label ?? value;

  const filteredGroups = search
    ? OPENROUTER_MODELS.map(group => ({
        ...group,
        models: group.models.filter(
          m => m.label.toLowerCase().includes(lowerSearch) || m.value.toLowerCase().includes(lowerSearch)
        ),
      })).filter(g => g.models.length > 0)
    : OPENROUTER_MODELS;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder="Select a model">{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            data-testid={`${testId}-search`}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        {filteredGroups.map((group) => (
          <SelectGroup key={group.group}>
            <SelectLabel>{group.group}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {filteredGroups.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">No models found</div>
        )}
      </SelectContent>
    </Select>
  );
}

function ApproveByCodeCard() {
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const approveMutation = useMutation({
    mutationFn: async (pairingCode: string) => {
      const resp = await apiRequest("POST", "/api/whatsapp/approve-by-code", { pairingCode });
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/pending"] });
      toast({
        title: "User approved",
        description: `+${data.phone} now has access to OpenClaw AI.`,
      });
      setCode("");
    },
    onError: (error: any) => {
      toast({
        title: "Approval failed",
        description: error?.message || "No pending session found with that pairing code. Make sure the user has messaged the bot first.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-approve-by-code">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4" />
          Approve by Pairing Code
        </CardTitle>
        <CardDescription>
          Enter the pairing code a user received from the WhatsApp bot to grant them access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Input
            placeholder="e.g. BA550751"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="font-mono tracking-wider max-w-[200px]"
            maxLength={8}
            data-testid="input-pairing-code"
          />
          <Button
            onClick={() => approveMutation.mutate(code.trim())}
            disabled={!code.trim() || approveMutation.isPending}
            data-testid="button-approve-code"
          >
            {approveMutation.isPending ? (
              <RotateCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4 mr-2" />
            )}
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsOpenclaw() {
  const { toast } = useToast();
  const { selectedInstanceId } = useInstance();

  const { data: instances } = useQuery<OpenclawInstance[]>({
    queryKey: ["/api/instances"],
  });

  const currentInstance = instances?.find((i) => i.id === selectedInstanceId);

  const { data: config, isLoading: configLoading } = useQuery<OpenclawConfig | null>({
    queryKey: ["/api/openclaw/config", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/openclaw/config?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const { data: dockerServices, isLoading: dockerLoading } = useQuery<DockerService[]>({
    queryKey: ["/api/docker/services", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/docker/services?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch docker services");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const { data: llmKeys, isLoading: keysLoading } = useQuery<LlmApiKey[]>({
    queryKey: ["/api/llm-api-keys"],
  });

  interface BotStatus {
    state: "disconnected" | "connecting" | "qr_ready" | "pairing_code_ready" | "connected" | "external";
    qrDataUrl: string | null;
    pairingCode: string | null;
    phone: string | null;
    error: string | null;
    runtime?: "local" | "external";
    enabled?: boolean;
  }

  const { data: botStatus, isLoading: botStatusLoading } = useQuery<BotStatus>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === "connecting" || state === "qr_ready" || state === "pairing_code_ready") return 1500;
      return 3000;
    },
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
      await apiRequest("POST", "/api/whatsapp/start-fresh");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Bot starting", description: "Generating fresh QR code..." });
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

  const [pairingPhoneInput, setPairingPhoneInput] = useState("");
  const [showPairingForm, setShowPairingForm] = useState(false);

  const pairWithPhoneMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      await apiRequest("POST", "/api/whatsapp/pair", { phoneNumber });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Pairing code requested", description: "Check below for your pairing code." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to request pairing code.", variant: "destructive" });
    },
  });

  interface DeployStep {
    title: string;
    description: string;
    command: string;
    ssh: string | null;
  }
  interface DeployCommands {
    doctorFix: Record<string, DeployStep>;
    manualFix: Record<string, DeployStep>;
    hasRealKey: boolean;
    dockerProject: string;
    config: {
      provider: string;
      model: string;
      gatewayPort: number;
      gatewayBind: string;
      gatewayMode: string;
      gatewayToken: string;
      sshHost: string;
      sshUser: string;
      sshPort: number;
      envVar: string;
    };
  }

  const { data: deployCommands } = useQuery<DeployCommands>({
    queryKey: [`/api/openclaw/deploy-commands?instanceId=${selectedInstanceId ?? ""}`],
    enabled: !!selectedInstanceId,
  });

  const [showDeployCommands, setShowDeployCommands] = useState(false);
  const [useSSH, setUseSSH] = useState(true);
  const [showManualSteps, setShowManualSteps] = useState(false);

  const httpProbeQuery = useQuery<{ reachable: boolean; status?: number; error?: string }>({
    queryKey: [`/api/gateway/probe?instanceId=${selectedInstanceId ?? ""}`],
    enabled: !!selectedInstanceId && !!currentInstance?.serverUrl,
    refetchInterval: 60000,
    retry: false,
  });

  const sshProbeQuery = useQuery<{ reachable: boolean; method?: string; host?: string; output?: string; error?: string }>({
    queryKey: ["/api/gateway/probe-ssh", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/gateway/probe-ssh?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      if (!resp.ok) return { reachable: false, error: "Request failed" };
      return resp.json();
    },
    enabled: !!selectedInstanceId && !httpProbeQuery.data?.reachable,
    refetchInterval: 60000,
    retry: false,
  });

  const probeGatewayQuery = {
    data: httpProbeQuery.data?.reachable
      ? httpProbeQuery.data
      : sshProbeQuery.data?.reachable
      ? { reachable: true, status: 0, error: undefined }
      : httpProbeQuery.data ?? sshProbeQuery.data ?? undefined,
    isLoading: httpProbeQuery.isLoading || (sshProbeQuery.isLoading && !httpProbeQuery.data?.reachable),
  };

  const gatewayStatusMethod = httpProbeQuery.data?.reachable ? "http" : sshProbeQuery.data?.reachable ? "ssh" : null;

  const sshActionsQuery = useQuery<{ actions: string[]; configured: boolean; host: string | null }>({
    queryKey: ["/api/ssh/gateway/actions", selectedInstanceId],
    queryFn: async () => {
      const resp = await fetch(`/api/ssh/gateway/actions?instanceId=${selectedInstanceId || ""}`, { credentials: "include" });
      return resp.json();
    },
  });

  const [sshResult, setSSHResult] = useState<{ success?: boolean; output?: string; error?: string; action?: string } | null>(null);
  const [sshRunning, setSSHRunning] = useState<string | null>(null);

  const sshMutation = useMutation({
    mutationFn: async (action: string) => {
      setSSHRunning(action);
      const resp = await apiRequest("POST", `/api/ssh/gateway/${action}`, { instanceId: selectedInstanceId });
      return resp.json();
    },
    onSuccess: (data: any, action: string) => {
      setSSHResult({ ...data, action });
      setSSHRunning(null);
      if (data.success) {
        toast({ title: "Command succeeded", description: `Gateway ${action} completed successfully.` });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/gateway/probe?instanceId=${selectedInstanceId ?? ""}`] });
        }, 3000);
      } else {
        toast({ title: "Command completed", description: data.error || data.output || "Check the output below.", variant: data.error ? "destructive" : "default" });
      }
    },
    onError: (err: any, action: string) => {
      setSSHResult({ success: false, error: err?.message || "SSH command failed", action });
      setSSHRunning(null);
      toast({ title: "SSH failed", description: err?.message || "Could not execute command on VPS.", variant: "destructive" });
    },
  });

  const [hostingerPortLoading, setHostingerPortLoading] = useState(false);
  const hostingerOpenPortMutation = useMutation({
    mutationFn: async () => {
      setHostingerPortLoading(true);
      const portsToOpen = ["22", "18789"];
      const allResults: any[] = [];
      for (const port of portsToOpen) {
        const resp = await apiRequest("POST", "/api/hostinger/auto-open-port", { port, instanceId: selectedInstanceId });
        const data = await resp.json();
        allResults.push({ port, ...data });
      }
      return allResults;
    },
    onSuccess: (results: any[]) => {
      setHostingerPortLoading(false);
      const summary = results
        .filter((r) => r.success)
        .map((r) => {
          const actions = r.results?.map((a: any) => a.action).join(", ") || "done";
          return `Port ${r.port}: ${actions}`;
        })
        .join(" | ");
      toast({ title: "Firewall Updated", description: summary || "Ports opened successfully." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/gateway/probe?instanceId=${selectedInstanceId ?? ""}`] });
      }, 5000);
    },
    onError: (err: any) => {
      setHostingerPortLoading(false);
      toast({ title: "Hostinger API Error", description: err?.message || "Could not open ports via Hostinger API.", variant: "destructive" });
    },
  });

  const isLoading = configLoading || dockerLoading || keysLoading;

  const [formValues, setFormValues] = useState({
    gatewayPort: 18789,
    gatewayBind: "127.0.0.1",
    gatewayMode: "local",
    gatewayToken: "",
    gatewayPassword: "",
    websocketUrl: "",
    defaultLlm: "deepseek/deepseek-chat",
    fallbackLlm: "openrouter/auto",
    whatsappEnabled: false,
    whatsappPhone: "",
    tailscaleEnabled: false,
    dockerProject: "claw",
  });
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [newKey, setNewKey] = useState({ provider: "OpenRouter", label: "", apiKey: "", baseUrl: "" });
  const [showAddKey, setShowAddKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (config) {
      setFormValues({
        gatewayPort: config.gatewayPort,
        gatewayBind: config.gatewayBind,
        gatewayMode: config.gatewayMode,
        gatewayToken: config.gatewayToken ?? "",
        gatewayPassword: config.gatewayPassword ?? "",
        websocketUrl: config.websocketUrl ?? "",
        defaultLlm: config.defaultLlm,
        fallbackLlm: config.fallbackLlm,
        whatsappEnabled: config.whatsappEnabled,
        whatsappPhone: config.whatsappPhone ?? "",
        tailscaleEnabled: config.tailscaleEnabled,
        dockerProject: config.dockerProject ?? "claw",
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formValues) => {
      const payload = { ...data, gatewayToken: data.gatewayToken || null, gatewayPassword: data.gatewayPassword || null, websocketUrl: data.websocketUrl || null };
      await apiRequest("POST", `/api/openclaw/config?instanceId=${selectedInstanceId ?? ""}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config", selectedInstanceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/docker/services", selectedInstanceId] });
      toast({ title: "Configuration saved", description: "OpenClaw settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await apiRequest("POST", `/api/nodes/approve?instanceId=${selectedInstanceId ?? ""}`, { node_id: nodeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/openclaw/config", selectedInstanceId] });
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
            <Badge variant={probeGatewayQuery.data?.reachable ? "default" : probeGatewayQuery.isLoading ? "secondary" : "destructive"}>
              {probeGatewayQuery.isLoading ? "checking..." : probeGatewayQuery.data?.reachable ? (gatewayStatusMethod === "ssh" ? "online (via SSH)" : "online") : "offline"}
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

      {currentInstance?.serverUrl && (
        <Card data-testid="card-native-dashboard">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Native OpenClaw Dashboard
              </CardTitle>
              <CardDescription>
                Access your gateway's native dashboard. The dashboard requires a secure context (localhost), so use the SSH tunnel command to open it locally.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {probeGatewayQuery.data?.reachable ? (
                <Badge variant="default" className="bg-green-600 text-white" data-testid="badge-gateway-status">
                  <span className="relative flex h-2 w-2 mr-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" /></span>
                  Reachable
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-gateway-status">Offline</Badge>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  try {
                    const u = new URL(currentInstance.serverUrl!);
                    const p = u.port || config?.gatewayPort || 18789;
                    const dashUrl = `${u.protocol}//${u.hostname}:${p}/`;
                    window.open(dashUrl, "_blank", "noopener,noreferrer");
                  } catch {
                    toast({ title: "Error", description: "Could not open dashboard URL.", variant: "destructive" });
                  }
                }}
                data-testid="button-open-dashboard"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const u = new URL(currentInstance.serverUrl!);
                    const p = u.port || config?.gatewayPort || 18789;
                    const cmd = `ssh -L ${p}:localhost:${p} root@${u.hostname}`;
                    navigator.clipboard.writeText(cmd);
                    toast({ title: "SSH Tunnel Command Copied", description: "Run this in your terminal, then open localhost:" + p + " in your browser for full dashboard access." });
                  } catch {
                    toast({ title: "Error", description: "Could not generate SSH command.", variant: "destructive" });
                  }
                }}
                data-testid="button-copy-ssh-quick"
              >
                <Terminal className="h-3.5 w-3.5 mr-1.5" />
                Copy SSH Tunnel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground min-w-24">Server URL:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate" data-testid="text-server-url">
                  {currentInstance.serverUrl}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(currentInstance.serverUrl!);
                    toast({ title: "Copied", description: "Server URL copied to clipboard." });
                  }}
                  data-testid="button-copy-server-url"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground min-w-24">Dashboard URL:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate" data-testid="text-dashboard-url">
                  {(() => {
                    try {
                      const u = new URL(currentInstance.serverUrl!);
                      const p = u.port || config?.gatewayPort || 18789;
                      return `${u.protocol}//${u.hostname}:${p}/`;
                    } catch { return `${currentInstance.serverUrl}/`; }
                  })()}
                  {config?.gatewayToken ? " (Bearer auth)" : ""}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    try {
                      const u = new URL(currentInstance.serverUrl!);
                      const p = u.port || config?.gatewayPort || 18789;
                      navigator.clipboard.writeText(`${u.protocol}//${u.hostname}:${p}/`);
                    } catch {
                      navigator.clipboard.writeText(`${currentInstance.serverUrl}/`);
                    }
                    toast({ title: "Copied", description: "Dashboard URL copied." });
                  }}
                  data-testid="button-copy-dashboard-url"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground min-w-24">WebSocket URL:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate" data-testid="text-websocket-url-display">
                  {config?.websocketUrl || (() => {
                    try {
                      const u = new URL(currentInstance.serverUrl!);
                      return `ws://${u.hostname}:${config?.gatewayPort ?? 18789}`;
                    } catch { return "Not configured"; }
                  })()}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const wsUrl = config?.websocketUrl || (() => {
                      try {
                        const u = new URL(currentInstance.serverUrl!);
                        return `ws://${u.hostname}:${config?.gatewayPort ?? 18789}`;
                      } catch { return ""; }
                    })();
                    if (wsUrl) {
                      navigator.clipboard.writeText(wsUrl);
                      toast({ title: "Copied", description: "WebSocket URL copied to clipboard." });
                    }
                  }}
                  data-testid="button-copy-websocket-url-display"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              {config?.gatewayToken && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground min-w-24">Gateway Token:</span>
                  <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate font-mono" data-testid="text-registered-token">
                    {config.gatewayToken.slice(0, 8)}...{config.gatewayToken.slice(-8)}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(config.gatewayToken!);
                      toast({ title: "Copied", description: "Gateway token copied to clipboard." });
                    }}
                    data-testid="button-copy-registered-token"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {!config?.gatewayToken && (
                <p className="text-xs text-muted-foreground">
                  Add your gateway token below to enable one-click authenticated access.
                </p>
              )}
              <div className="mt-3 p-3 bg-muted/50 rounded-lg border" data-testid="ssh-tunnel-tip">
                <p className="text-sm font-medium mb-1 flex items-center gap-1.5">
                  <Terminal className="h-4 w-4" />
                  Full Interactive Access via SSH Tunnel
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  The gateway requires a secure context (HTTPS or localhost). Run this command in your terminal to create a local tunnel, then open the dashboard at localhost:
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <code className="bg-background px-2 py-1.5 rounded text-xs flex-1 truncate border font-mono" data-testid="text-ssh-tunnel-cmd">
                    {(() => {
                      try {
                        const u = new URL(currentInstance.serverUrl!);
                        const p = u.port || config?.gatewayPort || 18789;
                        return `ssh -L ${p}:localhost:${p} root@${u.hostname}`;
                      } catch { return "ssh -L 18789:localhost:18789 root@your-vps-ip"; }
                    })()}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      try {
                        const u = new URL(currentInstance.serverUrl!);
                        const p = u.port || config?.gatewayPort || 18789;
                        navigator.clipboard.writeText(`ssh -L ${p}:localhost:${p} root@${u.hostname}`);
                      } catch {}
                      toast({ title: "Copied", description: "SSH tunnel command copied. Run this in your terminal, then open localhost in your browser." });
                    }}
                    data-testid="button-copy-ssh-tunnel"
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Then open: <code className="text-xs font-mono bg-background px-1 py-0.5 rounded border">http://localhost:{(() => {
                    try {
                      const u = new URL(currentInstance.serverUrl!);
                      return u.port || config?.gatewayPort || 18789;
                    } catch { return 18789; }
                  })()}{config?.gatewayToken ? `?token=${config.gatewayToken.slice(0, 6)}...` : ""}</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {sshActionsQuery.data?.configured && (
        <Card data-testid="card-ssh-gateway-control">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Gateway Remote Control
                </CardTitle>
                <CardDescription>
                  Manage the OpenClaw gateway service on your VPS via SSH.
                  {(() => {
                    try {
                      if (currentInstance?.serverUrl) {
                        const host = new URL(currentInstance.serverUrl).hostname;
                        return <span className="ml-1 font-mono text-xs">({host})</span>;
                      }
                    } catch {}
                    return sshActionsQuery.data?.host ? <span className="ml-1 font-mono text-xs">({sshActionsQuery.data.host})</span> : null;
                  })()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {probeGatewayQuery.isLoading ? (
                  <Badge variant="secondary"><RotateCw className="h-3 w-3 mr-1 animate-spin" />Checking...</Badge>
                ) : probeGatewayQuery.data?.reachable ? (
                  <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />{gatewayStatusMethod === "ssh" ? "Online (SSH)" : "Online"}</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Offline</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => sshMutation.mutate("status")}
                disabled={!!sshRunning}
                data-testid="button-ssh-status"
              >
                {sshRunning === "status" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                Check Status
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => sshMutation.mutate("start")}
                disabled={!!sshRunning}
                data-testid="button-ssh-start"
              >
                {sshRunning === "start" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                Start Gateway
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => sshMutation.mutate("stop")}
                disabled={!!sshRunning}
                data-testid="button-ssh-stop"
              >
                {sshRunning === "stop" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Square className="h-3 w-3 mr-1" />}
                Stop Gateway
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sshMutation.mutate("restart")}
                disabled={!!sshRunning}
                data-testid="button-ssh-restart"
              >
                {sshRunning === "restart" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
                Restart Gateway
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sshMutation.mutate("diagnose")}
                disabled={!!sshRunning}
                data-testid="button-ssh-diagnose"
              >
                {sshRunning === "diagnose" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Wrench className="h-3 w-3 mr-1" />}
                Diagnose
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sshMutation.mutate("open-port")}
                disabled={!!sshRunning}
                data-testid="button-ssh-open-port"
              >
                {sshRunning === "open-port" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                Open Port (SSH)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => hostingerOpenPortMutation.mutate()}
                disabled={hostingerPortLoading || !!sshRunning}
                data-testid="button-hostinger-open-port"
              >
                {hostingerPortLoading ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                Open Ports (Hostinger API)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sshMutation.mutate("bind-lan")}
                disabled={!!sshRunning}
                data-testid="button-ssh-bind-lan"
              >
                {sshRunning === "bind-lan" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Globe className="h-3 w-3 mr-1" />}
                Set LAN Bind
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sshMutation.mutate("check-config")}
                disabled={!!sshRunning}
                data-testid="button-ssh-check-config"
              >
                {sshRunning === "check-config" ? <RotateCw className="h-3 w-3 mr-1 animate-spin" /> : <Cog className="h-3 w-3 mr-1" />}
                Check Config
              </Button>
            </div>

            {sshResult && (
              <div className={`rounded-md border p-3 ${sshResult.success ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`} data-testid="text-ssh-result">
                <div className="flex items-center gap-2 mb-2">
                  {sshResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">
                    {sshResult.action} — {sshResult.success ? "Success" : "Failed"}
                  </span>
                </div>
                {sshResult.output && (
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto" data-testid="code-ssh-output">
                    {sshResult.output}
                  </pre>
                )}
                {sshResult.error && (
                  <p className="text-xs text-red-500 mt-1">{sshResult.error}</p>
                )}
              </div>
            )}

            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
              <p className="text-xs text-muted-foreground">
                These controls execute predefined commands on your VPS via SSH. Use <strong>Check Status</strong> to see running processes, <strong>Diagnose</strong> to investigate issues, or <strong>Open Port (SSH)</strong> to fix firewall from inside the VPS. If SSH is also blocked, use <strong>Open Ports (Hostinger API)</strong> to open ports 22 (SSH) and 18789 (gateway) via the Hostinger cloud panel API.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Fix & Deploy to Server
              </CardTitle>
              <CardDescription>
                Diagnose and fix OpenClaw issues on your VPS, or hardcode settings so they survive reboots.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeployCommands(!showDeployCommands)}
              data-testid="button-toggle-deploy-commands"
            >
              {showDeployCommands ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
              {showDeployCommands ? "Hide" : "Show Commands"}
            </Button>
          </div>
        </CardHeader>
        {showDeployCommands && deployCommands && (
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-muted-foreground">Command format:</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={useSSH ? "default" : "outline"}
                  onClick={() => setUseSSH(true)}
                  data-testid="button-ssh-mode"
                >
                  SSH (Remote)
                </Button>
                <Button
                  size="sm"
                  variant={!useSSH ? "default" : "outline"}
                  onClick={() => setUseSSH(false)}
                  data-testid="button-local-mode"
                >
                  Local (On Server)
                </Button>
              </div>
              {deployCommands.config.sshHost && useSSH && (
                <span className="text-xs text-muted-foreground">
                  Target: {deployCommands.config.sshUser}@{deployCommands.config.sshHost}
                </span>
              )}
            </div>

            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 mb-2">
              <p className="text-xs text-muted-foreground">
                <strong>Hostinger users:</strong> You can run these commands from the Docker Manager terminal (VPS → Docker Manager → Projects → Terminal tab). Inside that terminal, you don't need the <code className="bg-muted px-1 rounded">docker exec</code> prefix — just run <code className="bg-muted px-1 rounded">openclaw doctor</code> directly. If using SSH instead, first find your container name with <code className="bg-muted px-1 rounded">docker ps --format '{"{{"}.Names{"}}"}'</code> — it may differ from the default.
              </p>
            </div>

            <div className="rounded-md bg-green-500/10 border border-green-500/20 p-4">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2 mb-2">
                <Wrench className="h-4 w-4" />
                Quick Fix — Doctor Command (Recommended)
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Not loading? Chat not responding? Gateway timed out? Run these commands. The doctor checks your config, diagnoses the problem, and auto-fixes it. Then restart the Docker project to apply.
              </p>

              {Object.entries(deployCommands.doctorFix).map(([key, step]) => (
                <div key={key} className="rounded-md border bg-background p-3 space-y-2 mb-2" data-testid={`deploy-step-${key}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{step.title}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const cmd = useSSH && step.ssh ? step.ssh : step.command;
                        navigator.clipboard.writeText(cmd);
                        toast({ title: "Copied", description: "Command copied to clipboard." });
                      }}
                      data-testid={`button-copy-${key}`}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto select-all font-mono whitespace-pre-wrap break-all" data-testid={`code-${key}`}>
                    {useSSH && step.ssh ? step.ssh : step.command}
                  </pre>
                </div>
              ))}

              <div className="rounded-md bg-muted/50 p-2 mt-2">
                <p className="text-xs text-muted-foreground">
                  <strong>Note:</strong> The Docker project name is <code className="bg-muted px-1 rounded">{deployCommands.dockerProject}</code>. If yours is different, replace it in the commands above. You can find it in your Hostinger Docker Manager under "Projects".
                </p>
              </div>
            </div>

            <div className="border rounded-md">
              <button
                className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setShowManualSteps(!showManualSteps)}
                data-testid="button-toggle-manual-steps"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Advanced: Manual Fix & Persist Settings
                </span>
                {showManualSteps ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {showManualSteps && (
                <div className="p-3 pt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Use these steps if the doctor didn't solve the issue, or if you need to re-register your LLM provider and persist API keys manually.
                  </p>

                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                      Replace YOUR_API_KEY with your actual {deployCommands.config.provider} API key before running.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your key should be set as <code className="bg-muted px-1 rounded">{deployCommands.config.envVar}</code> on the server.
                      {deployCommands.hasRealKey && " You have an LLM API key saved in the dashboard — copy it from the LLM API Keys section below."}
                    </p>
                  </div>

                  {Object.entries(deployCommands.manualFix).map(([key, step]) => (
                    <div key={key} className="rounded-md border p-3 space-y-2" data-testid={`deploy-step-${key}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{step.title}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const cmd = useSSH && step.ssh ? step.ssh : step.command;
                            navigator.clipboard.writeText(cmd);
                            toast({ title: "Copied", description: "Command copied to clipboard." });
                          }}
                          data-testid={`button-copy-${key}`}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto select-all font-mono whitespace-pre-wrap break-all" data-testid={`code-${key}`}>
                        {useSSH && step.ssh ? step.ssh : step.command}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Last resort:</strong> If nothing works, you may need to delete and reinstall OpenClaw on your VPS. This can happen if the initial installation used a model that didn't complete the setup correctly (e.g., GPT-4.5 instead of Opus). Delete the Docker project and follow the installation guide again.
              </p>
            </div>
          </CardContent>
        )}
        {showDeployCommands && !deployCommands && (
          <CardContent>
            <p className="text-sm text-muted-foreground">Save your gateway configuration above first, then fix/deploy commands will be generated.</p>
          </CardContent>
        )}
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
              variant={
                botStatus?.state === "connected" ? "default" :
                botStatus?.state === "connecting" || botStatus?.state === "qr_ready" || botStatus?.state === "pairing_code_ready" ? "secondary" :
                "destructive"
              }
              data-testid="badge-bot-status"
            >
              {botStatus?.state === "connected" ? "Connected" :
               botStatus?.state === "connecting" ? "Connecting..." :
               botStatus?.state === "qr_ready" ? "QR Ready" :
               botStatus?.state === "pairing_code_ready" ? "Enter Code" : "Disconnected"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {botStatus?.state === "connected" && (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 p-4" data-testid="whatsapp-connected-info">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">WhatsApp Connected</p>
                  <p className="text-xs text-muted-foreground">
                    The bot is running{botStatus.phone ? ` on +${botStatus.phone}` : ""}. When someone messages this number, they will receive a pairing code. Approve them in the <strong>Pending Approvals</strong> section below.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restartBotMutation.mutate()}
                    disabled={restartBotMutation.isPending}
                    data-testid="button-restart-bot"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    Restart
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => stopBotMutation.mutate()}
                    disabled={stopBotMutation.isPending}
                    data-testid="button-stop-bot"
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Stop
                  </Button>
                </div>
              </div>
            </div>
          )}

          {botStatus?.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 space-y-3" data-testid="whatsapp-error-banner">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                <p className="text-sm font-medium text-destructive" data-testid="text-bot-error">Bot Disconnected</p>
              </div>
              <p className="text-xs text-destructive/80">{botStatus.error}</p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => startBotMutation.mutate()}
                disabled={startBotMutation.isPending}
                data-testid="button-reconnect"
              >
                {startBotMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {startBotMutation.isPending ? "Reconnecting..." : "Reconnect Now"}
              </Button>
            </div>
          )}

          {botStatus?.state === "connecting" && (
            <div className="flex flex-col items-center gap-3 p-8 rounded-lg border-2 border-dashed border-muted-foreground/20" data-testid="whatsapp-connecting">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Connecting to WhatsApp...</p>
              <p className="text-xs text-muted-foreground">Generating QR code, usually takes 2-3 seconds.</p>
            </div>
          )}

          {botStatus?.state === "qr_ready" && botStatus.qrDataUrl && (
            <div className="flex flex-col items-center gap-4 p-6 rounded-lg border-2 border-primary/30 bg-primary/5" data-testid="whatsapp-qr-display">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-sm font-semibold">Scan this QR code with WhatsApp</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <img
                  src={botStatus.qrDataUrl}
                  alt="WhatsApp QR Code"
                  className="rounded-md"
                  style={{ width: 280, height: 280 }}
                  data-testid="img-whatsapp-qr"
                />
              </div>
              <div className="text-xs text-muted-foreground text-center max-w-sm space-y-1">
                <p>Open <strong>WhatsApp</strong> on your phone</p>
                <p><strong>Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong></p>
                <p>Point your camera at this QR code</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => restartBotMutation.mutate()} disabled={restartBotMutation.isPending} data-testid="button-refresh-qr">
                  <RotateCw className="h-4 w-4 mr-1" />
                  New QR Code
                </Button>
                <button className="text-xs underline text-primary" onClick={() => { stopBotMutation.mutate(); setShowPairingForm(true); }} data-testid="button-switch-to-pairing">
                  Link with phone number instead
                </button>
              </div>
            </div>
          )}

          {botStatus?.state === "pairing_code_ready" && botStatus.pairingCode && (
            <div className="flex flex-col items-center gap-4 p-6 rounded-lg border-2 border-primary/30 bg-primary/5" data-testid="pairing-code-display">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-sm font-semibold">Enter this code in WhatsApp</p>
              </div>
              <div className="text-5xl font-mono font-bold tracking-[0.3em] select-all bg-white dark:bg-muted px-6 py-4 rounded-xl shadow-lg" data-testid="text-pairing-code">
                {botStatus.pairingCode}
              </div>
              <div className="text-xs text-muted-foreground text-center max-w-sm space-y-1">
                <p>On your phone: <strong>WhatsApp</strong> → <strong>Settings</strong> → <strong>Linked Devices</strong></p>
                <p>Tap <strong>Link a Device</strong> → <strong>Link with phone number instead</strong></p>
                <p>Type the code shown above</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => restartBotMutation.mutate()} disabled={restartBotMutation.isPending} data-testid="button-refresh-pairing">
                <RotateCw className="h-4 w-4 mr-1" />
                Get New Code
              </Button>
            </div>
          )}

          {showPairingForm && (botStatus?.state === "disconnected" || botStatus?.state === "connecting" || !botStatus) && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 space-y-3" data-testid="pairing-phone-form">
              <p className="text-sm font-semibold">Enter your WhatsApp phone number</p>
              <p className="text-xs text-muted-foreground">
                Use international format without the + sign (e.g. <strong>48123456789</strong> for Poland, <strong>13405140344</strong> for US)
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="13405140344"
                  value={pairingPhoneInput}
                  onChange={(e) => setPairingPhoneInput(e.target.value)}
                  className="max-w-xs"
                  data-testid="input-pairing-phone"
                />
                <Button
                  onClick={() => {
                    if (pairingPhoneInput.trim()) {
                      pairWithPhoneMutation.mutate(pairingPhoneInput.trim());
                    }
                  }}
                  disabled={!pairingPhoneInput.trim() || pairWithPhoneMutation.isPending}
                  data-testid="button-submit-pairing"
                >
                  {pairWithPhoneMutation.isPending ? "Requesting..." : "Get Pairing Code"}
                </Button>
              </div>
              <button className="text-xs underline text-primary" onClick={() => { setShowPairingForm(false); }} data-testid="button-back-to-qr">
                Back to QR Code option
              </button>
            </div>
          )}

          {(botStatus?.state === "disconnected" || !botStatus) && !botStatus?.error && !showPairingForm && (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <button
                  onClick={() => startBotMutation.mutate()}
                  disabled={startBotMutation.isPending || pairWithPhoneMutation.isPending}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-start-bot"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    {startBotMutation.isPending ? (
                      <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    ) : (
                      <MessageSquare className="h-7 w-7 text-primary" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{startBotMutation.isPending ? "Generating QR..." : "Generate QR Code"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Scan with your phone camera</p>
                  </div>
                </button>
                <button
                  onClick={() => setShowPairingForm(true)}
                  disabled={pairWithPhoneMutation.isPending}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-pair-phone"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <Smartphone className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Link with Phone Number</p>
                    <p className="text-xs text-muted-foreground mt-1">Enter a pairing code manually</p>
                  </div>
                </button>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground text-center">
                  In WhatsApp: <strong>Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong>
                </p>
              </div>
            </div>
          )}

          <div className="rounded-md border p-4 space-y-2" data-testid="whatsapp-phone-config">
            <Label htmlFor="whatsappPhone" className="text-sm font-medium">Bot Phone Number</Label>
            <p className="text-xs text-muted-foreground">The WhatsApp phone number the bot should use (international format with country code, e.g. +13405140344).</p>
            <div className="flex items-center gap-2">
              <Input
                id="whatsappPhone"
                value={formValues.whatsappPhone}
                onChange={(e) => setFormValues((v) => ({ ...v, whatsappPhone: e.target.value }))}
                placeholder="+13405140344"
                data-testid="input-whatsapp-phone"
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(formValues)}
                disabled={saveMutation.isPending}
                data-testid="button-save-whatsapp-phone"
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ApproveByCodeCard />

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
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-wa-code-${session.id}`}>Code: {session.pairingCode}</Badge>
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
                      <p className="text-sm font-medium" data-testid={`text-approved-wa-phone-${session.id}`}>+{session.phone}</p>
                      {session.displayName && (
                        <span className="text-sm text-muted-foreground" data-testid={`text-approved-wa-name-${session.id}`}>{session.displayName}</span>
                      )}
                      <Badge variant="default" className="text-xs" data-testid={`badge-approved-wa-${session.id}`}>Approved</Badge>
                    </div>
                    {session.lastMessageAt && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-approved-wa-lastmsg-${session.id}`}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Gateway Settings
          </CardTitle>
          <CardDescription>Configure the OpenClaw gateway server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {config?.gatewayToken && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3" data-testid="connection-summary">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield className="h-4 w-4 text-primary" />
                Connection Summary
              </div>
              <div className="grid gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground min-w-32">Registered Token:</span>
                  <code className="bg-background px-2 py-0.5 rounded font-mono" data-testid="text-summary-token">
                    {config.gatewayToken.slice(0, 12)}...{config.gatewayToken.slice(-12)}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(config.gatewayToken!);
                      toast({ title: "Copied", description: "Registered gateway token copied. Compare this with the token shown in your native OpenClaw dashboard." });
                    }}
                    data-testid="button-copy-summary-token"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground min-w-32">WebSocket Address:</span>
                  <code className="bg-background px-2 py-0.5 rounded font-mono" data-testid="text-summary-ws">
                    {config.websocketUrl || (() => {
                      try {
                        const u = new URL(currentInstance?.serverUrl || "");
                        return `ws://${u.hostname}:${config.gatewayPort}`;
                      } catch { return `ws://your-server:${config.gatewayPort}`; }
                    })()}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    type="button"
                    onClick={() => {
                      const wsAddr = config.websocketUrl || (() => {
                        try {
                          const u = new URL(currentInstance?.serverUrl || "");
                          return `ws://${u.hostname}:${config.gatewayPort}`;
                        } catch { return ""; }
                      })();
                      if (wsAddr) {
                        navigator.clipboard.writeText(wsAddr);
                        toast({ title: "Copied", description: "WebSocket address copied." });
                      }
                    }}
                    data-testid="button-copy-summary-ws"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Compare these values with what your <strong>native OpenClaw dashboard</strong> shows under "Gateway Access". If the token or WebSocket URL don't match, update the values below and save.
              </p>
            </div>
          )}

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

          <div className="space-y-2">
            <Label htmlFor="gateway_token">Gateway Token</Label>
            <div className="flex gap-2">
              <Input
                id="gateway_token"
                type={showToken ? "text" : "password"}
                value={formValues.gatewayToken}
                onChange={(e) => setFormValues((p) => ({ ...p, gatewayToken: e.target.value }))}
                placeholder="Paste your gateway token from ~/.openclaw/openclaw.json"
                data-testid="input-gateway-token"
              />
              <Button
                size="icon"
                variant="ghost"
                type="button"
                onClick={() => setShowToken(!showToken)}
                data-testid="button-toggle-token-visibility"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              {formValues.gatewayToken && (
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(formValues.gatewayToken);
                    toast({ title: "Copied", description: "Gateway token copied." });
                  }}
                  data-testid="button-copy-gateway-token"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  const bytes = new Uint8Array(24);
                  crypto.getRandomValues(bytes);
                  const token = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
                  setFormValues((p) => ({ ...p, gatewayToken: token }));
                  setShowToken(true);
                  toast({ title: "Token generated", description: "A new 48-character hex token has been created. Save the config and update your VPS to use it." });
                }}
                data-testid="button-generate-gateway-token"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This token must match the one on your VPS. To check your VPS token, open the <strong>native OpenClaw dashboard</strong> and look under "Gateway Access → Gateway Token". If they don't match, either paste the VPS token here or generate a new one and update your VPS: <code className="bg-muted px-1 rounded">openclaw config set gateway.auth.token YOUR_NEW_TOKEN</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gateway_password">Gateway Password</Label>
            <div className="flex gap-2">
              <Input
                id="gateway_password"
                type={showPassword ? "text" : "password"}
                value={formValues.gatewayPassword}
                onChange={(e) => setFormValues((p) => ({ ...p, gatewayPassword: e.target.value }))}
                placeholder="System or shared password for gateway WebSocket auth"
                data-testid="input-gateway-password"
              />
              <Button
                size="icon"
                variant="ghost"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                data-testid="button-toggle-password-visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The password used by the native dashboard for WebSocket authentication. Set via <code className="text-xs">openclaw config set gateway.password YOUR_PASSWORD</code> on your server.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="websocket_url">WebSocket URL</Label>
            <div className="flex gap-2">
              <Input
                id="websocket_url"
                value={formValues.websocketUrl}
                onChange={(e) => setFormValues((p) => ({ ...p, websocketUrl: e.target.value }))}
                placeholder={(() => {
                  if (currentInstance?.serverUrl) {
                    try {
                      const u = new URL(currentInstance.serverUrl);
                      return `ws://${u.hostname}:${formValues.gatewayPort}`;
                    } catch {}
                  }
                  return "ws://your-server-ip:18789";
                })()}
                data-testid="input-websocket-url"
              />
              {formValues.websocketUrl && (
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(formValues.websocketUrl);
                    toast({ title: "Copied", description: "WebSocket URL copied to clipboard." });
                  }}
                  data-testid="button-copy-websocket-url"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              {!formValues.websocketUrl && currentInstance?.serverUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    try {
                      const u = new URL(currentInstance.serverUrl!);
                      const wsUrl = `ws://${u.hostname}:${formValues.gatewayPort}`;
                      setFormValues((p) => ({ ...p, websocketUrl: wsUrl }));
                      toast({ title: "Auto-filled", description: `WebSocket URL set to ${wsUrl}` });
                    } catch {
                      toast({ title: "Error", description: "Could not determine WebSocket URL from server address.", variant: "destructive" });
                    }
                  }}
                  data-testid="button-autofill-websocket-url"
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  Auto-fill
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              The WebSocket URL the gateway uses for real-time connections. The native dashboard shows this under <strong>Gateway Access → WebSocket URL</strong> (usually <code className="bg-muted px-1 rounded">ws://localhost:18789</code>). For remote access, replace <code>localhost</code> with your server IP.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="docker_project">Docker Project Name</Label>
            <Input
              id="docker_project"
              value={formValues.dockerProject}
              onChange={(e) => setFormValues((p) => ({ ...p, dockerProject: e.target.value }))}
              placeholder="claw"
              data-testid="input-docker-project"
            />
            <p className="text-xs text-muted-foreground">
              The Docker Compose project name on your VPS. This determines the container name used in deploy commands (e.g. <code className="text-xs">{formValues.dockerProject}-openclaw-1</code>). Run <code className="text-xs">docker ps --format '{"{{"}.Names{"}}"}'</code> on your VPS to find the correct container name.
            </p>
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
