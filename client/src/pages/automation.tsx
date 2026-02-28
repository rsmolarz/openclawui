import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AutomationJob, AutomationRun } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, Play, Trash2, Plus, History, Pencil,
  CheckCircle2, XCircle, Loader2, CalendarClock, Timer
} from "lucide-react";

const TEMPLATES = [
  {
    id: "health-check",
    name: "Daily Health Check",
    schedule: "0 8 * * *",
    command: "echo '=== Health Check ===' && uptime && echo '---MEM---' && free -m && echo '---DISK---' && df -h / && echo '---PROCS---' && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp | grep -E '18789|8080' && echo '=== Done ==='",
    description: "Run system health check every day at 8am",
  },
  {
    id: "weekly-backup",
    name: "Weekly Backup",
    schedule: "0 2 * * 0",
    command: "tar -czf /root/backup-$(date +%Y%m%d).tar.gz /root/.openclaw/ 2>&1 && ls -lh /root/backup-*.tar.gz | tail -5 && echo 'Backup complete'",
    description: "Backup OpenClaw config every Sunday at 2am",
  },
  {
    id: "disk-cleanup",
    name: "Disk Cleanup",
    schedule: "0 3 * * 1",
    command: "echo '=== Before ===' && df -h / && apt-get autoremove -y 2>&1 | tail -3 && apt-get clean 2>&1 && find /tmp -type f -mtime +7 -delete 2>/dev/null && find /root/backup-*.tar.gz -mtime +30 -delete 2>/dev/null; echo '=== After ===' && df -h /",
    description: "Clean up disk space every Monday at 3am",
  },
  {
    id: "gateway-restart",
    name: "Gateway Watchdog",
    schedule: "*/15 * * * *",
    command: "if ! pgrep -f 'openclaw' > /dev/null; then echo 'Gateway down, restarting...'; nohup openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw.log 2>&1 & sleep 5; echo 'Restarted'; else echo 'Gateway running'; fi",
    description: "Check every 15 minutes if gateway is running, restart if not",
  },
  {
    id: "log-rotate",
    name: "Log Rotation",
    schedule: "0 0 * * *",
    command: "for f in /tmp/openclaw.log /tmp/oc.log /tmp/whatsapp-bot.log; do if [ -f \"$f\" ] && [ $(wc -c < \"$f\") -gt 10485760 ]; then mv \"$f\" \"${f}.old\" && echo \"Rotated $f\"; fi; done; echo 'Log rotation done'",
    description: "Rotate large log files daily at midnight",
  },
];

const SCHEDULE_PRESETS = [
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 8am", value: "0 8 * * *" },
  { label: "Weekly (Sunday 2am)", value: "0 2 * * 0" },
  { label: "Monthly (1st at 3am)", value: "0 3 1 * *" },
];

function describeCron(schedule: string): string {
  const presetMatch = SCHEDULE_PRESETS.find(p => p.value === schedule);
  if (presetMatch) return presetMatch.label;

  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, month, dow] = parts;

  if (min.startsWith("*/") && hour === "*") return `Every ${min.slice(2)} minutes`;
  if (min === "0" && hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  if (min === "0" && !hour.includes("*") && dom === "*" && month === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:00`;
  if (min === "0" && !hour.includes("*") && dom === "*" && month === "*" && dow !== "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly ${days[parseInt(dow)] || dow} at ${hour.padStart(2, "0")}:00`;
  }
  return schedule;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "Never";
  const date = new Date(d);
  return date.toLocaleString();
}

function JobForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<AutomationJob>;
  onSubmit: (data: { name: string; schedule: string; command: string; template: string | null; enabled: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [schedule, setSchedule] = useState(initial?.schedule || "0 * * * *");
  const [command, setCommand] = useState(initial?.command || "");
  const [template, setTemplate] = useState(initial?.template || "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [scheduleMode, setScheduleMode] = useState<"preset" | "custom">(
    SCHEDULE_PRESETS.some(p => p.value === (initial?.schedule || "0 * * * *")) ? "preset" : "custom"
  );

  function applyTemplate(templateId: string) {
    const t = TEMPLATES.find(t => t.id === templateId);
    if (t) {
      setName(t.name);
      setSchedule(t.schedule);
      setCommand(t.command);
      setTemplate(t.id);
      const match = SCHEDULE_PRESETS.find(p => p.value === t.schedule);
      setScheduleMode(match ? "preset" : "custom");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Template</Label>
        <Select value={template} onValueChange={applyTemplate}>
          <SelectTrigger data-testid="select-template">
            <SelectValue placeholder="Start from a template (optional)" />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATES.map(t => (
              <SelectItem key={t.id} value={t.id} data-testid={`template-${t.id}`}>{t.name} - {t.description}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Job Name</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Daily Health Check"
          data-testid="input-job-name"
        />
      </div>

      <div>
        <Label>Schedule</Label>
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant={scheduleMode === "preset" ? "default" : "outline"}
            size="sm"
            onClick={() => setScheduleMode("preset")}
            data-testid="button-schedule-preset"
          >
            Preset
          </Button>
          <Button
            variant={scheduleMode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setScheduleMode("custom")}
            data-testid="button-schedule-custom"
          >
            Custom Cron
          </Button>
        </div>
        {scheduleMode === "preset" ? (
          <Select value={schedule} onValueChange={setSchedule}>
            <SelectTrigger data-testid="select-schedule-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={schedule}
            onChange={e => setSchedule(e.target.value)}
            placeholder="*/5 * * * *"
            data-testid="input-schedule-cron"
          />
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {describeCron(schedule)}
        </p>
      </div>

      <div>
        <Label>Command (SSH)</Label>
        <Textarea
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="echo 'hello world'"
          className="font-mono text-sm min-h-[100px]"
          data-testid="input-job-command"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-job-enabled" />
        <Label>Enabled</Label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-job">Cancel</Button>
        <Button
          onClick={() => onSubmit({ name, schedule, command, template: template || null, enabled })}
          disabled={!name || !schedule || !command || isPending}
          data-testid="button-save-job"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial?.id ? "Update" : "Create"} Job
        </Button>
      </DialogFooter>
    </div>
  );
}

function RunHistory({ jobId }: { jobId: string }) {
  const { data: runs, isLoading } = useQuery<AutomationRun[]>({
    queryKey: ["/api/automation/jobs", jobId, "runs"],
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No runs yet</p>;
  }

  return (
    <div className="max-h-[400px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>Output</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map(run => (
            <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
              <TableCell>
                {run.status === "completed" && (
                  <Badge variant="default" className="bg-green-600" data-testid={`status-run-${run.id}`}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                  </Badge>
                )}
                {run.status === "failed" && (
                  <Badge variant="destructive" data-testid={`status-run-${run.id}`}>
                    <XCircle className="h-3 w-3 mr-1" /> Failed
                  </Badge>
                )}
                {run.status === "running" && (
                  <Badge variant="secondary" data-testid={`status-run-${run.id}`}>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running
                  </Badge>
                )}
                {!["completed", "failed", "running"].includes(run.status) && (
                  <Badge variant="outline" data-testid={`status-run-${run.id}`}>{run.status}</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
              <TableCell className="text-sm">{formatDate(run.completedAt)}</TableCell>
              <TableCell>
                <pre className="text-xs max-w-[300px] max-h-[80px] overflow-auto whitespace-pre-wrap font-mono text-muted-foreground">
                  {run.output || "-"}
                </pre>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AutomationPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editJob, setEditJob] = useState<AutomationJob | null>(null);
  const [historyJobId, setHistoryJobId] = useState<string | null>(null);

  const { data: jobs, isLoading } = useQuery<AutomationJob[]>({
    queryKey: ["/api/automation/jobs"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; schedule: string; command: string; template: string | null; enabled: boolean }) => {
      await apiRequest("POST", "/api/automation/jobs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
      setShowCreate(false);
      toast({ title: "Job created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; schedule: string; command: string; template: string | null; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/automation/jobs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
      setEditJob(null);
      toast({ title: "Job updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update job", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/automation/jobs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
      toast({ title: "Job deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete job", description: err.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/automation/jobs/${id}/run`);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs", id, "runs"] });
      toast({ title: "Job started" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to run job", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/automation/jobs/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to toggle job", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Automation</h1>
          <p className="text-muted-foreground">Schedule and manage automated tasks on your VPS</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-job">
          <Plus className="h-4 w-4 mr-2" /> New Job
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarClock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Automation Jobs</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first scheduled job to automate VPS tasks</p>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-first-job">
              <Plus className="h-4 w-4 mr-2" /> Create Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <Card key={job.id} data-testid={`card-job-${job.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base" data-testid={`text-job-name-${job.id}`}>{job.name}</CardTitle>
                    <Badge variant={job.enabled ? "default" : "secondary"} data-testid={`badge-job-status-${job.id}`}>
                      {job.enabled ? "Active" : "Paused"}
                    </Badge>
                    {job.template && (
                      <Badge variant="outline" data-testid={`badge-job-template-${job.id}`}>{job.template}</Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {describeCron(job.schedule)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" /> Last: {formatDate(job.lastRun)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> Next: {formatDate(job.nextRun)}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(enabled) => toggleMutation.mutate({ id: job.id, enabled })}
                    data-testid={`switch-toggle-${job.id}`}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-[80px] font-mono mb-3">
                  {job.command}
                </pre>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runMutation.mutate(job.id)}
                    disabled={runMutation.isPending}
                    data-testid={`button-run-${job.id}`}
                  >
                    <Play className="h-3 w-3 mr-1" /> Run Now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryJobId(job.id)}
                    data-testid={`button-history-${job.id}`}
                  >
                    <History className="h-3 w-3 mr-1" /> History
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditJob(job)}
                    data-testid={`button-edit-${job.id}`}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm("Delete this job and all its run history?")) {
                        deleteMutation.mutate(job.id);
                      }
                    }}
                    data-testid={`button-delete-${job.id}`}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Automation Job</DialogTitle>
            <DialogDescription>Schedule a recurring task to run on your VPS via SSH</DialogDescription>
          </DialogHeader>
          <JobForm
            onSubmit={data => createMutation.mutate(data)}
            onCancel={() => setShowCreate(false)}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editJob} onOpenChange={open => !open && setEditJob(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Automation Job</DialogTitle>
            <DialogDescription>Update job settings</DialogDescription>
          </DialogHeader>
          {editJob && (
            <JobForm
              initial={editJob}
              onSubmit={data => updateMutation.mutate({ id: editJob.id, ...data })}
              onCancel={() => setEditJob(null)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyJobId} onOpenChange={open => !open && setHistoryJobId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run History</DialogTitle>
            <DialogDescription>
              {historyJobId && jobs?.find(j => j.id === historyJobId)?.name}
            </DialogDescription>
          </DialogHeader>
          {historyJobId && <RunHistory jobId={historyJobId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
