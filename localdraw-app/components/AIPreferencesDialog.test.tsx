import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Provider, appJotaiStore } from "../app-jotai";
import { aiPreferencesDialogOpenAtom, AIPreferencesDialog } from "./AIPreferencesDialog";

const { refreshMock, getMock, setMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  getMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock("../data/AISettings", () => ({
  AISettings: {
    refresh: refreshMock,
    get: getMock,
    set: setMock,
  },
}));

describe("AIPreferencesDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    getMock.mockReset();
    setMock.mockReset();
    appJotaiStore.set(aiPreferencesDialogOpenAtom, true);

    getMock.mockReturnValue({
      mode: "offline",
      onlineProvider: "openai",
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
          apiKey: "",
          model: "",
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
    });

    refreshMock.mockResolvedValue({
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
    });
  });

  it("populates inputs from refreshed provider preferences", async () => {
    render(
      <Provider store={appJotaiStore}>
        <AIPreferencesDialog />
      </Provider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Model name")).toHaveValue("1234"),
    );

    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://api.groq.com/openai/v1",
    );
    expect(screen.getByLabelText("API key")).toHaveValue("abc");
  });
});
