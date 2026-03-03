import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Target, Plus, Trash2, Flame } from "lucide-react";
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

export default function Habits() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [habitCategory, setHabitCategory] = useState("General");
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

  const isCompleted = (habitId: string, date: string) => completions.some((c: any) => c.habitId === habitId && c.date === date);
  const getCompletionId = (habitId: string, date: string) => completions.find((c: any) => c.habitId === habitId && c.date === date)?.id;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-habits">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Target className="h-6 w-6 text-blue-500" /> Habit Tracker
      </h1>

      <Card data-testid="card-add-habit">
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <Input className="flex-1 min-w-[150px]" placeholder="New habit name" value={name} onChange={e => setName(e.target.value)} data-testid="input-habit-name" />
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

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : habits.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No habits yet. Add your first one above!</CardContent></Card>
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
                      {habit.category && <span className="text-xs text-muted-foreground ml-2">({habit.category})</span>}
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
