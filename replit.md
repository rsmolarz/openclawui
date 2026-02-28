# OpenClaw Dashboard - Settings Management

## Overview
The OpenClaw Dashboard is a professional settings management platform for OpenClaw AI agent gateways. It offers multi-user authentication and the capability to manage multiple OpenClaw instances concurrently. Its core purpose is to streamline the management and configuration of OpenClaw agents, providing tools for instance-specific configurations, VPS connections, Docker service management, and comprehensive settings across various operational aspects. Key features include a Documentation Hub, a Node Setup Wizard, native dashboard integration, VPS connection logs, and a Quick Start Onboarding process. The platform also provides live VPS monitoring, an AI Task Runner for conversational server management, and a complete OpenClaw CLI reference.

## User Preferences
I prefer iterative development, with a focus on delivering core features first and then refining them. When making changes, please ask before implementing major architectural shifts or complex features. I value clear, concise communication and prefer detailed explanations for significant decisions or complex code sections. Do not make changes to files outside the `client/src` and `server/` directories unless explicitly instructed.

## System Architecture
The application employs a client-server architecture.
- **Frontend**: Developed with React and TypeScript, leveraging Vite, Shadcn UI for components, `wouter` for routing, and TanStack Query for data management. Tailwind CSS manages styling, supporting dark/light themes.
- **Backend**: An Express.js REST API layer that interfaces with a PostgreSQL database via Drizzle ORM.
- **Authentication**: Utilizes MedInvest DID OAuth 2.0 (Authorization Code flow) with `express-session` and `connect-pg-simple`.
- **Multi-Instance Management**: The frontend uses an `InstanceContext`/`InstanceProvider` pattern for selecting and managing OpenClaw instances, with backend queries scoped by `instanceId`.
- **UI/UX Decisions**: Features a responsive design with sidebar navigation for easy access to various sections. The design prioritizes clarity and user-friendliness for managing complex configurations.
- **Feature Specifications**:
    - **Documentation Hub**: Supports CRUD operations for markdown documentation, including categories, tags, pinning, search, and filtering.
    - **Node Setup Wizard**: A guided 5-step process for OpenClaw gateway setup.
    - **Hostinger VPS Monitoring**: Provides real-time VPS monitoring, Docker project management, firewall configuration, and backup listing.
    - **OpenClaw Commands**: A comprehensive CLI reference with quick start guides, troubleshooting, and auto-generated SSH commands.
    - **AI Task Runner**: Conversational LLM interface for executing whitelisted SSH commands on the VPS.
    - **Code Guardian**: AI agent for scanning VPS health, proactively detecting and suggesting fixes for issues.
    - **Feature Proposals**: AI agent for generating feature improvement suggestions.
    - **Code Upgrade Agent**: AI-powered code analysis for improvements, refactors, and optimizations.
    - **System Monitor**: Real-time charts for CPU, Memory, Disk, and Network usage.
    - **Automation**: Cron job scheduler with templates for various tasks.
    - **File Manager**: VPS file browser via SSH.
    - **Metrics**: Analytics dashboard for message volume, API calls, node uptime, and guardian results.
    - **Marketplace**: Skill plugin catalog with installation, uninstallation, and deployment capabilities for node skills.
    - **Custom Skill Builder**: Allows deployment of private skills to the VPS via SSH.
    - **Email Workflows**: Database-backed automation for email patterns with preset templates and actions.
- **Data Models**: Key models include `openclaw_instances`, `settings`, `machines`, `apiKeys`, `llmApiKeys`, `vpsConnections`, `dockerServices`, `openclawConfig`, `integrations`, `users`, `whatsappSessions`, `automation_jobs`, `automation_runs`, `metrics_events`, and `email_workflows`.

## External Dependencies
- **Database**: PostgreSQL (via Drizzle ORM)
- **Authentication Provider**: MedInvest DID OAuth 2.0
- **Cloud/VPS Provider API**: Hostinger API
- **LLM Gateway**: OpenRouter
- **Messaging**: Baileys (for WhatsApp bot functionality)
- **Networking**: Tailscale
- **UI Component Library**: Shadcn UI
- **Data Fetching/State Management**: TanStack Query
- **Image Generation**: OpenAI DALL-E 3 / Google Gemini (via Nano Banana Pro skill)

## Nano Banana Pro (Image Generation)
The WhatsApp and Telegram bots support AI image generation via the "Nano Banana Pro" skill. The implementation works as follows:
- **`server/bot/openrouter.ts`**: Contains `generateImage()` function (tries OpenAI DALL-E 3 first, falls back to Gemini). The `chat()` function returns a `ChatResponse` object with `text` and optional `imagePrompt` fields. The system prompt instructs the LLM to output `[GENERATE_IMAGE: prompt]` tags when the user requests visual content.
- **`server/bot/whatsapp.ts`**: Has `sendImage()` method that sends image buffers via Baileys. The `handleMessage()` flow detects `imagePrompt` in the chat response and generates/sends images.
- **`server/bot/telegram.ts`**: Uses Telegram's `sendPhoto` API to deliver generated images.
- **`server/routes.ts`**: The home-bot API endpoint returns `imageBase64` and `imagePrompt` fields for remote bot image delivery.
- **Requires**: `OPENAI_API_KEY` or `GEMINI_API_KEY` environment variable to be set.

## WhatsApp Persistent Memory
The WhatsApp bot maintains conversation history per phone number using the `ai_conversations` and `ai_messages` database tables.
- **`server/routes.ts`**: The `home-bot-message` route creates a conversation per phone number (userId = `whatsapp:{phone}`), loads up to 20 recent messages as history, and saves both user and assistant messages after each exchange.
- **`server/bot/openrouter.ts`**: The `chat()` function accepts an optional `history` parameter (array of past user/assistant messages) which is injected between the system prompt and the current user message.
- History is capped at the last 20 message pairs to keep token usage manageable.