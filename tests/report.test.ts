import { describe, expect, it } from "vitest";
import { renderMarkdownReport, renderTerminalReport, type ReportData } from "../src/lib/report.js";
import type { FailureCluster } from "../src/lib/cluster.js";

const cluster: FailureCluster = {
  name: "Uses deprecated fetchUser() instead of getUser()",
  count: 12,
  sessionsAffected: 8,
  evidenceExcerpts: ["no — fetchUser was removed, use getUser like everywhere else", "still using fetchUser"],
  suggestedFix:
    "Add an ESLint no-restricted-syntax rule banning fetchUser with a message pointing to getUser; add one line to AGENTS.md under \"API conventions.\"",
  topSeverity: "high",
};

const data: ReportData = {
  sessionsScanned: 47,
  sessionDates: [new Date("2026-05-12T00:00:00Z"), new Date("2026-07-20T00:00:00Z")],
  totalFailureEvents: 132,
  clusters: [cluster],
  costUsd: 0.42,
};

describe("renderTerminalReport", () => {
  it("matches PRD §8's header shape: sessions scanned, date range, failure events", () => {
    const output = renderTerminalReport(data);
    expect(output).toContain("harness-scan report — 47 sessions scanned (May 12 – Jul 20), 132 failure events");
  });

  it("prints the cluster name, count, and sessions affected", () => {
    const output = renderTerminalReport(data);
    expect(output).toContain("Uses deprecated fetchUser() instead of getUser()");
    expect(output).toContain("12× · 8 sessions");
  });

  it("quotes the first evidence excerpt", () => {
    const output = renderTerminalReport(data);
    expect(output).toContain('"no — fetchUser was removed, use getUser like everywhere else"');
  });

  it("includes the suggested harness fix and the cost line", () => {
    const output = renderTerminalReport(data);
    expect(output).toContain("Suggested harness fix:");
    expect(output).toContain("getUser");
    expect(output).toContain("Estimated cost: $0.4200");
  });

  it("points to the markdown file at the end", () => {
    expect(renderTerminalReport(data).trim().endsWith("Full details: harness-report.md")).toBe(true);
  });

  it("collapses the date range to a single date when all sessions share one day", () => {
    const singleDay: ReportData = { ...data, sessionDates: [new Date("2026-07-20T00:00:00Z")] };
    expect(renderTerminalReport(singleDay)).toContain("(Jul 20)");
  });

  it("handles zero clusters without crashing", () => {
    const empty: ReportData = { ...data, clusters: [] };
    expect(() => renderTerminalReport(empty)).not.toThrow();
    expect(renderTerminalReport(empty)).toContain("No recurring failure clusters found.");
  });
});

describe("renderMarkdownReport", () => {
  it("contains the same substantive content as the terminal report", () => {
    const markdown = renderMarkdownReport(data);
    expect(markdown).toContain("# harness-scan report");
    expect(markdown).toContain("Uses deprecated fetchUser() instead of getUser()");
    expect(markdown).toContain("12× · 8 sessions");
    expect(markdown).toContain("no — fetchUser was removed, use getUser like everywhere else");
    expect(markdown).toContain("still using fetchUser");
    expect(markdown).toContain("**Suggested harness fix:**");
    expect(markdown).toContain("Estimated cost: $0.4200");
  });
});
