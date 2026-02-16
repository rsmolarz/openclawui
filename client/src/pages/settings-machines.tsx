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
import { Plus, Monitor, Trash2, Wifi, WifiOff, Clock, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertMachineSchema } from "@shared/schema";
import type { Machine, InsertMachine } from "@shared/schema";
import { z } from "zod";

const nodeFormSchema = insertMachineSchema.extend({
  name: z.string().min(1, "Node name is required"),
});

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected": return "default";
    case "paired": return "secondary";
    case "pending": return "outline";
    case "disconnected": return "destructive";
    default: return "outline";
  }
}

function NodeCard({
  machine,
  onDelete,
  onCopyCode,
}: {
  machine: Machine;
  onDelete: (id: string) => void;
  onCopyCode: (code: string) => void;
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
            <Badge
              variant={getStatusVariant(machine.status)}
              data-testid={`badge-node-status-${machine.id}`}
            >
              {machine.status === "connected" && <Wifi className="h-3 w-3 mr-1" />}
              {machine.status === "disconnected" && <WifiOff className="h-3 w-3 mr-1" />}
              {machine.status}
            </Badge>
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

        {machine.pairingCode && machine.status === "pending" && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed p-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Pairing Code:</span>
              <code className="text-sm font-mono font-bold tracking-wider" data-testid={`text-pairing-code-${machine.id}`}>
                {machine.pairingCode}
              </code>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onCopyCode(machine.pairingCode!)}
              data-testid={`button-copy-code-${machine.id}`}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
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
      pairingCode: generatePairingCode(),
      displayName: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertMachine) => {
      await apiRequest("POST", "/api/machines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node registered", description: "New node has been registered with a pairing code." });
      setDialogOpen(false);
      form.reset({
        name: "",
        hostname: "",
        ipAddress: "",
        os: "",
        location: "",
        status: "pending",
        pairingCode: generatePairingCode(),
        displayName: "",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to register node.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/machines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Node removed", description: "Node has been deregistered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove node.", variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertMachine) => {
    createMutation.mutate(data);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Pairing code copied to clipboard." });
  };

  const handleRegeneratePairingCode = () => {
    form.setValue("pairingCode", generatePairingCode());
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
            Node Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Register and manage computers connected to your OpenClaw network.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-node">
              <Plus className="h-4 w-4 mr-2" />
              Register Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Node</DialogTitle>
              <DialogDescription>Add a new computer to the OpenClaw network. Use the pairing code on the device to complete setup.</DialogDescription>
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
                        <Input placeholder="e.g. John's Workstation" {...field} value={field.value ?? ""} data-testid="input-display-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hostname (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. node-01.local" {...field} value={field.value ?? ""} data-testid="input-hostname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                            <SelectItem value="windows">Windows</SelectItem>
                            <SelectItem value="macos">macOS</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Server Room A" {...field} value={field.value ?? ""} data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <FormLabel>Pairing Code</FormLabel>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2">
                      <code className="text-lg font-mono font-bold tracking-widest" data-testid="text-generated-pairing-code">
                        {form.watch("pairingCode")}
                      </code>
                    </div>
                    <Button type="button" size="icon" variant="outline" onClick={handleRegeneratePairingCode} data-testid="button-regenerate-code">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Enter this code on the device to pair it with this node.</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-node">
                    {createMutation.isPending ? "Registering..." : "Register Node"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {machines && machines.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => (
            <NodeCard
              key={machine.id}
              machine={machine}
              onDelete={(id) => deleteMutation.mutate(id)}
              onCopyCode={handleCopyCode}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-sm font-semibold mb-1">No nodes registered</h3>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Register your first node to connect a computer to the OpenClaw network.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
