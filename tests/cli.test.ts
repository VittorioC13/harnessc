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

  it("prints a stub message for the scan command", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram().parseAsync(["node", "cli", "scan"]);
    expect(logSpy).toHaveBeenCalledWith("scan: not implemented yet");
    logSpy.mockRestore();
  });
});
