import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertConnectedDeviceSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Pencil, Trash2, Smartphone, Tablet, Wifi, WifiOff, Loader2 } from "lucide-react";
import type { ConnectedDevice } from "@shared/schema";

const DEVICE_TYPES = [
  { value: "iphone", label: "iPhone" },
  { value: "ipad", label: "iPad" },
  { value: "apple_watch", label: "Apple Watch" },
  { value: "mac", label: "Mac" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "connected", label: "Connected" },
  { value: "disconnected", label: "Disconnected" },
  { value: "inactive", label: "Inactive" },
];

const formSchema = insertConnectedDeviceSchema.extend({
  name: z.string().min(1, "Device name is required"),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  deviceType: "iphone",
  model: "",
  osVersion: "",
  serialNumber: "",
  status: "pending",
  ipAddress: "",
  notes: "",
};

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected": return "default";
    case "pending": return "secondary";
    case "disconnected": return "destructive";
    case "inactive": return "outline";
    default: return "secondary";
  }
}

function getDeviceIcon(type: string) {
  switch (type) {
    case "ipad":
    case "mac":
      return <Tablet className="h-5 w-5" />;
    default:
      return <Smartphone className="h-5 w-5" />;
  }
}

function getDeviceLabel(type: string) {
  return DEVICE_TYPES.find((d) => d.value === type)?.label || type;
}

export default function ConnectedDevicesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ConnectedDevice | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { data: devices = [], isLoading } = useQuery<ConnectedDevice[]>({
    queryKey: ["/api/connected-devices"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/connected-devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-devices"] });
      toast({ title: "Device registered" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to register device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormValues }) => {
      const res = await apiRequest("PATCH", `/api/connected-devices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-devices"] });
      toast({ title: "Device updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/connected-devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connected-devices"] });
      toast({ title: "Device removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove device", variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingDevice(null);
    form.reset(defaultValues);
  }

  function openCreate() {
    form.reset(defaultValues);
    setEditingDevice(null);
    setDialogOpen(true);
  }

  function openEdit(device: ConnectedDevice) {
    setEditingDevice(device);
    form.reset({
      name: device.name,
      deviceType: device.deviceType,
      model: device.model || "",
      osVersion: device.osVersion || "",
      serialNumber: device.serialNumber || "",
      status: device.status,
      ipAddress: device.ipAddress || "",
      notes: device.notes || "",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: FormValues) {
    if (editingDevice) {
      updateMutation.mutate({ id: editingDevice.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const connectedCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Connected Devices</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Register and manage your iPhones, iPads, and other Apple devices connected to OpenClaw.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-device">
          <Plus className="h-4 w-4 mr-2" />
          Add Device
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-devices">{devices.length}</p>
                <p className="text-xs text-muted-foreground">Total Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-connected-count">{connectedCount}</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <WifiOff className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-offline-count">{devices.length - connectedCount}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loading-devices" />
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1" data-testid="text-empty-state">No devices registered</h3>
            <p className="text-muted-foreground mb-4">
              Add your iPhones, iPads, and other devices to manage them from OpenClaw.
            </p>
            <Button onClick={openCreate} data-testid="button-add-device-empty">
              <Plus className="h-4 w-4 mr-2" />
              Register Your First Device
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => (
            <Card key={device.id} data-testid={`card-device-${device.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getDeviceIcon(device.deviceType)}
                    <div>
                      <CardTitle className="text-base" data-testid={`text-device-name-${device.id}`}>
                        {device.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {getDeviceLabel(device.deviceType)}
                        {device.model && ` · ${device.model}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={getStatusVariant(device.status)} data-testid={`badge-status-${device.id}`}>
                    {device.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {device.osVersion && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">OS Version</span>
                    <span data-testid={`text-os-${device.id}`}>{device.osVersion}</span>
                  </div>
                )}
                {device.ipAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Address</span>
                    <span data-testid={`text-ip-${device.id}`}>{device.ipAddress}</span>
                  </div>
                )}
                {device.serialNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serial</span>
                    <span className="font-mono text-xs" data-testid={`text-serial-${device.id}`}>{device.serialNumber}</span>
                  </div>
                )}
                {device.lastSeen && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Seen</span>
                    <span data-testid={`text-lastseen-${device.id}`}>{new Date(device.lastSeen).toLocaleString()}</span>
                  </div>
                )}
                {device.notes && (
                  <p className="text-muted-foreground text-xs pt-1" data-testid={`text-notes-${device.id}`}>{device.notes}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(device)} data-testid={`button-edit-${device.id}`}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(device.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${device.id}`}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingDevice ? "Edit Device" : "Register Device"}
            </DialogTitle>
            <DialogDescription>
              {editingDevice
                ? "Update the details for this connected device."
                : "Add a new iPhone, iPad, or other Apple device to OpenClaw."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Device Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. My iPhone 16 Pro" data-testid="input-device-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-device-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEVICE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. iPhone 16 Pro Max" data-testid="input-model" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="osVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OS Version</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. iOS 19.3" data-testid="input-os-version" {...field} value={field.value ?? ""} />
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
                      <FormLabel>IP Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 192.168.1.50" data-testid="input-ip-address" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="serialNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serial Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" data-testid="input-serial-number" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes about this device" rows={2} data-testid="input-notes" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} data-testid="button-save-device">
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingDevice ? "Save Changes" : "Register Device"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
