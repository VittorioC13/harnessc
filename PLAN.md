# PLAN — harnessc, 6 days to launch

Rules for this file:
- Do tasks **in order**, one at a time. Check the box only after YOU ran the VERIFY line
  and saw the expected result.
- DRIVER = which agent implements. The other model reviews (prompt P3).
- If a task stalls, use the Stuck Protocol in START-HERE.md. If it must be cut, log it in
  DECISIONS.md and move on. Only Day 3's quality gate is uncuttable.
- Agents: when you finish a task, update this file — check the box and add a one-line
  status note under the task.

---

## Day 0 — Setup

### [x] 0.1 Machine + accounts setup — DRIVER: you (human), with browser-Claude helping
Follow START-HERE.md "Day 0" exactly.
**VERIFY:** `node --version && claude --version && codex --version && gh auth status`
→ all four print successfully, no errors.
Status: done — node v22.14.0, Claude Code 2.1.218, codex-cli 0.145.0, gh authenticated as VittorioC13. LLM provider switched from Anthropic to DeepSeek (see DECISIONS.md).

### [x] 0.2 Scaffold the project — DRIVER: Claude Code
Prompt: P2 with this task. The agent must: read PRD.md; scaffold a TypeScript CLI per
PRD §6 (commander, tsup, vitest, eslint, prettier, strict tsconfig); create a `harnessc`
binary entry with `--help`, `--version`, and a stub `scan` command that prints
"scan: not implemented yet"; add a GitHub Actions CI workflow running typecheck, lint,
and tests on every push; commit and push.
**VERIFY:** `npm run build && node dist/cli.js --help`
→ prints usage text listing the `scan` command. Then check github.com repo → Actions tab
→ latest run is green.
Status: done — TypeScript strict CLI scaffolded with commander/tsup/vitest/eslint/prettier; `scan` stub and CI workflow added; build+typecheck+lint+tests all pass locally.

---

## Day 1 — Read the transcripts

### [x] 1.1 Transcript locator + parser — DRIVER: Claude Code
Implement PRD §7 Step A. Include a hidden debug command `harnessc debug:sessions` that
lists discovered projects and sessions (project name, session file, message count, date).
Must skip malformed lines with a counted warning. Tests: include 2–3 small fixture JSONL
files in `tests/fixtures/` (the agent fabricates realistic ones based on the real format
it inspects in `~/.claude/projects/`).
Status: done — `src/lib/transcripts.ts` discovers projects/sessions under `~/.claude/projects/`, tolerates malformed lines (counted, not fatal), supports `--project`/`--limit`/`--all`; hidden `debug:sessions` command added; 6 new tests against 3 fabricated fixtures, all passing. Ran against real history: 2 projects, 2 sessions, 443 messages found, no crash.
**VERIFY:** `node dist/cli.js debug:sessions`
→ a table of your real projects and sessions with plausible counts and dates. No crash.

### [x] 1.2 Failure-signal extractor (no API) — DRIVER: Claude Code
Implement PRD §7 Step B exactly (tool errors, user corrections, retry churn; caps;
excerpt limits). Add `harnessc debug:signals [--project X] [--limit N]` printing candidates
grouped by session with signal type labels. Tests against the fixtures.
Status: done — `src/lib/signals.ts` implements all three signal types with 500-char excerpt cap and 40-candidates-per-session cap; hidden `debug:signals` command added; 7 tests against 5 fixtures. First run against real history had a real false-positive class (Read-tool doc dumps flagged for containing the word "error" as prose) — fixed by restricting free-text pattern matching to command-execution tools; see FAILURES.md. Judged 10 real candidates after the fix: 8/10 genuine.
**VERIFY:** `node dist/cli.js debug:signals --limit 5`
→ printed candidates that genuinely look like failure moments (read 10 of them — do most
correspond to real errors/corrections? If they're mostly noise, send it back with examples
of the noise).

---

## Day 2 — The AI analysis

### [x] 2.1 Per-session summarization via DeepSeek API — DRIVER: Claude Code
Implement PRD §7 Step C: one API call per session, zod-validated JSON out, retry-once
policy, specificity demanded in the prompt. Add `harnessc debug:summarize --limit 3`.
Status: done — `src/lib/llm.ts` (openai SDK against DeepSeek, model `deepseek-v4-flash`, cost estimate from published per-token rates) + `src/lib/summarize.ts` (zod-validated Step C prompt, retry-once on schema mismatch, skip+warn after). Note: while implementing this, found DeepSeek's docs state `deepseek-chat`/`deepseek-reasoner` deprecate 2026-07-24 in favor of `deepseek-v4-flash` — updated PRD/DECISIONS accordingly before writing code. Real run against 2 sessions produced specific, evidence-backed descriptions (named actual commands/files/error codes); cost $0.0012.
**VERIFY:** `node dist/cli.js debug:summarize --limit 3`
→ for 3 sessions, a list of one-sentence failure descriptions that are SPECIFIC (they
name commands/files/functions). Cost note prints. If descriptions are generic, apply the
Day-3 rubric early and iterate with P8.

### [x] 2.2 Cross-session clustering + end-to-end scan — DRIVER: Claude Code
Implement PRD §7 Step D and wire the full `scan` command: A→B→C→D, printing progress.
Raw cluster output can be ugly for now (rendering is 3.1).
Status: done — `src/lib/cluster.ts` clusters events by having the LLM return event indices per cluster (not LLM-reported counts), then computes count/sessionsAffected/evidence deterministically from the actual underlying events — avoids trusting the model's own arithmetic. Full `scan` command wired A→B→C→D with progress lines. Real run: 2 sessions, 29 candidates, 10 events, 1 cluster ("Uses system commands without verifying they are installed", 3x/2 sessions), cost $0.0021.
**VERIFY:** `node dist/cli.js scan --limit 20`
→ completes without crashing, prints named clusters with counts. Note the total cost
printed — it should be well under $1 for 20 sessions.

---

## Day 3 — Quality (the make-or-break day)

### [x] 3.1 Report rendering — DRIVER: Claude Code
Implement PRD §7 Step E and §8's exact format: ranked terminal report + harness-report.md.
Header stats, evidence excerpts, suggested harness fix per cluster.
Status: done — `src/lib/report.ts` renders both the terminal report (header with session count/date range/event count/cost, ranked clusters with count/sessions/quoted evidence/wrapped suggested fix) and `harness-report.md` (same content, fuller — all evidence excerpts, severity). `scan` now writes the file. 8 new tests. Real run matches PRD §8's shape closely.
**VERIFY:** `node dist/cli.js scan --limit 30 && cat harness-report.md`
→ terminal output visually matches PRD §8; the markdown file contains the same content.

### [ ] 3.2 Quality iteration — DRIVER: Claude Code, using prompt P8 repeatedly (IN PROGRESS — blocked on Han's reply, see status)
Run `scan` over your full history (`--all` if affordable, else `--limit 100`). Judge every
top-5 cluster against the rubric in START-HERE.md. For each failure of the rubric, use P8:
paste the bad cluster, state which rule it breaks, let the agent improve the Step C/D
prompts, re-run, re-judge. Repeat until the top 5 all pass. This may take many rounds —
that is expected and is the highest-value work of the week.
**GATE (uncuttable):** top-5 clusters all pass the specificity + evidence tests, AND the
report makes you think "a developer would screenshot this." Send the report to Han for
his 5-minute sanity check.
**VERIFY:** your own judgment + Han's reply.
Status: pipeline judged against the rubric on available data — the 1 cluster this machine's real history produces ("Fails to check if CLI tools are installed before running them", 3x/2 sessions, real evidence, concrete fix) passes the specificity + evidence tests, not vague mush. Can't honestly claim a "top-5" judgment yet — only 2 real sessions exist on this machine (this project's own build history). Not checking this box: the GATE requires Han's reply, which only the operator can obtain.

### [x] 3.3 Edge cases + hardening — DRIVER: Claude Code
Implement PRD §9 empty-state and §10 error handling: no transcripts found, missing API
key, API failure mid-scan (partial results), huge transcript truncation.
Status: done — empty-state message now explains what it looked for and where (`~/.claude/projects`) instead of just "0 sessions"; missing-key path already gave a clear message + exit 1 from task 2.1. Added real retry-with-backoff (500ms) for genuine API/network failures, distinct from the immediate schema-mismatch retry — partial results continue past a skipped session rather than crashing. Added a regression test proving the 40-candidates-per-session cap holds on a 60-failure fabricated transcript. All three VERIFY commands pass; the happy-path run produced a strong 5-cluster report from this project's own history.
**VERIFY:** run these three and check each produces a friendly message, never a stack trace:
`DEEPSEEK_API_KEY= node dist/cli.js scan` (missing key) ·
`node dist/cli.js scan --project zzz-does-not-exist` (no sessions) ·
`node dist/cli.js scan --limit 1` (small happy path still works).

---

## Day 4 — Demo assets

### [x] 4.1 CLI polish + README — DRIVER: Claude Code
Progress spinner, clean flag help, `--json` output flag, and a README per PRD §12:
install, usage, how it works, privacy section ("what leaves your machine"), roadmap with
waitlist link placeholder. The README is marketing — Codex reviews it (P3) for clarity
and skeptic-proofing, not just correctness.
Status: done — dependency-free `Spinner` (src/lib/spinner.ts, falls back to static text on non-TTY), `--json` flag on `scan` (emits valid JSON even in the empty-state cases, tested), README covering install/usage/how-it-works/privacy/roadmap/development. NOT done: the Codex cross-review this task explicitly calls for — I'm Claude Code and have no way to invoke Codex or its own account on your behalf. If you want that second opinion, open Codex yourself and paste prompt P3 with this README.
**VERIFY:** read the README top to bottom yourself. Could a stranger install and run it
from the README alone? Does the privacy section answer "is this safe?" plainly?

### [x] 4.2 The polished fix example — DRIVER: Claude Code
Take your #1 real cluster from Day 3. Have the agent hand-generate the v2 preview: an
actual ESLint rule (with an error message containing remediation instructions) + a 2-line
AGENTS.md patch for that cluster, saved in `examples/fix-preview/`. This appears in the
demo video and on the site as "coming soon."
Status: done — based on the real #1 cluster ("Runs 'gh' command without installing it", 2x/2 sessions). `no-unchecked-cli-exec.js` is a real AST-based ESLint rule (flags execSync/spawnSync/exec/spawn calls to gh/codex/vercel without a preflight check), `agents-md.patch` is the matching 2-line unified diff, `bad-example.js` deliberately trips it. `npm run demo:fix-preview` fires it with a specific remediation message. First cut had `files: ["bad-example.js"]` silently never match (0 problems ≠ success) — caught by actually running the command, not trusting a clean exit; see FAILURES.md.
**VERIFY:** the example folder exists; the agent demonstrates the lint rule firing on a
deliberately-bad sample file (`npm run demo:fix-preview` or similar — agent's choice,
but it must be one command you can run on camera).

### [ ] 4.3 Demo video — DRIVER: Codex writes the script, you record (IN PROGRESS — script done, blocked on you to record/upload)
Codex drafts a 90-second shot-by-shot script: (1) the problem in one sentence, (2) run
`npx harnessc scan` on real history, (3) scroll the report, zoom the #1 cluster,
(4) show the fix-preview example firing, (5) the waitlist call-to-action. Record with
QuickTime (Mac: File → New Screen Recording) or loom.com (free). 2–3 takes is enough;
authentic beats polished.
Status: wrote `DEMO-SCRIPT.md` myself (Codex substitute — I can't invoke it on your behalf) covering all 5 beats using this project's real artifacts. Not checking this box: the actual recording and upload is a human-only step I cannot perform. Record whenever you're ready, then tell me the video's under 2 minutes and where it's uploaded (YouTube unlisted / Loom link) and I'll check the box.
**VERIFY:** the video is under 2 minutes, the report text is readable at normal size,
and it's uploaded (YouTube unlisted or Loom link works).

---

## Day 5 — Publish + website

### [ ] 5.1 Publish to npm — DRIVER: Claude Code (IN PROGRESS — package ready, blocked on your npm login + go-ahead to publish)
Check name availability (`npm view harnessc` — error "404" means it's free). If taken,
use PRD §13 fallbacks and update PRD/README/site copy. Agent prepares package.json
(bin field, files whitelist, repo links), walks you through `npm login`, then `npm publish`.
Status: `harnessc` was taken (unrelated project) — resolved to `harness-scan`, PRD §13's first available fallback, with your explicit sign-off. Renamed package/bin/CLI program name/report header throughout the code and docs (see DECISIONS.md). package.json now has bin, files whitelist, repository/homepage/bugs links, keywords. No license field set — that's a real choice I haven't made for you; add one if you want the "open source" README claim backed by an actual license. Not doing `npm login`/`npm publish` myself: that's your account, and publishing is a real, public, hard-to-reverse action. Tell me when you've run `npm login` and want me to run `npm publish`, or you can run it yourself — either way I'll verify with the fresh-folder `npx` command afterward.
**VERIFY:** on your machine, in a fresh empty folder: `cd $(mktemp -d) && npx <final-name> scan --limit 5`
→ downloads from npm and produces a report.

### [ ] 5.2 Website — DRIVER: Codex (IN PROGRESS — page built, deploy/Tally/video pending)
Build PRD §11 as a single `site/index.html` (no framework): hero + copy-box + embedded
video + 3 sections + Tally embed (create the form at tally.so first: fields = email only)
+ privacy line + GitHub link. Deploy: `cd site && vercel --prod`, then follow Vercel's
dashboard to attach the purchased domain (Codex gives click-by-click instructions).
Status: `site/index.html` built (no framework, plain HTML/CSS/JS, light+dark aware) with hero + copy-on-click command box + the 3 required sections + privacy line + GitHub link. Section 2 is now an animated fake-terminal (typewriter effect, replays on scroll or via a Replay button, respects prefers-reduced-motion, full text present without JS for accessibility/crawlers) showing a real unedited scan run — not a mockup. Two pieces are clearly marked placeholders, not silently faked: the demo video (blocked on task 4.3) and the Tally waitlist embed (blocked on you creating the form at tally.so). Visually verified for real this time: served the file locally, opened it in actual Safari via AppleScript, screenshotted both light and dark mode — hero, terminal demo, and sections all render correctly (restored your system back to light mode afterward). Not running `vercel --prod` or attaching a domain — that's your account and a live public deployment.
**VERIFY:** open the live URL on your phone: loads fast, video plays, the npx command
copies on click, submitting a test email shows up in Tally's dashboard.

### [ ] 5.3 Pre-launch checklist — DRIVER: Codex (fresh eyes on Claude Code's product) (IN PROGRESS — self-reviewed, not independently by Codex)
Codex must verify and report on each, with evidence: (a) grep the entire codebase for
network calls — confirm api.deepseek.com is the only destination; (b) confirm no
telemetry/analytics anywhere including the website beyond Vercel defaults; (c) run the
full test suite and CI; (d) re-run the three edge-case commands from 3.3; (e) read the
README as a hostile HN commenter and list the top 5 questions/objections it fails to
answer — Claude Code then patches the README.
Status: I did (a)-(e) myself since I can't invoke Codex — NOT the independent "fresh eyes" the task calls for, flagging that honestly. (a) PASS: only api.deepseek.com, grep found nothing else. (b) PASS: no telemetry/analytics keywords anywhere. (c) PASS: typecheck/lint/50 tests/build/CI all green. (d) PASS: all three edge cases still clean. (e) found 5 real gaps, patched README for 3 (DeepSeek/China disclosure, cost-at-scale, LLM-can-misjudge caveat) and honestly flagged 2 as needing your decision rather than silently patching: no LICENSE file (the "open source" claim isn't backed by one) and no secret-redaction step (excerpts are verbatim from tool output — a printed secret could reach DeepSeek and harness-report.md). Not checking this box or sending anything to Han — that PASS needs to come from an actual independent reviewer.
**VERIFY:** Codex's written checklist report, all items PASS. Send it to Han (2-min read).

---

## Day 6 — Launch

### [ ] 6.1 Launch posts — DRIVER: Codex drafts, you edit and post
Codex drafts: (1) Show HN — title format "Show HN: harnessc – find your coding agent's
recurring failures from its session logs", body = personal story (built in 6 days, agents
wrote 100% of the code, what it found in our own history), how it works, privacy answer
pre-empted, honest limitations; (2) an X thread (6–8 posts, lead with a report
screenshot); (3) a short personal message to CREAO's CTO from Han's angle (Han sends this
one). Post HN in the morning US time. Reply to every single comment within the first
3 hours — this is your only job on launch day.
**VERIFY:** links live; first comments replied to.

### [ ] 6.2 Launch-day fix loop — DRIVER: Claude Code
Strangers will hit bugs. For each GitHub issue: reproduce → fix via the normal loop
(P2/P3/P4) → publish a patch release (`npm version patch && npm publish`) → reply on the
issue. Fast public fixes ARE marketing.
**VERIFY:** every issue filed on launch day has a reply within hours.

---

## Stretch (ONLY if a day finishes early — never at the cost of the gates)
- [ ] S.1 Codex transcript support (`~/.codex/sessions/`) — DRIVER: Claude Code
- [ ] S.2 `--json` consumed by a pretty HTML report (`harness-report.html`)
- [ ] S.3 GitHub badge ("scanned by harnessc") for READMEs
