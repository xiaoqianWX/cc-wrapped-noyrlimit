import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __testing as pricingTesting,
  calculateCostUSD,
  getModelPricing,
  type ModelPricing,
} from "../pricing";
import {
  PRICING_URL,
  installFetchMock,
  jsonResponse,
} from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];

function registerCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

beforeEach(() => {
  pricingTesting.resetPricingCache();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }

  pricingTesting.resetPricingCache();
});

describe("getModelPricing", () => {
  test("matches exact model IDs and provider-prefixed aliases", async () => {
    registerCleanup(
      installFetchMock((url) => {
        expect(url).toBe(PRICING_URL);

        return jsonResponse({
          "gpt-4o": {
            input_cost_per_token: 0.1,
            output_cost_per_token: 0.2,
          },
          "anthropic/claude-opus-4-20250514": {
            input_cost_per_token: 0.3,
            output_cost_per_token: 0.4,
            cache_creation_input_token_cost: 0.5,
            cache_read_input_token_cost: 0.6,
          },
        });
      })
    );

    await expect(getModelPricing("gpt-4o")).resolves.toEqual({
      inputCostPerToken: 0.1,
      inputCostPerTokenAbove200k: null,
      cacheCreationCostPerToken: 0,
      cacheCreationCostPerTokenAbove200k: null,
      cachedInputCostPerToken: 0,
      cachedInputCostPerTokenAbove200k: null,
      outputCostPerToken: 0.2,
      outputCostPerTokenAbove200k: null,
    });

    await expect(getModelPricing("claude-opus-4")).resolves.toEqual({
      inputCostPerToken: 0.3,
      inputCostPerTokenAbove200k: null,
      cacheCreationCostPerToken: 0.5,
      cacheCreationCostPerTokenAbove200k: null,
      cachedInputCostPerToken: 0.6,
      cachedInputCostPerTokenAbove200k: null,
      outputCostPerToken: 0.4,
      outputCostPerTokenAbove200k: null,
    });
  });

  test("returns null for unknown models instead of doing substring guesses", async () => {
    registerCleanup(
      installFetchMock((url) => {
        expect(url).toBe(PRICING_URL);

        return jsonResponse({
          "gpt-4o-mini": {
            input_cost_per_token: 1,
          },
        });
      })
    );

    await expect(getModelPricing("gpt-4o")).resolves.toBeNull();
  });

  test("returns null when the pricing dataset fetch fails", async () => {
    registerCleanup(
      installFetchMock((url) => {
        expect(url).toBe(PRICING_URL);
        return new Response("boom", { status: 503 });
      })
    );

    await expect(getModelPricing("gpt-4o")).resolves.toBeNull();
  });

  test.each([
    ["claude-fable-5-1", [10, 12.5, 0.25, 50]],
    ["claude-opus-5-5", [4, 5, 0.2, 20]],
    ["claude-opus-5-5[1m]", [4, 5, 0.2, 20]],
    ["claude-opus-5", [5, 6.25, 0.5, 25]],
    ["claude-sonnet-5-5", [2, 2.5, 0.1, 10]],
    ["claude-sonnet-5", [2, 2.5, 0.2, 10]],
    ["claude-haiku-5-5", [0.1, 0.125, 0.01, 0.5]],
    ["claude-haiku-4-5-20251001", [1, 1.25, 0.1, 5]],
  ])("prices %s from the local table without fetching", async (model, rates) => {
    registerCleanup(
      installFetchMock(() => {
        throw new Error("local pricing should not fetch");
      })
    );

    const pricing = await getModelPricing(model);
    const [input, cacheWrite, cacheRead, output] = rates.map((rate) => rate / 1_000_000);

    expect(pricing?.inputCostPerToken).toBeCloseTo(input, 15);
    expect(pricing?.cacheCreationCostPerToken).toBeCloseTo(cacheWrite, 15);
    expect(pricing?.cachedInputCostPerToken).toBeCloseTo(cacheRead, 15);
    expect(pricing?.outputCostPerToken).toBeCloseTo(output, 15);
  });
});

describe("calculateCostUSD", () => {
  test("bills a whole Haiku 5.5 request at the higher rates once its prompt exceeds 100K", async () => {
    const pricing = await getModelPricing("claude-haiku-5-5");
    if (!pricing) throw new Error("missing Haiku 5.5 pricing");

    const atThreshold = calculateCostUSD(
      { inputTokens: 10_000, cacheCreationTokens: 10_000, cachedInputTokens: 80_000, outputTokens: 1_000 },
      pricing
    );
    const overThreshold = calculateCostUSD(
      { inputTokens: 10_001, cacheCreationTokens: 10_000, cachedInputTokens: 80_000, outputTokens: 1_000 },
      pricing
    );

    expect(atThreshold).toBeCloseTo((10_000 * 0.1 + 10_000 * 0.125 + 80_000 * 0.01 + 1_000 * 0.5) / 1e6, 12);
    expect(overThreshold).toBeCloseTo((10_001 * 0.5 + 10_000 * 0.625 + 80_000 * 0.05 + 1_000 * 2.5) / 1e6, 12);
  });

  test("applies 200k tier thresholds independently per token bucket", () => {
    const pricing: ModelPricing = {
      inputCostPerToken: 1,
      inputCostPerTokenAbove200k: 0.5,
      cacheCreationCostPerToken: 2,
      cacheCreationCostPerTokenAbove200k: 1,
      cachedInputCostPerToken: 3,
      cachedInputCostPerTokenAbove200k: 1.5,
      outputCostPerToken: 4,
      outputCostPerTokenAbove200k: 2,
    };

    const cost = calculateCostUSD(
      {
        inputTokens: 250_000,
        outputTokens: 300_000,
        cacheCreationTokens: 210_000,
        cachedInputTokens: 50_000,
      },
      pricing
    );

    expect(cost).toBe(
      200_000 * 1 +
        50_000 * 0.5 +
        200_000 * 4 +
        100_000 * 2 +
        200_000 * 2 +
        10_000 * 1 +
        50_000 * 3
    );
  });

  test("clamps negative token counts to zero", () => {
    const pricing: ModelPricing = {
      inputCostPerToken: 1,
      inputCostPerTokenAbove200k: null,
      cacheCreationCostPerToken: 1,
      cacheCreationCostPerTokenAbove200k: null,
      cachedInputCostPerToken: 1,
      cachedInputCostPerTokenAbove200k: null,
      outputCostPerToken: 1,
      outputCostPerTokenAbove200k: null,
    };

    const cost = calculateCostUSD(
      {
        inputTokens: -10,
        outputTokens: 5,
        cacheCreationTokens: -20,
        cachedInputTokens: -1,
      },
      pricing
    );

    expect(cost).toBe(5);
  });
});
