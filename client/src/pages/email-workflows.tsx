import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EmailWorkflow } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Plus, Trash2, Power, PowerOff, Zap, MessageSquare,
  Calendar, Database, Bell, FileText, TrendingUp, Briefcase,
  Stethoscope, Bitcoin, Scale, PiggyBank, Megaphone, Users,
  Loader2, Search, Filter
} from "lucide-react";

const CATEGORIES = [
  { value: "medical", label: "Medical", icon: Stethoscope, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "crypto", label: "Crypto/DeFi", icon: Bitcoin, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { value: "legal", label: "Legal/Patent", icon: Scale, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { value: "investment", label: "Investment", icon: PiggyBank, color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { value: "media", label: "Content/Media", icon: Megaphone, color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  { value: "collaboration", label: "Collaboration", icon: Users, color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  { value: "business", label: "Business", icon: Briefcase, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "general", label: "General", icon: Mail, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
];

const ACTION_TYPES = [
  { value: "whatsapp", label: "WhatsApp Alert", icon: MessageSquare },
  { value: "calendar", label: "Calendar Event", icon: Calendar },
  { value: "crm", label: "CRM Entry", icon: Database },
  { value: "notification", label: "Dashboard Notification", icon: Bell },
  { value: "ai-summarize", label: "AI Summarize + WhatsApp", icon: Zap },
  { value: "log", label: "Log Only", icon: FileText },
];

const WORKFLOW_TEMPLATES = [
  {
    name: "DocuSign Crypto Docs → AI Summary",
    description: "When DocuSign emails arrive with SToR Token or cryptocurrency labels, summarize with AI and send to WhatsApp",
    category: "crypto",
    triggerPattern: "from:docusign subject:(SToR Token OR cryptocurrency OR signing)",
    triggerSource: "email",
    action: "ai-summarize",
    actionConfig: { destination: "whatsapp", aiModel: "gpt-4o-mini", prompt: "Summarize this DocuSign document notification concisely" },
  },
  {
    name: "Patent Deadline Alerts",
    description: "Monitor emails from patent attorney Lauren Pogue about PCT/US2024/48502 deadlines and create calendar events + WhatsApp alerts",
    category: "legal",
    triggerPattern: "from:lauren.pogue subject:(PCT OR patent OR deadline OR filing)",
    triggerSource: "email",
    action: "calendar",
    actionConfig: { calendarAction: "create", alertVia: "whatsapp" },
  },
  {
    name: "Investment Fund Transfer Alerts",
    description: "Track fund transfer emails from Eric Lindbergh and Dragon King Capital, log as CRM entries and send WhatsApp notifications",
    category: "investment",
    triggerPattern: "from:(lindbergh OR dragon-king) subject:(transfer OR fund OR investment)",
    triggerSource: "email",
    action: "crm",
    actionConfig: { crmType: "transaction", alertVia: "whatsapp" },
  },
  {
    name: "Medical Scribe Notes Summary",
    description: "When Virtual Scribes or Physicians Angels deliver op notes, AI-summarize and alert via WhatsApp",
    category: "medical",
    triggerPattern: "from:(virtualscribes OR physiciansangels) subject:(note OR report OR operative)",
    triggerSource: "email",
    action: "ai-summarize",
    actionConfig: { destination: "whatsapp", aiModel: "gpt-4o-mini", prompt: "Summarize this medical scribe note for quick review" },
  },
  {
    name: "Meta Ads Performance Alerts",
    description: "Daily Meta/Facebook Ads performance summary emails trigger WhatsApp notification with key metrics",
    category: "media",
    triggerPattern: "from:facebookmail subject:(ad performance OR campaign OR budget OR spend)",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: { messageTemplate: "Meta Ads Alert: {subject}" },
  },
  {
    name: "Podcast Episode Published",
    description: "When podcast platform sends new episode notification, post to social media channels",
    category: "media",
    triggerPattern: "from:(podpage OR anchor OR spotify) subject:(published OR live OR episode)",
    triggerSource: "email",
    action: "notification",
    actionConfig: { channels: ["whatsapp", "dashboard"] },
  },
  {
    name: "App Store Connect Reviews",
    description: "Forward App Store Connect review notifications for MedInvest Watch & Mobile apps to WhatsApp",
    category: "business",
    triggerPattern: "from:apple subject:(review OR App Store Connect OR submission OR approved OR rejected)",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: { messageTemplate: "App Store: {subject}" },
  },
  {
    name: "Upwork Freelancer Updates",
    description: "Track updates from Upwork freelancer Sanni S. and forward to WhatsApp for quick review",
    category: "collaboration",
    triggerPattern: "from:upwork subject:(proposal OR milestone OR message OR deliverable)",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: { messageTemplate: "Upwork Update: {subject}" },
  },
  {
    name: "Cryptocurrency Transaction Alerts",
    description: "Monitor cryptocurrency exchange and wallet notification emails for transaction alerts",
    category: "crypto",
    triggerPattern: "from:(coinbase OR binance OR metamask OR wallet) subject:(transaction OR deposit OR withdrawal OR transfer)",
    triggerSource: "email",
    action: "crm",
    actionConfig: { crmType: "crypto-transaction", alertVia: "whatsapp" },
  },
  {
    name: "Clover POS Daily Summary",
    description: "Capture Clover POS daily transaction summaries and log for business tracking",
    category: "business",
    triggerPattern: "from:clover subject:(daily summary OR settlement OR transaction report)",
    triggerSource: "email",
    action: "notification",
    actionConfig: { channels: ["whatsapp", "dashboard"] },
  },
  {
    name: "Veradigm Health Tech Updates",
    description: "Track Veradigm platform notifications for health tech updates and compliance",
    category: "medical",
    triggerPattern: "from:veradigm subject:(update OR notification OR compliance OR alert)",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: { messageTemplate: "Veradigm: {subject}" },
  },
  {
    name: "LinkedIn Important Messages",
    description: "Forward LinkedIn messages from key contacts (Daniel Pellard, Debbie Balfour) to WhatsApp",
    category: "collaboration",
    triggerPattern: "from:linkedin subject:(message from OR InMail OR connection)",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: { messageTemplate: "LinkedIn: {subject}" },
  },
];

function getCategoryInfo(category: string) {
  return CATEGORIES.find(c => c.value === category) || CATEGORIES[CATEGORIES.length - 1];
}

function getActionInfo(action: string) {
  return ACTION_TYPES.find(a => a.value === action) || ACTION_TYPES[ACTION_TYPES.length - 1];
}

export default function EmailWorkflows() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "general",
    triggerPattern: "",
    triggerSource: "email",
    action: "whatsapp",
    actionConfig: {} as Record<string, unknown>,
  });

  const { data: workflows, isLoading } = useQuery<EmailWorkflow[]>({
    queryKey: ["/api/email-workflows"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/email-workflows", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-workflows"] });
      setShowCreateDialog(false);
      setShowTemplateDialog(false);
      resetForm();
      toast({ title: "Created", description: "Email workflow created successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/email-workflows/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-workflows"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/email-workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-workflows"] });
      toast({ title: "Deleted", description: "Workflow removed." });
    },
  });

  function resetForm() {
    setFormData({
      name: "",
      description: "",
      category: "general",
      triggerPattern: "",
      triggerSource: "email",
      action: "whatsapp",
      actionConfig: {},
    });
  }

  function applyTemplate(template: typeof WORKFLOW_TEMPLATES[0]) {
    setFormData({
      name: template.name,
      description: template.description,
      category: template.category,
      triggerPattern: template.triggerPattern,
      triggerSource: template.triggerSource,
      action: template.action,
      actionConfig: template.actionConfig,
    });
    setShowTemplateDialog(false);
    setShowCreateDialog(true);
  }

  function quickCreateFromTemplate(template: typeof WORKFLOW_TEMPLATES[0]) {
    createMutation.mutate({
      name: template.name,
      description: template.description,
      category: template.category,
      triggerPattern: template.triggerPattern,
      triggerSource: template.triggerSource,
      action: template.action,
      actionConfig: template.actionConfig,
    });
  }

  const filteredWorkflows = workflows?.filter(wf => {
    const matchesCategory = filterCategory === "all" || wf.category === filterCategory;
    const matchesSearch = !searchQuery || wf.name.toLowerCase().includes(searchQuery.toLowerCase()) || wf.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const enabledCount = workflows?.filter(w => w.enabled).length ?? 0;
  const totalTriggers = workflows?.reduce((sum, w) => sum + (w.triggerCount ?? 0), 0) ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Workflows</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Automated rules that detect email patterns and trigger actions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplateDialog(true)} data-testid="button-templates">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="button-create-workflow">
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-workflows">{workflows?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total Workflows</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Power className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-active-workflows">{enabledCount}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-triggers">{totalTriggers}</p>
                <p className="text-sm text-muted-foreground">Total Triggers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-workflows"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredWorkflows && filteredWorkflows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkflows.map(wf => {
            const catInfo = getCategoryInfo(wf.category);
            const actInfo = getActionInfo(wf.action);
            const CatIcon = catInfo.icon;
            const ActIcon = actInfo.icon;
            return (
              <Card key={wf.id} className={`transition-all ${!wf.enabled ? "opacity-60" : ""}`} data-testid={`card-workflow-${wf.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded ${catInfo.color}`}>
                        <CatIcon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm font-semibold truncate" data-testid={`text-workflow-name-${wf.id}`}>
                        {wf.name}
                      </CardTitle>
                    </div>
                    <Switch
                      checked={wf.enabled}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: wf.id, enabled: checked })}
                      data-testid={`switch-workflow-${wf.id}`}
                    />
                  </div>
                  <CardDescription className="text-xs line-clamp-2 mt-1" data-testid={`text-workflow-desc-${wf.id}`}>
                    {wf.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="font-mono text-xs truncate max-w-full" data-testid={`badge-trigger-${wf.id}`}>
                        {wf.triggerPattern}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-action-${wf.id}`}>
                        <ActIcon className="h-3 w-3 mr-1" />
                        {actInfo.label}
                      </Badge>
                      <Badge variant="secondary" className={`text-xs ${catInfo.color}`}>
                        {catInfo.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      <span data-testid={`text-trigger-count-${wf.id}`}>{wf.triggerCount ?? 0} triggers</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(wf.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-workflow-${wf.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg" data-testid="text-empty-state">No workflows yet</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Create email workflows to automatically detect patterns and trigger actions like WhatsApp alerts, calendar events, and CRM entries.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowTemplateDialog(true)} data-testid="button-empty-templates">
                <FileText className="h-4 w-4 mr-2" />
                Browse Templates
              </Button>
              <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="button-empty-create">
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Templates</DialogTitle>
            <DialogDescription>
              Quick-start with pre-configured email workflow rules
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {WORKFLOW_TEMPLATES.map((template, i) => {
              const catInfo = getCategoryInfo(template.category);
              const actInfo = getActionInfo(template.action);
              const CatIcon = catInfo.icon;
              const existsAlready = workflows?.some(w => w.name === template.name);
              return (
                <Card key={i} className={`cursor-pointer hover:border-primary/50 transition-colors ${existsAlready ? "opacity-50" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${catInfo.color}`}>
                        <CatIcon className="h-3.5 w-3.5" />
                      </div>
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                    </div>
                    <CardDescription className="text-xs line-clamp-2">{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {actInfo.label}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => applyTemplate(template)}
                          disabled={existsAlready}
                          data-testid={`button-customize-template-${i}`}
                        >
                          Customize
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => quickCreateFromTemplate(template)}
                          disabled={existsAlready || createMutation.isPending}
                          data-testid={`button-quick-add-template-${i}`}
                        >
                          {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Email Workflow</DialogTitle>
            <DialogDescription>
              Define a pattern to match and an action to trigger
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., DocuSign Crypto Alerts"
                data-testid="input-workflow-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">Description</Label>
              <Textarea
                id="wf-desc"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="What does this workflow do?"
                rows={2}
                data-testid="input-workflow-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={v => setFormData(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-workflow-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={formData.action} onValueChange={v => setFormData(f => ({ ...f, action: v }))}>
                  <SelectTrigger data-testid="select-workflow-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map(act => (
                      <SelectItem key={act.value} value={act.value}>{act.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-trigger">Trigger Pattern</Label>
              <Textarea
                id="wf-trigger"
                value={formData.triggerPattern}
                onChange={e => setFormData(f => ({ ...f, triggerPattern: e.target.value }))}
                placeholder="e.g., from:docusign subject:(SToR Token OR cryptocurrency)"
                rows={2}
                className="font-mono text-sm"
                data-testid="input-workflow-trigger"
              />
              <p className="text-xs text-muted-foreground">
                Use Gmail-style search operators: from:, subject:, has:, OR, AND
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name || !formData.triggerPattern || createMutation.isPending}
              data-testid="button-submit-workflow"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
