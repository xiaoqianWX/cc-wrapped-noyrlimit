export interface LocalModelPricing {
  inputCostPerMToken: number;
  cachedInputCostPerMToken?: number;
  cacheCreationCostPerMToken?: number;
  outputCostPerMToken: number;
}

// Maintained pricing table.
// Add/update entries here when model pricing changes.
// Pricing from: https://platform.claude.com/docs/en/about-claude/pricing
export const LOCAL_MODEL_PRICING: Record<string, LocalModelPricing> = {
  // Claude Opus 4.6 — $5/$25, cache write 1.25x, cache read 0.1x
  "claude-opus-4-6": {
    inputCostPerMToken: 5,
    cachedInputCostPerMToken: 0.5,
    cacheCreationCostPerMToken: 6.25,
    outputCostPerMToken: 25,
  },

  // Claude Opus 4.5 — $5/$25
  "claude-opus-4-5-20251101": {
    inputCostPerMToken: 5,
    cachedInputCostPerMToken: 0.5,
    cacheCreationCostPerMToken: 6.25,
    outputCostPerMToken: 25,
  },

  // Claude Opus 4.1 — $15/$75
  "claude-opus-4-1-20250805": {
    inputCostPerMToken: 15,
    cachedInputCostPerMToken: 1.5,
    cacheCreationCostPerMToken: 18.75,
    outputCostPerMToken: 75,
  },

  // Claude Opus 4 — $15/$75
  "claude-opus-4-20250514": {
    inputCostPerMToken: 15,
    cachedInputCostPerMToken: 1.5,
    cacheCreationCostPerMToken: 18.75,
    outputCostPerMToken: 75,
  },

  // Claude Sonnet 4.6 — $3/$15
  "claude-sonnet-4-6": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },

  // Claude Sonnet 4.5 — $3/$15
  "claude-sonnet-4-5-20250929": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },

  // Claude Sonnet 4 — $3/$15
  "claude-sonnet-4-20250514": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },

  // Claude Haiku 4.5 — $1/$5
  "claude-haiku-4-5-20251001": {
    inputCostPerMToken: 1,
    cachedInputCostPerMToken: 0.1,
    cacheCreationCostPerMToken: 1.25,
    outputCostPerMToken: 5,
  },

  // Claude 3.5 Haiku — $0.80/$4
  "claude-3-5-haiku-20241022": {
    inputCostPerMToken: 0.8,
    cachedInputCostPerMToken: 0.08,
    cacheCreationCostPerMToken: 1,
    outputCostPerMToken: 4,
  },

  // Claude 3.5 Sonnet — $3/$15
  "claude-3-5-sonnet-20241022": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },
  "claude-3-5-sonnet-20240620": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },

  // Claude 3 Opus (deprecated) — $15/$75
  "claude-3-opus-20240229": {
    inputCostPerMToken: 15,
    cachedInputCostPerMToken: 1.5,
    cacheCreationCostPerMToken: 18.75,
    outputCostPerMToken: 75,
  },

  // Claude 3 Sonnet — $3/$15
  "claude-3-sonnet-20240229": {
    inputCostPerMToken: 3,
    cachedInputCostPerMToken: 0.3,
    cacheCreationCostPerMToken: 3.75,
    outputCostPerMToken: 15,
  },

  // Claude 3 Haiku (deprecated) — $0.25/$1.25
  "claude-3-haiku-20240307": {
    inputCostPerMToken: 0.25,
    cachedInputCostPerMToken: 0.03,
    cacheCreationCostPerMToken: 0.3,
    outputCostPerMToken: 1.25,
  },
};
