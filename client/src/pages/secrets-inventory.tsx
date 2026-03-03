import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, KeyRound,
  Database, Bot, MessageSquare, Server, Cloud, Plug, Eye, EyeOff,
  Lock, Cpu, Sparkles, Mail, Loader2, Search, Copy, ExternalLink,
  Code2,
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

interface GmailSecret {
  service: string;
  maskedValue: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
  emailSnippet: string;
  messageId: string;
}

interface ReplitEnvData {
  totalRepls: number;
  replsWithSecrets: number;
  repls: Array<{
    id: string;
    title: string;
    slug: string;
    language: string;
    url: string;
    secretKeys: string[];
    secretCount: number;
  }>;
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

function InventoryTab() {
  const { data, isLoading } = useQuery<InventoryData>({
    queryKey: ["/api/secrets/inventory"],
  });

  const [showPreviews, setShowPreviews] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
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
    <div className="space-y-4">
      <div className="flex justify-end">
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

function GmailScanTab() {
  const { toast } = useToast();
  const [gmailSecrets, setGmailSecrets] = useState<GmailSecret[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/secrets/scan-gmail");
      return res.json();
    },
    onSuccess: (data: any) => {
      setGmailSecrets(data.secrets || []);
      toast({
        title: "Gmail scan complete",
        description: `Found ${data.found} potential secrets/credentials in your emails`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Gmail scan failed", description: err.message, variant: "destructive" });
    },
  });

  const revealMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch(`/api/secrets/gmail-secret/${messageId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to reveal secret");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.length > 0) {
        navigator.clipboard.writeText(data[0].value).then(() => {
          setCopiedId(data[0].value);
          setTimeout(() => setCopiedId(null), 3000);
          toast({ title: "Copied to clipboard", description: `${data[0].service} key copied` });
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to reveal secret", variant: "destructive" });
    },
  });

  const serviceColors: Record<string, string> = {
    OpenAI: "bg-green-500/10 text-green-600",
    Anthropic: "bg-orange-500/10 text-orange-600",
    Google: "bg-blue-500/10 text-blue-600",
    GitHub: "bg-gray-500/10 text-gray-600",
    Stripe: "bg-purple-500/10 text-purple-600",
    AWS: "bg-yellow-500/10 text-yellow-600",
    Twilio: "bg-red-500/10 text-red-600",
    Telegram: "bg-cyan-500/10 text-cyan-600",
    Unknown: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Scan your Gmail inbox for API keys, tokens, and credentials from service signup emails
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          data-testid="button-scan-gmail"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          {scanMutation.isPending ? "Scanning..." : "Scan Gmail"}
        </Button>
      </div>

      {scanMutation.isPending && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-500" />
            <p className="text-sm font-medium">Scanning your emails for API keys and credentials...</p>
            <p className="text-xs text-muted-foreground mt-1">Searching welcome emails, credential notifications, and API key confirmations</p>
          </CardContent>
        </Card>
      )}

      {gmailSecrets === null && !scanMutation.isPending && (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Scan Gmail for Secrets</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click "Scan Gmail" to search your inbox for API keys, tokens, and credentials
              from service welcome emails and notifications. Found secrets can be copied and
              added to your environment.
            </p>
          </CardContent>
        </Card>
      )}

      {gmailSecrets !== null && gmailSecrets.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium">No secrets found in recent emails</p>
            <p className="text-xs text-muted-foreground">Try searching with different keywords or check older emails</p>
          </CardContent>
        </Card>
      )}

      {gmailSecrets && gmailSecrets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Found {gmailSecrets.length} potential secret(s). Click copy to grab the full value.
          </p>
          {gmailSecrets.map((secret, i) => (
            <Card key={`${secret.messageId}-${i}`} data-testid={`card-gmail-secret-${i}`}>
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <KeyRound className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[10px] ${serviceColors[secret.service] || serviceColors.Unknown}`}>
                        {secret.service}
                      </Badge>
                      <code className="text-xs font-mono text-muted-foreground truncate">
                        {secret.maskedValue}
                      </code>
                    </div>
                    <p className="text-xs font-medium truncate">{secret.emailSubject}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate">{secret.emailFrom}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {secret.emailDate ? new Date(secret.emailDate).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => revealMutation.mutate(secret.messageId)}
                    disabled={revealMutation.isPending}
                    data-testid={`button-copy-secret-${i}`}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplitSecretsTab() {
  const { toast } = useToast();
  const { data: replitData, isLoading, refetch } = useQuery<ReplitEnvData>({
    queryKey: ["/api/secrets/replit-envs"],
    enabled: false,
  });

  const [hasTriggered, setHasTriggered] = useState(false);

  const handleFetch = () => {
    setHasTriggered(true);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            View secret names across your Replit projects (values are never exposed)
          </p>
        </div>
        <Button
          onClick={handleFetch}
          disabled={isLoading}
          data-testid="button-fetch-replit-envs"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Code2 className="h-4 w-4 mr-2" />
          )}
          {isLoading ? "Fetching..." : "Fetch Replit Secrets"}
        </Button>
      </div>

      {isLoading && (
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-cyan-500" />
            <p className="text-sm font-medium">Scanning your Replit projects...</p>
            <p className="text-xs text-muted-foreground mt-1">Checking up to 30 projects for configured secrets</p>
          </CardContent>
        </Card>
      )}

      {!hasTriggered && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Code2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Replit Secrets Scanner</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click "Fetch Replit Secrets" to see which secret names are configured across
              your Replit projects. Only names are shown, never values. Requires REPLIT_SID
              and REPLIT_USERNAME to be set.
            </p>
          </CardContent>
        </Card>
      )}

      {replitData && (
        <div className="space-y-3">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold" data-testid="text-total-repls">{replitData.totalRepls}</div>
                <p className="text-xs text-muted-foreground">Total Repls scanned</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold" data-testid="text-repls-with-secrets">{replitData.replsWithSecrets}</div>
                <p className="text-xs text-muted-foreground">Repls with secrets configured</p>
              </CardContent>
            </Card>
          </div>

          {replitData.repls.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No Repls with secrets found, or REPLIT_SID may need refreshing</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {replitData.repls.map(repl => (
                <Card key={repl.id} data-testid={`card-repl-${repl.slug}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{repl.title}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {repl.language}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {repl.secretCount} secret{repl.secretCount !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {repl.secretKeys.map(key => (
                            <code key={key} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                              {key}
                            </code>
                          ))}
                        </div>
                      </div>
                      {repl.url && (
                        <a
                          href={repl.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          data-testid={`link-repl-${repl.slug}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SecretsInventory() {
  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-secrets-title">
          <Shield className="h-6 w-6" />
          Secrets Inventory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track all API keys, tokens, and credentials across the platform
        </p>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList data-testid="tabs-secrets">
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <KeyRound className="h-4 w-4 mr-2" />
            Environment
          </TabsTrigger>
          <TabsTrigger value="gmail" data-testid="tab-gmail">
            <Mail className="h-4 w-4 mr-2" />
            Gmail Scan
          </TabsTrigger>
          <TabsTrigger value="replit" data-testid="tab-replit">
            <Code2 className="h-4 w-4 mr-2" />
            Replit Projects
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <InventoryTab />
        </TabsContent>

        <TabsContent value="gmail">
          <GmailScanTab />
        </TabsContent>

        <TabsContent value="replit">
          <ReplitSecretsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}