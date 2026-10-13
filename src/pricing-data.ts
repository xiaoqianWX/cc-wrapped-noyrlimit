export interface LocalModelRates {
  inputCostPerMToken: number;
  cacheWriteCostPerMToken: number;
  cacheReadCostPerMToken: number;
  outputCostPerMToken: number;
}

export interface LocalModelPricing extends LocalModelRates {
  // Request-scoped tier: a request whose prompt (input + cache reads + cache writes)
  // exceeds the threshold bills every token at these rates.
  longContextPricing?: LocalModelRates & { promptTokenThreshold: number };
}

// Anthropic first-party API rates per 1M tokens (5-minute cache writes).
// https://platform.claude.com/docs/en/about-claude/pricing
// These take precedence over the LiteLLM dataset, which lags new releases.
// Claude 4.6+ (except Haiku 5.5) bill the full 1M context at standard rates.
export const LOCAL_MODEL_PRICING: Record<string, LocalModelPricing> = {
  "claude-fable-5-1": {
    inputCostPerMToken: 10,
    cacheWriteCostPerMToken: 12.5,
    cacheReadCostPerMToken: 0.25,
    outputCostPerMToken: 50,
  },
  "claude-mythos-5-1": {
    inputCostPerMToken: 10,
    cacheWriteCostPerMToken: 12.5,
    cacheReadCostPerMToken: 0.25,
    outputCostPerMToken: 50,
  },
  "claude-fable-5": {
    inputCostPerMToken: 10,
    cacheWriteCostPerMToken: 12.5,
    cacheReadCostPerMToken: 1,
    outputCostPerMToken: 50,
  },
  "claude-mythos-5": {
    inputCostPerMToken: 10,
    cacheWriteCostPerMToken: 12.5,
    cacheReadCostPerMToken: 1,
    outputCostPerMToken: 50,
  },
  "claude-opus-5-5": {
    inputCostPerMToken: 4,
    cacheWriteCostPerMToken: 5,
    cacheReadCostPerMToken: 0.2,
    outputCostPerMToken: 20,
  },
  "claude-opus-5": {
    inputCostPerMToken: 5,
    cacheWriteCostPerMToken: 6.25,
    cacheReadCostPerMToken: 0.5,
    outputCostPerMToken: 25,
  },
  "claude-opus-4-8": {
    inputCostPerMToken: 5,
    cacheWriteCostPerMToken: 6.25,
    cacheReadCostPerMToken: 0.5,
    outputCostPerMToken: 25,
  },
  "claude-opus-4-7": {
    inputCostPerMToken: 5,
    cacheWriteCostPerMToken: 6.25,
    cacheReadCostPerMToken: 0.5,
    outputCostPerMToken: 25,
  },
  "claude-opus-4-6": {
    inputCostPerMToken: 5,
    cacheWriteCostPerMToken: 6.25,
    cacheReadCostPerMToken: 0.5,
    outputCostPerMToken: 25,
  },
  "claude-sonnet-5-5": {
    inputCostPerMToken: 2,
    cacheWriteCostPerMToken: 2.5,
    cacheReadCostPerMToken: 0.1,
    outputCostPerMToken: 10,
  },
  "claude-sonnet-5": {
    inputCostPerMToken: 2,
    cacheWriteCostPerMToken: 2.5,
    cacheReadCostPerMToken: 0.2,
    outputCostPerMToken: 10,
  },
  "claude-sonnet-4-6": {
    inputCostPerMToken: 3,
    cacheWriteCostPerMToken: 3.75,
    cacheReadCostPerMToken: 0.3,
    outputCostPerMToken: 15,
  },
  "claude-haiku-5-5": {
    inputCostPerMToken: 0.1,
    cacheWriteCostPerMToken: 0.125,
    cacheReadCostPerMToken: 0.01,
    outputCostPerMToken: 0.5,
    longContextPricing: {
      promptTokenThreshold: 100_000,
      inputCostPerMToken: 0.5,
      cacheWriteCostPerMToken: 0.625,
      cacheReadCostPerMToken: 0.05,
      outputCostPerMToken: 2.5,
    },
  },
  "claude-haiku-4-5": {
    inputCostPerMToken: 1,
    cacheWriteCostPerMToken: 1.25,
    cacheReadCostPerMToken: 0.1,
    outputCostPerMToken: 5,
  },
};
