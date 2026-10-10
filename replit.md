# Kindwatch — Replit Project Guide

## Overview

Kindwatch is an AI-powered dementia caregiver coaching application. It provides compassionate, evidence-based guidance to family caregivers and professional care staff dealing with dementia-related behavioral challenges. The app acts as a bridge between worried caregivers and clinical guidance — helping them understand what they're observing, when to escalate, and what to say to their doctors.

Key capabilities include:
- Triage of dementia behavioral scenarios (wandering, agitation, medication refusal, bathing resistance, hallucinations, sleep disturbances, appetite problems, caregiver burnout)
- Red-flag detection for urgent medical situations (delirium, stroke, infection, falls)
- Condition-specific triggered responses for nuanced situations (holidays, vacations, adult day programs, hospice, placement, end-of-life care)
- Feedback logging for response quality review

The product is named **Kindwatch** and is internally described as "built by a geriatrician."

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend Architecture

- **Framework:** React (with TypeScript, TSX)
- **Build Tool:** Vite with `@vitejs/plugin-react`
- **Styling:** Tailwind CSS with a custom design token system using CSS variables (HSL-based colors, custom border radii)
- **UI Components:** shadcn/ui (New York style) built on Radix UI primitives — full suite of accessible component primitives installed
- **State & Data Fetching:** TanStack React Query v5 for server state management
- **Forms:** React Hook Form with Zod resolvers
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`
- **Entry Point:** `client/index.html` → `client/src/main.tsx` → `client/src/App.tsx`
- **Fonts:** Google Fonts (DM Sans, Geist Mono, Fira Code, Architects Daughter)

The core UI logic lives in `client/src/App.tsx`, which contains the full system prompt for the Kindwatch AI persona, chat state management, and the suggestion question pool for onboarding users.

### Backend Architecture

- **Runtime:** Node.js with TypeScript (compiled via `tsx` in dev, `esbuild` in prod)
- **Framework:** Express v5
- **Key Routes:**
  - `POST /api/chat` — Proxies requests to the Anthropic Claude API. Reads `ANTHROPIC_API_KEY` from environment, forwards model/messages/system prompt, returns Claude's response.
  - `POST /api/feedback` — Logs caregiver feedback entries to a local `feedback_log.jsonl` file and console.
- **Static Serving:** In production, serves the Vite-built client from `dist/public/`. In development, uses Vite middleware directly.
- **Build:** `script/build.ts` runs Vite for the client and esbuild for the server, bundling selected server dependencies (including `@google/generative-ai`, `openai`, `anthropic`, `express`, `drizzle-orm`, `pg`, etc.) into a single CJS bundle at `dist/index.cjs`.

### AI Integration

- **Primary AI Provider:** Anthropic Claude (API proxied through `/api/chat`)
- **System Prompt:** Embedded in `client/src/App.tsx` — a large, structured prompt defining the Kindwatch persona, triage levels (Green/Yellow/Red), scenario triggers, red flag detection logic, and caregiver communication guidelines.
- **Pattern:** The client assembles the full request (model, max_tokens, system, messages array) and sends it to the backend proxy, which attaches the API key and forwards to Anthropic. This keeps the API key server-side only.

### Data Storage

- **Schema:** Defined in `shared/schema.ts` using Drizzle ORM with PostgreSQL dialect
- **Current Tables:** `users` (id, username, password) — basic user table, not yet actively used in the chat flow
- **ORM:** Drizzle ORM with `drizzle-zod` for schema-derived validation
- **Active Storage:** `MemStorage` class in `server/storage.ts` — currently uses in-memory Map for users (no database calls in production flow yet)
- **Database Config:** `drizzle.config.ts` points to PostgreSQL via `DATABASE_URL` env variable; migrations output to `./migrations`
- **Feedback:** Written to a flat `feedback_log.jsonl` file on disk (not yet in the database)

### Shared Code

- `shared/schema.ts` is imported by both client-side (type inference) and server-side code, providing a single source of truth for data types using TypeScript path aliases.

### Authentication

- Schema and storage interface exist for users (username/password), but authentication is not yet wired into the active application routes. The `IStorage` interface and `MemStorage` implementation are in place as scaffolding.

---

## External Dependencies

### AI / LLM

| Service | Purpose | Config |
|---|---|---|
| **Anthropic Claude** | Core AI responses for caregiver coaching | `ANTHROPIC_API_KEY` env var |

The build allowlist also includes `openai` and `@google/generative-ai` packages, suggesting future multi-provider support may be planned.

### Database

| Service | Purpose | Config |
|---|---|---|
| **PostgreSQL** | User data persistence (schema defined, MemStorage used currently) | `DATABASE_URL` env var |
| **connect-pg-simple** | PostgreSQL-backed session store (installed, not yet active) | Requires `DATABASE_URL` |

### Frontend UI Libraries

- **Radix UI** — Full suite of headless accessible components (accordion, dialog, dropdown, select, toast, etc.)
- **shadcn/ui** — Component layer on top of Radix UI
- **TanStack React Query** — Server state and caching
- **React Hook Form + @hookform/resolvers** — Form handling with Zod validation
- **Tailwind CSS + PostCSS + Autoprefixer** — Utility-first styling
- **Embla Carousel** — Carousel component
- **cmdk** — Command palette
- **date-fns** — Date utilities
- **clsx + class-variance-authority** — Conditional class utilities

### Replit-Specific

- `@replit/vite-plugin-runtime-error-modal` — Dev error overlay (always active in dev)
- `@replit/vite-plugin-cartographer` — Source mapping tool (active in dev on Replit)
- `@replit/vite-plugin-dev-banner` — Dev environment banner (active in dev on Replit)

### Potential Future Integrations (in build allowlist)

- `stripe` — Payment processing
- `nodemailer` — Email sending
- `passport` / `passport-local` — Authentication
- `jsonwebtoken` — JWT auth
- `multer` — File uploads
- `xlsx` — Spreadsheet export
- `ws` — WebSockets
- `express-session` / `express-rate-limit` — Session management and rate limiting