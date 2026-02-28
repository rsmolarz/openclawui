import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen,
  File,
  ArrowLeft,
  Save,
  X,
  RefreshCw,
  Home,
  ChevronRight,
  FileText,
  FileCode,
  FolderClosed,
  AlertCircle,
} from "lucide-react";

interface FileEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  modified: string;
  permissions: string;
}

interface DirListing {
  path: string;
  entries: FileEntry[];
}

const QUICK_LINKS = [
  { label: "OpenClaw Config", path: "/root/.openclaw" },
  { label: "Home Directory", path: "/root" },
  { label: "Logs", path: "/var/log" },
  { label: "System Config", path: "/etc" },
  { label: "Tmp", path: "/tmp" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === "directory") return <FolderClosed className="h-4 w-4 text-muted-foreground" />;
  if (entry.type === "symlink") return <FolderOpen className="h-4 w-4 text-muted-foreground" />;
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["js", "ts", "py", "sh", "json", "yaml", "yml", "toml", "cfg", "conf", "ini"].includes(ext || ""))
    return <FileCode className="h-4 w-4 text-muted-foreground" />;
  if (["txt", "md", "log", "csv"].includes(ext || ""))
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function isTextFile(name: string): boolean {
  const textExts = [
    "txt", "md", "log", "json", "yaml", "yml", "toml", "cfg", "conf", "ini",
    "js", "ts", "py", "sh", "bash", "zsh", "fish", "css", "html", "xml",
    "csv", "env", "service", "timer", "socket", "rules", "list",
  ];
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && textExts.includes(ext)) return true;
  const textNames = [
    ".bashrc", ".profile", ".env", ".gitconfig", "Makefile", "Dockerfile",
    "config", "hosts", "crontab", "authorized_keys", "known_hosts",
  ];
  return textNames.some((n) => name === n || name.endsWith(n));
}

export default function FileManager() {
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState("/root/.openclaw");
  const [pathInput, setPathInput] = useState("/root/.openclaw");
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editedContent, setEditedContent] = useState("");

  const dirQuery = useQuery<DirListing>({
    queryKey: [`/api/files/list?path=${encodeURIComponent(currentPath)}`],
  });

  const readFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const res = await apiRequest("GET", `/api/files/read?path=${encodeURIComponent(filePath)}`);
      return res.json();
    },
    onSuccess: (data: { path: string; content: string }, filePath: string) => {
      setEditingFile(filePath);
      setFileContent(data.content);
      setEditedContent(data.content);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const writeFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await apiRequest("POST", "/api/files/write", { path, content });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to write file");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: `File saved successfully.` });
      setFileContent(editedContent);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const navigateTo = (path: string) => {
    setEditingFile(null);
    setCurrentPath(path);
    setPathInput(path);
  };

  const handleEntryClick = (entry: FileEntry) => {
    const fullPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    if (entry.type === "directory" || entry.type === "symlink") {
      navigateTo(fullPath);
    } else if (isTextFile(entry.name)) {
      readFileMutation.mutate(fullPath);
    } else {
      toast({
        title: "Binary file",
        description: "This file type cannot be viewed in the editor.",
      });
    }
  };

  const goUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/");
    parts.pop();
    const parent = parts.join("/") || "/";
    navigateTo(parent);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(pathInput.trim() || "/");
  };

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold" data-testid="text-file-manager-title">VPS File Manager</h1>
        <div className="flex items-center gap-1 flex-wrap">
          {QUICK_LINKS.map((link) => (
            <Button
              key={link.path}
              variant="outline"
              size="sm"
              onClick={() => navigateTo(link.path)}
              data-testid={`button-quicklink-${link.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {link.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={goUp} disabled={currentPath === "/"} data-testid="button-go-up">
              <ArrowLeft />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => navigateTo("/")} data-testid="button-go-home">
              <Home />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/files/list", currentPath] })}
              data-testid="button-refresh-dir"
            >
              <RefreshCw />
            </Button>
          </div>
          <form onSubmit={handlePathSubmit} className="flex-1 flex items-center gap-2">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-path"
            />
            <Button type="submit" size="sm" data-testid="button-go-path">
              Go
            </Button>
          </form>
        </CardHeader>

        <div className="px-4 pb-2 flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <button onClick={() => navigateTo("/")} className="hover-elevate rounded px-1" data-testid="breadcrumb-root">
            /
          </button>
          {breadcrumbs.map((part, i) => {
            const partPath = "/" + breadcrumbs.slice(0, i + 1).join("/");
            return (
              <span key={partPath} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => navigateTo(partPath)}
                  className="hover-elevate rounded px-1"
                  data-testid={`breadcrumb-${i}`}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        <CardContent className="p-0">
          {dirQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : dirQuery.isError ? (
            <div className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="h-8 w-8" />
              <p data-testid="text-dir-error">Failed to list directory. Check VPS connection.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/files/list", currentPath] })}
                data-testid="button-retry"
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {dirQuery.data?.entries.length === 0 && (
                <div className="p-6 text-center text-muted-foreground" data-testid="text-empty-dir">
                  Empty directory
                </div>
              )}
              {dirQuery.data?.entries.map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => handleEntryClick(entry)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover-elevate text-sm"
                  data-testid={`file-entry-${entry.name}`}
                >
                  {getFileIcon(entry)}
                  <span className="flex-1 truncate font-mono">{entry.name}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">{entry.permissions}</span>
                  {entry.type === "file" && (
                    <span className="text-xs text-muted-foreground w-20 text-right">{formatSize(entry.size)}</span>
                  )}
                  {entry.type === "directory" && (
                    <Badge variant="secondary" className="text-xs">
                      DIR
                    </Badge>
                  )}
                  {entry.type === "symlink" && (
                    <Badge variant="outline" className="text-xs">
                      LINK
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editingFile && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-mono truncate flex-1" data-testid="text-editing-file">
              {editingFile}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                onClick={() => writeFileMutation.mutate({ path: editingFile, content: editedContent })}
                disabled={writeFileMutation.isPending || editedContent === fileContent}
                data-testid="button-save-file"
              >
                <Save className="h-4 w-4 mr-1" />
                {writeFileMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingFile(null)}
                data-testid="button-close-editor"
              >
                <X />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editedContent !== fileContent && (
              <div className="mb-2">
                <Badge variant="secondary" className="text-xs" data-testid="badge-unsaved">
                  Unsaved changes
                </Badge>
              </div>
            )}
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="font-mono text-sm min-h-[400px] resize-y"
              spellCheck={false}
              data-testid="textarea-file-editor"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
