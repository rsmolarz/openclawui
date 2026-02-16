import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import SettingsGeneral from "@/pages/settings-general";
import SettingsNotifications from "@/pages/settings-notifications";
import SettingsMachines from "@/pages/settings-machines";
import SettingsApiKeys from "@/pages/settings-api-keys";
import SettingsAppearance from "@/pages/settings-appearance";
import SettingsVps from "@/pages/settings-vps";
import SettingsOpenclaw from "@/pages/settings-openclaw";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 bg-background z-50">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
