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
                  <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>

                  <SelectItem value="Pacific/Midway">Midway Island (UTC-11)</SelectItem>
                  <SelectItem value="Pacific/Honolulu">Hawaii (UTC-10)</SelectItem>
                  <SelectItem value="America/Adak">Hawaii-Aleutian (UTC-10/-9)</SelectItem>
                  <SelectItem value="Pacific/Marquesas">Marquesas Islands (UTC-9:30)</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska (UTC-9/-8)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (UTC-8/-7)</SelectItem>
                  <SelectItem value="America/Phoenix">Arizona (UTC-7)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (UTC-7/-6)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (UTC-6/-5)</SelectItem>
                  <SelectItem value="America/Mexico_City">Mexico City (UTC-6/-5)</SelectItem>
                  <SelectItem value="America/Regina">Saskatchewan (UTC-6)</SelectItem>
                  <SelectItem value="America/Bogota">Bogota / Lima (UTC-5)</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (UTC-5/-4)</SelectItem>
                  <SelectItem value="America/Caracas">Caracas (UTC-4)</SelectItem>
                  <SelectItem value="America/Halifax">Atlantic Time (UTC-4/-3)</SelectItem>
                  <SelectItem value="America/Puerto_Rico">Atlantic Standard Time (UTC-4)</SelectItem>
                  <SelectItem value="America/Barbados">Barbados (UTC-4)</SelectItem>
                  <SelectItem value="America/Curacao">Curacao (UTC-4)</SelectItem>
                  <SelectItem value="America/Martinique">Martinique (UTC-4)</SelectItem>
                  <SelectItem value="America/Virgin">US Virgin Islands (UTC-4)</SelectItem>
                  <SelectItem value="America/Bermuda">Bermuda (UTC-4/-3)</SelectItem>
                  <SelectItem value="America/La_Paz">La Paz / Bolivia (UTC-4)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus / Amazon (UTC-4)</SelectItem>
                  <SelectItem value="America/St_Johns">Newfoundland (UTC-3:30/-2:30)</SelectItem>
                  <SelectItem value="America/Sao_Paulo">Sao Paulo / Brasilia (UTC-3)</SelectItem>
                  <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (UTC-3)</SelectItem>
                  <SelectItem value="America/Santiago">Santiago (UTC-4/-3)</SelectItem>
                  <SelectItem value="America/Montevideo">Montevideo (UTC-3)</SelectItem>
                  <SelectItem value="America/Guyana">Georgetown / Guyana (UTC-4)</SelectItem>
                  <SelectItem value="Atlantic/South_Georgia">South Georgia (UTC-2)</SelectItem>
                  <SelectItem value="Atlantic/Azores">Azores (UTC-1/0)</SelectItem>
                  <SelectItem value="Atlantic/Cape_Verde">Cape Verde (UTC-1)</SelectItem>

                  <SelectItem value="Europe/London">London / GMT (UTC+0/+1)</SelectItem>
                  <SelectItem value="Europe/Dublin">Dublin (UTC+0/+1)</SelectItem>
                  <SelectItem value="Europe/Lisbon">Lisbon (UTC+0/+1)</SelectItem>
                  <SelectItem value="Africa/Casablanca">Casablanca (UTC+0/+1)</SelectItem>
                  <SelectItem value="Africa/Monrovia">Monrovia (UTC+0)</SelectItem>
                  <SelectItem value="Africa/Lagos">Lagos / West Africa (UTC+1)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Amsterdam">Amsterdam (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Brussels">Brussels (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Madrid">Madrid (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Rome">Rome (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Zurich">Zurich (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Stockholm">Stockholm (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Warsaw">Warsaw (UTC+1/+2)</SelectItem>
                  <SelectItem value="Europe/Prague">Prague (UTC+1/+2)</SelectItem>
                  <SelectItem value="Africa/Cairo">Cairo (UTC+2)</SelectItem>
                  <SelectItem value="Africa/Johannesburg">Johannesburg (UTC+2)</SelectItem>
                  <SelectItem value="Europe/Athens">Athens (UTC+2/+3)</SelectItem>
                  <SelectItem value="Europe/Bucharest">Bucharest (UTC+2/+3)</SelectItem>
                  <SelectItem value="Europe/Helsinki">Helsinki (UTC+2/+3)</SelectItem>
                  <SelectItem value="Europe/Istanbul">Istanbul (UTC+3)</SelectItem>
                  <SelectItem value="Europe/Kiev">Kyiv (UTC+2/+3)</SelectItem>
                  <SelectItem value="Asia/Jerusalem">Jerusalem (UTC+2/+3)</SelectItem>
                  <SelectItem value="Asia/Beirut">Beirut (UTC+2/+3)</SelectItem>

                  <SelectItem value="Europe/Moscow">Moscow (UTC+3)</SelectItem>
                  <SelectItem value="Africa/Nairobi">Nairobi / East Africa (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Baghdad">Baghdad (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Riyadh">Riyadh / Saudi Arabia (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Kuwait">Kuwait (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Qatar">Qatar (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Tehran">Tehran (UTC+3:30/+4:30)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai / Gulf (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Muscat">Muscat (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Baku">Baku (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Tbilisi">Tbilisi (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Kabul">Kabul (UTC+4:30)</SelectItem>
                  <SelectItem value="Asia/Karachi">Karachi / Pakistan (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Tashkent">Tashkent (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Yekaterinburg">Yekaterinburg (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Mumbai / Kolkata / India (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Colombo">Colombo / Sri Lanka (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Kathmandu">Kathmandu (UTC+5:45)</SelectItem>
                  <SelectItem value="Asia/Almaty">Almaty (UTC+6)</SelectItem>
                  <SelectItem value="Asia/Dhaka">Dhaka / Bangladesh (UTC+6)</SelectItem>
                  <SelectItem value="Asia/Rangoon">Yangon / Myanmar (UTC+6:30)</SelectItem>
                  <SelectItem value="Asia/Bangkok">Bangkok (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Jakarta">Jakarta (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Ho_Chi_Minh">Ho Chi Minh City (UTC+7)</SelectItem>
                  <SelectItem value="Asia/Krasnoyarsk">Krasnoyarsk (UTC+7)</SelectItem>

                  <SelectItem value="Asia/Shanghai">Beijing / Shanghai (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Hong_Kong">Hong Kong (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Taipei">Taipei (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Kuala_Lumpur">Kuala Lumpur (UTC+8)</SelectItem>
                  <SelectItem value="Australia/Perth">Perth (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Manila">Manila (UTC+8)</SelectItem>
                  <SelectItem value="Asia/Seoul">Seoul (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Irkutsk">Irkutsk (UTC+8)</SelectItem>
                  <SelectItem value="Australia/Darwin">Darwin (UTC+9:30)</SelectItem>
                  <SelectItem value="Australia/Adelaide">Adelaide (UTC+9:30/+10:30)</SelectItem>
                  <SelectItem value="Australia/Brisbane">Brisbane (UTC+10)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (UTC+10/+11)</SelectItem>
                  <SelectItem value="Australia/Melbourne">Melbourne (UTC+10/+11)</SelectItem>
                  <SelectItem value="Australia/Hobart">Hobart (UTC+10/+11)</SelectItem>
                  <SelectItem value="Pacific/Guam">Guam (UTC+10)</SelectItem>
                  <SelectItem value="Pacific/Port_Moresby">Port Moresby (UTC+10)</SelectItem>
                  <SelectItem value="Asia/Vladivostok">Vladivostok (UTC+10)</SelectItem>
                  <SelectItem value="Pacific/Noumea">Noumea (UTC+11)</SelectItem>
                  <SelectItem value="Pacific/Guadalcanal">Solomon Islands (UTC+11)</SelectItem>
                  <SelectItem value="Asia/Magadan">Magadan (UTC+11)</SelectItem>
                  <SelectItem value="Pacific/Auckland">Auckland (UTC+12/+13)</SelectItem>
                  <SelectItem value="Pacific/Fiji">Fiji (UTC+12/+13)</SelectItem>
                  <SelectItem value="Pacific/Chatham">Chatham Islands (UTC+12:45/+13:45)</SelectItem>
                  <SelectItem value="Pacific/Tongatapu">Tonga (UTC+13)</SelectItem>
                  <SelectItem value="Pacific/Apia">Apia / Samoa (UTC+13/+14)</SelectItem>
                  <SelectItem value="Pacific/Kiritimati">Line Islands (UTC+14)</SelectItem>
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
