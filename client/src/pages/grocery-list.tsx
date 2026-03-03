import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListTodo, Plus, Trash2, Sparkles, RefreshCw, CheckCircle2, Clock, XCircle, Brain } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Todo = {
  id: string;
  content: string;
  source: string | null;
  sourceTitle: string | null;
  status: string;
  priority: string;
  createdAt: string;
  completedAt: string | null;
};

const PRIORITIES = ["high", "medium", "low"] as const;
const FILTERS = ["all", "pending", "done", "dismissed"] as const;

function priorityColor(p: string) {
  if (p === "high") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (p === "low") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
}

function sourceLabel(source: string | null) {
  if (!source || source === "manual") return null;
  return source;
}

export default function TodoList() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [filter, setFilter] = useState<string>("all");

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ["/api/omi/todos"],
  });

  const addMutation = useMutation({
    mutationFn: (data: { content: string; priority: string }) =>
      apiRequest("POST", "/api/omi/todos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] });
      setContent("");
      setPriority("medium");
      toast({ title: "Todo added" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/omi/todos/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/omi/todos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] }),
  });

  const pullFromOmi = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/omi/analyze");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/todos"] });
      const count = data?.todos?.length || 0;
      toast({
        title: count > 0 ? `Pulled ${count} todos from Omi` : "No new todos found",
        description: data?.recommendations ? data.recommendations.substring(0, 120) : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to pull from Omi", description: err.message, variant: "destructive" });
    },
  });

  const filtered = filter === "all" ? todos : todos.filter(t => t.status === filter);
  const pending = todos.filter(t => t.status === "pending");
  const done = todos.filter(t => t.status === "done");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-todo-list">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <ListTodo className="h-6 w-6 text-blue-500" /> Todo List
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{pending.length} pending</span>
          <span className="text-muted-foreground/40">|</span>
          <span>{done.length} done</span>
        </div>
      </div>

      <Card data-testid="card-add-todo">
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="What needs to be done?"
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && content.trim()) {
                  addMutation.mutate({ content, priority });
                }
              }}
              data-testid="input-todo-content"
            />
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-28" data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => (
                  <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => { if (content.trim()) addMutation.mutate({ content, priority }); }}
              disabled={addMutation.isPending || !content.trim()}
              data-testid="button-add-todo"
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f}`}
            >
              {f === "all" && "All"}
              {f === "pending" && <><Clock className="h-3 w-3 mr-1" /> Pending</>}
              {f === "done" && <><CheckCircle2 className="h-3 w-3 mr-1" /> Done</>}
              {f === "dismissed" && <><XCircle className="h-3 w-3 mr-1" /> Dismissed</>}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => pullFromOmi.mutate()}
            disabled={pullFromOmi.isPending}
            data-testid="button-pull-omi"
          >
            {pullFromOmi.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Brain className="h-4 w-4 mr-1" />
            )}
            Pull from Omi
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              {filter === "all"
                ? "No todos yet. Add one above or pull from your Omi conversations."
                : `No ${filter} todos.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(todo => (
            <Card
              key={todo.id}
              className={`transition-opacity ${todo.status === "done" ? "opacity-60" : todo.status === "dismissed" ? "opacity-40" : ""}`}
              data-testid={`card-todo-${todo.id}`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={todo.status === "done"}
                    onCheckedChange={(checked) => {
                      statusMutation.mutate({
                        id: todo.id,
                        status: checked ? "done" : "pending",
                      });
                    }}
                    className="mt-0.5"
                    data-testid={`checkbox-todo-${todo.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${todo.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {todo.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className={`text-xs ${priorityColor(todo.priority)}`}>
                        {todo.priority}
                      </Badge>
                      {sourceLabel(todo.source) && (
                        <Badge variant="outline" className="text-xs">
                          <Brain className="h-2.5 w-2.5 mr-1" />
                          {todo.sourceTitle || todo.source}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(todo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {todo.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-orange-500"
                        onClick={() => statusMutation.mutate({ id: todo.id, status: "dismissed" })}
                        data-testid={`button-dismiss-${todo.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {todo.status === "dismissed" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-blue-500"
                        onClick={() => statusMutation.mutate({ id: todo.id, status: "pending" })}
                        data-testid={`button-restore-${todo.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={() => deleteMutation.mutate(todo.id)}
                      data-testid={`button-delete-${todo.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pullFromOmi.isPending && (
        <Card className="border-dashed border-blue-300 dark:border-blue-700">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-3" />
            <p className="text-sm text-muted-foreground">
              Analyzing your recent Omi conversations for action items...
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
