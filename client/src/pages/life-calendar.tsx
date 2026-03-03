import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Plus, Trash2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const EVENT_CATEGORIES = [
  { value: "work", label: "Work", color: "bg-blue-500" },
  { value: "health", label: "Health", color: "bg-green-500" },
  { value: "personal", label: "Personal", color: "bg-purple-500" },
  { value: "medical", label: "Medical", color: "bg-red-500" },
  { value: "travel", label: "Travel", color: "bg-orange-500" },
  { value: "finance", label: "Finance", color: "bg-yellow-500" },
];

function getToday() { return new Date().toISOString().split("T")[0]; }

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function LifeCalendar() {
  const { toast } = useToast();
  const [view, setView] = useState<"month" | "list">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", date: getToday(), endDate: "", category: "personal", color: "" });

  const { data: events = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/life-events"] });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/life-events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/life-events"] });
      setShowForm(false);
      setForm({ title: "", description: "", date: getToday(), endDate: "", category: "personal", color: "" });
      toast({ title: "Event added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/life-events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/life-events"] }),
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const getCategoryColor = (cat: string) => EVENT_CATEGORIES.find(c => c.value === cat)?.color || "bg-gray-500";

  const getEventsForDate = (date: string) => events.filter((e: any) => e.date === date || (e.endDate && e.date <= date && e.endDate >= date));

  const upcomingEvents = events
    .filter((e: any) => e.date >= getToday())
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const nextEvent = upcomingEvents[0];
  const daysUntilNext = nextEvent ? Math.ceil((new Date(nextEvent.date).getTime() - new Date(getToday()).getTime()) / 86400000) : null;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-life-calendar">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <CalendarDays className="h-6 w-6 text-violet-500" /> Life Calendar
        </h1>
        <div className="flex gap-2">
          <Button variant={view === "month" ? "default" : "outline"} size="sm" onClick={() => setView("month")} data-testid="button-view-month">Month</Button>
          <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")} data-testid="button-view-list">List</Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-event"><Plus className="h-4 w-4 mr-1" /> Add Event</Button>
        </div>
      </div>

      {nextEvent && (
        <Card data-testid="card-next-event">
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <span className="text-sm font-medium" data-testid="text-next-event-title">{nextEvent.title}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {daysUntilNext === 0 ? "Today" : daysUntilNext === 1 ? "Tomorrow" : `in ${daysUntilNext} days`}
              </span>
            </div>
            <Badge className={`${getCategoryColor(nextEvent.category)} text-white text-xs ml-auto`}>{nextEvent.category}</Badge>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card data-testid="card-event-form">
          <CardHeader><CardTitle className="text-lg">New Event</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-event-title" /></div>
              <div><Label>Start Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} data-testid="input-event-date" /></div>
              <div><Label>End Date (optional)</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} data-testid="input-event-end-date" /></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-event-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} data-testid="input-event-description" /></div>
            </div>
            <Button onClick={() => { if (form.title.trim() && form.date) addMutation.mutate(form); }} disabled={addMutation.isPending} data-testid="button-save-event">
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Save Event
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : view === "month" ? (
        <Card data-testid="card-month-view">
          <CardHeader className="flex flex-row items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth} data-testid="button-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle className="text-lg" data-testid="text-month-name">{monthName}</CardTitle>
            <Button variant="ghost" size="icon" onClick={nextMonth} data-testid="button-next-month"><ChevronRight className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="font-medium py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = getEventsForDate(dateStr);
                const isToday = dateStr === getToday();
                return (
                  <div key={day} className={`min-h-[48px] p-1 rounded text-xs ${isToday ? "bg-primary/10 ring-1 ring-primary" : "bg-muted/30"}`} data-testid={`day-${dateStr}`}>
                    <div className={`font-medium ${isToday ? "text-primary" : ""}`}>{day}</div>
                    <div className="flex flex-wrap gap-[2px] mt-0.5">
                      {dayEvents.slice(0, 3).map((e: any) => (
                        <div key={e.id} className={`w-2 h-2 rounded-full ${getCategoryColor(e.category)}`} title={e.title} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="card-list-view">
          <CardHeader><CardTitle className="text-lg">Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming events</p> : (
              <div className="space-y-3">
                {upcomingEvents.map((event: any) => (
                  <div key={event.id} className="flex items-start gap-3 border-b pb-3 last:border-0" data-testid={`event-item-${event.id}`}>
                    <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${getCategoryColor(event.category)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm" data-testid={`text-event-title-${event.id}`}>{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.date}{event.endDate ? ` — ${event.endDate}` : ""}</p>
                      {event.description && <p className="text-xs text-muted-foreground mt-1">{event.description}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{event.category}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteMutation.mutate(event.id)} data-testid={`button-delete-event-${event.id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
