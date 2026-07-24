import { readFile } from "node:fs/promises";
import { discoverSessions, type DiscoverOptions } from "./transcripts.js";

export type SignalType = "tool_error" | "user_correction" | "retry_churn";

export interface FailureCandidate {
  sessionId: string;
  project: string;
  timestamp: Date;
  excerpt: string;
  signalType: SignalType;
}

export interface SignalsResult {
  candidatesBySession: Map<string, FailureCandidate[]>;
  totalCandidates: number;
  sessionsScanned: number;
}

const MAX_EXCERPT_LENGTH = 500;
const MAX_CANDIDATES_PER_SESSION = 40;
// A short user reply shortly after a tool error is treated as a correction signal even
// without a matching phrase, per PRD §7 Step B ("short frustrated messages following a
// tool error").
const CORRECTION_AFTER_ERROR_WINDOW_MS = 5 * 60 * 1000;
const SHORT_MESSAGE_MAX_LENGTH = 80;

const TOOL_ERROR_PATTERN =
  /\berror\b|\bfailed\b|\bfailure\b|cannot find|not found|stack trace|traceback|type\s*error|exception/i;
const CORRECTION_PATTERN =
  /\bno[,.]?\b|that'?s wrong|you broke|\bagain\b|\bundo\b|\brevert\b|still failing|\bi said\b|don'?t\b/i;

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

// Tools whose output is command/execution feedback, where free-text phrases like "error"
// or "failed" are a reliable failure signal. Read/Grep/Glob/WebFetch etc. return file or
// search content that legitimately discusses "error" as prose (e.g. a PRD's own "Error
// handling" section) — for those, only the structured is_error flag counts.
const COMMAND_EXECUTION_TOOLS = new Set(["Bash", "BashOutput"]);

interface RawLine {
  type?: string;
  timestamp?: string;
  message?: { content?: unknown };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function blockToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => blockToText(item)).join("\n");
  }
  if (content && typeof content === "object") {
    const block = content as ContentBlock;
    if (block.type === "text" && typeof block.text === "string") return block.text;
    if (block.type === "tool_result") return blockToText(block.content);
    return safeJson(content);
  }
  return String(content ?? "");
}

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXCERPT_LENGTH ? `${trimmed.slice(0, MAX_EXCERPT_LENGTH)}…` : trimmed;
}

function typedTextOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is ContentBlock => !!block && typeof block === "object" && block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

async function extractFromSession(
  filePath: string,
  sessionId: string,
  project: string,
): Promise<FailureCandidate[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  const candidates: FailureCandidate[] = [];
  let lastToolErrorAt: number | undefined;
  let retrySignature: string | undefined;
  let retryCount = 0;
  const toolNameByUseId = new Map<string, string>();

  const atCapacity = () => candidates.length >= MAX_CANDIDATES_PER_SESSION;

  for (const line of lines) {
    let parsed: RawLine;
    try {
      parsed = JSON.parse(line) as RawLine;
    } catch {
      continue;
    }
    if (!parsed || (parsed.type !== "user" && parsed.type !== "assistant")) continue;

    const timestamp = typeof parsed.timestamp === "string" ? new Date(parsed.timestamp) : new Date();
    const rawContent = parsed.message?.content;
    const blocks = Array.isArray(rawContent) ? (rawContent as ContentBlock[]) : undefined;

    if (parsed.type === "assistant" && blocks && !atCapacity()) {
      for (const block of blocks) {
        if (block.type !== "tool_use") continue;
        if (block.id) toolNameByUseId.set(block.id, block.name ?? "");
        const signature = `${block.name ?? ""}:${safeJson(block.input)}`;
        retryCount = signature === retrySignature ? retryCount + 1 : 1;
        retrySignature = signature;
        if (retryCount === 3 && !atCapacity()) {
          candidates.push({
            sessionId,
            project,
            timestamp,
            excerpt: truncate(
              `Repeated tool call ${block.name ?? "unknown"} 3+ times in a row: ${safeJson(block.input)}`,
            ),
            signalType: "retry_churn",
          });
        }
      }
    }

    if (parsed.type === "user" && blocks && !atCapacity()) {
      for (const block of blocks) {
        if (block.type !== "tool_result") continue;
        const text = blockToText(block.content);
        const toolName = block.tool_use_id ? toolNameByUseId.get(block.tool_use_id) : undefined;
        const looksLikeError =
          block.is_error === true ||
          (toolName !== undefined && COMMAND_EXECUTION_TOOLS.has(toolName) && TOOL_ERROR_PATTERN.test(text));
        if (looksLikeError && !atCapacity()) {
          candidates.push({ sessionId, project, timestamp, excerpt: truncate(text), signalType: "tool_error" });
          lastToolErrorAt = timestamp.getTime();
        }
      }
    }

    if (parsed.type === "user") {
      const text = typedTextOf(rawContent).trim();
      if (text && !atCapacity()) {
        const matchesPhrase = CORRECTION_PATTERN.test(text);
        const isShortAfterError =
          lastToolErrorAt !== undefined &&
          text.length <= SHORT_MESSAGE_MAX_LENGTH &&
          timestamp.getTime() - lastToolErrorAt < CORRECTION_AFTER_ERROR_WINDOW_MS;
        if (matchesPhrase || isShortAfterError) {
          candidates.push({ sessionId, project, timestamp, excerpt: truncate(text), signalType: "user_correction" });
        }
      }
    }
  }

  return candidates;
}

export async function extractSignals(opts: DiscoverOptions = {}): Promise<SignalsResult> {
  const discovered = await discoverSessions(opts);
  const candidatesBySession = new Map<string, FailureCandidate[]>();
  let totalCandidates = 0;

  for (const session of discovered.sessions) {
    const candidates = await extractFromSession(session.filePath, session.sessionId, session.project);
    if (candidates.length > 0) {
      candidatesBySession.set(session.sessionId, candidates);
      totalCandidates += candidates.length;
    }
  }

  return { candidatesBySession, totalCandidates, sessionsScanned: discovered.sessions.length };
}
