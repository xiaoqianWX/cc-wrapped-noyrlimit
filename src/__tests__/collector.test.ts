import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  checkClaudeDataExists,
  collectClaudeProjects,
  collectClaudeUsageSummary,
} from "../collector";
import { __testing as pricingTesting } from "../pricing";
import {
  PRICING_URL,
  cleanupDir,
  createClaudeConfigDir,
  installFetchMock,
  jsonResponse,
  makeHistoryEntry,
  makeUsageEntry,
  setClaudeConfigDir,
} from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
const tempDirs: string[] = [];

function registerCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

async function registerTempDir(path: Promise<string> | string): Promise<string> {
  const resolved = await path;
  tempDirs.push(resolved);
  return resolved;
}

beforeEach(() => {
  pricingTesting.resetPricingCache();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }

  while (tempDirs.length > 0) {
    await cleanupDir(tempDirs.pop()!);
  }

  pricingTesting.resetPricingCache();
});

describe("collector path resolution", () => {
  test("checkClaudeDataExists reads metadata from CLAUDE_CONFIG_DIR", async () => {
    const baseDir = await registerTempDir(
      createClaudeConfigDir({
        historyLines: [makeHistoryEntry({ timestamp: "2025-01-01T00:00:00Z", project: "alpha" })],
      })
    );

    registerCleanup(setClaudeConfigDir(baseDir));

    await expect(checkClaudeDataExists()).resolves.toBe(true);
  });

  test("checkClaudeDataExists returns false for an empty configured base directory", async () => {
    const baseDir = await registerTempDir(createClaudeConfigDir());

    registerCleanup(setClaudeConfigDir(baseDir));

    await expect(checkClaudeDataExists()).resolves.toBe(false);
  });

  test("collectClaudeProjects uses the first existing configured base for history", async () => {
    const baseDir1 = await registerTempDir(
      createClaudeConfigDir({
        historyLines: [
          makeHistoryEntry({ timestamp: "2025-02-01T00:00:00Z", project: "alpha" }),
          makeHistoryEntry({ timestamp: "2024-02-01T00:00:00Z", project: "old-alpha" }),
        ],
      })
    );
    const baseDir2 = await registerTempDir(
      createClaudeConfigDir({
        historyLines: [makeHistoryEntry({ timestamp: "2025-03-01T00:00:00Z", project: "beta" })],
      })
    );

    registerCleanup(
      setClaudeConfigDir("/definitely/missing/cc-wrapped-test", baseDir1, baseDir2)
    );

    const projects = await collectClaudeProjects(2025);

    expect(Array.from(projects)).toEqual(["alpha"]);
  });
});

describe("collectClaudeUsageSummary", () => {
  test("aggregates deduplicated usage across configured project roots", async () => {
    const baseDir1 = await registerTempDir(
      createClaudeConfigDir({
        projectFiles: [
          {
            relativePath: "session-a.jsonl",
            lines: [
              makeUsageEntry({
                timestamp: "2025-01-10T10:00:00Z",
                sessionId: "session-1",
                requestId: "request-1",
                messageId: "message-1",
                model: "claude-sonnet-4",
                inputTokens: 1,
                outputTokens: 1,
              }),
              makeUsageEntry({
                timestamp: "2025-01-10T10:00:00Z",
                sessionId: "session-1",
                requestId: "request-1",
                messageId: "message-1",
                model: "claude-sonnet-4",
                inputTokens: 10,
                outputTokens: 2,
                cacheReadTokens: 3,
                webSearchRequests: 2,
                costUSD: 1.25,
              }),
              "{not-json",
              makeUsageEntry({
                timestamp: "2025-01-09T09:00:00Z",
                sessionId: "session-0",
                requestId: "request-2",
                messageId: "message-2",
                model: "claude-sonnet-4",
                includeUsage: false,
              }),
            ],
          },
        ],
      })
    );
    const baseDir2 = await registerTempDir(
      createClaudeConfigDir({
        projectFiles: [
          {
            relativePath: "nested/session-b.jsonl",
            lines: [
              makeUsageEntry({
                timestamp: "2025-01-10T11:00:00Z",
                sessionId: "session-2",
                requestId: "request-3",
                messageId: "message-3",
                model: "gpt-4o",
                inputTokens: 4,
                outputTokens: 5,
                cacheCreationTokens: 1,
              }),
              JSON.stringify({
                timestamp: new Date("2025-01-10T12:00:00Z").getTime(),
                sessionId: "session-3",
                message: {
                  role: "assistant",
                  model: "gpt-4o",
                  usage: {
                    input_tokens: 2,
                    output_tokens: 0,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                  },
                },
              }),
              makeUsageEntry({
                timestamp: "2024-12-31T23:00:00Z",
                sessionId: "ignored-session",
                requestId: "request-ignored",
                messageId: "message-ignored",
                model: "gpt-4o",
                inputTokens: 999,
              }),
            ],
          },
        ],
      })
    );

    registerCleanup(setClaudeConfigDir(baseDir1, baseDir2));
    registerCleanup(
      installFetchMock((url) => {
        expect(url).toBe(PRICING_URL);

        return jsonResponse({
          "gpt-4o": {
            input_cost_per_token: 1,
            output_cost_per_token: 2,
            cache_creation_input_token_cost: 3,
            cache_read_input_token_cost: 4,
          },
        });
      })
    );

    const summary = await collectClaudeUsageSummary(2025);

    expect(summary.totalMessages).toBe(4);
    expect(summary.totalSessions).toBe(4);
    expect(summary.totalInputTokens).toBe(16);
    expect(summary.totalOutputTokens).toBe(7);
    expect(summary.totalCacheCreationTokens).toBe(1);
    expect(summary.totalCacheReadTokens).toBe(3);
    expect(summary.totalTokens).toBe(27);
    expect(summary.totalCostUSD).toBe(20.25);
    expect(summary.totalWebSearchRequests).toBe(2);
    expect(summary.firstTimestamp?.toISOString()).toBe("2025-01-09T09:00:00.000Z");

    expect(summary.dailyActivity).toEqual(
      new Map([
        ["2025-01-09", 1],
        ["2025-01-10", 3],
      ])
    );
    expect(summary.modelTokenTotals).toEqual(
      new Map([
        ["claude-sonnet-4", 15],
        ["gpt-4o", 12],
      ])
    );
    expect(summary.modelUsage.get("claude-sonnet-4")).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cacheReadInputTokens: 3,
      cacheCreationInputTokens: 0,
      webSearchRequests: 2,
    });
    expect(summary.modelUsage.get("gpt-4o")).toEqual({
      inputTokens: 6,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 1,
      webSearchRequests: 0,
    });
  });
});
