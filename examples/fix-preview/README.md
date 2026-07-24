# Fix preview: cluster #1

A hand-built preview of what the "coming soon" `harnessc fix` (v2, waitlist-only) would
generate for **cluster #1** in this project's own `harness-report.md`:

> **Runs 'gh' command without installing it** — 2× · 2 sessions · severity: medium
> Evidence: "(eval):1: command not found: gh", "gh not found"

Two real artifacts, not a mockup:

- **`no-unchecked-cli-exec.js`** — an actual ESLint rule (AST-based, not a demo stub) that
  flags `execSync`/`spawnSync`/`exec`/`spawn` calls invoking `gh`, `codex`, or `vercel`
  without a preceding installation check. Its error message names the tool and the exact
  fix.
- **`agents-md.patch`** — the 2-line unified diff `harnessc fix` would open as part of the
  same PR, adding a rule to `AGENTS.md`'s "Hard rules" section.

## Run it

From the repo root:

```
npm run demo:fix-preview
```

Expect ESLint to report one error on `bad-example.js`, naming `gh` and explaining the fix
— then exit non-zero (that failure is the point of the demo).
