import { LOCAL_MODEL_PRICING, type LocalModelPricing } from "./pricing-data";

export interface ModelPricing {
  inputCostPerMToken: number;
  cachedInputCostPerMToken: number;
  cacheCreationCostPerMToken: number;
  outputCostPerMToken: number;
}

export interface TokenUsageTotals {
  inputTokens: number;
  cacheCreationTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const MILLION = 1_000_000;

const PROVIDER_PREFIXES = [
  "anthropic/",
  "bedrock/",
  "vertex_ai/",
  "openrouter/anthropic/",
];
const MODEL_ALIASES = new Map<string, string>([
  // Opus family
  ["claude-opus-4-6", "claude-opus-4-6"],
  ["claude-opus-4-5", "claude-opus-4-5-20251101"],
  ["claude-opus-4-1", "claude-opus-4-1-20250805"],
  ["claude-opus-4", "claude-opus-4-20250514"],
  ["claude-opus-4-0", "claude-opus-4-20250514"],
  // Sonnet family
  ["claude-sonnet-4-6", "claude-sonnet-4-6"],
  ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929"],
  ["claude-sonnet-4", "claude-sonnet-4-20250514"],
  ["claude-sonnet-4-0", "claude-sonnet-4-20250514"],
  // Haiku family
  ["claude-haiku-4-5", "claude-haiku-4-5-20251001"],
  // Legacy aliases
  ["claude-3.5-sonnet", "claude-3-5-sonnet-20241022"],
  ["claude-3.5-haiku", "claude-3-5-haiku-20241022"],
  ["claude-3-opus", "claude-3-opus-20240229"],
  ["claude-3-sonnet", "claude-3-sonnet-20240229"],
  ["claude-3-haiku", "claude-3-haiku-20240307"],
]);

const LOCAL_PRICING_MAP = new Map<string, LocalModelPricing>(Object.entries(LOCAL_MODEL_PRICING));

export async function getModelPricing(model: string): Promise<ModelPricing | null> {
  const candidates = createCandidates(model);
  for (const candidate of candidates) {
    const record = LOCAL_PRICING_MAP.get(candidate);
    if (record) {
      return normalizePricing(record);
    }
  }

  return null;
}

export function calculateCostUSD(usage: TokenUsageTotals, pricing: ModelPricing): number {
  const inputTokens = Math.max(usage.inputTokens, 0);
  const outputTokens = Math.max(usage.outputTokens, 0);
  const cacheCreationTokens = Math.max(usage.cacheCreationTokens, 0);
  const cacheReadTokens = Math.max(usage.cachedInputTokens, 0);

  const inputCost = (inputTokens / MILLION) * pricing.inputCostPerMToken;
  const outputCost = (outputTokens / MILLION) * pricing.outputCostPerMToken;
  const cacheCreationCost = (cacheCreationTokens / MILLION) * pricing.cacheCreationCostPerMToken;
  const cacheReadCost = (cacheReadTokens / MILLION) * pricing.cachedInputCostPerMToken;

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}

function createCandidates(model: string): string[] {
  const candidates = new Set<string>();
  const normalizedModel = stripProviderPrefix(model);
  const modelVariants = new Set([model, normalizedModel]);

  for (const variant of modelVariants) {
    candidates.add(variant);

    const alias = MODEL_ALIASES.get(variant);
    if (alias) {
      candidates.add(alias);
    }

    for (const prefix of PROVIDER_PREFIXES) {
      candidates.add(`${prefix}${variant}`);
      if (alias) {
        candidates.add(`${prefix}${alias}`);
      }
    }
  }

  return Array.from(candidates);
}

function stripProviderPrefix(model: string): string {
  for (const prefix of PROVIDER_PREFIXES) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

function normalizePricing(record: LocalModelPricing): ModelPricing {
  return {
    inputCostPerMToken: record.inputCostPerMToken,
    cachedInputCostPerMToken: record.cachedInputCostPerMToken ?? record.inputCostPerMToken * 0.1,
    cacheCreationCostPerMToken: record.cacheCreationCostPerMToken ?? record.inputCostPerMToken * 1.25,
    outputCostPerMToken: record.outputCostPerMToken,
  };
}
