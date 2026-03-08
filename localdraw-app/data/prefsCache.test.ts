import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrefsMock, savePrefsMock } = vi.hoisted(() => ({
  getPrefsMock: vi.fn(),
  savePrefsMock: vi.fn(),
}));

vi.mock("./diskStorage", async () => {
  const actual =
    await vi.importActual<typeof import("./diskStorage")>("./diskStorage");

  return {
    ...actual,
    getPrefs: getPrefsMock,
    savePrefs: savePrefsMock,
  };
});

describe("prefsCache", () => {
  beforeEach(() => {
    vi.resetModules();
    getPrefsMock.mockReset();
    savePrefsMock.mockReset();
  });

  it("repairs blank provider inputs from legacy saved prefs", async () => {
    getPrefsMock.mockResolvedValue({
      theme: "dark",
      onlineModelSettings: {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "gsk-live",
        model: "llama-3.3-70b-versatile",
        apiFormat: "openai",
      },
      aiSettings: {
        mode: "online",
        onlineProvider: "groq",
        onlineProviders: {
          groq: {
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "",
            model: "",
            apiFormat: "openai",
          },
        },
      },
    });
    savePrefsMock.mockResolvedValue({});

    const { getSelectedAiProviderConfig, loadPrefsCache } = await import(
      "./prefsCache"
    );
    const prefs = await loadPrefsCache();

    expect(prefs.aiSettings.onlineProvider).toBe("groq");
    expect(prefs.aiSettings.onlineProviders.groq.apiKey).toBe("gsk-live");
    expect(prefs.aiSettings.onlineProviders.groq.model).toBe(
      "llama-3.3-70b-versatile",
    );
    expect(getSelectedAiProviderConfig()).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "gsk-live",
      model: "llama-3.3-70b-versatile",
    });
    expect(savePrefsMock).toHaveBeenCalledWith({
      aiSettings: expect.objectContaining({
        onlineProvider: "groq",
        onlineProviders: expect.objectContaining({
          groq: expect.objectContaining({
            apiKey: "gsk-live",
            model: "llama-3.3-70b-versatile",
          }),
        }),
      }),
    });
  });

  it("loads saved aiSettings provider values without dropping apiKey or model", async () => {
    getPrefsMock.mockResolvedValue({
      theme: "dark",
      defaultLibsSeeded: true,
      aiSettings: {
        mode: "offline",
        onlineProvider: "groq",
        offlineModel: {
          url: "http://localhost:11434",
          model: "llama3",
        },
        onlineProviders: {
          openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            model: "",
            apiFormat: "openai",
          },
          anthropic: {
            baseUrl: "https://api.anthropic.com/v1",
            apiKey: "",
            model: "",
            apiFormat: "anthropic",
          },
          groq: {
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "abc",
            model: "1234",
            apiFormat: "openai",
          },
          together: {
            baseUrl: "https://api.together.xyz/v1",
            apiKey: "",
            model: "",
            apiFormat: "openai",
          },
          mistral: {
            baseUrl: "https://api.mistral.ai/v1",
            apiKey: "",
            model: "",
            apiFormat: "openai",
          },
          custom: {
            baseUrl: "",
            apiKey: "",
            model: "",
            apiFormat: "openai",
          },
        },
      },
    });
    savePrefsMock.mockResolvedValue({});

    const { getSelectedAiProviderConfig, loadPrefsCache } = await import(
      "./prefsCache"
    );
    const prefs = await loadPrefsCache();

    expect(prefs.aiSettings.mode).toBe("offline");
    expect(prefs.aiSettings.onlineProvider).toBe("groq");
    expect(prefs.aiSettings.offlineModel).toEqual({
      url: "http://localhost:11434",
      model: "llama3",
    });
    expect(prefs.aiSettings.onlineProviders.groq).toEqual({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "abc",
      model: "1234",
      apiFormat: "openai",
    });
    expect(getSelectedAiProviderConfig()).toEqual({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "abc",
      model: "1234",
      apiFormat: "openai",
    });
    expect(savePrefsMock).not.toHaveBeenCalled();
  });
});
