# AGENTS.md

This file orients AI agents working in this repository. Keep it short; deep truth lives
in the files it points to.

## Read first, in order
1. `PRD.md` — what we're building. Wins all arguments.
2. `PLAN.md` — the current task list and each task's VERIFY command.
3. `DECISIONS.md` — decisions already made. Do not relitigate them.
4. `FAILURES.md` — mistakes previously made in this repo. Do not repeat them.

## The operator is non-technical
- Always explain in plain English. Never assume they can read code or diffs.
- Never tell them to edit a file by hand — you make all code changes.
- Every completed task must end with: the exact command the operator runs to verify,
  and the output they should expect.
- Claims require proof: run the verification yourself and show full output before
  saying anything is "done."

## Hard rules
- One PLAN.md task at a time. No unrequested features. PRD §5 lists what NOT to build.
- Stack is fixed per PRD §6 (TypeScript strict, commander, tsup, vitest, zod,
  openai SDK pointed at DeepSeek). New runtime dependencies require operator approval.
- The ONLY permitted network destination in this codebase is api.deepseek.com.
  No telemetry, no update checks, no analytics. This is a launch-critical promise.
- Never crash on bad input: skip, count, warn once at the end (PRD §10).
- Files stay under 400 lines; split modules rather than growing them.
- Every change ships with tests; typecheck + lint + tests must pass before commit.
- Update PLAN.md checkboxes and append to FAILURES.md / DECISIONS.md at session end.

## Working style
- Small, reviewable increments. Commit early and often with clear messages.
- Another AI model reviews your work after each task; respond to its feedback
  seriously — address or explicitly contest each item, never silently skip one.
