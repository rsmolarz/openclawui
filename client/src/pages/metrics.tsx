import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Download,
  MessageSquare,
  Zap,
  Server,
  Shield,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { MetricsEvent } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

type TimeRange = "7d" | "30d" | "90d";

function groupByDay(events: MetricsEvent[]): Record<string, MetricsEvent[]> {
  const grouped: Record<string, MetricsEvent[]> = {};
  for (const e of events) {
    const day = new Date(e.createdAt).toISOString().slice(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(e);
  }
  return grouped;
}

function filterByRange(events: MetricsEvent[], range: TimeRange): MetricsEvent[] {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return events.filter((e) => new Date(e.createdAt) >= cutoff);
}

function generateDateLabels(range: TimeRange): string[] {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
  }
  return labels;
}

function buildMessageVolumeData(events: MetricsEvent[], range: TimeRange) {
  const filtered = filterByRange(
    events.filter((e) => e.category === "whatsapp"),
    range
  );
  const grouped = groupByDay(filtered);
  const labels = generateDateLabels(range);
  return labels.map((date) => ({
    date: date.slice(5),
    messages: grouped[date]?.length ?? 0,
  }));
}

function buildApiCallsData(events: MetricsEvent[], range: TimeRange) {
  const filtered = filterByRange(
    events.filter((e) => e.category === "api_call"),
    range
  );
  const skillMap: Record<string, number> = {};
  for (const e of filtered) {
    const skill = (e.metadata as any)?.skill || e.type || "unknown";
    skillMap[skill] = (skillMap[skill] || 0) + 1;
  }
  return Object.entries(skillMap)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildNodeUptimeData(events: MetricsEvent[], range: TimeRange) {
  const filtered = filterByRange(
    events.filter((e) => e.category === "node_uptime"),
    range
  );
  const grouped = groupByDay(filtered);
  const labels = generateDateLabels(range);
  return labels.map((date) => {
    const dayEvents = grouped[date] || [];
    const avgUptime = dayEvents.length > 0
      ? dayEvents.reduce((sum, e) => sum + (e.value ?? 0), 0) / dayEvents.length
      : 0;
    return {
      date: date.slice(5),
      uptime: Math.round(avgUptime * 100) / 100,
    };
  });
}

function buildGuardianData(events: MetricsEvent[], range: TimeRange) {
  const filtered = filterByRange(
    events.filter((e) => e.category === "guardian"),
    range
  );
  const grouped = groupByDay(filtered);
  const labels = generateDateLabels(range);
  return labels.map((date) => {
    const dayEvents = grouped[date] || [];
    const issues = dayEvents.filter((e) => e.type === "issue_detected").length;
    const resolved = dayEvents.filter((e) => e.type === "issue_resolved").length;
    return {
      date: date.slice(5),
      issues,
      resolved,
    };
  });
}

function exportToCsv(events: MetricsEvent[]) {
  const headers = ["id", "type", "category", "value", "metadata", "createdAt"];
  const rows = events.map((e) => [
    e.id,
    e.type,
    e.category,
    e.value ?? "",
    JSON.stringify(e.metadata ?? {}),
    new Date(e.createdAt).toISOString(),
  ]);
  const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `metrics-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MetricsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const { data: events = [], isLoading } = useQuery<MetricsEvent[]>({
    queryKey: ["/api/metrics"],
  });

  const { data: summary } = useQuery<{
    totalMessages: number;
    totalApiCalls: number;
    avgUptime: number;
    guardianIssues: number;
  }>({
    queryKey: ["/api/metrics/summary"],
  });

  const messageData = buildMessageVolumeData(events, timeRange);
  const apiCallsData = buildApiCallsData(events, timeRange);
  const nodeUptimeData = buildNodeUptimeData(events, timeRange);
  const guardianData = buildGuardianData(events, timeRange);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-metrics-title">
              Analytics Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Track usage patterns and system health over time
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={timeRange}
            onValueChange={(v) => setTimeRange(v as TimeRange)}
          >
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["/api/metrics"] })
            }
            data-testid="button-refresh-metrics"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => exportToCsv(events)}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Messages
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-messages">
              {summary?.totalMessages ?? events.filter((e) => e.category === "whatsapp").length}
            </div>
            <p className="text-xs text-muted-foreground">WhatsApp messages</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-api-calls">
              {summary?.totalApiCalls ?? events.filter((e) => e.category === "api_call").length}
            </div>
            <p className="text-xs text-muted-foreground">Skill invocations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Uptime</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-uptime">
              {summary?.avgUptime !== undefined
                ? `${Math.round(summary.avgUptime)}%`
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Node availability</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Guardian Issues
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-guardian-issues">
              {summary?.guardianIssues ?? events.filter((e) => e.category === "guardian").length}
            </div>
            <p className="text-xs text-muted-foreground">Detected issues</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base">WhatsApp Message Volume</CardTitle>
            <Badge variant="secondary">
              {filterByRange(events.filter((e) => e.category === "whatsapp"), timeRange).length} total
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-message-volume">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={messageData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base">API Calls by Skill</CardTitle>
            <Badge variant="secondary">
              {apiCallsData.length} skills
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-api-calls">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apiCallsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    tick={{ fontSize: 11 }}
                    width={100}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base">Node Uptime History</CardTitle>
            <Badge variant="secondary">% uptime</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-node-uptime">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={nodeUptimeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    domain={[0, 100]}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="uptime"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base">Guardian Scan Results</CardTitle>
            <Badge variant="secondary">issues vs resolved</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-guardian-results">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={guardianData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="issues"
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                    name="Issues"
                  />
                  <Bar
                    dataKey="resolved"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    name="Resolved"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {events.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-no-data">
              No metrics data yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Metrics will appear here as your OpenClaw instance processes
              messages, API calls, and system events. Data is collected
              automatically over time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
