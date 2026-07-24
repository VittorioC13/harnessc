import { z } from "zod";
import { callJsonModel, estimateCostUsd, MissingApiKeyError, RETRY_BACKOFF_MS, sleep, type LlmUsage } from "./llm.js";
import type { FailureEvent } from "./summarize.js";

export interface EventWithSession extends FailureEvent {
  sessionId: string;
  project: string;
}

export type Severity = "low" | "medium" | "high";

export interface FailureCluster {
  name: string;
  count: number;
  sessionsAffected: number;
  evidenceExcerpts: string[];
  suggestedFix: string;
  topSeverity: Severity;
}

export interface ClusterResult {
  clusters: FailureCluster[];
  usage: LlmUsage;
  costUsd: number;
  skipped: boolean;
  warning?: string;
}

const ClusterSchema = z.object({
  name: z.string().min(1),
  eventIndices: z.array(z.number().int().nonnegative()).min(1),
  suggestedFix: z.string().min(1),
});
const ResponseSchema = z.object({ clusters: z.array(ClusterSchema) });

const MAX_ATTEMPTS = 2;
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const SYSTEM_PROMPT = `You group a numbered list of failure events (each from a coding agent's
session history) into named clusters of recurring mistakes.

Rules:
- Each cluster "name" must be SPECIFIC and imperative-style, e.g. "Uses deprecated
  fetchUser() instead of getUser()" or "Forgets to run db:migrate after editing schema
  files". Forbidden: vague names like "Coding errors" or "Various issues".
- Group events into the SAME cluster only if they describe the same underlying, recurring
  mistake — merge near-duplicates (same mistake worded differently), but do not force
  unrelated events together just to make a cluster.
- "eventIndices" lists the number of every input event that belongs to this cluster. Every
  event may appear in at most one cluster; it's fine to leave one-off events that don't
  recur out of every cluster.
- "suggestedFix" is 2-4 sentences: a concrete lint rule, AGENTS.md line, or CI check a team
  could add to make this mistake impossible.
- Respond with ONLY a JSON object of the shape {"clusters": [...]}. No prose, no markdown
  fences.`;

function buildUserPrompt(events: EventWithSession[]): string {
  const items = events.map((e, i) => `${i}. [${e.severity}] ${e.description} (evidence: ${e.evidence})`).join("\n");
  return `Failure events:\n\n${items}`;
}

function retryPrompt(userPrompt: string): string {
  return `${userPrompt}\n\nYour previous response did not match the required JSON schema. Respond again with ONLY valid JSON: {"clusters": [{"name": string, "eventIndices": number[], "suggestedFix": string}]}`;
}

function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return { promptTokens: a.promptTokens + b.promptTokens, completionTokens: a.completionTokens + b.completionTokens };
}

function topSeverityOf(events: EventWithSession[]): Severity {
  let best: Severity = "low";
  for (const e of events) {
    if (SEVERITY_RANK[e.severity] > SEVERITY_RANK[best]) best = e.severity;
  }
  return best;
}

export async function clusterFailureEvents(events: EventWithSession[]): Promise<ClusterResult> {
  if (events.length === 0) {
    return { clusters: [], usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0, skipped: false };
  }

  const basePrompt = buildUserPrompt(events);
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
      const { clusters: rawClusters } = ResponseSchema.parse(parsed);

      const clusters: FailureCluster[] = [];
      for (const raw of rawClusters) {
        const memberEvents = raw.eventIndices.map((i) => events[i]).filter((e): e is EventWithSession => e !== undefined);
        if (memberEvents.length === 0) continue;
        clusters.push({
          name: raw.name,
          count: memberEvents.length,
          sessionsAffected: new Set(memberEvents.map((e) => e.sessionId)).size,
          evidenceExcerpts: [...new Set(memberEvents.map((e) => e.evidence))].slice(0, 3),
          suggestedFix: raw.suggestedFix,
          topSeverity: topSeverityOf(memberEvents),
        });
      }
      clusters.sort((a, b) => b.count - a.count || SEVERITY_RANK[b.topSeverity] - SEVERITY_RANK[a.topSeverity]);

      return { clusters, usage, costUsd: estimateCostUsd(usage), skipped: false };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    clusters: [],
    usage,
    costUsd: estimateCostUsd(usage),
    skipped: true,
    warning: `skipped after ${MAX_ATTEMPTS} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  };
}
