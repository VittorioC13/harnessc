# DECISIONS

One line per decision that changes the product or the plan. Newest at the bottom.
Format: `YYYY-MM-DD | decision | why`

2026-07-21 | v1 ships scan only; fix generation is waitlist-only | one week to launch; the scan alone is demoable and installable
2026-07-21 | Stack fixed: TypeScript/commander/tsup/vitest/zod/@anthropic-ai/sdk | prevent agent thrash; boring beats clever this week
2026-07-21 | No telemetry in v1; only network destination is api.anthropic.com | privacy is the #1 launch objection; make it airtight
2026-07-23 | Swapped LLM provider from Anthropic to DeepSeek (full replace, not configurable): openai SDK against api.deepseek.com, default model deepseek-chat, env var DEEPSEEK_API_KEY | operator preference; the "only network destination" privacy promise now points at api.deepseek.com instead
