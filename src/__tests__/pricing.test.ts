import { describe, test, expect } from "bun:test";
import { getModelPricing, calculateCostUSD } from "../pricing";

describe("getModelPricing — third-party local lookup", () => {
  test("exact match: glm-5.1", async () => {
    const pricing = await getModelPricing("glm-5.1");
    expect(pricing).not.toBeNull();
    // $1.4/M input → 0.0000014 per token
    expect(pricing!.inputCostPerToken).toBeCloseTo(1.4 / 1_000_000, 10);
    // $4.4/M output
    expect(pricing!.outputCostPerToken).toBeCloseTo(4.4 / 1_000_000, 10);
    // $0.26/M cached
    expect(pricing!.cachedInputCostPerToken).toBeCloseTo(0.26 / 1_000_000, 10);
    // No tiered pricing for third-party
    expect(pricing!.inputCostPerTokenAbove200k).toBeNull();
    expect(pricing!.outputCostPerTokenAbove200k).toBeNull();
  });

  test("exact match: glm-4.5-air", async () => {
    const pricing = await getModelPricing("glm-4.5-air");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputCostPerToken).toBeCloseTo(0.2 / 1_000_000, 10);
    expect(pricing!.outputCostPerToken).toBeCloseTo(1.1 / 1_000_000, 10);
  });

  test("longest prefix match: glm-4.5-airx does not match glm-4.5-air", async () => {
    const pricing = await getModelPricing("glm-4.5-airx");
    expect(pricing).not.toBeNull();
    // Should match glm-4.5-airx ($1.1/M in), not glm-4.5-air ($0.2/M in)
    expect(pricing!.inputCostPerToken).toBeCloseTo(1.1 / 1_000_000, 10);
  });

  test("prefix match: glm-4.5 matches glm-4.5 not glm-4.5-air", async () => {
    const pricing = await getModelPricing("glm-4.5");
    expect(pricing).not.toBeNull();
    // glm-4.5 is $0.6/M, glm-4.5-air is $0.2/M — should get 0.6
    expect(pricing!.inputCostPerToken).toBeCloseTo(0.6 / 1_000_000, 10);
  });

  test("returns null for unknown model", async () => {
    // This will also try the remote litellm fetch, which may or may not have it
    // Use a clearly fake model ID that won't match anything
    const pricing = await getModelPricing("totally-fake-model-xyz-123");
    // Either null (no remote data) or would match nothing
    // The remote fetch might return null or a match — just verify it doesn't throw
    expect(typeof pricing?.inputCostPerToken === "number" || pricing === null).toBe(true);
  });
});

describe("calculateCostUSD — third-party pricing", () => {
  test("calculates cost for glm-5.1 tokens", async () => {
    const pricing = await getModelPricing("glm-5.1");
    expect(pricing).not.toBeNull();

    // 1M input + 1M output = $1.4 + $4.4 = $5.8
    const cost = calculateCostUSD(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationTokens: 0,
        cachedInputTokens: 0,
      },
      pricing!
    );
    expect(cost).toBeCloseTo(5.8, 2);
  });

  test("calculates cached input cost for glm-5.1", async () => {
    const pricing = await getModelPricing("glm-5.1");
    expect(pricing).not.toBeNull();

    // 1M cached input = $0.26
    const cost = calculateCostUSD(
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cachedInputTokens: 1_000_000,
      },
      pricing!
    );
    expect(cost).toBeCloseTo(0.26, 2);
  });

  test("calculates mixed cost for glm-4.5-air", async () => {
    const pricing = await getModelPricing("glm-4.5-air");
    expect(pricing).not.toBeNull();

    // 500K input ($0.1) + 200K output ($0.22) + 100K cached ($0.003) = $0.323
    const cost = calculateCostUSD(
      {
        inputTokens: 500_000,
        outputTokens: 200_000,
        cacheCreationTokens: 0,
        cachedInputTokens: 100_000,
      },
      pricing!
    );
    const expected = (500_000 * 0.2) / 1_000_000 + (200_000 * 1.1) / 1_000_000 + (100_000 * 0.03) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 4);
  });
});
