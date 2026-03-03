import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sun, Server, Code2, Activity, RefreshCw, Quote } from "lucide-react";

export default function DailyBriefing() {
  const { data: briefing, isLoading: briefingLoading, refetch } = useQuery<{ actionPlan: string; quote: string }>({
    queryKey: ["/api/daily-briefing"],
    staleTime: 60000,
  });

  const { data: machines } = useQuery<any[]>({
    queryKey: ["/api/machines"],
  });

  const { data: projects } = useQuery<any[]>({
    queryKey: ["/api/replit-projects"],
  });

  const { data: auditData } = useQuery<{ logs: any[] }>({
    queryKey: ["/api/audit-logs", { page: 1, limit: 5 }],
  });

  const onlineNodes = machines?.filter((m: any) => m.status === "online").length || 0;
  const totalNodes = machines?.length || 0;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-daily-briefing">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Sun className="h-6 w-6 text-yellow-500" /> Good Morning
          </h1>
          <p className="text-muted-foreground" data-testid="text-date">{today}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-briefing">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card data-testid="card-action-plan">
        <CardHeader>
          <CardTitle className="text-lg">Action Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {briefingLoading ? (
            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating your briefing...</div>
          ) : (
            <p className="whitespace-pre-line text-sm" data-testid="text-action-plan">{briefing?.actionPlan || "No briefing available"}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-nodes-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" /> Node Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-nodes-online">{onlineNodes}/{totalNodes}</div>
            <p className="text-xs text-muted-foreground">nodes online</p>
          </CardContent>
        </Card>

        <Card data-testid="card-projects-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code2 className="h-4 w-4" /> Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-projects-count">{projects?.length || 0}</div>
            <p className="text-xs text-muted-foreground">active projects</p>
          </CardContent>
        </Card>

        <Card data-testid="card-quote">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Quote className="h-4 w-4" /> Daily Quote
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm italic" data-testid="text-quote">{briefing?.quote || "Every expert was once a beginner."}</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-activity">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditData?.logs?.length ? (
            <div className="space-y-2">
              {auditData.logs.slice(0, 5).map((log: any, i: number) => (
                <div key={log.id || i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0" data-testid={`activity-item-${i}`}>
                  <span>{log.action}</span>
                  <Badge variant="outline" className="text-xs">{log.actionType}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
