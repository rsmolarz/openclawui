import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, Plus, Trash2, Flame, Brain, Clock, Lightbulb } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function getToday() { return new Date().toISOString().split("T")[0]; }
function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function calcStreak(completions: any[], habitId: string): number {
  const dates = completions.filter(c => c.habitId === habitId).map(c => c.date).sort().reverse();
  if (!dates.length) return 0;
  let streak = 0;
  const today = getToday();
  let check = new Date(today);
  for (let i = 0; i < 365; i++) {
    const dateStr = check.toISOString().split("T")[0];
    if (dates.includes(dateStr)) { streak++; check.setDate(check.getDate() - 1); }
    else if (i === 0) { check.setDate(check.getDate() - 1); continue; }
    else break;
  }
  return streak;
}

const CATEGORY_COLORS: Record<string, string> = {
  health: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  work: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  social: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  personal: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  routine: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

type TimeBlock = {
  time: string;
  duration: number;
  activity: string;
  category: string;
};

export default function Habits() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [habitCategory, setHabitCategory] = useState("General");
  const [showTimeBlocks, setShowTimeBlocks] = useState(false);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [omiInsights, setOmiInsights] = useState("");
  const today = getToday();
  const last30 = getLast30Days();

  const { data: habits = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/habits"] });
  const { data: completions = [] } = useQuery<any[]>({ queryKey: ["/api/habit-completions"] });

  const addHabitMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/habits", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/habits"] }); setName(""); toast({ title: "Habit created" }); },
  });

  const deleteHabitMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/habits/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/habits"] }),
  });

  const completeMutation = useMutation({
    mutationFn: (data: { habitId: string; date: string }) => apiRequest("POST", "/api/habit-completions", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/habit-completions"] }),
  });

  const uncompleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/habit-completions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/habit-completions"] }),
  });

  const analyzeOmi = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/habits/analyze-omi");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
      if (data.timeBlocks?.length) {
        setTimeBlocks(data.timeBlocks);
        setShowTimeBlocks(true);
      }
      if (data.insights) setOmiInsights(data.insights);
      toast({
        title: data.createdCount > 0
          ? `Added ${data.createdCount} habits from Omi`
          : "Analysis complete",
        description: data.insights?.substring(0, 100),
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to analyze Omi data", description: err.message, variant: "destructive" });
    },
  });

  const isCompleted = (habitId: string, date: string) => completions.some((c: any) => c.habitId === habitId && c.date === date);
  const getCompletionId = (habitId: string, date: string) => completions.find((c: any) => c.habitId === habitId && c.date === date)?.id;

  const sortedTimeBlocks = [...timeBlocks].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-habits">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Target className="h-6 w-6 text-blue-500" /> Habit Tracker
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => analyzeOmi.mutate()}
          disabled={analyzeOmi.isPending}
          data-testid="button-analyze-omi"
        >
          {analyzeOmi.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Brain className="h-4 w-4 mr-1" />
          )}
          Analyze from Omi
        </Button>
      </div>

      <Card data-testid="card-add-habit">
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <Input className="flex-1 min-w-[150px]" placeholder="New habit name" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) addHabitMutation.mutate({ name, frequency, category: habitCategory }); }}
              data-testid="input-habit-name" />
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="w-28" data-testid="select-frequency"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent>
            </Select>
            <Input className="w-28" placeholder="Category" value={habitCategory} onChange={e => setHabitCategory(e.target.value)} data-testid="input-habit-category" />
            <Button onClick={() => { if (name.trim()) addHabitMutation.mutate({ name, frequency, category: habitCategory }); }} disabled={addHabitMutation.isPending} data-testid="button-add-habit">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {omiInsights && (
        <Card className="border-blue-200 dark:border-blue-800" data-testid="card-omi-insights">
          <CardContent className="py-3 flex gap-3 items-start">
            <Lightbulb className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium mb-1">Omi Routine Insights</p>
              <p className="text-sm text-muted-foreground">{omiInsights}</p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0 ml-auto" onClick={() => setOmiInsights("")}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      {showTimeBlocks && sortedTimeBlocks.length > 0 && (
        <Card data-testid="card-time-blocks">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Your Day in 15-Minute Blocks
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowTimeBlocks(false)}>Hide</Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-1">
              {sortedTimeBlocks.map((block, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0" data-testid={`time-block-${i}`}>
                  <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{block.time}</span>
                  <div className="w-1 h-6 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-sm flex-1">{block.activity}</span>
                  <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[block.category] || CATEGORY_COLORS.routine}`}>
                    {block.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{block.duration}min</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analyzeOmi.isPending && (
        <Card className="border-dashed border-blue-300 dark:border-blue-700">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-3" />
            <p className="text-sm text-muted-foreground">
              Analyzing your Omi conversations for routines and habits...
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : habits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No habits yet. Add one above or click "Analyze from Omi" to discover your routines.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {habits.map((habit: any) => {
            const streak = calcStreak(completions, habit.id);
            const todayDone = isCompleted(habit.id, today);
            return (
              <Card key={habit.id} data-testid={`habit-card-${habit.id}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Checkbox checked={todayDone} onCheckedChange={() => {
                      if (todayDone) { const cId = getCompletionId(habit.id, today); if (cId) uncompleteMutation.mutate(cId); }
                      else completeMutation.mutate({ habitId: habit.id, date: today });
                    }} data-testid={`checkbox-habit-${habit.id}`} />
                    <div className="flex-1">
                      <span className="font-medium" data-testid={`text-habit-name-${habit.id}`}>{habit.name}</span>
                      {habit.category && (
                        <Badge variant="secondary" className={`ml-2 text-xs ${CATEGORY_COLORS[habit.category] || ""}`}>
                          {habit.category}
                        </Badge>
                      )}
                    </div>
                    {streak > 0 && (
                      <div className="flex items-center gap-1 text-orange-500" data-testid={`text-streak-${habit.id}`}>
                        <Flame className="h-4 w-4" /> <span className="text-sm font-bold">{streak}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteHabitMutation.mutate(habit.id)} data-testid={`button-delete-habit-${habit.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex gap-[2px] flex-wrap" data-testid={`grid-habit-${habit.id}`}>
                    {last30.map(date => {
                      const done = isCompleted(habit.id, date);
                      return <div key={date} className={`w-3 h-3 rounded-sm ${done ? "bg-green-500" : "bg-muted"}`} title={date} />;
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
