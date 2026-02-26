import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Sparkles,
  ScanSearch,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Clock,
  Zap,
  Bug,
  Wifi,
  HardDrive,
  Server,
  MessageSquare,
  Unplug,
  ShieldAlert,
  Phone,
} from "lucide-react";
import type { GuardianLog, FeatureProposal } from "@shared/schema";

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return "destructive";
    case "warning": return "secondary";
    case "info": return "outline";
    default: return "outline";
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case "critical": return <XCircle className="h-4 w-4 text-red-500" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "info": return <Info className="h-4 w-4 text-blue-500" />;
    default: return <Info className="h-4 w-4" />;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "connectivity": return <Wifi className="h-4 w-4" />;
    case "service": return <Server className="h-4 w-4" />;
    case "resource": return <HardDrive className="h-4 w-4" />;
    case "error": return <Bug className="h-4 w-4" />;
    default: return <Zap className="h-4 w-4" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "detected": return <Badge variant="secondary" data-testid="badge-status-detected"><AlertTriangle className="h-3 w-3 mr-1" />Detected</Badge>;
    case "fixing": return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-status-fixing"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Fixing</Badge>;
    case "fixed": return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-status-fixed"><CheckCircle2 className="h-3 w-3 mr-1" />Fixed</Badge>;
    case "failed": return <Badge variant="destructive" data-testid="badge-status-failed"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "critical": return <Badge variant="destructive">{priority}</Badge>;
    case "high": return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">{priority}</Badge>;
    case "medium": return <Badge variant="secondary">{priority}</Badge>;
    case "low": return <Badge variant="outline">{priority}</Badge>;
    default: return <Badge variant="outline">{priority}</Badge>;
  }
}

function proposalStatusBadge(status: string) {
  switch (status) {
    case "proposed": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
    case "approved": return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    case "implementing": return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Implementing</Badge>;
    case "completed": return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

interface WhatsAppHealth {
  homeBotState: string;
  homeBotPhone: string | null;
  homeBotHostname: string | null;
  homeBotError: string | null;
  homeBotLastReportAge: number | null;
  homeBotOnline: boolean;
  vpsBotActive: boolean;
  hasConflict: boolean;
}

function WhatsAppHealthPanel() {
  const { toast } = useToast();

  const { data: health, isLoading } = useQuery<WhatsAppHealth>({
    queryKey: ["/api/admin/guardian/whatsapp-health"],
    refetchInterval: 15000,
  });

  const fixMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/guardian/fix-whatsapp"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/whatsapp-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/logs"] });
      toast({ title: "VPS bot stopped", description: "The conflicting VPS WhatsApp bot has been stopped and disabled." });
    },
    onError: (err: Error) => {
      toast({ title: "Fix failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !health) {
    return (
      <Card data-testid="card-whatsapp-health">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const stateColor = health.homeBotOnline
    ? "text-green-600 dark:text-green-400"
    : health.homeBotState === "connecting" || health.homeBotState === "reconnecting"
    ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  const stateBg = health.homeBotOnline
    ? "bg-green-100 dark:bg-green-900"
    : health.homeBotState === "connecting" || health.homeBotState === "reconnecting"
    ? "bg-amber-100 dark:bg-amber-900"
    : "bg-red-100 dark:bg-red-900";

  return (
    <Card data-testid="card-whatsapp-health">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          WhatsApp Connection Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Home Bot</p>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${health.homeBotOnline ? "bg-green-500" : "bg-red-500"} ${health.homeBotOnline ? "animate-pulse" : ""}`} />
              <span className={`text-sm font-medium ${stateColor}`} data-testid="text-homebot-state">
                {health.homeBotState === "connected" ? "Connected" : health.homeBotState || "Unknown"}
              </span>
            </div>
            {health.homeBotPhone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span data-testid="text-homebot-phone">+{health.homeBotPhone}</span>
              </div>
            )}
            {health.homeBotHostname && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Server className="h-3 w-3" />
                <span data-testid="text-homebot-hostname">{health.homeBotHostname}</span>
              </div>
            )}
            {health.homeBotLastReportAge !== null && (
              <p className="text-xs text-muted-foreground" data-testid="text-homebot-age">
                Last report: {health.homeBotLastReportAge}s ago
              </p>
            )}
            {health.homeBotError && (
              <p className="text-xs text-red-500" data-testid="text-homebot-error">{health.homeBotError}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">VPS Bot (Conflict Source)</p>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${health.vpsBotActive ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
              <span className={`text-sm font-medium ${health.vpsBotActive ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`} data-testid="text-vpsbot-state">
                {health.vpsBotActive ? "Running (BAD)" : "Stopped (Good)"}
              </span>
            </div>
            {health.vpsBotActive && (
              <p className="text-xs text-red-500">
                This VPS service is fighting with the home-bot for the same WhatsApp session.
              </p>
            )}
          </div>
        </div>

        {health.hasConflict && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900">
            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200" data-testid="text-conflict-warning">
                Session Conflict Detected
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                The VPS bot and home-bot are both trying to connect to WhatsApp. This causes repeated disconnections.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => fixMutation.mutate()}
              disabled={fixMutation.isPending}
              data-testid="button-fix-whatsapp-conflict"
            >
              {fixMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Wrench className="h-3 w-3 mr-1" />
              )}
              Stop VPS Bot
            </Button>
          </div>
        )}

        {!health.hasConflict && health.vpsBotActive && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                VPS Bot Still Running
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                The VPS bot is active and may conflict with the home-bot. Consider stopping it.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fixMutation.mutate()}
              disabled={fixMutation.isPending}
              data-testid="button-stop-vps-bot"
            >
              {fixMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Unplug className="h-3 w-3 mr-1" />
              )}
              Stop VPS Bot
            </Button>
          </div>
        )}

        {!health.vpsBotActive && health.homeBotOnline && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-800 dark:text-green-200" data-testid="text-whatsapp-healthy">
              WhatsApp is healthy. Home-bot is connected and no conflicting services are running.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CodeGuardianTab() {
  const { toast } = useToast();

  const { data: logs = [], isLoading: logsLoading } = useQuery<GuardianLog[]>({
    queryKey: ["/api/admin/guardian/logs"],
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/guardian/scan"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/whatsapp-health"] });
      toast({ title: "Scan complete", description: "System scan finished. Check the log for results." });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const fixMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/guardian/fix/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guardian/whatsapp-health"] });
      toast({ title: "Fix attempted", description: "Check the log for results." });
    },
    onError: (err: Error) => {
      toast({ title: "Fix failed", description: err.message, variant: "destructive" });
    },
  });

  const criticalCount = logs.filter(l => l.severity === "critical" && l.status === "detected").length;
  const warningCount = logs.filter(l => l.severity === "warning" && l.status === "detected").length;
  const fixedCount = logs.filter(l => l.status === "fixed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-guardian-title">
            <Shield className="h-5 w-5" />
            Code Guardian
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitors system health, detects errors and disconnects, and attempts automated fixes.
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          data-testid="button-scan"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4 mr-2" />
          )}
          {scanMutation.isPending ? "Scanning..." : "Run Scan"}
        </Button>
      </div>

      <WhatsAppHealthPanel />

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-critical-count">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-critical-count">{criticalCount}</p>
                <p className="text-xs text-muted-foreground">Critical Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-warning-count">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-warning-count">{warningCount}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-fixed-count">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-fixed-count">{fixedCount}</p>
                <p className="text-xs text-muted-foreground">Fixed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardian Log</CardTitle>
          <CardDescription>Errors, disconnects, and fixes detected by the Code Guardian</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-guardian-logs" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-logs">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No guardian logs yet. Run a scan to check system health.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  data-testid={`card-guardian-log-${log.id}`}
                >
                  <div className="flex items-center gap-2 mt-0.5">
                    {typeIcon(log.type)}
                    {severityIcon(log.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-log-message-${log.id}`}>{log.message}</span>
                      <Badge variant={severityColor(log.severity)} className="text-xs">{log.severity}</Badge>
                      {statusBadge(log.status)}
                    </div>
                    {log.details && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono whitespace-pre-wrap" data-testid={`text-log-details-${log.id}`}>
                        {log.details.substring(0, 300)}{log.details.length > 300 ? "..." : ""}
                      </p>
                    )}
                    {log.resolution && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1" data-testid={`text-log-resolution-${log.id}`}>
                        Resolution: {log.resolution}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {log.source && <span className="mr-2">{log.source}</span>}
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {log.status === "detected" && (log.severity === "critical" || log.severity === "warning") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fixMutation.mutate(log.id)}
                      disabled={fixMutation.isPending}
                      data-testid={`button-fix-${log.id}`}
                    >
                      <Wrench className="h-3 w-3 mr-1" />
                      Fix
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureProposalsTab() {
  const { toast } = useToast();

  const { data: proposals = [], isLoading } = useQuery<FeatureProposal[]>({
    queryKey: ["/api/admin/features"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/features/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/features"] });
      toast({ title: "Proposals generated", description: "New feature proposals have been created by the AI agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/features/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/features"] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/features/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/features"] });
      toast({ title: "Proposal deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const pendingCount = proposals.filter(p => p.status === "proposed").length;
  const approvedCount = proposals.filter(p => p.status === "approved" || p.status === "implementing" || p.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-features-title">
            <Sparkles className="h-5 w-5" />
            Feature Proposals
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated upgrade suggestions for your OpenClaw platform. Review, approve, or reject them.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {generateMutation.isPending ? "Generating..." : "Generate Proposals"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card data-testid="card-pending-features">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-approved-features">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-approved-count">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-features" />
        </div>
      ) : proposals.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground" data-testid="text-no-proposals">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No feature proposals yet. Click "Generate Proposals" to get AI-powered upgrade suggestions.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {proposals.map((proposal) => (
            <Card key={proposal.id} data-testid={`card-proposal-${proposal.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-base flex items-center gap-2" data-testid={`text-proposal-title-${proposal.id}`}>
                      {proposal.title}
                      {priorityBadge(proposal.priority)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {proposalStatusBadge(proposal.status)}
                      <Badge variant="outline" className="text-xs">{proposal.category}</Badge>
                      <span className="text-xs text-muted-foreground">by {proposal.proposedBy}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {proposal.status === "proposed" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                          onClick={() => updateMutation.mutate({ id: proposal.id, status: "approved" })}
                          disabled={updateMutation.isPending}
                          data-testid={`button-approve-${proposal.id}`}
                        >
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => updateMutation.mutate({ id: proposal.id, status: "rejected" })}
                          disabled={updateMutation.isPending}
                          data-testid={`button-reject-${proposal.id}`}
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(proposal.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-proposal-${proposal.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm" data-testid={`text-proposal-desc-${proposal.id}`}>{proposal.description}</p>
                {proposal.rationale && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Rationale</p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-proposal-rationale-${proposal.id}`}>{proposal.rationale}</p>
                  </div>
                )}
                {proposal.implementationPlan && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Implementation Plan</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-proposal-plan-${proposal.id}`}>{proposal.implementationPlan}</p>
                  </div>
                )}
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Created {new Date(proposal.createdAt).toLocaleString()}
                  {proposal.reviewedAt && ` | Reviewed ${new Date(proposal.reviewedAt).toLocaleString()}`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("guardian");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin</h1>
        <p className="text-muted-foreground mt-1">System agents, health monitoring, and feature management</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-admin">
          <TabsTrigger value="guardian" data-testid="tab-guardian">
            <Shield className="h-4 w-4 mr-2" />
            Code Guardian
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">
            <Sparkles className="h-4 w-4 mr-2" />
            Feature Proposals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guardian" className="mt-6">
          <CodeGuardianTab />
        </TabsContent>

        <TabsContent value="features" className="mt-6">
          <FeatureProposalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
