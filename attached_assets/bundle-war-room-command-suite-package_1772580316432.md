# Bundle: War Room Command Suite

**Description:** Complete cross-app operations command center with real-time dashboards, AI-powered agent console, tri-pane cockpit, conversational engineering chat with full-screen expansion and copy-to-clipboard sharing, cross-app communication workflows, settings backup/restore snapshots, and full external app integration guide.

**Generated:** March 3, 2026

**Total Features:** 8

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Main Feature

# War Room — Operations Dashboard (v2.0 — Feb 10, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 10, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
A read-only operations intelligence dashboard that aggregates KPI data, strategic insights, and board activity from Harbor Shoppers. Provides staff and admin users with a unified view of cross-portfolio operational health. Acts as the home tab for the War Room, housing real-time status panels for all connected apps (HPG, Harbor Shoppers 3.0, Doc Captain).

## What It Is
The War Room Operations Dashboard is the central nerve center of the Harbor Platform Group. It provides a real-time, read-only view of operational intelligence aggregated from all connected applications in the HPG ecosystem:

- **HPG (Harbor Platform Group)**: Identity provider, wallet system, entitlements, portfolio management, audit logging, Knowledge Vault, App Factory, and monetization
- **Harbor Shoppers 3.0 (HS3)**: E-commerce operations, WooCommerce product management, order processing, inventory tracking, customer data, pricing, and analytics
- **Doc Captain (DC3)**: Maritime documentation management, vessel data, compliance tracking, certificate management, crew documentation, and vessel registry operations

The dashboard surfaces KPIs, board statuses, and strategic insights without requiring the admin to switch between applications. It is the "home base" from which all War Room operations are launched.

## Architecture & Design
The War Room is a single-page React component (war-room.tsx, ~4900 lines) with tabbed navigation:

1. **Operations Tab** — KPI panels, app status cards, board activity feed
2. **Agent Console Tab** — Command mode for dispatching tasks to apps
3. **Agent Cockpit Tab** — Tri-pane per-app feed view with real-time monitoring
4. **Engineering Chat Tab** — Conversational multi-turn AI chat with all apps

Data flows:
- HPG queries its own database directly for portfolio, user, and financial data
- HS3 and DC3 data arrives via the Agent Console callback system (task dispatch → app processes → callback response)
- All data is displayed read-only — no mutations happen from the dashboard view

Access control:
- Staff role: Can view the Operations Dashboard (read-only)
- Admin role: Full access to all tabs including Agent Console, Cockpit, and Chat

## Connected Apps Configuration
The War Room connects to three applications via a centralized app registry:

APP_CONFIG = {
  hpg: {
    label: "HPG",
    fullName: "Harbor Platform Group",
    url: (self — localhost:5000),
    inboxUrl: "/api/agent/inbox",
    token: HS3_TO_HPG_SERVICE_TOKEN (self-token)
  },
  hs3: {
    label: "HARBOR SHOPPERS",
    fullName: "Harbor Shoppers 3.0",
    url: HS3_BASE_URL_DEV,
    inboxUrl: "/api/agent/inbox",
    token: HPG_TO_HS3_SERVICE_TOKEN
  },
  dc3: {
    label: "DOC CAPTAIN",
    fullName: "Doc Captain",
    url: DC3_BASE_URL_DEV,
    inboxUrl: "/api/agent/inbox",
    token: HPG_TO_DC3_SERVICE_TOKEN
  }
}

Each app must expose a POST /api/agent/inbox endpoint that accepts tasks and sends callbacks to HPG's callback URLs.

## Security & Authentication
Inter-app communication is secured with service tokens:

- HPG → HS3: Uses HPG_TO_HS3_SERVICE_TOKEN (stored as HPG_TO_HS3_SERVICE_TOKEN on HPG, HS3_TO_HPG_SERVICE_TOKEN on HS3)
- HPG → DC3: Uses HPG_TO_DC3_SERVICE_TOKEN (stored as HPG_TO_DC3_SERVICE_TOKEN on HPG, DC3_TO_HPG_SERVICE_TOKEN on DC3)
- HS3 → HPG (callbacks): Uses HS3_TO_HPG_SERVICE_TOKEN
- DC3 → HPG (callbacks): Uses DC3_TO_HPG_SERVICE_TOKEN
- HPG → HPG (self-dispatch): Uses WARROOM_SERVICE_TOKEN or HS3_TO_HPG_SERVICE_TOKEN

All tokens are sent in the Authorization: Bearer header. The War Room validates tokens on both the task callback endpoint and the chat callback endpoint.

Environment variables required on HPG:
- HS3_BASE_URL_DEV — Base URL for Harbor Shoppers (e.g., https://hs3.replit.app)
- DC3_BASE_URL_DEV — Base URL for Doc Captain (e.g., https://dc3.replit.app)
- HPG_TO_HS3_SERVICE_TOKEN — Token for authenticating to HS3
- HPG_TO_DC3_SERVICE_TOKEN — Token for authenticating to DC3
- HS3_TO_HPG_SERVICE_TOKEN — Token HS3 uses to callback to HPG
- DC3_TO_HPG_SERVICE_TOKEN — Token DC3 uses to callback to HPG
- WARROOM_SERVICE_TOKEN — General War Room service token

## Files
- `client/src/pages/portal/war-room.tsx` — Main War Room UI component (~4900 lines) with all tabs, panels, and real-time updates
- `server/routes.ts` — All War Room API endpoints (agent tasks, chat threads, callbacks, cross-app requests)
- `shared/schema.ts` — Database schemas for agent_console_tasks, agent_task_responses, agent_chat_threads, agent_chat_messages, agent_cross_app_requests
- `server/storage.ts` — Storage interface and Drizzle implementations for all War Room data operations

## API Routes
- **POST /api/agent/tasks** — Create and dispatch a new agent task to target apps (Command mode)
- **GET /api/agent/tasks** — List agent tasks with filtering and pagination
- **GET /api/agent/feed/:app** — Get per-app task feed for Cockpit view
- **POST /api/agent/inbox** — HPG's own inbox handler for self-dispatched tasks

## Dependencies
- OpenAI (gpt-4o-mini for AI-powered responses)
- Node.js fetch API (inter-app HTTP communication)
- Drizzle ORM (PostgreSQL data access)

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Agent Console (v2.0 — Feb 10, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 10, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Command and Chat mode interface for cross-app task orchestration across HPG, Harbor Shoppers 3.0, and Doc Captain. Features handler selection, environment targeting (dev/staging/prod), idempotent task dispatch, auto-execution pipelines, and real-time response tracking with progress indicators.

## What It Is
The Agent Console is the primary interface for dispatching tasks to any combination of the three connected applications. It operates in two modes:

**Command Mode:**
- Select target apps (HPG, HS3, DC3) individually or all at once
- Choose a handler/task type (e.g., health_check, list_config, or custom)
- Set environment (dev, staging, prod) with safety gates
- Write a message and optional context JSON
- Dispatch the task — each target app receives it at their /api/agent/inbox endpoint
- View real-time responses as callbacks arrive

**Chat Mode (Engineering Chat):**
- Conversational multi-turn interface
- Type a message, and all target apps in the thread receive it simultaneously
- Apps respond with AI-powered contextual answers using their own database data
- Supports needs_info (apps ask clarifying questions), cross_app_request (apps request data from each other), and normal responses
- Full conversation history is maintained per thread

## Task Dispatch Flow
When a task is dispatched:

1. Admin composes message + selects target apps + optionally selects handler
2. HPG creates an agent_console_task record in the database
3. For each target app, HPG POSTs to {app_base_url}/api/agent/inbox with:
   - taskId, taskRef, appKey, message, context_json, callbackUrl, chatCallbackUrl, environment, mode
4. Each app responds with HTTP 202 (acknowledged) immediately
5. Each app processes the task asynchronously (AI + database queries)
6. Each app POSTs results back to HPG's callback URL
7. HPG creates/updates the chat message in the thread
8. UI polls for new messages and displays them in real-time

Key features:
- Idempotent dispatch: Tasks have unique taskRef (TSK-XXXXX-YYYYY format) and idempotencyKey
- Parent-child relationships: Tasks can be children of other tasks (parentTaskId)
- Template system: "Save as Template" stores task configurations for reuse
- Plan & Split: Break complex tasks into multiple subtasks

## Supported Handlers
HPG's inbox supports these auto-execution handlers:

SAFE_HANDLERS (always auto-execute):
- health_check — Returns system status (uptime, memory, node version, database connection)
- list_config — Lists supported handlers and their metadata

PRIVILEGED_HANDLERS (require local dispatch or explicit approval):
- Various data query and mutation handlers defined in SUPPORTED_AUTO_HANDLERS

When no handler is matched, the task falls through to:
1. Chat mode AI handler (if chatMode: true in context)
2. Manual processing queue (if no handler and no chat mode)

Each handler has metadata including:
- description: What it does
- tags: Categories (safe, query, diagnostic, etc.)
- inputHint: Example context JSON the handler expects
- autoExec: Whether it can auto-execute
- mutating: Whether it modifies data (triggers checkpoint safety warnings)

## Database Schema
Agent Console uses four main tables:

**agent_console_tasks** — Central task registry
- id (UUID), taskRef (unique, TSK-XXXXX-YYYYY), parentTaskId, senderUserId
- targetApps (text[]), message (text), contextJson (JSONB)
- taskType, templateSlug, mode (manual/auto/scheduled)
- environment (dev/staging/prod), status (pending/dispatched/completed/failed/cancelled)
- idempotencyKey, osContractVersion, failureReason
- lastHeartbeatAt, lastCallbackAt, createdAt, updatedAt

**agent_task_responses** — Per-app responses to tasks
- id (UUID), taskId (FK), appKey, status, responseText, responseJson
- errorMessage, idempotencyKey, receivedAt, processingStartedAt, completedAt

**agent_task_attachments** — File attachments for tasks
- id (UUID), taskId (FK), uploadedBy, filename, mimeType, sizeBytes, storageKey

All tables use UUID primary keys with gen_random_uuid() defaults.

## Files
- `client/src/pages/portal/war-room.tsx` — Agent Console UI with command/chat mode toggle, handler selection, environment picker, and response viewer
- `server/routes.ts` — POST /api/agent/tasks dispatch logic, callback handler, inbox handler with auto-execution
- `shared/schema.ts` — agentConsoleTasks, agentTaskResponses, agentTaskAttachments table definitions
- `server/storage.ts` — CRUD operations for tasks, responses, attachments

## API Routes
- **POST /api/agent/tasks** — Create and dispatch a task to target apps
- **GET /api/agent/tasks** — List tasks with pagination and filters
- **POST /api/agent/tasks/:taskId/callback** — Receive callback responses from external apps
- **POST /api/agent/inbox** — HPG's own inbox for processing self-dispatched tasks

## Dependencies
- OpenAI (gpt-4o-mini)
- Node.js fetch API
- Drizzle ORM
- Zod (request validation)

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Agent Cockpit (v2.0 — Feb 10, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 10, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Tri-pane operations cockpit with per-app feeds (HPG, HS3, DC3), handler dispatch with environment selection, checkpoint safety metadata on mutating operations, parent-child task relationships, and real-time callback monitoring. Includes Save as Template and Plan & Split features for reusable task orchestration.

## What It Is
The Agent Cockpit provides a three-column layout where each column shows the live task feed for one app (HPG, HS3, DC3). This gives the admin a bird's-eye view of all operations across the entire platform ecosystem simultaneously.

Key capabilities:
- **Tri-pane layout**: HPG | HS3 | DC3 columns side by side
- **Per-app task feed**: Each pane shows recent tasks dispatched to that app with status indicators (pending, dispatched, completed, failed)
- **Inline dispatch**: Send tasks directly from any pane to that specific app
- **Handler presets**: Quick-access buttons for common handlers
- **Environment targeting**: Each task can target dev, staging, or prod environments
- **Checkpoint safety**: Mutating handlers display safety warnings before execution
- **Parent-child visualization**: Tasks created by Plan & Split show their parent relationship
- **Real-time updates**: Automatic polling refreshes feeds as callbacks arrive

## Cockpit Features
**Save as Template:**
After successfully dispatching a task, admins can save the task configuration (handler, message, context JSON, target apps) as a reusable template. Templates are stored in the agent_console_tasks table with a templateSlug. Future tasks can be launched from templates with a single click.

**Plan & Split:**
Complex tasks can be decomposed into multiple subtasks. The parent task is created first, then child tasks are generated with parentTaskId linking them to the parent. Each child task can target a different app or handler.

**Broadcast (Radio icon, amber styled):**
Admins can send a single message to all apps simultaneously, always creating a new thread. This is useful for fleet-wide announcements, status checks, or coordinated operations.

**Nudge:**
If an app hasn't responded to a task within a reasonable time, the admin can "nudge" it — this re-dispatches the message to the app's inbox with a nudge context flag, prompting it to respond.

## Feed API
Each app's feed is populated via:

GET /api/agent/feed/:app

Parameters:
- :app — one of "hpg", "hs3", "dc3"

Returns the most recent tasks dispatched to that app, including:
- Task metadata (taskRef, status, environment, handler)
- Response data (responseText, responseJson, status)
- Timing (createdAt, completedAt, lastCallbackAt)
- Parent-child relationships (parentTaskId)

The cockpit polls this endpoint at regular intervals to keep feeds updated.

## Files
- `client/src/pages/portal/war-room.tsx` — Cockpit tri-pane layout, per-app feed rendering, inline dispatch forms
- `server/routes.ts` — GET /api/agent/feed/:app endpoint, task dispatch, callback processing
- `shared/schema.ts` — agentConsoleTasks schema with parentTaskId, templateSlug fields

## API Routes
- **GET /api/agent/feed/:app** — Get per-app task feed for cockpit display
- **POST /api/agent/tasks** — Dispatch tasks from cockpit panes
- **GET /api/agent/chat/:parentId/children** — Get child tasks of a parent task

## Dependencies
- Drizzle ORM
- React (TanStack Query for polling)

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Context JSON Editor (v1.0 — Feb 10, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 10, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Structured context editor for agent task inputs with live JSON validation, green/red validity indicators, handler-specific presets (auto-fill templates), and server-side fallback that auto-extracts JSON-in-message. Mutating handlers require valid context JSON with optional notes, preventing stuck tasks from mixed text and JSON.

## What It Is
The Context JSON Editor is a specialized input component within the Agent Console that allows admins to attach structured context data to tasks. This context is sent alongside the message to the target app's inbox handler.

Features:
- **Live JSON validation**: As you type, the editor validates JSON in real-time with a green (valid) or red (invalid) border indicator
- **Handler presets**: When a handler is selected, the editor can auto-fill with the handler's expected input template (inputHint)
- **Mixed input protection**: If a mutating handler is selected, the editor enforces valid JSON — preventing stuck tasks caused by mixing plain text with JSON
- **Server-side fallback**: If the admin accidentally puts JSON in the message field instead of the context editor, the server extracts it and moves it to contextJson automatically
- **Notes field**: Optional text notes can accompany the JSON context for human-readable annotations

## Context JSON Contract
The context JSON is sent to target apps as context_json in the inbox payload. Reserved fields that HPG injects automatically:

{
  "chatMode": true/false,          // Whether this is a chat-mode task
  "threadId": "uuid",              // Chat thread ID (if chat mode)
  "conversationHistory": [...],    // Recent conversation messages (if chat mode)
  "replyToNeedsInfo": true/false,  // Whether this is a reply to a needs_info request
  "originalQuestion": "...",       // The original question (if replying to needs_info)
  "crossAppRequest": true/false,   // Whether this is a cross-app data request
  "crossAppForward": true/false,   // Whether this is forwarding a cross-app answer
  "nudge": true/false,             // Whether this is a nudge re-dispatch
  "environment": "dev|staging|prod"
}

Apps can use these reserved fields to determine how to process the task. Custom fields from the admin's context editor are merged alongside these.

## Files
- `client/src/pages/portal/war-room.tsx` — Context JSON editor component with live validation and preset loading
- `server/routes.ts` — Server-side JSON extraction fallback in task dispatch and inbox handler

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Engineering Chat Mode (v2.0 — Feb 12, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 12, 2026 at 10:00 AM | **Updated:** Feb 16, 2026 at 10:00 AM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Thread-based persistent conversations with all connected apps. Supports conversational multi-turn interactions where apps respond with AI-powered contextual answers. Features shared conversation history, callback-to-thread integration, environment safety gates, CockpitChatPanel with tri-pane grouped message view, full-screen chat expansion, and per-response and bulk copy-to-clipboard for sharing with teams or other agents.

## What It Is
Engineering Chat Mode transforms the War Room from a task dispatch system into a conversational AI command center. Instead of sending one-off commands, admins have persistent, multi-turn conversations with all connected apps simultaneously.

How it works:
1. Admin creates a chat thread, selecting target apps (any combination of HPG, HS3, DC3)
2. Admin types a message — it's dispatched to all target apps at once
3. Each app receives the message with full conversation history
4. Each app uses OpenAI + its own database to generate an intelligent, contextual response
5. Responses appear in the thread in real-time as callbacks arrive
6. The conversation continues — each new message includes the full history

This enables scenarios like:
- "How many orders did we process this week?" → HS3 queries its orders table and responds with real data
- "What vessels have expiring certificates?" → DC3 queries its compliance records
- "Give me a status report across all systems" → All three apps respond with their own data
- Multi-turn planning discussions where apps remember what was said before

## Thread & Message Schema
**agent_chat_threads** — Conversation containers
- id (UUID), threadRef (unique, THR-XXXXX-YYYYY format)
- title (text), createdBy (FK to users)
- targetApps (text[] — e.g., ["hpg", "hs3", "dc3"])
- environment (dev/staging/prod)
- status (active/archived/closed)
- metadata (JSONB), createdAt, updatedAt

**agent_chat_messages** — Individual messages in threads
- id (UUID), threadId (FK to threads)
- senderType: "user" | "app" | "system"
- senderAppKey: "hpg" | "hs3" | "dc3" (null for user/system)
- content (text — the actual message)
- messageType: "normal" | "needs_info" | "cross_app_request" | "cross_app_response" | "admin_reply" | "forwarded"
- taskId (FK — links to the dispatched task)
- sourceRequestId (FK — links to cross-app request if applicable)
- metadata (JSONB — status, handler, AI proxy flags, idempotency keys)
- createdAt (timestamp)

Messages are ordered chronologically and grouped by sender in the UI. Each app's messages are color-coded for visual distinction.

## AI-Powered Response System
Each app generates responses using OpenAI with app-specific system prompts:

**HPG** (self-dispatch): Uses gpt-4o-mini with a system prompt describing all HPG capabilities (identity provider, wallet, entitlements, portfolio, audit logging, Knowledge Vault, App Factory, monetization). Generates responses directly in the inbox handler.

**HS3 and DC3** (external apps): Two response paths:

Path 1 — Real AI handler (preferred):
- The external app has an AI-powered inbox handler
- It receives the message, queries its own database, uses OpenAI to generate a response
- It sends a "completed" callback with the intelligent response
- This is the ideal setup (see External App Integration Guide)

Path 2 — AI proxy fallback:
- If the external app only sends a "processing" ack (no real response)
- HPG's AI proxy system kicks in
- It uses OpenAI with an app-specific profile (APP_AI_PROFILES) to generate a response on the app's behalf
- The proxy response is stored with metadata.aiProxyResponse = true

The AI proxy ensures the chat always works even if external apps don't have AI handlers yet. Once they do, the proxy stops triggering automatically.

## Message Deduplication
The callback system uses multiple deduplication strategies to prevent duplicate messages:

1. **Idempotency key check**: Chat callback handler checks if a message with the same idempotencyKey already exists in the thread metadata
2. **Task-based dedup**: Before creating a completed/failed message, checks if one already exists for that taskId + appKey combination
3. **Auto-delivered message updates**: When a callback arrives for a task that has an "auto-delivered" placeholder message, the placeholder is UPDATED (not duplicated) with the real content
4. **Single callback pattern**: HPG's self-dispatch sends only to the task callback (not dual callback) since the task callback handler already writes to the chat thread

These layers ensure each app produces exactly one final message per dispatched task, regardless of network retries or race conditions.

## Broadcast Feature
The Broadcast button (Radio icon, amber styled) lets admins send a message to all apps simultaneously in a new thread:

1. Admin clicks Broadcast, types a message
2. A new thread is created with targetApps: ["hpg", "hs3", "dc3"]
3. The message is dispatched to all three apps
4. All responses appear in the new thread

This is ideal for fleet-wide status checks, coordinated announcements, or simultaneous data queries across the entire ecosystem.

## Full-Screen Chat Expansion
The chat panel supports full-screen expansion for focused work on complex conversations:

- **Toggle button** (Maximize2/Minimize2 icons) in the chat header expands the panel to fill the entire viewport
- **Escape key** dismisses the expanded view instantly
- When expanded, the chat panel overlays everything else with a fixed position overlay, providing maximum reading and composing space
- Thread list, messages, and input composer all scale to use the full available space
- Useful when reviewing long multi-app responses or composing detailed instructions

## Copy Response & Share
Every app response in the chat has copy-to-clipboard functionality for easy sharing with team members or other AI agents:

**Per-Response Copy:**
- Each app response message has a clipboard icon that appears on hover (top-right corner)
- Click to copy that single response's content
- Visual feedback: icon changes to a green checkmark for 2 seconds after copying
- Works on all message types: normal responses, needs_info, cross_app_request

**Copy All Responses:**
- A "Copy All Responses" button appears above the message input whenever there are app responses after the admin's last message
- Copies all responses since the last user message, formatted with app labels:
  `=== Harbor Shoppers 3.0 ===`
  `[response content]`
  `=== Doc Captain ===`
  `[response content]`
- Button shows the count (e.g., "Copy All 3 Responses")
- Visual feedback with green checkmark and "Copied!" text
- Ideal for pasting into Slack, email, another agent's context, or documentation

## Files
- `client/src/pages/portal/war-room.tsx` — Chat panel UI with thread list, message display, input composer, broadcast button, expand toggle, copy buttons
- `server/routes.ts` — Chat thread CRUD, message dispatch, callback handlers, AI proxy, broadcast endpoint
- `shared/schema.ts` — agentChatThreads, agentChatMessages table definitions with enums
- `server/storage.ts` — getChatThreads, getChatMessages, createChatMessage, updateChatMessage, etc.

## API Routes
- **GET /api/agent/chat/threads** — List all chat threads
- **POST /api/agent/chat/threads** — Create a new chat thread with target apps
- **GET /api/agent/chat/threads/:threadId** — Get a single thread
- **GET /api/agent/chat/threads/:threadId/messages** — Get all messages in a thread
- **POST /api/agent/chat/threads/:threadId/messages** — Send a message to all target apps in the thread
- **PATCH /api/agent/chat/threads/:threadId** — Update thread metadata or status
- **POST /api/agent/chat/threads/:threadId/nudge** — Nudge an app that hasn't responded
- **POST /api/agent/chat/callback** — Receive chat-specific callbacks from external apps

## Dependencies
- OpenAI (gpt-4o-mini for AI responses and proxy)
- Drizzle ORM
- TanStack React Query (polling)

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Cross-App Communication (v1.0 — Feb 13, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 13, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Admin-mediated cross-app communication system where apps can request data from each other. Supports needs_info workflows (apps ask admin clarifying questions), cross_app_request workflows (apps request data from other apps with admin approval/deny/edit), and forwarded answers back to requesting apps.

## What It Is
Cross-App Communication enables apps to interact with each other through the admin as a mediator. There are two main workflows:

**needs_info — Apps ask the admin a clarifying question:**
1. App receives a task and doesn't have enough information to respond
2. App sends a "needs_info" callback with a clarifying question
3. The question appears in the chat thread with inline reply UI
4. Admin types a reply and clicks "Reply"
5. The reply is dispatched back to the app's inbox with replyToNeedsInfo: true context
6. App processes the reply with the original context and sends a completed response

**cross_app_request — Apps request data from other apps:**
1. App A receives a task that requires data from App B
2. App A sends a "cross_app_request" callback specifying the target app(s) and question
3. The request appears in the chat with Approve/Deny/Edit buttons
4. Admin approves (optionally editing the question)
5. HPG dispatches the question to App B's inbox
6. App B responds with the data
7. HPG forwards App B's answer back to App A
8. App A uses the data to complete its original task

This keeps the admin in control of all inter-app data sharing — nothing happens without explicit approval.

## Cross-App Request Lifecycle
The agent_cross_app_requests table tracks the full lifecycle:

States:
- pending — Request received, awaiting admin decision
- approved — Admin approved the request
- denied — Admin denied the request
- dispatched — Question sent to target app(s)
- answered — Target app(s) responded
- forwarded — Answer forwarded back to requesting app

Fields:
- id (UUID), threadId (FK)
- requestingApp — The app that needs data (e.g., "hs3")
- targetApps — The app(s) that have the data (e.g., ["dc3"])
- question — What the requesting app wants to know
- status — Current lifecycle state
- approvedBy — Admin who approved/denied
- editedQuestion — If admin modified the question before dispatching
- responseMessageId — The message containing the target app's answer
- sourceTaskId — The original task that triggered the request
- sourceMessageId — The chat message containing the request
- forwardedAt — When the answer was forwarded back
- metadata (JSONB) — Original context, reason, etc.

## Message Types
Chat messages have six types that enable the full communication flow:

1. **normal** — Standard message (user or app response)
2. **needs_info** — App is asking the admin a clarifying question (renders with inline reply UI)
3. **cross_app_request** — App is requesting data from another app (renders with Approve/Deny/Edit buttons)
4. **cross_app_response** — Target app's response to a cross-app request
5. **admin_reply** — Admin's reply to a needs_info question
6. **forwarded** — Answer forwarded back to the requesting app

Each type has distinct UI rendering in the chat panel with appropriate action buttons and visual indicators.

## Files
- `client/src/pages/portal/war-room.tsx` — Cross-app request UI with approve/deny/edit buttons, needs_info reply interface, forwarded message display
- `server/routes.ts` — Cross-app request endpoints (approve, deny, dispatch, forward), needs_info reply endpoint
- `shared/schema.ts` — agentCrossAppRequests table, crossAppRequestStatusEnum, chatMessageTypeEnum definitions
- `server/storage.ts` — CRUD operations for cross-app requests

## API Routes
- **POST /api/agent/chat/threads/:threadId/reply-needs-info** — Reply to a needs_info question from an app
- **POST /api/agent/chat/cross-app-requests/:requestId/approve** — Approve a cross-app data request
- **POST /api/agent/chat/cross-app-requests/:requestId/deny** — Deny a cross-app data request
- **POST /api/agent/chat/cross-app-requests/:requestId/dispatch** — Dispatch approved request to target app(s)
- **POST /api/agent/chat/cross-app-requests/:requestId/forward** — Forward target app's answer back to requesting app
- **GET /api/agent/chat/threads/:threadId/cross-app-requests** — List all cross-app requests in a thread

## Dependencies
- Drizzle ORM
- Node.js fetch API

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — Settings Snapshots (v1.0 — Feb 16, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 16, 2026 at 10:00 AM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Backup, diff, restore, and export system for War Room infrastructure configuration. Captures app URLs, service token presence flags (never secrets), OS contract state, and agent templates into immutable snapshots. Supports lock/unlock, visual diff comparison against live settings, automated restore with OS contract reactivation, manual checklist generation for env var/token fixes, and export to external apps (HS3/DC3) for disaster recovery.

## What It Is
Settings Snapshots protect War Room infrastructure configuration from accidental changes or drift. Admins can capture a point-in-time snapshot of all critical settings, compare it against the current live state, and restore it if needed.

Key capabilities:
- **Capture** — Take a snapshot of all app URLs, token presence, OS contract state, and saved templates
- **Lock** — Freeze a snapshot so it cannot be accidentally deleted
- **Diff** — Compare a snapshot against the current live settings, highlighting every change
- **Restore** — Re-apply a snapshot's OS contract automatically, with a manual checklist for token/env var fixes
- **Export** — Send a snapshot to HS3 or DC3 as a backup payload via their inbox endpoints
- **Delete** — Remove unlocked snapshots that are no longer needed

Security: Snapshots NEVER store actual secrets or tokens. They only store boolean presence flags (e.g., "HS3 token: configured" vs "HS3 token: missing") and URLs. This ensures no sensitive data leaks even if a snapshot is exported.

## Snapshot Schema
**warroom_snapshots** — Point-in-time configuration captures
- id (UUID), name (text), description (text, optional)
- payload (JSONB — the full configuration state)
- checksum (text — SHA-256 of deterministically serialized payload)
- locked (boolean, default false)
- createdBy (FK to users), createdAt, updatedAt

**warroom_snapshot_exports** — Export tracking
- id (UUID), snapshotId (FK to snapshots)
- targetApp ("hs3" | "dc3"), status ("pending" | "sent" | "failed")
- responseData (JSONB — the inbox response from the target app)
- exportedBy (FK to users), exportedAt (timestamp)

The payload JSONB contains:
- appUrls: { hpg, hs3, dc3 } — Base URLs for each connected app
- tokenPresence: { hs3ToHpg, hpgToHs3, dc3ToHpg, hpgToDc3, warroom } — Boolean flags only
- osContract: { version, status, content } — The active OS contract at snapshot time
- templates: Array of saved agent templates
- capturedAt: ISO timestamp

## Deterministic Checksums
Snapshots use SHA-256 checksums computed from a deterministically serialized payload. The stableStringify function deep-sorts all object keys recursively before JSON.stringify, ensuring:

- The same logical payload always produces the same checksum
- Key insertion order doesn't affect the hash
- Diff operations can reliably detect genuine changes vs. key reordering
- Integrity can be verified at any time by recomputing the checksum

## Diff & Restore Flow
**Diff:** Compares a snapshot's payload against the current live settings:
1. Reads current app URLs from environment variables
2. Checks current token presence from env vars
3. Fetches the current active OS contract
4. Loads current templates from the database
5. Produces a field-by-field comparison: { field, snapshot, current, match }

**Restore:** Re-applies a snapshot's configuration:
1. Identifies the OS contract version saved in the snapshot
2. If it differs from the current active contract, reactivates the saved version
3. Generates a manual action checklist for items that cannot be programmatically set:
   - Environment variable changes (URLs, tokens)
   - Items where current live value differs from snapshot value
4. Returns: { snapshotName, actionsApplied[], manualActionsRequired[] }

The restore UI shows:
- Green checkmarks for auto-applied changes (OS contract activation)
- Amber checklist items for manual fixes needed (env vars, tokens)
- "All settings match" message when no changes are needed

## Export to External Apps
Snapshots can be exported to HS3 or DC3 as backup payloads:

1. Admin clicks "Export to HS3" or "Export to DC3" on a snapshot
2. HPG sends the snapshot payload to the target app's inbox endpoint
3. The export is tracked in warroom_snapshot_exports with status and response data
4. Target app receives it as a task and can store/acknowledge it

This enables disaster recovery: if HPG's configuration is lost, the external apps have a copy of the last known good state.

## Files
- `client/src/pages/portal/war-room.tsx` — SettingsSnapshotsPanel component with create, lock, diff, restore, export, and delete UI
- `server/routes.ts` — 7 snapshot API endpoints: CRUD, diff, restore, export
- `shared/schema.ts` — warroomSnapshots, warroomSnapshotExports table definitions
- `server/storage.ts` — Snapshot storage methods: create, getAll, getById, update, delete, createExport

## API Routes
- **GET /api/agent/snapshots** — List all snapshots (newest first)
- **POST /api/agent/snapshots** — Create a new snapshot from current live settings
- **PATCH /api/agent/snapshots/:id** — Update snapshot (lock/unlock, rename)
- **DELETE /api/agent/snapshots/:id** — Delete an unlocked snapshot
- **POST /api/agent/snapshots/:id/diff** — Compare snapshot against current live settings
- **POST /api/agent/snapshots/:id/restore** — Restore OS contract and generate manual checklist
- **POST /api/agent/snapshots/:id/export** — Export snapshot to HS3 or DC3 via inbox

## Dependencies
- Drizzle ORM
- Node.js crypto (SHA-256 checksums)

---

© Doc Captain LLC. All rights reserved.

License: Personal & Internal Business Use Only
Redistribution, resale, sublicensing, or AI training use is prohibited.

Purpose of this document:
This document provides guidance, patterns, and considerations based on real-world systems.
It does NOT provide a copy of Doc Captain LLC's internal business logic, pricing strategy,
or proprietary implementation details.

Any pricing, limits, or structures described are examples and must be adapted
to your own business model.

---

## Supporting Feature

# War Room — External App Integration Guide (v2.0 — Feb 14, 2026 at 10:00 AM)

**Brand:** HPG (Harbor Platform Group)

**Published:** Feb 14, 2026 at 10:00 AM | **Updated:** Feb 15, 2026 at 6:00 PM

**Status:** complete | **Maturity:** Verified | **Exposure:** sellable

## Summary
Complete integration guide for connecting external Replit apps (Harbor Shoppers, Doc Captain, or new apps) to HPG's War Room. Includes the full inbox handler contract, callback patterns, AI-powered response setup, authentication, and copy-paste instructions for the Replit Agent.

## What It Is
This document is the complete setup guide for any external application that wants to connect to HPG's War Room. It covers everything the external app needs to implement:

1. A POST /api/agent/inbox endpoint that receives tasks from HPG
2. Service token authentication for secure communication
3. Callback responses to HPG's task and chat callback URLs
4. AI-powered response generation using OpenAI
5. Support for needs_info, cross_app_request, and normal response types
6. Conversation history handling for multi-turn chat

This guide is designed to be given to a Replit Agent in the external app's project — the agent can build the entire integration from these instructions alone.

## Inbox Handler Contract
The external app MUST implement:

POST /api/agent/inbox

**Incoming payload from HPG:**
{
  "taskId": "uuid",
  "taskRef": "TSK-XXXXX-YYYY",
  "appKey": "hs3" | "dc3" | "{your_app_key}",
  "message": "The admin's message text",
  "context_json": {
    "chatMode": true,
    "threadId": "uuid",
    "conversationHistory": [
      { "sender": "user", "content": "...", "timestamp": "..." },
      { "sender": "hs3", "content": "...", "timestamp": "..." }
    ],
    "replyToNeedsInfo": false,
    "crossAppRequest": false,
    "crossAppForward": false,
    "nudge": false
  },
  "callbackUrl": "https://hpg-url/api/agent/tasks/{taskId}/callback",
  "callback_url": "https://hpg-url/api/agent/tasks/{taskId}/callback",
  "chatCallbackUrl": "https://hpg-url/api/agent/chat/callback",
  "chat_callback_url": "https://hpg-url/api/agent/chat/callback",
  "environment": "dev" | "staging" | "prod",
  "mode": "manual" | "auto"
}

**Required behavior:**
1. Validate the Authorization: Bearer token
2. Respond immediately with HTTP 202 { "accepted": true, "taskId": "..." }
3. Process the task asynchronously (setTimeout or background worker)
4. Send the result back to HPG via callback

## Callback Response Patterns
The external app sends results back to HPG via the callbackUrl. Three response types:

**1. Normal completed response:**
POST {callbackUrl}
Authorization: Bearer {YOUR_APP_TO_HPG_SERVICE_TOKEN}
{
  "appKey": "hs3",
  "taskId": "{taskId}",
  "status": "completed",
  "responseText": "Your intelligent response here",
  "responseJson": { "handler": "ai-chat", "timestamp": "..." },
  "idempotencyKey": "hs3-chat-{taskId}-{timestamp}"
}

**2. needs_info — Ask admin a clarifying question:**
POST {callbackUrl}
Authorization: Bearer {YOUR_APP_TO_HPG_SERVICE_TOKEN}
{
  "appKey": "hs3",
  "taskId": "{taskId}",
  "threadId": "{context_json.threadId}",
  "status": "needs_info",
  "responseText": "Your clarifying question to the admin",
  "idempotencyKey": "hs3-needsinfo-{taskId}-{timestamp}"
}
When the admin replies, you receive a new inbox task with context_json.replyToNeedsInfo: true and context_json.originalQuestion.

**3. cross_app_request — Request data from another app:**
POST {callbackUrl}
Authorization: Bearer {YOUR_APP_TO_HPG_SERVICE_TOKEN}
{
  "appKey": "hs3",
  "taskId": "{taskId}",
  "threadId": "{context_json.threadId}",
  "status": "cross_app_request",
  "responseText": "Why you need data from another app",
  "crossAppQuestion": "The question to ask the other app",
  "crossAppTargetApps": ["dc3"],
  "crossAppContext": { "reason": "Need vessel data for order fulfillment" }
}

**IMPORTANT:** Send callbacks to the callbackUrl (task callback). HPG's task callback handler automatically writes to the chat thread — you do NOT need to send separate callbacks to the chatCallbackUrl.

## AI-Powered Response Implementation
For the best War Room experience, your inbox handler should use OpenAI to generate intelligent, contextual responses. Here's the recommended implementation:

1. **Receive the task** at POST /api/agent/inbox
2. **Respond with HTTP 202** immediately (don't block the request)
3. **Process asynchronously** using setTimeout or a background worker:
   a. Extract the admin's message from the payload
   b. Extract conversation history from context_json.conversationHistory
   c. If the message asks about real data, query YOUR OWN database
   d. Call OpenAI (gpt-4o-mini is fine) with:
      - A system prompt describing your app's role and capabilities
      - The conversation history for multi-turn context
      - Any real data from your database query
   e. Send the completed callback to HPG's callbackUrl

**System prompt example for Harbor Shoppers:**
"You are the Harbor Shoppers 3.0 AI assistant. You manage an e-commerce platform with WooCommerce integration. Your capabilities include: product management, order processing, inventory tracking, customer data, pricing, shipping, analytics, and storefront management. Answer based on real data when available."

**System prompt example for Doc Captain:**
"You are the Doc Captain AI assistant. You manage a maritime documentation and vessel management platform. Your capabilities include: documentation management, vessel data, maritime records, compliance tracking, certificate management, crew documentation, and vessel registry operations."

**OpenAI integration:** Use the Replit AI integration (recommended) or your own OpenAI API key. The Replit integration provides AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL environment variables automatically.

## Authentication Setup
Inter-app communication requires matching service tokens on both sides:

**For Harbor Shoppers (HS3):**
On HPG, set: HPG_TO_HS3_SERVICE_TOKEN = {shared_secret}
On HS3, set: HS3_TO_HPG_SERVICE_TOKEN = {same_shared_secret}

HPG sends the token when dispatching tasks to HS3.
HS3 sends the token when calling back to HPG.

**For Doc Captain (DC3):**
On HPG, set: HPG_TO_DC3_SERVICE_TOKEN = {shared_secret}
On DC3, set: DC3_TO_HPG_SERVICE_TOKEN = {same_shared_secret}

**For new apps:**
Generate a strong random token (32+ characters).
Store it on HPG as HPG_TO_{APP}_SERVICE_TOKEN.
Store it on the app as {APP}_TO_HPG_SERVICE_TOKEN.

**Token validation in your inbox handler:**
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401);
const token = authHeader.substring(7);
if (token !== process.env.{APP}_TO_HPG_SERVICE_TOKEN) return res.status(403);

Note: Use the same token value on both sides. HPG stores it under one name, and your app stores it under a different name, but the VALUE must match.

## Copy-Paste Instructions for Replit Agent
To set up an external app's inbox handler, copy and paste these instructions into the Replit Agent for that app's project:

---

INSTRUCTIONS START:

I need you to create or upgrade the POST /api/agent/inbox endpoint so it uses OpenAI to generate intelligent responses to tasks from HPG's War Room.

The endpoint should:
1. Accept POST requests with Authorization: Bearer token validation
2. Parse the incoming payload (taskId, taskRef, appKey, message, context_json, callbackUrl, environment)
3. Respond immediately with HTTP 202 { accepted: true, taskId }
4. Asynchronously process the task:
   a. Extract the message and conversation history from context_json
   b. If the message asks about data, query the local database
   c. Use OpenAI (gpt-4o-mini) to generate an intelligent response
   d. POST the callback to the callbackUrl with status: "completed" and the response
5. Support context flags: chatMode, replyToNeedsInfo, crossAppRequest, crossAppForward, nudge
6. Use the service token from environment (e.g., HS3_TO_HPG_SERVICE_TOKEN) for authenticating callbacks

The callback payload must include:
- appKey (your app key)
- taskId (from the incoming payload)
- status ("completed", "failed", "needs_info", or "cross_app_request")
- responseText (the AI-generated response)
- responseJson ({ handler: "ai-chat", timestamp: new Date().toISOString() })
- idempotencyKey ("{appKey}-chat-{taskId}-{Date.now()}")

If you need clarification from the admin, send status: "needs_info" with responseText containing your question.

INSTRUCTIONS END

---

Note: The full contract details including payload formats and all three response types (completed, needs_info, cross_app_request) are documented in the docs/AI-INBOX-HANDLER-INSTRUCTIONS.md file and in the War Room — External App Integration Guide feature document.

## Files
- `docs/AI-INBOX-HANDLER-INSTRUCTIONS.md` — Detailed copy-paste instructions for HS3 and DC3 Replit Agent setup
- `server/routes.ts` — HPG's inbox handler implementation (reference implementation for external apps)
- `server/routes.ts` — Callback endpoints that external apps POST their responses to

## API Routes
- **POST /api/agent/inbox** — The endpoint each external app must implement
- **POST /api/agent/tasks/:taskId/callback** — HPG endpoint that receives completed/failed callbacks from external apps
- **POST /api/agent/chat/callback** — HPG endpoint that receives chat-specific callbacks

## Dependencies
- OpenAI (gpt-4o-mini recommended)
- Node.js fetch API (for HTTP callbacks)
- Service tokens (Bearer auth)

---

