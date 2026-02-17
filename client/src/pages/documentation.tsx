import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Search, Pin, Pencil, Trash2, Eye, Tag, X } from "lucide-react";
import { useState } from "react";
import type { Doc } from "@shared/schema";

const CATEGORIES = [
  { value: "guide", label: "Setup Guide" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "release", label: "Release Notes" },
  { value: "reference", label: "Reference" },
  { value: "faq", label: "FAQ" },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function DocEditor({
  open,
  onClose,
  editDoc,
}: {
  open: boolean;
  onClose: () => void;
  editDoc: Doc | null;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(editDoc?.title ?? "");
  const [slug, setSlug] = useState(editDoc?.slug ?? "");
  const [category, setCategory] = useState(editDoc?.category ?? "guide");
  const [content, setContent] = useState(editDoc?.content ?? "");
  const [tags, setTags] = useState<string[]>(editDoc?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [pinned, setPinned] = useState(editDoc?.pinned ?? false);

  const isEditing = !!editDoc;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing) {
        await apiRequest("PATCH", `/api/docs/${editDoc.id}`, data);
      } else {
        await apiRequest("POST", "/api/docs", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      toast({ title: isEditing ? "Doc updated" : "Doc created", description: "Your documentation has been saved." });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save document.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      slug: slug.trim() || slugify(title),
      category,
      content,
      tags: tags.length > 0 ? tags : null,
      pinned,
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-doc-editor-title">
            {isEditing ? "Edit Document" : "New Document"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!isEditing) setSlug(slugify(e.target.value));
              }}
              placeholder="Getting Started with OpenClaw"
              data-testid="input-doc-title"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-slug">URL Slug</Label>
              <Input
                id="doc-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="getting-started"
                data-testid="input-doc-slug"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-doc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} data-testid={`option-category-${c.value}`}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-content">Content (Markdown)</Label>
            <Textarea
              id="doc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your documentation here using markdown..."
              className="min-h-[200px] font-mono text-sm"
              data-testid="textarea-doc-content"
            />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2 flex-wrap">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="ml-1"
                    data-testid={`button-remove-tag-${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add a tag..."
                data-testid="input-doc-tag"
              />
              <Button variant="outline" onClick={addTag} data-testid="button-add-tag">
                <Tag className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={pinned ? "default" : "outline"}
              size="sm"
              onClick={() => setPinned(!pinned)}
              data-testid="button-toggle-pin"
            >
              <Pin className="h-3 w-3 mr-1" />
              {pinned ? "Pinned" : "Pin this doc"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-doc">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending}
            data-testid="button-save-doc"
          >
            {createMutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocViewer({
  doc,
  onClose,
  onEdit,
}: {
  doc: Doc;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle data-testid="text-doc-view-title">{doc.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" data-testid="badge-doc-category">
                  {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                </Badge>
                {doc.pinned && (
                  <Badge variant="outline" data-testid="badge-doc-pinned">
                    <Pin className="h-3 w-3 mr-1" /> Pinned
                  </Badge>
                )}
                {doc.tags?.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>
        <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed" data-testid="text-doc-content">
            {doc.content || "No content yet."}
          </pre>
        </div>
        <div className="text-xs text-muted-foreground mt-4">
          Last updated: {new Date(doc.updatedAt).toLocaleString()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-doc">
            Close
          </Button>
          <Button onClick={onEdit} data-testid="button-edit-from-view">
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Documentation() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);

  const { data: allDocs, isLoading } = useQuery<Doc[]>({
    queryKey: ["/api/docs"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/docs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      toast({ title: "Doc deleted", description: "Document has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    },
  });

  const filteredDocs = (allDocs ?? []).filter((d) => {
    const matchesSearch =
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || d.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const pinnedDocs = filteredDocs.filter((d) => d.pinned);
  const unpinnedDocs = filteredDocs.filter((d) => !d.pinned);
  const sortedDocs = [...pinnedDocs, ...unpinnedDocs];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-32" /></CardHeader>
              <CardContent><Skeleton className="h-12 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Documentation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Setup guides, troubleshooting tips, and reference docs for OpenClaw.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditDoc(null);
            setEditorOpen(true);
          }}
          data-testid="button-new-doc"
        >
          <Plus className="h-4 w-4 mr-2" /> New Document
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs by title or tag..."
            className="pl-9"
            data-testid="input-search-docs"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sortedDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No documents yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first document to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {sortedDocs.map((doc) => (
            <Card
              key={doc.id}
              className="hover-elevate cursor-pointer group"
              data-testid={`card-doc-${doc.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-tight flex items-center gap-2">
                    {doc.pinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className="truncate" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</span>
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-1 line-clamp-2">
                  {doc.content?.substring(0, 120) || "No content"}
                  {(doc.content?.length ?? 0) > 120 ? "..." : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 flex-wrap mb-3">
                  {doc.tags?.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                  {(doc.tags?.length ?? 0) > 3 && (
                    <span className="text-xs text-muted-foreground">+{(doc.tags?.length ?? 0) - 3}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setViewDoc(doc); }}
                      data-testid={`button-view-doc-${doc.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditDoc(doc);
                        setEditorOpen(true);
                      }}
                      data-testid={`button-edit-doc-${doc.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(doc.id);
                      }}
                      data-testid={`button-delete-doc-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editorOpen && (
        <DocEditor
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditDoc(null);
          }}
          editDoc={editDoc}
        />
      )}

      {viewDoc && (
        <DocViewer
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onEdit={() => {
            setEditDoc(viewDoc);
            setEditorOpen(true);
            setViewDoc(null);
          }}
        />
      )}
    </div>
  );
}
