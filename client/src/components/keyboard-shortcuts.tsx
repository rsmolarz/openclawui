import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Settings,
  Bell,
  Cpu,
  KeyRound,
  Palette,
  Server,
  Cog,
  Plug,
  Layers,
  Zap,
  FileText,
  Wand2,
  Activity,
  Terminal,
  Bot,
  Shield,
  Monitor,
  Clock,
  FolderOpen,
  BarChart3,
  Store,
  Mail,
  Sparkles,
  History,
} from "lucide-react";

const allPages = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Documentation", url: "/docs", icon: FileText },
  { title: "Node Setup", url: "/node-setup", icon: Wand2 },
  { title: "Commands", url: "/commands", icon: Terminal },
  { title: "AI Task Runner", url: "/ai-tasks", icon: Bot },
  { title: "Admin", url: "/admin", icon: Shield },
  { title: "Marketplace", url: "/marketplace", icon: Store },
  { title: "Email Workflows", url: "/email-workflows", icon: Mail },
  { title: "Activity Log", url: "/activity-log", icon: History },
  { title: "General Settings", url: "/settings/general", icon: Settings },
  { title: "Notifications", url: "/settings/notifications", icon: Bell },
  { title: "Nodes", url: "/settings/machines", icon: Cpu },
  { title: "API Keys", url: "/settings/api-keys", icon: KeyRound },
  { title: "Appearance", url: "/settings/appearance", icon: Palette },
  { title: "Instances", url: "/settings/instances", icon: Layers },
  { title: "Dashboard Settings", url: "/settings/dashboard", icon: LayoutDashboard },
  { title: "System Monitor", url: "/system-monitor", icon: Monitor },
  { title: "Metrics", url: "/metrics", icon: BarChart3 },
  { title: "Automation", url: "/automation", icon: Clock },
  { title: "File Manager", url: "/files", icon: FolderOpen },
  { title: "VPS Monitoring", url: "/vps-monitor", icon: Activity },
  { title: "VPS Connection", url: "/settings/vps", icon: Server },
  { title: "OpenClaw Config", url: "/settings/openclaw", icon: Cog },
  { title: "Skills", url: "/settings/skills", icon: Zap },
  { title: "Integrations", url: "/settings/integrations", icon: Plug },
  { title: "Gemini Proxy", url: "/settings/gemini-proxy", icon: Sparkles },
];

const shortcuts = [
  { keys: "Ctrl+K", description: "Open command palette" },
  { keys: "Ctrl+N", description: "Navigate to Node Setup" },
  { keys: "Ctrl+R", description: "Refresh all data" },
  { keys: "Escape", description: "Close dialogs" },
  { keys: "?", description: "Show keyboard shortcuts" },
];

export function KeyboardShortcuts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPages = allPages.filter((page) =>
    page.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setLocation("/node-setup");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        queryClient.invalidateQueries();
        toast({
          title: "Data refreshed",
          description: "All queries have been invalidated and will refetch.",
        });
        return;
      }

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }
    },
    [setLocation, toast]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const navigateTo = (url: string) => {
    setLocation(url);
    setCommandOpen(false);
    setSearch("");
  };

  return (
    <>
      <Dialog
        open={commandOpen}
        onOpenChange={(open) => {
          setCommandOpen(open);
          if (!open) setSearch("");
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="dialog-command-palette">
          <DialogHeader>
            <DialogTitle>Command Palette</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            data-testid="input-command-search"
          />
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1 mt-2">
            {filteredPages.map((page) => (
              <button
                key={page.url}
                onClick={() => navigateTo(page.url)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left hover-elevate active-elevate-2 w-full"
                data-testid={`link-command-${page.title.toLowerCase().replace(/\s/g, "-")}`}
              >
                <page.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{page.title}</span>
              </button>
            ))}
            {filteredPages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-results">
                No pages found
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-help-shortcuts">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {shortcuts.map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between gap-4 text-sm"
                data-testid={`text-shortcut-${s.keys.toLowerCase().replace(/[+\s]/g, "-")}`}
              >
                <span className="text-muted-foreground">{s.description}</span>
                <kbd className="px-2 py-1 rounded-md bg-muted text-xs font-mono whitespace-nowrap">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
