# FAILURES

Every mistake an agent makes that a human (or the reviewing model) had to correct.
One line each, newest at the bottom. This log is also seed data for the product itself.
Format: `YYYY-MM-DD | driver (claude-code/codex) | what went wrong | the correction`

2026-07-23 | claude-code | tsconfig.json had `rootDir: src`, so `tsc --noEmit` failed on tests/cli.test.ts (outside rootDir) | removed the rootDir restriction since noEmit made it unnecessary
2026-07-23 | claude-code | eslint.config.js had no Node globals and applied type-aware parsing (parserOptions.project) to tsup.config.ts/vitest.config.ts, which aren't in tsconfig's include | added a node globals block for all files and a separate override for *.config.ts without the project option
