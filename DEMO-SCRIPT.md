# Demo video script (90 seconds)

Note: PLAN.md's task 4.3 calls for Codex to draft this. I'm Claude Code and can't invoke
Codex on your behalf, so I wrote this myself instead of leaving you blocked — it's built
from this project's real artifacts (its own `harness-report.md`, its own #1 cluster). If
you'd rather have Codex take a pass, open it and paste prompt P3 with this file.

Recording is on you: QuickTime (Mac: File → New Screen Recording) or loom.com. 2-3 takes,
authentic beats polished. Keep terminal font large enough to read at normal video size.

---

## Shot 1 — The problem (0:00–0:12, ~12s)

Talking head or voiceover over a blank terminal.

> "If you use Claude Code every day, it keeps making the same mistakes — and you keep
> catching them by hand. Those failures are sitting right there in your session history.
> Nothing reads them for you. Until now."

## Shot 2 — Run the scan (0:12–0:35, ~23s)

Terminal, large font. Run for real, don't fake it:

```
npx harnessc scan
```

Let the spinner lines ("Locating and parsing...", "Summarizing sessions...",
"Clustering failure events...") play out on screen — that's the pipeline actually working,
not a mockup.

> "One command. It finds your Claude Code sessions, pulls out the moments where something
> broke, and sends short excerpts — not your code — to an LLM to cluster the recurring
> ones."

## Shot 3 — Scroll the report, zoom #1 (0:35–1:00, ~25s)

Scroll the printed report top to bottom, then stop and zoom on cluster #1.

> "Here's the top cluster from my own history: [read cluster #1's name and count out
> loud]. Real evidence, quoted. A concrete suggested fix — not 'the agent made some
> errors.'"

(Swap in whatever your actual #1 cluster is at recording time — re-run `harnessc scan
--all` first and use the real current top result, not a stale one.)

## Shot 4 — The fix-preview firing (1:00–1:20, ~20s)

Terminal:

```
npm run demo:fix-preview
```

> "And this is where it's going next: turning that cluster into an actual fix. This is a
> real ESLint rule, not a mockup — it just caught the exact mistake from cluster #1 in a
> sample file, with the fix right in the error message."

## Shot 5 — Waitlist call-to-action (1:20–1:30, ~10s)

Cut to the website (once 5.2 is live) or just say it on camera:

> "Full auto-fix — PRs, not just reports — is `harnessc fix`, coming soon. Link's below if
> you want in early."

---

## Before you hit record

- Re-run `harnessc scan --all` fresh so shot 3 uses your real, current #1 cluster (it
  changes as this repo's own history grows).
- Confirm `npm run demo:fix-preview` still fires (task 4.2's demo).
- Font size: large enough that cluster names and evidence excerpts are readable at normal
  video playback size — check this on a phone-sized preview, not just your monitor.
