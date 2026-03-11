# LARP Forge
PRD link
https://docs.google.com/document/d/1uY4jDEDKPggJHHOw5Wfza_urne-oCMe6

AI-Powered Platform for LARP Game Design.

Build character webs, generate player briefs with AI, and manage your live-action role-playing game — all in one structured workspace.

## Architecture

```
web/                    Next.js 14 (App Router) + tRPC + Prisma
├── src/
│   ├── app/            Pages & API routes
│   │   ├── api/ai/     AI endpoints (chat, brief generation, audit)
│   │   ├── api/trpc/   tRPC handler
│   │   ├── api/auth/   NextAuth handler
│   │   ├── api/export/ Brief export (HTML/PDF)
│   │   ├── dashboard/  User dashboard
│   │   ├── game/[id]/  Game workspace (overview, characters, graph, plotlines, chat)
│   │   └── auth/       Sign-in page
│   ├── components/     React components
│   │   ├── ui/         Design system (Button, Input, Modal, Badge, etc.)
│   │   ├── game/       Game-specific (CharacterDetail, BriefPanel, AuditPanel, etc.)
│   │   └── layout/     Layout components (AppShell)
│   ├── lib/            Shared utilities
│   │   ├── ai/         AI context builder, prompts, LLM client
│   │   ├── auth.ts     NextAuth configuration
│   │   ├── db.ts       Prisma client singleton
│   │   ├── trpc.ts     tRPC React client
│   │   └── utils.ts    cn() utility
│   └── server/         tRPC server
│       ├── trpc.ts     tRPC initialization + auth middleware
│       └── routers/    Domain routers (game, character, relationship, plotline, brief, chat)
├── prisma/
│   └── schema.prisma   Database schema
└── prisma.config.ts    Prisma 7 config
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (or use [Neon](https://neon.tech) for serverless)
- An LLM API key (Anthropic Claude or OpenAI GPT-4)

### Setup

```bash
cd web
npm install
cp .env.example .env
# Edit .env with your database URL and API keys
npx prisma migrate dev --name init
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | App URL (http://localhost:3000 for dev) |
| `NEXTAUTH_SECRET` | Yes | Session encryption secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `ANTHROPIC_API_KEY` | * | Claude API key (preferred) |
| `OPENAI_API_KEY` | * | OpenAI API key (fallback) |

\* At least one LLM API key is required for AI features.

## Key Features (MVP)

- **Game Workspace**: Create games with metadata, upload design documents
- **Character Management**: Full CRUD with factions, archetypes, status tracking
- **Relationship Editor**: Typed edges (rivalry, alliance, love, etc.) with intensity and direction
- **Interactive Network Graph**: Force-directed graph with faction coloring, edge styling, filters
- **AI Chat**: Streaming chat with full game context awareness
- **Brief Generation**: Structured character briefs (backstory, goals, secrets, relationships, mechanics)
- **Section-level Editing**: Edit and regenerate individual brief sections
- **Version History**: Every brief generation creates a new version; rollback supported
- **Game Audit**: Rule-based + AI-powered structural analysis (isolated characters, thin plotlines, etc.)
- **Export**: HTML export of character briefs (print to PDF supported)
- **Onboarding**: Guided first-run flow

## Deployment

### Railway

```bash
# Install Railway CLI
railway login
railway init
railway up
```

Set environment variables in Railway dashboard.

## Data Model

Core entities form a connected graph:
- **Game** → contains Characters, Relationships, Plotlines, Files, Chat
- **GameEntity** (Character/NPC) → has BriefVersions, connected via Relationships
- **Relationship** → typed directed edge between two entities
- **Plotline** → links to entities via junction table
- **BriefVersion** → versioned, structured sections, approval workflow
- **ChatMessage** → persistent conversation history per game
