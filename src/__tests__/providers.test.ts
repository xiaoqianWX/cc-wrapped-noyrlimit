import { describe, test, expect } from "bun:test";
import {
  resolveThirdPartyProvider,
  isThirdPartyModel,
  filterModelsByProvider,
  getThirdPartyProviderNames,
} from "../providers";
import type { ModelStats } from "../types";

describe("resolveThirdPartyProvider", () => {
  test("resolves glm-5.1 to zhipu", () => {
    const provider = resolveThirdPartyProvider("glm-5.1");
    expect(provider).not.toBeNull();
    expect(provider!.key).toBe("zhipu");
    expect(provider!.displayName).toBe("Zhipu AI");
  });

  test("resolves glm-4.5-air to zhipu", () => {
    const provider = resolveThirdPartyProvider("glm-4.5-air");
    expect(provider).not.toBeNull();
    expect(provider!.key).toBe("zhipu");
  });

  test("resolves glm-4.7 to zhipu", () => {
    expect(resolveThirdPartyProvider("glm-4.7")!.key).toBe("zhipu");
  });

  test("returns null for Anthropic models", () => {
    expect(resolveThirdPartyProvider("claude-opus-4-6")).toBeNull();
    expect(resolveThirdPartyProvider("claude-haiku-4-5-20251001")).toBeNull();
  });

  test("returns null for OpenAI models", () => {
    expect(resolveThirdPartyProvider("gpt-4o")).toBeNull();
  });

  test("returns null for unknown models", () => {
    expect(resolveThirdPartyProvider("unknown-model")).toBeNull();
  });
});

describe("isThirdPartyModel", () => {
  test("returns true for GLM models", () => {
    expect(isThirdPartyModel("glm-5.1")).toBe(true);
    expect(isThirdPartyModel("glm-4.5-air")).toBe(true);
    expect(isThirdPartyModel("glm-4.7")).toBe(true);
  });

  test("returns false for Anthropic models", () => {
    expect(isThirdPartyModel("claude-opus-4-6")).toBe(false);
    expect(isThirdPartyModel("claude-sonnet-4-6")).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isThirdPartyModel(undefined as any)).toBe(false);
  });
});

describe("filterModelsByProvider", () => {
  const models: ModelStats[] = [
    { id: "glm-5.1", name: "GLM 5.1", providerId: "zhipu", count: 5000, percentage: 50 },
    { id: "glm-4.5-air", name: "GLM 4.5 Air", providerId: "zhipu", count: 2000, percentage: 20 },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", providerId: "anthropic", count: 3000, percentage: 30 },
  ];

  test("filters to all third-party when no provider specified", () => {
    const result = filterModelsByProvider(models);
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.providerId === "zhipu")).toBe(true);
  });

  test("filters to specific provider", () => {
    const result = filterModelsByProvider(models, "zhipu");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("glm-5.1");
    expect(result[1].id).toBe("glm-4.5-air");
  });

  test("returns empty for provider with no matches", () => {
    const result = filterModelsByProvider(models, "nonexistent");
    expect(result).toHaveLength(0);
  });

  test("returns empty for empty input", () => {
    expect(filterModelsByProvider([])).toHaveLength(0);
  });
});

describe("getThirdPartyProviderNames", () => {
  test("includes zhipu", () => {
    const names = getThirdPartyProviderNames();
    expect(names).toContain("zhipu");
  });
});
