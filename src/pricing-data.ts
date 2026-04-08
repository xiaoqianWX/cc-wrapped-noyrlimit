export interface ThirdPartyModelPricing {
  inputCostPerMToken: number;
  cachedInputCostPerMToken?: number;
  outputCostPerMToken: number;
}

// Local pricing table for third-party models not available in litellm's dataset.
// Costs are per million tokens (USD).
// Source: https://docs.z.ai/guides/overview/pricing
export const THIRD_PARTY_PRICING: Record<string, ThirdPartyModelPricing> = {
  // Zhipu AI / GLM — Text Models
  "glm-5.1": {
    inputCostPerMToken: 1.4,
    cachedInputCostPerMToken: 0.26,
    outputCostPerMToken: 4.4,
  },
  "glm-5": {
    inputCostPerMToken: 1.0,
    cachedInputCostPerMToken: 0.2,
    outputCostPerMToken: 3.2,
  },
  "glm-5-turbo": {
    inputCostPerMToken: 1.2,
    cachedInputCostPerMToken: 0.24,
    outputCostPerMToken: 4.0,
  },
  "glm-4.7": {
    inputCostPerMToken: 0.6,
    cachedInputCostPerMToken: 0.11,
    outputCostPerMToken: 2.2,
  },
  "glm-4.7-flashx": {
    inputCostPerMToken: 0.07,
    cachedInputCostPerMToken: 0.01,
    outputCostPerMToken: 0.4,
  },
  "glm-4.6": {
    inputCostPerMToken: 0.6,
    cachedInputCostPerMToken: 0.11,
    outputCostPerMToken: 2.2,
  },
  "glm-4.5": {
    inputCostPerMToken: 0.6,
    cachedInputCostPerMToken: 0.11,
    outputCostPerMToken: 2.2,
  },
  "glm-4.5-x": {
    inputCostPerMToken: 2.2,
    cachedInputCostPerMToken: 0.45,
    outputCostPerMToken: 8.9,
  },
  "glm-4.5-air": {
    inputCostPerMToken: 0.2,
    cachedInputCostPerMToken: 0.03,
    outputCostPerMToken: 1.1,
  },
  "glm-4.5-airx": {
    inputCostPerMToken: 1.1,
    cachedInputCostPerMToken: 0.22,
    outputCostPerMToken: 4.5,
  },

  // Zhipu AI / GLM — Vision Models
  "glm-5v-turbo": {
    inputCostPerMToken: 1.2,
    cachedInputCostPerMToken: 0.24,
    outputCostPerMToken: 4.0,
  },
};
