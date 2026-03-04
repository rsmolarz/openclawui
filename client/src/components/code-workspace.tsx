import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  FileText, Plus, Trash2, Save, FolderOpen, X,
  ChevronRight, ChevronDown, Loader2, Download, Upload,
  FileCode, FileJson, FileCog, FileType,
} from "lucide-react";
import type { ProjectFile, ReplitProject } from "@shared/schema";

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  env: "plaintext",
  txt: "plaintext",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (filename.toLowerCase() === "dockerfile") return "dockerfile";
  return LANGUAGE_MAP[ext] || "plaintext";
}

function getFileIcon(filename: string) {
  const lang = detectLanguage(filename);
  switch (lang) {
    case "typescript":
    case "javascript":
      return <FileCode className="h-3.5 w-3.5 text-blue-500" />;
    case "json":
      return <FileJson className="h-3.5 w-3.5 text-yellow-500" />;
    case "python":
      return <FileCode className="h-3.5 w-3.5 text-green-500" />;
    case "html":
    case "css":
    case "scss":
      return <FileType className="h-3.5 w-3.5 text-orange-500" />;
    case "dockerfile":
    case "shell":
      return <FileCog className="h-3.5 w-3.5 text-purple-500" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

interface CodeWorkspaceProps {
  project: ReplitProject;
  expanded: boolean;
}

export function CodeWorkspace({ project, expanded }: CodeWorkspaceProps) {
  const { toast } = useToast();
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, string>>({});
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFilePath, setNewFilePath] = useState("/");
  const editorRef = useRef<any>(null);

  const { data: files = [], isLoading } = useQuery<ProjectFile[]>({
    queryKey: ["/api/project-files", project.id],
  });

  const createFileMutation = useMutation({
    mutationFn: (data: { projectId: string; filename: string; path: string; content: string; language: string }) =>
      apiRequest("POST", "/api/project-files", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-files", project.id] });
      setShowNewFile(false);
      setNewFileName("");
      setNewFilePath("/");
      toast({ title: "File created" });
    },
  });

  const updateFileMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("PATCH", `/api/project-files/${id}`, { content }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-files", project.id] });
      setUnsavedChanges(prev => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({ title: "File saved" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/project-files/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-files", project.id] });
      setOpenTabs(prev => prev.filter(t => t !== deletedId));
      if (activeFileId === deletedId) {
        setActiveFileId(openTabs.find(t => t !== deletedId) || null);
      }
      toast({ title: "File deleted" });
    },
  });

  const activeFile = files.find(f => f.id === activeFileId);
  const activeContent = activeFileId && unsavedChanges[activeFileId] !== undefined
    ? unsavedChanges[activeFileId]
    : activeFile?.content || "";

  const openFile = useCallback((fileId: string) => {
    setActiveFileId(fileId);
    if (!openTabs.includes(fileId)) {
      setOpenTabs(prev => [...prev, fileId]);
    }
  }, [openTabs]);

  const closeTab = useCallback((fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (unsavedChanges[fileId] !== undefined) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    setOpenTabs(prev => prev.filter(t => t !== fileId));
    setUnsavedChanges(prev => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    if (activeFileId === fileId) {
      const remaining = openTabs.filter(t => t !== fileId);
      setActiveFileId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  }, [openTabs, activeFileId, unsavedChanges]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      const original = files.find(f => f.id === activeFileId)?.content || "";
      if (value !== original) {
        setUnsavedChanges(prev => ({ ...prev, [activeFileId]: value }));
      } else {
        setUnsavedChanges(prev => {
          const next = { ...prev };
          delete next[activeFileId];
          return next;
        });
      }
    }
  }, [activeFileId, files]);

  const saveActiveFile = useCallback(() => {
    if (activeFileId && unsavedChanges[activeFileId] !== undefined) {
      updateFileMutation.mutate({ id: activeFileId, content: unsavedChanges[activeFileId] });
    }
  }, [activeFileId, unsavedChanges]);

  const saveAllFiles = useCallback(() => {
    Object.entries(unsavedChanges).forEach(([id, content]) => {
      updateFileMutation.mutate({ id, content });
    });
  }, [unsavedChanges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActiveFile]);

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const lang = detectLanguage(newFileName);
    createFileMutation.mutate({
      projectId: project.id,
      filename: newFileName.trim(),
      path: newFilePath || "/",
      content: "",
      language: lang,
    });
  };

  const groupedFiles = files.reduce<Record<string, ProjectFile[]>>((acc, file) => {
    const dir = file.path || "/";
    if (!acc[dir]) acc[dir] = [];
    acc[dir].push(file);
    return acc;
  }, {});

  const sortedDirs = Object.keys(groupedFiles).sort();

  const hasUnsaved = Object.keys(unsavedChanges).length > 0;

  return (
    <div className={`flex border rounded-lg overflow-hidden bg-background ${expanded ? "h-[85vh]" : "h-[600px]"}`} data-testid="code-workspace">
      <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0" data-testid="file-explorer">
        <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/50">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Explorer</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setShowNewFile(true)}
            data-testid="button-new-file"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto text-xs">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-[11px]">No files yet</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-[11px] h-7"
                onClick={() => setShowNewFile(true)}
                data-testid="button-create-first-file"
              >
                <Plus className="h-3 w-3 mr-1" /> New File
              </Button>
            </div>
          ) : (
            sortedDirs.map(dir => (
              <div key={dir}>
                {dir !== "/" && (
                  <div className="flex items-center gap-1 px-2 py-1 text-muted-foreground font-medium bg-muted/20">
                    <FolderOpen className="h-3 w-3" />
                    <span className="truncate">{dir}</span>
                  </div>
                )}
                {groupedFiles[dir].map(file => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer group transition-colors ${
                      activeFileId === file.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                    }`}
                    onClick={() => openFile(file.id)}
                    data-testid={`file-item-${file.id}`}
                  >
                    {getFileIcon(file.filename)}
                    <span className="truncate flex-1">{file.filename}</span>
                    {unsavedChanges[file.id] !== undefined && (
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete ${file.filename}?`)) {
                          deleteFileMutation.mutate(file.id);
                        }
                      }}
                      data-testid={`button-delete-file-${file.id}`}
                    >
                      <Trash2 className="h-2.5 w-2.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        {hasUnsaved && (
          <div className="border-t p-2">
            <Button
              size="sm"
              className="w-full h-7 text-[11px]"
              onClick={saveAllFiles}
              disabled={updateFileMutation.isPending}
              data-testid="button-save-all"
            >
              <Save className="h-3 w-3 mr-1" />
              Save All ({Object.keys(unsavedChanges).length})
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {openTabs.length > 0 && (
          <div className="flex items-center border-b bg-muted/30 overflow-x-auto" data-testid="editor-tabs">
            {openTabs.map(tabId => {
              const file = files.find(f => f.id === tabId);
              if (!file) return null;
              return (
                <div
                  key={tabId}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r transition-colors min-w-0 shrink-0 ${
                    activeFileId === tabId ? "bg-background text-foreground border-b-2 border-b-primary" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => setActiveFileId(tabId)}
                  data-testid={`tab-${tabId}`}
                >
                  {getFileIcon(file.filename)}
                  <span className="truncate max-w-[120px]">{file.filename}</span>
                  {unsavedChanges[tabId] !== undefined && (
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                  )}
                  <button
                    className="ml-1 hover:bg-muted rounded p-0.5 shrink-0"
                    onClick={(e) => closeTab(tabId, e)}
                    data-testid={`button-close-tab-${tabId}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
            <div className="flex-1" />
            {activeFileId && unsavedChanges[activeFileId] !== undefined && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] mr-1"
                onClick={saveActiveFile}
                disabled={updateFileMutation.isPending}
                data-testid="button-save-file"
              >
                {updateFileMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {activeFile ? (
            <Editor
              key={activeFileId}
              defaultValue={activeContent}
              language={detectLanguage(activeFile.filename)}
              theme="vs-dark"
              onChange={handleEditorChange}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              options={{
                fontSize: 13,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                padding: { top: 8 },
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                tabSize: 2,
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="editor-placeholder">
              <div className="text-center">
                <FileCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No file open</p>
                <p className="text-xs text-muted-foreground">
                  {files.length > 0
                    ? "Select a file from the explorer to start editing"
                    : "Create a new file to get started"
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {activeFile && (
          <div className="flex items-center justify-between px-3 py-1 border-t bg-muted/30 text-[10px] text-muted-foreground" data-testid="editor-statusbar">
            <div className="flex items-center gap-3">
              <span>{detectLanguage(activeFile.filename)}</span>
              <span>{activeFile.path === "/" ? "" : activeFile.path}{activeFile.filename}</span>
            </div>
            <div className="flex items-center gap-3">
              {unsavedChanges[activeFileId!] !== undefined && (
                <Badge variant="outline" className="text-[9px] h-4 text-orange-500 border-orange-500/30">Modified</Badge>
              )}
              <span>UTF-8</span>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showNewFile} onOpenChange={setShowNewFile}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-new-file">
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">File Name</Label>
              <Input
                placeholder="e.g., index.ts, server.py, README.md"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                autoFocus
                data-testid="input-new-filename"
              />
            </div>
            <div>
              <Label className="text-xs">Path</Label>
              <Input
                placeholder="/"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                data-testid="input-new-filepath"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use / for root, or specify a path like /src/</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewFile(false)} data-testid="button-cancel-new-file">Cancel</Button>
            <Button
              size="sm"
              onClick={handleCreateFile}
              disabled={!newFileName.trim() || createFileMutation.isPending}
              data-testid="button-confirm-new-file"
            >
              {createFileMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
