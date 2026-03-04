import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Megaphone, ExternalLink, Maximize2, Minimize2,
  BarChart3, Users, Calendar, MessageSquare, ThumbsUp
} from "lucide-react";
import { SiMeta } from "react-icons/si";

const SOCIAL_PANELS = [
  {
    id: "gohighlevel",
    label: "GoHighLevel",
    icon: Megaphone,
    url: "https://app.gohighlevel.com",
    description: "CRM, marketing automation, and social media management platform",
    tab: "ghl",
  },
  {
    id: "thumb-meta",
    label: "Thumb Meta",
    icon: SiMeta,
    url: "https://thumb-meta.replit.app",
    description: "Meta Ads & Thumb-stopping content creation tool",
    tab: "thumb",
  },
];

function SocialIframePanel({ panel, expanded, onToggleExpand }: {
  panel: typeof SOCIAL_PANELS[0];
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <Card className={expanded ? "col-span-full" : ""} data-testid={`card-panel-${panel.id}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {typeof panel.icon === "function" && panel.icon === SiMeta ? (
            <SiMeta className="h-4 w-4" />
          ) : (
            <panel.icon className="h-4 w-4" />
          )}
          {panel.label}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleExpand} data-testid={`button-expand-${panel.id}`}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href={panel.url} target="_blank" rel="noopener noreferrer" data-testid={`link-external-${panel.id}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{panel.description}</p>
        <div className={`rounded-md border overflow-hidden ${expanded ? "h-[75vh]" : "h-[500px]"}`}>
          <iframe
            src={panel.url}
            className="w-full h-full border-0"
            title={panel.label}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            data-testid={`iframe-${panel.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function GhlOverviewCards() {
  const stats = [
    { label: "Contacts", value: "—", icon: Users, color: "text-blue-500" },
    { label: "Campaigns", value: "—", icon: Megaphone, color: "text-emerald-500" },
    { label: "Scheduled Posts", value: "—", icon: Calendar, color: "text-amber-500" },
    { label: "Conversations", value: "—", icon: MessageSquare, color: "text-purple-500" },
    { label: "Engagement Rate", value: "—", icon: ThumbsUp, color: "text-rose-500" },
    { label: "Pipeline Value", value: "—", icon: BarChart3, color: "text-cyan-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {stats.map(stat => (
        <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
          <CardContent className="p-3 text-center">
            <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
            <p className="text-lg font-bold" data-testid={`text-stat-value-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SocialMedia() {
  const [activeTab, setActiveTab] = useState("ghl");
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-social-title">Social Media</h1>
        <p className="text-muted-foreground mt-1">Marketing automation, content creation, and social media management</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-social">
          <TabsTrigger value="ghl" data-testid="tab-ghl">
            <Megaphone className="h-4 w-4 mr-2" />
            GoHighLevel
          </TabsTrigger>
          <TabsTrigger value="thumb" data-testid="tab-thumb">
            <SiMeta className="h-4 w-4 mr-2" />
            Thumb Meta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ghl" className="mt-6 space-y-4">
          <GhlOverviewCards />
          <SocialIframePanel
            panel={SOCIAL_PANELS[0]}
            expanded={expandedPanel === "gohighlevel"}
            onToggleExpand={() => setExpandedPanel(expandedPanel === "gohighlevel" ? null : "gohighlevel")}
          />
        </TabsContent>

        <TabsContent value="thumb" className="mt-6 space-y-4">
          <Card data-testid="card-thumb-meta-info">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <SiMeta className="h-4 w-4" />
                Thumb Meta
                <Badge variant="secondary">Replit App</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Create thumb-stopping Meta ad content with AI-powered creative tools. Manage Facebook and Instagram campaigns from one place.
              </p>
            </CardContent>
          </Card>
          <SocialIframePanel
            panel={SOCIAL_PANELS[1]}
            expanded={expandedPanel === "thumb-meta"}
            onToggleExpand={() => setExpandedPanel(expandedPanel === "thumb-meta" ? null : "thumb-meta")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
