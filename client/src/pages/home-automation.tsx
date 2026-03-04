import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Home, Lightbulb, ToggleRight, Gauge, Thermometer, Settings, Monitor, Video, Tv, Gamepad2, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const DOMAIN_ICONS: Record<string, any> = { light: Lightbulb, switch: ToggleRight, sensor: Gauge, climate: Thermometer };
const DOMAIN_LABELS: Record<string, string> = { light: "Lights", switch: "Switches", sensor: "Sensors", climate: "Climate" };

const EXTERNAL_PANELS = [
  { id: "homeassistant", label: "Home Assistant", icon: Home, url: "", port: "8123", placeholder: true, description: "Smart home control hub" },
  { id: "homebridge", label: "Homebridge", icon: Home, url: "", port: "8581", placeholder: true, description: "HomeKit bridge for non-native devices" },
  { id: "homeharmony", label: "Home Harmony", icon: Home, url: "https://home-harmony.replit.app", port: "", placeholder: false, description: "Unified smart home dashboard — Replit app" },
  { id: "companion", label: "Bitfocus Companion", icon: Gamepad2, url: "http://169.254.83.107:8000", port: "8000", placeholder: false, description: "Stream deck and button controller" },
  { id: "streamdeck", label: "Stream Deck", icon: Tv, url: "", port: "", placeholder: true, description: "Elgato Stream Deck management" },
  { id: "gostream", label: "GoStream", icon: Video, url: "http://192.168.0.108", port: "", placeholder: false, description: "GoStream video switcher control" },
  { id: "atem", label: "ATEM Mini Pro ISO", icon: Monitor, url: "http://192.168.0.226", port: "", placeholder: false, description: "Blackmagic ATEM switcher control" },
];

function IframePanel({ panel, expanded, onToggleExpand }: { panel: typeof EXTERNAL_PANELS[0]; expanded: boolean; onToggleExpand: () => void }) {
  if (panel.placeholder || !panel.url) {
    return (
      <Card className="border-dashed" data-testid={`card-panel-${panel.id}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <panel.icon className="h-4 w-4" /> {panel.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Settings className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground mb-1">{panel.description}</p>
            <Badge variant="outline" className="text-xs">Configure URL to enable</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={expanded ? "col-span-full" : ""} data-testid={`card-panel-${panel.id}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <panel.icon className="h-4 w-4" /> {panel.label}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleExpand} data-testid={`button-expand-${panel.id}`}>
            {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
            <a href={panel.url} target="_blank" rel="noopener noreferrer" data-testid={`link-external-${panel.id}`}>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`rounded-lg overflow-hidden border bg-black ${expanded ? "h-[600px]" : "h-[350px]"}`}>
          <iframe
            src={panel.url}
            className="w-full h-full border-0"
            title={panel.label}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            data-testid={`iframe-${panel.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomeAutomation() {
  const [activeTab, setActiveTab] = useState("devices");
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ configured: boolean; states: any[]; error?: string }>({ queryKey: ["/api/home-automation/states"] });

  const toggleMutation = useMutation({
    mutationFn: (entityId: string) => apiRequest("POST", "/api/home-automation/toggle", { entityId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/home-automation/states"] }),
  });

  const states = data?.states || [];
  const domains = ["light", "switch", "sensor", "climate"];
  const grouped = domains.reduce((acc: Record<string, any[]>, domain) => {
    acc[domain] = states.filter((s: any) => s.entity_id?.startsWith(domain + "."));
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-home-automation">
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
        <Home className="h-6 w-6 text-purple-500" /> Home Automation
      </h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-home-automation">
          <TabsTrigger value="devices" className="gap-1" data-testid="tab-devices">
            <Lightbulb className="h-4 w-4" /> Devices
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1" data-testid="tab-production">
            <Video className="h-4 w-4" /> Production
          </TabsTrigger>
          <TabsTrigger value="bridges" className="gap-1" data-testid="tab-bridges">
            <Settings className="h-4 w-4" /> Bridges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !data?.configured ? (
            <Card data-testid="card-setup">
              <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Setup Required</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Connect your Home Assistant instance to control smart home devices.</p>
                <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                  <p className="font-medium">Configuration Steps:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open your Home Assistant instance</li>
                    <li>Go to Profile - Long-Lived Access Tokens</li>
                    <li>Create a new token and copy it</li>
                    <li>Add <code className="bg-background px-1 rounded">HASS_TOKEN</code> as a secret</li>
                    <li>Optionally set <code className="bg-background px-1 rounded">HASS_URL</code></li>
                  </ol>
                </div>
                {data?.error && <p className="text-sm text-red-500" data-testid="text-error">Connection error: {data.error}</p>}
              </CardContent>
            </Card>
          ) : (
            <>
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
                                  <p className="text-lg font-bold" data-testid={`text-climate-temp-${entity.entity_id}`}>{entity.attributes?.current_temperature || entity.state}</p>
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
            </>
          )}
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          <p className="text-sm text-muted-foreground">Video production equipment control panels</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXTERNAL_PANELS.filter(p => ["gostream", "atem", "companion", "streamdeck"].includes(p.id)).map(panel => (
              <IframePanel
                key={panel.id}
                panel={panel}
                expanded={expandedPanel === panel.id}
                onToggleExpand={() => setExpandedPanel(expandedPanel === panel.id ? null : panel.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bridges" className="space-y-4">
          <p className="text-sm text-muted-foreground">Home automation bridges and hubs</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXTERNAL_PANELS.filter(p => ["homeassistant", "homebridge", "homeharmony"].includes(p.id)).map(panel => (
              <IframePanel
                key={panel.id}
                panel={panel}
                expanded={expandedPanel === panel.id}
                onToggleExpand={() => setExpandedPanel(expandedPanel === panel.id ? null : panel.id)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
