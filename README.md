# harness-scan

**Lighthouse for your coding agent.**

`harness-scan` scans your local Claude Code session history, finds the mistakes your
coding agent keeps repeating, and prints a ranked, evidence-backed report — so you can fix
your harness (rules, docs, CI) instead of correcting the agent by hand forever.

```
npx harness-scan scan
```

## Install

Requires Node.js 20 or newer. No install step needed — `npx` downloads and runs it:

```
npx harness-scan scan
```

(Pre-launch note: this package isn't on npm yet. Until it is, run it from source — see
[Development](#development) below.)

## Usage

```
harness-scan scan [options]
```

| Option | What it does |
|---|---|
| `--project <substring>` | Only scan projects whose directory name contains this substring |
| `--limit <n>` | Scan the N most recent sessions (default: 50) |
| `--all` | Scan every session found, ignoring `--limit` |
| `--json` | Print machine-readable JSON instead of the human report |

Every run also writes a `harness-report.md` file in the current directory with the same
content as the terminal report.

You need a DeepSeek API key set as `DEEPSEEK_API_KEY` (get one at
[platform.deepseek.com](https://platform.deepseek.com)):

```
echo 'export DEEPSEEK_API_KEY=sk-your-key-here' >> ~/.zshrc && source ~/.zshrc
```

## How it works

1. **Locate** — finds Claude Code session transcripts (JSONL files) under
   `~/.claude/projects/`.
2. **Extract** — using cheap local heuristics only (no API calls), flags candidate failure
   moments: tool errors, user corrections ("no, that's wrong"), and the same command
   retried 3+ times in a row.
3. **Summarize** — one DeepSeek API call per session turns candidates into specific,
   one-sentence failure descriptions.
4. **Cluster** — one more API call groups failure events across all your sessions into
   named, ranked clusters, each with a suggested concrete fix (a lint rule, an AGENTS.md
   line, a CI check).
5. **Report** — prints a ranked report to your terminal and writes `harness-report.md`.

A scan typically costs well under $1 in API usage; the exact cost is printed at the end of
every run.

## Privacy — what leaves your machine

- The **only** network destination in this codebase is `api.deepseek.com`. No telemetry,
  no update checks, no analytics, nothing else.
- What's sent to DeepSeek is short excerpts (a few hundred characters each) of the failure
  moments it finds — not your full source code, not full transcripts, not your repo.
- Everything else — locating files, parsing transcripts, rendering the report — happens
  entirely on your machine.
- The source is public on GitHub; you can read exactly what it sends in
  `src/lib/signals.ts`, `src/lib/summarize.ts`, and `src/lib/cluster.ts`. (See
  [License](#license) below — public source isn't the same thing as a license to reuse it.)
- **Why DeepSeek?** Cost and simplicity — it's inexpensive and OpenAI-API-compatible.
  Trade-off to know before setting `DEEPSEEK_API_KEY`: DeepSeek is a Chinese company, and
  the excerpts described above are processed under Chinese data-handling law. v1 has no
  other provider option.
- **No secret redaction yet.** Excerpts are taken verbatim from your tool outputs and
  typed messages. If your session history ever had a secret printed to the terminal (an
  API key in an error message, an `.env` dump), it could end up in an excerpt sent to
  DeepSeek and written into `harness-report.md`. Review `harness-report.md` before sharing
  it, same as you would any terminal history.
- Cost scales with sessions that have failure signals (one API call each) plus one final
  clustering call — a few thousandths of a dollar per session in our own testing.
  Scanning hundreds of sessions at once (`--all`) could add up to a few dollars; use
  `--limit` to control this.
- Cluster shape (name, count, evidence, suggested fix) is schema-validated before being
  shown, so malformed output is retried once then skipped rather than silently corrupting
  the report — but the LLM can still misjudge. Treat suggested fixes as a starting point,
  not gospel.

## License

Not yet decided — this repo doesn't have a LICENSE file yet. Until one is added, "the
source is public" isn't the same as "open source": don't assume you can redistribute or
reuse it.

## Roadmap

**Coming soon: `harness-scan fix`** — turns each cluster into an actual pull request: a
real ESLint rule, an AGENTS.md patch, a CI check. Join the waitlist (link coming soon).

## Development

To run from source instead of `npx`:

```
git clone https://github.com/VittorioC13/harnessc.git
cd harnessc
npm install
npm run build
node dist/cli.js scan
```

Run tests with `npm test`, typecheck with `npm run typecheck`, lint with `npm run lint`.
