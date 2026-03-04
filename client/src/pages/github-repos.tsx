import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitBranch, RefreshCw, ExternalLink, Lock, Globe, Search,
  Star, GitFork, AlertCircle, Loader2, Eye, EyeOff,
  CheckCircle2, XCircle, Filter, ArrowUpDown, Code2,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import type { GithubRepo } from "@shared/schema";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Ruby: "bg-red-600",
  PHP: "bg-indigo-400",
  Shell: "bg-green-600",
  HTML: "bg-orange-500",
  CSS: "bg-purple-500",
  Dockerfile: "bg-blue-600",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-600",
};

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(d: string | null): string {
  if (!d) return "Never";
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type SortKey = "pushed" | "name" | "stars" | "size";
type VisibilityFilter = "all" | "public" | "private";

export default function GitHubRepos() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("pushed");
  const [visFilter, setVisFilter] = useState<VisibilityFilter>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: repos = [], isLoading } = useQuery<GithubRepo[]>({
    queryKey: ["/api/github/repos"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/github/sync");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/github/repos"] });
      toast({ title: `Synced ${data.synced} repositories from GitHub` });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: async ({ id, isPrivate }: { id: string; isPrivate: boolean }) => {
      const res = await apiRequest("PATCH", `/api/github/repos/${id}/visibility`, { isPrivate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/github/repos"] });
      toast({ title: `${data.fullName} is now ${data.isPrivate ? "private" : "public"}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to change visibility", description: err.message, variant: "destructive" });
    },
  });

  const bulkVisibilityMutation = useMutation({
    mutationFn: async ({ repoIds, isPrivate }: { repoIds: string[]; isPrivate: boolean }) => {
      const res = await apiRequest("POST", "/api/github/repos/bulk-visibility", { repoIds, isPrivate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/github/repos"] });
      setSelected(new Set());
      toast({ title: `Updated ${data.successCount}/${data.totalCount} repositories` });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk update failed", description: err.message, variant: "destructive" });
    },
  });

  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[];

  const filtered = repos
    .filter(r => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.description?.toLowerCase().includes(q) && !r.fullName.toLowerCase().includes(q)) return false;
      }
      if (visFilter === "public" && r.isPrivate) return false;
      if (visFilter === "private" && !r.isPrivate) return false;
      if (langFilter !== "all" && r.language !== langFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "stars": return (b.stargazersCount || 0) - (a.stargazersCount || 0);
        case "size": return (b.size || 0) - (a.size || 0);
        default: return new Date(b.lastPushedAt || 0).getTime() - new Date(a.lastPushedAt || 0).getTime();
      }
    });

  const publicCount = repos.filter(r => !r.isPrivate).length;
  const privateCount = repos.filter(r => r.isPrivate).length;
  const selectedPublic = [...selected].filter(id => repos.find(r => r.id === id && !r.isPrivate)).length;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.id)));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-github-repos">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-github-title">
            <SiGithub className="h-6 w-6" />
            GitHub Repositories
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {repos.length} repos synced — {publicCount} public, {privateCount} private
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-github"
        >
          {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync from GitHub
        </Button>
      </div>

      {repos.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-16 text-center">
            <SiGithub className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-no-repos">No Repositories Synced</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Click "Sync from GitHub" to import all your repositories. You'll be able to view, filter, and change their visibility right here.
            </p>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-first-sync">
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Now
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      )}

      {repos.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search repos..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-repos"
              />
            </div>

            <div className="flex items-center border rounded-lg overflow-hidden" data-testid="filter-visibility">
              {(["all", "public", "private"] as VisibilityFilter[]).map(v => (
                <button
                  key={v}
                  onClick={() => setVisFilter(v)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${visFilter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  data-testid={`button-filter-${v}`}
                >
                  {v === "public" && <Globe className="h-3 w-3 inline mr-1" />}
                  {v === "private" && <Lock className="h-3 w-3 inline mr-1" />}
                  {v} {v === "public" ? `(${publicCount})` : v === "private" ? `(${privateCount})` : `(${repos.length})`}
                </button>
              ))}
            </div>

            <select
              className="text-xs border rounded-lg px-3 py-2 bg-background"
              value={langFilter}
              onChange={e => setLangFilter(e.target.value)}
              data-testid="select-lang-filter"
            >
              <option value="all">All Languages</option>
              {languages.sort().map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            <select
              className="text-xs border rounded-lg px-3 py-2 bg-background"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              data-testid="select-sort"
            >
              <option value="pushed">Last Pushed</option>
              <option value="name">Name</option>
              <option value="stars">Stars</option>
              <option value="size">Size</option>
            </select>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border" data-testid="panel-bulk-actions">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkVisibilityMutation.mutate({ repoIds: [...selected], isPrivate: true })}
                disabled={bulkVisibilityMutation.isPending}
                data-testid="button-bulk-private"
              >
                {bulkVisibilityMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                Make Private
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkVisibilityMutation.mutate({ repoIds: [...selected], isPrivate: false })}
                disabled={bulkVisibilityMutation.isPending}
                data-testid="button-bulk-public"
              >
                {bulkVisibilityMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
                Make Public
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} data-testid="button-clear-selection">
                Clear
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected.size === filtered.length && filtered.length > 0}
                onCheckedChange={selectAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-xs text-muted-foreground">
                {filtered.length} repos shown
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(repo => (
              <Card
                key={repo.id}
                className={`transition-all ${selected.has(repo.id) ? "ring-2 ring-primary" : ""}`}
                data-testid={`card-repo-${repo.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(repo.id)}
                      onCheckedChange={() => toggleSelect(repo.id)}
                      className="mt-1 shrink-0"
                      data-testid={`checkbox-repo-${repo.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm hover:underline truncate"
                          data-testid={`link-repo-${repo.id}`}
                        >
                          {repo.name}
                        </a>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${repo.isPrivate ? "text-yellow-600 border-yellow-500/30" : "text-green-600 border-green-500/30"}`}
                        >
                          {repo.isPrivate ? <Lock className="h-2.5 w-2.5 mr-0.5" /> : <Globe className="h-2.5 w-2.5 mr-0.5" />}
                          {repo.isPrivate ? "Private" : "Public"}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground mb-0.5 truncate">{repo.owner}/{repo.name}</p>

                      {repo.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{repo.description}</p>
                      )}

                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${LANG_COLORS[repo.language] || "bg-gray-400"}`} />
                            {repo.language}
                          </span>
                        )}
                        {(repo.stargazersCount || 0) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5" /> {repo.stargazersCount}
                          </span>
                        )}
                        {(repo.forksCount || 0) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <GitFork className="h-2.5 w-2.5" /> {repo.forksCount}
                          </span>
                        )}
                        <span>{formatSize(repo.size || 0)}</span>
                        <span>pushed {formatDate(repo.lastPushedAt as any)}</span>
                      </div>

                      {repo.topics && repo.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {repo.topics.slice(0, 4).map(t => (
                            <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5">{t}</Badge>
                          ))}
                          {repo.topics.length > 4 && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">+{repo.topics.length - 4}</Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => visibilityMutation.mutate({ id: repo.id, isPrivate: !repo.isPrivate })}
                          disabled={visibilityMutation.isPending}
                          data-testid={`button-toggle-vis-${repo.id}`}
                        >
                          {repo.isPrivate ? <Globe className="h-2.5 w-2.5 mr-1" /> : <Lock className="h-2.5 w-2.5 mr-1" />}
                          Make {repo.isPrivate ? "Public" : "Private"}
                        </Button>
                        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid={`button-open-repo-${repo.id}`}>
                            <ExternalLink className="h-2.5 w-2.5 mr-1" /> Open
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No repos match your filters</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
