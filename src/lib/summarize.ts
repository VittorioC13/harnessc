import { z } from "zod";
import type { FailureCandidate } from "./signals.js";
import { callJsonModel, estimateCostUsd, MissingApiKeyError, RETRY_BACKOFF_MS, sleep, type LlmUsage } from "./llm.js";

export const FailureEventSchema = z.object({
  description: z.string().min(1),
  category: z.string().min(1),
  evidence: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
});
export type FailureEvent = z.infer<typeof FailureEventSchema>;

const ResponseSchema = z.object({ events: z.array(FailureEventSchema) });

const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You analyze failure signals extracted from a coding agent's session transcript.
Given a numbered list of candidate failure moments (tool errors, user corrections, or
repeated retries of the same command), identify distinct failure events.

Rules:
- Each "description" must be exactly ONE sentence and must NAME the actual command, file,
  function, or tool involved. Example of a GOOD description: "Ran npm test before npm
  install, causing module-not-found errors." Example of a FORBIDDEN description (too
  generic, never write like this): "The agent made some coding errors." or "Issues with
  code quality were detected."
- "category" is a short label for the kind of mistake (e.g. "missing dependency", "wrong
  file edited", "ignored user instruction").
- "evidence" must be a short excerpt taken from the candidates given, supporting the
  description.
- "severity" must be exactly one of: "low", "medium", "high".
- If several candidates describe the same underlying mistake, merge them into one event
  instead of emitting a duplicate per candidate.
- Respond with ONLY a JSON object of the shape {"events": [...]}. No prose, no markdown
  code fences, no text outside the JSON object.`;

function buildUserPrompt(candidates: FailureCandidate[]): string {
  const items = candidates
    .map((c, i) => `${i + 1}. [${c.signalType}] ${c.timestamp.toISOString()}\n${c.excerpt}`)
    .join("\n\n");
  return `Candidates from one session:\n\n${items}`;
}

function retryPrompt(userPrompt: string): string {
  return `${userPrompt}\n\nYour previous response did not match the required JSON schema. Respond again with ONLY valid JSON: {"events": [{"description": string, "category": string, "evidence": string, "severity": "low"|"medium"|"high"}]}`;
}

function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return { promptTokens: a.promptTokens + b.promptTokens, completionTokens: a.completionTokens + b.completionTokens };
}

export interface SummarizeResult {
  events: FailureEvent[];
  usage: LlmUsage;
  costUsd: number;
  skipped: boolean;
  warning?: string;
}

export async function summarizeSession(candidates: FailureCandidate[]): Promise<SummarizeResult> {
  const basePrompt = buildUserPrompt(candidates);
  let usage: LlmUsage = { promptTokens: 0, completionTokens: 0 };
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prompt = attempt === 0 ? basePrompt : retryPrompt(basePrompt);
    let response;
    try {
      response = await callJsonModel(SYSTEM_PROMPT, prompt);
    } catch (err) {
      if (err instanceof MissingApiKeyError) throw err;
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(RETRY_BACKOFF_MS);
      continue;
    }
    usage = addUsage(usage, response.usage);
    try {
      const parsed: unknown = JSON.parse(response.content);
      const { events } = ResponseSchema.parse(parsed);
      return { events, usage, costUsd: estimateCostUsd(usage), skipped: false };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    events: [],
    usage,
    costUsd: estimateCostUsd(usage),
    skipped: true,
    warning: `skipped after ${MAX_ATTEMPTS} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  };
}
