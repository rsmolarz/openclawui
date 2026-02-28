import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Cpu,
  Package,
  Loader2,
  Home,
  Gamepad2,
  Server,
  Terminal,
  Upload,
} from "lucide-react";
import { useInstance } from "@/hooks/use-instance";

type Plugin = {
  name: string;
  description: string;
  category: string;
  author: string;
  installed: boolean;
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
  const { toast } = useToast();
  const { selectedInstanceId: instanceId } = useInstance();

  const { data, isLoading, refetch, isRefetching } = useQuery<{ plugins: Plugin[]; sshConnected: boolean }>({
    queryKey: ["/api/marketplace/plugins", instanceId],
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

  const plugins = data?.plugins || [];
  const categories = Array.from(new Set(plugins.map((p) => p.category))).sort();

  const filtered = plugins.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const installedCount = plugins.filter((p) => p.installed).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-marketplace-title">
            Skill Marketplace
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-marketplace-subtitle">
            Browse and install OpenClaw plugins
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
    </div>
  );
}
