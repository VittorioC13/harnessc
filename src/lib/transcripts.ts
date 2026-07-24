import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";

export const DEFAULT_CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

const MESSAGE_TYPES = new Set(["user", "assistant"]);

export interface SessionSummary {
  project: string;
  file: string;
  filePath: string;
  sessionId: string;
  messageCount: number;
  malformedCount: number;
  date: Date;
}

export interface DiscoverOptions {
  baseDir?: string;
  project?: string;
  limit?: number;
  all?: boolean;
}

export interface DiscoverResult {
  sessions: SessionSummary[];
  totalProjects: number;
  totalSessionsFound: number;
  totalMessages: number;
  totalMalformed: number;
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function listSessionFiles(projectDir: string): string[] {
  try {
    return readdirSync(projectDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

interface ParsedSessionFile {
  messageCount: number;
  malformedCount: number;
  date: Date;
}

async function parseSessionFile(filePath: string): Promise<ParsedSessionFile> {
  let messageCount = 0;
  let malformedCount = 0;
  let latestTimestamp: Date | undefined;

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformedCount++;
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
      malformedCount++;
      continue;
    }
    const record = parsed as { type: string; timestamp?: unknown };
    if (MESSAGE_TYPES.has(record.type)) {
      messageCount++;
    }
    if (typeof record.timestamp === "string") {
      const ts = new Date(record.timestamp);
      if (!Number.isNaN(ts.getTime()) && (!latestTimestamp || ts > latestTimestamp)) {
        latestTimestamp = ts;
      }
    }
  }

  const date = latestTimestamp ?? statSync(filePath).mtime;
  return { messageCount, malformedCount, date };
}

export async function discoverSessions(opts: DiscoverOptions = {}): Promise<DiscoverResult> {
  const baseDir = opts.baseDir ?? DEFAULT_CLAUDE_PROJECTS_DIR;
  const limit = opts.limit ?? 50;

  let projectDirs = listDirs(baseDir);
  if (opts.project) {
    const needle = opts.project.toLowerCase();
    projectDirs = projectDirs.filter((name) => name.toLowerCase().includes(needle));
  }
  const totalProjects = projectDirs.length;

  const sessions: SessionSummary[] = [];
  let totalMessages = 0;
  let totalMalformed = 0;

  for (const project of projectDirs) {
    const projectPath = join(baseDir, project);
    for (const file of listSessionFiles(projectPath)) {
      const filePath = join(projectPath, file);
      const parsed = await parseSessionFile(filePath);
      totalMessages += parsed.messageCount;
      totalMalformed += parsed.malformedCount;
      sessions.push({
        project,
        file,
        filePath,
        sessionId: basename(file, ".jsonl"),
        messageCount: parsed.messageCount,
        malformedCount: parsed.malformedCount,
        date: parsed.date,
      });
    }
  }

  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  const totalSessionsFound = sessions.length;
  const limited = opts.all ? sessions : sessions.slice(0, limit);

  return { sessions: limited, totalProjects, totalSessionsFound, totalMessages, totalMalformed };
}
