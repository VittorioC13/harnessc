import { Command } from "commander";
import { discoverSessions } from "./lib/transcripts.js";
import { extractSignals } from "./lib/signals.js";
import { renderTable } from "./lib/format.js";
import { summarizeSession } from "./lib/summarize.js";
import { MissingApiKeyError } from "./lib/llm.js";

const VERSION = "0.1.0";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("harnessc")
    .description("Lighthouse for your coding agent — finds your agent's recurring failures.")
    .version(VERSION);

  program
    .command("scan")
    .description("Scan local Claude Code session history for recurring failures")
    .action(() => {
      console.log("scan: not implemented yet");
    });

  program
    .command("debug:sessions", { hidden: true })
    .description("List discovered Claude Code projects and sessions")
    .option("--project <substring>", "filter by project directory name substring")
    .option("--limit <n>", "limit to the N most recent sessions", (v) => parseInt(v, 10), 50)
    .option("--all", "scan every session, ignoring --limit")
    .action(async (opts: { project?: string; limit: number; all?: boolean }) => {
      const result = await discoverSessions(opts);
      console.log(
        `${result.totalProjects} project(s), ${result.totalSessionsFound} session(s), ${result.totalMessages} message(s) found.`,
      );
      if (result.sessions.length === 0) {
        console.log("No sessions to display.");
      } else {
        console.log(
          renderTable(
            ["PROJECT", "SESSION", "MESSAGES", "DATE"],
            result.sessions.map((s) => [
              s.project,
              s.sessionId,
              String(s.messageCount),
              s.date.toISOString().slice(0, 10),
            ]),
          ),
        );
      }
      if (result.totalMalformed > 0) {
        console.warn(`\nWarning: skipped ${result.totalMalformed} malformed line(s) across scanned sessions.`);
      }
    });

  program
    .command("debug:signals", { hidden: true })
    .description("Extract local failure-signal candidates from session transcripts (no API calls)")
    .option("--project <substring>", "filter by project directory name substring")
    .option("--limit <n>", "limit to the N most recent sessions", (v) => parseInt(v, 10), 50)
    .option("--all", "scan every session, ignoring --limit")
    .action(async (opts: { project?: string; limit: number; all?: boolean }) => {
      const result = await extractSignals(opts);
      console.log(
        `${result.totalCandidates} candidate(s) found across ${result.candidatesBySession.size} of ${result.sessionsScanned} session(s) scanned.`,
      );
      for (const [sessionId, candidates] of result.candidatesBySession) {
        const project = candidates[0]?.project ?? "";
        console.log(`\n${project} / ${sessionId}`);
        for (const candidate of candidates) {
          console.log(`  [${candidate.signalType}] ${candidate.timestamp.toISOString()}  ${candidate.excerpt}`);
        }
      }
    });

  program
    .command("debug:summarize", { hidden: true })
    .description("Summarize failure-signal candidates per session via the DeepSeek API")
    .option("--project <substring>", "filter by project directory name substring")
    .option("--limit <n>", "limit to the N most recent sessions", (v) => parseInt(v, 10), 50)
    .option("--all", "scan every session, ignoring --limit")
    .action(async (opts: { project?: string; limit: number; all?: boolean }) => {
      const signals = await extractSignals(opts);
      const sessions = [...signals.candidatesBySession.entries()];
      if (sessions.length === 0) {
        console.log("No sessions with failure-signal candidates in the selected range.");
        return;
      }

      let totalCostUsd = 0;
      let skippedCount = 0;

      for (const [sessionId, candidates] of sessions) {
        const project = candidates[0]?.project ?? "";
        let result;
        try {
          result = await summarizeSession(candidates);
        } catch (err) {
          if (err instanceof MissingApiKeyError) {
            console.error(err.message);
            process.exitCode = 1;
            return;
          }
          throw err;
        }

        totalCostUsd += result.costUsd;
        console.log(`\n${project} / ${sessionId}`);
        if (result.skipped) {
          skippedCount++;
          console.warn(`  skipped: ${result.warning}`);
          continue;
        }
        for (const event of result.events) {
          console.log(`  [${event.severity}] ${event.description}`);
        }
      }

      console.log(`\nEstimated cost: $${totalCostUsd.toFixed(4)}`);
      if (skippedCount > 0) {
        console.warn(`Warning: skipped ${skippedCount} session(s) after a failed retry.`);
      }
    });

  return program;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  buildProgram().parse(process.argv);
}
/* c8 ignore stop */
