import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Settings,
  Bell,
  Cpu,
  KeyRound,
  Palette,
  Server,
  Cog,
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

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
];

const settingsItems = [
  { title: "General", url: "/settings/general", icon: Settings },
  { title: "Notifications", url: "/settings/notifications", icon: Bell },
  { title: "Machines", url: "/settings/machines", icon: Cpu },
  { title: "API Keys", url: "/settings/api-keys", icon: KeyRound },
  { title: "Appearance", url: "/settings/appearance", icon: Palette },
];

const infraItems = [
  { title: "VPS Connection", url: "/settings/vps", icon: Server },
  { title: "OpenClaw Config", url: "/settings/openclaw", icon: Cog },
];

export function AppSidebar() {
  const [location] = useLocation();

  const renderNavItem = (item: { title: string; url: string; icon: React.ElementType }) => {
    const isActive =
      item.url === "/"
        ? location === "/"
        : location.startsWith(item.url);
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          data-active={isActive}
          className={isActive ? "bg-sidebar-accent" : ""}
        >
          <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
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
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground">
          OpenClaw v1.0.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
