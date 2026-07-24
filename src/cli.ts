import { Command } from "commander";
import { discoverSessions } from "./lib/transcripts.js";
import { renderTable } from "./lib/format.js";

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

  return program;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  buildProgram().parse(process.argv);
}
/* c8 ignore stop */
