import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@shared/chatPolicy";
import { RequestLifecycle } from "./lib/requestLifecycle";

type TriageLevel = "GREEN" | "YELLOW" | "RED" | "CAREGIVER_SUPPORT";

type EvaluationMetadata = {
  requestId?: string;
  model?: string;
  promptVersion?: string;
};

type ChatMessage = EvaluationMetadata & {
  role: "user" | "assistant";
  content: string;
  time: string;
  triage?: TriageLevel;
  redFlagAlert?: string;
  showDisclaimer?: boolean;
};

type StructuredAssistantResponse = EvaluationMetadata & {
  triage: TriageLevel;
  redFlagAlert: string;
  content: string;
  showDisclaimer: boolean;
};

type FakeTestCase = {
  id: string;
  label: string;
  prompt: string;
  response: unknown;
};

const VALID_TRIAGE_LEVELS = new Set<TriageLevel>([
  "GREEN",
  "YELLOW",
  "RED",
  "CAREGIVER_SUPPORT",
]);

function isStructuredAssistantResponse(
  value: unknown,
): value is {
  triage: TriageLevel;
  redFlagAlert?: string;
  content: string;
  showDisclaimer?: boolean;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.triage === "string" &&
    VALID_TRIAGE_LEVELS.has(candidate.triage as TriageLevel) &&
    typeof candidate.content === "string" &&
    (candidate.redFlagAlert === undefined ||
      typeof candidate.redFlagAlert === "string") &&
    (candidate.showDisclaimer === undefined ||
      typeof candidate.showDisclaimer === "boolean")
  );
}

function normalizeStructuredAssistantResponse(
  value: unknown,
): StructuredAssistantResponse {
  if (!isStructuredAssistantResponse(value)) {
    throw new Error("Invalid structured assistant response");
  }

  return {
    triage: value.triage,
    redFlagAlert: value.redFlagAlert || "",
    content: value.content,
    showDisclaimer: Boolean(value.showDisclaimer),
    ...Object.fromEntries(["requestId", "model", "promptVersion"].flatMap(key => {
      const field = (value as Record<string, unknown>)[key];
      return typeof field === "string" ? [[key, field]] : [];
    })),
  };
}



const SUGGESTED_QUESTIONS = [
  "Something seems off today but I can't explain it",
  "They're refusing to take their medications",
  "They've been more confused than usual since yesterday",
  "They were trying to leave the house last night",
  "I'm exhausted and don't know how much longer I can do this",
];

const FAKE_TEST_CASES: FakeTestCase[] = [
  {
    id: "green-routine",
    label: "Green Routine",
    prompt: "She keeps asking what day it is every 10 minutes.",
    response: {
      triage: "GREEN",
      redFlagAlert: "",
      content:
        "This sounds like repetitive questioning, which is common in dementia.\n\n**What to try**\n- Answer briefly and calmly.\n- Redirect to a familiar activity afterward.\n- Avoid pointing out that she already asked.",
      showDisclaimer: false,
    },
  },
  {
    id: "yellow-monitoring",
    label: "Yellow Monitoring",
    prompt: "He has been refusing his pills for 3 days but otherwise seems like himself.",
    response: {
      triage: "YELLOW",
      redFlagAlert: "",
      content:
        "Medication refusal for several days deserves follow-up with his doctor or pharmacist.\n\n**What to try**\n- Keep the routine calm and matter-of-fact.\n- Ask the pharmacist whether the pills can be changed to a smaller or liquid form.\n- Mention any swallowing difficulty or spitting out to the doctor.",
      showDisclaimer: false,
    },
  },
  {
    id: "red-emergency",
    label: "Red Emergency",
    prompt: "My mom is suddenly much more confused today and she is very hard to wake up.",
    response: {
      triage: "RED",
      redFlagAlert:
        "⚠️ RED FLAG ALERT: Sudden confusion with unusual sleepiness may indicate delirium or another urgent medical problem. Contact emergency services or urgent medical care now.",
      content:
        "This sounds more serious than routine dementia symptoms. If this change is new today, she should be evaluated promptly.",
      showDisclaimer: true,
    },
  },
  {
    id: "caregiver-support",
    label: "Caregiver Support",
    prompt: "I'm exhausted and I don't know how much longer I can do this.",
    response: {
      triage: "CAREGIVER_SUPPORT",
      redFlagAlert: "",
      content:
        "What you just said matters.\nHave you eaten today, or is there someone you can call right now?",
      showDisclaimer: false,
    },
  },
  {
    id: "malformed",
    label: "Malformed Output",
    prompt: "Run the malformed response test.",
    response: {
      content: 123,
    },
  },
];

function DisclaimerBox() {
  return (
    <div
      style={{
        background: "rgba(251,191,36,0.12)",
        border: "1px solid rgba(251,191,36,0.4)",
        borderRadius: "10px",
        padding: "10px 14px",
        marginTop: "12px",
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: "13px", flexShrink: 0, marginTop: "1px" }}>
        ⚠️
      </span>
      <span
        style={{
          fontSize: "12px",
          color: "rgba(180,140,40,1)",
          lineHeight: "1.55",
          fontFamily: "system-ui",
        }}
      >
        Kindwatch provides educational support only and does not replace medical
        advice from a doctor. For emergencies call 911.
      </span>
    </div>
  );
}

function AlertBanner() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ff3b30, #c0392b)",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "12px",
        boxShadow: "0 4px 20px rgba(255,59,48,0.4)",
        animation: "pulseAlert 2s ease-in-out infinite",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: "15px",
          fontWeight: "700",
          color: "#fff",
          marginBottom: "4px",
          letterSpacing: "0.02em",
        }}
      >
        ⚠️ URGENT — Please Read Carefully
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.92)",
          lineHeight: "1.5",
        }}
      >
        This response contains important health alerts. Review the full message
        below immediately.
      </div>
    </div>
  );
}

function Message({
  msg,
  isWelcome = false,
  previousUserText = "",
}: {
  msg: ChatMessage;
  isWelcome?: boolean;
  previousUserText?: string;
}) {
  const isUser = msg.role === "user";
  const hasAlert = !isUser && Boolean(msg.redFlagAlert);

  const triageConfig: Record<
    TriageLevel,
    { bg: string; border: string; color: string; label: string }
  > = {
    GREEN: {
      bg: "rgba(46,139,74,0.15)",
      border: "rgba(46,139,74,0.4)",
      color: "#2e8b4a",
      label: "🟢 GREEN — Routine dementia behavior",
    },
    YELLOW: {
      bg: "rgba(200,160,0,0.15)",
      border: "rgba(200,160,0,0.4)",
      color: "#a07800",
      label: "🟡 YELLOW — Monitor closely / follow up with clinician",
    },
    RED: {
      bg: "rgba(255,59,48,0.12)",
      border: "rgba(255,59,48,0.4)",
      color: "#c0392b",
      label: "🔴 RED — Possible medical emergency",
    },
    CAREGIVER_SUPPORT: {
      bg: "rgba(180,160,200,0.12)",
      border: "rgba(150,120,180,0.35)",
      color: "#7a5fa0",
      label: "🤍 CAREGIVER SUPPORT",
    },
  };

  const formatContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (trimmed === "---") {
        return (
          <hr
            key={i}
            style={{
              border: "none",
              borderTop: "1px solid rgba(0,0,0,0.1)",
              margin: "10px 0",
            }}
          />
        );
      }
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const formatted = parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} style={{ color: isUser ? "#fff" : "#1a3a4a" }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });
      return (
        <div
          key={i}
          style={{ minHeight: line ? "auto" : "8px", marginBottom: "2px" }}
        >
          {formatted}
        </div>
      );
    });
  };

  const triageBadge = !isUser && msg.triage ? triageConfig[msg.triage] : null;
  const shouldShowTemplatedDisclaimer =
    !isUser &&
    !msg.content.startsWith("Connection error:") &&
    (Boolean(msg.showDisclaimer) ||
      (!isWelcome && !msg.content.trim().endsWith("?")));

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "20px",
        alignItems: "flex-start",
        gap: "10px",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            boxShadow: "0 2px 8px rgba(46,139,122,0.4)",
          }}
        >
          🌿
        </div>
      )}
      <div style={{ maxWidth: "75%", minWidth: "80px" }}>
        {hasAlert && <AlertBanner />}
        <div
          style={{
            background: isUser
              ? "linear-gradient(135deg, #2e8b7a, #1a6b5a)"
              : "rgba(255,255,255,0.96)",
            color: isUser ? "#fff" : "#1a3a4a",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: "14px 18px",
            fontSize: "14px",
            lineHeight: "1.65",
            fontFamily: "'Lora', Georgia, serif",
            boxShadow: isUser
              ? "0 4px 16px rgba(46,139,122,0.3)"
              : "0 2px 12px rgba(0,0,0,0.08)",
            border: hasAlert ? "1px solid rgba(255,59,48,0.3)" : "none",
          }}
        >
          {!isUser && triageBadge && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: triageBadge.bg,
                border: `1px solid ${triageBadge.border}`,
                borderRadius: "20px",
                padding: "4px 12px",
                marginBottom: "12px",
                fontSize: "12px",
                fontWeight: "600",
                color: triageBadge.color,
                fontFamily: "system-ui",
                letterSpacing: "0.04em",
              }}
            >
              {triageBadge.label}
            </div>
          )}
          {!isUser && msg.redFlagAlert && (
            <div
              style={{
                color: "#ff3b30",
                fontWeight: "700",
                fontSize: "15px",
                marginBottom: "6px",
              }}
            >
              {msg.redFlagAlert}
            </div>
          )}
          {formatContent(msg.content)}
          {shouldShowTemplatedDisclaimer && <DisclaimerBox />}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "rgba(100,120,130,0.7)",
            marginTop: "5px",
            textAlign: isUser ? "right" : "left",
            fontFamily: "system-ui",
          }}
          className="msg-timestamp"
        >
          {isUser ? "You" : "Kindwatch"} · {msg.time}
        </div>
        {!isUser && !isWelcome && (
          <FeedbackButtons
            metadata={{ requestId: msg.requestId, model: msg.model, promptVersion: msg.promptVersion, triage: msg.triage, redFlagAlert: msg.redFlagAlert }}
            responseText={msg.content}
            userText={previousUserText}
          />
        )}
      </div>
      {isUser && (
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #4a7fa5, #2d5f82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "17px",
            boxShadow: "0 2px 8px rgba(74,127,165,0.4)",
          }}
        >
          👤
        </div>
      )}
    </div>
  );
}

function FeedbackButtons({
  responseText, userText, metadata,
}: {
  responseText: string;
  userText: string;
  metadata: EvaluationMetadata & { triage?: TriageLevel; redFlagAlert?: string };
}) {
  const [state, setState] = useState<"idle" | "helpful" | "not-helpful">("idle");
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  const saveFeedback = async (rating: "helpful" | "not_helpful", comment: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, userText, responseText, comment, ...metadata,
          timestamp: new Date().toISOString() }),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error("Feedback was not saved");
      if (rating === "helpful") setState("helpful");
      else setSubmitted(true);
    } catch {
      setError("Your feedback could not be saved. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (state === "helpful" || submitted) {
    return <div style={{ marginTop: 8, color: "#2e8b7a" }} role="status">
      Thank you — your feedback has been saved.
    </div>;
  }

  const buttonStyle = { borderRadius: 16, padding: "8px 14px", cursor: "pointer",
    border: "1px solid rgba(46,139,122,0.4)", background: "rgba(46,139,122,0.1)" };
  return (
    <div style={{ marginTop: 10 }}>
      {state === "not-helpful" ? (
        <>
          <div style={{ marginBottom: 6 }}>What could have been better? (optional)</div>
          <textarea data-testid="feedback-text" value={feedbackText} maxLength={4000}
            aria-label="Feedback comment" disabled={saving}
            onChange={event => setFeedbackText(event.target.value)}
            placeholder="Share anything that would help us improve..."
            rows={2} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button data-testid="feedback-submit" style={buttonStyle} disabled={saving}
              onClick={() => void saveFeedback("not_helpful", feedbackText)}>Submit</button>
            <button data-testid="feedback-skip" style={buttonStyle} disabled={saving}
              onClick={() => void saveFeedback("not_helpful", "")}>Skip comment</button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button data-testid="feedback-helpful" className="feedback-btn" style={buttonStyle}
            disabled={saving} onClick={() => void saveFeedback("helpful", "")}>👍 Helpful</button>
          <button data-testid="feedback-not-helpful" className="feedback-btn" style={buttonStyle}
            disabled={saving} onClick={() => { setState("not-helpful"); setError(""); }}>👎 Not Helpful</button>
        </div>
      )}
      {saving && <div role="status">Saving feedback…</div>}
      {error && <div role="alert" style={{ marginTop: 6, color: "#a83232" }}>{error}</div>}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        marginBottom: "20px",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          flexShrink: 0,
          background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
        }}
      >
        🌿
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.96)",
          borderRadius: "18px 18px 18px 4px",
          padding: "16px 20px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#2e8b7a",
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: 
    "Hello, I'm **Kindwatch** 🌿\n\nI'm an AI companion created by geriatricians who has spent years caring for people with dementia and supporting the families who love them.\n\nI'm here to help you make sense of what you're seeing, find the words to talk to their doctor, and feel a little less alone in one of the hardest things you'll ever do.\n\nWhat's on your mind today?",
  time: new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
  showDisclaimer: true,
};

export default function DementiaCoach() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const isTestMode =
    import.meta.env.DEV && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("testMode") === "1";
  const requests = useRef(new RequestLifecycle());
  useEffect(() => () => requests.current.cancel(), []);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const clearConversation = () => {
    requests.current.cancel();
    setLoading(false);
    setInput("");
    conversationRef.current = [];
    const freshWelcome: ChatMessage = {
      ...WELCOME_MESSAGE,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages([freshWelcome]);
    setShowSuggestions(true);
  };

  const addAssistantMessage = (
    assistantData: unknown,
    time: string,
  ) => {
    const structured = normalizeStructuredAssistantResponse(assistantData);
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: structured.content,
      triage: structured.triage,
      redFlagAlert: structured.redFlagAlert,
      showDisclaimer: structured.showDisclaimer,
      requestId: structured.requestId,
      model: structured.model,
      promptVersion: structured.promptVersion,
      time,
    };

    conversationRef.current = [
      ...conversationRef.current,
      { role: "assistant", content: JSON.stringify({
        triage: structured.triage,
        redFlagAlert: structured.redFlagAlert,
        content: structured.content,
        showDisclaimer: structured.showDisclaimer,
      }) },
    ];

    setMessages((prev) => [...prev, assistantMsg]);
  };

  const runFakeTestCase = (testCase: FakeTestCase) => {
    if (loading) return;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMsg: ChatMessage = {
      role: "user",
      content: testCase.prompt,
      time,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    conversationRef.current = [
      ...conversationRef.current,
      { role: "user", content: testCase.prompt },
    ];

    try {
      addAssistantMessage(testCase.response, time);
    } catch (err) {
      const errMessage =
        err instanceof Error
          ? err.message
          : "Invalid fake test case response.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Connection error: ${errMessage}`,
          time,
        },
      ]);
    }
  };

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || requests.current.active) return;
    if (userText.length > MAX_MESSAGE_LENGTH) {
      setMessages((previous) => [...previous, {
        role: "assistant", time: new Date().toLocaleTimeString(),
        content: "Your question is too long to send. Please shorten it while keeping the important symptoms, medicines, and timing.",
      }]);
      return;
    }
    const controller = requests.current.begin();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMsg: ChatMessage = { role: "user", content: userText, time };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    conversationRef.current = [
      ...conversationRef.current,
      { role: "user", content: userText },
    ];

    try {
      const response = await fetch("/api/chat", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationRef.current.slice(-6),
        }),
      });

      const data = await response.json();
      if (!requests.current.isCurrent(controller)) return;
      if (!response.ok || data.error) {
        const errMsg = data.error?.message || "Unknown error from API.";
        throw new Error(errMsg);
      }

      addAssistantMessage(data, time);
    } catch (err) {
      if (!requests.current.isCurrent(controller)) return;
      const errMessage = controller.signal.aborted
        ? "The request timed out. No guidance was received. If this is urgent, seek medical help without waiting for the app."
        : err instanceof Error
          ? err.message
          : "I'm having trouble connecting right now. Please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Connection error: ${errMessage}`,
          time,
        },
      ]);
    } finally {
      window.clearTimeout(timeout);
      if (requests.current.finish(controller)) {
        setLoading(false);
        inputRef.current?.focus();
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #0d2b35 0%, #0f3d4a 40%, #0d2b35 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Lora', Georgia, serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=Lora:wght@400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } body { margin: 0; } @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } } @keyframes pulseAlert { 0%, 100% { box-shadow: 0 4px 20px rgba(255,59,48,0.4); } 50% { box-shadow: 0 4px 30px rgba(255,59,48,0.7); } } @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } } textarea:focus { outline: none; } textarea { resize: none; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(46,139,122,0.3); border-radius: 10px; } .suggestion-btn:hover { background: rgba(46,139,122,0.25) !important; border-color: rgba(46,139,122,0.6) !important; transform: translateY(-1px); } .send-btn:hover:not(:disabled) { background: linear-gradient(135deg, #3aa090, #2e8b7a) !important; transform: scale(1.05); } .send-btn:disabled { opacity: 0.5; cursor: not-allowed; } @media (max-width: 600px) { .header-root { padding: 12px 16px 10px !important; } .header-subtitles { display: none !important; } .messages-root { padding: 16px 14px !important; } .input-root { padding: 12px 14px 16px !important; } .suggestion-list { flex-direction: column !important; } .suggestion-btn { width: 100% !important; border-radius: 12px !important; padding: 14px 18px !important; } .send-btn { width: 48px !important; height: 48px !important; font-size: 18px !important; } .feedback-btn { padding: 9px 18px !important; font-size: 13px !important; min-height: 44px !important; } .msg-timestamp { font-size: 12px !important; } }`}</style>

      {/* Background texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(46,139,122,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(74,127,165,0.06) 0%, transparent 50%)",
        }}
      />

      {/* Header */}
      <div
        className="header-root"
        style={{
          padding: "20px 28px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(13,43,53,0.8)",
          backdropFilter: "blur(20px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              boxShadow: "0 4px 16px rgba(46,139,122,0.4)",
            }}
          >
            🌿
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: "22px",
                fontWeight: "700",
                color: "#e8f4f0",
                letterSpacing: "-0.02em",
              }}
            >
              Kindwatch
            </div>
            <div className="header-subtitles">
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(180,220,210,0.7)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Because something seems off isn't enough.
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "rgba(180,220,210,0.5)",
                  letterSpacing: "0.04em",
                  marginTop: "2px",
                }}
              >
                You're not alone in this.
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={clearConversation}
          data-testid="button-clear-conversation"
          title="Clear conversation"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: "13px",
            color: "rgba(180,220,210,0.6)",
            fontFamily: "system-ui",
            fontWeight: "500",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.1)";
            (e.target as HTMLButtonElement).style.color =
              "rgba(180,220,210,0.95)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.05)";
            (e.target as HTMLButtonElement).style.color =
              "rgba(180,220,210,0.6)";
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Messages */}
      <div
        className="messages-root"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          maxWidth: "860px",
          width: "100%",
          margin: "0 auto",
          alignSelf: "stretch",
        }}
      >
        {messages.map((msg, i) => {
          const previousUserText =
            msg.role === "assistant" && messages[i - 1]?.role === "user"
              ? messages[i - 1].content
              : "";

          return (
            <Message
              key={i}
              msg={msg}
              isWelcome={i === 0}
              previousUserText={previousUserText}
            />
          );
        })}
        {loading && <TypingIndicator />}

        {/* Suggestions */}
        {showSuggestions && messages.length <= 1 && (
          <div
            style={{
              marginTop: "8px",
              animation: "fadeSlideIn 0.5s ease-out 0.3s both",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "rgba(180,220,210,0.75)",
                marginBottom: "14px",
                fontFamily: "system-ui",
                letterSpacing: "0.03em",
              }}
            >
              Common questions to get started — or type your own below
            </div>
            <div
              className="suggestion-list"
              style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
            >
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => sendMessage(q)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "24px",
                    padding: "12px 18px",
                    color: "rgba(220,240,235,0.92)",
                    fontSize: "15px",
                    cursor: "pointer",
                    fontFamily: "'Lora', Georgia, serif",
                    transition: "all 0.2s ease",
                    textAlign: "left",
                    lineHeight: "1.5",
                    minHeight: "44px",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {isTestMode && (
              <>
                <div
                  style={{
                    fontSize: "14px",
                    color: "rgba(180,220,210,0.75)",
                    marginTop: "18px",
                    marginBottom: "14px",
                    fontFamily: "system-ui",
                    letterSpacing: "0.03em",
                  }}
                >
                  Local fake test cases — no API cost
                </div>
                <div
                  className="suggestion-list"
                  style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
                >
                  {FAKE_TEST_CASES.map((testCase) => (
                    <button
                      key={testCase.id}
                      className="suggestion-btn"
                      onClick={() => runFakeTestCase(testCase)}
                      style={{
                        background: "rgba(46,139,122,0.14)",
                        border: "1px solid rgba(46,139,122,0.3)",
                        borderRadius: "24px",
                        padding: "12px 18px",
                        color: "rgba(220,240,235,0.92)",
                        fontSize: "15px",
                        cursor: "pointer",
                        fontFamily: "'Lora', Georgia, serif",
                        transition: "all 0.2s ease",
                        textAlign: "left",
                        lineHeight: "1.5",
                        minHeight: "44px",
                      }}
                    >
                      {testCase.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="input-root"
        style={{
          padding: "16px 28px 24px",
          background: "rgba(13,43,53,0.9)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "16px",
              padding: "10px 10px 10px 18px",
              transition: "border-color 0.2s",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind today?"
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(230,245,240,0.95)",
                fontSize: "15px",
                fontFamily: "'Lora', Georgia, serif",
                lineHeight: "1.6",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                flexShrink: 0,
                background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 10px rgba(46,139,122,0.4)",
              }}
            >
              ↑
            </button>
          </div>
          <div
            style={{
              marginTop: "8px",
              textAlign: "center",
              fontSize: "11px",
              color: "rgba(130,160,155,0.5)",
              fontFamily: "system-ui",
            }}
          >
            The AI sees only the last six messages. Repeat important symptoms, medicines, and timing when needed.<br />
            For emergencies, always call 911 immediately · Kindwatch is an AI
            assistant, not a substitute for medical care
          </div>
        </div>
      </div>
    </div>
  );
}


