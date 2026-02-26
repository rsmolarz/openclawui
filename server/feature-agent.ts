import { storage } from "./storage";
import type { FeatureProposal } from "@shared/schema";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

interface AIProposal {
  title: string;
  description: string;
  category: "enhancement" | "security" | "performance" | "integration" | "ux";
  priority: "low" | "medium" | "high" | "critical";
  rationale: string;
  implementationPlan: string;
}

async function gatherSystemState() {
  const [machines, integrations, instances, settings, skills] = await Promise.all([
    storage.getMachines(),
    storage.getIntegrations(),
    storage.getInstances(),
    storage.getSettings(),
    storage.getSkills(),
  ]);

  let config = null;
  if (instances.length > 0) {
    config = await storage.getOpenclawConfig(instances[0].id);
  }

  return {
    machines: machines.map(m => ({ name: m.name, status: m.status, os: m.os })),
    integrations: integrations.map(i => ({ name: i.name, type: i.type, category: i.category, enabled: i.enabled, status: i.status })),
    instances: instances.map(i => ({ name: i.name, status: i.status })),
    skills: skills.map(s => ({ name: s.name, category: s.category, enabled: s.enabled })),
    config: config ? {
      gatewayMode: config.gatewayMode,
      defaultLlm: config.defaultLlm,
      whatsappEnabled: config.whatsappEnabled,
      tailscaleEnabled: config.tailscaleEnabled,
      nodesApproved: config.nodesApproved,
    } : null,
    pages: [
      "Overview Dashboard",
      "VPS Monitoring",
      "AI Task Runner",
      "Node Setup Wizard",
      "OpenClaw Commands",
      "Documentation",
      "Settings (General, Machines, VPS, Instances, Integrations, API Keys, Skills, Notifications, Appearance, OpenClaw, Dashboard)",
    ],
    settingsCount: settings.length,
  };
}

async function generateProposals(): Promise<FeatureProposal[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Please set the OPENAI_API_KEY environment variable.");
  }

  const systemState = await gatherSystemState();

  const systemPrompt = `You are a feature improvement analyst for OpenClaw, an AI agent gateway dashboard platform. OpenClaw provides:
- VPS server management with SSH command execution
- Node/machine management (remote computers connect via WebSocket gateway)
- WhatsApp bot integration for remote commands
- AI Task Runner for automated VPS/node diagnostics
- Docker service monitoring
- Multi-instance support for managing multiple OpenClaw deployments
- Skills system for extensible capabilities
- Documentation system
- API key management
- Integration management (Tailscale, WhatsApp, LLM providers)

Based on the current system state provided, suggest 2-3 specific, actionable feature improvements. Consider gaps in functionality, security hardening, performance optimizations, UX improvements, and new integrations that would benefit the platform.

Respond with ONLY a JSON array of proposals. No markdown, no code fences, no explanation text. Each proposal must have these exact fields:
- title (string): concise feature name
- description (string): detailed description of the feature
- category (string): one of "enhancement", "security", "performance", "integration", "ux"
- priority (string): one of "low", "medium", "high", "critical"
- rationale (string): why this feature would be valuable
- implementationPlan (string): high-level steps to implement`;

  const userPrompt = `Current system state:\n${JSON.stringify(systemState, null, 2)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  if (data.error) {
    throw new Error(`OpenAI error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No response content from OpenAI");
  }

  let proposals: AIProposal[];
  try {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
    }
    proposals = JSON.parse(cleaned);
  } catch (err: any) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}. Raw response: ${content.substring(0, 500)}`);
  }

  if (!Array.isArray(proposals)) {
    throw new Error("AI response is not a JSON array");
  }

  const validCategories = ["enhancement", "security", "performance", "integration", "ux"];
  const validPriorities = ["low", "medium", "high", "critical"];

  const createdProposals: FeatureProposal[] = [];

  for (const proposal of proposals) {
    const category = validCategories.includes(proposal.category) ? proposal.category : "enhancement";
    const priority = validPriorities.includes(proposal.priority) ? proposal.priority : "medium";

    const created = await storage.createFeatureProposal({
      title: proposal.title || "Untitled Proposal",
      description: proposal.description || "",
      category,
      priority,
      status: "proposed",
      proposedBy: "feature-agent",
      rationale: proposal.rationale || null,
      implementationPlan: proposal.implementationPlan || null,
    });

    createdProposals.push(created);
  }

  return createdProposals;
}

export { generateProposals };
