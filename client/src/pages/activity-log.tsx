import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, ChevronLeft, ChevronRight, Filter } from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  actionType: string;
  details: string | null;
  userId: string | null;
  createdAt: string;
};

type AuditLogsResponse = {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const ACTION_TYPE_COLORS: Record<string, string> = {
  machine_change: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  api_key_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  settings_update: "bg-green-500/10 text-green-600 dark:text-green-400",
  config_change: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  instance_change: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const ACTION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "machine_change", label: "Machine Changes" },
  { value: "api_key_change", label: "API Key Changes" },
  { value: "settings_update", label: "Settings Updates" },
  { value: "config_change", label: "Config Changes" },
  { value: "instance_change", label: "Instance Changes" },
];

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLog() {
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState("all");
  const limit = 25;

  const queryUrl = `/api/audit-logs?page=${page}&limit=${limit}${actionType !== "all" ? `&actionType=${actionType}` : ""}`;

  const { data, isLoading, isError } = useQuery<AuditLogsResponse>({
    queryKey: [queryUrl],
    refetchInterval: 30000,
  });

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-activity-log-title">Activity Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={actionType} onValueChange={(v) => { setActionType(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="select-action-type-filter">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} data-testid={`option-filter-${t.value}`}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            {data ? `${data.total} total entries` : "Loading..."}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="text-center py-12 text-destructive" data-testid="text-error">
              Failed to load audit logs. Please try again.
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-logs">
              No activity logs yet. Actions will appear here as you use the dashboard.
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-3 px-2 rounded-md hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0"
                  data-testid={`row-audit-${log.id}`}
                >
                  <div className="min-w-[80px] text-xs text-muted-foreground pt-0.5" data-testid={`text-timestamp-${log.id}`}>
                    {formatTimestamp(log.createdAt)}
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs font-medium shrink-0 ${ACTION_TYPE_COLORS[log.actionType] || ""}`}
                    data-testid={`badge-type-${log.id}`}
                  >
                    {log.actionType.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" data-testid={`text-action-${log.id}`}>
                      {log.action}
                    </div>
                    {log.details && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate" data-testid={`text-details-${log.id}`}>
                        {log.details.length > 200 ? log.details.slice(0, 200) + "..." : log.details}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground" data-testid="text-page-info">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
