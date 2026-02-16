import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import { useState, useEffect } from "react";
import type { Setting } from "@shared/schema";

export default function SettingsGeneral() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const generalSettings = settings?.filter((s) => s.category === "general") ?? [];

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (generalSettings.length > 0) {
      const values: Record<string, string> = {};
      generalSettings.forEach((s) => {
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
      toast({ title: "Settings saved", description: "General settings have been updated." });
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
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
          General Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure your platform's core settings and defaults.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Configuration</CardTitle>
          <CardDescription>Basic settings for your OpenClaw platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="platform_name" data-testid="label-platform-name">Platform Name</Label>
              <Input
                id="platform_name"
                value={formValues["general.platform_name"] ?? ""}
                onChange={(e) => updateValue("general.platform_name", e.target.value)}
                placeholder="My Arcade"
                data-testid="input-platform-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_currency" data-testid="label-default-currency">Default Currency</Label>
              <Select
                value={formValues["general.default_currency"] ?? "USD"}
                onValueChange={(val) => updateValue("general.default_currency", val)}
              >
                <SelectTrigger data-testid="select-default-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone" data-testid="label-timezone">Timezone</Label>
              <Select
                value={formValues["general.timezone"] ?? "UTC"}
                onValueChange={(val) => updateValue("general.timezone", val)}
              >
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language" data-testid="label-language">Language</Label>
              <Select
                value={formValues["general.language"] ?? "en"}
                onValueChange={(val) => updateValue("general.language", val)}
              >
                <SelectTrigger data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support_email" data-testid="label-support-email">Support Email</Label>
            <Input
              id="support_email"
              type="email"
              value={formValues["general.support_email"] ?? ""}
              onChange={(e) => updateValue("general.support_email", e.target.value)}
              placeholder="support@openclaw.com"
              data-testid="input-support-email"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
            <div>
              <Label data-testid="label-maintenance-mode">Maintenance Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, all machines will be paused
              </p>
            </div>
            <Switch
              checked={formValues["general.maintenance_mode"] === "true"}
              onCheckedChange={(checked) =>
                updateValue("general.maintenance_mode", String(checked))
              }
              data-testid="switch-maintenance-mode"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          data-testid="button-save-general"
        >
          <Save className="h-4 w-4 mr-2" />
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
