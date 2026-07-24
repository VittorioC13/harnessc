import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSessions } from "../src/lib/transcripts.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("discoverSessions", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "harnessc-test-"));
    mkdirSync(join(baseDir, "-fake-project-alpha"));
    mkdirSync(join(baseDir, "-fake-project-beta"));
    copyFileSync(
      join(fixturesDir, "session-normal.jsonl"),
      join(baseDir, "-fake-project-alpha", "aaaa1111-0000-0000-0000-000000000001.jsonl"),
    );
    copyFileSync(
      join(fixturesDir, "session-malformed.jsonl"),
      join(baseDir, "-fake-project-beta", "bbbb2222-0000-0000-0000-000000000002.jsonl"),
    );
    copyFileSync(
      join(fixturesDir, "session-meta-only.jsonl"),
      join(baseDir, "-fake-project-beta", "cccc3333-0000-0000-0000-000000000003.jsonl"),
    );
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("discovers all projects and sessions with --all", async () => {
    const result = await discoverSessions({ baseDir, all: true });
    expect(result.totalProjects).toBe(2);
    expect(result.totalSessionsFound).toBe(3);
    expect(result.sessions).toHaveLength(3);
    expect(result.totalMessages).toBe(7);
  });

  it("skips malformed lines and counts them instead of crashing", async () => {
    const result = await discoverSessions({ baseDir, all: true });
    expect(result.totalMalformed).toBe(2);
  });

  it("filters by --project directory-name substring", async () => {
    const result = await discoverSessions({ baseDir, project: "alpha", all: true });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.project).toBe("-fake-project-alpha");
    expect(result.totalProjects).toBe(1);
  });

  it("reports zero projects/sessions when --project matches nothing", async () => {
    const result = await discoverSessions({ baseDir, project: "zzz-nonexistent", all: true });
    expect(result.totalProjects).toBe(0);
    expect(result.totalSessionsFound).toBe(0);
    expect(result.sessions).toHaveLength(0);
  });

  it("respects --limit while still reporting the true total found", async () => {
    const result = await discoverSessions({ baseDir, limit: 1 });
    expect(result.sessions).toHaveLength(1);
    expect(result.totalSessionsFound).toBe(3);
  });

  it("falls back to file mtime when a session has no message timestamps", async () => {
    const result = await discoverSessions({ baseDir, project: "beta", all: true });
    const metaOnly = result.sessions.find(
      (s) => s.sessionId === "cccc3333-0000-0000-0000-000000000003",
    );
    expect(metaOnly).toBeDefined();
    expect(metaOnly?.date).toBeInstanceOf(Date);
    expect(metaOnly?.messageCount).toBe(0);
  });

  it("returns an empty result for a missing base directory instead of crashing", async () => {
    const result = await discoverSessions({ baseDir: join(baseDir, "does-not-exist") });
    expect(result.sessions).toHaveLength(0);
    expect(result.totalProjects).toBe(0);
  });
});
