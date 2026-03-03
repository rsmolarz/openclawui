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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Code2, RefreshCw, Plus, ExternalLink, Pencil, Trash2,
  Globe, Lock, Search, Activity, CheckCircle2, XCircle,
  Clock, AlertTriangle, Loader2, Upload, Brain, Zap,
  TrendingUp, Target, BarChart3, ListTodo, Mic, Sparkles,
  Check, X, MessageSquare, FileText, ClipboardList, ChevronDown, ChevronRight,
} from "lucide-react";
import type { ReplitProject, OmiTodo, OmiSop } from "@shared/schema";

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

function ScoreBadge({ score, label, icon: Icon }: { score: number; label: string; icon: typeof TrendingUp }) {
  const color = score >= 7 ? "text-green-600 dark:text-green-400 bg-green-500/10" : score >= 4 ? "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10" : "text-red-500 bg-red-500/10";
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      <span className="font-bold">{score}</span>
    </div>
  );
}

function TimePriorityTab() {
  const { toast } = useToast();

  const { data: evaluation, isLoading: evalLoading } = useQuery<any>({
    queryKey: ["/api/replit-projects/evaluation"],
  });

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/replit-projects/evaluate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects/evaluation"] });
      toast({ title: "Evaluation complete", description: "Projects have been analyzed and ranked" });
    },
    onError: (err: any) => {
      toast({ title: "Evaluation failed", description: err.message, variant: "destructive" });
    },
  });

  const scores = evaluation?.projectScores || [];
  const recs = evaluation?.recommendations;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-time-priority-title">
            <Brain className="h-5 w-5 text-purple-500" />
            AI Project Prioritization
          </h2>
          <p className="text-sm text-muted-foreground">
            OpenClaw evaluates your projects on revenue potential, brand impact, and trading edge
          </p>
        </div>
        <div className="flex items-center gap-2">
          {evaluation?.evaluatedAt && (
            <span className="text-xs text-muted-foreground">Last evaluated: {formatTimestamp(evaluation.evaluatedAt)}</span>
          )}
          <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending} data-testid="button-evaluate-projects">
            {evaluateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {evaluateMutation.isPending ? "Evaluating..." : "Evaluate Projects"}
          </Button>
        </div>
      </div>

      {evaluateMutation.isPending && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-purple-500" />
            <p className="text-sm font-medium">AI is analyzing your projects...</p>
            <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
          </CardContent>
        </Card>
      )}

      {recs && !evaluateMutation.isPending && (
        <Card className="border-purple-500/20" data-testid="card-strategy">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              Strategic Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm" data-testid="text-strategy">{recs.overallStrategy}</p>
            {recs.topPriority && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-purple-500/30 text-purple-600 dark:text-purple-400">
                  Top Priority: {recs.topPriority}
                </Badge>
              </div>
            )}
            {recs.timeAllocation && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Time Allocation</p>
                <p className="text-sm" data-testid="text-time-allocation">{recs.timeAllocation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {scores.length > 0 && !evaluateMutation.isPending && (
        <div className="space-y-3">
          {scores.map((s: any, i: number) => (
            <Card key={s.slug || i} className={i === 0 ? "border-yellow-500/30 bg-yellow-500/5" : ""} data-testid={`card-score-${s.slug}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                      <h3 className="font-semibold truncate">{s.title}</h3>
                      {s.composite && (
                        <Badge variant="outline" className="shrink-0">
                          {typeof s.composite === 'number' ? s.composite.toFixed(1) : s.composite}/10
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <ScoreBadge score={s.revenue?.score || 0} label="Revenue" icon={TrendingUp} />
                      <ScoreBadge score={s.brand?.score || 0} label="Brand" icon={Target} />
                      <ScoreBadge score={s.trading?.score || 0} label="Trading" icon={BarChart3} />
                      {s.timeEstimate && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {s.timeEstimate}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground mb-2">
                      {s.revenue?.reason && <p><span className="font-medium text-foreground">Revenue:</span> {s.revenue.reason}</p>}
                      {s.brand?.reason && <p><span className="font-medium text-foreground">Brand:</span> {s.brand.reason}</p>}
                      {s.trading?.reason && <p><span className="font-medium text-foreground">Trading:</span> {s.trading.reason}</p>}
                    </div>
                    {s.nextActions && s.nextActions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">Next Actions:</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {s.nextActions.map((a: string, j: number) => (
                            <li key={j} className="flex items-start gap-1.5">
                              <Zap className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!evaluation && !evaluateMutation.isPending && !evalLoading && (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">No evaluation yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click "Evaluate Projects" to let AI analyze and prioritize your projects
          </p>
        </div>
      )}

      {evalLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OmiInsightsTab() {
  const { toast } = useToast();

  const { data: omiStatus } = useQuery<any>({ queryKey: ["/api/omi/status"] });
  const { data: memories, isLoading: memoriesLoading } = useQuery<any[]>({
    queryKey: ["/api/omi/memories"],
    enabled: omiStatus?.connected === true,
  });
  const { data: todos, isLoading: todosLoading } = useQuery<OmiTodo[]>({
    queryKey: ["/api/omi/todos"],
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/omi/analyze");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/omi/memories"] });
      toast({ title: "Analysis complete", description: `${data.todos?.length || 0} todos extracted` });
    },
    onError: (err: any) => {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/omi/todos/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] });
    },
  });

  const { data: sops, isLoading: sopsLoading } = useQuery<any[]>({
    queryKey: ["/api/omi/sops"],
  });

  const generateSopsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/omi/sops/generate");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] });
      toast({ title: "SOPs Generated", description: `${data.generated} procedures created from ${data.memoriesAnalyzed} memories` });
    },
    onError: (err: any) => {
      toast({ title: "SOP generation failed", description: err.message, variant: "destructive" });
    },
  });

  const updateSopMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string }) => {
      await apiRequest("PATCH", `/api/omi/sops/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] });
    },
  });

  const deleteSopMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/omi/sops/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] });
      toast({ title: "SOP deleted" });
    },
  });

  const [expandedSop, setExpandedSop] = useState<string | null>(null);

  const pendingTodos = (todos || []).filter(t => t.status === "pending");
  const completedTodos = (todos || []).filter(t => t.status === "done");

  if (!omiStatus?.configured) {
    return (
      <div className="text-center py-16">
        <Mic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-1">Omi Not Connected</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Connect your Omi AI wearable to analyze conversations, extract todos, and get efficiency recommendations.
        </p>
        <div className="bg-muted/50 rounded-lg p-4 max-w-sm mx-auto text-left space-y-2">
          <p className="text-xs font-medium">Setup Instructions:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the Omi app on your phone</li>
            <li>Go to Settings &rarr; Developer &rarr; Create Key</li>
            <li>Copy your API key (starts with <code className="bg-muted px-1 rounded">omi_dev_</code>)</li>
            <li>Add it as <code className="bg-muted px-1 rounded">OMI_API_KEY</code> in Replit Secrets</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-omi-title">
            <Mic className="h-5 w-5 text-blue-500" />
            Omi Insights
          </h2>
          <p className="text-sm text-muted-foreground">
            Conversations, todos, and efficiency recommendations from your Omi wearable
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={omiStatus?.connected ? "default" : "destructive"} className="text-xs" data-testid="badge-omi-status">
            {omiStatus?.connected ? "Connected" : "Disconnected"}
          </Badge>
          <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending || !omiStatus?.connected} data-testid="button-analyze-omi">
            {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {analyzeMutation.isPending ? "Analyzing..." : "Analyze Recent"}
          </Button>
        </div>
      </div>

      {analyzeMutation.isPending && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-500" />
            <p className="text-sm font-medium">AI is analyzing your conversations...</p>
            <p className="text-xs text-muted-foreground mt-1">Extracting todos and generating recommendations</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Todos ({pendingTodos.length} pending)
          </h3>
          {todosLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : pendingTodos.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No pending todos. Click "Analyze Recent" to extract tasks from your conversations.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pendingTodos.map(todo => (
                <Card key={todo.id} data-testid={`card-todo-${todo.id}`}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <div className="flex gap-1 shrink-0 mt-0.5">
                      <Button size="icon" variant="ghost" className="text-green-500" onClick={() => updateTodoMutation.mutate({ id: todo.id, status: "done" })} data-testid={`button-done-${todo.id}`}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={() => updateTodoMutation.mutate({ id: todo.id, status: "dismissed" })} data-testid={`button-dismiss-${todo.id}`}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{todo.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[10px] ${todo.priority === "high" ? "border-red-500/30 text-red-500" : todo.priority === "low" ? "border-gray-500/30" : "border-yellow-500/30 text-yellow-600"}`}>
                          {todo.priority}
                        </Badge>
                        {todo.sourceTitle && (
                          <span className="text-[10px] text-muted-foreground truncate">{todo.sourceTitle}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {completedTodos.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                {completedTodos.length} completed
              </summary>
              <div className="space-y-1 mt-2">
                {completedTodos.slice(0, 10).map(todo => (
                  <div key={todo.id} className="flex items-center gap-2 text-xs text-muted-foreground line-through py-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    {todo.content}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Recent Conversations
          </h3>
          {memoriesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !memories || memories.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {omiStatus?.connected ? "No recent conversations found." : "Connect Omi to see conversations."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {memories.slice(0, 20).map((mem: any, i: number) => (
                <Card key={mem.id || i} data-testid={`card-memory-${i}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {mem.structured?.title || mem.structured?.overview || `Conversation ${i + 1}`}
                        </p>
                        {mem.structured?.overview && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mem.structured.overview}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {mem.created_at ? formatTimestamp(mem.created_at) : ""}
                      </span>
                    </div>
                    {mem.structured?.action_items && mem.structured.action_items.length > 0 && (
                      <div className="mt-2 flex items-center gap-1">
                        <ListTodo className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{mem.structured.action_items.length} action items</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Standard Operating Procedures ({sops?.length || 0})
          </h3>
          <Button
            size="sm"
            onClick={() => generateSopsMutation.mutate()}
            disabled={generateSopsMutation.isPending || !omiStatus?.connected}
            data-testid="button-generate-sops"
          >
            {generateSopsMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {generateSopsMutation.isPending ? "Generating..." : "Generate SOPs"}
          </Button>
        </div>

        {generateSopsMutation.isPending && (
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-purple-500" />
              <p className="text-sm font-medium">AI is analyzing your conversations for recurring processes...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take 30-60 seconds</p>
            </CardContent>
          </Card>
        )}

        {sopsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : !sops || sops.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No SOPs yet. Click "Generate SOPs" to create procedures from your Omi conversations.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sops.map((sop: any) => (
              <Card key={sop.id} data-testid={`card-sop-${sop.id}`} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    className="w-full p-4 text-left flex items-start gap-3 hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedSop(expandedSop === sop.id ? null : sop.id)}
                    data-testid={`button-expand-sop-${sop.id}`}
                  >
                    <div className="mt-0.5">
                      {expandedSop === sop.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{sop.title}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {sop.category}
                        </Badge>
                        <Badge
                          variant={sop.status === "active" ? "default" : sop.status === "archived" ? "secondary" : "outline"}
                          className="text-[10px] shrink-0"
                        >
                          {sop.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{sop.overview}</p>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {sop.status === "draft" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-500"
                          onClick={() => updateSopMutation.mutate({ id: sop.id, status: "active" })}
                          data-testid={`button-activate-sop-${sop.id}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {sop.status === "active" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-yellow-500"
                          onClick={() => updateSopMutation.mutate({ id: sop.id, status: "archived" })}
                          data-testid={`button-archive-sop-${sop.id}`}
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteSopMutation.mutate(sop.id)}
                        data-testid={`button-delete-sop-${sop.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </button>

                  {expandedSop === sop.id && (
                    <div className="px-4 pb-4 pt-0 border-t bg-muted/30 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 mt-3">Steps</p>
                        <ol className="text-sm space-y-1 list-decimal list-inside">
                          {(sop.steps || []).map((step: string, i: number) => (
                            <li key={i} className="text-sm">{step.replace(/^Step \d+:\s*/i, "")}</li>
                          ))}
                        </ol>
                      </div>

                      {sop.triggers && sop.triggers.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Triggers</p>
                          <div className="flex flex-wrap gap-1">
                            {sop.triggers.map((t: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {sop.frequency && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {sop.frequency}
                          </span>
                        )}
                        {sop.tools && sop.tools.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Code2 className="h-3 w-3" /> {sop.tools.join(", ")}
                          </span>
                        )}
                      </div>

                      {sop.tips && sop.tips.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Tips</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {sop.tips.map((tip: string, i: number) => (
                              <li key={i} className="flex items-start gap-1">
                                <Sparkles className="h-3 w-3 shrink-0 mt-0.5" /> {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReplitProjects() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncUsername, setSyncUsername] = useState("");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState("");

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
      const msg = data.note || `${data.total} projects found (${data.created} new, ${data.updated} updated)`;
      toast({ title: "Sync complete", description: msg });
      setSyncDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (jsonStr: string) => {
      const projects = JSON.parse(jsonStr);
      const res = await apiRequest("POST", "/api/replit-projects/bulk-import", { projects: Array.isArray(projects) ? projects : [projects] });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/replit-projects"] });
      toast({ title: "Import complete", description: `${data.created} projects imported, ${data.skipped} skipped` });
      setSyncDialogOpen(false);
      setBulkJson("");
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
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
            <p className="text-sm text-muted-foreground">Monitor, prioritize, and manage all your projects</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList data-testid="tabs-projects-main">
          <TabsTrigger value="projects" data-testid="tab-projects">
            <Code2 className="h-4 w-4 mr-1.5" /> Projects ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="priority" data-testid="tab-priority">
            <Brain className="h-4 w-4 mr-1.5" /> Time & Priority
          </TabsTrigger>
          <TabsTrigger value="omi" data-testid="tab-omi">
            <Mic className="h-4 w-4 mr-1.5" /> Omi Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap bg-muted/50 rounded-lg p-3 flex-1" data-testid="bar-project-stats">
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSyncDialogOpen(true)} data-testid="button-sync-replit">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" size="sm" onClick={() => checkAllMutation.mutate()} disabled={checkAllMutation.isPending || !projects?.some((p) => p.deploymentUrl)} data-testid="button-check-all-deployments">
                {checkAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                Check All
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-project">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-projects" />
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
                <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /></CardHeader><CardContent><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-6 w-24" /></CardContent></Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Code2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1" data-testid="text-no-projects">
                {projects?.length === 0 ? "No projects yet" : "No matching projects"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {projects?.length === 0 ? "Add projects manually or import from your Replit account." : "Try a different search or filter."}
              </p>
              {projects?.length === 0 && (
                <div className="flex items-center gap-2 justify-center">
                  <Button variant="outline" onClick={() => setSyncDialogOpen(true)} data-testid="button-empty-sync">
                    <Upload className="h-4 w-4 mr-2" /> Import Projects
                  </Button>
                  <Button onClick={() => setAddOpen(true)} data-testid="button-empty-add">
                    <Plus className="h-4 w-4 mr-2" /> Add Manually
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => <ProjectCard key={project.id} project={project} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="priority" className="mt-6">
          <TimePriorityTab />
        </TabsContent>

        <TabsContent value="omi" className="mt-6">
          <OmiInsightsTab />
        </TabsContent>
      </Tabs>

      <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-sync-replit">
          <DialogHeader>
            <DialogTitle>Import Projects</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="sync">
            <TabsList className="w-full">
              <TabsTrigger value="sync" className="flex-1">Profile Sync</TabsTrigger>
              <TabsTrigger value="bulk" className="flex-1">Bulk Import</TabsTrigger>
            </TabsList>
            <TabsContent value="sync" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Sync public projects from your Replit profile via GraphQL API. Requires <code className="text-xs bg-muted px-1 py-0.5 rounded">REPLIT_SID</code> in Secrets.
              </p>
              <div>
                <Label>Replit Username</Label>
                <Input value={syncUsername} onChange={(e) => setSyncUsername(e.target.value)} placeholder="rsmolarz" data-testid="input-sync-username" />
                <p className="text-xs text-muted-foreground mt-1">Enter your username only (e.g. <strong>rsmolarz</strong>), not a URL</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSyncDialogOpen(false)} data-testid="button-cancel-sync">Cancel</Button>
                <Button onClick={() => syncMutation.mutate(syncUsername)} disabled={!syncUsername || syncMutation.isPending} data-testid="button-submit-sync">
                  {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sync Profile
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="bulk" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Paste a JSON array of projects. Each project needs at least a <code className="text-xs bg-muted px-1 py-0.5 rounded">title</code> or <code className="text-xs bg-muted px-1 py-0.5 rounded">slug</code>.
              </p>
              <Textarea value={bulkJson} onChange={(e) => setBulkJson(e.target.value)} placeholder={`[\n  { "title": "My App", "slug": "my-app", "language": "TypeScript" }\n]`} className="font-mono text-xs min-h-[160px]" data-testid="input-bulk-json" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => bulkImportMutation.mutate(bulkJson)} disabled={!bulkJson.trim() || bulkImportMutation.isPending} data-testid="button-submit-bulk">
                  {bulkImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
