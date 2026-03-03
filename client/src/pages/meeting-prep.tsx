import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, Sparkles, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MeetingPrep() {
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
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-meeting-prep">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Users className="h-6 w-6 text-indigo-500" /> Meeting Prep AI
      </h1>

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
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${selectedId === p.id ? "bg-primary/10" : "hover:bg-muted"}`} onClick={() => setSelectedId(p.id)} data-testid={`prep-item-${p.id}`}>
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
