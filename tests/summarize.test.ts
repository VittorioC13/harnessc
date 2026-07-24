import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureCandidate } from "../src/lib/signals.js";

vi.mock("../src/lib/llm.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/llm.js")>("../src/lib/llm.js");
  return { ...actual, callJsonModel: vi.fn() };
});

import { callJsonModel, MissingApiKeyError } from "../src/lib/llm.js";
import { summarizeSession } from "../src/lib/summarize.js";

const mockedCallJsonModel = vi.mocked(callJsonModel);

const candidates: FailureCandidate[] = [
  {
    sessionId: "s1",
    project: "p1",
    timestamp: new Date("2026-07-20T00:00:00.000Z"),
    excerpt: "Error: cannot find module 'foo'",
    signalType: "tool_error",
  },
];

function jsonResponse(events: unknown, promptTokens = 100, completionTokens = 50) {
  return {
    content: JSON.stringify({ events }),
    usage: { promptTokens, completionTokens },
  };
}

describe("summarizeSession", () => {
  beforeEach(() => {
    mockedCallJsonModel.mockReset();
  });

  it("returns validated events on a valid first response", async () => {
    mockedCallJsonModel.mockResolvedValueOnce(
      jsonResponse([
        {
          description: "Ran npm test before npm install, causing module-not-found errors.",
          category: "missing dependency",
          evidence: "Error: cannot find module 'foo'",
          severity: "medium",
        },
      ]),
    );

    const result = await summarizeSession(candidates);
    expect(result.skipped).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.description).toContain("npm install");
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(1);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("retries once on invalid JSON and succeeds on the second attempt", async () => {
    mockedCallJsonModel
      .mockResolvedValueOnce({ content: "not valid json", usage: { promptTokens: 10, completionTokens: 5 } })
      .mockResolvedValueOnce(
        jsonResponse([
          {
            description: "Edited src/index.ts instead of src/index.tsx, so the build silently used the old file.",
            category: "wrong file edited",
            evidence: "you edited the wrong file",
            severity: "high",
          },
        ]),
      );

    const result = await summarizeSession(candidates);
    expect(result.skipped).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
  });

  it("skips with a warning after two invalid responses, without crashing", async () => {
    mockedCallJsonModel
      .mockResolvedValueOnce({ content: "not valid json", usage: { promptTokens: 10, completionTokens: 5 } })
      .mockResolvedValueOnce({ content: "still not valid", usage: { promptTokens: 10, completionTokens: 5 } });

    const result = await summarizeSession(candidates);
    expect(result.skipped).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.warning).toBeDefined();
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
  });

  it("rejects an event with a severity outside the enum instead of silently accepting it", async () => {
    mockedCallJsonModel
      .mockResolvedValueOnce(
        jsonResponse([
          { description: "x", category: "y", evidence: "z", severity: "critical" },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await summarizeSession(candidates);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
    expect(result.skipped).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it("propagates MissingApiKeyError immediately instead of retrying or swallowing it", async () => {
    mockedCallJsonModel.mockRejectedValueOnce(new MissingApiKeyError());

    await expect(summarizeSession(candidates)).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(1);
  });

  it("retries a genuine API failure with backoff and succeeds on the second attempt (PRD §10)", async () => {
    mockedCallJsonModel
      .mockRejectedValueOnce(new Error("429 rate limited"))
      .mockResolvedValueOnce(
        jsonResponse([
          { description: "Ran npm test before npm install.", category: "missing dependency", evidence: "e", severity: "low" },
        ]),
      );

    const start = Date.now();
    const result = await summarizeSession(candidates);
    expect(Date.now() - start).toBeGreaterThanOrEqual(490);
    expect(result.skipped).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
  });

  it("skips with partial results after a repeated API failure, without crashing", async () => {
    mockedCallJsonModel.mockRejectedValue(new Error("500 internal error"));

    const result = await summarizeSession(candidates);
    expect(result.skipped).toBe(true);
    expect(result.warning).toContain("500 internal error");
  });
});
