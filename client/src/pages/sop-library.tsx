import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Plus, Trash2, Sparkles, Search, Edit, X, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SOP_CATEGORIES = ["Medical", "Business", "Personal", "Tech", "Home", "Other"];

export default function SopLibrary() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", category: "Other", overview: "", steps: "" });
  const [aiTitle, setAiTitle] = useState("");
  const [aiDesc, setAiDesc] = useState("");

  const { data: sops = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/omi/sops"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/omi/sops", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] });
      toast({ title: "SOP created" });
      setEditing(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/omi/sops/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] });
      toast({ title: "SOP updated" });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/omi/sops/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/omi/sops"] }); setSelectedId(null); },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sop-library/generate", { title: aiTitle, description: aiDesc });
      return res.json();
    },
    onSuccess: (data: any) => {
      setEditForm({
        title: data.title || aiTitle,
        category: data.category || "Other",
        overview: data.overview || "",
        steps: JSON.stringify(data.steps || [], null, 2),
      });
      setEditing(true);
      setSelectedId(null);
      setAiTitle(""); setAiDesc("");
      toast({ title: "AI draft generated — review and save" });
    },
  });

  const filtered = sops
    .filter((s: any) => filterCat === "All" || s.category === filterCat)
    .filter((s: any) => !search || s.title?.toLowerCase().includes(search.toLowerCase()));

  const selected = sops.find((s: any) => s.id === selectedId);

  const parseSteps = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  };

  const startEdit = (sop?: any) => {
    if (sop) {
      setEditForm({ title: sop.title, category: sop.category || "Other", overview: sop.overview || "", steps: typeof sop.steps === "string" ? sop.steps : JSON.stringify(sop.steps || [], null, 2) });
    } else {
      setEditForm({ title: "", category: "Other", overview: "", steps: "[]" });
    }
    setEditing(true);
  };

  const saveEdit = () => {
    const data = { title: editForm.title, category: editForm.category, overview: editForm.overview, steps: editForm.steps, status: "active" };
    if (selectedId) updateMutation.mutate({ id: selectedId, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-sop-library">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <BookOpen className="h-6 w-6 text-teal-500" /> SOP Library
      </h1>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search SOPs..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-32" data-testid="select-filter-category"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="All">All</SelectItem>{SOP_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => startEdit()} data-testid="button-new-sop"><Plus className="h-4 w-4 mr-1" /> New SOP</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2" data-testid="list-sops">
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : filtered.length === 0 ? <p className="text-sm text-muted-foreground p-4">No SOPs found</p> : filtered.map((sop: any) => (
            <Card key={sop.id} className={`cursor-pointer ${selectedId === sop.id ? "ring-2 ring-primary" : ""}`} onClick={() => { setSelectedId(sop.id); setEditing(false); }} data-testid={`sop-card-${sop.id}`}>
              <CardContent className="py-3">
                <p className="text-sm font-medium truncate">{sop.title}</p>
                <Badge variant="outline" className="text-xs mt-1">{sop.category}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="md:col-span-2" data-testid="card-sop-detail">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{editing ? (selectedId ? "Edit SOP" : "New SOP") : (selected?.title || "Select an SOP")}</CardTitle>
            {selected && !editing && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(selected)} data-testid="button-edit-sop"><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(selected.id)} data-testid="button-delete-sop"><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
            {editing && <Button variant="ghost" size="sm" onClick={() => setEditing(false)} data-testid="button-cancel-edit"><X className="h-4 w-4" /></Button>}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} data-testid="input-sop-title" /></div>
                <div><Label>Category</Label>
                  <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger data-testid="select-sop-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{SOP_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Overview</Label><Textarea value={editForm.overview} onChange={e => setEditForm(f => ({ ...f, overview: e.target.value }))} rows={3} data-testid="input-sop-overview" /></div>
                <div><Label>Steps (JSON)</Label><Textarea value={editForm.steps} onChange={e => setEditForm(f => ({ ...f, steps: e.target.value }))} rows={6} className="font-mono text-xs" data-testid="input-sop-steps" /></div>
                <Button onClick={saveEdit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-sop"><Save className="h-4 w-4 mr-1" /> Save</Button>
              </div>
            ) : selected ? (
              <div className="space-y-3">
                <Badge variant="outline">{selected.category}</Badge>
                {selected.overview && <p className="text-sm" data-testid="text-sop-overview">{selected.overview}</p>}
                <div data-testid="list-sop-steps">
                  {parseSteps(selected.steps).map((step: any, i: number) => (
                    <div key={i} className="flex gap-2 text-sm py-2 border-b last:border-0">
                      <span className="font-bold text-primary">{step.step || i + 1}.</span>
                      <div><p className="font-medium">{step.title}</p><p className="text-muted-foreground">{step.description}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Select or create an SOP</p>}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-ai-generate">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI SOP Generator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>SOP Title</Label><Input value={aiTitle} onChange={e => setAiTitle(e.target.value)} placeholder="e.g., Server Deployment Checklist" data-testid="input-ai-title" /></div>
          <div><Label>Description (optional)</Label><Textarea value={aiDesc} onChange={e => setAiDesc(e.target.value)} placeholder="What should this SOP cover?" rows={2} data-testid="input-ai-description" /></div>
          <Button onClick={() => aiGenerateMutation.mutate()} disabled={aiGenerateMutation.isPending || !aiTitle.trim()} data-testid="button-ai-generate">
            {aiGenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate Draft
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
