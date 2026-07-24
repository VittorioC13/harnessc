import OpenAI from "openai";

export const DEFAULT_MODEL = "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

// DeepSeek's published per-token pricing (checked 2026-07-24 against
// api-docs.deepseek.com/quick_start/pricing). We use the cache-miss input rate as a
// conservative estimate since we don't track the actual cache-hit ratio.
const INPUT_COST_PER_MILLION_USD = 0.14;
const OUTPUT_COST_PER_MILLION_USD = 0.28;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "DEEPSEEK_API_KEY is not set. Get a key at https://platform.deepseek.com, then run:\n" +
        "  echo 'export DEEPSEEK_API_KEY=sk-your-key-here' >> ~/.zshrc && source ~/.zshrc",
    );
    this.name = "MissingApiKeyError";
  }
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResponse {
  content: string;
  usage: LlmUsage;
}

export function getModel(): string {
  return process.env.HARNESSC_MODEL || DEFAULT_MODEL;
}

let cachedClient: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }
  return cachedClient;
}

export async function callJsonModel(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });
  return {
    content: completion.choices[0]?.message?.content ?? "",
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}

export function estimateCostUsd(usage: LlmUsage): number {
  return (
    (usage.promptTokens / 1_000_000) * INPUT_COST_PER_MILLION_USD +
    (usage.completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION_USD
  );
}

// PRD §10: "API failure/rate limit -> retry once with backoff." Only network/API-level
// failures wait here; a schema-mismatch retry (the model responded, just not validly)
// retries immediately with a corrective prompt instead.
export const RETRY_BACKOFF_MS = 500;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
