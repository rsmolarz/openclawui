import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Terminal, FolderOpen, Eye, FileText, Globe, Database, Mail,
  Calendar, Volume2, Languages, Calculator, Camera, BarChart3, Clock,
  Heart, BookOpen, Webhook, Braces, KeyRound, MessageSquare, Container,
  ScrollText, Radar, Download, Trash2, RefreshCw, CheckCircle, XCircle,
  Zap, Filter, Brain, Network, LayoutGrid, Hash, MessageCircle,
  GitBranch, ClipboardList, CreditCard, Smartphone, Table, HardDrive,
  Target, Send, Rss, Activity, Cpu, Waypoints, Workflow, Shield, Music,
  Youtube, Mic, Paintbrush, GitPullRequest, TestTube, Lock, Wifi,
  Tags, AlertTriangle, Bell, Cloud, Rocket,
} from "lucide-react";
import { useState } from "react";
import type { Skill } from "@shared/schema";

const ICON_MAP: Record<string, React.ElementType> = {
  Search, Terminal, FolderOpen, Eye, FileText, Globe, Database, Mail,
  Calendar, Volume2, Languages, Calculator, Camera, BarChart3, Clock,
  Heart, BookOpen, Webhook, Braces, KeyRound, MessageSquare, Container,
  ScrollText, Radar, Brain, Network, LayoutGrid, Hash, MessageCircle,
  GitBranch, ClipboardList, CreditCard, Smartphone, Table, HardDrive,
  Target, Send, Rss, Activity, Cpu, Waypoints, Workflow, Shield, Music,
  Youtube, Mic, Paintbrush, GitPullRequest, TestTube, Lock, Wifi,
  Tags, AlertTriangle, Bell, Cloud, Rocket,
};

interface CatalogSkill {
  skillId: string;
  name: string;
  description: string;
  category: string;
  version: string;
  icon: string;
  installed: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  ai: "AI / ML",
  research: "Research",
  development: "Development",
  system: "System",
  communication: "Communication",
  productivity: "Productivity",
};

function SkillIcon({ icon, className }: { icon: string; className?: string }) {
  const IconComponent = ICON_MAP[icon] || Zap;
  return <IconComponent className={className || "h-5 w-5"} />;
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "ai": return "text-purple-500 dark:text-purple-400";
    case "research": return "text-blue-500 dark:text-blue-400";
    case "development": return "text-green-600 dark:text-green-400";
    case "system": return "text-orange-500 dark:text-orange-400";
    case "communication": return "text-pink-500 dark:text-pink-400";
    case "productivity": return "text-cyan-600 dark:text-cyan-400";
    default: return "text-muted-foreground";
  }
}

export default function SettingsSkills() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: installedSkills, isLoading: skillsLoading } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });

  const { data: catalog, isLoading: catalogLoading, refetch: refetchCatalog } = useQuery<CatalogSkill[]>({
    queryKey: ["/api/skills/catalog"],
  });

  const installMutation = useMutation({
    mutationFn: async (skill: CatalogSkill) => {
      await apiRequest("POST", "/api/skills", {
        skillId: skill.skillId,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        version: skill.version,
        icon: skill.icon,
        enabled: true,
        status: "active",
      });
    },
    onSuccess: (_data, skill) => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills/catalog"] });
      toast({ title: "Skill installed", description: `${skill.name} has been added.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to install skill.", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/skills/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills/catalog"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update skill.", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills/catalog"] });
      toast({ title: "Skill removed", description: "Skill has been uninstalled." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove skill.", variant: "destructive" });
    },
  });

  const installAllMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/skills/install-all");
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills/catalog"] });
      toast({
        title: "All skills installed",
        description: `${data.newlyRegistered} new skills installed, ${data.previouslyInstalled} already present. VPS sync triggered.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to install all skills.", variant: "destructive" });
    },
  });

  const filterItems = <T extends { name: string; category: string; description?: string | null }>(items: T[]): T[] => {
    return items.filter(item => {
      const matchesSearch = !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  };

  const availableSkills = catalog?.filter(s => !s.installed) || [];
  const filteredInstalled = filterItems(installedSkills || []);
  const filteredAvailable = filterItems(availableSkills);

  if (skillsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-skills-title">Skills</h1>
          <p className="text-muted-foreground mt-1">
            Manage the capabilities available to your OpenClaw agent
          </p>
        </div>
        {availableSkills.length > 0 && (
          <Button
            onClick={() => installAllMutation.mutate()}
            disabled={installAllMutation.isPending}
            data-testid="button-install-all-skills"
          >
            {installAllMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {installAllMutation.isPending ? "Installing..." : `Install All (${availableSkills.length})`}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-skills"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-category-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="installed" data-testid="tabs-skills">
        <TabsList>
          <TabsTrigger value="installed" data-testid="tab-installed">
            Installed ({installedSkills?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="available" data-testid="tab-available">
            Available ({availableSkills.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-4">
          {filteredInstalled.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery || categoryFilter !== "all"
                    ? "No installed skills match your filters."
                    : "No skills installed yet. Browse the Available tab to add some."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInstalled.map(skill => (
                <Card key={skill.id} data-testid={`card-skill-${skill.skillId}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted ${getCategoryColor(skill.category)}`}>
                          <SkillIcon icon={skill.icon || "Zap"} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm">{skill.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">{skill.category}</Badge>
                            <span className="text-xs text-muted-foreground">v{skill.version}</span>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: skill.id, enabled: checked })}
                        data-testid={`switch-skill-${skill.skillId}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground mb-3">{skill.description}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {skill.enabled ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {skill.enabled ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(skill.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-skill-${skill.skillId}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="mt-4">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Browse and install new skills for your agent
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchCatalog()}
              disabled={catalogLoading}
              data-testid="button-refresh-catalog"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${catalogLoading ? "animate-spin" : ""}`} />
              Check for Updates
            </Button>
          </div>

          {catalogLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : filteredAvailable.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery || categoryFilter !== "all"
                    ? "No available skills match your filters."
                    : "All available skills are installed."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAvailable.map(skill => (
                <Card key={skill.skillId} data-testid={`card-catalog-${skill.skillId}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted ${getCategoryColor(skill.category)}`}>
                        <SkillIcon icon={skill.icon} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm">{skill.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{skill.category}</Badge>
                          <span className="text-xs text-muted-foreground">v{skill.version}</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground mb-3">{skill.description}</p>
                    <Button
                      size="sm"
                      onClick={() => installMutation.mutate(skill)}
                      disabled={installMutation.isPending}
                      data-testid={`button-install-${skill.skillId}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Install
                    </Button>
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
