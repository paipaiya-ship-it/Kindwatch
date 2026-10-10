import type { Express } from "express";
import type { Server } from "http";
import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { SYSTEM_PROMPT } from "./kindwatchPrompt";
import { CHAT_MODEL, PROMPT_VERSION, chatSchema, feedbackSchema, rateLimiter } from "./apiPolicy";
import path from "path";
import { answerFormat, readOpenAIAnswer } from "./openaiResponse";

const VALID_TRIAGE_LEVELS = new Set([
  "GREEN",
  "YELLOW",
  "RED",
  "CAREGIVER_SUPPORT",
]);

type StructuredChatResponse = {
  triage: "GREEN" | "YELLOW" | "RED" | "CAREGIVER_SUPPORT";
  redFlagAlert?: string;
  content: string;
  showDisclaimer?: boolean;
};

function isStructuredChatResponse(value: unknown): value is StructuredChatResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.triage === "string" &&
    VALID_TRIAGE_LEVELS.has(candidate.triage) &&
    typeof candidate.content === "string" &&
    typeof candidate.redFlagAlert === "string" &&
    typeof candidate.showDisclaimer === "boolean" &&
    Object.keys(candidate).every(key => ["triage", "redFlagAlert", "content", "showDisclaimer"].includes(key))
  );
}

function tryParseStructuredJson(rawText: string): StructuredChatResponse | null {
  try {
    const parsed = JSON.parse(rawText);
    return isStructuredChatResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  options: { fetchImpl?: typeof fetch; feedbackPath?: string; timeoutMs?: number; rateLimit?: number; maxConcurrent?: number } = {},
): Promise<Server> {
  const fetchImpl = options.fetchImpl || fetch;
  let inFlight = 0;
  app.use(["/api/chat", "/api/feedback"], rateLimiter(options.rateLimit));

  app.post("/api/chat", async (req, res) => {
    const validated = chatSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: { message: "Invalid conversation. Send only messages within the size limits." } });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: { message: "The chat service is not configured." } });
    }

    if (inFlight >= (options.maxConcurrent ?? 4)) {
      return res.status(503).json({ error: { message: "The chat service is busy. Please try again shortly." } });
    }
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    inFlight += 1;

    try {
      const body = JSON.stringify({
        model: CHAT_MODEL,
        instructions: SYSTEM_PROMPT,
        input: validated.data.messages,
        max_output_tokens: 1000,
        reasoning: { effort: "none" },
        store: false,
        text: { format: answerFormat },
      });

      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(502).json({ error: { message: "The AI service could not answer. Please try again shortly." } });
      }

      const rawText = readOpenAIAnswer(data);
      if (rawText === null) {
        return res.status(502).json({ error: { message: "The AI answer was incomplete. No guidance was returned." } });
      }

      const parsed = tryParseStructuredJson(rawText);

      if (!parsed || !parsed.content.trim()) {
        return res.status(502).json({
          error: { message: "Model returned invalid structured output" },
        });
      }

      return res.json({
        triage: parsed.triage,
        redFlagAlert: parsed.redFlagAlert || "",
        content: parsed.content,
        showDisclaimer: Boolean(parsed.showDisclaimer) || parsed.triage === "RED" || Boolean(parsed.redFlagAlert),
        requestId, model: CHAT_MODEL, promptVersion: PROMPT_VERSION,
      });
    } catch {
      if (!res.destroyed) {
        res.status(controller.signal.aborted ? 504 : 502).json({ error: { message:
          controller.signal.aborted
            ? "The AI request timed out. If this is urgent, seek medical help without waiting for the app."
            : "The AI service could not be reached. Please try again." } });
      }
    } finally {
      clearTimeout(timeout);
      res.off("close", onClose);
      inFlight -= 1;
    }
  });

  app.post("/api/feedback", async (req, res) => {
    const validated = feedbackSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: { message: "Invalid feedback. Please check the comment length." } });
    }
    const entry = {
      ...validated.data,
      timestamp: validated.data.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };
    try {
      const filePath = options.feedbackPath || process.env.FEEDBACK_LOG_PATH ||
        path.join(process.cwd(), "runtime_data", "feedback_log.jsonl");
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(entry) + "\n", "utf8");
      console.log("[Kindwatch Feedback]", JSON.stringify(entry));
      return res.json({ ok: true });
    } catch {
      console.error("Failed to store Kindwatch feedback");
      return res.status(500).json({ error: { message: "Your feedback could not be saved. Please try again." } });
    }
  });

  return httpServer;
}

