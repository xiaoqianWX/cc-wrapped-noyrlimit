import type { ModelStats } from "./types";

export interface ThirdPartyProvider {
  key: string;
  displayName: string;
  modelPrefixes: string[];
}

export const THIRD_PARTY_PROVIDERS: ThirdPartyProvider[] = [
  {
    key: "zhipu",
    displayName: "Zhipu AI",
    modelPrefixes: ["glm-"],
  },
];

export function resolveThirdPartyProvider(modelId: string | undefined): ThirdPartyProvider | null {
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  for (const provider of THIRD_PARTY_PROVIDERS) {
    if (provider.modelPrefixes.some((prefix) => lower.startsWith(prefix))) {
      return provider;
    }
  }
  return null;
}

export function isThirdPartyModel(modelId: string | undefined): boolean {
  return resolveThirdPartyProvider(modelId) !== null;
}

export function filterModelsByProvider(
  models: ModelStats[],
  providerKey?: string
): ModelStats[] {
  return models.filter((m) => {
    const provider = resolveThirdPartyProvider(m.id);
    if (!provider) return false;
    if (providerKey) return provider.key === providerKey;
    return true;
  });
}

export function getThirdPartyProviderNames(): string[] {
  return THIRD_PARTY_PROVIDERS.map((p) => p.key);
}
