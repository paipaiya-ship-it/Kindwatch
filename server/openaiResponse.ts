export const answerFormat = {
  type: "json_schema",
  name: "kindwatch_answer",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      triage: { type: "string", enum: ["GREEN", "YELLOW", "RED", "CAREGIVER_SUPPORT"] },
      redFlagAlert: { type: "string" },
      content: { type: "string" },
      showDisclaimer: { type: "boolean" },
    },
    required: ["triage", "redFlagAlert", "content", "showDisclaimer"],
  },
} as const;

// Raw REST responses have output items; output_text is an SDK convenience.
export function readOpenAIAnswer(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const response = data as Record<string, unknown>;
  if (response.status !== "completed" || response.error || response.incomplete_details ||
      !Array.isArray(response.output) || response.output.length !== 1) return null;
  const message = response.output[0];
  if (!message || message.type !== "message" || message.role !== "assistant" ||
      message.status !== "completed" || !Array.isArray(message.content) ||
      message.content.length !== 1) return null;
  const block = message.content[0];
  if (!block || block.type !== "output_text" || typeof block.text !== "string") return null;
  return block.text;
}
