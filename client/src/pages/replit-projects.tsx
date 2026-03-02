import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Code2, RefreshCw, Plus, ExternalLink, Pencil, Trash2,
  Globe, Lock, Search, Activity, CheckCircle2, XCircle,
  Clock, AlertTriangle, Loader2,
} from "lucide-react";
import type { ReplitProject } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 dark:text-green-400",
  paused: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  archived: "bg-gray-500/10 text-gray-500",
  completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const DEPLOYMENT_ICONS: Record<string, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  deployed: CheckCircle2,
  unhealthy: XCircle,
  unreachable: XCircle,
  timeout: AlertTriangle,
  no_deployment: Clock,
};

const DEPLOYMENT_COLORS: Record<string, string> = {
  healthy: "text-green-500",
  deployed: "text-green-500",
  unhealthy: "text-red-500",
  unreachable: "text-red-500",
  timeout: "text-yellow-500",
  no_deployment: "text-muted-foreground",
};

function formatTimestamp(ts: string | null) {
  if (!ts) return "Never";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AddProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", slug: "", url: "", description: "", language: "", deploymentUrl: "", notes: "", status: "active" });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      await apiRequest("POST", "/api/replit-projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Project added" });
      onOpenChange(false);
      setForm({ title: "", slug: "", url: "", description: "", language: "", deploymentUrl: "", notes: "", status: "active" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add project", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-add-project">
        <DialogHeader>
          <DialogTitle>Add Replit Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="My Project" data-testid="input-project-title" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="my-project" data-testid="input-project-slug" />
          </div>
          <div>
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://replit.com/@user/project" data-testid="input-project-url" />
          </div>
          <div>
            <Label>Deployment URL (optional)</Label>
            <Input value={form.deploymentUrl} onChange={(e) => setForm({ ...form, deploymentUrl: e.target.value })} placeholder="https://project.replit.app" data-testid="input-project-deployment-url" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Language</Label>
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="TypeScript" data-testid="input-project-language" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this project do?" data-testid="input-project-description" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Progress notes..." data-testid="input-project-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-add-project">Cancel</Button>
          <Button onClick={() => createMutation.mutate(form)} disabled={!form.title || !form.slug || !form.url || createMutation.isPending} data-testid="button-submit-add-project">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({ project, open, onOpenChange }: { project: ReplitProject; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: project.title,
    description: project.description || "",
    deploymentUrl: project.deploymentUrl || "",
    notes: project.notes || "",
    status: project.status,
    progress: project.progress,
    tags: (project.tags || []).join(", "),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/replit-projects/${project.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Project updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    updateMutation.mutate({ ...form, tags: tags.length > 0 ? tags : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-edit-project">
        <DialogHeader>
          <DialogTitle>Edit: {project.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-edit-title" />
          </div>
          <div>
            <Label>Deployment URL</Label>
            <Input value={form.deploymentUrl} onChange={(e) => setForm({ ...form, deploymentUrl: e.target.value })} data-testid="input-edit-deployment-url" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Progress: {form.progress}%</Label>
              <Slider value={[form.progress]} onValueChange={([v]) => setForm({ ...form, progress: v })} max={100} step={5} className="mt-2" data-testid="slider-edit-progress" />
            </div>
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="frontend, production, api" data-testid="input-edit-tags" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-edit-description" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} data-testid="input-edit-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-edit">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project }: { project: ReplitProject }) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/replit-projects/${project.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Project removed" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/replit-projects/${project.id}/check-deployment`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: `Deployment: ${data.status}`, description: data.url });
    },
    onError: () => {
      toast({ title: "Check failed", variant: "destructive" });
    },
  });

  const deployStatus = project.deploymentStatus || "no_deployment";
  const DeployIcon = DEPLOYMENT_ICONS[deployStatus] || Clock;
  const deployColor = DEPLOYMENT_COLORS[deployStatus] || "text-muted-foreground";

  return (
    <>
      <Card className="group relative" data-testid={`card-project-${project.id}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {project.isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <CardTitle className="text-base truncate" data-testid={`text-project-title-${project.id}`}>
                  {project.title}
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.slug}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} data-testid={`button-edit-project-${project.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate()} data-testid={`button-delete-project-${project.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-project-desc-${project.id}`}>
              {project.description}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={STATUS_COLORS[project.status] || ""} data-testid={`badge-status-${project.id}`}>
              {project.status}
            </Badge>
            {project.language && (
              <Badge variant="outline" className="text-xs" data-testid={`badge-lang-${project.id}`}>
                {project.language}
              </Badge>
            )}
            {project.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>

          {project.progress > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span data-testid={`text-progress-${project.id}`}>{project.progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <DeployIcon className={`h-3.5 w-3.5 ${deployColor}`} />
              <span className={`text-xs ${deployColor}`}>{deployStatus.replace(/_/g, " ")}</span>
            </div>
            <div className="text-xs text-muted-foreground" data-testid={`text-synced-${project.id}`}>
              {project.lastSynced ? `Synced ${formatTimestamp(project.lastSynced as any)}` : "Not synced"}
            </div>
          </div>

          {project.notes && (
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-notes-${project.id}`}>
                {project.notes}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <a href={project.url} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" size="sm" className="w-full text-xs" data-testid={`button-open-replit-${project.id}`}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Replit
              </Button>
            </a>
            {project.deploymentUrl && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => checkMutation.mutate()}
                disabled={checkMutation.isPending}
                data-testid={`button-check-deploy-${project.id}`}
              >
                {checkMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {editOpen && <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />}
    </>
  );
}

export default function ReplitProjects() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncUsername, setSyncUsername] = useState("");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const { data: projects, isLoading } = useQuery<ReplitProject[]>({
    queryKey: ["/api/replit-projects"],
    refetchInterval: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiRequest("POST", "/api/replit-projects/sync", { username });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Sync complete", description: `${data.total} projects found (${data.created} new, ${data.updated} updated)` });
      setSyncDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const checkAllMutation = useMutation({
    mutationFn: async () => {
      const deployedProjects = (projects || []).filter((p) => p.deploymentUrl);
      const results = await Promise.allSettled(
        deployedProjects.map((p) => apiRequest("POST", `/api/replit-projects/${p.id}/check-deployment`))
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Health checks complete" });
    },
  });

  const filtered = (projects || []).filter((p) => {
    const matchesSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase().includes(search.toLowerCase())) ||
      (p.language?.toLowerCase().includes(search.toLowerCase())) ||
      (p.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase())));
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: projects?.length || 0,
    active: projects?.filter((p) => p.status === "active").length || 0,
    deployed: projects?.filter((p) => p.deploymentUrl).length || 0,
    healthy: projects?.filter((p) => p.deploymentStatus === "healthy" || p.deploymentStatus === "deployed").length || 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Code2 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-replit-projects-title">Replit Projects</h1>
            <p className="text-sm text-muted-foreground">Monitor and manage all your Replit projects</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSyncDialogOpen(true)} data-testid="button-sync-replit">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync from Replit
          </Button>
          <Button variant="outline" size="sm" onClick={() => checkAllMutation.mutate()} disabled={checkAllMutation.isPending || !projects?.some((p) => p.deploymentUrl)} data-testid="button-check-all-deployments">
            {checkAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
            Check All
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-project">
            <Plus className="h-4 w-4 mr-2" />
            Add Project
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap bg-muted/50 rounded-lg p-3" data-testid="bar-project-stats">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-semibold" data-testid="stat-total-projects">{stats.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-xs text-muted-foreground">Active</span>
          <span className="text-sm font-semibold" data-testid="stat-active-projects">{stats.active}</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-500" />
          <span className="text-xs text-muted-foreground">Deployed</span>
          <span className="text-sm font-semibold" data-testid="stat-deployed-projects">{stats.deployed}</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500" />
          <span className="text-xs text-muted-foreground">Healthy</span>
          <span className="text-sm font-semibold" data-testid="stat-healthy-projects">{stats.healthy}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Code2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1" data-testid="text-no-projects">
            {projects?.length === 0 ? "No projects yet" : "No matching projects"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {projects?.length === 0
              ? "Add projects manually or sync from your Replit account."
              : "Try a different search or filter."}
          </p>
          {projects?.length === 0 && (
            <div className="flex items-center gap-2 justify-center">
              <Button variant="outline" onClick={() => setSyncDialogOpen(true)} data-testid="button-empty-sync">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync from Replit
              </Button>
              <Button onClick={() => setAddOpen(true)} data-testid="button-empty-add">
                <Plus className="h-4 w-4 mr-2" />
                Add Manually
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent data-testid="dialog-sync-replit">
          <DialogHeader>
            <DialogTitle>Sync from Replit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your Replit username to sync all your projects. You'll also need to set your Replit session cookie
              (<code className="text-xs bg-muted px-1 py-0.5 rounded">REPLIT_SID</code>) in your environment secrets.
            </p>
            <div>
              <Label>Replit Username</Label>
              <Input
                value={syncUsername}
                onChange={(e) => setSyncUsername(e.target.value)}
                placeholder="your-replit-username"
                data-testid="input-sync-username"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)} data-testid="button-cancel-sync">Cancel</Button>
            <Button
              onClick={() => syncMutation.mutate(syncUsername)}
              disabled={!syncUsername || syncMutation.isPending}
              data-testid="button-submit-sync"
            >
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Start Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
