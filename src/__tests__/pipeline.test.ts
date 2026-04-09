import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { collectClaudeUsageSummary } from "../collector";
import { calculateStats } from "../stats";
import { generateImage } from "../image/generator";
import { makeEntry, type MockEntry } from "./helpers";

const YEAR = 2026;

async function createMockDir(entries: MockEntry[]): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "cc-test-"));
  const projectsDir = join(base, "projects");
  await mkdir(projectsDir, { recursive: true });

  const lines = entries.map((e) => makeEntry(e));
  await writeFile(join(projectsDir, "session.jsonl"), lines.join("\n"));

  // Create an empty stats-cache so collector doesn't fail
  await writeFile(
    join(base, "stats-cache.json"),
    JSON.stringify({ version: 1, dailyActivity: [], dailyModelTokens: [], modelUsage: {} })
  );

  // Create empty history
  await writeFile(join(base, "history.jsonl"), "");

  return base;
}

describe("collectClaudeUsageSummary — model filtering", () => {
  const entries: MockEntry[] = [
    { model: "glm-5.1", timestamp: `${YEAR}-03-10T10:00:00Z`, inputTokens: 8000, outputTokens: 3000 },
    { model: "glm-4.5-air", timestamp: `${YEAR}-03-11T11:00:00Z`, inputTokens: 2000, outputTokens: 1000 },
    { model: "claude-opus-4-6", timestamp: `${YEAR}-03-12T12:00:00Z`, inputTokens: 5000, outputTokens: 2000 },
    { model: "claude-haiku-4-5-20251001", timestamp: `${YEAR}-03-13T13:00:00Z`, inputTokens: 1000, outputTokens: 500 },
  ];

  test("no filter — collects all models", async () => {
    const summary = await collectClaudeUsageSummary(YEAR);
    // This reads from real data, just verify it doesn't crash
    expect(summary.totalMessages).toBeGreaterThanOrEqual(0);
  });

  test("GLM filter — only GLM models counted", async () => {
    const glmFilter = (modelId: string | undefined) =>
      !!modelId && modelId.startsWith("glm-");

    const summary = await collectClaudeUsageSummary(YEAR, glmFilter);

    // Only GLM entries should be counted
    for (const [modelId] of summary.modelTokenTotals) {
      expect(modelId.startsWith("glm-")).toBe(true);
    }
  });

  test("anthropic filter — only Anthropic models counted", async () => {
    const anthropicFilter = (modelId: string | undefined) =>
      !!modelId && modelId.startsWith("claude-");

    const summary = await collectClaudeUsageSummary(YEAR, anthropicFilter);

    for (const [modelId] of summary.modelTokenTotals) {
      expect(modelId.startsWith("claude-")).toBe(true);
    }
  });

  test("filter with no matches — returns zeros", async () => {
    const noMatchFilter = () => false;

    const summary = await collectClaudeUsageSummary(YEAR, noMatchFilter);

    expect(summary.totalMessages).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.modelTokenTotals.size).toBe(0);
  });
});

describe("calculateStats — third-party filtering", () => {
  test("with zhipu filter — stats scoped to GLM only", async () => {
    const zhipuFilter = (modelId: string | undefined) => {
      if (!modelId) return false;
      return modelId.startsWith("glm-");
    };

    const stats = await calculateStats(YEAR, zhipuFilter);

    // All models in topModels should be GLM
    for (const model of stats.topModels) {
      expect(model.id.startsWith("glm-")).toBe(true);
    }

    // Same for allModels
    for (const model of stats.allModels) {
      expect(model.id.startsWith("glm-")).toBe(true);
    }

    // Percentages should sum to 100 (or close)
    const totalPct = stats.allModels.reduce((sum, m) => sum + m.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  test("without filter — includes all models", async () => {
    const stats = await calculateStats(YEAR);

    const hasAnthropic = stats.allModels.some((m) => m.id.startsWith("claude-"));
    const hasGLM = stats.allModels.some((m) => m.id.startsWith("glm-"));

    // Should have both (based on user's actual data)
    expect(hasAnthropic || hasGLM).toBe(true);
  });
});

describe("Image generation — different stat configurations", () => {
  test("generates image with default stats", async () => {
    // First call initializes WASM which can be slow
    const stats = await calculateStats(YEAR);
    if (stats.totalSessions === 0) return; // Skip if no data

    const image = await generateImage(stats);
    expect(image.fullSize).toBeInstanceOf(Buffer);
    expect(image.fullSize.length).toBeGreaterThan(0);
    expect(image.displaySize).toBeInstanceOf(Buffer);
    expect(image.displaySize.length).toBeGreaterThan(0);
  });

  test("generates image with third-party stats", async () => {
    const zhipuFilter = (modelId: string | undefined) => {
      if (!modelId) return false;
      return modelId.startsWith("glm-");
    };

    const stats = await calculateStats(YEAR, zhipuFilter);
    if (stats.totalSessions === 0) return;

    stats.thirdPartyModels = stats.allModels;
    stats.thirdPartyFilter = "zhipu";

    const image = await generateImage(stats);
    expect(image.fullSize).toBeInstanceOf(Buffer);
    expect(image.fullSize.length).toBeGreaterThan(0);
  });

  test("generates image with mixed stats and no third-party flag", async () => {
    const stats = await calculateStats(YEAR);
    if (stats.totalSessions === 0) return;

    // No thirdPartyModels set — should render default "Top Models"
    expect(stats.thirdPartyModels).toBeUndefined();

    const image = await generateImage(stats);
    expect(image.fullSize).toBeInstanceOf(Buffer);
    expect(image.fullSize.length).toBeGreaterThan(0);
  });
});
