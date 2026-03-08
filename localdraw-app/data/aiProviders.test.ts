import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_SETTINGS,
  detectAiProviderId,
  getFirstConfiguredOnlineProvider,
  mergeAiSettings,
  normalizeAiMode,
} from "./aiProviders";

describe("aiProviders", () => {
  it("keeps separate saved configs for each online provider", () => {
    const withGroq = mergeAiSettings(DEFAULT_AI_SETTINGS, {
      mode: "online",
      onlineProvider: "groq",
      onlineProviders: {
        groq: {
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: "gsk-test",
          model: "llama-3.3-70b-versatile",
        },
      },
    });

    const withOpenAI = mergeAiSettings(withGroq, {
      onlineProvider: "openai",
      onlineProviders: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-openai",
          model: "gpt-4o",
        },
      },
    });

    expect(withOpenAI.onlineProviders.groq.apiKey).toBe("gsk-test");
    expect(withOpenAI.onlineProviders.groq.model).toBe(
      "llama-3.3-70b-versatile",
    );
    expect(withOpenAI.onlineProviders.openai.apiKey).toBe("sk-openai");
    expect(withOpenAI.onlineProviders.openai.model).toBe("gpt-4o");
  });

  it("detects provider presets and preserves fixed API formats", () => {
    expect(
      detectAiProviderId({ baseUrl: "https://api.groq.com/openai/v1" }),
    ).toBe("groq");

    const merged = mergeAiSettings(DEFAULT_AI_SETTINGS, {
      onlineProvider: "anthropic",
      onlineProviders: {
        anthropic: {
          apiFormat: "openai",
          model: "claude-3-5-sonnet-20241022",
        },
        custom: {
          apiFormat: "anthropic",
          baseUrl: "https://proxy.example/v1",
          model: "claude-proxy",
        },
      },
    });

    expect(merged.onlineProviders.anthropic.apiFormat).toBe("anthropic");
    expect(merged.onlineProviders.custom.apiFormat).toBe("anthropic");
  });

  it("maps legacy default mode to offline when cloud mode is removed", () => {
    expect(normalizeAiMode("default")).toBe("offline");
    expect(normalizeAiMode("ollama")).toBe("offline");
    expect(normalizeAiMode("default", "online")).toBe("online");
  });

  it("finds the first provider with saved online config", () => {
    const settings = mergeAiSettings(DEFAULT_AI_SETTINGS, {
      onlineProviders: {
        groq: {
          baseUrl: "https://api.groq.com/openai/v1",
          model: "llama-3.3-70b-versatile",
          apiKey: "gsk-123",
        },
      },
    });

    expect(getFirstConfiguredOnlineProvider(settings.onlineProviders)).toBe(
      "groq",
    );
  });
});
