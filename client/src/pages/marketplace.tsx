import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Download,
  Check,
  X,
  RefreshCw,
  MessageSquare,
  Brain,
  Music,
  Wrench,
  Monitor,
  Package,
  Loader2,
  Home,
  Gamepad2,
  Server,
  Terminal,
  Upload,
  Plus,
  ArrowRight,
  Zap,
  Code,
  FileCode,
  Clock,
} from "lucide-react";
import { useInstance } from "@/hooks/use-instance";

type Plugin = {
  name: string;
  description: string;
  category: string;
  author: string;
  installed: boolean;
};

type SkillTemplate = {
  name: string;
  label: string;
  description: string;
  tools: string[];
  handler: string;
};

type TriggerLogEntry = {
  timestamp: string;
  source: string;
  action: string;
  payload: any;
  result: string;
};

const categoryIcons: Record<string, typeof MessageSquare> = {
  messaging: MessageSquare,
  communication: MessageSquare,
  productivity: Wrench,
  media: Music,
  ai: Brain,
  utilities: Monitor,
  hardware: Gamepad2,
  "node-control": Terminal,
  "smart-home": Home,
  devops: Server,
  general: Package,
};

const categoryColors: Record<string, string> = {
  messaging: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  communication: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  productivity: "bg-green-500/10 text-green-700 dark:text-green-400",
  media: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  ai: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  utilities: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  hardware: "bg-red-500/10 text-red-700 dark:text-red-400",
  "node-control": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  "smart-home": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  devops: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  general: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("browse");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customTools, setCustomTools] = useState("");
  const [customHandler, setCustomHandler] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const { toast } = useToast();
  const { selectedInstanceId: instanceId } = useInstance();

  const { data, isLoading, refetch, isRefetching } = useQuery<{ plugins: Plugin[]; sshConnected: boolean }>({
    queryKey: ["/api/marketplace/plugins", instanceId],
  });

  const { data: templates } = useQuery<SkillTemplate[]>({
    queryKey: ["/api/custom-skills/templates"],
  });

  const { data: triggerLog } = useQuery<TriggerLogEntry[]>({
    queryKey: ["/api/webhooks/skill-trigger/log"],
    refetchInterval: 10000,
  });

  const installMutation = useMutation({
    mutationFn: async (pluginName: string) => {
      const res = await apiRequest("POST", `/api/marketplace/plugins/${pluginName}/install`, { instanceId });
      return res.json();
    },
    onSuccess: (_data, pluginName) => {
      toast({ title: "Plugin installed", description: `${pluginName} has been installed successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/plugins", instanceId] });
    },
    onError: (err: any) => {
      toast({ title: "Install failed", description: err.message || "Failed to install plugin", variant: "destructive" });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: async (pluginName: string) => {
      const res = await apiRequest("POST", `/api/marketplace/plugins/${pluginName}/uninstall`, { instanceId });
      return res.json();
    },
    onSuccess: (_data, pluginName) => {
      toast({ title: "Plugin removed", description: `${pluginName} has been disabled.` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/plugins", instanceId] });
    },
    onError: (err: any) => {
      toast({ title: "Uninstall failed", description: err.message || "Failed to uninstall plugin", variant: "destructive" });
    },
  });

  const deployMutation = useMutation({
    mutationFn: async (skillName: string) => {
      const res = await apiRequest("POST", "/api/marketplace/node-skills/deploy", { skillName, instanceId });
      return res.json();
    },
    onSuccess: (_data, skillName) => {
      toast({ title: "Skill deployed", description: `${skillName} has been deployed to the VPS node.` });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/plugins", instanceId] });
    },
    onError: (err: any) => {
      toast({ title: "Deploy failed", description: err.message || "Failed to deploy skill", variant: "destructive" });
    },
  });

  const createSkillMutation = useMutation({
    mutationFn: async (params: { name: string; description: string; tools: string[]; handlerCode: string }) => {
      const res = await apiRequest("POST", "/api/custom-skills/create", params);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Skill created", description: `${data.name} deployed to ${data.path}` });
      setCustomName("");
      setCustomDescription("");
      setCustomTools("");
      setCustomHandler("");
      setSelectedTemplate(null);
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/plugins", instanceId] });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: err.message || "Failed to create skill", variant: "destructive" });
    },
  });

  const plugins = data?.plugins || [];
  const categories = Array.from(new Set(plugins.map((p) => p.category))).sort();

  const filtered = plugins.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const installedCount = plugins.filter((p) => p.installed).length;

  function applyTemplate(template: SkillTemplate) {
    setCustomName(template.name);
    setCustomDescription(template.description);
    setCustomTools(template.tools.join(", "));
    setCustomHandler(template.handler);
    setSelectedTemplate(template.name);
  }

  function handleCreateSkill() {
    if (!customName || !customDescription) {
      toast({ title: "Missing fields", description: "Name and description are required", variant: "destructive" });
      return;
    }
    const tools = customTools.split(",").map((t) => t.trim()).filter(Boolean);
    createSkillMutation.mutate({
      name: customName,
      description: customDescription,
      tools,
      handlerCode: customHandler,
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-marketplace-title">
            Skill Marketplace
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-marketplace-subtitle">
            Browse, install, and create OpenClaw skills
            {plugins.length > 0 && ` · ${installedCount}/${plugins.length} installed`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-plugins"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-marketplace">
          <TabsTrigger value="browse" data-testid="tab-browse">
            <Package className="h-4 w-4 mr-1.5" />
            Browse Skills
          </TabsTrigger>
          <TabsTrigger value="create" data-testid="tab-create">
            <Plus className="h-4 w-4 mr-1.5" />
            Custom Skill Builder
          </TabsTrigger>
          <TabsTrigger value="architecture" data-testid="tab-architecture">
            <Zap className="h-4 w-4 mr-1.5" />
            Integration Architecture
          </TabsTrigger>
          <TabsTrigger value="triggers" data-testid="tab-triggers">
            <Clock className="h-4 w-4 mr-1.5" />
            Trigger Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search plugins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-plugins"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={categoryFilter === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setCategoryFilter(null)}
                data-testid="badge-filter-all"
              >
                All
              </Badge>
              {categories.map((cat) => (
                <Badge
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  data-testid={`badge-filter-${cat}`}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>

          {!data?.sshConnected && !isLoading && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground" data-testid="text-ssh-warning">
                  SSH connection unavailable. Showing curated plugin catalog. Connect VPS to see live installed status.
                </p>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-plugins">No plugins found matching your search.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((plugin) => {
                const CategoryIcon = categoryIcons[plugin.category] || Package;
                const isInstalling = installMutation.isPending && installMutation.variables === plugin.name;
                const isUninstalling = uninstallMutation.isPending && uninstallMutation.variables === plugin.name;
                const isDeploying = deployMutation.isPending && deployMutation.variables === plugin.name;
                const isNodeSkill = ["node-control", "smart-home", "devops"].includes(plugin.category);

                return (
                  <Card key={plugin.name} data-testid={`card-plugin-${plugin.name}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${categoryColors[plugin.category] || categoryColors.general}`}>
                            <CategoryIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm truncate" data-testid={`text-plugin-name-${plugin.name}`}>
                              {plugin.name}
                            </CardTitle>
                            <span className="text-xs text-muted-foreground capitalize">{plugin.category}</span>
                          </div>
                        </div>
                        {plugin.installed && (
                          <Badge variant="secondary" className="shrink-0" data-testid={`badge-installed-${plugin.name}`}>
                            <Check className="h-3 w-3 mr-1" />
                            Installed
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-2 line-clamp-2" data-testid={`text-plugin-desc-${plugin.name}`}>
                        {plugin.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2">
                        {plugin.installed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => uninstallMutation.mutate(plugin.name)}
                            disabled={isUninstalling}
                            data-testid={`button-uninstall-${plugin.name}`}
                          >
                            {isUninstalling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                            Disable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => installMutation.mutate(plugin.name)}
                            disabled={isInstalling}
                            data-testid={`button-install-${plugin.name}`}
                          >
                            {isInstalling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                            Install
                          </Button>
                        )}
                        {isNodeSkill && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => deployMutation.mutate(plugin.name)}
                            disabled={isDeploying}
                            data-testid={`button-deploy-${plugin.name}`}
                          >
                            {isDeploying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                            Deploy to Node
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create" className="space-y-6 mt-4">
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-custom-skill-title">Custom Skill Builder</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create private skills with SKILL.md + handler.py and deploy directly to your VPS node
            </p>
          </div>

          {templates && templates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Start from a template</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((tpl) => (
                  <Card
                    key={tpl.name}
                    className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedTemplate === tpl.name ? "border-primary ring-1 ring-primary/30" : ""}`}
                    onClick={() => applyTemplate(tpl)}
                    data-testid={`card-template-${tpl.name}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{tpl.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.tools.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Skill Name</label>
              <Input
                placeholder="my-custom-skill"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                data-testid="input-skill-name"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="What does this skill do?"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                data-testid="input-skill-description"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tools (comma-separated)</label>
              <Input
                placeholder="run_command, get_status, execute"
                value={customTools}
                onChange={(e) => setCustomTools(e.target.value)}
                data-testid="input-skill-tools"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Handler Code (Python)</label>
              <Textarea
                placeholder="import subprocess&#10;&#10;def run(command: str):&#10;    result = subprocess.run(command, shell=True, capture_output=True, text=True)&#10;    return {'stdout': result.stdout, 'returncode': result.returncode}"
                value={customHandler}
                onChange={(e) => setCustomHandler(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
                data-testid="textarea-skill-handler"
              />
            </div>
            <Button
              onClick={handleCreateSkill}
              disabled={createSkillMutation.isPending}
              data-testid="button-create-skill"
            >
              {createSkillMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Create & Deploy to Node
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium mb-2">Skill File Structure</h3>
              <pre className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md font-mono">
{`~/.openclaw/skills/<skill-name>/
  SKILL.md      # Skill metadata (name, description, tools)
  handler.py    # Python implementation of tools`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="architecture" className="space-y-6 mt-4">
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-architecture-title">Integration Architecture</h2>
            <p className="text-sm text-muted-foreground mt-1">
              How OpenClaw connects Stream Deck, Companion, Home Assistant, and your devices
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stream Deck + Companion + OpenClaw Flow</CardTitle>
              <CardDescription>The recommended architecture for hardware button control</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-4" data-testid="diagram-architecture">
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-14 w-14 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Gamepad2 className="h-7 w-7 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="text-xs font-medium">Stream Deck</span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-14 w-14 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Monitor className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-xs font-medium">Companion</span>
                    <span className="text-[10px] text-muted-foreground">(optional)</span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-14 w-14 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <Zap className="h-7 w-7 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <span className="text-xs font-medium">OpenClaw Skill</span>
                    <span className="text-[10px] text-muted-foreground">webhook listener</span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-14 w-14 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Home className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-xs font-medium">Home Assistant</span>
                    <span className="text-[10px] text-muted-foreground">+ system control</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4" />
                  Method 1: Direct Webhook
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Stream Deck sends HTTP POST directly to OpenClaw skill webhook listener.</p>
                <pre className="text-[10px] bg-muted/50 p-2 rounded font-mono" data-testid="text-method-1">
{`Stream Deck button
  → HTTP POST
  → OpenClaw webhook-agent
  → execute action`}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Method 2: Via Companion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Companion relays button presses to OpenClaw via HTTP/WebSocket/REST.</p>
                <pre className="text-[10px] bg-muted/50 p-2 rounded font-mono" data-testid="text-method-2">
{`Stream Deck
  → Companion
  → OpenClaw API
  → system automation`}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Method 3: HA Add-on
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">OpenClaw runs as a native Home Assistant add-on with deep integration.</p>
                <pre className="text-[10px] bg-muted/50 p-2 rounded font-mono" data-testid="text-method-3">
{`HA Add-on
  → OpenClaw gateway
  → direct HA API access
  → automation brain`}
                </pre>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Webhook Endpoint</CardTitle>
              <CardDescription>
                Public endpoint for receiving triggers from Stream Deck, Companion, or any HTTP source
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">POST</span>
                  <code className="ml-2 text-sm font-mono bg-muted/50 px-2 py-0.5 rounded" data-testid="text-webhook-url">
                    /api/webhooks/skill-trigger
                  </code>
                </div>
                <pre className="text-xs bg-muted/50 p-3 rounded font-mono">
{`// Example request body:
{
  "action": "start_superwhisper",
  "source": "streamdeck",
  "payload": { "button": 5 }
}`}
                </pre>
                <p className="text-xs text-muted-foreground">
                  No authentication required. Set <code className="bg-muted/50 px-1 rounded">X-Trigger-Source</code> header or include <code className="bg-muted/50 px-1 rounded">source</code> in body.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supported Integration Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Smart Home</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Home Assistant (REST API + Add-on)</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Homebridge</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> HomeKit</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Philips Hue</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Sonos</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> MQTT devices</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Hardware & DevOps</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Stream Deck (webhook)</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Bitfocus Companion</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> Docker containers</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> SSH remote execution</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> USB / serial devices</li>
                    <li className="flex items-center gap-2"><Check className="h-3 w-3 text-green-500" /> System process control</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triggers" className="space-y-4 mt-4">
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-trigger-log-title">Webhook Trigger Log</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Recent incoming triggers from Stream Deck, Companion, and external sources
            </p>
          </div>

          {!triggerLog || triggerLog.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-triggers">
                  No triggers received yet. Send a POST to <code className="bg-muted/50 px-1 rounded">/api/webhooks/skill-trigger</code>
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {triggerLog.slice().reverse().map((entry, i) => (
                <Card key={i} data-testid={`card-trigger-${i}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500/10">
                      <Zap className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" data-testid={`text-trigger-action-${i}`}>{entry.action}</span>
                        <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    {Object.keys(entry.payload || {}).length > 0 && (
                      <code className="text-[10px] bg-muted/50 px-2 py-1 rounded max-w-[200px] truncate">
                        {JSON.stringify(entry.payload)}
                      </code>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
