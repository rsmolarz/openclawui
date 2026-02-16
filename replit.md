# OpenClaw Dashboard - Settings Management

## Overview
A professional settings management dashboard for the OpenClaw arcade platform. Manage general settings, notifications, claw machines, API keys, and appearance preferences.

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
│   ├── overview.tsx           # Dashboard overview
│   ├── settings-general.tsx   # General settings
│   ├── settings-notifications.tsx
│   ├── settings-machines.tsx  # Machine CRUD
│   ├── settings-api-keys.tsx  # API key management
│   └── settings-appearance.tsx
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

## Running
- `npm run dev` starts both frontend and backend on port 5000
- `npm run db:push` syncs database schema
