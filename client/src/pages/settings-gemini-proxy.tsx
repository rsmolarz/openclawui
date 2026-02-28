import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sparkles, CheckCircle2, XCircle, Loader2, Play, RefreshCw, Copy, Shield, Zap, Globe, Server } from "lucide-react";

interface GeminiProxySettings {
  upstream: "developer" | "vertex";
  allowedModels: string[];
  maxOutputTokens: number;
  rpmLimit: number;
  timeoutMs: number;
}

interface GeminiProxyStatus {
  settings: GeminiProxySettings;
  env: {
    hasGeminiKey: boolean;
    hasVertexProject: boolean;
    hasADCFile: boolean;
    hasServiceAccountJson: boolean;
    hasProxyKey: boolean;
  };
}

export default function SettingsGeminiProxy() {
  const { toast } = useToast();
  const [modelsInput, setModelsInput] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const { data: status, isLoading } = useQuery<GeminiProxyStatus>({
    queryKey: ["/api/gemini-proxy/settings"],
    refetchInterval: 30000,
  });

  const { data: health } = useQuery<any>({
    queryKey: ["/api/gemini-proxy/health"],
    refetchInterval: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: Partial<GeminiProxySettings>) => {
      const res = await apiRequest("POST", "/api/gemini-proxy/settings", settings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemini-proxy/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gemini-proxy/health"] });
      toast({ title: "Settings saved", description: "Gemini proxy settings updated." });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gemini-proxy/test", {});
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) {
        toast({ title: "Test passed", description: "Gemini proxy is working correctly." });
      } else {
        toast({ title: "Test failed", description: data.error || `Status: ${data.status}`, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      setTestResult({ ok: false, error: e.message });
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    },
  });

  const settings = status?.settings;
  const env = status?.env;

  const handleUpstreamChange = (value: string) => {
    saveMutation.mutate({ upstream: value as "developer" | "vertex" });
  };

  const handleModelsUpdate = () => {
    const models = modelsInput.split(",").map(s => s.trim()).filter(Boolean);
    if (models.length > 0) {
      saveMutation.mutate({ allowedModels: models });
      setModelsInput("");
    }
  };

  const copyProxyUrl = () => {
    const baseUrl = window.location.origin;
    navigator.clipboard.writeText(`${baseUrl}/api/gemini-proxy/v1`);
    toast({ title: "Copied", description: "Proxy base URL copied to clipboard." });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Sparkles className="h-6 w-6" />
            Gemini Anti-Gravity Proxy
          </h1>
          <p className="text-muted-foreground mt-1">
            OpenAI-compatible proxy for Google Gemini models with rate limiting and cost controls.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/gemini-proxy/settings"] });
              queryClient.invalidateQueries({ queryKey: ["/api/gemini-proxy/health"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            data-testid="button-test"
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Upstream</span>
                  </div>
                  <Badge variant={settings?.upstream === "developer" ? "default" : "secondary"} data-testid="badge-upstream">
                    {settings?.upstream || "developer"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Credentials</span>
                  </div>
                  <div className="flex gap-1">
                    {env?.hasGeminiKey ? (
                      <Badge variant="default" className="bg-green-600" data-testid="badge-gemini-key">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        API Key
                      </Badge>
                    ) : (
                      <Badge variant="destructive" data-testid="badge-gemini-key-missing">
                        <XCircle className="h-3 w-3 mr-1" />
                        No Key
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Rate Limit</span>
                  </div>
                  <Badge variant="outline" data-testid="badge-rpm">
                    {settings?.rpmLimit || 30} RPM
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Proxy Configuration
              </CardTitle>
              <CardDescription>
                Configure the Gemini proxy upstream, model allowlist, and cost controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Upstream Mode</Label>
                  <Select
                    value={settings?.upstream || "developer"}
                    onValueChange={handleUpstreamChange}
                  >
                    <SelectTrigger data-testid="select-upstream">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="developer">Developer (Gemini API Key)</SelectItem>
                      <SelectItem value="vertex">Vertex AI (Service Account)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Developer mode uses your Gemini API key. Vertex mode uses Google Cloud service account auth.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Max Output Tokens</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.maxOutputTokens || 4096}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0) saveMutation.mutate({ maxOutputTokens: val });
                    }}
                    data-testid="input-max-tokens"
                  />
                  <p className="text-xs text-muted-foreground">
                    Clamps max_tokens on all requests to control cost per call.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>RPM Limit</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.rpmLimit || 30}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0) saveMutation.mutate({ rpmLimit: val });
                    }}
                    data-testid="input-rpm-limit"
                  />
                  <p className="text-xs text-muted-foreground">
                    Max requests per minute to prevent exceeding upstream quotas.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Timeout (ms)</Label>
                  <Input
                    type="number"
                    defaultValue={settings?.timeoutMs || 90000}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0) saveMutation.mutate({ timeoutMs: val });
                    }}
                    data-testid="input-timeout"
                  />
                  <p className="text-xs text-muted-foreground">
                    Upstream request timeout to prevent hung sessions.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Allowed Models</Label>
                <div className="flex flex-wrap gap-2" data-testid="list-allowed-models">
                  {settings?.allowedModels?.map((model) => (
                    <Badge key={model} variant="secondary" className="text-xs">
                      {model}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() => {
                          const updated = settings.allowedModels.filter(m => m !== model);
                          saveMutation.mutate({ allowedModels: updated });
                        }}
                        data-testid={`button-remove-model-${model}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add models (comma-separated, e.g. gemini-2.5-pro,gemini-2.0-flash)"
                    value={modelsInput}
                    onChange={(e) => setModelsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleModelsUpdate();
                    }}
                    data-testid="input-add-models"
                  />
                  <Button onClick={handleModelsUpdate} variant="outline" data-testid="button-add-models">
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connection Details</CardTitle>
              <CardDescription>
                Use these details to connect OpenClaw or other clients to the Gemini proxy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Proxy Base URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/api/gemini-proxy/v1`}
                    className="font-mono text-sm"
                    data-testid="input-proxy-url"
                  />
                  <Button variant="outline" size="icon" onClick={copyProxyUrl} data-testid="button-copy-url">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Send requests with header: <code className="bg-muted px-1 py-0.5 rounded text-xs">Authorization: Bearer GEMINI_PROXY_API_KEY</code>
                </p>
                <div className="flex items-center gap-2">
                  {env?.hasProxyKey ? (
                    <Badge variant="default" className="bg-green-600" data-testid="badge-proxy-key">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Proxy API Key Set
                    </Badge>
                  ) : (
                    <Badge variant="destructive" data-testid="badge-proxy-key-missing">
                      <XCircle className="h-3 w-3 mr-1" />
                      No Proxy Key — set GEMINI_PROXY_API_KEY in secrets
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>OpenClaw Config Snippet</Label>
                <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap" data-testid="text-config-snippet">{`models.providers.gemini:
  baseUrl: "${window.location.origin}/api/gemini-proxy/v1"
  apiKey: "$GEMINI_PROXY_API_KEY"
  api: "openai-completions"
  models:
${(settings?.allowedModels || []).map(m => `    - { id: "${m}", name: "${m}" }`).join("\n")}`}</pre>
              </div>

              <div className="space-y-2">
                <Label>Environment Status</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    {env?.hasGeminiKey ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                    <span>GEMINI_API_KEY</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {env?.hasProxyKey ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                    <span>GEMINI_PROXY_API_KEY</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {env?.hasVertexProject ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <span>GOOGLE_CLOUD_PROJECT</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {env?.hasServiceAccountJson ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <span>GCP_SERVICE_ACCOUNT_JSON</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {testResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  Test Result
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto" data-testid="text-test-result">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
