import { z } from "zod";
import type { RequestHandler } from "express";
import { createHash } from "node:crypto";
import { SYSTEM_PROMPT } from "./kindwatchPrompt";
import { MAX_MESSAGES, MAX_MESSAGE_LENGTH, MAX_CONVERSATION_LENGTH } from "../shared/chatPolicy";

export const CHAT_MODEL = "claude-sonnet-5-5";
export const PROMPT_VERSION = createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 16);
export const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(MAX_MESSAGE_LENGTH).refine(text => Boolean(text.trim())),
  }).strict()).min(1).max(MAX_MESSAGES),
}).strict().refine(({ messages }) =>
  messages[messages.length - 1]?.role === "user" &&
  messages.reduce((total, message) => total + message.content.length, 0) <= MAX_CONVERSATION_LENGTH,
);
export const feedbackSchema = z.object({
  rating: z.enum(["helpful", "not_helpful"]),
  userText: z.string().max(MAX_MESSAGE_LENGTH).default(""),
  responseText: z.string().min(1).max(20_000),
  comment: z.string().max(4_000).default(""),
  timestamp: z.string().datetime().optional(),
  requestId: z.string().uuid().optional(),
  model: z.literal(CHAT_MODEL).optional(),
  promptVersion: z.string().regex(/^[a-f0-9]{16}$/).optional(),
  triage: z.enum(["GREEN", "YELLOW", "RED", "CAREGIVER_SUPPORT"]).optional(),
  redFlagAlert: z.string().max(4_000).optional(),
}).strict();

// Per-process pilot protection; multi-instance deployments need shared limits.
export function rateLimiter(limit = 20): RequestHandler {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.expires <= now) buckets.delete(key);
    }
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const bucket = buckets.get(key) || { count: 0, expires: now + 60_000 };
    if (bucket.count >= limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.expires - now) / 1000))));
      res.status(429).json({ error: { message: "Too many requests. Please wait a minute." } });
      return;
    }
    if (!buckets.has(key) && buckets.size >= 10_000) {
      res.status(503).json({ error: { message: "The app is busy. Please try again later." } });
      return;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    next();
  };
}
