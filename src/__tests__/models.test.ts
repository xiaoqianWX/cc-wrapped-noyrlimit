import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __testing as modelsTesting,
  fetchModelsData,
  getModelDisplayName,
  getModelProvider,
  getProviderDisplayName,
  getProviderLogoUrl,
} from "../models";
import { MODELS_DEV_URL, installFetchMock, jsonResponse } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];

function registerCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

beforeEach(() => {
  modelsTesting.resetModelsCache();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }

  modelsTesting.resetModelsCache();
});

describe("models metadata", () => {
  test("parses and caches models.dev data", async () => {
    let fetchCalls = 0;

    registerCleanup(
      installFetchMock((url) => {
        fetchCalls += 1;
        expect(url).toBe(MODELS_DEV_URL);

        return jsonResponse({
          anthropic: {
            name: "Anthropic",
            models: {
              "claude-sonnet-4": {
                name: "Claude Sonnet 4",
              },
            },
          },
          openai: {
            name: "OpenAI",
            models: {
              "gpt-4o": {
                name: "GPT-4o",
              },
            },
          },
        });
      })
    );

    const first = await fetchModelsData();
    const second = await fetchModelsData();

    expect(fetchCalls).toBe(1);
    expect(first).toEqual(second);
    expect(getModelDisplayName("claude-sonnet-4")).toBe("Claude Sonnet 4");
    expect(getModelProvider("gpt-4o")).toBe("openai");
    expect(getProviderDisplayName("anthropic")).toBe("Anthropic");
    expect(getProviderLogoUrl("openai")).toBe("https://models.dev/logos/openai.svg");
  });

  test("falls back to formatted names when metadata is unavailable", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    registerCleanup(() => {
      console.warn = originalWarn;
    });

    registerCleanup(
      installFetchMock((url) => {
        expect(url).toBe(MODELS_DEV_URL);
        return new Response("unavailable", { status: 500 });
      })
    );

    await expect(fetchModelsData()).resolves.toEqual({ models: {}, providers: {} });
    expect(getModelDisplayName("claude-sonnet-4")).toBe("Claude Sonnet 4");
    expect(getModelProvider("claude-sonnet-4")).toBe("unknown");
    expect(getProviderDisplayName("custom-provider")).toBe("Custom-provider");
  });
});
