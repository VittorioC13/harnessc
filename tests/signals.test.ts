import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSignals } from "../src/lib/signals.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("extractSignals", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "harnessc-signals-test-"));
    mkdirSync(join(baseDir, "-fake-project"));
    copyFileSync(
      join(fixturesDir, "session-signals.jsonl"),
      join(baseDir, "-fake-project", "dddd4444-0000-0000-0000-000000000004.jsonl"),
    );
    copyFileSync(
      join(fixturesDir, "session-normal.jsonl"),
      join(baseDir, "-fake-project", "aaaa1111-0000-0000-0000-000000000001.jsonl"),
    );
    copyFileSync(
      join(fixturesDir, "session-read-noise.jsonl"),
      join(baseDir, "-fake-project", "eeee5555-0000-0000-0000-000000000005.jsonl"),
    );
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("finds a tool_error candidate from a failing tool_result", async () => {
    const result = await extractSignals({ baseDir, all: true });
    const candidates = result.candidatesBySession.get("dddd4444-0000-0000-0000-000000000004") ?? [];
    const toolErrors = candidates.filter((c) => c.signalType === "tool_error");
    expect(toolErrors).toHaveLength(1);
    expect(toolErrors[0]?.excerpt).toContain("Cannot find module");
  });

  it("finds a user_correction from an explicit correction phrase", async () => {
    const result = await extractSignals({ baseDir, all: true });
    const candidates = result.candidatesBySession.get("dddd4444-0000-0000-0000-000000000004") ?? [];
    const corrections = candidates.filter((c) => c.signalType === "user_correction");
    expect(corrections.some((c) => c.excerpt.includes("you broke the deploy script"))).toBe(true);
  });

  it("finds a user_correction from a short reply shortly after a tool error", async () => {
    const result = await extractSignals({ baseDir, all: true });
    const candidates = result.candidatesBySession.get("dddd4444-0000-0000-0000-000000000004") ?? [];
    expect(candidates.some((c) => c.signalType === "user_correction" && c.excerpt === "nope not that")).toBe(true);
  });

  it("finds retry_churn after the same tool call repeats 3 times", async () => {
    const result = await extractSignals({ baseDir, all: true });
    const candidates = result.candidatesBySession.get("dddd4444-0000-0000-0000-000000000004") ?? [];
    const churn = candidates.filter((c) => c.signalType === "retry_churn");
    expect(churn).toHaveLength(1);
    expect(churn[0]?.excerpt).toContain("npm run build");
  });

  it("does not flag a clean, non-repeated session", async () => {
    const result = await extractSignals({ baseDir, all: true });
    expect(result.candidatesBySession.has("aaaa1111-0000-0000-0000-000000000001")).toBe(false);
  });

  it("does not flag a Read tool_result whose file content merely mentions 'error' as prose", async () => {
    const result = await extractSignals({ baseDir, all: true });
    expect(result.candidatesBySession.has("eeee5555-0000-0000-0000-000000000005")).toBe(false);
  });

  it("caps total candidates and reports how many sessions were scanned", async () => {
    const result = await extractSignals({ baseDir, all: true });
    expect(result.sessionsScanned).toBe(3);
    expect(result.totalCandidates).toBe(4);
  });

  it("caps candidates at 40 per session even when a huge transcript has far more failures (PRD §7 Step B)", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      const ts = new Date(2026, 6, 1, 0, 0, i).toISOString();
      lines.push(
        JSON.stringify({
          type: "assistant",
          timestamp: ts,
          sessionId: "ffff6666-0000-0000-0000-000000000006",
          uuid: `a${i}`,
          message: { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "Bash", input: { command: `cmd-${i}` } }] },
        }),
      );
      lines.push(
        JSON.stringify({
          type: "user",
          timestamp: ts,
          sessionId: "ffff6666-0000-0000-0000-000000000006",
          uuid: `u${i}`,
          message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, is_error: true, content: `Error: failure number ${i}` }] },
        }),
      );
    }
    writeFileSync(join(baseDir, "-fake-project", "ffff6666-0000-0000-0000-000000000006.jsonl"), lines.join("\n"));

    const result = await extractSignals({ baseDir, project: "fake-project", all: true });
    const candidates = result.candidatesBySession.get("ffff6666-0000-0000-0000-000000000006") ?? [];
    expect(candidates).toHaveLength(40);
  });
});
