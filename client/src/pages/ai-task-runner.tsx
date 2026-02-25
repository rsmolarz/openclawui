import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Loader2,
  MessageSquare,
  Terminal,
  ChevronRight,
  AlertCircle,
  User,
  Wrench,
  Monitor,
  Laptop,
  Server,
  Smartphone,
  Wifi,
  WifiOff,
  Clock,
  Cpu,
  HardDrive,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";

interface AiConversation {
  id: string;
  userId: string;
  instanceId: string | null;
  title: string;
  createdAt: string;
}

interface AiMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolName: string | null;
  toolInput: string | null;
  toolOutput: string | null;
  createdAt: string;
}

function formatToolOutput(output: string): string {
  return output.replace(/\[Tool Result for \w+\]:\n?/, "");
}

interface LiveNode {
  name: string;
  id: string;
  ip: string;
  status: string;
  caps: string;
  version: string;
  platform: string;
  connectedAtMs: number;
}

interface LiveStatusData {
  nodes: LiveNode[];
  pairedCount: number;
  connectedCount: number;
  pendingCount: number;
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "win32": return <Monitor className="h-3.5 w-3.5" />;
    case "darwin": return <Laptop className="h-3.5 w-3.5" />;
    case "linux": return <Server className="h-3.5 w-3.5" />;
    default: return <Cpu className="h-3.5 w-3.5" />;
  }
}

function getPlatformLabel(platform: string) {
  switch (platform) {
    case "win32": return "Windows";
    case "darwin": return "macOS";
    case "linux": return "Linux";
    default: return platform || "Unknown";
  }
}

function formatUptime(connectedAtMs: number): string {
  if (!connectedAtMs) return "";
  const diff = Date.now() - connectedAtMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function NodePanel({ onInsertCommand, showPanel }: { onInsertCommand: (cmd: string) => void; showPanel: boolean }) {
  const { data: liveStatus, isLoading, refetch } = useQuery<LiveStatusData>({
    queryKey: ["/api/nodes/live-status"],
    refetchInterval: 15000,
  });

  if (!showPanel) return null;

  const connectedNodes = liveStatus?.nodes?.filter(n => n.status === "connected") || [];
  const disconnectedNodes = liveStatus?.nodes?.filter(n => n.status !== "connected") || [];

  return (
    <div className="w-72 border-l bg-muted/20 flex flex-col overflow-hidden" data-testid="node-panel">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Nodes</span>
          {liveStatus && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {connectedNodes.length}/{(liveStatus.nodes || []).length}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} data-testid="button-refresh-nodes">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {connectedNodes.map((node) => (
            <TooltipProvider key={node.id} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 cursor-pointer hover:bg-green-500/10 transition-colors"
                    onClick={() => onInsertCommand(`Run a command on ${node.name}`)}
                    data-testid={`node-card-${node.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      <span className="text-xs font-medium truncate flex-1">{node.name}</span>
                      {getPlatformIcon(node.platform)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      <span className="text-[10px] text-muted-foreground">{getPlatformLabel(node.platform)}</span>
                      {node.connectedAtMs > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatUptime(node.connectedAtMs)}
                        </span>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <div className="space-y-1 text-xs">
                    <p className="font-medium">{node.name}</p>
                    <p>Platform: {getPlatformLabel(node.platform)}</p>
                    <p>Version: {node.version || "unknown"}</p>
                    {node.caps && <p>Caps: {node.caps}</p>}
                    {node.ip && <p>IP: {node.ip}</p>}
                    <p className="text-muted-foreground pt-1">Click to run a command on this node</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          {disconnectedNodes.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] text-muted-foreground uppercase font-medium px-1 mb-1">Offline</p>
              {disconnectedNodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-lg border border-muted px-3 py-2 opacity-50"
                  data-testid={`node-card-offline-${node.id}`}
                >
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1">{node.name}</span>
                    {getPlatformIcon(node.platform)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && (!liveStatus?.nodes || liveStatus.nodes.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">No nodes found</p>
          )}
        </div>
      </ScrollArea>
      <div className="p-2 border-t space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase font-medium px-1 mb-1">Quick Actions</p>
        {[
          { label: "Check all nodes", cmd: "List all connected nodes and their status" },
          { label: "System health check", cmd: "Check disk, memory, and CPU on all connected nodes" },
          { label: "Fix disconnected nodes", cmd: "Which nodes are offline? Can you help me reconnect them?" },
        ].map((action) => (
          <button
            key={action.label}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => onInsertCommand(action.cmd)}
            data-testid={`quick-action-${action.label.toLowerCase().replace(/\s/g, "-")}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolOutputBlock({ toolName, output }: { toolName: string; output: string }) {
  const [expanded, setExpanded] = useState(true);
  const cleanOutput = formatToolOutput(output);

  return (
    <div className="my-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
        data-testid={`tool-output-toggle-${toolName}`}
      >
        <Terminal className="h-3.5 w-3.5" />
        <span>{toolName}</span>
        <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <pre className="px-3 pb-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-64 overflow-auto" data-testid={`tool-output-content-${toolName}`}>
          {cleanOutput}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  const isToolResult = message.content.startsWith("[Tool Result for ");

  if (isToolResult && message.toolName) {
    return <ToolOutputBlock toolName={message.toolName} output={message.content} />;
  }

  if (isToolResult) return null;

  const hasToolCall = message.toolName && message.role === "assistant";
  const cleanContent = message.content.replace(/```tool[\s\S]*?```/g, "").trim();

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`} data-testid={`message-${message.id}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
          <div className="whitespace-pre-wrap">{cleanContent}</div>
        </div>
        {hasToolCall && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span>Running: {message.toolName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiTaskRunnerPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showNodePanel, setShowNodePanel] = useState(true);
  const [streamingMessages, setStreamingMessages] = useState<Array<{role: string; content: string; toolName?: string; toolOutput?: string}>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleInsertCommand = (cmd: string) => {
    setInput(cmd);
  };

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<AiConversation[]>({
    queryKey: ["/api/ai/conversations"],
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<AiMessage[]>({
    queryKey: ["/api/ai/conversations", activeConversationId, "messages"],
    enabled: !!activeConversationId,
  });

  const createConversation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/conversations", { title: "New Conversation" });
      return res.json();
    },
    onSuccess: (conv: AiConversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      setActiveConversationId(conv.id);
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      if (activeConversationId) {
        setActiveConversationId(null);
      }
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/ai/conversations/${activeConversationId}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      setStreamingMessages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations", activeConversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
    },
    onError: () => {
      setStreamingMessages([]);
    },
  });

  const handleSend = async () => {
    if (!input.trim() || sendMessage.isPending) return;

    if (!activeConversationId) {
      const res = await apiRequest("POST", "/api/ai/conversations", { title: "New Conversation" });
      const conv = await res.json() as AiConversation;
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      setActiveConversationId(conv.id);

      const msg = input.trim();
      setInput("");
      setStreamingMessages([{ role: "user", content: msg }]);

      setTimeout(async () => {
        try {
          const msgRes = await apiRequest("POST", `/api/ai/conversations/${conv.id}/messages`, { message: msg });
          const result = await msgRes.json();
          setStreamingMessages([]);
          queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations", conv.id, "messages"] });
          queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        } catch {}
      }, 100);
      return;
    }

    const msg = input.trim();
    setInput("");
    setStreamingMessages([{ role: "user", content: msg }]);
    sendMessage.mutate(msg);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessages]);

  const allMessages = [
    ...messages.filter(m => !(m.role === "user" && m.content.startsWith("[Tool Result for "))),
    ...streamingMessages.map((m, i) => ({
      id: `streaming-${i}`,
      conversationId: activeConversationId || "",
      role: m.role,
      content: m.content,
      toolName: m.toolName || null,
      toolInput: null,
      toolOutput: m.toolOutput || null,
      createdAt: new Date().toISOString(),
    })),
  ];

  const displayMessages = messages.filter(m => {
    if (m.role === "user" && m.content.startsWith("[Tool Result for ") && m.toolName) {
      return true;
    }
    if (m.role === "user" && m.content.startsWith("[Tool Result for ")) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden" data-testid="ai-task-runner-page">
      <div className="w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-3 border-b">
          <Button
            onClick={() => createConversation.mutate()}
            disabled={createConversation.isPending}
            className="w-full"
            size="sm"
            data-testid="button-new-conversation"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConversations && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveConversationId(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="truncate flex-1">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation.mutate(conv.id);
                  }}
                  data-testid={`button-delete-conversation-${conv.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {!loadingConversations && conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col">
        {!activeConversationId && !sendMessage.isPending ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold" data-testid="text-welcome-title">AI Task Runner</h2>
              <p className="text-muted-foreground text-sm">
                Manage your VPS server and connected node computers. I can run commands on the gateway server or on any node machine through the OpenClaw gateway.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {[
                  "List connected nodes",
                  "Check OpenClaw status",
                  "Check disk space on all nodes",
                  "Check VPS system resources",
                  "What software is installed on each node?",
                  "Run a health check on all machines",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 px-3"
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    data-testid={`button-suggestion-${suggestion.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-2 flex items-center gap-2 bg-background">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {conversations.find(c => c.id === activeConversationId)?.title || "New Chat"}
              </span>
              {sendMessage.isPending && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Thinking...
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 px-4 py-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {loadingMessages && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {displayMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {streamingMessages.map((m, i) => (
                  <MessageBubble
                    key={`streaming-${i}`}
                    message={{
                      id: `streaming-${i}`,
                      conversationId: "",
                      role: m.role,
                      content: m.content,
                      toolName: m.toolName || null,
                      toolInput: null,
                      toolOutput: m.toolOutput || null,
                      createdAt: new Date().toISOString(),
                    }}
                  />
                ))}
                {sendMessage.isPending && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-muted rounded-2xl px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    </div>
                  </div>
                )}
                {sendMessage.isError && (
                  <div className="flex items-center gap-2 text-destructive text-sm px-4 py-2 bg-destructive/10 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed to send message. Please try again.</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </>
        )}

        <div className="border-t bg-background p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your VPS, nodes, run commands on remote machines..."
              disabled={sendMessage.isPending}
              className="flex-1"
              data-testid="input-message"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMessage.isPending}
              size="icon"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNodePanel(!showNodePanel)}
              className="shrink-0"
              data-testid="button-toggle-node-panel"
            >
              {showNodePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <NodePanel onInsertCommand={handleInsertCommand} showPanel={showNodePanel} />
    </div>
  );
}
