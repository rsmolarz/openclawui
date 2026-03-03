import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Home, Lightbulb, ToggleRight, Gauge, Thermometer, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const DOMAIN_ICONS: Record<string, any> = { light: Lightbulb, switch: ToggleRight, sensor: Gauge, climate: Thermometer };
const DOMAIN_LABELS: Record<string, string> = { light: "Lights", switch: "Switches", sensor: "Sensors", climate: "Climate" };

export default function HomeAutomation() {
  const { data, isLoading } = useQuery<{ configured: boolean; states: any[]; error?: string }>({ queryKey: ["/api/home-automation/states"] });

  const toggleMutation = useMutation({
    mutationFn: (entityId: string) => apiRequest("POST", "/api/home-automation/toggle", { entityId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/home-automation/states"] }),
  });

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!data?.configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="page-home-automation">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Home className="h-6 w-6 text-purple-500" /> Home Automation
        </h1>
        <Card data-testid="card-setup">
          <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Setup Required</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Connect your Home Assistant instance to control smart home devices.</p>
            <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
              <p className="font-medium">Configuration Steps:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open your Home Assistant instance</li>
                <li>Go to Profile → Long-Lived Access Tokens</li>
                <li>Create a new token and copy it</li>
                <li>Add <code className="bg-background px-1 rounded">HASS_TOKEN</code> as a secret in this project</li>
                <li>Optionally set <code className="bg-background px-1 rounded">HASS_URL</code> (defaults to http://homeassistant.local:8123)</li>
              </ol>
            </div>
            {data?.error && <p className="text-sm text-red-500" data-testid="text-error">Connection error: {data.error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const states = data.states || [];
  const domains = ["light", "switch", "sensor", "climate"];
  const grouped = domains.reduce((acc: Record<string, any[]>, domain) => {
    acc[domain] = states.filter((s: any) => s.entity_id?.startsWith(domain + "."));
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-home-automation">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Home className="h-6 w-6 text-purple-500" /> Home Automation
      </h1>
      <p className="text-sm text-muted-foreground" data-testid="text-device-count">{states.length} devices found</p>

      {domains.map(domain => {
        const items = grouped[domain];
        if (!items?.length) return null;
        const Icon = DOMAIN_ICONS[domain] || Gauge;
        return (
          <div key={domain}>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3" data-testid={`text-domain-${domain}`}>
              <Icon className="h-5 w-5" /> {DOMAIN_LABELS[domain]} ({items.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((entity: any) => {
                const name = entity.attributes?.friendly_name || entity.entity_id;
                const isToggleable = domain === "light" || domain === "switch";
                const isOn = entity.state === "on";
                return (
                  <Card key={entity.entity_id} data-testid={`device-${entity.entity_id}`}>
                    <CardContent className="pt-4 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" data-testid={`text-device-name-${entity.entity_id}`}>{name}</p>
                        {domain === "sensor" ? (
                          <p className="text-lg font-bold" data-testid={`text-sensor-value-${entity.entity_id}`}>{entity.state} {entity.attributes?.unit_of_measurement || ""}</p>
                        ) : domain === "climate" ? (
                          <p className="text-lg font-bold" data-testid={`text-climate-temp-${entity.entity_id}`}>{entity.attributes?.current_temperature || entity.state}°</p>
                        ) : (
                          <Badge variant={isOn ? "default" : "secondary"} className="text-xs mt-1">{entity.state}</Badge>
                        )}
                      </div>
                      {isToggleable && (
                        <Switch checked={isOn} onCheckedChange={() => toggleMutation.mutate(entity.entity_id)} disabled={toggleMutation.isPending} data-testid={`toggle-${entity.entity_id}`} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
