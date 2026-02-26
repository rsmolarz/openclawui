# OpenClaw Dashboard - Settings Management

## Overview
The OpenClaw Dashboard is a professional settings management platform for the OpenClaw AI agent gateway. It provides multi-user authentication and supports managing multiple OpenClaw instances simultaneously. Key capabilities include instance-specific configurations, VPS connections, Docker service management, and comprehensive settings for general operations, notifications, nodes, API keys, and appearance. It also features a Documentation Hub for setup guides, a Node Setup Wizard, native dashboard integration, VPS connection logs, and a Quick Start Onboarding process. The dashboard integrates live VPS monitoring via Hostinger API, offering server overview, resource metrics, Docker management, firewall configuration, and backup access. It also provides a complete OpenClaw CLI reference and allows for direct VPS power controls. The AI Task Runner provides a conversational LLM interface (via OpenRouter) that executes whitelisted SSH commands on the VPS for server management and troubleshooting. The platform aims to streamline the management and configuration of OpenClaw agents, enhancing usability and control for administrators.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please ask before implementing major architectural shifts or complex features. I value clear, concise communication and prefer detailed explanations for significant decisions or complex code sections. Do not make changes to files outside the `client/src` and `server/` directories unless explicitly instructed.

## System Architecture
The application follows a client-server architecture.
- **Frontend**: Built with React and TypeScript, utilizing Vite for tooling, Shadcn UI for components, `wouter` for routing, and TanStack Query for data fetching and caching. Styling is handled by Tailwind CSS with support for dark/light themes.
- **Backend**: An Express.js REST API layer that interacts with a PostgreSQL database using Drizzle ORM.
- **Authentication**: Implements MedInvest DID OAuth 2.0 (Authorization Code flow) managed with `express-session` and `connect-pg-simple`.
- **Multi-Instance Management**: Leverages an `InstanceContext`/`InstanceProvider` pattern on the frontend, allowing users to select and manage different OpenClaw instances. Backend queries are instance-scoped using `instanceId` parameters.
- **UI/UX Decisions**: The dashboard incorporates a responsive design with a prominent sidebar navigation for easy access to different sections like Overview, Documentation, Node Setup, and various settings categories. The design emphasizes clarity and ease of use for managing complex configurations.
- **Feature Specifications**:
    - **Documentation Hub**: Full CRUD operations for markdown-based documentation with categories, tags, pinning, search, and filtering.
    - **Node Setup Wizard**: A guided 5-step process for setting up OpenClaw gateways, including CLI installation, configuration, service installation, and token retrieval.
    - **Hostinger VPS Monitoring**: Real-time monitoring of VPS instances including system metrics, Docker project management (start/stop/restart), firewall rule management, and backup listing.
    - **OpenClaw Commands**: A comprehensive CLI reference with quick start guides and troubleshooting steps, capable of auto-generating SSH commands.
- **Data Models**: Key data models include `openclaw_instances` for managing multiple OpenClaw deployments, `settings` for user preferences, `machines` for node management, `apiKeys` and `llmApiKeys` for credential management, `vpsConnections` and `dockerServices` for infrastructure management, `openclawConfig` for instance-specific configurations, `integrations` for external services, `users` for authentication, and `whatsappSessions` for messaging. Instance-scoped tables include `openclaw_config`, `vps_connections`, and `docker_services`.

## External Dependencies
- **Database**: PostgreSQL (managed via Drizzle ORM)
- **Authentication Provider**: MedInvest DID OAuth 2.0
- **Cloud/VPS Provider API**: Hostinger API (for VPS monitoring and management)
- **LLM Gateway**: OpenRouter (supports primary/fallback models from over 70 options)
- **Messaging**: Baileys (for WhatsApp bot functionality)
- **Networking**: Tailscale (for mesh VPN configurations)
- **UI Component Library**: Shadcn UI
- **Data Fetching/State Management**: TanStack Query

## VPS Gateway Setup
- **Gateway Auth**: Token mode (`b39f5f185b247f6fb7f3d708d57c7c34c2009de0535b1359`)
- **Gateway Service**: systemd `openclaw-gateway.service` with `ExecStartPre` patch script
- **Pairing Bypass**: Gateway JS files are patched via `/usr/local/bin/patch-openclaw-gateway.sh` on every restart to bypass DID pairing requirement (sets `silent: true`, skips publicKey check, provides fallback paired object)
- **Tailscale Serve**: Proxies `https://srv1390515.tail55cf63.ts.net:443` → `http://127.0.0.1:18789`
- **SSH Key Auth**: frameworks machine has SSH key access to VPS (ed25519 key in authorized_keys)
- **Connected Nodes (9/9)**: DESKTOP-NIMCP7B (Windows), Mac Mini (macOS, mac-mini-1438), Podcast PC (Windows), RSmolarzBackup (Windows, SSH tunnel), Claw Master Pro / srv1390515 (Linux VPS), Travel AsusDuo (Windows, SSH tunnel), Everywhere / frameworks (Windows), vient1 (Windows), Ryan's Patient Computer / vient4 (Windows)
- **Node Connection Methods**:
  - Via Tailscale: `openclaw node run --host srv1390515.tail55cf63.ts.net --port 443 --tls --display-name "<name>"`
  - Via SSH tunnel: `ssh -N -L 28789:127.0.0.1:18789 root@72.60.167.64` then `openclaw node run --host 127.0.0.1 --port 28789 --display-name "<name>"`
- **Node List Cache**: In-memory 15s TTL cache in server/routes.ts via `getCachedNodeList()` — shared by health-check and live-status endpoints
- **AI Task Runner**: Chat-based LLM interface (OpenRouter) with VPS SSH tools and remote node execution via `openclaw nodes invoke`. Node panel shows live connected/disconnected status on right side.
- **Port Startup**: Robust port 5000 binding with kill-and-retry logic, `waitForPortFree` polling, and `exclusive: false` for faster recovery
- **Skills API Keys**: Management section on OpenClaw Settings page for VPS environment variables (OpenAI, GitHub, Notion, Gemini, ElevenLabs, Discord, Slack, Trello, Spotify, Google Places, X/Twitter). Password-protected reveal/edit/delete. Keys stored in `/etc/openclaw-env` (systemd EnvironmentFile) and `/root/.bashrc`. "Sync from Replit" button pushes secrets from Replit to VPS. Backend routes: `GET /api/ssh/skill-keys`, `POST /api/ssh/skill-keys/reveal`, `POST /api/ssh/skill-keys/update`, `POST /api/ssh/push-env-keys`.
- **WhatsApp Status**: Dashboard card queries both gateway health API and standalone bot status (`/api/whatsapp/status`) for accurate status. Bot runs at `/root/openclaw-whatsapp-bot/` on VPS, connected phone: 13405140344, runtime: home-bot on PodcastPC. SSH fallback checks VPS systemd service + journalctl logs when no home-bot heartbeat; supports "connected", "reconnecting", "disconnected" states with amber UI for reconnecting. SSH commands: `restart-whatsapp`, `whatsapp-status`, `whatsapp-clear-session`.
- **Admin Section**: `/admin` page with two tabs:
  - **Code Guardian**: AI agent that scans VPS health (SSH connectivity, gateway status, WhatsApp bot conflict detection, home-bot health, node connectivity, disk/memory usage). Logs findings to `guardian_logs` table. Can attempt automated fixes (restart services, stop conflicting VPS bot, clear temp files). Backend: `server/code-guardian.ts`. Routes: `GET /api/admin/guardian/logs`, `POST /api/admin/guardian/scan`, `POST /api/admin/guardian/fix/:id`, `POST /api/admin/guardian/fix-whatsapp` (quick-fix for VPS bot conflict), `GET /api/admin/guardian/whatsapp-health` (real-time WhatsApp health status). WhatsApp Health Panel in Code Guardian tab shows home-bot state, VPS bot conflict status, and one-click fix button.
  - **Feature Proposals**: AI agent (GPT-4o-mini) that analyzes current system state and proposes feature improvements. Proposals stored in `feature_proposals` table with approve/reject workflow. Backend: `server/feature-agent.ts`, routes: `GET /api/admin/features`, `POST /api/admin/features/generate`, `PATCH /api/admin/features/:id`, `DELETE /api/admin/features/:id`.
- **WhatsApp Heartbeat Race Fix**: `homeBotStatusByHost` Map tracks heartbeats per hostname; `getResolvedHomeBotStatus()` prioritizes "connected" state over "reconnecting" from different hosts (fixes PodcastPC vs VPS bot flickering). `setHomeBotStatusRef` wired into Code Guardian for home-bot health monitoring.
- **Home-bot Resilience**: `home-bot/openclaw-whatsapp.js` features health monitor (periodic getState check), safe restart with exponential backoff, crash recovery via uncaughtException handler, max 50 reconnect attempts with 5-min cooldown, session conflict (LOGOUT/CONFLICT) handling with auto session clear.
- **Replit Secrets**: OPENAI_API_KEY, OPENCLAW_GITHUB_TOKEN, GITHUB_TOKEN, NOTION_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY stored. Push to VPS uses OPENCLAW_GITHUB_TOKEN (falls back to GITHUB_TOKEN).