import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Monitor, Trash2, Wifi, WifiOff, Copy, Info, ExternalLink, Terminal, ChevronDown, Clock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertMachineSchema } from "@shared/schema";
import type { Machine, InsertMachine } from "@shared/schema";
import { z } from "zod";

const nodeFormSchema = insertMachineSchema.extend({
  name: z.string().min(1, "Node name is required"),
});

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected": return "default";
    case "paired": return "secondary";
    case "pending": return "outline";
    case "disconnected": return "destructive";
    default: return "outline";
  }
}

const STATUS_OPTIONS = [
  { value: "connected", label: "Connected", icon: Wifi },
  { value: "pending", label: "Pending", icon: Clock },
  { value: "disconnected", label: "Disconnected", icon: WifiOff },
] as const;

function NodeCard({
  machine,
  onDelete,
  onStatusChange,
}: {
  machine: Machine;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <Card data-testid={`card-node-${machine.id}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight" data-testid={`text-node-name-${machine.id}`}>
                {machine.displayName || machine.name}
              </p>
              {machine.hostname && (
                <p className="text-xs text-muted-foreground mt-0.5">{machine.hostname}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 cursor-pointer" data-testid={`button-status-${machine.id}`}>
                  <Badge
                    variant={getStatusVariant(machine.status)}
                    data-testid={`badge-node-status-${machine.id}`}
                  >
                    {machine.status === "connected" && <Wifi className="h-3 w-3 mr-1" />}
                    {machine.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                    {machine.status === "disconnected" && <WifiOff className="h-3 w-3 mr-1" />}
                    {machine.status}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Badge>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onStatusChange(machine.id, opt.value)}
                    data-testid={`menu-status-${opt.value}-${machine.id}`}
                  >
                    <opt.icon className="h-4 w-4 mr-2" />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(machine.id)}
              data-testid={`button-delete-node-${machine.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">IP Address</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-ip-${machine.id}`}>
              {machine.ipAddress || "---"}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">OS</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-os-${machine.id}`}>
              {machine.os || "---"}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Last Seen</p>
            <p className="text-sm font-semibold truncate" data-testid={`text-last-seen-${machine.id}`}>
              {machine.lastSeen
                ? new Date(machine.lastSeen).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickStartGuide() {
  const { toast } = useToast();
  const installCmd = "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard";
  const nodeRunCmd = "openclaw node run --host <gateway-ip> --port 18789";

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Command copied to clipboard." });
  };

  return (
    <Card data-testid="card-quick-start">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold">Connect a Node in 3 Steps</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Install the CLI</strong> on the machine you want to connect:
              </p>
              <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid="text-install-cmd">{installCmd}</code>
                <Button size="icon" variant="ghost" onClick={() => copyText(installCmd)} className="shrink-0" data-testid="button-copy-install">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="rounded-md bg-muted/30 p-2 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong>Windows:</strong> Run this inside WSL2, not PowerShell. Install WSL2 first with <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">wsl --install</code> if needed.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Set your gateway token</strong> and connect the node:
              </p>
              <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid="text-export-cmd">export OPENCLAW_GATEWAY_TOKEN="your-token"</code>
                <Button size="icon" variant="ghost" onClick={() => copyText('export OPENCLAW_GATEWAY_TOKEN=""')} className="shrink-0" data-testid="button-copy-export">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono break-all" data-testid="text-node-run-cmd">{nodeRunCmd}</code>
                <Button size="icon" variant="ghost" onClick={() => copyText(nodeRunCmd)} className="shrink-0" data-testid="button-copy-node-run">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Find your token in{" "}
                <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">OpenClaw Config</Link>{" "}
                or in <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">~/.openclaw/openclaw.json</code> on the gateway machine.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <strong>Approve the node</strong> from the native dashboard — it will appear as pending automatically.
              </p>
              <p className="text-xs text-muted-foreground">
                Open your{" "}
                <Link href="/settings/openclaw" className="text-primary underline-offset-4 hover:underline">
                  native dashboard
                </Link>{" "}
                to approve pending nodes.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-dashed p-2.5 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Need the full walkthrough? Check the{" "}
            <Link href="/node-setup" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-0.5">
              Node Setup Wizard <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsMachines() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: machines, isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const form = useForm<InsertMachine>({
    resolver: zodResolver(nodeFormSchema),
    defaultValues: {
      name: "",
      hostname: "",
      ipAddress: "",
      os: "",
      location: "",
      status: "pending",
      displayName: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertMachine) => {
      await apiRequest("POST", "/api/machines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node added", description: "Node has been added to your inventory." });
      setDialogOpen(false);
      form.reset({
        name: "",
        hostname: "",
        ipAddress: "",
        os: "",
        location: "",
        status: "pending",
        displayName: "",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add node.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/machines/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status updated", description: "Node status has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/machines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node removed", description: "Node has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove node.", variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertMachine) => {
    createMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full mb-4" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Nodes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track computers connected to your OpenClaw network.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-node">
              <Plus className="h-4 w-4 mr-2" />
              Add Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Node</DialogTitle>
              <DialogDescription>Track a computer in your OpenClaw network. The actual connection is handled through the CLI.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Node Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. office-pc-01" {...field} data-testid="input-node-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Office Desktop" {...field} value={field.value ?? ""} data-testid="input-display-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IP Address (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 192.168.1.100" {...field} value={field.value ?? ""} data-testid="input-ip-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="os"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operating System</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-os">
                              <SelectValue placeholder="Select OS" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="linux">Linux</SelectItem>
                            <SelectItem value="windows">Windows (WSL2)</SelectItem>
                            <SelectItem value="macos">macOS</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-node">
                    {createMutation.isPending ? "Adding..." : "Add Node"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <QuickStartGuide />

      {machines && machines.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => (
            <NodeCard
              key={machine.id}
              machine={machine}
              onDelete={(id) => deleteMutation.mutate(id)}
              onStatusChange={(id, status) => updateMutation.mutate({ id, status })}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-sm font-semibold mb-1">No nodes tracked yet</h3>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Connect a node using the steps above, then add it here to keep track.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
