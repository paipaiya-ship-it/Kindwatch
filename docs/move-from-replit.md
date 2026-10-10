# Move Kindwatch from Replit to Render

The latest supplied Replit archive was compared with the original source archive.
The matching source files were identical. The fixes branch preserves that source
and its clinical prompt while applying the reviewed technical changes.

## Prepare a preview

1. Connect Render to the GitHub repository `paipaiya-ship-it/Kindwatch`.
2. Create a Node Web Service using branch `codex/technical-safety-fixes`.
3. Set build command to `npm ci && npm run build` and start command to `npm start`.
4. Add `OPENAI_API_KEY` as a secret environment variable in Render. Do not
   commit it to GitHub or paste it into chat.
5. Review the selected hosting plan and its costs before creating the service.

Render's free service can demonstrate the interface, but its local filesystem
is temporary. It cannot preserve feedback logs across restarts or idle shutdown.
For saved test cases, use a paid service with a persistent disk mounted at
`/var/data` and set `FEEDBACK_LOG_PATH=/var/data/feedback_log.jsonl`, or implement
durable database storage before collecting real submissions.

Existing Replit feedback records do not automatically transfer with deployment.
Back them up separately, preserve their privacy, and transfer them only through
the chosen protected storage mechanism. Keep these records out of a public repo.

## Verify before switching

- Use synthetic examples to check chat, feedback save, and chat reset.
- Restart the service and verify that saved feedback still exists.
- Clinician review is still needed for the replacement AI model and triage.
- No live provider evaluation is included in the automated tests.
- Keep the Replit copy until the replacement is verified.

Once the move is verified, stop the old Replit deployment and review its
subscription, usage limits, and credit auto-reload to prevent ongoing charges.
Hosting and OpenAI API billing are separate from Replit Agent billing.

References: https://render.com/docs/deploy-node-express-app and
https://render.com/docs/free
