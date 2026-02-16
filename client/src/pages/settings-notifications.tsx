import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Mail, Smartphone, Monitor } from "lucide-react";
import { useState, useEffect } from "react";
import type { Setting } from "@shared/schema";

function NotificationRow({
  icon: Icon,
  label,
  description,
  switchKey,
  checked,
  onToggle,
  testIdPrefix,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  switchKey: string;
  checked: boolean;
  onToggle: (key: string, value: boolean) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <Label data-testid={`label-${testIdPrefix}`}>{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(val) => onToggle(switchKey, val)}
        data-testid={`switch-${testIdPrefix}`}
      />
    </div>
  );
}

export default function SettingsNotifications() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const notifSettings = settings?.filter((s) => s.category === "notifications") ?? [];

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (notifSettings.length > 0) {
      const values: Record<string, string> = {};
      notifSettings.forEach((s) => {
        values[s.key] = s.value;
      });
      setFormValues(values);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (updates: { key: string; value: string }[]) => {
      await apiRequest("PATCH", "/api/settings/bulk", { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Notification preferences updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const updates = Object.entries(formValues).map(([key, value]) => ({ key, value }));
    mutation.mutate(updates);
  };

  const updateValue = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleValue = (key: string, value: boolean) => {
    updateValue(key, String(value));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Notification Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose how and when you receive alerts and notifications.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>Select which notification channels are active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NotificationRow
            icon={Mail}
            label="Email Notifications"
            description="Receive alerts via email"
            switchKey="notifications.email_enabled"
            checked={formValues["notifications.email_enabled"] === "true"}
            onToggle={toggleValue}
            testIdPrefix="email-notifications"
          />
          <NotificationRow
            icon={Smartphone}
            label="Push Notifications"
            description="Receive mobile push alerts"
            switchKey="notifications.push_enabled"
            checked={formValues["notifications.push_enabled"] === "true"}
            onToggle={toggleValue}
            testIdPrefix="push-notifications"
          />
          <NotificationRow
            icon={Monitor}
            label="In-App Notifications"
            description="See alerts in the dashboard"
            switchKey="notifications.inapp_enabled"
            checked={formValues["notifications.inapp_enabled"] === "true"}
            onToggle={toggleValue}
            testIdPrefix="inapp-notifications"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alert Types</CardTitle>
          <CardDescription>Configure which events trigger notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "notifications.machine_offline", label: "Machine Goes Offline", desc: "Alert when a machine stops responding" },
            { key: "notifications.low_stock", label: "Low Prize Stock", desc: "Alert when prizes are running low" },
            { key: "notifications.revenue_milestone", label: "Revenue Milestones", desc: "Celebrate revenue achievements" },
            { key: "notifications.maintenance_due", label: "Maintenance Due", desc: "Reminder for scheduled maintenance" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
            >
              <div className="min-w-0">
                <Label data-testid={`label-${item.key}`}>{item.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <Switch
                checked={formValues[item.key] === "true"}
                onCheckedChange={(val) => toggleValue(item.key, val)}
                data-testid={`switch-${item.key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digest Frequency</CardTitle>
          <CardDescription>How often to receive summary notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Select
              value={formValues["notifications.digest_frequency"] ?? "daily"}
              onValueChange={(val) => updateValue("notifications.digest_frequency", val)}
            >
              <SelectTrigger data-testid="select-digest-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Real-time</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          data-testid="button-save-notifications"
        >
          <Save className="h-4 w-4 mr-2" />
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
