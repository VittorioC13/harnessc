import { describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/cli.js";

describe("cli", () => {
  it("lists the scan command in --help output", () => {
    const help = buildProgram().helpInformation();
    expect(help).toContain("scan");
  });

  it("reports its version", () => {
    expect(buildProgram().version()).toBe("0.1.0");
  });

  it("lists --json in scan's --help output", () => {
    const help = buildProgram().commands.find((c) => c.name() === "scan")?.helpInformation() ?? "";
    expect(help).toContain("--json");
  });

  it("scan explains what it looked for and where (and never reaches the API) when --project matches nothing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram().parseAsync(["node", "cli", "scan", "--project", "zzz-definitely-does-not-exist"]);
    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("No Claude Code sessions found");
    expect(printed).toContain(".claude");
    expect(printed).toContain("projects");
    logSpy.mockRestore();
  });

  it("scan --json emits valid, parseable JSON (and only JSON) even when nothing is found", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram().parseAsync(["node", "cli", "scan", "--project", "zzz-definitely-does-not-exist", "--json"]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const printed = String(logSpy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(printed);
    expect(parsed).toEqual({ sessionsScanned: 0, totalFailureEvents: 0, costUsd: 0, clusters: [] });
    logSpy.mockRestore();
  });
});
