import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Cpu, Settings, Bell, KeyRound, TrendingUp, Server, Cog,
  CheckCircle2, Circle, ChevronRight, X, Rocket, MessageSquare
} from "lucide-react";
import { useInstance } from "@/hooks/use-instance";
import { Link } from "wouter";
import type { Machine, Setting, ApiKey, VpsConnection, OpenclawConfig } from "@shared/schema";

interface OnboardingData {
  id?: string;
  steps: Record<string, boolean>;
  dismissed: boolean;
}

const ONBOARDING_STEPS = [
  {
    key: "create_instance",
    label: "Create an Instance",
    description: "Register your OpenClaw gateway server so this dashboard can manage it.",
    href: "/settings/instances",
  },
  {
    key: "setup_node",
    label: "Install OpenClaw",
    description: "Follow the setup wizard to install the CLI, configure gateway mode, and start the service.",
    href: "/node-setup",
  },
  {
    key: "configure_vps",
    label: "Connect Your VPS",
    description: "Add your server's SSH details for remote management.",
    href: "/settings/vps",
  },
  {
    key: "configure_openclaw",
    label: "Configure OpenClaw",
    description: "Set your gateway token, LLM provider, and other settings.",
    href: "/settings/openclaw",
  },
  {
    key: "add_api_key",
    label: "Create an API Key",
    description: "Generate an API key for programmatic access.",
    href: "/settings/api-keys",
  },
];

function OnboardingChecklist({ instanceId }: { instanceId: string }) {
  const { toast } = useToast();

  const { data: onboarding } = useQuery<OnboardingData>({
    queryKey: ["/api/onboarding", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding?instanceId=${instanceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!instanceId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<OnboardingData>) => {
      await apiRequest("PATCH", `/api/onboarding?instanceId=${instanceId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", instanceId] });
    },
  });

  if (!onboarding || onboarding.dismissed) return null;

  const steps = onboarding.steps ?? {};
  const completedCount = ONBOARDING_STEPS.filter((s) => steps[s.key]).length;
  const totalSteps = ONBOARDING_STEPS.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  if (completedCount === totalSteps) return null;

  const toggleStep = (key: string) => {
    const newSteps = { ...steps, [key]: !steps[key] };
    updateMutation.mutate({ steps: newSteps });
  };

  const dismissChecklist = () => {
    updateMutation.mutate({ dismissed: true });
    toast({ title: "Checklist hidden", description: "You can always redo these steps from the sidebar." });
  };

  return (
    <Card data-testid="card-onboarding">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Quick Start Guide</CardTitle>
          <Badge variant="secondary" data-testid="badge-onboarding-progress">
            {completedCount}/{totalSteps}
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={dismissChecklist}
          data-testid="button-dismiss-onboarding"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Setup Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
              data-testid="bar-onboarding-progress"
            />
          </div>
        </div>
        <div className="space-y-1">
          {ONBOARDING_STEPS.map((step) => {
            const done = !!steps[step.key];
            return (
              <div
                key={step.key}
                className="flex items-center gap-3 py-2 group"
                data-testid={`row-onboarding-${step.key}`}
              >
                <button
                  onClick={() => toggleStep(step.key)}
                  className="shrink-0"
                  data-testid={`button-toggle-step-${step.key}`}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <Link href={step.href}>
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid={`button-goto-${step.key}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function Overview() {
  const { selectedInstanceId } = useInstance();

  const { data: machines, isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
  });

  const { data: vps } = useQuery<VpsConnection | null>({
    queryKey: ["/api/vps", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/vps?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch VPS");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const { data: openclawCfg } = useQuery<OpenclawConfig | null>({
    queryKey: ["/api/openclaw/config", selectedInstanceId],
    queryFn: async () => {
      const res = await fetch(`/api/openclaw/config?instanceId=${selectedInstanceId ?? ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
    enabled: !!selectedInstanceId,
  });

  const { data: botStatus } = useQuery<{ state: string; phone: string | null }>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: 10000,
  });

  const isLoading = machinesLoading || settingsLoading || apiKeysLoading;

  const connectedNodes = machines?.filter((m) => m.status === "connected").length ?? 0;
  const totalNodes = machines?.length ?? 0;
  const activeApiKeys = apiKeys?.filter((k) => k.active).length ?? 0;
  const totalSettings = settings?.length ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your OpenClaw platform settings and connected nodes.
        </p>
      </div>

      {selectedInstanceId && (
        <OnboardingChecklist instanceId={selectedInstanceId} />
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Connected Nodes"
          value={connectedNodes}
          icon={Cpu}
          description={`${totalNodes} total nodes`}
          testId="card-stat-nodes"
        />
        <StatCard
          title="Settings Configured"
          value={totalSettings}
          icon={Settings}
          description="Across all categories"
          testId="card-stat-settings"
        />
        <StatCard
          title="Active API Keys"
          value={activeApiKeys}
          icon={KeyRound}
          description={`${apiKeys?.length ?? 0} total keys`}
          testId="card-stat-api-keys"
        />
        <StatCard
          title="VPS Status"
          value={vps?.isConnected ? "Connected" : "Disconnected"}
          icon={Server}
          description={vps?.vpsIp ?? "Not configured"}
          testId="card-stat-vps"
        />
        <StatCard
          title="WhatsApp Bot"
          value={botStatus?.state === "connected" ? "Connected" : botStatus?.state === "reconnecting" ? "Reconnecting" : botStatus?.state === "qr_ready" ? "QR Ready" : botStatus?.state === "connecting" ? "Connecting" : "Not Running"}
          icon={MessageSquare}
          description={botStatus?.state === "connected" && botStatus.phone ? `+${botStatus.phone}` : botStatus?.state === "reconnecting" ? "VPS bot is reconnecting..." : botStatus?.state === "disconnected" || !botStatus ? "Start from OpenClaw Config" : "Setting up..."}
          testId="card-stat-whatsapp"
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Node Status</CardTitle>
          </CardHeader>
          <CardContent>
            {machines && machines.length > 0 ? (
              <div className="space-y-3">
                {machines.slice(0, 5).map((machine) => (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between gap-2"
                    data-testid={`row-node-${machine.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{machine.displayName || machine.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{machine.hostname || machine.ipAddress || machine.location || "No details"}</p>
                      </div>
                    </div>
                    <Badge
                      variant={machine.status === "connected" ? "default" : machine.status === "paired" ? "secondary" : machine.status === "pending" ? "outline" : "destructive"}
                      className="shrink-0"
                      data-testid={`badge-node-status-${machine.id}`}
                    >
                      {machine.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Cpu className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No nodes registered yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { icon: Settings, label: "General Settings", desc: "Configure platform defaults", href: "/settings/general" },
                { icon: Bell, label: "Notifications", desc: "Manage alert preferences", href: "/settings/notifications" },
                { icon: Cpu, label: "Node Management", desc: "Register or manage nodes", href: "/settings/machines" },
                { icon: KeyRound, label: "API Configuration", desc: "Manage API access keys", href: "/settings/api-keys" },
                { icon: Server, label: "VPS Connection", desc: "Manage server connection", href: "/settings/vps" },
                { icon: Cog, label: "OpenClaw Config", desc: "Gateway, LLM, and nodes", href: "/settings/openclaw" },
                { icon: MessageSquare, label: "WhatsApp Bot", desc: "Set up and manage AI bot", href: "/settings/openclaw" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`link-quick-action-${action.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
