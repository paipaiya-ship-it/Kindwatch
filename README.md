# Kindwatch

Kindwatch is an AI-powered dementia caregiver support app created by geriatricians.
It offers caregiver guidance, model-generated triage, and feedback collection for evaluation.

## Structure

- `client/src/App.tsx`: React chat screen, recent conversation, reset, and feedback UI.
- `client/src/lib/requestLifecycle.ts`: cancellation and stale-response protection.
- `server/kindwatchPrompt.ts`: clinical system prompt, moved unchanged from the original frontend.
- `server/apiPolicy.ts`: approved model, prompt identifier, payload limits, and rate limiting.
- `server/routes.ts`: Anthropic chat integration and feedback storage.
- `server/index.ts`: Express startup and API response logging.
- `shared/chatPolicy.ts`: shared request size limits.
- `script/`: development, production, and build entry points.
- `tests/reliability.test.ts`: simulated-provider integration and request-lifecycle tests.

React 18, TypeScript, Vite 7, Express 5, and Node.js are the active stack.
Tailwind and Radix/shadcn components are available, although the chat uses mostly inline styles.
PostgreSQL, Drizzle user storage, and authentication packages remain unused scaffolding.
There is no active login or saved patient database.

## Run locally

Use Node.js 20.19 or later. Install exact dependency versions:

```sh
npm ci
```

Set `ANTHROPIC_API_KEY` in the server environment (Replit Secrets when running there).
Never put a key into browser code, GitHub, or a chat message.
The app does not automatically load a local .env file.

```sh
npm run dev
```

Express serves the browser app and API together on `PORT`, default 5000.
For a production build:

```sh
npm run build
npm start
```

Starting a production build does not deploy it.
Replit deployment must be initiated separately.

## Chat behavior and limits

The browser sends only `messages`. The server owns the clinical prompt,
`claude-sonnet-4-20250514`, and the 1,000 output-token limit.
Attempts to supply a replacement system prompt, model, or token limit are rejected.

To control cost, each request includes at most the last **six individual messages**,
not six exchanges. Older symptoms and medicines may no longer be available to the AI.
The interface tells caregivers to repeat important details. This change does not introduce
automatic summaries or claim that older clinical context is preserved.
Recent assistant messages retain their triage and alert fields as JSON.

Messages are limited to 8,000 characters each, six per request, 48,000 total.
The JSON body limit is 128 KiB. These are size limits, not precise token accounting.
Reset cancels the request, clears local state, and prevents an old response entering a new chat.
The browser deadline is 60 seconds; the provider deadline is 45 seconds.
Incomplete or malformed provider answers return an error instead of partial guidance.
These checks validate structure and completion, not clinical correctness.

Per-process protection allows 20 requests per minute per connection IP across chat
and feedback and at most four concurrent AI calls. It does not provide authentication,
a daily spending budget, or distributed rate limiting. The app does not trust forwarded
IP headers by default; behind a reverse proxy, clients may share one rate bucket.
Configure proxy identity and shared limits appropriately before expanding a pilot.
Do not enable unrestricted proxy trust just to avoid a shared rate bucket.

The canned `?testMode=1` responses are available only in development.
They are rendering examples, not a clinical evaluation.

## Evaluation logs

Full feedback and API response logging are retained intentionally for test-case review.
This can contain caregiver health information. Operators must define access, disclosure,
retention, and deletion for real submissions.

New feedback is appended asynchronously to `runtime_data/feedback_log.jsonl`.
Set `FEEDBACK_LOG_PATH` to choose another server-side destination.
Success is reported only after append succeeds; failures remain retryable in the interface.
Feedback includes the preceding caregiver message, answer, optional comment, rating,
triage and alert, request ID, model, prompt identifier, and server receipt time where available.

The existing root `feedback_log.jsonl` is left unchanged as historical evaluation material.
It is not the default destination for new records. The runtime folder is ignored by Git.
Reset does not erase server logs or data already sent to the AI provider.
Local files may be lost or diverge across hosting instances; persistent shared storage
and a review workflow remain future work.
If a feedback request times out after storage completed, retrying can duplicate a record.

## Verification

```sh
npm run check
npm test
npm run build
npm run smoke
```

Tests use synthetic data and an injected provider; they never call Anthropic.
They cover request tampering and limits, timeouts, incomplete output, rate limiting,
feedback storage failures, and stale-response ownership after reset.

## Clinical review still required

The clinical prompt is unchanged by these technical fixes.
The repository does not contain evidence of clinical validation.
See `docs/clinical-review.md` for decisions and scenarios to review before release.
Changing AI providers is a separate change requiring credentials and comparative evaluation.
