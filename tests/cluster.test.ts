import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithSession } from "../src/lib/cluster.js";

vi.mock("../src/lib/llm.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/llm.js")>("../src/lib/llm.js");
  return { ...actual, callJsonModel: vi.fn() };
});

import { callJsonModel, MissingApiKeyError } from "../src/lib/llm.js";
import { clusterFailureEvents } from "../src/lib/cluster.js";

const mockedCallJsonModel = vi.mocked(callJsonModel);

const events: EventWithSession[] = [
  {
    description: "Ran npm test before npm install, causing module-not-found errors.",
    category: "missing dependency",
    evidence: "Cannot find module 'foo'",
    severity: "medium",
    sessionId: "s1",
    project: "p1",
  },
  {
    description: "Ran npm test again before installing dependencies.",
    category: "missing dependency",
    evidence: "Cannot find module 'bar'",
    severity: "medium",
    sessionId: "s2",
    project: "p1",
  },
  {
    description: "Edited src/index.ts instead of src/index.tsx.",
    category: "wrong file edited",
    evidence: "you edited the wrong file",
    severity: "high",
    sessionId: "s1",
    project: "p1",
  },
];

function jsonResponse(clusters: unknown, promptTokens = 200, completionTokens = 80) {
  return { content: JSON.stringify({ clusters }), usage: { promptTokens, completionTokens } };
}

describe("clusterFailureEvents", () => {
  beforeEach(() => {
    mockedCallJsonModel.mockReset();
  });

  it("returns an empty result without calling the API when there are no events", async () => {
    const result = await clusterFailureEvents([]);
    expect(result.clusters).toHaveLength(0);
    expect(result.skipped).toBe(false);
    expect(result.costUsd).toBe(0);
    expect(mockedCallJsonModel).not.toHaveBeenCalled();
  });

  it("builds clusters from event indices, ranked by count then severity", async () => {
    mockedCallJsonModel.mockResolvedValueOnce(
      jsonResponse([
        { name: "Runs npm test before installing dependencies", eventIndices: [0, 1], suggestedFix: "Add a pretest script that runs npm install." },
        { name: "Edits the wrong file", eventIndices: [2], suggestedFix: "Add an AGENTS.md note about src/index.tsx." },
      ]),
    );

    const result = await clusterFailureEvents(events);
    expect(result.skipped).toBe(false);
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0]?.name).toBe("Runs npm test before installing dependencies");
    expect(result.clusters[0]?.count).toBe(2);
    expect(result.clusters[0]?.sessionsAffected).toBe(2);
    expect(result.clusters[1]?.count).toBe(1);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("drops out-of-range event indices instead of crashing", async () => {
    mockedCallJsonModel.mockResolvedValueOnce(
      jsonResponse([{ name: "Bogus cluster", eventIndices: [99], suggestedFix: "n/a" }]),
    );

    const result = await clusterFailureEvents(events);
    expect(result.skipped).toBe(false);
    expect(result.clusters).toHaveLength(0);
  });

  it("retries once on invalid JSON and succeeds on the second attempt", async () => {
    mockedCallJsonModel
      .mockResolvedValueOnce({ content: "not valid json", usage: { promptTokens: 10, completionTokens: 5 } })
      .mockResolvedValueOnce(jsonResponse([{ name: "Edits the wrong file", eventIndices: [2], suggestedFix: "n/a" }]));

    const result = await clusterFailureEvents(events);
    expect(result.skipped).toBe(false);
    expect(result.clusters).toHaveLength(1);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
  });

  it("skips with a warning after two invalid responses, without crashing", async () => {
    mockedCallJsonModel
      .mockResolvedValueOnce({ content: "nope", usage: { promptTokens: 10, completionTokens: 5 } })
      .mockResolvedValueOnce({ content: "still nope", usage: { promptTokens: 10, completionTokens: 5 } });

    const result = await clusterFailureEvents(events);
    expect(result.skipped).toBe(true);
    expect(result.clusters).toHaveLength(0);
    expect(result.warning).toBeDefined();
  });

  it("propagates MissingApiKeyError immediately instead of retrying or swallowing it", async () => {
    mockedCallJsonModel.mockRejectedValueOnce(new MissingApiKeyError());
    await expect(clusterFailureEvents(events)).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(1);
  });

  it("retries a genuine API failure with backoff and succeeds on the second attempt (PRD §10)", async () => {
    mockedCallJsonModel
      .mockRejectedValueOnce(new Error("429 rate limited"))
      .mockResolvedValueOnce(jsonResponse([{ name: "Edits the wrong file", eventIndices: [2], suggestedFix: "n/a" }]));

    const start = Date.now();
    const result = await clusterFailureEvents(events);
    expect(Date.now() - start).toBeGreaterThanOrEqual(490);
    expect(result.skipped).toBe(false);
    expect(result.clusters).toHaveLength(1);
    expect(mockedCallJsonModel).toHaveBeenCalledTimes(2);
  });

  it("skips with partial results after a repeated API failure, without crashing", async () => {
    mockedCallJsonModel.mockRejectedValue(new Error("500 internal error"));
    const result = await clusterFailureEvents(events);
    expect(result.skipped).toBe(true);
    expect(result.warning).toContain("500 internal error");
  });
});
