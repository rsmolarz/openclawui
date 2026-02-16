# OpenClaw Dashboard - Settings Management

## Overview
A professional settings management dashboard for the OpenClaw arcade platform. Manage general settings, notifications, claw machines, API keys, appearance preferences, VPS connection, Docker services monitoring, and OpenClaw configuration.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI components, wouter routing, TanStack Query
- **Backend**: Express.js REST API with PostgreSQL (Drizzle ORM)
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
│   ├── overview.tsx               # Dashboard overview with stats
│   ├── settings-general.tsx       # General settings
│   ├── settings-notifications.tsx # Notification preferences
│   ├── settings-machines.tsx      # Machine CRUD
│   ├── settings-api-keys.tsx      # API key management
│   ├── settings-appearance.tsx    # Theme/appearance settings
│   ├── settings-vps.tsx           # VPS connection management
│   └── settings-openclaw.tsx      # OpenClaw config, Docker, nodes
├── hooks/
├── lib/
└── App.tsx

server/
├── index.ts          # Express entry
├── routes.ts         # API routes
├── storage.ts        # Database storage layer
├── db.ts             # Drizzle connection
└── seed.ts           # Seed data

shared/
└── schema.ts         # Drizzle schema + Zod types
```

## Data Models
- **settings**: Key-value settings with categories (general, notifications, appearance)
- **machines**: Claw machines with name, location, status, config
- **apiKeys**: API keys with permissions and active status
- **vpsConnections**: VPS server connection details (IP, port, SSH user, key path, connection status)
- **dockerServices**: Docker container services (name, status, port, image, CPU/memory usage)
- **openclawConfig**: Gateway settings, LLM provider (primary + fallback), WhatsApp, Tailscale, node approvals
- **llmApiKeys**: LLM provider API keys (provider, label, apiKey, baseUrl, active status)

## API Endpoints
- `GET /api/settings` - List all settings
- `PATCH /api/settings/bulk` - Bulk update settings
- `GET /api/machines` - List machines
- `POST /api/machines` - Create machine
- `DELETE /api/machines/:id` - Delete machine
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
- `GET /api/status` - Overall system status summary
- `GET /api/llm-api-keys` - List LLM API keys
- `POST /api/llm-api-keys` - Create LLM API key
- `PATCH /api/llm-api-keys/:id` - Update LLM API key
- `DELETE /api/llm-api-keys/:id` - Delete LLM API key

## Sidebar Navigation
- **Main**: Overview
- **Settings**: General, Notifications, Machines, API Keys, Appearance
- **Infrastructure**: VPS Connection, OpenClaw Config

## Running
- `npm run dev` starts both frontend and backend on port 5000
- `npm run db:push` syncs database schema
