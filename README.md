# Kindwatch

Kindwatch is a caregiver support chat app for dementia-related questions. It gives a caregiver a calm place to describe what is happening, sends that situation to an AI model with a large built-in safety and triage prompt, and returns guidance that is meant to help the caregiver decide what to watch, when to call a clinician, and when something may be urgent.

The current app is intentionally simple:
- One React page for the full chat experience
- One Express backend that forwards chat requests to Anthropic
- One feedback endpoint that writes comments to a local log file

## What The App Does

From a caregiver's point of view, the app works like this:

1. The app opens to a welcome message from Kindwatch.
2. The caregiver can either type their own question or tap one of the suggested starter prompts.
3. The frontend sends the recent conversation plus a long system prompt to the backend.
4. The backend forwards that request to Anthropic's Messages API.
5. Anthropic returns a response.
6. The frontend displays the answer as a chat bubble, including triage labels and urgent alert styling when the response contains warning text.
7. After each assistant response, the caregiver can mark it helpful or not helpful and optionally leave a comment.

## How It Works Today

### Frontend flow

The frontend lives in [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx).

It currently handles all of these jobs in one file:
- stores the full `SYSTEM_PROMPT`
- stores the welcome message and suggested starter questions
- renders the whole chat screen
- manages message state, loading state, reset behavior, and scrolling
- posts chat requests to `/api/chat`
- posts feedback to `/api/feedback`
- formats assistant messages so triage badges and alert banners stand out

Important implementation details:
- The app keeps the displayed messages in React state.
- It separately keeps the model conversation in `conversationRef`.
- Only the last 6 conversation turns are sent to the AI model on each request.
- The model is hardcoded to `claude-sonnet-4-20250514`.
- If the API call fails, the UI shows a plain connection error message in the chat.

### Backend flow

The backend starts in [server/index.ts](/Users/Seetha/Downloads/Kindwatch/server/index.ts).

It:
- creates the Express app and HTTP server
- parses JSON requests
- logs `/api` requests
- warns at startup if `ANTHROPIC_API_KEY` is missing
- registers API routes
- serves Vite in development and the built app in production

The actual API handlers live in [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts).

There are currently only 2 active routes:
- `POST /api/chat`
  - expects `model`, `max_tokens`, `system`, and `messages`
  - forwards the request directly to `https://api.anthropic.com/v1/messages`
  - returns Anthropic's JSON response to the frontend
- `POST /api/feedback`
  - accepts `responseText`, `comment`, and `timestamp`
  - appends each feedback entry to [feedback_log.jsonl](/Users/Seetha/Downloads/Kindwatch/feedback_log.jsonl)

### Data and storage

There is user-storage scaffolding, but it is not currently used by the running app:
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts) defines a `users` table shape
- [server/storage.ts](/Users/Seetha/Downloads/Kindwatch/server/storage.ts) provides an in-memory user store

That means the current Kindwatch app is effectively:
- stateless for chat history beyond the current browser session
- file-based for feedback
- not using authentication yet
- not using PostgreSQL yet

## Project Structure

### Main runtime files

- [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx): main product logic and UI
- [client/src/main.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/main.tsx): React entry point
- [server/index.ts](/Users/Seetha/Downloads/Kindwatch/server/index.ts): server startup and middleware
- [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts): API endpoints
- [server/vite.ts](/Users/Seetha/Downloads/Kindwatch/server/vite.ts): dev-time Vite integration
- [server/static.ts](/Users/Seetha/Downloads/Kindwatch/server/static.ts): production static serving
- [script/build.ts](/Users/Seetha/Downloads/Kindwatch/script/build.ts): production build script

### Supporting files

- [client/src/index.css](/Users/Seetha/Downloads/Kindwatch/client/src/index.css): global CSS tokens and utility layers
- [replit.md](/Users/Seetha/Downloads/Kindwatch/replit.md): project notes and architecture summary for Replit/Codex
- [package.json](/Users/Seetha/Downloads/Kindwatch/package.json): scripts and dependencies

### Files that are mostly scaffolding right now

- [server/storage.ts](/Users/Seetha/Downloads/Kindwatch/server/storage.ts)
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts)
- most files under [client/src/components/ui](/Users/Seetha/Downloads/Kindwatch/client/src/components/ui)

Those UI component files are installed and available, but the current chat page mostly uses inline styles instead of those shared components.

## Running The App

### Requirements

- Node.js
- An Anthropic API key

### Install

```bash
npm install
```

### Set environment variable

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### Start development server

```bash
npm run dev
```

This starts the Express server and the Vite-powered frontend together.

### Production build

```bash
npm run build
npm start
```

## Current Limitations

- The full system prompt is embedded directly in the frontend bundle.
- Nearly all product logic is in one large file: [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx).
- Feedback is only stored in a local JSONL file.
- There is no auth, no saved user history, and no clinician-facing review dashboard yet.
- The backend mostly acts as a thin proxy and does very little validation.
- The CSS token file still contains placeholder values that are not being used by the main chat UI.

## To-Do Roadmap

This section is meant to be practical. Each item says what should change and where that change belongs.

### 1. Split the giant frontend file into maintainable pieces

Why this matters:
- Right now one file owns prompt content, UI, API calls, feedback UI, and formatting logic.
- That makes edits risky because even small changes can accidentally affect unrelated behavior.

Files to change:
- [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx)
  - reduce it to page-level state orchestration
- Create `client/src/components/chat/Message.tsx`
  - move chat bubble rendering, triage styling, and alert banner logic here
- Create `client/src/components/chat/FeedbackButtons.tsx`
  - move the feedback controls here
- Create `client/src/components/chat/TypingIndicator.tsx`
  - move typing animation here
- Create `client/src/lib/systemPrompt.ts`
  - move the `SYSTEM_PROMPT`, welcome text, and suggested questions here

### 2. Move the system prompt off the client side

Why this matters:
- The current frontend sends the system prompt from the browser.
- That means prompt logic is exposed and can be modified client-side before the request is sent.
- Sensitive prompt policy is usually safer and easier to manage on the server.

Files to change:
- [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx)
  - stop sending the full `system` field from the browser
- [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts)
  - define or import the system prompt server-side and attach it before forwarding to Anthropic
- Create `server/kindwatchPrompt.ts`
  - keep the system prompt in one backend-owned file

### 3. Add stronger request validation and error handling

Why this matters:
- `/api/chat` currently trusts most of the request body.
- Better validation will prevent malformed requests and make failures easier to debug.

Files to change:
- [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts)
  - validate `messages`, `max_tokens`, and message shape before calling Anthropic
  - return clearer structured errors
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts)
  - add Zod schemas for chat request and feedback request payloads

### 4. Persist feedback in a real datastore

Why this matters:
- `feedback_log.jsonl` is fine for early prototyping, but it is hard to query, review, and analyze over time.
- A table-backed approach would make it much easier to learn from poor responses.

Files to change:
- [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts)
  - replace file append logic with a storage call
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts)
  - add a feedback table schema
- [server/storage.ts](/Users/Seetha/Downloads/Kindwatch/server/storage.ts)
  - add feedback create/list methods
- [drizzle.config.ts](/Users/Seetha/Downloads/Kindwatch/drizzle.config.ts)
  - wire schema updates into Drizzle migrations

### 5. Save conversation history instead of keeping it only in the browser

Why this matters:
- The current conversation disappears on refresh.
- Persisted sessions would allow caregivers to return to earlier conversations or share them with a clinician.

Files to change:
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts)
  - add conversation and message tables
- [server/storage.ts](/Users/Seetha/Downloads/Kindwatch/server/storage.ts)
  - add CRUD methods for conversations and messages
- [server/routes.ts](/Users/Seetha/Downloads/Kindwatch/server/routes.ts)
  - save messages before and after model responses
- [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx)
  - load a saved thread and reset against a server-backed conversation id

### 6. Decide whether the unused auth/database scaffolding should be finished or removed

Why this matters:
- The repo currently suggests a bigger authenticated app than what is actually live.
- Finishing that path or removing unused scaffolding will make the project easier to understand.

Files to change:
- [server/storage.ts](/Users/Seetha/Downloads/Kindwatch/server/storage.ts)
  - either expand this into real persistence or delete unused methods
- [shared/schema.ts](/Users/Seetha/Downloads/Kindwatch/shared/schema.ts)
  - either add the rest of the needed tables or simplify it to only active data models
- [package.json](/Users/Seetha/Downloads/Kindwatch/package.json)
  - remove auth/db packages that are not part of the plan, or document that they are planned

### 7. Replace placeholder design tokens and unify styling

Why this matters:
- [client/src/index.css](/Users/Seetha/Downloads/Kindwatch/client/src/index.css) still contains many placeholder `red` token values.
- The page mostly relies on inline styles, so the design system is only partially active.

Files to change:
- [client/src/index.css](/Users/Seetha/Downloads/Kindwatch/client/src/index.css)
  - replace placeholder tokens with real color values
- [client/src/App.tsx](/Users/Seetha/Downloads/Kindwatch/client/src/App.tsx)
  - move repeated inline styles into reusable classes or components
- optionally use the installed shared UI components in [client/src/components/ui](/Users/Seetha/Downloads/Kindwatch/client/src/components/ui)

### 8. Add tests around safety-critical behavior

Why this matters:
- This app is doing triage-flavored guidance.
- The highest-risk regressions are not visual. They are prompt changes, bad API wiring, and broken feedback capture.

Files to change:
- Create `server/routes.test.ts`
  - test `/api/chat` validation and API error handling
- Create `client/src/App.test.tsx`
  - test starter prompts, send flow, reset flow, and feedback submission
- [package.json](/Users/Seetha/Downloads/Kindwatch/package.json)
  - add a test runner and scripts

## Short Summary

Kindwatch already works as a focused prototype: a caregiver types a concern, the app sends recent conversation context plus a safety-heavy prompt to Anthropic, and the user gets triaged guidance back in a polished chat UI.

The next major improvement is not "add more features first." It is to move the prompt and business logic into cleaner server and component boundaries so future changes are safer and easier to trust.
