import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { calculateStats } from "../stats";
import { __testing as modelsTesting } from "../models";
import {
  MODELS_DEV_URL,
  cleanupDir,
  createClaudeConfigDir,
  freezeTime,
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

async function registerTempDir(path: Promise<string>): Promise<string> {
  const resolved = await path;
  tempDirs.push(resolved);
  return resolved;
}

beforeEach(() => {
  modelsTesting.resetModelsCache();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }

  while (tempDirs.length > 0) {
    await cleanupDir(tempDirs.pop()!);
  }

  modelsTesting.resetModelsCache();
});

function installModelsFetchMock(): void {
  registerCleanup(
    installFetchMock((url) => {
      expect(url).toBe(MODELS_DEV_URL);

      return jsonResponse({
        anthropic: {
          name: "Anthropic",
          models: {
            "claude-sonnet-4": {
              name: "Claude Sonnet 4",
            },
          },
        },
        openai: {
          name: "OpenAI",
          models: {
            "gpt-4o": {
              name: "GPT-4o",
            },
          },
        },
      });
    })
  );
}

describe("calculateStats", () => {
  test("prefers raw collector data over stats-cache aggregates", async () => {
    installModelsFetchMock();
    registerCleanup(freezeTime("2025-04-10T12:00:00.000Z"));

    const baseDir = await registerTempDir(
      createClaudeConfigDir({
        projectFiles: [
          {
            relativePath: "session.jsonl",
            lines: [
              makeUsageEntry({
                timestamp: "2025-04-01T10:00:00Z",
                sessionId: "session-1",
                requestId: "request-1",
                messageId: "message-1",
                model: "claude-sonnet-4",
                inputTokens: 10,
                outputTokens: 5,
                cacheReadTokens: 5,
                webSearchRequests: 1,
                costUSD: 2.5,
              }),
              makeUsageEntry({
                timestamp: "2025-04-01T12:00:00Z",
                sessionId: "session-2",
                requestId: "request-2",
                messageId: "message-2",
                model: "gpt-4o",
                inputTokens: 5,
                outputTokens: 5,
                cacheCreationTokens: 5,
                costUSD: 1,
              }),
              makeUsageEntry({
                timestamp: "2025-04-02T08:00:00Z",
                sessionId: "session-2",
                requestId: "request-3",
                messageId: "message-3",
                model: "gpt-4o",
                inputTokens: 1,
                outputTokens: 1,
                costUSD: 0.25,
              }),
            ],
          },
        ],
        statsCache: {
          firstSessionDate: "2020-01-01T00:00:00.000Z",
          dailyActivity: [
            {
              date: "2025-04-01",
              messageCount: 100,
              sessionCount: 99,
              toolCallCount: 4,
            },
          ],
        },
        historyLines: [
          makeHistoryEntry({ timestamp: "2025-04-01T00:00:00Z", project: "alpha" }),
          makeHistoryEntry({ timestamp: "2025-04-02T00:00:00Z", project: "beta" }),
        ],
      })
    );

    registerCleanup(setClaudeConfigDir(baseDir));

    const stats = await calculateStats(2025);

    expect(stats.totalMessages).toBe(3);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalProjects).toBe(2);
    expect(stats.totalInputTokens).toBe(16);
    expect(stats.totalOutputTokens).toBe(11);
    expect(stats.totalTokens).toBe(37);
    expect(stats.totalCacheReadTokens).toBe(5);
    expect(stats.totalCacheWriteTokens).toBe(5);
    expect(stats.cacheHitRate).toBe(50);
    expect(stats.totalWebSearchRequests).toBe(1);
    expect(stats.totalToolCalls).toBe(4);
    expect(stats.peakContextWindow).toBe(0);
    expect(stats.totalCost).toBe(3.75);
    expect(stats.hasUsageCost).toBe(true);
    expect(stats.firstSessionDate.toISOString()).toBe("2025-04-01T10:00:00.000Z");
    expect(stats.daysSinceFirstSession).toBe(9);
    expect(stats.maxStreak).toBe(2);
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreakDays).toEqual(new Set(["2025-04-01", "2025-04-02"]));
    expect(stats.mostActiveDay).toEqual({
      date: "2025-04-01",
      count: 2,
      formattedDate: "Apr 1",
    });
    expect(stats.weekdayActivity).toEqual({
      counts: [0, 0, 2, 1, 0, 0, 0],
      mostActiveDay: 2,
      mostActiveDayName: "Tuesday",
      maxCount: 2,
    });
    expect(stats.topModels).toEqual([
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        providerId: "anthropic",
        count: 20,
        percentage: (20 / 37) * 100,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        providerId: "openai",
        count: 17,
        percentage: (17 / 37) * 100,
      },
    ]);
    expect(stats.topProviders).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        count: 20,
        percentage: (20 / 37) * 100,
      },
      {
        id: "openai",
        name: "OpenAI",
        count: 17,
        percentage: (17 / 37) * 100,
      },
    ]);
  });

  test("falls back to stats-cache activity and model usage when raw logs are unavailable", async () => {
    installModelsFetchMock();
    registerCleanup(freezeTime("2025-03-06T12:00:00.000Z"));

    const baseDir = await registerTempDir(
      createClaudeConfigDir({
        statsCache: {
          firstSessionDate: "2025-02-01T00:00:00.000Z",
          dailyActivity: [
            { date: "2025-03-04", messageCount: 2, sessionCount: 1, toolCallCount: 3 },
            { date: "2025-03-05", messageCount: 3, sessionCount: 1, toolCallCount: 4 },
            { date: "2025-03-06", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
            { date: "2024-12-31", messageCount: 9, sessionCount: 9, toolCallCount: 9 },
          ],
          dailyModelTokens: [
            { date: "2025-03-04", tokensByModel: { "claude-sonnet-4": 100, "gpt-4o": 50 } },
            { date: "2025-03-05", tokensByModel: { "claude-sonnet-4": 100, "gpt-4o": 50 } },
            { date: "2024-12-31", tokensByModel: { ignored: 999 } },
          ],
          modelUsage: {
            "claude-sonnet-4": {
              inputTokens: 120,
              outputTokens: 60,
              cacheReadInputTokens: 20,
              cacheCreationInputTokens: 10,
              webSearchRequests: 2,
              contextWindow: 150000,
            },
            "gpt-4o": {
              inputTokens: 80,
              outputTokens: 20,
              cacheReadInputTokens: 10,
              cacheCreationInputTokens: 0,
              webSearchRequests: 1,
              contextWindow: 200000,
            },
          },
        },
        historyLines: [
          makeHistoryEntry({ timestamp: "2025-03-04T00:00:00Z", project: "alpha" }),
          makeHistoryEntry({ timestamp: "2025-03-05T00:00:00Z", project: "beta" }),
          makeHistoryEntry({ timestamp: "2024-03-05T00:00:00Z", project: "old" }),
        ],
      })
    );

    registerCleanup(setClaudeConfigDir(baseDir));

    const stats = await calculateStats(2025);

    expect(stats.totalMessages).toBe(6);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalProjects).toBe(2);
    expect(stats.totalToolCalls).toBe(7);
    expect(stats.totalTokens).toBe(300);
    expect(stats.totalInputTokens).toBe(187);
    expect(stats.totalOutputTokens).toBe(75);
    expect(stats.totalCacheReadTokens).toBe(28);
    expect(stats.totalCacheWriteTokens).toBe(10);
    expect(stats.cacheHitRate).toBeCloseTo((28 / 38) * 100, 10);
    expect(stats.totalWebSearchRequests).toBe(3);
    expect(stats.peakContextWindow).toBe(200000);
    expect(stats.totalCost).toBe(0);
    expect(stats.hasUsageCost).toBe(false);
    expect(stats.firstSessionDate.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(stats.daysSinceFirstSession).toBe(33);
    expect(stats.maxStreak).toBe(3);
    expect(stats.currentStreak).toBe(3);
    expect(stats.maxStreakDays).toEqual(
      new Set(["2025-03-04", "2025-03-05", "2025-03-06"])
    );
    expect(stats.mostActiveDay).toEqual({
      date: "2025-03-05",
      count: 3,
      formattedDate: "Mar 5",
    });
    expect(stats.weekdayActivity).toEqual({
      counts: [0, 0, 2, 3, 1, 0, 0],
      mostActiveDay: 3,
      mostActiveDayName: "Wednesday",
      maxCount: 3,
    });
    expect(stats.topModels).toEqual([
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        providerId: "anthropic",
        count: 200,
        percentage: (200 / 300) * 100,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        providerId: "openai",
        count: 100,
        percentage: (100 / 300) * 100,
      },
    ]);
    expect(stats.topProviders).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        count: 200,
        percentage: (200 / 300) * 100,
      },
      {
        id: "openai",
        name: "OpenAI",
        count: 100,
        percentage: (100 / 300) * 100,
      },
    ]);
  });
});
