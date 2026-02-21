import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Power,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Container,
  Shield,
  Database,
  Globe,
  Clock,
  Play,
  Square,
  Network,
  MemoryStick,
  Plus,
  Terminal,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

interface VM {
  id: number;
  hostname: string;
  state: string;
  plan: string;
  cpus: number;
  memory: number;
  disk: number;
  bandwidth: number;
  ip_addresses: Array<{ address: string; type: string }>;
  os: { name: string; version: string };
  data_center: { name: string; location: string };
  created_at: string;
  firewall_group_id?: number | null;
  [key: string]: any;
}

interface DockerProject {
  name: string;
  status: string;
  config_files?: string[];
  [key: string]: any;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: Array<{ host: number; container: number; protocol: string }>;
  [key: string]: any;
}

interface FirewallRule {
  id: number;
  protocol: string;
  port: string;
  source: string;
  source_detail: string;
  action: string;
}

interface Firewall {
  id: number;
  name: string;
  is_synced: boolean;
  rules: FirewallRule[];
}

interface Backup {
  id: number;
  location: string;
  created_at: string;
}

interface Metrics {
  cpu?: Array<{ timestamp: string; value: number }>;
  memory?: Array<{ timestamp: string; value: number }>;
  disk?: Array<{ timestamp: string; read: number; write: number }>;
  network?: Array<{ timestamp: string; in: number; out: number }>;
  [key: string]: any;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatMB(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return mb + " MB";
}

function stateColor(state: string): "default" | "destructive" | "secondary" | "outline" {
  switch (state?.toLowerCase()) {
    case "running": return "default";
    case "stopped": return "destructive";
    case "starting":
    case "stopping":
    case "restarting": return "secondary";
    default: return "outline";
  }
}

function containerStateColor(state: string): "default" | "destructive" | "secondary" | "outline" {
  switch (state?.toLowerCase()) {
    case "running": return "default";
    case "exited":
    case "dead": return "destructive";
    case "restarting":
    case "created": return "secondary";
    default: return "outline";
  }
}

export default function VpsMonitoring() {
  const { toast } = useToast();
  const [selectedVmId, setSelectedVmId] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const { data: vms, isLoading: vmsLoading, error: vmsError } = useQuery<VM[]>({
    queryKey: ["/api/hostinger/vms"],
  });

  const activeVm = vms?.find((v) => v.id === selectedVmId) ?? vms?.[0] ?? null;
  const vmId = activeVm?.id;

  const { data: metrics, isLoading: metricsLoading } = useQuery<Metrics>({
    queryKey: ["/api/hostinger/vms", vmId, "metrics"],
    enabled: !!vmId,
    refetchInterval: 60000,
  });

  const { data: dockerProjects, isLoading: dockerLoading } = useQuery<DockerProject[]>({
    queryKey: ["/api/hostinger/vms", vmId, "docker"],
    enabled: !!vmId,
  });

  const { data: containers, isLoading: containersLoading, error: containersError } = useQuery<DockerContainer[]>({
    queryKey: ["/api/hostinger/vms", vmId, "docker", expandedProject, "containers"],
    queryFn: async () => {
      const res = await fetch(`/api/hostinger/vms/${vmId}/docker/${encodeURIComponent(expandedProject!)}/containers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch containers");
      return res.json();
    },
    enabled: !!vmId && !!expandedProject,
  });

  const { data: firewalls, isLoading: firewallsLoading } = useQuery<Firewall[]>({
    queryKey: ["/api/hostinger/firewalls"],
    enabled: !!vmId,
  });

  const { data: backups, isLoading: backupsLoading } = useQuery<Backup[]>({
    queryKey: ["/api/hostinger/vms", vmId, "backups"],
    enabled: !!vmId,
  });

  const powerMutation = useMutation({
    mutationFn: async ({ action }: { action: "start" | "stop" | "restart" }) => {
      await apiRequest("POST", `/api/hostinger/vms/${vmId}/${action}`);
    },
    onSuccess: (_, { action }) => {
      toast({ title: "Action sent", description: `VPS ${action} command sent successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to send power action.", variant: "destructive" });
    },
  });

  const dockerActionMutation = useMutation({
    mutationFn: async ({ project, action }: { project: string; action: "start" | "stop" | "restart" }) => {
      await apiRequest("POST", `/api/hostinger/vms/${vmId}/docker/${encodeURIComponent(project)}/${action}`);
    },
    onSuccess: (_, { project, action }) => {
      toast({ title: "Docker action sent", description: `${project}: ${action} command sent.` });
      queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms", vmId, "docker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms", vmId, "docker", expandedProject, "containers"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Docker action failed.", variant: "destructive" });
    },
  });

  const [addRuleFirewallId, setAddRuleFirewallId] = useState<number | null>(null);
  const [ruleProtocol, setRuleProtocol] = useState<string>("tcp");
  const [rulePort, setRulePort] = useState<string>("");
  const [ruleSource, setRuleSource] = useState<string>("any");
  const [ruleSourceDetail, setRuleSourceDetail] = useState<string>("");
  const [ruleAction, setRuleAction] = useState<string>("accept");

  const addRuleMutation = useMutation({
    mutationFn: async ({ firewallId, rule }: { firewallId: number; rule: { protocol: string; port: string; source: string; source_detail?: string; action: string } }) => {
      await apiRequest("POST", `/api/hostinger/firewalls/${firewallId}/rules`, rule);
    },
    onSuccess: () => {
      toast({ title: "Rule added", description: "Firewall rule created. Don't forget to sync to apply changes." });
      queryClient.invalidateQueries({ queryKey: ["/api/hostinger/firewalls"] });
      setAddRuleFirewallId(null);
      setRulePort("");
      setRuleSourceDetail("");
      setRuleProtocol("tcp");
      setRuleSource("any");
      setRuleAction("accept");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add firewall rule.", variant: "destructive" });
    },
  });

  const syncFirewallMutation = useMutation({
    mutationFn: async (firewallId: number) => {
      await apiRequest("POST", `/api/hostinger/firewalls/${firewallId}/sync`);
    },
    onSuccess: () => {
      toast({ title: "Firewall synced", description: "Rules have been pushed to the VPS." });
      queryClient.invalidateQueries({ queryKey: ["/api/hostinger/firewalls"] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message || "Failed to sync firewall.", variant: "destructive" });
    },
  });

  const lastCpu = metrics?.cpu?.length ? metrics.cpu[metrics.cpu.length - 1]?.value : null;
  const rawLastMem = metrics?.memory?.length ? metrics.memory[metrics.memory.length - 1]?.value : null;
  const lastMem = rawLastMem !== null && rawLastMem > 100 ? null : rawLastMem;

  if (vmsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (vmsError) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">VPS Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">Live server monitoring powered by Hostinger API.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center py-8">
              <Server className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Unable to connect to Hostinger</p>
              <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
                {(vmsError as any)?.message || "Check that your Hostinger API key is valid and has VPS permissions."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms"] })}
                data-testid="button-retry-hostinger"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vms || vms.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">VPS Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">Live server monitoring powered by Hostinger API.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center py-8">
              <Server className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No VPS instances found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your Hostinger account has no VPS instances.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">VPS Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">Live server monitoring powered by Hostinger API.</p>
        </div>
        <div className="flex items-center gap-2">
          {vms.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {vms.map((vm) => (
                <Button
                  key={vm.id}
                  variant={vm.id === (activeVm?.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedVmId(vm.id)}
                  data-testid={`button-select-vm-${vm.id}`}
                >
                  {vm.hostname || `VPS #${vm.id}`}
                </Button>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms"] });
              if (vmId) {
                queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms", vmId, "metrics"] });
                queryClient.invalidateQueries({ queryKey: ["/api/hostinger/vms", vmId, "docker"] });
              }
            }}
            data-testid="button-refresh-all"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {activeVm && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={stateColor(activeVm.state)} className="mt-1" data-testid="badge-vm-state">
                      {activeVm.state}
                    </Badge>
                  </div>
                  <Power className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">CPU</p>
                    <p className="text-lg font-semibold mt-1" data-testid="text-cpu-value">
                      {lastCpu !== null ? `${lastCpu.toFixed(1)}%` : `${activeVm.cpus} vCPU`}
                    </p>
                  </div>
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                </div>
                {lastCpu !== null && <Progress value={lastCpu} className="mt-2 h-1.5" />}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Memory</p>
                    <p className="text-lg font-semibold mt-1" data-testid="text-memory-value">
                      {lastMem !== null ? `${lastMem.toFixed(1)}%` : formatMB(activeVm.memory)}
                    </p>
                  </div>
                  <MemoryStick className="h-5 w-5 text-muted-foreground" />
                </div>
                {lastMem !== null && <Progress value={lastMem} className="mt-2 h-1.5" />}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Disk</p>
                    <p className="text-lg font-semibold mt-1" data-testid="text-disk-value">{formatMB(activeVm.disk)}</p>
                  </div>
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview"><Server className="h-4 w-4 mr-1.5" /> Server</TabsTrigger>
              <TabsTrigger value="docker" data-testid="tab-docker"><Container className="h-4 w-4 mr-1.5" /> Docker</TabsTrigger>
              <TabsTrigger value="firewall" data-testid="tab-firewall"><Shield className="h-4 w-4 mr-1.5" /> Firewall</TabsTrigger>
              <TabsTrigger value="backups" data-testid="tab-backups"><Database className="h-4 w-4 mr-1.5" /> Backups</TabsTrigger>
              <TabsTrigger value="commands" data-testid="tab-commands"><Terminal className="h-4 w-4 mr-1.5" /> Commands</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Server Details</CardTitle>
                    <CardDescription>{activeVm.hostname}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => powerMutation.mutate({ action: "start" })}
                      disabled={powerMutation.isPending || activeVm.state === "running"}
                      data-testid="button-vm-start"
                    >
                      <Play className="h-3.5 w-3.5 mr-1" /> Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => powerMutation.mutate({ action: "restart" })}
                      disabled={powerMutation.isPending}
                      data-testid="button-vm-restart"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restart
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => powerMutation.mutate({ action: "stop" })}
                      disabled={powerMutation.isPending || activeVm.state === "stopped"}
                      data-testid="button-vm-stop"
                    >
                      <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> IP Address</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-ip">
                        {activeVm.ip_addresses?.map((ip) => ip.address).join(", ") || "N/A"}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Server className="h-3 w-3" /> Plan</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-plan">{activeVm.plan || "N/A"}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> Specs</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-specs">
                        {activeVm.cpus} vCPU / {formatMB(activeVm.memory)} RAM / {formatMB(activeVm.disk)} Disk
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><HardDrive className="h-3 w-3" /> OS</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-os">
                        {activeVm.os?.name || "N/A"}{activeVm.os?.version ? ` ${activeVm.os.version}` : ""}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Datacenter</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-datacenter">
                        {activeVm.data_center?.name || "N/A"}{activeVm.data_center?.location ? ` (${activeVm.data_center.location})` : ""}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> Bandwidth</p>
                      <p className="text-sm font-semibold mt-1" data-testid="text-vm-bandwidth">{formatMB(activeVm.bandwidth || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {metricsLoading && (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              )}

              {metrics && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" /> Resource Usage
                    </CardTitle>
                    <CardDescription>Recent CPU and memory usage metrics from Hostinger.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium mb-2">CPU Usage</p>
                        {metrics.cpu && metrics.cpu.length > 0 ? (
                          <div className="space-y-1.5">
                            {metrics.cpu.slice(-8).map((point, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground w-20 shrink-0">
                                  {new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <Progress value={point.value} className="flex-1 h-1.5" />
                                <span className="w-12 text-right font-mono">{point.value.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No CPU data available</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Memory Usage</p>
                        {metrics.memory && metrics.memory.length > 0 && metrics.memory[0].value <= 100 ? (
                          <div className="space-y-1.5">
                            {metrics.memory.slice(-8).map((point, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground w-20 shrink-0">
                                  {new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <Progress value={point.value} className="flex-1 h-1.5" />
                                <span className="w-12 text-right font-mono">{point.value.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No memory data available</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="docker" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Container className="h-4 w-4" /> Docker Projects
                  </CardTitle>
                  <CardDescription>Manage Docker Compose projects running on your VPS.</CardDescription>
                </CardHeader>
                <CardContent>
                  {dockerLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : dockerProjects && dockerProjects.length > 0 ? (
                    <div className="space-y-3">
                      {dockerProjects.map((project) => (
                        <div key={project.name} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Container className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium" data-testid={`text-docker-project-${project.name}`}>{project.name}</span>
                              <Badge variant={containerStateColor(project.status)} data-testid={`badge-docker-status-${project.name}`}>
                                {project.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedProject(expandedProject === project.name ? null : project.name)}
                                data-testid={`button-toggle-containers-${project.name}`}
                              >
                                {expandedProject === project.name ? "Hide" : "Containers"}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => dockerActionMutation.mutate({ project: project.name, action: "start" })}
                                disabled={dockerActionMutation.isPending}
                                data-testid={`button-docker-start-${project.name}`}
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => dockerActionMutation.mutate({ project: project.name, action: "restart" })}
                                disabled={dockerActionMutation.isPending}
                                data-testid={`button-docker-restart-${project.name}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => dockerActionMutation.mutate({ project: project.name, action: "stop" })}
                                disabled={dockerActionMutation.isPending}
                                data-testid={`button-docker-stop-${project.name}`}
                              >
                                <Square className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {expandedProject === project.name && containersLoading && (
                            <div className="mt-3 border-t pt-3">
                              <Skeleton className="h-20 w-full" />
                            </div>
                          )}
                          {expandedProject === project.name && containersError && (
                            <div className="mt-3 border-t pt-3">
                              <p className="text-xs text-destructive py-2">Failed to load containers.</p>
                            </div>
                          )}
                          {expandedProject === project.name && containers && (
                            <div className="mt-3 border-t pt-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Container</TableHead>
                                    <TableHead>Image</TableHead>
                                    <TableHead>State</TableHead>
                                    <TableHead>Ports</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {containers.map((c) => (
                                    <TableRow key={c.id} data-testid={`row-container-${c.id}`}>
                                      <TableCell className="font-mono text-xs">{c.name}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{c.image}</TableCell>
                                      <TableCell>
                                        <Badge variant={containerStateColor(c.state)}>
                                          {c.state}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {c.ports?.map((p) => `${p.host}:${p.container}/${p.protocol}`).join(", ") || "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8">
                      <Container className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No Docker projects found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Docker projects will appear here once deployed on your VPS.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="firewall" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Firewall Rules
                  </CardTitle>
                  <CardDescription>View and manage your Hostinger VPS firewall configuration. Add rules and sync them to apply changes.</CardDescription>
                </CardHeader>
                <CardContent>
                  {firewallsLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : firewalls && firewalls.length > 0 ? (
                    <div className="space-y-6">
                      {firewalls.map((fw) => (
                        <div key={fw.id} className="border rounded-lg p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium" data-testid={`text-firewall-name-${fw.id}`}>{fw.name}</span>
                              <Badge variant={fw.is_synced ? "default" : "secondary"}>
                                {fw.is_synced ? "Synced" : "Pending sync"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Dialog open={addRuleFirewallId === fw.id} onOpenChange={(open) => { if (!open) setAddRuleFirewallId(null); }}>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={() => setAddRuleFirewallId(fw.id)} data-testid={`button-add-rule-${fw.id}`}>
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Add Firewall Rule</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 py-2">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <Label>Protocol</Label>
                                        <Select value={ruleProtocol} onValueChange={setRuleProtocol}>
                                          <SelectTrigger data-testid="select-rule-protocol">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="tcp">TCP</SelectItem>
                                            <SelectItem value="udp">UDP</SelectItem>
                                            <SelectItem value="icmp">ICMP</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Port</Label>
                                        <Input
                                          placeholder="e.g. 80, 443, 18789"
                                          value={rulePort}
                                          onChange={(e) => setRulePort(e.target.value)}
                                          data-testid="input-rule-port"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <Label>Source</Label>
                                        <Select value={ruleSource} onValueChange={setRuleSource}>
                                          <SelectTrigger data-testid="select-rule-source">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="any">Any (0.0.0.0/0)</SelectItem>
                                            <SelectItem value="custom">Custom IP</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Action</Label>
                                        <Select value={ruleAction} onValueChange={setRuleAction}>
                                          <SelectTrigger data-testid="select-rule-action">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="accept">Accept</SelectItem>
                                            <SelectItem value="drop">Drop</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    {ruleSource === "custom" && (
                                      <div className="space-y-2">
                                        <Label>Source IP / CIDR</Label>
                                        <Input
                                          placeholder="e.g. 192.168.1.0/24 or 10.0.0.5"
                                          value={ruleSourceDetail}
                                          onChange={(e) => setRuleSourceDetail(e.target.value)}
                                          data-testid="input-rule-source-detail"
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <DialogFooter>
                                    <DialogClose asChild>
                                      <Button variant="outline" data-testid="button-cancel-rule">Cancel</Button>
                                    </DialogClose>
                                    <Button
                                      onClick={() => {
                                        if (!rulePort.trim()) {
                                          toast({ title: "Port required", description: "Please enter a port number.", variant: "destructive" });
                                          return;
                                        }
                                        if (ruleSource === "custom" && !ruleSourceDetail.trim()) {
                                          toast({ title: "Source IP required", description: "Please enter a source IP or CIDR.", variant: "destructive" });
                                          return;
                                        }
                                        addRuleMutation.mutate({
                                          firewallId: fw.id,
                                          rule: {
                                            protocol: ruleProtocol,
                                            port: rulePort.trim(),
                                            source: ruleSource,
                                            ...(ruleSource === "custom" ? { source_detail: ruleSourceDetail.trim() } : {}),
                                            action: ruleAction,
                                          },
                                        });
                                      }}
                                      disabled={addRuleMutation.isPending}
                                      data-testid="button-submit-rule"
                                    >
                                      {addRuleMutation.isPending ? "Adding..." : "Add Rule"}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button
                                size="sm"
                                variant={fw.is_synced ? "outline" : "default"}
                                onClick={() => syncFirewallMutation.mutate(fw.id)}
                                disabled={syncFirewallMutation.isPending}
                                data-testid={`button-sync-firewall-${fw.id}`}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncFirewallMutation.isPending ? "animate-spin" : ""}`} />
                                {syncFirewallMutation.isPending ? "Syncing..." : "Sync to VPS"}
                              </Button>
                            </div>
                          </div>
                          {fw.rules && fw.rules.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Protocol</TableHead>
                                  <TableHead>Port</TableHead>
                                  <TableHead>Source</TableHead>
                                  <TableHead>Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {fw.rules.map((rule) => (
                                  <TableRow key={rule.id} data-testid={`row-firewall-rule-${rule.id}`}>
                                    <TableCell className="font-mono text-xs uppercase">{rule.protocol}</TableCell>
                                    <TableCell className="font-mono text-xs">{rule.port}</TableCell>
                                    <TableCell className="text-xs">
                                      {rule.source === "custom" ? rule.source_detail : rule.source}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={rule.action === "accept" ? "default" : "destructive"}>
                                        {rule.action}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-xs text-muted-foreground">No rules configured for this firewall.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8">
                      <Shield className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No firewalls found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create a firewall in Hostinger to manage rules here.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="backups" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" /> Backups
                  </CardTitle>
                  <CardDescription>Available VPS backups from Hostinger.</CardDescription>
                </CardHeader>
                <CardContent>
                  {backupsLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : backups && backups.length > 0 ? (
                    <div className="space-y-2">
                      {backups.map((backup) => (
                        <div
                          key={backup.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-2 border-b last:border-0"
                          data-testid={`row-backup-${backup.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Backup #{backup.id}</p>
                              <p className="text-xs text-muted-foreground">{backup.location}</p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(backup.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8">
                      <Database className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No backups available</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Backups will appear here once created on Hostinger.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="commands" className="space-y-4">
              <SshCommandsPanel activeVm={activeVm} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SshCopyButton({ text, testId }: { text: string; testId?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs gap-1 shrink-0"
      data-testid={testId || "button-copy-ssh"}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: "Copied!" });
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function SshCommandsPanel({ activeVm }: { activeVm: VM | null }) {
  const ip = activeVm?.ip_addresses?.find(a => a.type === "ipv4")?.address || activeVm?.ip_addresses?.[0]?.address || "";
  const sshPrefix = ip ? `ssh root@${ip}` : "";

  const commandGroups = [
    {
      title: "Gateway Quick Actions",
      description: "Essential commands to manage the OpenClaw gateway on your VPS.",
      commands: [
        { label: "Check gateway status", cmd: "openclaw gateway status" },
        { label: "Restart gateway", cmd: "openclaw gateway restart" },
        { label: "Probe gateway health", cmd: "openclaw gateway probe" },
        { label: "Start gateway", cmd: "openclaw gateway start" },
        { label: "Stop gateway", cmd: "openclaw gateway stop" },
      ],
    },
    {
      title: "Diagnostics",
      description: "Troubleshoot and diagnose issues.",
      commands: [
        { label: "Run doctor (auto-fix)", cmd: "openclaw doctor" },
        { label: "Check model status", cmd: "openclaw models status --json" },
        { label: "View live logs", cmd: "openclaw logs" },
        { label: "Health check", cmd: "openclaw health" },
      ],
    },
    {
      title: "Configuration",
      description: "View and modify OpenClaw settings.",
      commands: [
        { label: "List all config", cmd: "openclaw config list" },
        { label: "View config file", cmd: "cat ~/.openclaw/openclaw.json" },
        { label: "Get gateway token", cmd: "cat ~/.openclaw/openclaw.json | grep token" },
        { label: "Set bind mode", cmd: "openclaw config set gateway.bind loopback" },
      ],
    },
    {
      title: "Node Management",
      description: "Manage connected nodes/devices.",
      commands: [
        { label: "List nodes", cmd: "openclaw nodes list" },
        { label: "Approve node", cmd: "openclaw nodes approve <node-id>" },
      ],
    },
    {
      title: "Service Management",
      description: "Control the OpenClaw systemd service.",
      commands: [
        { label: "Service status", cmd: "systemctl status openclaw-gateway" },
        { label: "Restart service", cmd: "systemctl restart openclaw-gateway" },
        { label: "View service logs", cmd: "journalctl -u openclaw-gateway -f --no-pager -n 50" },
        { label: "Check port in use", cmd: "ss -tlnp | grep 18789" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {!ip && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Select a VPS above to generate SSH-ready commands with your server IP.
            </p>
          </CardContent>
        </Card>
      )}

      {commandGroups.map((group, gi) => (
        <Card key={gi}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription className="text-xs">{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.commands.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2" data-testid={`row-vps-cmd-${gi}-${ci}`}>
                <span className="text-xs text-muted-foreground w-40 shrink-0" data-testid={`text-cmd-label-${gi}-${ci}`}>{c.label}</span>
                <div className="flex-1 flex items-center gap-1 bg-muted/50 rounded-md px-3 py-1.5 font-mono text-xs border min-w-0">
                  <code className="break-all flex-1 select-all" data-testid={`code-vps-cmd-${gi}-${ci}`}>
                    {sshPrefix ? `${sshPrefix} "${c.cmd}"` : c.cmd}
                  </code>
                  <SshCopyButton text={sshPrefix ? `${sshPrefix} "${c.cmd}"` : c.cmd} testId={`button-copy-cmd-${gi}-${ci}`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {ip && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SSH Connection</CardTitle>
            <CardDescription className="text-xs">Quick access to your VPS terminal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2" data-testid="row-ssh-connect">
              <span className="text-xs text-muted-foreground w-40 shrink-0">Connect via SSH</span>
              <div className="flex-1 flex items-center gap-1 bg-muted/50 rounded-md px-3 py-1.5 font-mono text-xs border">
                <code className="break-all flex-1 select-all" data-testid="code-ssh-connect">{sshPrefix}</code>
                <SshCopyButton text={sshPrefix} testId="button-copy-ssh-connect" />
              </div>
            </div>
            <div className="flex items-center gap-2" data-testid="row-ssh-tunnel">
              <span className="text-xs text-muted-foreground w-40 shrink-0">SSH tunnel (dashboard)</span>
              <div className="flex-1 flex items-center gap-1 bg-muted/50 rounded-md px-3 py-1.5 font-mono text-xs border">
                <code className="break-all flex-1 select-all" data-testid="code-ssh-tunnel">ssh -N -L 18789:127.0.0.1:18789 root@{ip}</code>
                <SshCopyButton text={`ssh -N -L 18789:127.0.0.1:18789 root@${ip}`} testId="button-copy-ssh-tunnel" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
