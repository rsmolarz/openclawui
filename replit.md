# OpenClaw Dashboard - Settings Management

## Overview
The OpenClaw Dashboard is a professional settings management platform designed to streamline the management and configuration of OpenClaw AI agent gateways. It supports multi-user authentication and the concurrent management of multiple OpenClaw instances. Key capabilities include instance-specific configurations, VPS connections, Docker service management, and comprehensive operational settings. The platform integrates a Documentation Hub, Node Setup Wizard, live VPS monitoring, an AI Task Runner for conversational server management, and a complete OpenClaw CLI reference. Its ambition is to provide a unified, efficient interface for developers and teams managing OpenClaw deployments.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please ask before implementing major architectural shifts or complex features. I value clear, concise communication and prefer detailed explanations for significant decisions or complex code sections. Do not make changes to files outside the `client/src` and `server/` directories unless explicitly instructed.

## System Architecture
The application utilizes a client-server architecture.
- **Frontend**: Built with React and TypeScript, using Vite, Shadcn UI for components, `wouter` for routing, and TanStack Query for data management. Styling is handled by Tailwind CSS, supporting dark/light themes.
- **Backend**: An Express.js REST API layer interacts with a PostgreSQL database through Drizzle ORM.
- **Authentication**: Implemented using MedInvest DID OAuth 2.0 (Authorization Code flow) with `express-session` and `connect-pg-simple`.
- **Multi-Instance Management**: The frontend employs an `InstanceContext`/`InstanceProvider` pattern to manage selected OpenClaw instances, with backend queries scoped by `instanceId`.
- **UI/UX Decisions**: The design is responsive, featuring sidebar navigation and prioritizing clarity for managing complex configurations.
- **Feature Specifications**:
    - **Documentation Hub**: CRUD operations for markdown documentation with categories, tags, pinning, search, and filtering.
    - **Node Setup Wizard**: A guided, multi-step process for OpenClaw gateway setup.
    - **Hostinger VPS Monitoring**: Real-time VPS monitoring, Docker project management, firewall configuration, and backup listing.
    - **OpenClaw Commands**: A comprehensive CLI reference including quick start guides and troubleshooting.
    - **AI Task Runner**: Conversational LLM interface for executing whitelisted SSH commands on the VPS.
    - **Code Guardian**: AI agent for VPS health scanning and proactive issue detection/suggestion.
    - **Feature Proposals**: AI agent for generating feature improvement suggestions.
    - **Code Upgrade Agent**: AI-powered code analysis for improvements, refactors, and optimizations.
    - **System Monitor**: Real-time charts for system resource usage (CPU, Memory, Disk, Network).
    - **Automation**: Cron job scheduler with task templates.
    - **File Manager**: VPS file browsing via SSH.
    - **Metrics**: Analytics dashboard for key operational data.
    - **Marketplace**: Skill plugin catalog with installation, uninstallation, and deployment capabilities.
    - **Custom Skill Builder**: Allows deployment of private skills to the VPS via SSH.
    - **Email Workflows**: Database-backed automation for email patterns with templates and actions.
    - **Voice Chat**: 2-way voice conversation with OpenClaw agent using browser Web Speech API and OpenAI TTS. Features include push-to-talk, selectable voices, conversation history, and a continuous conversation mode.
    - **Voice Streaming API**: Endpoints for future mobile app integration, supporting audio upload (Whisper STT), LLM interaction, and TTS streaming.
    - **Activity Audit Log**: Tracks all mutation actions in a paginated log.
    - **Keyboard Shortcuts**: Global command palette and quick actions.
    - **Bulk Node Operations**: Multi-select actions for nodes (restart, status update, CSV export).
    - **Quick Stats Panel**: Real-time statistics bar for node status.
    - **WhatsApp Adaptive Polling**: Polling mechanism for WhatsApp connections with exponential backoff.
    - **Replit Projects**: Monitoring of Replit projects with Quick Import (text-based: names, URLs, deployment URLs), bulk JSON import, deployment health checks, Scan Deployments (probes `.replit.app` domains to auto-discover live projects), Sync All/Refresh Deployments (probes all existing projects for deployment URLs and health status), and status filtering. Includes AI-powered prioritization, Omi Insights integration, App Workbench with 4 view modes (App — embedded deployed app iframe, Editor — embedded Replit code editor via `?embed=true`, Split — side-by-side editor + app, Code — integrated Monaco editor code workspace with per-project file management), and Cross-App Orchestrator (multi-project AI prompt interface that generates per-project implementation plans). The Code Workspace stores files in the `project_files` DB table with CRUD API at `/api/project-files/:projectId`. Note: Replit GraphQL profile sync is limited due to persisted query hash requirements; Sync All provides the primary discovery mechanism.
    - **GitHub Repos**: Full GitHub integration via Replit's GitHub connector (`@replit/connectors-sdk`). Syncs all user repos (owner, collaborator, org member) into `github_repos` DB table. Features: sync all repos from GitHub, search/filter by name, visibility (public/private), language, sort by push date/name/stars/size, multi-select with bulk "Make Private"/"Make Public" actions, individual visibility toggle per repo, topic tags, repo stats (stars, forks, size). Routes: `GET /api/github/repos`, `POST /api/github/sync`, `PATCH /api/github/repos/:id/visibility`, `POST /api/github/repos/bulk-visibility`. Frontend at `/github`. Component: `client/src/pages/github-repos.tsx`. Backend connector: `server/github.ts`.
    - **Omi Integration**: Backend module for communicating with the Omi API, fetching memories, and extracting TODOs/SOPs via LLM analysis.
    - **AI Project Evaluator**: LLM-based evaluation of Replit projects for potential and next steps.
    - **Secrets Inventory**: Dashboard for tracking API keys and credentials, showing configured/missing status without exposing full values. Gmail scan shows clear scope-limitation warning (connector lacks `gmail.readonly`). Replit envs endpoint sources data from tracked `replit_projects` table with known secret key mapping (no longer depends on Replit GraphQL API which requires persisted query hashes).
    - **WhatsApp Persistent Memory**: Conversation history maintained per phone number using `ai_conversations` and `ai_messages` tables.
    - **Node Heartbeat System**: Machines report status via a lightweight agent to `POST /api/node/heartbeat`, updating `lastSeen` timestamps.
    - **Periodic Skill Discovery**: Automatic hourly checks for new skills with manual trigger and UI notifications.
    - **Gemini Anti-Gravity Proxy**: An OpenAI-compatible proxy for Google Gemini models, providing chat completions and embeddings, with admin settings for upstream configuration and rate limits.
    - **Feature Documentation System**: Admin tab with 31 feature docs across 8 brands (DC, FS, BR, LM, DCL, ALL, HPG, OC). Features/Bundles toggle view, search/filter by brand, detail view with markdown export, email sharing via Gmail, and Replit project sharing. 13 feature bundles including "OpenClaw Complete Setup Guide" (11 features covering setup from beginning to end) and "War Room Command Suite" (8 HPG features). Component: `client/src/components/admin/AdminFeatureDocs.tsx`.
    - **Automation Hub** (10 life automation features):
        - **Daily Briefing**: AI-generated morning action plan with node status, project summary, and motivational quote.
        - **Health Tracker**: Daily health logging (sleep, water, exercise, mood, weight, energy) with weekly charts. Oura Ring integration panel (sleep score, readiness, activity, HRV) via `OURA_API_TOKEN`.
        - **Todo List**: Unified todo management powered by Omi AI wearable. "Pull from Omi" analyzes recent conversations and auto-extracts action items. Manual add, priority levels, dismiss/restore, and status filtering. Uses omi_todos table.
        - **Financial Dashboard**: Multi-section (Personal, Business 1, Business 2) income/expense tracking with category breakdown, monthly summary, and spending charts. Placeholder integrations for QuickBooks, Stifel Wealth Tracker, and Voya Retirement.
        - **Habit Tracker**: Habit creation, daily completion tracking, streak counting, and 30-day visual completion grid. "Analyze from Omi" discovers routines from conversations and shows 15-minute time blocks of the user's daily patterns.
        - **Home Automation**: Tabbed layout with Devices (Home Assistant via HASS_TOKEN/HASS_URL), Production (GoStream 192.168.0.108, ATEM Mini Pro ISO 192.168.0.226, Bitfocus Companion 169.254.83.107, StreamDeck placeholder), and Bridges (Home Assistant, Homebridge, Home Harmony Replit app). Iframe panels with expand/external-link controls.
        - **Meetings Hub**: Unified meetings management with 4 tabs: Zoom (list/create/join/delete meetings via Server-to-Server OAuth, requires ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET), Microsoft Teams (list/create/join/delete meetings via MS Graph API, requires MS_CLIENT_ID/MS_CLIENT_SECRET/MS_TENANT_ID), Google Calendar (view upcoming events from connected Google Calendar), and AI Prep (generate meeting briefs with talking points, questions, objection handling).
        - **SOP Library**: Reuses omi_sops table. Full CRUD with search/filter, plus AI SOP draft generation.
        - **Focus Timer**: Pomodoro timer with configurable work/break durations, SVG ring visualization, session history, and weekly focus charts.
        - **Life Calendar**: Month grid, list, and Google Calendar views. Syncs events from Google Calendar. Multi-channel meeting reminders (WhatsApp to wife, WhatsApp to self, email). Uses Replit Google Calendar integration (`server/googleCalendar.ts`).
        - **Connected Devices**: Device management panel for registering and managing iPhones, iPads, Apple Watches, Macs, and other devices connected to OpenClaw. Full CRUD with status tracking (pending/connected/disconnected/inactive), device metadata (model, OS version, IP, serial number), and summary stats. Component: `client/src/pages/connected-devices.tsx`.
        - **Social Media**: Marketing automation and content creation hub with GoHighLevel CRM (embedded iframe with overview stats) and Thumb Meta (Meta ads content creation Replit app). Two tabs: GoHighLevel and Thumb Meta. Component: `client/src/pages/social-media.tsx`.
    - **Security Agent**: Admin tab for real-time security monitoring with threat detection, brute force prevention, rate limiting, port scan detection, API abuse monitoring. Features stats dashboard (threats blocked, active monitors, auth failures, critical alerts), 8 active security monitors, security event feed with severity/type classification, and configurable security policies. Built into admin page at `client/src/pages/admin.tsx`.
    - **Feature Documentation**: Updated to 32 features (added Security Agent) across 8 brands. OpenClaw Setup Guide bundle now includes Security Agent.
- **Data Models**: Key data models include `openclaw_instances`, `settings`, `machines`, `apiKeys`, `llmApiKeys`, `vpsConnections`, `dockerServices`, `openclawConfig`, `integrations`, `users`, `whatsappSessions`, `automation_jobs`, `automation_runs`, `metrics_events`, `email_workflows`, `audit_logs`, `replit_projects`, `project_evaluations`, `omi_todos`, `omi_sops`, `health_logs`, `grocery_items`, `financial_transactions`, `habits`, `habit_completions`, `meeting_preps`, `focus_sessions`, `life_events`, and `connected_devices`.

    - **Connected Services (Replit Connectors)**: All 15 services connected via Replit OAuth connectors with unified backend module (`server/connectors.ts`). Status API at `GET /api/connectors/status`. Services: YouTube (`/api/youtube/*`), Google Sheets (`/api/google-sheets/*`), Google Docs (`/api/google-docs/*`), Google Drive (`/api/google-drive/*`), Dropbox (`/api/dropbox/*`), OneDrive (`/api/onedrive/*`), SharePoint (`/api/sharepoint/*`), Discord (`/api/discord/*`), Spotify (`/api/spotify/*`), Notion (`/api/notion/*`), ElevenLabs (`/api/elevenlabs/*`), SendGrid (`/api/sendgrid/*`), Gmail, Google Calendar, GitHub. Med Money Vault card added to Finance page linking to private GitHub repo `rsmolarz/MedMoneyVault`.

## External Dependencies
- **Database**: PostgreSQL (via Drizzle ORM)
- **Authentication Provider**: MedInvest DID OAuth 2.0
- **Cloud/VPS Provider API**: Hostinger API
- **LLM Gateway**: OpenRouter
- **Messaging**: Baileys (for WhatsApp bot functionality)
- **Networking**: Tailscale
- **UI Component Library**: Shadcn UI
- **Data Fetching/State Management**: TanStack Query
- **Image Generation**: OpenAI DALL-E 3 / Google Gemini
- **AI/LLM**: OpenAI API, Google Gemini Developer API, Google Cloud Vertex AI
- **Replit Connectors**: YouTube, Google Sheets, Google Docs, Google Drive, Dropbox, OneDrive, SharePoint, Discord, Spotify, Notion, ElevenLabs, SendGrid (via `@replit/connectors-sdk` and `googleapis`)