import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  FileText, Package, Download, Mail, Send, Search, ChevronDown, ChevronRight,
  ExternalLink, Loader2, Copy, CheckCircle2, Filter, Layers, X
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BrandAbbreviation = "DC" | "FS" | "BR" | "LM" | "DCL" | "ALL" | "HPG" | "OC";

interface FeatureSection {
  title: string;
  content: string;
}

interface FeatureDoc {
  id: string;
  title: string;
  version: string;
  brand: BrandAbbreviation;
  status: "complete" | "draft" | "in-progress";
  published: string;
  summary: string;
  sections: FeatureSection[];
  files: string[];
  apiRoutes: string[];
  dependencies: string[];
}

interface FeatureBundle {
  id: string;
  name: string;
  description: string;
  mainFeature: string;
  supportingFeatures: string[];
}

const BRAND_COLORS: Record<BrandAbbreviation, string> = {
  DC: "bg-blue-500",
  FS: "bg-emerald-500",
  BR: "bg-orange-500",
  LM: "bg-purple-500",
  DCL: "bg-rose-500",
  ALL: "bg-gray-600",
  HPG: "bg-cyan-600",
  OC: "bg-amber-600",
};

const FEATURE_DOCS: FeatureDoc[] = [
  {
    id: "membership-subscription",
    title: "Membership & Subscription System",
    version: "2.0",
    brand: "ALL",
    status: "complete",
    published: "2026-02-09",
    summary: "Brand-first billing architecture with multi-tier subscriptions, usage tracking, and billing portal.",
    sections: [
      { title: "Overview", content: "Comprehensive membership management with brand-specific tiers, Stripe integration, and automated billing cycles." },
      { title: "Subscription Tiers", content: "Free, Basic, Professional, Enterprise tiers with brand-specific pricing and feature gates." },
      { title: "Billing Portal", content: "Self-service portal for plan changes, payment method updates, and invoice history." },
      { title: "Usage Tracking", content: "Real-time usage metering with configurable limits per tier and overage handling." },
    ],
    files: ["server/billing.ts", "client/src/pages/billing.tsx", "shared/billing-schema.ts"],
    apiRoutes: ["POST /api/subscriptions", "GET /api/subscriptions/:id", "PATCH /api/subscriptions/:id", "POST /api/billing/portal", "GET /api/usage/current"],
    dependencies: ["Stripe", "Drizzle ORM"],
  },
  {
    id: "prepaid-wallet",
    title: "Prepaid Wallet System",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-02-09",
    summary: "Credit-based wallet with top-up, auto-reload, and usage deduction for API calls and premium features.",
    sections: [
      { title: "Wallet Management", content: "Create and manage user wallets with balance tracking, transaction history, and multi-currency support." },
      { title: "Top-Up Flow", content: "Stripe-powered top-up with preset amounts, custom amounts, and auto-reload triggers." },
      { title: "Usage Deduction", content: "Automatic credit deduction for API calls, document generation, and AI features with configurable rates." },
      { title: "Admin Controls", content: "Manual credit adjustments, bulk grants, and wallet audit trail." },
    ],
    files: ["server/wallet.ts", "client/src/components/wallet.tsx"],
    apiRoutes: ["POST /api/wallet/topup", "GET /api/wallet/balance", "POST /api/wallet/deduct", "GET /api/wallet/transactions", "POST /api/wallet/auto-reload", "PATCH /api/wallet/admin/adjust", "GET /api/wallet/admin/audit"],
    dependencies: ["Stripe", "Drizzle ORM"],
  },
  {
    id: "overage-billing",
    title: "Overage Billing System",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-02-09",
    summary: "Automated overage detection, notification, and billing for usage exceeding subscription limits.",
    sections: [
      { title: "Overage Detection", content: "Real-time monitoring of resource usage against subscription limits with configurable thresholds." },
      { title: "Notification Pipeline", content: "Multi-channel alerts (email, in-app, webhook) at 80%, 90%, and 100% usage thresholds." },
      { title: "Billing Integration", content: "Automatic invoice generation for overage charges with Stripe metered billing." },
      { title: "Grace Periods", content: "Configurable grace periods and soft/hard limits per resource type." },
      { title: "Usage Reports", content: "Detailed usage breakdown by resource, time period, and brand." },
      { title: "Admin Dashboard", content: "Overview of all accounts with overage status, manual overrides, and bulk operations." },
    ],
    files: ["server/overage.ts", "client/src/pages/overage.tsx"],
    apiRoutes: ["GET /api/overage/status", "GET /api/overage/history", "POST /api/overage/config", "GET /api/overage/thresholds", "PATCH /api/overage/grace-period", "POST /api/overage/invoice", "GET /api/overage/report", "POST /api/overage/admin/override", "GET /api/overage/admin/all"],
    dependencies: ["Stripe", "Drizzle ORM", "Node Cron"],
  },
  {
    id: "survey-system",
    title: "AI-Powered Survey Workflow",
    version: "1.0",
    brand: "FS",
    status: "complete",
    published: "2026-01-15",
    summary: "Dynamic survey builder with AI-powered question generation, photo uploads, and finding analysis.",
    sections: [
      { title: "Survey Builder", content: "Drag-and-drop survey creation with conditional logic, branching, and question templates." },
      { title: "AI Question Generation", content: "GPT-powered question suggestions based on survey context and industry templates." },
      { title: "Photo Capture", content: "In-survey camera integration with annotation, cropping, and automatic finding detection." },
      { title: "Finding Analysis", content: "AI analysis of survey responses to identify patterns, anomalies, and actionable insights." },
    ],
    files: ["client/src/pages/surveys.tsx", "server/survey-engine.ts"],
    apiRoutes: ["POST /api/surveys", "GET /api/surveys/:id", "POST /api/surveys/:id/responses", "POST /api/surveys/:id/analyze"],
    dependencies: ["OpenAI", "React DnD", "Sharp"],
  },
  {
    id: "doc-generation",
    title: "Document Generation Pipeline",
    version: "1.0",
    brand: "FS",
    status: "complete",
    published: "2026-01-20",
    summary: "Template-based document generation with merge tokens, citations, and multi-format export.",
    sections: [
      { title: "Template Engine", content: "Rich template editor with merge tokens, conditional sections, and repeating blocks." },
      { title: "Merge Token System", content: "Dynamic data injection from surveys, valuations, and external sources into document templates." },
      { title: "Citation Management", content: "Automatic citation tracking, formatting, and cross-reference linking." },
      { title: "Export Pipeline", content: "Generate PDF, DOCX, and HTML outputs with brand-specific styling and watermarks." },
    ],
    files: ["server/doc-gen.ts", "client/src/pages/documents.tsx"],
    apiRoutes: ["POST /api/documents/generate", "GET /api/documents/:id", "POST /api/templates", "GET /api/templates"],
    dependencies: ["Puppeteer", "Handlebars", "PDFKit"],
  },
  {
    id: "boat-review",
    title: "Boat Review Platform",
    version: "1.0",
    brand: "BR",
    status: "complete",
    published: "2026-01-25",
    summary: "Comprehensive boat review system with proof layers, commerce integration, and media management.",
    sections: [
      { title: "Review Workflow", content: "Multi-step review process with condition grading, photo documentation, and expert annotations." },
      { title: "Proof Layer", content: "Evidence tracking with photo verification, timestamp validation, and chain-of-custody logging." },
      { title: "Commerce Integration", content: "Listing creation from reviews, pricing engine, and marketplace syndication." },
    ],
    files: ["client/src/pages/boat-reviews.tsx", "server/boat-review.ts"],
    apiRoutes: ["POST /api/reviews", "GET /api/reviews/:id", "POST /api/reviews/:id/proof"],
    dependencies: ["Sharp", "Mapbox GL"],
  },
  {
    id: "realtime-collab",
    title: "Real-time Collaboration Suite",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-02-01",
    summary: "Live document editing, presence indicators, and team sharing with conflict resolution.",
    sections: [
      { title: "Presence System", content: "Live cursors, active user indicators, and typing status broadcasts via WebSocket." },
      { title: "Conflict Resolution", content: "Operational Transform (OT) based conflict resolution for simultaneous edits." },
      { title: "Sharing & Permissions", content: "Granular sharing controls with role-based access, link sharing, and audit logging." },
    ],
    files: ["server/collab.ts", "client/src/components/collab-editor.tsx"],
    apiRoutes: ["WS /ws/collab/:docId", "GET /api/collab/presence/:docId", "POST /api/sharing"],
    dependencies: ["Socket.io", "Y.js"],
  },
  {
    id: "api-sync",
    title: "External Data & Sync Engine",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-02-03",
    summary: "Bidirectional data synchronization with CRM, market data feeds, and external APIs.",
    sections: [
      { title: "Sync Engine", content: "Configurable polling and webhook-based sync with retry logic and conflict detection." },
      { title: "CRM Integration", content: "Two-way sync with Salesforce, HubSpot, and custom CRM endpoints." },
      { title: "Market Data", content: "Real-time market data ingestion with caching, normalization, and alerting." },
    ],
    files: ["server/sync-engine.ts", "server/market-data.ts"],
    apiRoutes: ["POST /api/sync/configure", "GET /api/sync/status", "POST /api/sync/trigger"],
    dependencies: ["Bull", "Axios", "Redis"],
  },
  {
    id: "dcl-marketing",
    title: "Distribution Control Layer",
    version: "1.0",
    brand: "DCL",
    status: "complete",
    published: "2026-02-05",
    summary: "AI-driven marketing automation with content generation, multi-channel distribution, and analytics.",
    sections: [
      { title: "AI Content Engine", content: "Automated content generation for social media, email campaigns, and blog posts using brand voice profiles." },
      { title: "Distribution Channels", content: "Multi-channel publishing to social platforms, email lists, and partner networks." },
      { title: "Analytics Dashboard", content: "Engagement tracking, conversion attribution, and ROI reporting across all channels." },
    ],
    files: ["server/dcl.ts", "client/src/pages/dcl-marketing.tsx"],
    apiRoutes: ["POST /api/dcl/campaigns", "GET /api/dcl/analytics", "POST /api/dcl/distribute"],
    dependencies: ["OpenAI", "SendGrid", "Buffer API"],
  },
  {
    id: "listing-maker",
    title: "Listing Maker Workflow",
    version: "1.0",
    brand: "LM",
    status: "complete",
    published: "2026-02-07",
    summary: "AI-powered listing creation with media extraction, mapping, and multi-platform syndication.",
    sections: [
      { title: "AI Extractor", content: "Automatic data extraction from photos, documents, and web pages to populate listing fields." },
      { title: "Media Pipeline", content: "Photo optimization, virtual staging, and video tour generation." },
      { title: "Syndication", content: "One-click publishing to MLS, Zillow, Realtor.com, and custom marketplace endpoints." },
    ],
    files: ["server/listing-maker.ts", "client/src/pages/listing-maker.tsx"],
    apiRoutes: ["POST /api/listings", "POST /api/listings/:id/syndicate", "POST /api/listings/extract"],
    dependencies: ["OpenAI", "Sharp", "Puppeteer"],
  },
  {
    id: "promo-codes",
    title: "Promo Code & Discount Engine",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-01-10",
    summary: "Flexible promotional code system with percentage, fixed, and tiered discounts.",
    sections: [
      { title: "Code Generation", content: "Bulk code generation with custom prefixes, expiration dates, and usage limits." },
      { title: "Discount Types", content: "Percentage off, fixed amount, buy-one-get-one, and tiered volume discounts." },
      { title: "Validation Engine", content: "Real-time code validation with stacking rules, exclusion lists, and minimum purchase requirements." },
    ],
    files: ["server/promo.ts"],
    apiRoutes: ["POST /api/promo/create", "POST /api/promo/validate", "GET /api/promo/analytics"],
    dependencies: ["Drizzle ORM"],
  },
  {
    id: "demo-tour",
    title: "Demo Tour & Onboarding System",
    version: "1.0",
    brand: "ALL",
    status: "complete",
    published: "2026-01-05",
    summary: "Interactive product tours, guided onboarding flows, and feature discovery nudges.",
    sections: [
      { title: "Tour Builder", content: "Visual tour builder with step sequencing, highlight regions, and conditional branching." },
      { title: "Onboarding Flows", content: "Multi-step onboarding with progress tracking, skip logic, and completion rewards." },
      { title: "Feature Discovery", content: "Context-aware nudges and tooltips triggered by user behavior and feature usage." },
    ],
    files: ["client/src/components/tour-guide.tsx"],
    apiRoutes: ["GET /api/tours", "POST /api/tours/:id/progress", "GET /api/onboarding/status"],
    dependencies: ["React Joyride"],
  },
  {
    id: "warroom-ops-dashboard",
    title: "War Room -- Operations Dashboard",
    version: "2.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-10",
    summary: "A read-only operations intelligence dashboard that aggregates KPI data, strategic insights, and board activity from Harbor Shoppers. Provides staff and admin users with a unified view of cross-portfolio operational health. Acts as the home tab for the War Room, housing real-time status panels for all connected apps (HPG, Harbor Shoppers 3.0, Doc Captain).",
    sections: [
      { title: "What It Is", content: "The War Room Operations Dashboard is the central nerve center of the Harbor Platform Group. It provides a real-time, read-only view of operational intelligence aggregated from all connected applications in the HPG ecosystem: HPG (Identity provider, wallet system, entitlements, portfolio management, audit logging, Knowledge Vault, App Factory, and monetization), Harbor Shoppers 3.0 (E-commerce operations, WooCommerce product management, order processing, inventory tracking, customer data, pricing, and analytics), Doc Captain (Maritime documentation management, vessel data, compliance tracking, certificate management, crew documentation, and vessel registry operations)." },
      { title: "Architecture & Design", content: "The War Room is a single-page React component (war-room.tsx, ~4900 lines) with tabbed navigation: Operations Tab (KPI panels, app status cards, board activity feed), Agent Console Tab (Command mode for dispatching tasks to apps), Agent Cockpit Tab (Tri-pane per-app feed view with real-time monitoring), Engineering Chat Tab (Conversational multi-turn AI chat with all apps). HPG queries its own database directly. HS3 and DC3 data arrives via the Agent Console callback system." },
      { title: "Connected Apps", content: "Three applications via a centralized app registry: HPG (self, localhost:5000), Harbor Shoppers 3.0 (HS3_BASE_URL_DEV), Doc Captain (DC3_BASE_URL_DEV). Each app must expose a POST /api/agent/inbox endpoint that accepts tasks and sends callbacks to HPG's callback URLs." },
      { title: "Security & Authentication", content: "Inter-app communication secured with service tokens: HPG to HS3 (HPG_TO_HS3_SERVICE_TOKEN), HPG to DC3 (HPG_TO_DC3_SERVICE_TOKEN), HS3 to HPG callbacks (HS3_TO_HPG_SERVICE_TOKEN), DC3 to HPG callbacks (DC3_TO_HPG_SERVICE_TOKEN), HPG self-dispatch (WARROOM_SERVICE_TOKEN). All tokens sent in Authorization: Bearer header." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts", "server/storage.ts"],
    apiRoutes: ["POST /api/agent/tasks", "GET /api/agent/tasks", "GET /api/agent/feed/:app", "POST /api/agent/inbox"],
    dependencies: ["OpenAI (gpt-4o-mini)", "Node.js fetch API", "Drizzle ORM"],
  },
  {
    id: "warroom-agent-console",
    title: "War Room -- Agent Console",
    version: "2.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-10",
    summary: "Command and Chat mode interface for cross-app task orchestration across HPG, Harbor Shoppers 3.0, and Doc Captain. Features handler selection, environment targeting (dev/staging/prod), idempotent task dispatch, auto-execution pipelines, and real-time response tracking with progress indicators.",
    sections: [
      { title: "Command Mode", content: "Select target apps (HPG, HS3, DC3) individually or all at once. Choose a handler/task type (e.g., health_check, list_config, or custom). Set environment (dev, staging, prod) with safety gates. Write a message and optional context JSON. Dispatch the task and view real-time responses as callbacks arrive." },
      { title: "Chat Mode (Engineering Chat)", content: "Conversational multi-turn interface. Type a message and all target apps in the thread receive it simultaneously. Apps respond with AI-powered contextual answers using their own database data. Supports needs_info, cross_app_request, and normal responses. Full conversation history is maintained per thread." },
      { title: "Task Dispatch Flow", content: "Admin composes message + selects target apps. HPG creates agent_console_task record, POSTs to each app's /api/agent/inbox. Apps respond HTTP 202 immediately, process asynchronously, then POST results back via callback. Tasks have unique taskRef (TSK-XXXXX-YYYYY format) and idempotencyKey. Supports parent-child relationships, Save as Template, and Plan & Split." },
      { title: "Supported Handlers", content: "SAFE_HANDLERS (always auto-execute): health_check (system status), list_config (supported handlers metadata). PRIVILEGED_HANDLERS require local dispatch or explicit approval. Each handler has description, tags, inputHint, autoExec flag, and mutating flag." },
      { title: "Database Schema", content: "agent_console_tasks (Central task registry with UUID, taskRef, targetApps, message, contextJson, environment, status, idempotencyKey). agent_task_responses (Per-app responses with appKey, status, responseText, responseJson). agent_task_attachments (File attachments with filename, mimeType, sizeBytes, storageKey). All tables use UUID primary keys." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts", "server/storage.ts"],
    apiRoutes: ["POST /api/agent/tasks", "GET /api/agent/tasks", "POST /api/agent/tasks/:taskId/callback", "POST /api/agent/inbox"],
    dependencies: ["OpenAI (gpt-4o-mini)", "Node.js fetch API", "Drizzle ORM", "Zod"],
  },
  {
    id: "warroom-agent-cockpit",
    title: "War Room -- Agent Cockpit",
    version: "2.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-10",
    summary: "Tri-pane operations cockpit with per-app feeds (HPG, HS3, DC3), handler dispatch with environment selection, checkpoint safety metadata on mutating operations, parent-child task relationships, and real-time callback monitoring. Includes Save as Template and Plan & Split features for reusable task orchestration.",
    sections: [
      { title: "Tri-Pane Layout", content: "Three-column layout where each column shows the live task feed for one app (HPG, HS3, DC3). Gives the admin a bird's-eye view of all operations across the entire platform ecosystem simultaneously. Each pane shows recent tasks with status indicators (pending, dispatched, completed, failed)." },
      { title: "Cockpit Features", content: "Save as Template: Save task configurations (handler, message, context JSON, target apps) as reusable templates stored with templateSlug. Plan & Split: Decompose complex tasks into multiple subtasks with parentTaskId linking. Broadcast (Radio icon, amber styled): Send a single message to all apps simultaneously in a new thread. Nudge: Re-dispatch messages to unresponsive apps with a nudge context flag." },
      { title: "Feed API", content: "GET /api/agent/feed/:app returns the most recent tasks dispatched to that app, including task metadata (taskRef, status, environment, handler), response data, timing, and parent-child relationships. The cockpit polls this endpoint at regular intervals." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts"],
    apiRoutes: ["GET /api/agent/feed/:app", "POST /api/agent/tasks", "GET /api/agent/chat/:parentId/children"],
    dependencies: ["Drizzle ORM", "React (TanStack Query)"],
  },
  {
    id: "warroom-context-json",
    title: "War Room -- Context JSON Editor",
    version: "1.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-10",
    summary: "Structured context editor for agent task inputs with live JSON validation, green/red validity indicators, handler-specific presets (auto-fill templates), and server-side fallback that auto-extracts JSON-in-message. Mutating handlers require valid context JSON with optional notes, preventing stuck tasks from mixed text and JSON.",
    sections: [
      { title: "Live JSON Validation", content: "As you type, the editor validates JSON in real-time with a green (valid) or red (invalid) border indicator. Handler presets auto-fill with the handler's expected input template (inputHint). Mixed input protection enforces valid JSON for mutating handlers." },
      { title: "Context JSON Contract", content: "Reserved fields HPG injects automatically: chatMode (boolean), threadId (UUID), conversationHistory (array), replyToNeedsInfo (boolean), originalQuestion (string), crossAppRequest (boolean), crossAppForward (boolean), nudge (boolean), environment (dev/staging/prod). Custom fields from the admin's context editor are merged alongside these." },
      { title: "Server-Side Fallback", content: "If the admin accidentally puts JSON in the message field instead of the context editor, the server extracts it and moves it to contextJson automatically. Notes field allows optional text annotations to accompany the JSON context." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts"],
    apiRoutes: [],
    dependencies: [],
  },
  {
    id: "warroom-engineering-chat",
    title: "War Room -- Engineering Chat Mode",
    version: "2.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-12",
    summary: "Thread-based persistent conversations with all connected apps. Supports conversational multi-turn interactions where apps respond with AI-powered contextual answers. Features shared conversation history, callback-to-thread integration, environment safety gates, CockpitChatPanel with tri-pane grouped message view, full-screen chat expansion, and per-response and bulk copy-to-clipboard for sharing.",
    sections: [
      { title: "How It Works", content: "Admin creates a chat thread, selecting target apps. Types a message dispatched to all target apps at once. Each app receives the message with full conversation history, uses OpenAI + its own database to generate contextual responses. Responses appear in real-time as callbacks arrive." },
      { title: "Thread & Message Schema", content: "agent_chat_threads: id (UUID), threadRef (THR-XXXXX-YYYYY), title, createdBy, targetApps (text[]), environment, status (active/archived/closed), metadata (JSONB). agent_chat_messages: id (UUID), threadId (FK), senderType (user/app/system), senderAppKey, content, messageType (normal/needs_info/cross_app_request/cross_app_response/admin_reply/forwarded), taskId, metadata (JSONB)." },
      { title: "AI-Powered Responses", content: "HPG uses gpt-4o-mini with system prompt describing all HPG capabilities. External apps have two paths: Real AI handler (preferred, app queries own DB and uses OpenAI) or AI proxy fallback (HPG generates response on behalf of apps that only send processing acks)." },
      { title: "Message Deduplication", content: "Multiple strategies: idempotency key check, task-based dedup, auto-delivered message updates (placeholders updated with real content), single callback pattern for self-dispatch." },
      { title: "Full-Screen & Copy Features", content: "Toggle button expands chat to fill entire viewport, Escape key dismisses. Per-response copy: clipboard icon on hover copies single response. Copy All Responses: button copies all responses since last user message, formatted with app labels (=== Harbor Shoppers 3.0 === etc)." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts", "server/storage.ts"],
    apiRoutes: ["GET /api/agent/chat/threads", "POST /api/agent/chat/threads", "GET /api/agent/chat/threads/:threadId", "GET /api/agent/chat/threads/:threadId/messages", "POST /api/agent/chat/threads/:threadId/messages", "PATCH /api/agent/chat/threads/:threadId", "POST /api/agent/chat/threads/:threadId/nudge", "POST /api/agent/chat/callback"],
    dependencies: ["OpenAI (gpt-4o-mini)", "Drizzle ORM", "TanStack React Query"],
  },
  {
    id: "warroom-cross-app",
    title: "War Room -- Cross-App Communication",
    version: "1.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-13",
    summary: "Admin-mediated cross-app communication system where apps can request data from each other. Supports needs_info workflows (apps ask admin clarifying questions), cross_app_request workflows (apps request data from other apps with admin approval/deny/edit), and forwarded answers back to requesting apps.",
    sections: [
      { title: "needs_info Workflow", content: "App receives a task and doesn't have enough information. Sends a needs_info callback with a clarifying question. Question appears in chat with inline reply UI. Admin types a reply, dispatched back to app with replyToNeedsInfo: true context. App processes reply with original context and sends completed response." },
      { title: "cross_app_request Workflow", content: "App A receives a task requiring data from App B. Sends cross_app_request callback specifying target apps and question. Request appears in chat with Approve/Deny/Edit buttons. Admin approves (optionally editing). HPG dispatches question to App B, forwards answer back to App A." },
      { title: "Request Lifecycle", content: "States: pending, approved, denied, dispatched, answered, forwarded. Fields: requestingApp, targetApps, question, status, approvedBy, editedQuestion, responseMessageId, sourceTaskId, sourceMessageId, forwardedAt, metadata (JSONB)." },
      { title: "Message Types", content: "Six types: normal (standard), needs_info (clarifying question with inline reply UI), cross_app_request (data request with Approve/Deny/Edit buttons), cross_app_response (target app's response), admin_reply (admin's reply to needs_info), forwarded (answer forwarded to requesting app)." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts", "server/storage.ts"],
    apiRoutes: ["POST /api/agent/chat/threads/:threadId/reply-needs-info", "POST /api/agent/chat/cross-app-requests/:requestId/approve", "POST /api/agent/chat/cross-app-requests/:requestId/deny", "POST /api/agent/chat/cross-app-requests/:requestId/dispatch", "POST /api/agent/chat/cross-app-requests/:requestId/forward", "GET /api/agent/chat/threads/:threadId/cross-app-requests"],
    dependencies: ["Drizzle ORM", "Node.js fetch API"],
  },
  {
    id: "warroom-settings-snapshots",
    title: "War Room -- Settings Snapshots",
    version: "1.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-16",
    summary: "Backup, diff, restore, and export system for War Room infrastructure configuration. Captures app URLs, service token presence flags (never secrets), OS contract state, and agent templates into immutable snapshots. Supports lock/unlock, visual diff comparison against live settings, automated restore with OS contract reactivation, manual checklist generation, and export to external apps for disaster recovery.",
    sections: [
      { title: "Capabilities", content: "Capture: Take a snapshot of all app URLs, token presence, OS contract state, and saved templates. Lock: Freeze a snapshot so it cannot be accidentally deleted. Diff: Compare a snapshot against current live settings, highlighting every change. Restore: Re-apply a snapshot's OS contract automatically with manual checklist for token/env var fixes. Export: Send a snapshot to HS3 or DC3 as a backup payload. Delete: Remove unlocked snapshots." },
      { title: "Snapshot Schema", content: "warroom_snapshots: id (UUID), name, description, payload (JSONB with appUrls, tokenPresence booleans, osContract, templates, capturedAt), checksum (SHA-256), locked (boolean), createdBy, timestamps. warroom_snapshot_exports: id, snapshotId, targetApp, status (pending/sent/failed), responseData (JSONB), exportedBy, exportedAt." },
      { title: "Deterministic Checksums", content: "SHA-256 checksums from deterministically serialized payload. stableStringify deep-sorts all object keys recursively before JSON.stringify. Same logical payload always produces same checksum regardless of key insertion order." },
      { title: "Diff & Restore Flow", content: "Diff: Reads current app URLs, checks token presence, fetches active OS contract, loads templates. Produces field-by-field comparison: { field, snapshot, current, match }. Restore: Identifies OS contract version, reactivates if different, generates manual checklist for env var/token fixes. Shows green checkmarks for auto-applied changes, amber for manual fixes." },
      { title: "Security", content: "Snapshots NEVER store actual secrets or tokens. Only boolean presence flags (e.g., 'HS3 token: configured' vs 'HS3 token: missing') and URLs. No sensitive data leaks even if a snapshot is exported." },
    ],
    files: ["client/src/pages/portal/war-room.tsx", "server/routes.ts", "shared/schema.ts", "server/storage.ts"],
    apiRoutes: ["GET /api/agent/snapshots", "POST /api/agent/snapshots", "PATCH /api/agent/snapshots/:id", "DELETE /api/agent/snapshots/:id", "POST /api/agent/snapshots/:id/diff", "POST /api/agent/snapshots/:id/restore", "POST /api/agent/snapshots/:id/export"],
    dependencies: ["Drizzle ORM", "Node.js crypto (SHA-256)"],
  },
  {
    id: "warroom-integration-guide",
    title: "War Room -- External App Integration Guide",
    version: "2.0",
    brand: "HPG",
    status: "complete",
    published: "2026-02-14",
    summary: "Complete integration guide for connecting external Replit apps (Harbor Shoppers, Doc Captain, or new apps) to HPG's War Room. Includes the full inbox handler contract, callback patterns, AI-powered response setup, authentication, and copy-paste instructions for the Replit Agent.",
    sections: [
      { title: "Inbox Handler Contract", content: "External app MUST implement POST /api/agent/inbox. Incoming payload includes: taskId, taskRef, appKey, message, context_json (with chatMode, threadId, conversationHistory, replyToNeedsInfo, crossAppRequest, crossAppForward, nudge), callbackUrl, chatCallbackUrl, environment, mode. Required behavior: validate Bearer token, respond HTTP 202, process asynchronously, send result via callback." },
      { title: "Callback Response Patterns", content: "Three types: 1) Normal completed response (status: completed, responseText, idempotencyKey). 2) needs_info (status: needs_info, clarifying question). 3) cross_app_request (status: cross_app_request, crossAppQuestion, crossAppTargetApps, crossAppContext). IMPORTANT: Send callbacks to callbackUrl only, HPG's handler automatically writes to chat thread." },
      { title: "AI-Powered Response Setup", content: "Receive task at POST /api/agent/inbox, respond HTTP 202 immediately, process asynchronously: extract message, extract conversation history, query own database if needed, call OpenAI (gpt-4o-mini) with app-specific system prompt and conversation history, send completed callback." },
      { title: "Authentication Setup", content: "Matching service tokens on both sides. For HS3: HPG sets HPG_TO_HS3_SERVICE_TOKEN, HS3 sets HS3_TO_HPG_SERVICE_TOKEN (same value). For new apps: Generate strong random token (32+ chars), store on HPG as HPG_TO_{APP}_SERVICE_TOKEN, on app as {APP}_TO_HPG_SERVICE_TOKEN. Validate Authorization: Bearer header in inbox handler." },
    ],
    files: ["server/routes.ts"],
    apiRoutes: ["POST /api/agent/inbox"],
    dependencies: ["OpenAI (gpt-4o-mini)", "Node.js fetch API", "Service tokens (Bearer auth)"],
  },
  {
    id: "oc-initial-setup",
    title: "OpenClaw -- Initial Setup & Configuration",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Step-by-step guide for deploying OpenClaw from scratch: Replit project creation, database provisioning, environment secrets, workflow configuration, and first-run validation. Covers PostgreSQL setup, npm dependencies, and verifying the Express + Vite dev server starts correctly.",
    sections: [
      { title: "Step 1: Create the Replit Project", content: "Fork or create a new Replit project from the OpenClaw template. The project uses a monorepo structure: client/ (React + Vite frontend), server/ (Express backend), shared/ (Drizzle schemas and types). The workflow 'Start application' runs 'npm run dev' which starts both the Express server and Vite dev server on the same port." },
      { title: "Step 2: Provision the Database", content: "Use Replit's built-in PostgreSQL database. The database is automatically provisioned and the DATABASE_URL secret is set. Run 'npm run db:push' to sync the Drizzle schema to the database. This creates all required tables: machines, integrations, skills, ai_conversations, ai_messages, and all Automation Hub tables." },
      { title: "Step 3: Core Environment Secrets", content: "Set these secrets in Replit's Secrets panel: OPENROUTER_API_KEY (required for AI Task Runner and Voice Chat LLM), OPENAI_API_KEY (required for Voice Chat TTS/STT via OpenAI Whisper and TTS-1), GEMINI_API_KEY (optional, for Gemini Anti-Gravity Proxy). These are the minimum secrets needed to get the dashboard running with AI features." },
      { title: "Step 4: Start & Validate", content: "Click Run or start the 'Start application' workflow. The Express server starts on port 5000, Vite proxies the frontend. Navigate to the root URL to see the Overview dashboard. Verify: sidebar navigation loads, Overview page shows system stats, no console errors. The app uses Replit Auth for authentication." },
      { title: "Step 5: First-Run Checklist", content: "1) Visit /admin to access the admin panel. 2) Visit /secrets to see which API keys are configured vs missing. 3) Visit /settings/integrations to configure WhatsApp, Telegram, or Omi connections. 4) Visit /node-setup to set up your first gateway node if connecting to a VPS." },
    ],
    files: ["server/index.ts", "server/routes.ts", "shared/schema.ts", "client/src/App.tsx", "client/src/components/app-sidebar.tsx"],
    apiRoutes: ["GET /api/health", "GET /api/settings"],
    dependencies: ["PostgreSQL (Replit)", "Express", "Vite", "Drizzle ORM"],
  },
  {
    id: "oc-persistent-memory",
    title: "OpenClaw -- Persistent Memory System",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Conversation history and context persistence across all AI interfaces (AI Task Runner, Voice Chat, WhatsApp). Uses ai_conversations and ai_messages tables to maintain multi-turn context, tool execution history, and per-phone-number WhatsApp memory. Conversations survive restarts and are queryable per user and instance.",
    sections: [
      { title: "Database Schema", content: "ai_conversations: id (UUID), userId, instanceId, title (defaults to 'New Conversation'), createdAt, updatedAt. ai_messages: id (UUID), conversationId (FK), role (user/assistant/system/tool), content (text), toolName, toolInput, toolOutput, createdAt. Every interaction across AI Task Runner, Voice Chat, and WhatsApp is persisted to these tables." },
      { title: "AI Task Runner Memory", content: "Each conversation in the AI Task Runner has full history. When a user sends a message, the processAiMessage function loads all prior messages in the conversation, sends them as context to the LLM (OpenRouter), and saves both the prompt and response. Tool calls (SSH commands, file reads) are also persisted with toolName, toolInput, and toolOutput fields." },
      { title: "Voice Chat Memory", content: "Voice conversations maintain a local message history array that is sent with each /api/voice/chat request. The server processes the full conversation history through the LLM for contextual responses. Conversation history persists for the duration of the voice session." },
      { title: "WhatsApp Memory", content: "WhatsApp conversations are maintained per phone number. The bot uses @whiskeysockets/baileys and listens for messaging-history.set events to sync chats and messages on connection. Each incoming message is processed with context from previous messages in that chat. History is maintained across bot restarts." },
      { title: "How to Set Up", content: "Persistent memory works automatically once the database is provisioned. Run 'npm run db:push' to create the ai_conversations and ai_messages tables. No additional configuration is needed. Conversations are created automatically when users start chatting via any interface." },
    ],
    files: ["shared/schema.ts", "server/ai-task-runner.ts", "server/routes.ts", "server/bot/whatsapp.ts"],
    apiRoutes: ["GET /api/ai/conversations", "POST /api/ai/conversations", "POST /api/ai/conversations/:id/messages", "GET /api/ai/conversations/:id/messages"],
    dependencies: ["Drizzle ORM", "PostgreSQL", "OpenRouter"],
  },
  {
    id: "oc-voice-chat",
    title: "OpenClaw -- Voice Conversation System",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Two-way voice conversation with the OpenClaw agent featuring browser-based speech recognition (Web Speech API), OpenAI TTS-1 synthesis with selectable voices, continuous conversation mode with auto-reactivation, silence detection, and a streaming voice API for external devices like smartwatches with token-based authentication.",
    sections: [
      { title: "How It Works", content: "1) User speaks into the browser microphone. 2) Browser Web Speech API transcribes speech to text in real-time. 3) Transcribed text is sent to /api/voice/chat endpoint. 4) Server routes the message through OpenRouter/OpenAI LLM for a text response. 5) Response text is sent to /api/voice/tts for OpenAI TTS-1 synthesis. 6) MP3 audio stream is played back in the browser. In Continuous Mode, the mic reactivates automatically after playback." },
      { title: "Speech Recognition (STT)", content: "Uses the browser's native Web Speech API (window.SpeechRecognition). The useSpeechRecognition hook handles continuous listening, interim results, and a 2-second silence timeout that auto-sends the message when the user stops talking. Push-to-talk mode is also available." },
      { title: "Text-to-Speech (TTS)", content: "Uses OpenAI's TTS-1 model via /api/voice/tts endpoint. Supports selectable voices. Audio is streamed as MP3 chunks directly to the client. Falls back to browser's native speechSynthesis if the API call fails." },
      { title: "Watch App / External Device API", content: "/api/voice/token generates a 24-hour Bearer token for voice-only sessions (no browser session needed). /api/voice/stt accepts multipart audio uploads and transcribes via OpenAI Whisper-1. /api/voice/stream-chat combines STT + LLM Chat + TTS in a single request, returning transcript and audio URL. /api/voice/audio/:audioId serves cached TTS audio." },
      { title: "Setup Requirements", content: "Set OPENAI_API_KEY secret (required for TTS-1 and Whisper). Set OPENROUTER_API_KEY secret (required for LLM chat responses). No additional configuration needed. Navigate to /voice-chat to start a conversation. For external devices, call POST /api/voice/token to get an auth token." },
    ],
    files: ["client/src/pages/voice-chat.tsx", "server/routes.ts", "server/bot/openrouter.ts"],
    apiRoutes: ["POST /api/voice/chat", "POST /api/voice/tts", "POST /api/voice/stt", "POST /api/voice/stream-chat", "POST /api/voice/token", "GET /api/voice/audio/:audioId"],
    dependencies: ["OpenAI (TTS-1, Whisper-1)", "OpenRouter", "Web Speech API"],
  },
  {
    id: "oc-ai-task-runner",
    title: "OpenClaw -- AI Task Runner",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Conversational LLM interface for executing whitelisted SSH commands on the VPS. Uses OpenRouter (DeepSeek models) with tool-calling capabilities for server management tasks including log checking, service restarts, disk usage analysis, and node file operations. Full conversation history with tool execution persistence.",
    sections: [
      { title: "What It Does", content: "A chat-based interface where you type natural language commands and the AI translates them into server operations. For example: 'Check disk usage on the VPS' triggers the disk_usage tool, 'Restart the Docker containers' triggers the restart_service tool. The AI decides which tools to use based on your request." },
      { title: "VPS Tools", content: "VPS_TOOL_COMMANDS include: check_logs (view recent logs), restart_service (restart Docker containers or services), disk_usage (check storage), list_processes (running processes), check_memory (RAM usage), network_status (connection info). Each command is whitelisted and executed via SSH." },
      { title: "Node Tools", content: "NODE_TOOLS for interacting with connected gateway nodes: read_file (read files on remote nodes), write_file (write/update files), run_command (execute commands on nodes), list_files (directory listing). These operate through the gateway proxy WebSocket connection." },
      { title: "Persistent Conversations", content: "Every message, AI response, and tool execution is saved to ai_conversations and ai_messages tables. Tool calls persist toolName, toolInput, and toolOutput. When you return to a conversation, the full history is loaded and sent to the LLM for context continuity." },
      { title: "Setup Requirements", content: "Set OPENROUTER_API_KEY for the LLM. Set HOSTINGER_API_KEY and configure VPS connection at /settings/vps with the VPS IP (SSH access). Navigate to /ai-tasks to start using the AI Task Runner. Conversations are automatically created and persisted." },
    ],
    files: ["server/ai-task-runner.ts", "server/routes.ts", "client/src/pages/ai-task-runner.tsx", "shared/schema.ts"],
    apiRoutes: ["GET /api/ai/conversations", "POST /api/ai/conversations", "POST /api/ai/conversations/:id/messages", "GET /api/ai/conversations/:id/messages", "DELETE /api/ai/conversations/:id"],
    dependencies: ["OpenRouter", "SSH2", "Drizzle ORM"],
  },
  {
    id: "oc-whatsapp-telegram",
    title: "OpenClaw -- WhatsApp & Telegram Bots",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Multi-platform messaging bot system with WhatsApp (Baileys) and Telegram integration. WhatsApp uses QR/pairing code authentication with message history sync. Supports Home Bot (local relay) and VPS Bot (direct connection) modes. Per-phone-number persistent conversation memory.",
    sections: [
      { title: "WhatsApp Bot", content: "Uses @whiskeysockets/baileys library for WhatsApp Web protocol. Supports two connection modes: QR code scan and pairing code (phone number entry). On connection, syncs full message history via messaging-history.set event. Processes incoming messages in real-time via messages.upsert listener." },
      { title: "Home Bot vs VPS Bot", content: "Home Bot: Runs locally and relays messages to the central server via POST /api/whatsapp/home-bot-message. VPS Bot: Runs directly on the VPS/server with direct WhatsApp connection. Both modes support AI-powered responses using the configured LLM." },
      { title: "Telegram Bot", content: "Telegram integration for receiving and sending messages through the Telegram Bot API. Configure with a Telegram bot token in the integrations settings." },
      { title: "Persistent Memory", content: "WhatsApp conversations are maintained per phone number. Message history survives bot restarts through the Baileys history sync mechanism. AI responses use conversation context for continuity." },
      { title: "Setup Instructions", content: "1) Navigate to /settings/integrations. 2) For WhatsApp: Click 'Connect WhatsApp' and scan the QR code or enter your phone number for pairing. 3) For Telegram: Enter your Telegram Bot Token (get from @BotFather). 4) The bot will start responding to messages automatically using the configured LLM." },
    ],
    files: ["server/bot/whatsapp.ts", "server/routes.ts", "client/src/pages/settings-openclaw.tsx"],
    apiRoutes: ["GET /api/whatsapp/sessions", "POST /api/whatsapp/pair", "POST /api/whatsapp/home-bot-message", "GET /api/whatsapp/qr"],
    dependencies: ["@whiskeysockets/baileys", "OpenRouter"],
  },
  {
    id: "oc-vps-monitoring",
    title: "OpenClaw -- VPS & Docker Monitoring",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Real-time monitoring of Hostinger VPS including Docker container management, system resource charts (CPU, Memory, Disk, Network), firewall configuration, backup management, and SSH file browser. Connects via Hostinger API and direct SSH for comprehensive server control.",
    sections: [
      { title: "VPS Dashboard", content: "Real-time monitoring at /vps-monitor showing: Docker container status (running/stopped/restarting), system resource usage graphs, firewall rules, and backup schedules. Data refreshes automatically via polling." },
      { title: "Docker Management", content: "View all Docker containers with status indicators. Start, stop, restart, and view logs for individual containers. Monitor container resource usage and health checks." },
      { title: "System Monitor", content: "Dedicated /system-monitor page with real-time charts for CPU usage, memory consumption, disk I/O, and network throughput. Historical data visualization for trend analysis." },
      { title: "File Manager", content: "SSH-based file browser at /files. Browse, view, edit, and download files on the VPS. Navigate directories, view file contents, and manage remote files without a separate SSH client." },
      { title: "Setup Requirements", content: "Set HOSTINGER_API_KEY secret for API access. Configure VPS connection at /settings/vps with: VPS IP address (e.g., 72.60.167.64), SSH credentials. The system connects via both the Hostinger API and direct SSH." },
    ],
    files: ["client/src/pages/vps-monitoring.tsx", "client/src/pages/system-monitor.tsx", "client/src/pages/file-manager.tsx", "server/routes.ts"],
    apiRoutes: ["GET /api/vps/status", "GET /api/vps/containers", "POST /api/vps/containers/:id/restart", "GET /api/vps/system-stats"],
    dependencies: ["Hostinger API", "SSH2", "Chart.js"],
  },
  {
    id: "oc-node-gateway",
    title: "OpenClaw -- Node Gateway & Heartbeat System",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Multi-node management system with lightweight heartbeat agents, WebSocket gateway proxy for remote node connections, node setup wizard, and bulk operations (restart, CSV export). Nodes report status via POST /api/node/heartbeat, updating lastSeen timestamps for uptime monitoring.",
    sections: [
      { title: "Node Heartbeat", content: "Remote machines run a lightweight agent that periodically POSTs to /api/node/heartbeat with system stats (CPU, memory, disk, uptime). The server updates the machine's lastSeen timestamp in the machines table. Nodes with stale heartbeats are flagged as offline in the dashboard." },
      { title: "Gateway Proxy", content: "WebSocket-based gateway proxy (server/gateway-proxy.ts) enables real-time bidirectional communication between the dashboard and remote nodes. Supports file read/write, command execution, and status monitoring through the WebSocket channel." },
      { title: "Node Setup Wizard", content: "Guided multi-step setup at /node-setup: 1) Choose node type (VPS, local, cloud). 2) Configure SSH/connection details. 3) Install the heartbeat agent. 4) Verify connectivity. 5) Register the node in the machines table." },
      { title: "Machines Management", content: "At /settings/machines: View all registered nodes with status indicators (online/offline/warning). Bulk operations: restart agents, update configs, export machine list as CSV. Individual machine detail view with connection logs." },
      { title: "Setup Instructions", content: "1) Navigate to /node-setup and follow the wizard. 2) Install the heartbeat agent on your target machine using the provided script. 3) The agent will start reporting to /api/node/heartbeat automatically. 4) View node status on the Overview page and /settings/machines." },
    ],
    files: ["server/gateway-proxy.ts", "server/routes.ts", "client/src/pages/node-setup-wizard.tsx", "client/src/pages/settings-machines.tsx", "shared/schema.ts"],
    apiRoutes: ["POST /api/node/heartbeat", "GET /api/machines", "POST /api/machines", "PATCH /api/machines/:id", "DELETE /api/machines/:id"],
    dependencies: ["WebSocket (ws)", "SSH2", "Drizzle ORM"],
  },
  {
    id: "oc-automation-hub",
    title: "OpenClaw -- Automation Hub (10 Features)",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Suite of 10 life automation features: Daily Briefing (AI morning plans), Health Tracker (with Oura Ring), Todo List (with Omi AI wearable), Finance (multi-section tracking), Habits (streak counting with Omi analysis), Home Automation (Home Assistant + production gear), Meeting Prep AI, SOP Library (AI-generated procedures), Focus Timer (Pomodoro), and Life Calendar (Google Calendar sync with WhatsApp reminders).",
    sections: [
      { title: "Daily Briefing", content: "AI-generated morning action plan at /daily-briefing. Aggregates node status, project summaries, and generates a motivational quote. Requires OPENROUTER_API_KEY." },
      { title: "Health Tracker & Oura Ring", content: "Daily health logging at /health-tracker: sleep hours, water glasses, exercise minutes, mood, weight, energy level. Weekly charts for trend analysis. Oura Ring integration panel shows sleep score, readiness, activity, and HRV. Requires OURA_API_TOKEN secret for Oura data." },
      { title: "Todo List & Omi AI", content: "Task management at /todo-list with 'Pull from Omi' feature that analyzes recent Omi AI wearable conversations to auto-extract action items. Manual add, priority levels, dismiss/restore, status filtering. Requires OMI_API_KEY." },
      { title: "Finance Dashboard", content: "Multi-section income/expense tracking at /finance with Personal, Business 1, and Business 2 tabs. Category breakdown, monthly summary, spending charts. Placeholder integrations for QuickBooks, Stifel Wealth Tracker, and Voya Retirement." },
      { title: "Habits & Home Automation", content: "Habits at /habits: creation, daily completion, streak counting, 30-day visual grid, and 'Analyze from Omi' for routine discovery. Home Automation at /home-automation: Devices/Production/Bridges tabs with GoStream, ATEM Mini Pro ISO, and Bitfocus Companion iframe embeds." },
      { title: "Meeting Prep, SOP, Focus Timer, Life Calendar", content: "Meeting Prep AI at /meeting-prep: AI briefs with talking points, questions, objection handling. SOP Library at /sop-library: AI-generated procedures from templates. Focus Timer at /focus-timer: Pomodoro with SVG visualization and weekly analytics. Life Calendar at /life-calendar: month/list views synced with Google Calendar, WhatsApp/email reminders for meetings." },
    ],
    files: ["client/src/pages/daily-briefing.tsx", "client/src/pages/health-tracker.tsx", "client/src/pages/grocery-list.tsx", "client/src/pages/finance.tsx", "client/src/pages/habits.tsx", "client/src/pages/home-automation.tsx", "client/src/pages/meeting-prep.tsx", "client/src/pages/sop-library.tsx", "client/src/pages/focus-timer.tsx", "client/src/pages/life-calendar.tsx"],
    apiRoutes: ["GET /api/daily-briefing", "GET /api/health-logs", "POST /api/health-logs", "GET /api/grocery-items", "POST /api/grocery-items", "GET /api/financial-transactions", "POST /api/financial-transactions", "GET /api/habits", "POST /api/habits", "GET /api/meeting-preps", "POST /api/meeting-preps/generate", "GET /api/omi/sops", "GET /api/focus-sessions", "POST /api/focus-sessions", "GET /api/life-events", "POST /api/life-events"],
    dependencies: ["OpenRouter", "OpenAI", "Oura Cloud API v2", "Omi API", "Google Calendar API", "Drizzle ORM"],
  },
  {
    id: "oc-skills-marketplace",
    title: "OpenClaw -- Skills & Marketplace",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Plugin-based skill system with a marketplace for discovering, installing, and uninstalling skill plugins. Periodic hourly auto-discovery of new skills with manual trigger and UI notifications. Custom Skill Builder for deploying private skills to the VPS via SSH.",
    sections: [
      { title: "Marketplace", content: "Browse available skills at /marketplace. Each skill has a name, description, category, and install/uninstall toggle. Skills extend OpenClaw's capabilities with new commands, integrations, or automation workflows." },
      { title: "Skill Discovery", content: "Automatic hourly checks for new skills. Manual trigger available from the marketplace. UI notifications when new skills are discovered. Skills are registered in the skills table with metadata." },
      { title: "Custom Skill Builder", content: "Deploy private skills to the VPS via SSH. Define skill name, entry point, dependencies, and configuration. The builder packages the skill and deploys it to the gateway node." },
      { title: "Setup", content: "The marketplace is available at /marketplace with no additional configuration. For custom skills, ensure VPS SSH access is configured at /settings/vps." },
    ],
    files: ["client/src/pages/marketplace.tsx", "server/routes.ts", "shared/schema.ts"],
    apiRoutes: ["GET /api/skills", "POST /api/skills/install", "POST /api/skills/uninstall", "POST /api/skills/discover"],
    dependencies: ["SSH2", "Drizzle ORM"],
  },
  {
    id: "oc-admin-tools",
    title: "OpenClaw -- Admin & Developer Tools",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Administrative toolset including: Secrets Inventory (API key status dashboard), Replit Projects manager (bulk import, health checks, AI evaluation), Activity Log (paginated audit trail), OpenClaw Commands (CLI reference), Gemini Anti-Gravity Proxy (OpenAI-compatible proxy for Gemini models), and Feature Documentation system.",
    sections: [
      { title: "Secrets Inventory", content: "Dashboard at /secrets showing all configured vs missing API keys and credentials. Displays status without exposing actual values. Helps verify which integrations are ready and which need configuration." },
      { title: "Replit Projects", content: "Project management at /replit-projects. Bulk import projects, run health checks, and use AI-powered project evaluation to assess code quality and suggest improvements." },
      { title: "Activity Log", content: "Paginated audit trail at /activity-log tracking all mutation actions within the dashboard: settings changes, bot connections, skill installations, and data modifications." },
      { title: "Gemini Proxy", content: "OpenAI-compatible proxy for Google Gemini models at /settings/gemini-proxy. Provides chat completions and embeddings endpoints. Configurable upstream URL, model mapping, and rate limits. Requires GEMINI_API_KEY." },
      { title: "Feature Docs & Commands", content: "Feature Documentation system in the Admin tab with full feature docs, bundles, search/filter, email sharing, and markdown export. OpenClaw Commands at /commands: comprehensive CLI reference and troubleshooting guide." },
    ],
    files: ["client/src/pages/secrets-inventory.tsx", "client/src/pages/replit-projects.tsx", "client/src/pages/activity-log.tsx", "client/src/pages/openclaw-commands.tsx", "client/src/pages/admin.tsx", "client/src/components/admin/AdminFeatureDocs.tsx"],
    apiRoutes: ["GET /api/secrets/status", "GET /api/replit/projects", "POST /api/replit/projects/import", "GET /api/activity-log", "POST /api/gemini/v1/chat/completions"],
    dependencies: ["Gemini API", "Drizzle ORM"],
  },
  {
    id: "oc-security-agent",
    title: "OpenClaw -- Security Agent",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-04",
    summary: "Real-time security monitoring agent with threat detection, brute force prevention, rate limiting enforcement, port scan detection, API abuse monitoring, and configurable security policies.",
    sections: [
      { title: "Threat Detection", content: "Real-time monitoring of SSH brute force attempts, SQL injection probes, sequential port scans, and abnormal API usage patterns. Threats are categorized by severity (critical, high, medium, low) and automatically blocked." },
      { title: "Security Monitors", content: "Eight active monitors running continuously: SSH Brute Force Detection, API Rate Limiting, SQL Injection Scanner, Port Scan Detection, SSL Certificate Monitor, Docker Container Integrity, API Key Usage Audit, and Failed Auth Tracker." },
      { title: "Security Policies", content: "Configurable security policies including max login attempts (5 per 15 min), API rate limits (60 req/min per IP), auto-ban duration (24h after 10 violations), port scan thresholds, session timeouts, and two-factor authentication requirements." },
      { title: "Event Dashboard", content: "Real-time security event feed showing threat source IP, target endpoint/port, severity classification, block status, and timestamps. Stats dashboard with threats blocked, active monitors, auth failures, and critical alert counts." },
    ],
    files: ["client/src/pages/admin.tsx"],
    apiRoutes: ["GET /api/admin/security/events", "GET /api/admin/security/stats", "PATCH /api/admin/security/policies"],
    dependencies: [],
  },
  {
    id: "oc-integrations-setup",
    title: "OpenClaw -- Integrations & API Keys",
    version: "1.0",
    brand: "OC",
    status: "complete",
    published: "2026-03-01",
    summary: "Complete guide to configuring all OpenClaw integrations: Google Calendar, Gmail, WhatsApp (Baileys), Telegram, Omi AI Wearable, Oura Ring, Hostinger VPS, and LLM providers (OpenRouter, OpenAI, Gemini). Covers Replit integrations, manual API keys, and verification steps for each service.",
    sections: [
      { title: "Google Calendar & Gmail", content: "Use Replit's built-in Google Calendar and Gmail integrations (already installed). These provide OAuth-based access. Access calendar via getUncachableGoogleCalendarClient() and Gmail via getUncachableGmailClient(). Used by Life Calendar sync and Feature Docs email sharing." },
      { title: "LLM Providers", content: "OPENROUTER_API_KEY: Primary LLM for AI Task Runner, Voice Chat, Daily Briefing, Meeting Prep, and bot responses. OPENAI_API_KEY: Used for Voice Chat TTS (tts-1) and STT (whisper-1). GEMINI_API_KEY: Optional, for the Gemini Anti-Gravity Proxy. Set all in Replit Secrets." },
      { title: "Wearable & Health", content: "OMI_API_KEY: Connect to Omi AI wearable for Todo List 'Pull from Omi' and Habits 'Analyze from Omi' features. OURA_API_TOKEN: Connect to Oura Ring for Health Tracker sleep, readiness, activity, and HRV data. Both set in Replit Secrets." },
      { title: "VPS & Infrastructure", content: "HOSTINGER_API_KEY: For VPS monitoring API access. VPS SSH configuration at /settings/vps with IP address and credentials. The VPS IP (e.g., 72.60.167.64) is configured in settings for SSH-based operations." },
      { title: "Messaging Bots", content: "WhatsApp: Navigate to /settings/integrations and click Connect WhatsApp. Scan QR code or use pairing code. No API key needed, uses Baileys (WhatsApp Web protocol). Telegram: Enter your Telegram Bot Token from @BotFather in integration settings." },
      { title: "Verification", content: "Visit /secrets to see a dashboard of all configured vs missing keys. Green = configured, Red = missing. Each integration can be tested independently: Voice Chat tests OpenAI, AI Tasks tests OpenRouter, Health Tracker tests Oura, etc." },
    ],
    files: ["server/routes.ts", "server/googleCalendar.ts", "server/bot/whatsapp.ts", "client/src/pages/settings-integrations.tsx", "client/src/pages/secrets-inventory.tsx"],
    apiRoutes: ["GET /api/secrets/status", "GET /api/settings/integrations"],
    dependencies: ["Google Calendar API", "Gmail API", "OpenRouter", "OpenAI", "Oura Cloud API v2", "Omi API", "@whiskeysockets/baileys"],
  },
];

const FEATURE_BUNDLES: FeatureBundle[] = [
  { id: "monetization", name: "Monetization Infrastructure", description: "Complete billing, wallet, and commerce stack", mainFeature: "membership-subscription", supportingFeatures: ["prepaid-wallet", "overage-billing", "promo-codes"] },
  { id: "survey-workflow", name: "AI-Powered Survey Workflow", description: "Survey creation, AI analysis, and findings", mainFeature: "survey-system", supportingFeatures: ["doc-generation"] },
  { id: "doc-pipeline", name: "Document Generation Pipeline", description: "Template-based document creation and export", mainFeature: "doc-generation", supportingFeatures: ["survey-system"] },
  { id: "boat-platform", name: "Boat Review Platform", description: "Review workflow with proof and commerce", mainFeature: "boat-review", supportingFeatures: ["doc-generation", "listing-maker"] },
  { id: "collaboration", name: "Team Collaboration Suite", description: "Real-time editing, sharing, and presence", mainFeature: "realtime-collab", supportingFeatures: ["api-sync"] },
  { id: "data-sync", name: "External Data & Sync", description: "CRM, market data, and API synchronization", mainFeature: "api-sync", supportingFeatures: ["realtime-collab"] },
  { id: "distribution", name: "Distribution Control Layer", description: "AI marketing and multi-channel distribution", mainFeature: "dcl-marketing", supportingFeatures: ["listing-maker", "api-sync"] },
  { id: "listing-workflow", name: "Listing Maker Workflow", description: "AI-powered listing creation and syndication", mainFeature: "listing-maker", supportingFeatures: ["doc-generation", "dcl-marketing"] },
  { id: "admin-ops", name: "Admin & Operations", description: "Settings, marketplace, and operational tools", mainFeature: "membership-subscription", supportingFeatures: ["promo-codes", "overage-billing"] },
  { id: "onboarding", name: "User Onboarding & Engagement", description: "Tours, demos, and feature discovery", mainFeature: "demo-tour", supportingFeatures: ["survey-system"] },
  { id: "warroom-command-suite", name: "War Room Command Suite", description: "Complete cross-app operations command center with real-time dashboards, AI-powered agent console, tri-pane cockpit, conversational engineering chat, cross-app communication workflows, settings backup/restore snapshots, and full external app integration guide", mainFeature: "warroom-ops-dashboard", supportingFeatures: ["warroom-agent-console", "warroom-agent-cockpit", "warroom-context-json", "warroom-engineering-chat", "warroom-cross-app", "warroom-settings-snapshots", "warroom-integration-guide"] },
  { id: "openclaw-setup-guide", name: "OpenClaw Complete Setup Guide", description: "Everything you need to set up OpenClaw from beginning to end: initial project setup, database provisioning, API key configuration, persistent memory, voice conversations, AI task runner, WhatsApp/Telegram bots, VPS monitoring, node gateway, all 10 Automation Hub features, skills marketplace, admin tools, and security agent", mainFeature: "oc-initial-setup", supportingFeatures: ["oc-integrations-setup", "oc-persistent-memory", "oc-voice-chat", "oc-ai-task-runner", "oc-whatsapp-telegram", "oc-vps-monitoring", "oc-node-gateway", "oc-automation-hub", "oc-skills-marketplace", "oc-admin-tools", "oc-security-agent"] },
];

function generateFeatureMarkdown(doc: FeatureDoc): string {
  let md = `# ${doc.title} (v${doc.version})\n\n`;
  md += `**Brand:** ${doc.brand}\n\n`;
  md += `**Published:** ${doc.published}\n\n`;
  md += `**Status:** ${doc.status}\n\n`;
  md += `## Summary\n${doc.summary}\n\n`;
  for (const section of doc.sections) {
    md += `## ${section.title}\n${section.content}\n\n`;
  }
  if (doc.apiRoutes.length) {
    md += `## API Routes\n${doc.apiRoutes.map(r => `- \`${r}\``).join("\n")}\n\n`;
  }
  if (doc.files.length) {
    md += `## Files\n${doc.files.map(f => `- \`${f}\``).join("\n")}\n\n`;
  }
  if (doc.dependencies.length) {
    md += `## Dependencies\n${doc.dependencies.map(d => `- ${d}`).join("\n")}\n`;
  }
  return md;
}

function generateBundlePackage(bundle: FeatureBundle): string {
  const mainDoc = FEATURE_DOCS.find(d => d.id === bundle.mainFeature);
  const supportDocs = bundle.supportingFeatures.map(id => FEATURE_DOCS.find(d => d.id === id)).filter(Boolean) as FeatureDoc[];
  let md = `# Bundle: ${bundle.name}\n\n`;
  md += `**Description:** ${bundle.description}\n\n`;
  md += `**Generated:** ${new Date().toISOString().split("T")[0]}\n\n`;
  md += `---\n\n`;
  if (mainDoc) {
    md += `## Main Feature\n\n${generateFeatureMarkdown(mainDoc)}\n\n---\n\n`;
  }
  md += `## Supporting Features\n\n`;
  for (const doc of supportDocs) {
    md += `${generateFeatureMarkdown(doc)}\n\n---\n\n`;
  }
  return md;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function FeatureCard({ doc, onSelect }: { doc: FeatureDoc; onSelect: (doc: FeatureDoc) => void }) {
  return (
    <Card className="cursor-pointer" onClick={() => onSelect(doc)} data-testid={`card-feature-${doc.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {doc.title}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge className={`${BRAND_COLORS[doc.brand]} text-white text-xs`}>{doc.brand}</Badge>
            <Badge variant="outline" className="text-xs">v{doc.version}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground line-clamp-2">{doc.summary}</p>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{doc.apiRoutes.length} routes</span>
          <span>{doc.files.length} files</span>
          <span>{doc.published}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureDetail({ doc, onClose, onShare }: { doc: FeatureDoc; onClose: () => void; onShare: (doc: FeatureDoc) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(generateFeatureMarkdown(doc));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card data-testid="card-feature-detail">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {doc.title}
            <Badge className={`${BRAND_COLORS[doc.brand]} text-white text-xs`}>{doc.brand}</Badge>
            <Badge variant="outline" className="text-xs">v{doc.version}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy-feature">
              {copied ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadMarkdown(`${doc.brand}-${doc.id}-v${doc.version}-feature-doc.md`, generateFeatureMarkdown(doc))} data-testid="button-download-feature">
              <Download className="h-3 w-3 mr-1" /> Download
            </Button>
            <Button variant="outline" size="sm" onClick={() => onShare(doc)} data-testid="button-share-feature">
              <Send className="h-3 w-3 mr-1" /> Share
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-detail">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{doc.summary}</p>
        <p className="text-xs text-muted-foreground">Published: {doc.published}</p>
        {doc.sections.map((section, i) => (
          <div key={i}>
            <h3 className="text-sm font-semibold mb-1">{section.title}</h3>
            <p className="text-sm text-muted-foreground">{section.content}</p>
          </div>
        ))}
        {doc.apiRoutes.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-1">API Routes ({doc.apiRoutes.length})</h3>
            <div className="bg-muted p-3 rounded-md space-y-1">
              {doc.apiRoutes.map((route, i) => (
                <p key={i} className="text-xs font-mono">{route}</p>
              ))}
            </div>
          </div>
        )}
        {doc.files.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-1">Files ({doc.files.length})</h3>
            <div className="bg-muted p-3 rounded-md space-y-1">
              {doc.files.map((file, i) => (
                <p key={i} className="text-xs font-mono">{file}</p>
              ))}
            </div>
          </div>
        )}
        {doc.dependencies.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-1">Dependencies</h3>
            <div className="flex flex-wrap gap-1">
              {doc.dependencies.map((dep, i) => (
                <Badge key={i} variant="outline" className="text-xs">{dep}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BundleCard({ bundle, onExpandToggle, expanded }: { bundle: FeatureBundle; onExpandToggle: () => void; expanded: boolean }) {
  const mainDoc = FEATURE_DOCS.find(d => d.id === bundle.mainFeature);
  const supportDocs = bundle.supportingFeatures.map(id => FEATURE_DOCS.find(d => d.id === id)).filter(Boolean) as FeatureDoc[];

  return (
    <Card data-testid={`card-bundle-${bundle.id}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={onExpandToggle}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Package className="h-4 w-4 text-purple-500" />
            {bundle.name}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">{1 + bundle.supportingFeatures.length} features</Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">{bundle.description}</p>
          {mainDoc && (
            <div className="flex items-center gap-2 p-2 rounded border bg-muted/50">
              <Badge className={`${BRAND_COLORS[mainDoc.brand]} text-white text-xs`}>{mainDoc.brand}</Badge>
              <span className="text-xs font-medium">{mainDoc.title}</span>
              <Badge variant="outline" className="text-xs ml-auto">Main</Badge>
            </div>
          )}
          {supportDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 p-2 rounded border">
              <Badge className={`${BRAND_COLORS[doc.brand]} text-white text-xs`}>{doc.brand}</Badge>
              <span className="text-xs">{doc.title}</span>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={(e) => { e.stopPropagation(); downloadMarkdown(`bundle-${bundle.id}-package.md`, generateBundlePackage(bundle)); }}
            data-testid={`button-export-bundle-${bundle.id}`}
          >
            <Download className="h-3 w-3 mr-1" /> Export Bundle
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

function ShareDialog({ doc, open, onOpenChange }: { doc: FeatureDoc | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [shareMode, setShareMode] = useState<"email" | "replit">("email");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [replitSlug, setReplitSlug] = useState("");

  const emailMutation = useMutation({
    mutationFn: (data: { to: string; subject: string; body: string }) =>
      apiRequest("POST", "/api/admin/feature-docs/send-email", data),
    onSuccess: () => {
      toast({ title: "Email sent", description: `Feature doc sent to ${emailTo}` });
      onOpenChange(false);
      setEmailTo(""); setEmailMessage("");
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSendToReplit = () => {
    if (!doc || !replitSlug.trim()) {
      toast({ title: "Enter a project slug", variant: "destructive" });
      return;
    }
    const filename = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + "-feature-doc.md";
    downloadMarkdown(filename, generateFeatureMarkdown(doc));
    toast({
      title: "Feature doc downloaded",
      description: `Save "${filename}" to the target project's feature-docs/ folder. Project: ${replitSlug}`,
    });
    onOpenChange(false);
    setReplitSlug("");
  };

  if (!doc) return null;

  const markdown = generateFeatureMarkdown(doc);
  const defaultSubject = `Feature Doc: ${doc.title} v${doc.version} [${doc.brand}]`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-share-feature">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Share Feature Doc
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 rounded border bg-muted/50">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">{doc.title}</span>
            <Badge className={`${BRAND_COLORS[doc.brand]} text-white text-xs ml-auto`}>{doc.brand}</Badge>
          </div>

          <div className="flex gap-2">
            <Button variant={shareMode === "email" ? "default" : "outline"} size="sm" onClick={() => setShareMode("email")} data-testid="button-share-email">
              <Mail className="h-3 w-3 mr-1" /> Email
            </Button>
            <Button variant={shareMode === "replit" ? "default" : "outline"} size="sm" onClick={() => setShareMode("replit")} data-testid="button-share-replit">
              <ExternalLink className="h-3 w-3 mr-1" /> Replit Project
            </Button>
          </div>

          {shareMode === "email" ? (
            <div className="space-y-3">
              <div>
                <Label>To (email address)</Label>
                <Input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="colleague@company.com" data-testid="input-share-email-to" />
              </div>
              <div>
                <Label>Subject</Label>
                <Input value={emailSubject || defaultSubject} onChange={e => setEmailSubject(e.target.value)} data-testid="input-share-email-subject" />
              </div>
              <div>
                <Label>Message (optional)</Label>
                <Textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="Here's the feature documentation..." rows={3} data-testid="input-share-email-message" />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (!emailTo.includes("@")) {
                    toast({ title: "Invalid email", variant: "destructive" });
                    return;
                  }
                  const body = emailMessage ? `${emailMessage}\n\n---\n\n${markdown}` : markdown;
                  emailMutation.mutate({ to: emailTo, subject: emailSubject || defaultSubject, body });
                }}
                disabled={emailMutation.isPending}
                data-testid="button-send-email"
              >
                {emailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                Send via Email
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Replit Project Slug or URL</Label>
                <Input value={replitSlug} onChange={e => setReplitSlug(e.target.value)} placeholder="@username/project-name or replit URL" data-testid="input-share-replit-slug" />
                <p className="text-xs text-muted-foreground mt-1">The feature doc will be saved as a file in the target project's feature-docs folder.</p>
              </div>
              <Button
                className="w-full"
                onClick={handleSendToReplit}
                data-testid="button-send-replit"
              >
                <Download className="h-4 w-4 mr-1" />
                Download for Replit Project
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminFeatureDocs() {
  const [view, setView] = useState<"features" | "bundles">("features");
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<FeatureDoc | null>(null);
  const [shareDoc, setShareDoc] = useState<FeatureDoc | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

  const filteredDocs = FEATURE_DOCS.filter(doc => {
    if (brandFilter !== "all" && doc.brand !== brandFilter) return false;
    if (search && !doc.title.toLowerCase().includes(search.toLowerCase()) && !doc.summary.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const brands = Array.from(new Set(FEATURE_DOCS.map(d => d.brand))).sort();
  const brandCounts = brands.reduce((acc, b) => { acc[b] = FEATURE_DOCS.filter(d => d.brand === b).length; return acc; }, {} as Record<string, number>);

  const toggleBundle = (id: string) => {
    setExpandedBundles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleShare = (doc: FeatureDoc) => {
    setShareDoc(doc);
    setShareOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="section-feature-docs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-feature-docs-title">
            <FileText className="h-5 w-5" />
            Feature Documentation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {FEATURE_DOCS.length} features across {brands.length} brands. Share and export feature documentation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "features" ? "default" : "outline"} size="sm" onClick={() => setView("features")} data-testid="button-view-features">
            <FileText className="h-4 w-4 mr-1" /> Features
          </Button>
          <Button variant={view === "bundles" ? "default" : "outline"} size="sm" onClick={() => setView("bundles")} data-testid="button-view-bundles">
            <Layers className="h-4 w-4 mr-1" /> Bundles
          </Button>
        </div>
      </div>

      {view === "features" && (
        <>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search features..." className="pl-9" data-testid="input-search-features" />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-brand-filter">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands ({FEATURE_DOCS.length})</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b} value={b}>{b} ({brandCounts[b]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDoc ? (
            <FeatureDetail doc={selectedDoc} onClose={() => setSelectedDoc(null)} onShare={handleShare} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDocs.map(doc => (
                <FeatureCard key={doc.id} doc={doc} onSelect={setSelectedDoc} />
              ))}
              {filteredDocs.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No features match your search.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {view === "bundles" && (
        <div className="space-y-3">
          {FEATURE_BUNDLES.map(bundle => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              expanded={expandedBundles.has(bundle.id)}
              onExpandToggle={() => toggleBundle(bundle.id)}
            />
          ))}
        </div>
      )}

      <ShareDialog doc={shareDoc} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
