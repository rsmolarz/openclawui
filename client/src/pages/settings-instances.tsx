import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Server, Star, Key, Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import type { OpenclawInstance } from "@shared/schema";

export default function SettingsInstances() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<OpenclawInstance | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formServerUrl, setFormServerUrl] = useState("");
  const [formStatus, setFormStatus] = useState("offline");
  const [visibleKeyId, setVisibleKeyId] = useState<string | null>(null);

  const { data: instances = [], isLoading } = useQuery<OpenclawInstance[]>({
    queryKey: ["/api/instances"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; serverUrl?: string; status?: string }) => {
      const res = await apiRequest("POST", "/api/instances", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instances"] });
      toast({ title: "Instance created" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to create instance", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OpenclawInstance> }) => {
      const res = await apiRequest("PATCH", `/api/instances/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instances"] });
      toast({ title: "Instance updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update instance", variant: "destructive" });
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/instances/${id}`, { regenerateApiKey: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instances"] });
      toast({ title: "API key regenerated" });
    },
    onError: () => {
      toast({ title: "Failed to regenerate API key", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/instances/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instances"] });
      toast({ title: "Instance deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete instance", variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingInstance(null);
    setFormName("");
    setFormDescription("");
    setFormServerUrl("");
    setFormStatus("offline");
  }

  function openCreate() {
    setEditingInstance(null);
    setFormName("");
    setFormDescription("");
    setFormServerUrl("");
    setFormStatus("offline");
    setDialogOpen(true);
  }

  function openEdit(inst: OpenclawInstance) {
    setEditingInstance(inst);
    setFormName(inst.name);
    setFormDescription(inst.description ?? "");
    setFormServerUrl(inst.serverUrl ?? "");
    setFormStatus(inst.status ?? "offline");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formName.trim()) return;
    if (editingInstance) {
      updateMutation.mutate({
        id: editingInstance.id,
        data: { name: formName, description: formDescription || null, serverUrl: formServerUrl || null, status: formStatus },
      });
    } else {
      createMutation.mutate({
        name: formName,
        description: formDescription || undefined,
        serverUrl: formServerUrl || undefined,
        status: formStatus,
      });
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Instances</h1>
          <p className="text-sm text-muted-foreground">Manage your OpenClaw instances. Each instance has its own config, VPS, and Docker services.</p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-instance">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Instance
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading instances...</div>
      ) : instances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No instances configured yet. Create your first instance.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {instances.map((inst) => (
            <Card key={inst.id} data-testid={`card-instance-${inst.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted flex-shrink-0">
                    <Server className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <span data-testid={`text-instance-name-${inst.id}`}>{inst.name}</span>
                      {inst.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-0.5" />
                          Default
                        </Badge>
                      )}
                      <Badge
                        variant={inst.status === "online" ? "default" : "secondary"}
                        className="text-xs"
                        data-testid={`badge-instance-status-${inst.id}`}
                      >
                        {inst.status}
                      </Badge>
                    </CardTitle>
                    {inst.description && (
                      <CardDescription className="mt-1">{inst.description}</CardDescription>
                    )}
                    {inst.serverUrl && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-instance-host-${inst.id}`}>
                        Host: {inst.serverUrl}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(inst)}
                    data-testid={`button-edit-instance-${inst.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (inst.isDefault) {
                        toast({ title: "Cannot delete the default instance", variant: "destructive" });
                        return;
                      }
                      deleteMutation.mutate(inst.id);
                    }}
                    disabled={inst.isDefault || deleteMutation.isPending}
                    data-testid={`button-delete-instance-${inst.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Key className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground flex-shrink-0">API Key:</span>
                  {inst.apiKey ? (
                    <>
                      <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded select-all" data-testid={`text-api-key-${inst.id}`}>
                        {visibleKeyId === inst.id ? inst.apiKey : `${inst.apiKey.slice(0, 8)}${"•".repeat(24)}`}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setVisibleKeyId(visibleKeyId === inst.id ? null : inst.id)}
                        data-testid={`button-toggle-key-${inst.id}`}
                      >
                        {visibleKeyId === inst.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(inst.apiKey!);
                          toast({ title: "API key copied to clipboard" });
                        }}
                        data-testid={`button-copy-key-${inst.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => regenerateKeyMutation.mutate(inst.id)}
                        disabled={regenerateKeyMutation.isPending}
                        data-testid={`button-regenerate-key-${inst.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">Not set</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateKeyMutation.mutate(inst.id)}
                        disabled={regenerateKeyMutation.isPending}
                        data-testid={`button-generate-key-${inst.id}`}
                      >
                        Generate Key
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use this API key in your OpenClaw server's config to connect it to this dashboard.
                  Set it as the <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code> header.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingInstance ? "Edit Instance" : "New Instance"}</DialogTitle>
            <DialogDescription>
              {editingInstance ? "Update the instance details." : "Add a new OpenClaw instance to manage."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Name</Label>
              <Input
                id="inst-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Production Server"
                data-testid="input-instance-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-desc">Description</Label>
              <Textarea
                id="inst-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                data-testid="input-instance-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-host">Host / IP</Label>
              <Input
                id="inst-host"
                value={formServerUrl}
                onChange={(e) => setFormServerUrl(e.target.value)}
                placeholder="e.g. 192.168.1.100 or server.example.com"
                data-testid="input-instance-host"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-status">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger data-testid="select-instance-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-instance">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-instance"
            >
              {editingInstance ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
