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

  it("scan reports nothing to do (and never reaches the API) when --project matches no sessions", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram().parseAsync(["node", "cli", "scan", "--project", "zzz-definitely-does-not-exist"]);
    expect(logSpy).toHaveBeenCalledWith("No sessions with failure signals in the selected range — nothing to report.");
    logSpy.mockRestore();
  });
});
