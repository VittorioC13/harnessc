import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { discoverSessions, DEFAULT_CLAUDE_PROJECTS_DIR } from "./lib/transcripts.js";
import { extractSignals } from "./lib/signals.js";
import { renderTable } from "./lib/format.js";
import { summarizeSession } from "./lib/summarize.js";
import { clusterFailureEvents, type EventWithSession } from "./lib/cluster.js";
import { renderTerminalReport, renderMarkdownReport } from "./lib/report.js";
import { MissingApiKeyError } from "./lib/llm.js";
import { Spinner } from "./lib/spinner.js";

const VERSION = "0.1.0";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("harness-scan")
    .description("Lighthouse for your coding agent — finds your agent's recurring failures.")
    .version(VERSION);

  program
    .command("scan")
    .description("Scan local Claude Code session history for recurring failures")
    .option("--project <substring>", "filter by project directory name substring")
    .option("--limit <n>", "limit to the N most recent sessions", (v) => parseInt(v, 10), 50)
    .option("--all", "scan every session, ignoring --limit")
    .option("--json", "print machine-readable JSON instead of the human report")
    .action(async (opts: { project?: string; limit: number; all?: boolean; json?: boolean }) => {
      const quiet = opts.json === true;
      const log = quiet ? () => {} : console.log;

      const locateSpinner = new Spinner("Locating and parsing Claude Code sessions...");
      if (!quiet) locateSpinner.start();
      const signals = await extractSignals(opts);
      if (!quiet) locateSpinner.stop();

      if (signals.sessionsScanned === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ sessionsScanned: 0, totalFailureEvents: 0, costUsd: 0, clusters: [] }, null, 2));
        } else {
          const filterNote = opts.project ? ` matching --project "${opts.project}"` : "";
          console.log(
            `No Claude Code sessions found${filterNote}.\n` +
              `harness-scan looks for session transcripts (*.jsonl files) under:\n` +
              `  ${DEFAULT_CLAUDE_PROJECTS_DIR}\n` +
              `Claude Code creates one there automatically each time you use it in a project.` +
              (opts.project ? " Try without --project, or double-check the substring." : " Use it in a project, then run harness-scan scan again."),
          );
        }
        return;
      }

      log(
        `${signals.sessionsScanned} session(s) scanned, ${signals.totalCandidates} failure-signal candidate(s) found across ${signals.candidatesBySession.size} session(s).`,
      );
      if (signals.candidatesBySession.size === 0) {
        if (opts.json) {
          console.log(
            JSON.stringify(
              { sessionsScanned: signals.sessionsScanned, totalFailureEvents: 0, costUsd: 0, clusters: [] },
              null,
              2,
            ),
          );
        } else {
          console.log("No failure-signal candidates in the scanned sessions — nothing to report. Nice work!");
        }
        return;
      }

      const summarizeSpinner = new Spinner("Summarizing sessions...");
      if (!quiet) summarizeSpinner.start();
      let totalCostUsd = 0;
      let skippedSessions = 0;
      const allEvents: EventWithSession[] = [];

      for (const [sessionId, candidates] of signals.candidatesBySession) {
        const project = candidates[0]?.project ?? "";
        let result;
        try {
          result = await summarizeSession(candidates);
        } catch (err) {
          if (!quiet) summarizeSpinner.stop();
          if (err instanceof MissingApiKeyError) {
            console.error(err.message);
            process.exitCode = 1;
            return;
          }
          throw err;
        }
        totalCostUsd += result.costUsd;
        if (result.skipped) {
          skippedSessions++;
          continue;
        }
        for (const event of result.events) {
          allEvents.push({ ...event, sessionId, project });
        }
      }
      if (!quiet) summarizeSpinner.stop();
      log(`${allEvents.length} failure event(s) extracted.`);

      const clusterSpinner = new Spinner("Clustering failure events...");
      if (!quiet) clusterSpinner.start();
      let clusterResult;
      try {
        clusterResult = await clusterFailureEvents(allEvents);
      } catch (err) {
        if (!quiet) clusterSpinner.stop();
        if (err instanceof MissingApiKeyError) {
          console.error(err.message);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
      if (!quiet) clusterSpinner.stop();
      totalCostUsd += clusterResult.costUsd;

      if (clusterResult.skipped) {
        console.warn(`\nClustering skipped: ${clusterResult.warning}`);
      }

      const reportData = {
        sessionsScanned: signals.sessionsScanned,
        sessionDates: signals.sessions.map((s) => s.date),
        totalFailureEvents: allEvents.length,
        clusters: clusterResult.clusters,
        costUsd: totalCostUsd,
      };
      await writeFile("harness-report.md", renderMarkdownReport(reportData), "utf-8");

      if (opts.json) {
        const sortedDates = [...reportData.sessionDates].sort((a, b) => a.getTime() - b.getTime());
        console.log(
          JSON.stringify(
            {
              sessionsScanned: reportData.sessionsScanned,
              dateRange: {
                from: sortedDates[0]?.toISOString() ?? null,
                to: sortedDates[sortedDates.length - 1]?.toISOString() ?? null,
              },
              totalFailureEvents: reportData.totalFailureEvents,
              costUsd: reportData.costUsd,
              clusters: reportData.clusters,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`\n${renderTerminalReport(reportData)}`);
      }

      if (skippedSessions > 0) {
        console.warn(`\nWarning: skipped ${skippedSessions} session(s) during summarization.`);
      }
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
