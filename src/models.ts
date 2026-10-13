interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface ProviderInfo {
  id: string;
  name: string;
}

interface ModelsDevData {
  models: Record<string, ModelInfo>;
  providers: Record<string, ProviderInfo>;
}

// Cache for the fetched data
let cachedData: ModelsDevData | null = null;

export async function fetchModelsData(): Promise<ModelsDevData> {
  if (cachedData) {
    return cachedData;
  }

  try {
    const response = await fetch("https://models.dev/api.json", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const models: Record<string, ModelInfo> = {};
    const providers: Record<string, ProviderInfo> = {};

    if (data && typeof data === "object") {
      for (const [providerId, providerData] of Object.entries(data)) {
        if (!providerData || typeof providerData !== "object") continue;

        const pd = providerData as { name?: string; models?: Record<string, { name?: string }> };

        if (pd.name) {
          providers[providerId] = {
            id: providerId,
            name: pd.name,
          };
        }

        if (pd.models && typeof pd.models === "object") {
          for (const [modelId, modelData] of Object.entries(pd.models)) {
            if (modelData && typeof modelData === "object" && modelData.name) {
              models[modelId] = {
                id: modelId,
                name: modelData.name,
                provider: providerId,
              };
            }
          }
        }
      }
    }

    cachedData = { models, providers };
    return cachedData;
  } catch (error) {
    console.warn("Failed to fetch models.dev data, using fallbacks");
    cachedData = { models: {}, providers: {} };
    return cachedData;
  }
}

// Claude Code tags context-window variants as e.g. `claude-opus-5-5[1m]`; they bill and
// display as the base model.
export function normalizeModelId(modelId: string): string {
  return modelId.trim().replace(/\[[^\]]*\]$/, "");
}

export function getModelDisplayName(modelId: string): string {
  if (!cachedData) {
    console.warn("Models data not prefetched, using fallback formatting");
    return formatModelIdAsName(modelId);
  }

  if (cachedData.models[modelId]?.name) {
    return cachedData.models[modelId].name;
  }

  return formatModelIdAsName(modelId);
}

export function getModelProvider(modelId: string): string {
  if (!cachedData) {
    console.warn("Models data not prefetched");
    return "unknown";
  }

  if (cachedData.models[modelId]?.provider) {
    return cachedData.models[modelId].provider;
  }

  return "unknown";
}

export function getProviderDisplayName(providerId: string): string {
  if (cachedData?.providers[providerId]?.name) {
    return cachedData.providers[providerId].name;
  }

  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export function getProviderLogoUrl(providerId: string): string {
  return `https://models.dev/logos/${providerId}.svg`;
}

function formatModelIdAsName(modelId: string): string {
  const words: string[] = [];
  for (const part of modelId.replace(/-\d{8}$/, "").split(/[-_]/)) {
    const previous = words[words.length - 1];
    // Join version segments: claude-opus-5-5 -> "Claude Opus 5.5"
    if (/^\d{1,2}$/.test(part) && previous && /^\d+(\.\d+)*$/.test(previous)) {
      words[words.length - 1] = `${previous}.${part}`;
      continue;
    }
    words.push(/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1));
  }
  return words.join(" ");
}

export const __testing = {
  resetModelsCache(): void {
    cachedData = null;
  },
};
