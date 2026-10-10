import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";

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
    (candidate.redFlagAlert === undefined ||
      typeof candidate.redFlagAlert === "string") &&
    (candidate.showDisclaimer === undefined ||
      typeof candidate.showDisclaimer === "boolean")
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

function extractStructuredResponse(rawText: string): StructuredChatResponse | null {
  const trimmed = rawText.trim();

  const direct = tryParseStructuredJson(trimmed);
  if (direct) {
    return direct;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const fenced = tryParseStructuredJson(fencedMatch[1]);
    if (fenced) {
      return fenced;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = tryParseStructuredJson(trimmed.slice(firstBrace, lastBrace + 1));
    if (sliced) {
      return sliced;
    }
  }

  // Fallback for legacy prose responses so a follow-up turn doesn't hard-fail.
  let triage: StructuredChatResponse["triage"] | null = null;
  let redFlagAlert = "";
  let sawDisclaimer = false;
  const contentLines: string[] = [];

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.includes("🟢 GREEN") || line === "GREEN") {
      triage = "GREEN";
      continue;
    }
    if (line.includes("🟡 YELLOW") || line === "YELLOW") {
      triage = "YELLOW";
      continue;
    }
    if (line.includes("🔴 RED") || line === "RED") {
      triage = "RED";
      continue;
    }
    if (line.includes("🤍 CAREGIVER SUPPORT") || line === "CAREGIVER_SUPPORT") {
      triage = "CAREGIVER_SUPPORT";
      continue;
    }

    if (line.startsWith("⚠️") || line.includes("RED FLAG ALERT")) {
      if (!redFlagAlert) {
        redFlagAlert = line;
      }
      continue;
    }

    if (line.toUpperCase().startsWith("DISCLAIMER")) {
      sawDisclaimer = true;
      continue;
    }

    if (
      line.includes("Kindwatch provides guidance and educational support only") ||
      line.includes("does not replace medical assessment or professional care")
    ) {
      sawDisclaimer = true;
      continue;
    }

    contentLines.push(line);
  }

  if (!triage || contentLines.length === 0) {
    return null;
  }

  return {
    triage,
    redFlagAlert,
    content: contentLines.join("\n\n"),
    showDisclaimer: sawDisclaimer || Boolean(redFlagAlert) || triage === "RED",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/chat", async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
    }

    const { model, max_tokens, system, messages } = req.body;

    if (!model || !messages) {
      return res.status(400).json({ error: { message: "Missing required fields: model and messages" } });
    }

    try {
      const body = JSON.stringify({ model, max_tokens, system, messages });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      const rawText =
        data.content?.map((block: { text?: string }) => block.text || "").join("").trim() ||
        "";

      const parsed = extractStructuredResponse(rawText);

      if (!parsed) {
        return res.status(502).json({
          error: { message: "Model returned invalid structured output" },
        });
      }

      return res.json({
        triage: parsed.triage,
        redFlagAlert: parsed.redFlagAlert || "",
        content: parsed.content,
        showDisclaimer: Boolean(parsed.showDisclaimer),
      });
    } catch (err: any) {
      console.error("Anthropic API error:", err);
      res.status(500).json({ error: { message: err?.message || "Failed to reach Anthropic API" } });
    }
  });

  app.post("/api/feedback", (req, res) => {
    const { rating, userText, responseText, comment, timestamp } = req.body;

    if (!rating || !responseText) {
      return res.status(400).json({
        error: { message: "Missing required feedback fields" },
      });
    }

    const entry = {
      timestamp: timestamp || new Date().toISOString(),
      rating,
      userText: userText || "",
      responseText,
      comment: comment || "",
    };
    console.log("[Kindwatch Feedback]", JSON.stringify(entry));
    try {
      const filePath = path.join(process.cwd(), "feedback_log.jsonl");
      fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
    } catch (e) {
      console.error("Failed to write feedback log:", e);
    }
    res.json({ ok: true });
  });

  return httpServer;
}
