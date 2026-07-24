import type { FailureCluster } from "./cluster.js";

export interface ReportData {
  sessionsScanned: number;
  sessionDates: Date[];
  totalFailureEvents: number;
  clusters: FailureCluster[];
  costUsd: number;
}

const WRAP_WIDTH = 76;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(dates: Date[]): string {
  if (dates.length === 0) return "no dated sessions";
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const first = formatDateShort(sorted[0] as Date);
  const last = formatDateShort(sorted[sorted.length - 1] as Date);
  return first === last ? first : `${first} – ${last}`;
}

function wrapText(text: string, indent: string, width = WRAP_WIDTH): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.map((line, i) => (i === 0 ? line : `${indent}${line}`)).join("\n");
}

function headerLine(data: ReportData): string {
  return `harnessc report — ${plural(data.sessionsScanned, "session")} scanned (${formatDateRange(data.sessionDates)}), ${plural(data.totalFailureEvents, "failure event")}`;
}

export function renderTerminalReport(data: ReportData): string {
  const lines = [headerLine(data), `Estimated cost: $${data.costUsd.toFixed(4)}`, ""];

  if (data.clusters.length === 0) {
    lines.push("No recurring failure clusters found.", "");
  } else {
    const nameWidth = Math.max(...data.clusters.map((c) => c.name.length));
    data.clusters.forEach((cluster, i) => {
      const paddedName = cluster.name.padEnd(nameWidth);
      lines.push(` #${i + 1}  ${paddedName}   ${cluster.count}× · ${plural(cluster.sessionsAffected, "session")}`);
      const firstExcerpt = cluster.evidenceExcerpts[0];
      if (firstExcerpt) lines.push(`     "${firstExcerpt}"`);
      lines.push(`     Suggested harness fix: ${wrapText(cluster.suggestedFix, "     ")}`, "");
    });
  }

  lines.push("Full details: harness-report.md");
  return lines.join("\n");
}

export function renderMarkdownReport(data: ReportData): string {
  const lines = [
    "# harnessc report",
    "",
    `**${headerLine(data).replace("harnessc report — ", "")}**`,
    "",
    `Estimated cost: $${data.costUsd.toFixed(4)}`,
    "",
  ];

  if (data.clusters.length === 0) {
    lines.push("No recurring failure clusters found.");
  } else {
    data.clusters.forEach((cluster, i) => {
      lines.push(
        `## #${i + 1} ${cluster.name}`,
        "",
        `**${cluster.count}× · ${plural(cluster.sessionsAffected, "session")} · severity: ${cluster.topSeverity}**`,
        "",
        "Evidence:",
      );
      for (const excerpt of cluster.evidenceExcerpts) {
        lines.push(`- "${excerpt}"`);
      }
      lines.push("", `**Suggested harness fix:** ${cluster.suggestedFix}`, "");
    });
  }

  return lines.join("\n");
}
