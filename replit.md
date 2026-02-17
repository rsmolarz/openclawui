# OpenClaw Dashboard - Settings Management

## Overview
A professional settings management dashboard for the OpenClaw AI agent gateway platform with multi-user authentication via MedInvest DID OAuth. Manage general settings, notifications, nodes/computers (via pairing codes), API keys, appearance preferences, VPS connection, Docker services monitoring, OpenClaw configuration (gateway, LLM with primary/fallback models from 70+ OpenRouter options, WhatsApp, Tailscale, node approvals), LLM API key management, and external integrations with full CRUD operations and PostgreSQL persistence.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI components, wouter routing, TanStack Query
- **Backend**: Express.js REST API with PostgreSQL (Drizzle ORM)
- **Authentication**: MedInvest DID OAuth 2.0 (Authorization Code flow) with express-session + connect-pg-simple
- **Styling**: Tailwind CSS with dark/light theme support

## Project Structure
```
client/src/
├── components/
│   ├── ui/           # Shadcn UI components
│   ├── app-sidebar.tsx  # Navigation sidebar
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── pages/
│   ├── overview.tsx                  # Dashboard overview with stats
│   ├── settings-general.tsx          # General settings
│   ├── settings-notifications.tsx    # Notification preferences
│   ├── settings-machines.tsx         # Node/computer management (pairing codes)
│   ├── settings-api-keys.tsx         # API key management
│   ├── settings-appearance.tsx       # Theme/appearance settings
│   ├── settings-vps.tsx              # VPS connection management
│   ├── settings-openclaw.tsx         # OpenClaw config, Docker, nodes
│   └── settings-integrations.tsx     # External integrations management
├── hooks/
│   ├── use-auth.ts           # Auth hook (useAuth) for session state
│   └── use-toast.ts
├── lib/
└── App.tsx

server/
├── index.ts          # Express entry (auto-starts WhatsApp bot if enabled)
├── routes.ts         # API routes
├── storage.ts        # Database storage layer
├── db.ts             # Drizzle connection
├── seed.ts           # Seed data
└── bot/
    ├── whatsapp.ts   # WhatsApp bot (Baileys) - QR auth, pairing, message routing
    └── openrouter.ts # OpenRouter LLM service - primary/fallback model support

shared/
└── schema.ts         # Drizzle schema + Zod types
```

## Data Models
- **settings**: Key-value settings with categories (general, notifications, appearance)
- **machines**: OpenClaw nodes/computers with hostname, IP address, OS, pairing code, display name, status (pending/paired/connected/disconnected)
- **apiKeys**: API keys with permissions and active status
- **vpsConnections**: VPS server connection details (IP, port, SSH user, key path, connection status)
- **dockerServices**: Docker container services (name, status, port, image, CPU/memory usage)
- **openclawConfig**: Gateway settings, LLM provider (primary + fallback), WhatsApp, Tailscale, node approvals
- **llmApiKeys**: LLM provider API keys (provider, label, apiKey, baseUrl, active status)
- **integrations**: External service integrations (name, type, category, enabled, status, config JSON, icon)
- **users**: MedInvest DID-linked user accounts (medinvestId, medinvestDid, username, displayName, email)
- **whatsappSessions**: WhatsApp user sessions (phone, displayName, status, pairingCode, approvedAt, lastMessageAt)

## API Endpoints

### Authentication (public)
- `GET /api/auth/me` - Get current authenticated user
- `GET /api/auth/medinvest/start` - Initiate MedInvest OAuth login flow
- `GET /api/auth/medinvest/callback` - OAuth callback (handles code exchange)
- `POST /api/auth/logout` - Destroy session and log out
- `GET /api/status` - Overall system status summary (public health check)

### Protected Routes (require authentication)
- `GET /api/settings` - List all settings
- `PATCH /api/settings/bulk` - Bulk update settings
- `GET /api/machines` - List nodes
- `POST /api/machines` - Create node
- `PATCH /api/machines/:id` - Update node
- `DELETE /api/machines/:id` - Delete node
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create API key
- `PATCH /api/api-keys/:id` - Update API key
- `DELETE /api/api-keys/:id` - Delete API key
- `GET /api/vps` - Get VPS connection config
- `POST /api/vps` - Upsert VPS connection settings
- `POST /api/vps/check` - Check VPS connection status
- `GET /api/docker/services` - List Docker services
- `GET /api/openclaw/config` - Get OpenClaw configuration
- `POST /api/openclaw/config` - Update OpenClaw configuration
- `GET /api/nodes/pending` - Get pending node approvals
- `POST /api/nodes/approve` - Approve a pending node
- `GET /api/llm-api-keys` - List LLM API keys
- `POST /api/llm-api-keys` - Create LLM API key
- `PATCH /api/llm-api-keys/:id` - Update LLM API key
- `DELETE /api/llm-api-keys/:id` - Delete LLM API key
- `GET /api/integrations` - List integrations
- `POST /api/integrations` - Create integration
- `PATCH /api/integrations/:id` - Update integration
- `DELETE /api/integrations/:id` - Delete integration
- `GET /api/whatsapp/status` - Get WhatsApp bot connection status
- `GET /api/whatsapp/qr` - Get QR code for WhatsApp pairing
- `POST /api/whatsapp/start` - Start the WhatsApp bot
- `POST /api/whatsapp/stop` - Stop the WhatsApp bot
- `POST /api/whatsapp/restart` - Restart the WhatsApp bot
- `GET /api/whatsapp/sessions` - List all WhatsApp user sessions
- `GET /api/whatsapp/pending` - List pending WhatsApp session approvals
- `POST /api/whatsapp/approve/:id` - Approve a pending WhatsApp session
- `DELETE /api/whatsapp/sessions/:id` - Delete a WhatsApp session

## Sidebar Navigation
- **Main**: Overview
- **Settings**: General, Notifications, Nodes, API Keys, Appearance
- **Infrastructure**: VPS Connection, OpenClaw Config, Integrations

## Integration Categories
- **messaging**: WhatsApp, Telegram, Discord, Slack
- **ai**: OpenRouter (LLM gateway)
- **networking**: Tailscale (mesh VPN)
- **automation**: Webhook, n8n
- **notifications**: Email / SMTP
- **iot**: MQTT

## Running
- `npm run dev` starts both frontend and backend on port 5000
- `npm run db:push` syncs database schema
