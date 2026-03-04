import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Users, Sparkles, Trash2, ChevronDown, ChevronRight,
  Video, Plus, ExternalLink, Calendar, Copy, CheckCircle2,
  Clock, Link2, AlertCircle, Settings, MonitorSmartphone
} from "lucide-react";
import { SiZoom } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function ZoomPanel() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("30");
  const [agenda, setAgenda] = useState("");
  const [startTime, setStartTime] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: status } = useQuery<{ configured: boolean }>({ queryKey: ["/api/zoom/status"] });
  const { data: meetings, isLoading } = useQuery<any>({
    queryKey: ["/api/zoom/meetings"],
    enabled: !!status?.configured,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/zoom/meetings", {
        topic,
        duration: parseInt(duration),
        agenda,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zoom/meetings"] });
      setShowCreate(false);
      setTopic(""); setDuration("30"); setAgenda(""); setStartTime("");
      toast({ title: "Zoom meeting created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/zoom/meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zoom/meetings"] });
      toast({ title: "Meeting deleted" });
    },
  });

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!status?.configured) {
    return (
      <Card data-testid="card-zoom-setup">
        <CardContent className="py-8 text-center space-y-4">
          <SiZoom className="h-12 w-12 mx-auto text-blue-500" />
          <h3 className="text-lg font-semibold">Connect Zoom</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            To manage Zoom meetings, configure your Zoom Server-to-Server OAuth credentials in the Secrets panel.
          </p>
          <div className="text-left max-w-md mx-auto space-y-2 bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium">Required Secrets:</p>
            <div className="space-y-1 text-xs font-mono">
              <p><Badge variant="outline" className="mr-1">ZOOM_ACCOUNT_ID</Badge> Your Zoom account ID</p>
              <p><Badge variant="outline" className="mr-1">ZOOM_CLIENT_ID</Badge> Server-to-Server OAuth client ID</p>
              <p><Badge variant="outline" className="mr-1">ZOOM_CLIENT_SECRET</Badge> Server-to-Server OAuth client secret</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Create a Server-to-Server OAuth app at marketplace.zoom.us. Grant scopes: meeting:read, meeting:write, user:read.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const meetingList = meetings?.meetings || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{meetingList.length} upcoming meetings</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-zoom">
          <Plus className="h-4 w-4 mr-1" /> New Zoom Meeting
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : meetingList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No upcoming Zoom meetings</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {meetingList.map((m: any) => (
            <Card key={m.id} data-testid={`card-zoom-meeting-${m.id}`}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-medium text-sm truncate">{m.topic}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {m.type === 1 ? "Instant" : m.type === 2 ? "Scheduled" : m.type === 8 ? "Recurring" : "Meeting"}
                      </Badge>
                    </div>
                    {m.start_time && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(m.start_time).toLocaleString()} ({m.duration} min)
                      </p>
                    )}
                    {m.agenda && <p className="text-xs text-muted-foreground mt-1 truncate">{m.agenda}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.join_url && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => window.open(m.join_url, "_blank")} data-testid={`button-join-zoom-${m.id}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Join
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(m.join_url, String(m.id))} data-testid={`button-copy-zoom-${m.id}`}>
                          {copied === String(m.id) ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(String(m.id))} data-testid={`button-delete-zoom-${m.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="dialog-create-zoom">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><SiZoom className="h-5 w-5 text-blue-500" /> Create Zoom Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Topic *</Label><Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Weekly standup" data-testid="input-zoom-topic" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} data-testid="input-zoom-start" /></div>
              <div><Label>Duration (min)</Label><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="5" max="480" data-testid="input-zoom-duration" /></div>
            </div>
            <div><Label>Agenda</Label><Textarea value={agenda} onChange={e => setAgenda(e.target.value)} placeholder="Meeting agenda..." rows={3} data-testid="input-zoom-agenda" /></div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !topic.trim()} data-testid="button-submit-zoom">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Video className="h-4 w-4 mr-1" />}
              Create Meeting
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamsPanel() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [body, setBody] = useState("");
  const [attendees, setAttendees] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: status } = useQuery<{ configured: boolean }>({ queryKey: ["/api/teams/status"] });
  const { data: meetings, isLoading } = useQuery<any>({
    queryKey: ["/api/teams/meetings"],
    enabled: !!status?.configured,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/teams/meetings", {
        subject,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        endTime: endTime ? new Date(endTime).toISOString() : undefined,
        body,
        attendees: attendees.split(",").map(e => e.trim()).filter(Boolean),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams/meetings"] });
      setShowCreate(false);
      setSubject(""); setStartTime(""); setEndTime(""); setBody(""); setAttendees("");
      toast({ title: "Teams meeting created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/teams/meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams/meetings"] });
      toast({ title: "Meeting deleted" });
    },
  });

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!status?.configured) {
    return (
      <Card data-testid="card-teams-setup">
        <CardContent className="py-8 text-center space-y-4">
          <MonitorSmartphone className="h-12 w-12 mx-auto text-indigo-600" />
          <h3 className="text-lg font-semibold">Connect Microsoft Teams</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            To manage Teams meetings, configure your Microsoft Azure AD app credentials in the Secrets panel.
          </p>
          <div className="text-left max-w-md mx-auto space-y-2 bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium">Required Secrets:</p>
            <div className="space-y-1 text-xs font-mono">
              <p><Badge variant="outline" className="mr-1">MS_CLIENT_ID</Badge> Azure AD application (client) ID</p>
              <p><Badge variant="outline" className="mr-1">MS_CLIENT_SECRET</Badge> Azure AD client secret</p>
              <p><Badge variant="outline" className="mr-1">MS_TENANT_ID</Badge> Azure AD tenant (directory) ID</p>
              <p><Badge variant="outline" className="mr-1">MS_USER_ID</Badge> (Optional) User ID or UPN for calendar access</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Register an app at portal.azure.com. Grant Microsoft Graph permissions: Calendars.ReadWrite, OnlineMeetings.ReadWrite.All.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const meetingList = meetings?.value || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{meetingList.length} upcoming Teams meetings</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-teams">
          <Plus className="h-4 w-4 mr-1" /> New Teams Meeting
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : meetingList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No upcoming Teams meetings</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {meetingList.map((m: any) => (
            <Card key={m.id} data-testid={`card-teams-meeting-${m.id}`}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MonitorSmartphone className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="font-medium text-sm truncate">{m.subject}</span>
                      {m.isOnlineMeeting && <Badge variant="outline" className="text-xs shrink-0">Online</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(m.start?.dateTime + "Z").toLocaleString()} - {new Date(m.end?.dateTime + "Z").toLocaleTimeString()}
                    </p>
                    {m.attendees?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.attendees.length} attendee{m.attendees.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.onlineMeeting?.joinUrl && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => window.open(m.onlineMeeting.joinUrl, "_blank")} data-testid={`button-join-teams-${m.id}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Join
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(m.onlineMeeting.joinUrl, m.id)} data-testid={`button-copy-teams-${m.id}`}>
                          {copied === m.id ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(m.id)} data-testid={`button-delete-teams-${m.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="dialog-create-teams">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5 text-indigo-600" /> Create Teams Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Subject *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Project review" data-testid="input-teams-subject" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} data-testid="input-teams-start" /></div>
              <div><Label>End Time</Label><Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} data-testid="input-teams-end" /></div>
            </div>
            <div><Label>Attendees (comma-separated emails)</Label><Input value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="john@example.com, jane@example.com" data-testid="input-teams-attendees" /></div>
            <div><Label>Description</Label><Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Meeting description..." rows={3} data-testid="input-teams-body" /></div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !subject.trim()} data-testid="button-submit-teams">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MonitorSmartphone className="h-4 w-4 mr-1" />}
              Create Meeting
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoogleCalendarPanel() {
  const { data: events, isLoading } = useQuery<any[]>({ queryKey: ["/api/google-calendar/events"] });

  const upcomingEvents = (events || []).filter((e: any) => {
    const start = e.start?.dateTime || e.start?.date;
    return start && new Date(start) >= new Date();
  }).slice(0, 15);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{upcomingEvents.length} upcoming events from Google Calendar</p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : upcomingEvents.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No upcoming Google Calendar events</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {upcomingEvents.map((e: any) => {
            const start = e.start?.dateTime || e.start?.date;
            const end = e.end?.dateTime || e.end?.date;
            const isAllDay = !e.start?.dateTime;
            const hasVideo = !!e.hangoutLink || !!e.conferenceData;
            const joinUrl = e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri;

            return (
              <Card key={e.id} data-testid={`card-gcal-event-${e.id}`}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="font-medium text-sm truncate">{e.summary || "Untitled"}</span>
                        {isAllDay && <Badge variant="outline" className="text-xs">All Day</Badge>}
                        {hasVideo && <Badge variant="outline" className="text-xs">Video</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isAllDay
                          ? new Date(start).toLocaleDateString()
                          : `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleTimeString()}`
                        }
                      </p>
                      {e.location && <p className="text-xs text-muted-foreground mt-1 truncate">{e.location}</p>}
                    </div>
                    {joinUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(joinUrl, "_blank")} data-testid={`button-join-gcal-${e.id}`}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Join
                      </Button>
                    )}
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

function AIPrepPanel() {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeCompany, setAttendeeCompany] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: preps = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/meeting-preps"] });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meeting-preps/generate", { subject, attendeeName, attendeeCompany });
      return res.json();
    },
    onSuccess: (prep: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-preps"] });
      setSelectedId(prep.id);
      setSubject(""); setAttendeeName(""); setAttendeeCompany("");
      toast({ title: "Meeting prep generated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/meeting-preps/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meeting-preps"] });
      if (selectedId) setSelectedId(null);
    },
  });

  const selected = preps.find((p: any) => p.id === selectedId);
  const parseJson = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  };
  const toggleSection = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  return (
    <div className="space-y-4">
      <Card data-testid="card-generate">
        <CardHeader><CardTitle className="text-lg">Generate Meeting Brief</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Meeting Subject *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g., Partnership discussion with Acme Corp" data-testid="input-subject" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Attendee Name</Label><Input value={attendeeName} onChange={e => setAttendeeName(e.target.value)} placeholder="John Smith" data-testid="input-attendee-name" /></div>
            <div><Label>Company</Label><Input value={attendeeCompany} onChange={e => setAttendeeCompany(e.target.value)} placeholder="Acme Corp" data-testid="input-attendee-company" /></div>
          </div>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !subject.trim()} data-testid="button-generate">
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate Brief
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1" data-testid="card-prep-list">
          <CardHeader><CardTitle className="text-sm">Past Preps ({preps.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : preps.length === 0 ? <p className="text-sm text-muted-foreground">No preps yet</p> : (
              <div className="space-y-2">
                {preps.map((p: any) => (
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${selectedId === p.id ? "bg-primary/10" : ""}`} onClick={() => setSelectedId(p.id)} data-testid={`prep-item-${p.id}`}>
                    <span className="flex-1 truncate">{p.subject}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={e => { e.stopPropagation(); deleteMutation.mutate(p.id); }} data-testid={`button-delete-prep-${p.id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2" data-testid="card-prep-detail">
          <CardHeader><CardTitle className="text-lg">{selected ? selected.subject : "Select a prep to view"}</CardTitle></CardHeader>
          <CardContent>
            {!selected ? <p className="text-sm text-muted-foreground">Generate or select a meeting prep from the list</p> : (
              <div className="space-y-4">
                {selected.attendeeName && <p className="text-sm"><span className="font-medium">Attendee:</span> {selected.attendeeName}{selected.attendeeCompany ? ` (${selected.attendeeCompany})` : ""}</p>}
                <div>
                  <button onClick={() => toggleSection("brief")} className="flex items-center gap-1 font-medium text-sm w-full text-left" data-testid="toggle-brief">
                    {expanded.brief ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Background Brief
                  </button>
                  {expanded.brief && <p className="text-sm mt-1 pl-5 whitespace-pre-line" data-testid="text-brief">{selected.backgroundBrief}</p>}
                </div>
                <div>
                  <button onClick={() => toggleSection("points")} className="flex items-center gap-1 font-medium text-sm w-full text-left" data-testid="toggle-points">
                    {expanded.points ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Talking Points
                  </button>
                  {expanded.points && <ul className="list-disc pl-8 text-sm mt-1 space-y-1" data-testid="list-points">{parseJson(selected.talkingPoints).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>}
                </div>
                <div>
                  <button onClick={() => toggleSection("questions")} className="flex items-center gap-1 font-medium text-sm w-full text-left" data-testid="toggle-questions">
                    {expanded.questions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Questions to Ask
                  </button>
                  {expanded.questions && <ul className="list-disc pl-8 text-sm mt-1 space-y-1" data-testid="list-questions">{parseJson(selected.questions).map((q: string, i: number) => <li key={i}>{q}</li>)}</ul>}
                </div>
                <div>
                  <button onClick={() => toggleSection("objections")} className="flex items-center gap-1 font-medium text-sm w-full text-left" data-testid="toggle-objections">
                    {expanded.objections ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Objection Handling
                  </button>
                  {expanded.objections && (
                    <div className="pl-5 mt-1 space-y-2" data-testid="list-objections">
                      {parseJson(selected.objections).map((o: any, i: number) => (
                        <div key={i} className="text-sm"><p className="font-medium text-red-500">Objection: {o.objection}</p><p className="text-green-600">Response: {o.response}</p></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MeetingPrep() {
  const { data: zoomStatus } = useQuery<{ configured: boolean }>({ queryKey: ["/api/zoom/status"] });
  const { data: teamsStatus } = useQuery<{ configured: boolean }>({ queryKey: ["/api/teams/status"] });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-meeting-prep">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Users className="h-6 w-6 text-indigo-500" /> Meetings Hub
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant={zoomStatus?.configured ? "default" : "outline"} className="text-xs" data-testid="badge-zoom-status">
            <SiZoom className="h-3 w-3 mr-1" /> Zoom {zoomStatus?.configured ? "Connected" : "Not Set Up"}
          </Badge>
          <Badge variant={teamsStatus?.configured ? "default" : "outline"} className="text-xs" data-testid="badge-teams-status">
            <MonitorSmartphone className="h-3 w-3 mr-1" /> Teams {teamsStatus?.configured ? "Connected" : "Not Set Up"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="zoom" data-testid="tabs-meetings">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="zoom" className="flex items-center gap-1" data-testid="tab-zoom">
            <SiZoom className="h-3 w-3" /> Zoom
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center gap-1" data-testid="tab-teams">
            <MonitorSmartphone className="h-3 w-3" /> Teams
          </TabsTrigger>
          <TabsTrigger value="google" className="flex items-center gap-1" data-testid="tab-google">
            <Calendar className="h-3 w-3" /> Google
          </TabsTrigger>
          <TabsTrigger value="prep" className="flex items-center gap-1" data-testid="tab-prep">
            <Sparkles className="h-3 w-3" /> AI Prep
          </TabsTrigger>
        </TabsList>
        <TabsContent value="zoom"><ZoomPanel /></TabsContent>
        <TabsContent value="teams"><TeamsPanel /></TabsContent>
        <TabsContent value="google"><GoogleCalendarPanel /></TabsContent>
        <TabsContent value="prep"><AIPrepPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
