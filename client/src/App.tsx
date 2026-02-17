import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstanceProvider } from "@/components/instance-provider";
import { InstanceSelector } from "@/components/instance-selector";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import LoginPage from "@/pages/login";
import SettingsGeneral from "@/pages/settings-general";
import SettingsNotifications from "@/pages/settings-notifications";
import SettingsMachines from "@/pages/settings-machines";
import SettingsApiKeys from "@/pages/settings-api-keys";
import SettingsAppearance from "@/pages/settings-appearance";
import SettingsVps from "@/pages/settings-vps";
import SettingsOpenclaw from "@/pages/settings-openclaw";
import SettingsIntegrations from "@/pages/settings-integrations";
import SettingsInstances from "@/pages/settings-instances";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/settings/general" component={SettingsGeneral} />
      <Route path="/settings/notifications" component={SettingsNotifications} />
      <Route path="/settings/machines" component={SettingsMachines} />
      <Route path="/settings/api-keys" component={SettingsApiKeys} />
      <Route path="/settings/appearance" component={SettingsAppearance} />
      <Route path="/settings/vps" component={SettingsVps} />
      <Route path="/settings/openclaw" component={SettingsOpenclaw} />
      <Route path="/settings/integrations" component={SettingsIntegrations} />
      <Route path="/settings/instances" component={SettingsInstances} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <InstanceProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 bg-background z-50">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <InstanceSelector />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </InstanceProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
