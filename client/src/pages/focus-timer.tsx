import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Timer, Play, Pause, RotateCcw, Coffee } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function getToday() { return new Date().toISOString().split("T")[0]; }
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

export default function FocusTimer() {
  const { toast } = useToast();
  const [taskName, setTaskName] = useState("");
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ["/api/focus-sessions"] });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/focus-sessions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-sessions"] });
      toast({ title: "Focus session saved!" });
    },
  });

  const totalMinutes = workMinutes * 60;
  const breakTotal = breakMinutes * 60;

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setIsBreak(false);
    setSecondsLeft(workMinutes * 60);
  }, [workMinutes]);

  const completeSession = useCallback(() => {
    if (!isBreak && taskName.trim()) {
      saveMutation.mutate({ taskName: taskName.trim(), durationMinutes: workMinutes });
    }
    if (!isBreak) {
      setIsBreak(true);
      setSecondsLeft(breakTotal);
      toast({ title: "Work session complete! Take a break." });
    } else {
      setIsBreak(false);
      setSecondsLeft(totalMinutes);
      toast({ title: "Break over! Ready for another round?" });
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [isBreak, taskName, workMinutes, breakTotal, totalMinutes, saveMutation, toast]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            completeSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, completeSession]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const currentTotal = isBreak ? breakTotal : totalMinutes;
  const progress = currentTotal > 0 ? ((currentTotal - secondsLeft) / currentTotal) * 100 : 0;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const today = getToday();
  const todaySessions = sessions.filter((s: any) => s.completedAt?.startsWith(today));
  const todayMinutes = todaySessions.reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0);

  const last7 = getLast7Days();
  const chartData = last7.map(date => ({
    date: date.slice(5),
    minutes: sessions.filter((s: any) => s.completedAt?.startsWith(date)).reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0),
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-focus-timer">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Timer className="h-6 w-6 text-orange-500" /> Focus Timer
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-timer">
          <CardContent className="pt-6 flex flex-col items-center">
            <div className="relative w-52 h-52 mb-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" className="text-muted" strokeWidth="6" />
                <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" className={isBreak ? "text-green-500" : "text-primary"} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-mono font-bold" data-testid="text-timer">{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>
                <span className="text-sm text-muted-foreground flex items-center gap-1" data-testid="text-timer-mode">
                  {isBreak ? <><Coffee className="h-3 w-3" /> Break</> : "Focus"}
                </span>
              </div>
            </div>

            <Input className="max-w-[250px] mb-3 text-center" placeholder="What are you working on?" value={taskName} onChange={e => setTaskName(e.target.value)} disabled={isRunning} data-testid="input-task-name" />

            <div className="flex gap-2">
              <Button onClick={() => setIsRunning(!isRunning)} data-testid="button-start-pause">
                {isRunning ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {isRunning ? "Pause" : "Start"}
              </Button>
              <Button variant="outline" onClick={reset} data-testid="button-reset">
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
            </div>

            <div className="flex gap-4 mt-4">
              <div><Label className="text-xs">Work (min)</Label><Input type="number" min={1} max={120} value={workMinutes} onChange={e => { const v = parseInt(e.target.value) || 25; setWorkMinutes(v); if (!isRunning && !isBreak) setSecondsLeft(v * 60); }} className="w-16 text-center" disabled={isRunning} data-testid="input-work-minutes" /></div>
              <div><Label className="text-xs">Break (min)</Label><Input type="number" min={1} max={30} value={breakMinutes} onChange={e => setBreakMinutes(parseInt(e.target.value) || 5)} className="w-16 text-center" disabled={isRunning} data-testid="input-break-minutes" /></div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card data-testid="card-today-stats">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Today's Focus</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-today-minutes">{todayMinutes} min</div>
              <p className="text-xs text-muted-foreground">{todaySessions.length} sessions</p>
            </CardContent>
          </Card>

          <Card data-testid="card-weekly-chart">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly Focus (min)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Bar dataKey="minutes" fill="#f97316" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
