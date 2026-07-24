import { afterEach, describe, expect, it, vi } from "vitest";
import { Spinner } from "../src/lib/spinner.js";

describe("Spinner", () => {
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
  });

  it("falls back to a single console.log line when stdout is not a TTY", () => {
    process.stdout.isTTY = false;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const spinner = new Spinner("Working...");
    spinner.start();
    spinner.stop();
    expect(logSpy).toHaveBeenCalledWith("Working...");
    logSpy.mockRestore();
  });

  it("stop() is safe to call without a prior start()", () => {
    const spinner = new Spinner("Working...");
    expect(() => spinner.stop()).not.toThrow();
  });
});
