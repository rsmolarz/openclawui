import { storage } from "./storage";
import { executeRawSSHCommand, buildSSHConfigFromVps } from "./ssh";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TOOL_COMMANDS: Record<string, { description: string; command: string }> = {
  check_status: {
    description: "Check if OpenClaw gateway and node processes are running",
    command: "ps aux | grep -E 'openclaw' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'",
  },
  check_firewall: {
    description: "Check firewall (UFW) status and rules",
    command: "ufw status verbose 2>/dev/null || iptables -L INPUT -n 2>/dev/null",
  },
  view_config: {
    description: "View OpenClaw configuration files (openclaw.json, node.json)",
    command: "echo '---openclaw.json---'; cat /root/.openclaw/openclaw.json 2>/dev/null | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),indent=2))' 2>/dev/null || echo 'Not found'; echo '---node.json---'; cat /root/.openclaw/node.json 2>/dev/null | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),indent=2))' 2>/dev/null || echo 'Not found'",
  },
  view_paired_devices: {
    description: "List paired/approved devices connected to the gateway",
    command: "cat /root/.openclaw/devices/paired.json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(f\"  {i.get(\\\"displayName\\\",i.get(\\\"deviceId\\\",\\\"?\\\")[:12])} ({i.get(\\\"platform\\\",\\\"?\\\")})\") for i in (d if isinstance(d,list) else list(d.values()))]' 2>/dev/null || echo '[]'",
  },
  view_pending_devices: {
    description: "List pending devices waiting for approval",
    command: "cat /root/.openclaw/devices/pending.json 2>/dev/null || echo '[]'",
  },
  view_logs: {
    description: "View recent OpenClaw gateway logs",
    command: "tail -50 /tmp/openclaw.log 2>/dev/null || tail -50 /tmp/oc.log 2>/dev/null || journalctl -u openclaw --no-pager -n 50 2>/dev/null || echo 'No logs found'",
  },
  check_ports: {
    description: "Show all listening ports on the server",
    command: "ss -tlnp",
  },
  check_disk: {
    description: "Check disk usage on the server",
    command: "df -h",
  },
  check_memory: {
    description: "Check RAM and swap usage",
    command: "free -h; echo '---TOP---'; top -bn1 | head -15",
  },
  check_docker: {
    description: "List Docker containers and their status",
    command: "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo 'Docker not available'",
  },
  restart_gateway: {
    description: "Restart the OpenClaw gateway process",
    command: "kill -9 $(pgrep -f openclaw-gateway) 2>/dev/null; sleep 2; nohup openclaw-gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 3; ps aux | grep openclaw-gateway | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789",
  },
  restart_node: {
    description: "Restart the OpenClaw node process",
    command: "kill -9 $(pgrep -f openclaw-node) 2>/dev/null; sleep 2; nohup openclaw-node > /tmp/openclaw-node.log 2>&1 & sleep 3; ps aux | grep openclaw-node | grep -v grep",
  },
  check_systemd: {
    description: "Check systemd services related to OpenClaw",
    command: "systemctl list-units --type=service | grep -i openclaw; echo '---STATUS---'; systemctl status openclaw 2>/dev/null || systemctl status openclaw-gateway 2>/dev/null || echo 'No systemd service'; echo '---PM2---'; pm2 list 2>/dev/null || echo 'No pm2'",
  },
  check_network: {
    description: "Check network interfaces and connectivity",
    command: "ip addr show | grep inet | grep -v inet6; echo '---DNS---'; cat /etc/resolv.conf | grep nameserver; echo '---ROUTE---'; ip route | head -5",
  },
  check_uptime: {
    description: "Check server uptime and load average",
    command: "uptime; echo '---UNAME---'; uname -a",
  },
  check_node_json: {
    description: "View the OpenClaw node.json configuration including gateway connection details",
    command: "cat /root/.openclaw/node.json 2>/dev/null | python3 -c 'import sys,json;print(json.dumps(json.load(sys.stdin),indent=2))' || echo 'Not found'",
  },
  check_env_vars: {
    description: "Check OpenClaw-related environment variables",
    command: "env | grep -iE 'openclaw|deepseek|openai|openrouter|gateway' 2>/dev/null || echo 'No matching env vars'",
  },
};

const TOOL_LIST = Object.entries(TOOL_COMMANDS).map(([name, info]) => ({
  name,
  description: info.description,
}));

function buildSystemPrompt(vpsIp: string, configInfo?: any): string {
  const toolDescriptions = TOOL_LIST.map(t => `- ${t.name}: ${t.description}`).join("\n");

  return `You are OpenClaw Task Runner, an AI assistant that helps manage and troubleshoot a remote VPS server running the OpenClaw AI gateway platform.

## Server Information
- VPS IP: ${vpsIp}
- OS: Ubuntu (Linux)
- Platform: OpenClaw AI Gateway
${configInfo?.gatewayPort ? `- Gateway Port: ${configInfo.gatewayPort}` : ""}
${configInfo?.gatewayStatus ? `- Gateway Status: ${configInfo.gatewayStatus}` : ""}
${configInfo?.defaultLlm ? `- Default LLM: ${configInfo.defaultLlm}` : ""}
${configInfo?.nodesApproved ? `- Approved Nodes: ${configInfo.nodesApproved}` : ""}

## Available Tools
You can run commands on the VPS by including a tool call in your response. To use a tool, include a JSON block in your response like this:

\`\`\`tool
{"tool": "tool_name"}
\`\`\`

Available tools:
${toolDescriptions}

## Guidelines
1. When the user asks about server status, health, or issues — use the appropriate tool to check.
2. Always explain what you're doing and why before running a command.
3. After getting tool results, analyze them and provide clear, actionable recommendations.
4. If something looks wrong, suggest fixes and offer to apply them.
5. Be concise but thorough. Use bullet points for clarity.
6. If the user's request is ambiguous, ask a clarifying question rather than guessing.
7. You can chain multiple tool calls across messages if needed to diagnose complex issues.
8. For destructive operations (restart, stop), confirm with the user before proceeding.
9. NEVER fabricate command output — only report what the tool actually returns.
10. Keep responses focused on the VPS and OpenClaw infrastructure.`;
}

function extractToolCall(content: string): string | null {
  const toolMatch = content.match(/```tool\s*\n?\s*\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\}\s*\n?\s*```/);
  if (toolMatch) return toolMatch[1];
  const inlineMatch = content.match(/\{"tool"\s*:\s*"([^"]+)"\}/);
  if (inlineMatch) return inlineMatch[1];
  return null;
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

  const history = await storage.getAiMessages(conversationId);
  const recentHistory = history.slice(-20);

  const systemPrompt = buildSystemPrompt(vps.vpsIp, config);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;

    const assistantContent = await callOpenRouter(messages);

    const toolName = extractToolCall(assistantContent);

    if (toolName && !TOOL_COMMANDS[toolName]) {
      const rejection = `I tried to use an unknown tool "${toolName}". This tool is not in the allowed list. I'll proceed without it.`;
      await storage.createAiMessage({ conversationId, role: "assistant", content: rejection });
      resultMessages.push({ role: "assistant", content: rejection });
      break;
    }

    if (toolName && TOOL_COMMANDS[toolName]) {
      const whitelistedCommand = TOOL_COMMANDS[toolName].command;
      await storage.createAiMessage({
        conversationId,
        role: "assistant",
        content: assistantContent,
        toolName,
        toolInput: whitelistedCommand,
      });
      resultMessages.push({ role: "assistant", content: assistantContent, toolName });

      let toolOutput: string;
      try {
        const result = await executeRawSSHCommand(TOOL_COMMANDS[toolName].command, sshConfig);
        toolOutput = result.output || "(no output)";
      } catch (err: any) {
        toolOutput = `Error executing command: ${err.message}`;
      }

      const truncatedOutput = toolOutput.length > 4000 ? toolOutput.substring(0, 4000) + "\n...(truncated)" : toolOutput;

      await storage.createAiMessage({
        conversationId,
        role: "user",
        content: `[Tool Result for ${toolName}]:\n${truncatedOutput}`,
        toolName,
        toolOutput: truncatedOutput,
      });
      resultMessages.push({ role: "tool", content: truncatedOutput, toolName, toolOutput: truncatedOutput });

      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: `[Tool Result for ${toolName}]:\n${truncatedOutput}` });

      continue;
    }

    await storage.createAiMessage({
      conversationId,
      role: "assistant",
      content: assistantContent,
    });
    resultMessages.push({ role: "assistant", content: assistantContent });
    break;
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
