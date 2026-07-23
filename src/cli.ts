import { Command } from "commander";

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

  return program;
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  buildProgram().parse(process.argv);
}
/* c8 ignore stop */
