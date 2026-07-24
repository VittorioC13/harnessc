# PRD — harness-scan v1

**Read this whole file before writing any code. This document wins every argument.
If a request conflicts with this PRD, ask the operator before proceeding.**

---

## 1. One-liner

**harness-scan** scans your local Claude Code session history, finds the mistakes your coding
agent keeps repeating, and prints a ranked, evidence-backed report — so you can fix your
harness (rules, docs, CI) instead of correcting the agent by hand forever.

Positioning: *"Lighthouse for your coding agent."* / *"Sentry for agent failures."*

## 2. Background and why now

"Harness engineering" (named by Mitchell Hashimoto, expanded by OpenAI's Feb 2026
engineering post) says: when an agent makes a mistake, don't re-prompt harder — change the
environment so that class of mistake becomes impossible (a lint rule, a docs pointer, a CI
check). Every serious team running coding agents corrects the same agent mistakes over and
over, but nobody can SEE their failures systematically: they're buried in session
transcripts on disk. Existing tools (Factory.ai Agent Readiness, various scorecards) grade
repos STATICALLY — checklists of files that should exist. Nothing learns from ACTUAL
observed failures. That dynamic-vs-static distinction is our entire differentiation and
must survive every design decision.

## 3. Target user

A developer who uses Claude Code regularly (daily or near-daily) on real projects.
Technical, skeptical, privacy-conscious, active on Hacker News and X. They will judge the
tool in the first 2 minutes: install friction, report quality, and privacy posture.

## 4. What v1 ships (scope)

ONE command that works beautifully:

```bash
npx harness-scan scan
```

- Finds Claude Code session transcripts on the local machine
- Extracts failure signals from them
- Clusters recurring failures using the DeepSeek API
- Prints a ranked report to the terminal AND writes `harness-report.md` in the current directory

Plus a one-page website with a demo video and a waitlist for the "autofix" tier (v2).

## 5. What v1 does NOT ship (out of scope — do not build these)

- Automatic fix generation / opening PRs (v2 — waitlist only)
- Codex/Cursor transcript support (stretch goal ONLY if Day 4 finishes early)
- GitHub App, dashboard, accounts, database, server of any kind
- Telemetry or analytics of any kind inside the CLI
- Windows support (document as "macOS/Linux; Windows untested")

If an agent proposes building any of the above "while we're at it," the operator should
refuse and point at this section.

## 6. Tech stack (fixed — do not substitute)

- **Language:** TypeScript, strict mode, Node.js >= 20
- **CLI framework:** commander
- **Build:** tsup (single-file build), executable via `npx harness-scan`
- **Tests:** vitest
- **Lint/format:** eslint + prettier
- **API:** `openai` SDK configured with `baseURL: https://api.deepseek.com` (DeepSeek's
  API is OpenAI-compatible); default model `deepseek-v4-flash`, overridable via env var
  `HARNESSC_MODEL`
- **Schema validation:** zod — every LLM response is parsed against a zod schema; invalid
  responses are retried once, then that item is skipped with a warning (never crash)
- **No other runtime dependencies without operator approval.** Prefer boring, stable libs.

## 7. How the scan works (pipeline spec)

### Step A — Locate transcripts
Claude Code stores sessions as JSONL files under `~/.claude/projects/<encoded-project-path>/`.
Each file is one session; each line is a JSON object (user messages, assistant messages,
tool calls, tool results). Discover all projects; support:
- `--project <substring>` filter matching the project directory name
- `--limit <n>` most-recent sessions (default 50)
- `--all` to scan everything
The parser must tolerate unknown line types and malformed lines (skip, count, warn at the
end — never crash). Print how many sessions/messages were found before analysis begins.

### Step B — Extract failure candidates (local heuristics, NO API calls)
From each parsed session, extract candidate failure moments:
1. **Tool errors:** tool results indicating failure — non-zero exit codes, stderr content,
   stack traces, strings like "error", "failed", "cannot find", "not found", type errors.
2. **User corrections:** user messages that correct or redo prior agent work — signals like
   "no," "that's wrong," "you broke," "again," "undo," "revert," "still failing,"
   "I said," "don't," short frustrated messages following a tool error.
3. **Retry churn:** the same or near-same command/tool call attempted 3+ times in a row.
Each candidate = { session id, project, timestamp, short excerpt (max ~500 chars, the
minimum context needed), signal type }. Cap candidates per session (e.g., 40) to bound cost.

### Step C — Per-session summarization (DeepSeek API, 1 call per session)
For each session with candidates, one API call: input = the candidates; output = JSON
(zod-validated) list of distinct failure events: { description (specific, one sentence),
category guess, evidence excerpt, severity guess }. The prompt must demand SPECIFICITY —
name the actual function/file/command involved — and forbid generic phrasing.

### Step D — Cross-session clustering (DeepSeek API, 1 call)
One call taking all failure events: group into named clusters. Output JSON (zod-validated):
per cluster — { name (specific, imperative-style, e.g. "Uses deprecated fetchUser() instead
of getUser()"), count, sessions affected, 2–3 best evidence excerpts, suggested harness fix
(2–4 sentences: the concrete lint rule / AGENTS.md line / CI check a team should add) }.
Rank by count, then severity. Merge near-duplicates.

### Step E — Render
Terminal report (clean, readable, minimal color) + `harness-report.md` with the same
content in markdown. Header shows: sessions scanned, date range, total failure events,
and an approximate API cost for the scan.

## 8. Report format (exact target)

```
harness-scan report — 47 sessions scanned (May 12 – Jul 20), 132 failure events

 #1  Uses deprecated fetchUser() instead of getUser()          12× · 8 sessions
     "no — fetchUser was removed, use getUser like everywhere else"
     Suggested harness fix: add an ESLint no-restricted-syntax rule banning
     fetchUser with a message pointing to getUser; add one line to AGENTS.md
     under "API conventions."

 #2  Forgets to run db:migrate after editing schema files       7× · 5 sessions
     ...

 #3  Writes single files >600 lines that reviewers ask to split  5× · 4 sessions
     ...

Full details: harness-report.md
```

## 9. Quality bar (acceptance criteria for the whole product)

- **Specificity test:** every top-5 cluster names a concrete behavior (a function, a file
  pattern, a command, a convention). "Agent made coding errors" = automatic fail.
- **Evidence test:** every cluster shows at least one real quoted excerpt.
- **Cold-start test:** a stranger with Claude Code history runs `npx harness-scan scan` with
  only DEEPSEEK_API_KEY set and gets a useful report in under 2 minutes with zero config.
- **Empty-state test:** with no transcripts found, the tool prints a friendly explanation
  of what it looked for and where — never a stack trace.
- **Privacy test:** the ONLY network destination in the entire codebase is
  api.deepseek.com. No telemetry, no update checks, nothing else. README states this
  prominently with a "How it works / What leaves your machine" section.

## 10. Error handling requirements

- Missing API key → one clear paragraph explaining how to get one and set it. Exit code 1.
- API failure/rate limit → retry once with backoff, then report which sessions were
  skipped and finish with partial results.
- All warnings collected and printed once at the end, not spammed inline.

## 11. Website (single page, static)

- Hero: name, one-liner, the `npx harness-scan scan` command in a copy-on-click box
- Embedded 90-second demo video
- 3 short sections: "Your agent repeats its mistakes" → "See them ranked with evidence" →
  "Coming soon: harness-scan fix — turns clusters into lint rules and docs, as PRs" (this last
  section contains the Tally waitlist embed)
- Privacy line: "Runs locally. Your code and transcripts never leave your machine except
  the analysis calls to the DeepSeek API. No telemetry. Open source." + GitHub link
- Plain, fast, no framework needed — a single index.html is acceptable. Deployed on Vercel.

## 12. Success criteria for launch day

- `npx harness-scan scan` works on a machine that has never seen the project
- README: install, usage, how-it-works, privacy, roadmap (autofix waitlist link)
- Website live on the purchased domain; waitlist form submits
- Demo video embedded and public
- Show HN post + X thread published

## 13. Naming

~~Working name **harnessc**.~~ Taken on npm by an unrelated project (checked 2026-07-24).
Resolved to the first available fallback: **harness-scan**. PRD, README, and code all
updated. The GitHub repo itself stays `harnessc` (renaming it wasn't required and risked
broken links for no benefit). The name is not precious.
