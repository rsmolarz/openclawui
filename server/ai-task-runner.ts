import { storage } from "./storage";
import { executeRawSSHCommand, buildSSHConfigFromVps } from "./ssh";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const VPS_TOOL_COMMANDS: Record<string, { description: string; command: string }> = {
  check_status: {
    description: "Check if OpenClaw gateway and node processes are running on the VPS",
    command: "ps aux | grep -E 'openclaw' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'",
  },
  check_firewall: {
    description: "Check firewall (UFW) status and rules on the VPS",
    command: "ufw status verbose 2>/dev/null || iptables -L INPUT -n 2>/dev/null",
  },
  view_config: {
    description: "View OpenClaw configuration files on the VPS",
    command: "echo '---openclaw.json---'; cat /root/.openclaw/openclaw.json 2>/dev/null | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),indent=2))' 2>/dev/null || echo 'Not found'; echo '---node.json---'; cat /root/.openclaw/node.json 2>/dev/null | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),indent=2))' 2>/dev/null || echo 'Not found'",
  },
  view_logs: {
    description: "View recent OpenClaw gateway logs on the VPS",
    command: "tail -50 /tmp/openclaw.log 2>/dev/null || tail -50 /tmp/oc.log 2>/dev/null || journalctl -u openclaw --no-pager -n 50 2>/dev/null || echo 'No logs found'",
  },
  check_ports: {
    description: "Show all listening ports on the VPS",
    command: "ss -tlnp",
  },
  check_disk: {
    description: "Check disk usage on the VPS",
    command: "df -h",
  },
  check_memory: {
    description: "Check RAM and swap usage on the VPS",
    command: "free -h; echo '---TOP---'; top -bn1 | head -15",
  },
  check_docker: {
    description: "List Docker containers on the VPS",
    command: "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo 'Docker not available'",
  },
  restart_gateway: {
    description: "Restart the OpenClaw gateway process on the VPS (DESTRUCTIVE — confirm first)",
    command: "kill -9 $(pgrep -f openclaw-gateway) 2>/dev/null; sleep 2; nohup openclaw-gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 3; ps aux | grep openclaw-gateway | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789",
  },
  restart_node_host: {
    description: "Restart the local OpenClaw node host process on the VPS",
    command: "kill -9 $(pgrep -f openclaw-node) 2>/dev/null; sleep 2; nohup openclaw-node > /tmp/openclaw-node.log 2>&1 & sleep 3; ps aux | grep openclaw-node | grep -v grep",
  },
  check_systemd: {
    description: "Check systemd services related to OpenClaw on the VPS",
    command: "systemctl list-units --type=service | grep -i openclaw; echo '---STATUS---'; systemctl status openclaw 2>/dev/null || systemctl status openclaw-gateway 2>/dev/null || echo 'No systemd service'; echo '---PM2---'; pm2 list 2>/dev/null || echo 'No pm2'",
  },
  check_network: {
    description: "Check network interfaces and connectivity on the VPS",
    command: "ip addr show | grep inet | grep -v inet6; echo '---DNS---'; cat /etc/resolv.conf | grep nameserver; echo '---ROUTE---'; ip route | head -5",
  },
  check_uptime: {
    description: "Check VPS server uptime and load average",
    command: "uptime; echo '---UNAME---'; uname -a",
  },
  check_env_vars: {
    description: "Check OpenClaw-related environment variables on the VPS",
    command: "env | grep -iE 'openclaw|deepseek|openai|openrouter|gateway' 2>/dev/null || echo 'No matching env vars'",
  },
};

const NODE_TOOLS: Record<string, { description: string; requiresNode: boolean; requiresParams?: string[] }> = {
  list_nodes: {
    description: "List all nodes connected to the gateway with their status, platform, capabilities, and connection info. Shows which nodes are online and available for commands.",
    requiresNode: false,
  },
  describe_node: {
    description: "Get detailed info about a specific node — its capabilities, supported commands, platform, and version. Requires 'node' parameter.",
    requiresNode: true,
  },
  run_on_node: {
    description: "Run a shell command on a remote node through the gateway using system.run invoke. Works on Linux, macOS, and Windows nodes. Requires 'node' and 'command' parameters. The command runs in a shell on the target node's machine.",
    requiresNode: true,
    requiresParams: ["command"],
  },
  invoke_on_node: {
    description: "Invoke a specific capability command on a remote node (e.g. system.which, browser.proxy). Requires 'node', 'command' (the invoke command name), and optional 'params' JSON object.",
    requiresNode: true,
    requiresParams: ["command"],
  },
  node_location: {
    description: "Get the geographic location of a remote node. Requires 'node' parameter.",
    requiresNode: true,
  },
};

interface ToolCall {
  tool: string;
  node?: string;
  command?: string;
  params?: string;
}

function buildNodeCommand(toolCall: ToolCall): string {
  const tokenPart = `--token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[\\"gateway\\"][\\"auth\\"][\\"token\\"])')"`;
  const urlPart = `--url ws://127.0.0.1:18789`;

  switch (toolCall.tool) {
    case "list_nodes":
      return `openclaw nodes status ${urlPart} ${tokenPart} --json 2>&1`;

    case "describe_node":
      return `openclaw nodes describe --node "${sanitizeParam(toolCall.node || "")}" ${urlPart} ${tokenPart} --json 2>&1`;

    case "run_on_node": {
      const cmd = sanitizeParam(toolCall.command || "echo hello");
      const paramsJson = JSON.stringify({ command: toolCall.command || "echo hello" });
      const timeout = (toolCall.command || "").length > 100 ? "60000" : "35000";
      return `openclaw nodes invoke --node "${sanitizeParam(toolCall.node || "")}" --command "system.run" --params '${sanitizeParam(paramsJson)}' --invoke-timeout ${timeout} --timeout ${timeout} ${urlPart} ${tokenPart} --json 2>&1`;
    }

    case "invoke_on_node": {
      const params = toolCall.params ? `--params '${sanitizeParam(toolCall.params)}'` : "";
      return `openclaw nodes invoke --node "${sanitizeParam(toolCall.node || "")}" --command "${sanitizeParam(toolCall.command || "")}" ${params} ${urlPart} ${tokenPart} --json 2>&1`;
    }

    case "node_location":
      return `openclaw nodes location --node "${sanitizeParam(toolCall.node || "")}" ${urlPart} ${tokenPart} --json 2>&1`;

    default:
      return `echo "Unknown node tool: ${toolCall.tool}"`;
  }
}

function sanitizeParam(param: string): string {
  return param.replace(/[`$\\]/g, "\\$&").replace(/"/g, '\\"').replace(/'/g, "'\\''");
}

function buildSystemPrompt(vpsIp: string, configInfo?: any, nodesSummary?: string): string {
  const vpsToolDescriptions = Object.entries(VPS_TOOL_COMMANDS)
    .map(([name, info]) => `- ${name}: ${info.description}`)
    .join("\n");

  const nodeToolDescriptions = Object.entries(NODE_TOOLS)
    .map(([name, info]) => {
      let paramHint = "";
      if (info.requiresNode) paramHint += ', "node": "<nodeId or displayName>"';
      if (info.requiresParams) paramHint += info.requiresParams.map(p => `, "${p}": "<value>"`).join("");
      return `- ${name}: ${info.description}`;
    })
    .join("\n");

  return `You are OpenClaw Task Runner, an AI assistant that helps manage a remote VPS server and the node computers connected to its OpenClaw gateway.

## Architecture
The OpenClaw gateway runs on a VPS server. Remote computers ("nodes") connect to this gateway over WebSocket. You can:
1. Run commands directly on the VPS (server management, config, logs, etc.)
2. Run commands on any connected node THROUGH the gateway (remote task execution on node machines)

## Server Information
- VPS IP: ${vpsIp}
- OS: Ubuntu (Linux)
- Platform: OpenClaw AI Gateway
${configInfo?.gatewayPort ? `- Gateway Port: ${configInfo.gatewayPort}` : ""}
${configInfo?.defaultLlm ? `- Default LLM: ${configInfo.defaultLlm}` : ""}
${nodesSummary ? `\n## Connected Nodes\n${nodesSummary}` : ""}

## Tool Call Format
Include a JSON block in your response to execute a tool:

\`\`\`tool
{"tool": "tool_name"}
\`\`\`

For node-targeting tools, include the node identifier and any parameters:

\`\`\`tool
{"tool": "run_on_node", "node": "srv1390515", "command": "uname -a"}
\`\`\`

## VPS Tools (run on the gateway server)
${vpsToolDescriptions}

## Node Tools (run on connected node computers through the gateway)
${nodeToolDescriptions}

### Node Tool Examples
List all connected nodes:
\`\`\`tool
{"tool": "list_nodes"}
\`\`\`

Describe a node's capabilities:
\`\`\`tool
{"tool": "describe_node", "node": "srv1390515"}
\`\`\`

Run a shell command on a node (uses system.run invoke, works on all platforms):
\`\`\`tool
{"tool": "run_on_node", "node": "srv1390515", "command": "uname -a"}
\`\`\`

Invoke a specific node capability:
\`\`\`tool
{"tool": "invoke_on_node", "node": "srv1390515", "command": "system.which", "params": "{\\"name\\":\\"python3\\"}"}
\`\`\`

Get a node's location:
\`\`\`tool
{"tool": "node_location", "node": "srv1390515"}
\`\`\`

## Guidelines
1. When the user asks about a specific node/computer, use the node tools to interact with it through the gateway.
2. When the user asks about the VPS/server itself, use the VPS tools.
3. Always use list_nodes first if you need to find node IDs or check which nodes are online.
4. Only online/connected nodes can receive commands. If a node is offline, tell the user.
5. Always explain what you're doing and why before running a command.
6. After getting results, analyze them and provide clear recommendations.
7. For destructive operations (restart, delete), confirm with the user first.
8. You can chain multiple tool calls across messages to diagnose complex issues.
9. NEVER fabricate command output — only report what the tool actually returns.
10. The "node" parameter can be a node ID, display name, or IP address.
11. When running commands on nodes, be aware of the node's platform (linux vs win32 vs darwin) — use appropriate commands.`;
}

function extractToolCall(content: string): ToolCall | null {
  const toolBlockMatch = content.match(/```tool\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
  if (toolBlockMatch) {
    try {
      return JSON.parse(toolBlockMatch[1]) as ToolCall;
    } catch { /* fall through */ }
  }
  const inlineMatch = content.match(/\{"tool"\s*:\s*"[^"]+?"[^}]*\}/);
  if (inlineMatch) {
    try {
      return JSON.parse(inlineMatch[0]) as ToolCall;
    } catch { /* fall through */ }
  }
  return null;
}

function isValidTool(toolCall: ToolCall): boolean {
  return !!(VPS_TOOL_COMMANDS[toolCall.tool] || NODE_TOOLS[toolCall.tool]);
}

async function fetchNodesSummary(sshConfig: any): Promise<string> {
  try {
    const tokenPart = `--token "$(cat /root/.openclaw/openclaw.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[\\"gateway\\"][\\"auth\\"][\\"token\\"])')"`;
    const result = await executeRawSSHCommand(
      `openclaw nodes status --url ws://127.0.0.1:18789 ${tokenPart} --json 2>&1`,
      sshConfig
    );
    const data = JSON.parse(result.output);
    if (!data.nodes || data.nodes.length === 0) return "No nodes registered.";
    return data.nodes.map((n: any) => {
      const status = n.connected ? "ONLINE" : "OFFLINE";
      const caps = n.commands?.length ? n.commands.join(", ") : "none";
      return `- ${n.displayName} (${n.platform}) [${status}] — capabilities: ${caps}`;
    }).join("\n");
  } catch {
    return "Could not fetch node status.";
  }
}

export async function processAiMessage(
  conversationId: string,
  userMessage: string,
  userId: string,
  instanceId: string,
): Promise<{ messages: Array<{ role: string; content: string; toolName?: string; toolOutput?: string }> }> {
  const resultMessages: Array<{ role: string; content: string; toolName?: string; toolInput?: string; toolOutput?: string }> = [];

  await storage.createAiMessage({
    conversationId,
    role: "user",
    content: userMessage,
  });

  const vps = await storage.getVpsConnection(instanceId);
  if (!vps?.vpsIp) {
    const errorMsg = "No VPS is configured for this instance. Please set up a VPS connection first in Settings > VPS Connection.";
    await storage.createAiMessage({ conversationId, role: "assistant", content: errorMsg });
    return { messages: [{ role: "assistant", content: errorMsg }] };
  }

  const config = await storage.getOpenclawConfig(instanceId);
  const sshConfig = buildSSHConfigFromVps(vps);

  const nodesSummary = await fetchNodesSummary(sshConfig);

  const history = await storage.getAiMessages(conversationId);
  const recentHistory = history.slice(-20);

  const systemPrompt = buildSystemPrompt(vps.vpsIp, config, nodesSummary);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;

    const assistantContent = await callOpenRouter(messages);
    const toolCall = extractToolCall(assistantContent);

    if (!toolCall) {
      await storage.createAiMessage({
        conversationId,
        role: "assistant",
        content: assistantContent,
      });
      resultMessages.push({ role: "assistant", content: assistantContent });
      break;
    }

    if (!isValidTool(toolCall)) {
      const rejection = `I tried to use an unknown tool "${toolCall.tool}". This tool is not in the allowed list. I'll proceed without it.`;
      await storage.createAiMessage({ conversationId, role: "assistant", content: rejection });
      resultMessages.push({ role: "assistant", content: rejection });
      break;
    }

    let commandToRun: string;
    const toolDisplayName = toolCall.tool;

    if (VPS_TOOL_COMMANDS[toolCall.tool]) {
      commandToRun = VPS_TOOL_COMMANDS[toolCall.tool].command;
    } else {
      commandToRun = buildNodeCommand(toolCall);
    }

    await storage.createAiMessage({
      conversationId,
      role: "assistant",
      content: assistantContent,
      toolName: toolDisplayName,
      toolInput: commandToRun,
    });
    resultMessages.push({ role: "assistant", content: assistantContent, toolName: toolDisplayName });

    let toolOutput: string;
    try {
      const result = await executeRawSSHCommand(commandToRun, sshConfig);
      toolOutput = result.output || "(no output)";
    } catch (err: any) {
      toolOutput = `Error executing command: ${err.message}`;
    }

    const truncatedOutput = toolOutput.length > 4000 ? toolOutput.substring(0, 4000) + "\n...(truncated)" : toolOutput;

    await storage.createAiMessage({
      conversationId,
      role: "user",
      content: `[Tool Result for ${toolDisplayName}]:\n${truncatedOutput}`,
      toolName: toolDisplayName,
      toolOutput: truncatedOutput,
    });
    resultMessages.push({ role: "tool", content: truncatedOutput, toolName: toolDisplayName, toolOutput: truncatedOutput });

    messages.push({ role: "assistant", content: assistantContent });
    messages.push({ role: "user", content: `[Tool Result for ${toolDisplayName}]:\n${truncatedOutput}` });

    continue;
  }

  const allMessages = await storage.getAiMessages(conversationId);
  if (allMessages.length <= 2) {
    const titleContent = userMessage.length > 60 ? userMessage.substring(0, 57) + "..." : userMessage;
    await storage.updateAiConversationTitle(conversationId, titleContent);
  }

  return { messages: resultMessages };
}

async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    return "OpenRouter API key is not configured. Please set the OPENROUTER_API_KEY secret.";
  }

  const instances = await storage.getInstances();
  const firstInstance = instances[0];
  const config = firstInstance ? await storage.getOpenclawConfig(String(firstInstance.id)) : undefined;
  const model = config?.defaultLlm || "deepseek/deepseek-chat";

  const cleanModel = model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_BASE_URL || "https://openclaw.ai",
      "X-Title": "OpenClaw Task Runner",
    },
    body: JSON.stringify({
      model: cleanModel,
      messages,
      max_tokens: 4000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  return data.choices?.[0]?.message?.content || "I couldn't generate a response.";
}
