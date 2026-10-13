import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ClaudeStatsCache } from "../collector";
import type { ClaudeCodeStats } from "../types";

export const MODELS_DEV_URL = "https://models.dev/api.json";
export const PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const RealDate = Date;

export interface UsageEntryOptions {
  timestamp: string;
  model?: string;
  sessionId?: string;
  requestId?: string;
  messageId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  webSearchRequests?: number;
  costUSD?: number;
  includeUsage?: boolean;
}

export interface HistoryEntryOptions {
  timestamp: string;
  project: string;
}

export interface ClaudeConfigOptions {
  projectFiles?: Array<{
    relativePath: string;
    lines: string[];
  }>;
  statsCache?: ClaudeStatsCache;
  historyLines?: string[];
}

export function makeUsageEntry(options: UsageEntryOptions): string {
  const entry: Record<string, unknown> = {
    timestamp: new RealDate(options.timestamp).getTime(),
    sessionId: options.sessionId ?? "session-1",
    requestId: options.requestId ?? crypto.randomUUID(),
    message: {
      id: options.messageId ?? crypto.randomUUID(),
      role: "assistant",
      model: options.model ?? "claude-sonnet-4",
    },
  };

  if (options.includeUsage !== false) {
    (entry.message as Record<string, unknown>).usage = {
      input_tokens: options.inputTokens ?? 0,
      output_tokens: options.outputTokens ?? 0,
      cache_read_input_tokens: options.cacheReadTokens ?? 0,
      cache_creation_input_tokens: options.cacheCreationTokens ?? 0,
      ...(options.webSearchRequests != null
        ? {
            server_tool_use: {
              web_search_requests: options.webSearchRequests,
            },
          }
        : {}),
    };
  }

  if (options.costUSD != null) {
    entry.costUSD = options.costUSD;
  }

  return JSON.stringify(entry);
}

export function makeHistoryEntry(options: HistoryEntryOptions): string {
  return JSON.stringify({
    timestamp: new RealDate(options.timestamp).getTime(),
    project: options.project,
  });
}

export async function createClaudeConfigDir(options: ClaudeConfigOptions = {}): Promise<string> {
  const baseDir = await mkdtemp(join(tmpdir(), "cc-wrapped-test-"));

  for (const file of options.projectFiles ?? []) {
    const fullPath = join(baseDir, "projects", file.relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.lines.join("\n"));
  }

  if (options.statsCache) {
    await writeFile(
      join(baseDir, "stats-cache.json"),
      JSON.stringify(options.statsCache, null, 2)
    );
  }

  if (options.historyLines) {
    await writeFile(join(baseDir, "history.jsonl"), options.historyLines.join("\n"));
  }

  return baseDir;
}

export async function cleanupDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export function setClaudeConfigDir(...paths: string[]): () => void {
  const previous = process.env.CLAUDE_CONFIG_DIR;

  if (paths.length === 0) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = paths.join(",");
  }

  return () => {
    if (previous == null) {
      delete process.env.CLAUDE_CONFIG_DIR;
      return;
    }
    process.env.CLAUDE_CONFIG_DIR = previous;
  };
}

export function setEnvVars(
  overrides: Record<string, string | undefined>
): () => void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

export function installFetchMock(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return handler(input, init);
    }
    if (input instanceof URL) {
      return handler(input.toString(), init);
    }
    return handler(input.url, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    status: init.status ?? 200,
    statusText: init.statusText,
  });
}

export function freezeTime(isoTimestamp: string): () => void {
  const fixedTime = new RealDate(isoTimestamp).getTime();

  class MockDate extends RealDate {
    constructor(...args: [] | ConstructorParameters<typeof RealDate>) {
      if (args.length === 0) {
        super(fixedTime);
        return;
      }
      super(...(args as ConstructorParameters<typeof RealDate>));
    }

    static now(): number {
      return fixedTime;
    }

    static parse(dateString: string): number {
      return RealDate.parse(dateString);
    }

    static UTC(...args: Parameters<typeof RealDate.UTC>): number {
      return RealDate.UTC(...args);
    }
  }

  globalThis.Date = MockDate as DateConstructor;

  return () => {
    globalThis.Date = RealDate;
  };
}

export function createSampleStats(
  overrides: Partial<ClaudeCodeStats> = {}
): ClaudeCodeStats {
  return {
    year: 2025,
    firstSessionDate: new RealDate("2025-01-10T00:00:00.000Z"),
    daysSinceFirstSession: 120,
    totalSessions: 6,
    totalMessages: 18,
    totalProjects: 3,
    totalInputTokens: 12000,
    totalOutputTokens: 6000,
    totalTokens: 20000,
    totalCacheReadTokens: 1500,
    totalCacheWriteTokens: 500,
    cacheHitRate: 75,
    totalWebSearchRequests: 4,
    totalToolCalls: 7,
    peakContextWindow: 200000,
    totalCost: 12.34,
    hasUsageCost: true,
    topModels: [
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        providerId: "anthropic",
        count: 14000,
        percentage: 70,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        providerId: "openai",
        count: 6000,
        percentage: 30,
      },
    ],
    topProviders: [
      {
        id: "anthropic",
        name: "Anthropic",
        count: 14000,
        percentage: 70,
      },
      {
        id: "openai",
        name: "OpenAI",
        count: 6000,
        percentage: 30,
      },
    ],
    maxStreak: 3,
    currentStreak: 2,
    maxStreakDays: new Set(["2025-01-10", "2025-01-11", "2025-01-12"]),
    dailyActivity: new Map([
      ["2025-01-10", 4],
      ["2025-01-11", 5],
      ["2025-01-12", 3],
      ["2025-02-03", 6],
    ]),
    mostActiveDay: {
      date: "2025-02-03",
      count: 6,
      formattedDate: "Feb 3",
    },
    weekdayActivity: {
      counts: [1, 6, 2, 3, 1, 5, 0],
      mostActiveDay: 1,
      mostActiveDayName: "Monday",
      maxCount: 6,
    },
    ...overrides,
  };
}
