# DECISIONS

One line per decision that changes the product or the plan. Newest at the bottom.
Format: `YYYY-MM-DD | decision | why`

2026-07-21 | v1 ships scan only; fix generation is waitlist-only | one week to launch; the scan alone is demoable and installable
2026-07-21 | Stack fixed: TypeScript/commander/tsup/vitest/zod/@anthropic-ai/sdk | prevent agent thrash; boring beats clever this week
2026-07-21 | No telemetry in v1; only network destination is api.anthropic.com | privacy is the #1 launch objection; make it airtight
2026-07-23 | Swapped LLM provider from Anthropic to DeepSeek (full replace, not configurable): openai SDK against api.deepseek.com, default model deepseek-chat, env var DEEPSEEK_API_KEY | operator preference; the "only network destination" privacy promise now points at api.deepseek.com instead
2026-07-24 | Changed PRD default model from deepseek-chat to deepseek-v4-flash | DeepSeek's own docs (checked while implementing task 2.1) state deepseek-chat and deepseek-reasoner are deprecated 2026/07/24 15:59 UTC, mapping to the non-thinking/thinking modes of deepseek-v4-flash respectively; still overridable via HARNESSC_MODEL
2026-07-24 | Renamed the package/CLI from harnessc to harness-scan (npm package name, bin, program name, report header) | harnessc was already taken on npm by an unrelated project; harness-scan is PRD §13's first fallback and was available. GitHub repo stays named harnessc — not required to rename it and doing so risked broken links for no benefit
2026-07-26 | `harness-scan@0.1.0` published to npm for real | Operator's explicit go-ahead after reviewing `npm publish --dry-run` output (3 files, 11.2kB, no license field but README already discloses that). npm's publish-time 2FA (`E403`, then `EOTP` since this environment can't do the interactive prompt) was satisfied with a recovery code passed as `--otp=<code>` instead of a live authenticator code — worked, but is a one-time-use code now spent; future publishes need a fresh code or a live authenticator/OTP.
