import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/hooks/use-instance";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Activity,
  RefreshCw,
  Clock,
  Network,
  ScrollText,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface SystemStats {
  success: boolean;
  timestamp: number;
  cpu: { usage: number };
  memory: { total: number; used: number; free: number; percent: number };
  disk: { total: string; used: string; available: string; percent: number };
  load: number[];
  uptime: string;
  network: { rxBytes: number; txBytes: number };
  error?: string;
}

interface HistoryPoint {
  time: string;
  cpu: number;
  memory: number;
  disk: number;
  load: number;
}

const MAX_HISTORY = 60;

export default function SystemMonitor() {
  const { selectedInstanceId: instanceId } = useInstance();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const prevNetRef = useRef<{ rx: number; tx: number } | null>(null);
  const [netSpeed, setNetSpeed] = useState({ rxRate: 0, txRate: 0 });

  const statsQuery = useQuery<SystemStats>({
    queryKey: ["/api/system-stats", instanceId],
    refetchInterval: autoRefresh ? 5000 : false,
    enabled: !!instanceId,
  });

  const logsQuery = useQuery<{ success: boolean; logs: string; error?: string }>({
    queryKey: ["/api/gateway-logs", instanceId],
    refetchInterval: autoRefresh ? 10000 : false,
    enabled: !!instanceId,
  });

  useEffect(() => {
    if (statsQuery.data?.success) {
      const d = statsQuery.data;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeStr,
            cpu: d.cpu.usage,
            memory: d.memory.percent,
            disk: d.disk.percent,
            load: d.load[0],
          },
        ];
        return next.slice(-MAX_HISTORY);
      });

      if (prevNetRef.current) {
        const rxDiff = d.network.rxBytes - prevNetRef.current.rx;
        const txDiff = d.network.txBytes - prevNetRef.current.tx;
        setNetSpeed({
          rxRate: Math.max(0, Math.round(rxDiff / 5 / 1024)),
          txRate: Math.max(0, Math.round(txDiff / 5 / 1024)),
        });
      }
      prevNetRef.current = { rx: d.network.rxBytes, tx: d.network.txBytes };
    }
  }, [statsQuery.data]);

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function getUsageColor(percent: number): string {
    if (percent < 50) return "text-green-600 dark:text-green-400";
    if (percent < 80) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  function getProgressColor(percent: number): string {
    if (percent < 50) return "[&>div]:bg-green-500";
    if (percent < 80) return "[&>div]:bg-yellow-500";
    return "[&>div]:bg-red-500";
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">System Monitor</h1>
          <p className="text-sm text-muted-foreground">Real-time VPS system metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            data-testid="button-toggle-auto-refresh"
          >
            <Activity className="h-4 w-4 mr-1" />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => statsQuery.refetch()}
            disabled={statsQuery.isFetching}
            data-testid="button-refresh-stats"
          >
            <RefreshCw className={`h-4 w-4 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {stats && !stats.success && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive" data-testid="text-error">{stats.error || "Failed to fetch system stats"}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getUsageColor(stats?.cpu.usage ?? 0)}`} data-testid="text-cpu-usage">
                  {stats?.cpu.usage ?? 0}%
                </div>
                <Progress value={stats?.cpu.usage ?? 0} className={`mt-2 ${getProgressColor(stats?.cpu.usage ?? 0)}`} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getUsageColor(stats?.memory.percent ?? 0)}`} data-testid="text-memory-usage">
                  {stats?.memory.percent ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.memory.used ?? 0}MB / {stats?.memory.total ?? 0}MB
                </p>
                <Progress value={stats?.memory.percent ?? 0} className={`mt-2 ${getProgressColor(stats?.memory.percent ?? 0)}`} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disk</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getUsageColor(stats?.disk.percent ?? 0)}`} data-testid="text-disk-usage">
                  {stats?.disk.percent ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.disk.used ?? "0"} / {stats?.disk.total ?? "0"}
                </p>
                <Progress value={stats?.disk.percent ?? 0} className={`mt-2 ${getProgressColor(stats?.disk.percent ?? 0)}`} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-sm space-y-1" data-testid="text-network-stats">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">RX</span>
                    <span className="font-mono text-xs">{formatBytes(stats?.network.rxBytes ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">TX</span>
                    <span className="font-mono text-xs">{formatBytes(stats?.network.txBytes ?? 0)}</span>
                  </div>
                  {netSpeed.rxRate > 0 && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t">
                      <span className="text-muted-foreground text-xs">Speed</span>
                      <span className="font-mono text-xs">{netSpeed.rxRate} KB/s in / {netSpeed.txRate} KB/s out</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p className="text-sm font-medium truncate" data-testid="text-uptime">{stats?.uptime || "..."}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Load Average</p>
              <p className="text-sm font-medium font-mono" data-testid="text-load-avg">
                {stats?.load ? stats.load.map((l) => l.toFixed(2)).join(" / ") : "..."}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Polling</p>
              <Badge variant={autoRefresh ? "default" : "secondary"} data-testid="badge-polling-status">
                {autoRefresh ? "Every 5s" : "Paused"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="charts" className="w-full">
        <TabsList>
          <TabsTrigger value="charts" data-testid="tab-charts">
            <Activity className="h-4 w-4 mr-1" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <ScrollText className="h-4 w-4 mr-1" />
            Gateway Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length < 2 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground" data-testid="text-chart-waiting">
                    Collecting data points...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="cpu" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} name="CPU %" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Memory Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length < 2 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                    Collecting data points...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fill="rgba(139, 92, 246, 0.2)" strokeWidth={2} name="Memory %" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Load Average Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length < 2 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                    Collecting data points...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Line type="monotone" dataKey="load" stroke="#f59e0b" strokeWidth={2} dot={false} name="Load (1m)" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gateway Log Stream</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logsQuery.refetch()}
                disabled={logsQuery.isFetching}
                data-testid="button-refresh-logs"
              >
                <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {logsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : (
                <pre
                  className="text-xs font-mono bg-muted/50 dark:bg-muted/20 p-3 rounded-md overflow-auto max-h-96 whitespace-pre-wrap break-all"
                  data-testid="text-gateway-logs"
                >
                  {logsQuery.data?.logs || "No logs available"}
                </pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
