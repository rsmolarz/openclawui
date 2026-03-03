import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Heart, Save, Moon, Zap, Activity, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MOODS = ["Very Low", "Low", "Neutral", "Good", "Great"];

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

export default function HealthTracker() {
  const { toast } = useToast();
  const today = getToday();
  const [form, setForm] = useState({ sleepHours: 7, waterGlasses: 0, exerciseMinutes: 0, mood: 3, weight: 0, energyLevel: 5, notes: "" });

  const { data: logs, isLoading } = useQuery<any[]>({ queryKey: ["/api/health-logs"] });
  const { data: todayLog } = useQuery<any>({
    queryKey: [`/api/health-logs/date/${today}`],
  });

  const { data: ouraData, isLoading: ouraLoading } = useQuery<any>({
    queryKey: ["/api/oura/daily-summary"],
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (todayLog?.id) {
        return apiRequest("PATCH", `/api/health-logs/${todayLog.id}`, data);
      }
      return apiRequest("POST", "/api/health-logs", { ...data, date: today });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health-logs/date", today] });
      toast({ title: "Health log saved" });
    },
  });

  const last7 = getLast7Days();
  const chartData = last7.map(date => {
    const log = logs?.find((l: any) => l.date === date);
    return {
      date: date.slice(5),
      sleep: log?.sleepHours || 0,
      water: log?.waterGlasses || 0,
      exercise: log?.exerciseMinutes || 0,
      energy: log?.energyLevel || 0,
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-health-tracker">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Heart className="h-6 w-6 text-red-500" /> Health Tracker
      </h1>

      <Card data-testid="card-oura-ring">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-500" /> Oura Ring
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ouraData?.configured ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Moon className="h-5 w-5 mx-auto mb-1 text-indigo-400" />
                <p className="text-xs text-muted-foreground">Sleep Score</p>
                <p className="text-2xl font-bold" data-testid="text-oura-sleep">{ouraData?.sleep?.score ?? "--"}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Zap className="h-5 w-5 mx-auto mb-1 text-green-400" />
                <p className="text-xs text-muted-foreground">Readiness</p>
                <p className="text-2xl font-bold" data-testid="text-oura-readiness">{ouraData?.readiness?.score ?? "--"}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Activity className="h-5 w-5 mx-auto mb-1 text-orange-400" />
                <p className="text-xs text-muted-foreground">Activity</p>
                <p className="text-2xl font-bold" data-testid="text-oura-activity">{ouraData?.activity?.score ?? "--"}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Heart className="h-5 w-5 mx-auto mb-1 text-red-400" />
                <p className="text-xs text-muted-foreground">HRV</p>
                <p className="text-2xl font-bold" data-testid="text-oura-hrv">{ouraData?.hrv?.average ?? "--"}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Settings className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground mb-2">Connect your Oura Ring to see sleep, readiness, activity, and HRV data</p>
              <Badge variant="outline" className="text-xs mb-2">Not Connected</Badge>
              <div className="bg-muted p-3 rounded-lg text-xs text-muted-foreground max-w-sm mx-auto mt-3 text-left space-y-1">
                <p className="font-medium">To connect:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Go to cloud.ouraring.com/personal-access-tokens</li>
                  <li>Create a Personal Access Token</li>
                  <li>Add it as <code className="bg-background px-1 rounded">OURA_API_TOKEN</code> secret</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-todays-entry">
        <CardHeader>
          <CardTitle className="text-lg">Today's Entry -- {today}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>Sleep (hours)</Label>
              <Input type="number" min={0} max={24} step={0.5} value={form.sleepHours} onChange={e => setForm(f => ({ ...f, sleepHours: parseFloat(e.target.value) || 0 }))} data-testid="input-sleep" />
            </div>
            <div>
              <Label>Water (glasses)</Label>
              <Input type="number" min={0} max={20} value={form.waterGlasses} onChange={e => setForm(f => ({ ...f, waterGlasses: parseInt(e.target.value) || 0 }))} data-testid="input-water" />
            </div>
            <div>
              <Label>Exercise (minutes)</Label>
              <Input type="number" min={0} max={300} value={form.exerciseMinutes} onChange={e => setForm(f => ({ ...f, exerciseMinutes: parseInt(e.target.value) || 0 }))} data-testid="input-exercise" />
            </div>
            <div>
              <Label>Weight</Label>
              <Input type="number" step={0.1} value={form.weight || ""} onChange={e => setForm(f => ({ ...f, weight: parseFloat(e.target.value) || 0 }))} placeholder="lbs/kg" data-testid="input-weight" />
            </div>
            <div>
              <Label>Energy Level (1-10)</Label>
              <Input type="number" min={1} max={10} value={form.energyLevel} onChange={e => setForm(f => ({ ...f, energyLevel: parseInt(e.target.value) || 5 }))} data-testid="input-energy" />
            </div>
            <div>
              <Label>Mood</Label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {MOODS.map((label, i) => (
                  <Button key={i} variant={form.mood === i + 1 ? "default" : "outline"} size="sm" onClick={() => setForm(f => ({ ...f, mood: i + 1 }))} data-testid={`button-mood-${i + 1}`}>{label}</Button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="How do you feel today?" data-testid="input-notes" />
          </div>
          <Button className="mt-4" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} data-testid="button-save-health">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            {todayLog?.id ? "Update" : "Save"} Entry
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-chart-sleep">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sleep (hrs) -- Last 7 Days</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Line type="monotone" dataKey="sleep" stroke="#8884d8" strokeWidth={2} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-chart-water">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Water (glasses) -- Last 7 Days</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Line type="monotone" dataKey="water" stroke="#82ca9d" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card data-testid="card-chart-exercise">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Exercise (min) -- Last 7 Days</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Line type="monotone" dataKey="exercise" stroke="#ffc658" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card data-testid="card-chart-energy">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Energy Level -- Last 7 Days</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Line type="monotone" dataKey="energy" stroke="#ff7300" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
