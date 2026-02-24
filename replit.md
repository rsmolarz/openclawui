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