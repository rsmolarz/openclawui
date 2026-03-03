import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, KeyRound,
  Database, Bot, MessageSquare, Server, Cloud, Plug, Eye, EyeOff,
  Lock, Cpu, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SecretItem {
  key: string;
  category: string;
  label: string;
  usedBy: string[];
  required: boolean;
  isSet: boolean;
  maskedPreview: string | null;
}

interface InventoryData {
  inventory: SecretItem[];
  categories: Record<string, string>;
  summary: {
    total: number;
    configured: number;
    missing: number;
    requiredTotal: number;
    requiredConfigured: number;
    missingRequired: string[];
  };
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  core: Database,
  auth: Lock,
  ai: Bot,
  proxy: Sparkles,
  messaging: MessageSquare,
  infra: Server,
  replit: Cpu,
  integrations: Plug,
  cloud: Cloud,
};

const CATEGORY_COLORS: Record<string, string> = {
  core: "text-blue-500",
  auth: "text-purple-500",
  ai: "text-green-500",
  proxy: "text-yellow-500",
  messaging: "text-pink-500",
  infra: "text-orange-500",
  replit: "text-cyan-500",
  integrations: "text-indigo-500",
  cloud: "text-teal-500",
};

export default function SecretsInventory() {
  const { data, isLoading } = useQuery<InventoryData>({
    queryKey: ["/api/secrets/inventory"],
  });

  const [showPreviews, setShowPreviews] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { inventory, categories, summary } = data;
  const healthPercent = Math.round((summary.requiredConfigured / summary.requiredTotal) * 100);
  const overallPercent = Math.round((summary.configured / summary.total) * 100);

  const groupedSecrets: Record<string, SecretItem[]> = {};
  for (const item of inventory) {
    if (!groupedSecrets[item.category]) groupedSecrets[item.category] = [];
    groupedSecrets[item.category].push(item);
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-secrets-title">
            <Shield className="h-6 w-6" />
            Secrets Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all API keys, tokens, and credentials across the platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreviews(!showPreviews)}
          data-testid="button-toggle-previews"
        >
          {showPreviews ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showPreviews ? "Hide Previews" : "Show Previews"}
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card data-testid="card-health-score">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Required Secrets</span>
              <Badge variant={healthPercent === 100 ? "default" : "destructive"} className="text-xs">
                {summary.requiredConfigured}/{summary.requiredTotal}
              </Badge>
            </div>
            <Progress value={healthPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {healthPercent === 100
                ? "All required secrets are configured"
                : `${summary.requiredTotal - summary.requiredConfigured} required secret(s) missing`}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-overall-coverage">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Coverage</span>
              <Badge variant="outline" className="text-xs">
                {summary.configured}/{summary.total}
              </Badge>
            </div>
            <Progress value={overallPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {summary.configured} of {summary.total} secrets configured ({overallPercent}%)
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-missing-alerts">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              {summary.missingRequired.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {summary.missingRequired.length > 0 ? "Action Required" : "All Clear"}
              </span>
            </div>
            {summary.missingRequired.length > 0 ? (
              <div className="space-y-1">
                {summary.missingRequired.map(key => (
                  <p key={key} className="text-xs text-destructive font-mono">{key}</p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">All required secrets are in place</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {Object.entries(categories).map(([catKey, catLabel]) => {
          const items = groupedSecrets[catKey] || [];
          if (items.length === 0) return null;
          const configuredCount = items.filter(i => i.isSet).length;
          const isExpanded = expandedCategory === catKey || expandedCategory === null;
          const CatIcon = CATEGORY_ICONS[catKey] || KeyRound;
          const catColor = CATEGORY_COLORS[catKey] || "text-gray-500";

          return (
            <Card key={catKey} data-testid={`card-category-${catKey}`}>
              <button
                className="w-full text-left"
                onClick={() => setExpandedCategory(expandedCategory === catKey ? null : catKey)}
                data-testid={`button-toggle-${catKey}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CatIcon className={`h-4 w-4 ${catColor}`} />
                      {catLabel}
                    </span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {configuredCount}/{items.length} configured
                    </Badge>
                  </CardTitle>
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div
                        key={item.key}
                        className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                        data-testid={`row-secret-${item.key}`}
                      >
                        <div className="shrink-0">
                          {item.isSet ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : item.required ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.label}</span>
                            {item.required && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-red-500/30 text-red-500">
                                required
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <code className="text-[11px] text-muted-foreground font-mono">{item.key}</code>
                            {showPreviews && item.maskedPreview && (
                              <span className="text-[11px] text-muted-foreground/60 font-mono">
                                {item.maskedPreview}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right hidden sm:block">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {item.usedBy.slice(0, 3).map(u => (
                              <Badge key={u} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {u}
                              </Badge>
                            ))}
                            {item.usedBy.length > 3 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                +{item.usedBy.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}