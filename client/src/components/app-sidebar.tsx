import { useLocation, Link } from "wouter";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
  LogOut,
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
  Code2,
  AudioWaveform,
  Sun,
  Heart,
  ListTodo,
  DollarSign,
  Target,
  Home,
  Users,
  BookOpen,
  Timer,
  CalendarDays,
  Smartphone,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Documentation", url: "/docs", icon: FileText },
  { title: "Node Setup", url: "/node-setup", icon: Wand2 },
  { title: "Commands", url: "/commands", icon: Terminal },
  { title: "AI Task Runner", url: "/ai-tasks", icon: Bot },
  { title: "Admin", url: "/admin", icon: Shield },
  { title: "Marketplace", url: "/marketplace", icon: Store },
  { title: "Email Workflows", url: "/email-workflows", icon: Mail },
  { title: "Activity Log", url: "/activity-log", icon: History },
  { title: "Replit Projects", url: "/replit-projects", icon: Code2 },
  { title: "Voice Chat", url: "/voice-chat", icon: AudioWaveform },
];

const settingsItems = [
  { title: "General", url: "/settings/general", icon: Settings },
  { title: "Notifications", url: "/settings/notifications", icon: Bell },
  { title: "Nodes", url: "/settings/machines", icon: Cpu },
  { title: "API Keys", url: "/settings/api-keys", icon: KeyRound },
  { title: "Secrets Inventory", url: "/secrets", icon: Shield },
  { title: "Appearance", url: "/settings/appearance", icon: Palette },
];

const infraItems = [
  { title: "Instances", url: "/settings/instances", icon: Layers },
  { title: "Dashboard", url: "/settings/dashboard", icon: LayoutDashboard },
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

const automationItems = [
  { title: "Daily Briefing", url: "/daily-briefing", icon: Sun },
  { title: "Health Tracker", url: "/health-tracker", icon: Heart },
  { title: "Todo List", url: "/todo-list", icon: ListTodo },
  { title: "Finance", url: "/finance", icon: DollarSign },
  { title: "Habits", url: "/habits", icon: Target },
  { title: "Home Automation", url: "/home-automation", icon: Home },
  { title: "Meeting Prep AI", url: "/meeting-prep", icon: Users },
  { title: "SOP Library", url: "/sop-library", icon: BookOpen },
  { title: "Focus Timer", url: "/focus-timer", icon: Timer },
  { title: "Life Calendar", url: "/life-calendar", icon: CalendarDays },
  { title: "Connected Devices", url: "/connected-devices", icon: Smartphone },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const prevCountRef = useRef<number | null>(null);

  const { data: skillStatus } = useQuery<{ count: number; names: string[]; lastCheck: string | null }>({
    queryKey: ["/api/skills/new-count"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const newSkillCount = skillStatus?.count || 0;

  useEffect(() => {
    if (prevCountRef.current !== null && newSkillCount > prevCountRef.current) {
      const diff = newSkillCount - prevCountRef.current;
      const names = skillStatus?.names?.slice(0, 3).join(", ") || "";
      toast({
        title: `${diff} new skill${diff > 1 ? "s" : ""} available`,
        description: names ? `Including: ${names}` : "Check the Marketplace to install them",
      });
    }
    prevCountRef.current = newSkillCount;
  }, [newSkillCount, skillStatus?.names, toast]);

  const badgePages = new Set(["/marketplace", "/settings/skills"]);

  const renderNavItem = (item: { title: string; url: string; icon: React.ElementType }) => {
    const isActive =
      item.url === "/"
        ? location === "/"
        : location.startsWith(item.url);
    const showBadge = badgePages.has(item.url) && newSkillCount > 0;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          data-active={isActive}
          className={isActive ? "bg-sidebar-accent" : ""}
        >
          <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.title}</span>
            {showBadge && (
              <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px] font-bold" data-testid={`badge-new-skills-${item.title.toLowerCase()}`}>
                {newSkillCount}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Cpu className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">OpenClaw</span>
              <span className="text-xs text-muted-foreground">Dashboard</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Infrastructure</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {infraItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Automation Hub</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {automationItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        {user && (
          <div className="flex items-center gap-2" data-testid="text-user-info">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {(user.displayName || user.username || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium truncate" data-testid="text-user-display-name">
                {user.displayName || user.username}
              </span>
              <span className="text-xs text-muted-foreground truncate" data-testid="text-user-username">
                @{user.username}
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={logout}
          disabled={isLoggingOut}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
        <div className="text-xs text-muted-foreground">
          OpenClaw v1.0.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
