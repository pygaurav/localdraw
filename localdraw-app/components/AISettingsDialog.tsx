import React, { useEffect, useRef, useState } from "react";

import { atom, useAtom, useSetAtom } from "../app-jotai";
import { AISettings } from "../data/AISettings";
import { AI_PROVIDER_PRESETS } from "../data/aiProviders";

import { aiPreferencesDialogOpenAtom } from "./AIPreferencesDialog";

import "./AISettingsDialog.scss";

import type {
  AiMode,
  OfflineModelConfig,
} from "../data/AISettings";

type TestStatus = "idle" | "testing" | "success" | "error";

const MODE_OPTIONS: Array<{
  value: AiMode;
  label: string;
  description: string;
}> = [
  {
    value: "offline",
    label: "Offline",
    description: "Use Ollama running on this machine",
  },
  {
    value: "online",
    label: "Online",
    description: "Use a saved provider profile",
  },
];

export const aiSettingsDialogOpenAtom = atom(false);

export const AISettingsDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(aiSettingsDialogOpenAtom);
  const openAiPreferences = useSetAtom(aiPreferencesDialogOpenAtom);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);
  const [draftMode, setDraftMode] = useState<AiMode>(() => AISettings.get().mode);
  const [draftOfflineConfig, setDraftOfflineConfig] =
    useState<OfflineModelConfig>(() => AISettings.get().offlineModel);
  const [activeOnlineProvider, setActiveOnlineProvider] = useState(
    AISettings.get().onlineProvider,
  );
  const [offlineTestStatus, setOfflineTestStatus] =
    useState<TestStatus>("idle");
  const [offlineTestMessage, setOfflineTestMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const offlineAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoadingPrefs(true);

    void AISettings.refresh()
      .then((savedSettings) => {
        if (cancelled) {
          return;
        }
        setDraftMode(savedSettings.mode);
        setDraftOfflineConfig(savedSettings.offlineModel);
        setActiveOnlineProvider(savedSettings.onlineProvider);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrefs(false);
        }
      });

    setOfflineTestStatus("idle");
    setOfflineTestMessage("");
    setIsSaving(false);

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const selectedProviderPreset =
    AI_PROVIDER_PRESETS.find((preset) => preset.id === activeOnlineProvider) ??
    AI_PROVIDER_PRESETS[0];

  const close = () => {
    offlineAbortRef.current?.abort();
    setIsLoadingPrefs(false);
    setIsOpen(false);
  };

  const updateOfflineConfig = (patch: Partial<OfflineModelConfig>) => {
    setDraftOfflineConfig((current) => ({
      ...current,
      ...patch,
    }));
    setOfflineTestStatus("idle");
    setOfflineTestMessage("");
  };

  const handleSave = async () => {
    if (isLoadingPrefs) {
      return;
    }
    setIsSaving(true);
    await AISettings.set({
      mode: draftMode,
      offlineModel: draftOfflineConfig,
    });
    setIsSaving(false);
    close();
  };

  const handleOfflineTest = async () => {
    if (isLoadingPrefs) {
      return;
    }
    offlineAbortRef.current?.abort();
    const controller = new AbortController();
    offlineAbortRef.current = controller;

    setOfflineTestStatus("testing");
    setOfflineTestMessage("");

    try {
      const response = await fetch(
        `${draftOfflineConfig.url.replace(/\/$/, "")}/api/tags`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const modelCount: number = data?.models?.length ?? 0;
      setOfflineTestStatus("success");
      setOfflineTestMessage(
        modelCount > 0
          ? `Connected. ${modelCount} model${
              modelCount === 1 ? "" : "s"
            } available.`
          : "Connected. No models installed yet. Run `ollama pull <model>`.",
      );
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name === "AbortError") {
        return;
      }
      setOfflineTestStatus("error");
      setOfflineTestMessage(
        err.message?.includes("fetch") || err.message?.includes("Failed")
          ? "Cannot connect. Make sure Ollama is running (`ollama serve`)."
          : err.message ?? "Connection failed.",
      );
    }
  };

  const handleOpenPreferences = () => {
    close();
    openAiPreferences(true);
  };

  return (
    <div className="ai-settings-backdrop">
      <div
        className="ai-settings-dialog ai-settings-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            close();
          }
        }}
      >
        <div className="ai-settings-dialog__header">
          <div className="ai-settings-dialog__title-row">
            <span className="ai-settings-dialog__badge">AI</span>
            <div>
              <h2
                id="ai-settings-dialog-title"
                className="ai-settings-dialog__title"
              >
                AI Settings
              </h2>
              <p className="ai-settings-dialog__subtitle">
                Saved profiles stay on disk when you switch modes or providers.
              </p>
            </div>
          </div>
          <button
            className="ai-settings-dialog__close"
            onClick={close}
            aria-label="Close"
            type="button"
          >
            x
          </button>
        </div>

        <div className="ai-settings-dialog__body">
          <section className="ai-settings-section">
            <div className="ai-settings-section__header">
              <p className="ai-settings-section__title">Access mode</p>
              <p className="ai-settings-section__hint">
                Choose how LocalDraw should handle AI requests.
              </p>
            </div>

            <div className="ai-settings-mode-grid">
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`ai-settings-card ${
                    draftMode === option.value
                      ? "ai-settings-card--selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="aiMode"
                    value={option.value}
                    checked={draftMode === option.value}
                    onChange={() => setDraftMode(option.value)}
                    className="ai-settings-card__radio"
                    disabled={isLoadingPrefs || isSaving}
                  />
                  <span className="ai-settings-card__content">
                    <span className="ai-settings-card__label">
                      {option.label}
                    </span>
                    <span className="ai-settings-card__description">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {draftMode === "online" && (
            <section className="ai-settings-section">
              <div className="ai-settings-callout">
                <p className="ai-settings-callout__title">
                  Online mode uses your saved provider preferences
                </p>
                <p className="ai-settings-callout__copy">
                  Active provider: {selectedProviderPreset.label}. API keys,
                  base URLs, and models are managed from Preferences and reused
                  across every tab.
                </p>
              </div>

              <button
                className="ai-settings-button ai-settings-button--secondary"
                type="button"
                onClick={handleOpenPreferences}
                disabled={isLoadingPrefs || isSaving}
              >
                Open AI Provider Preferences
              </button>
            </section>
          )}

          {draftMode === "offline" && (
            <section className="ai-settings-section">
              <div className="ai-settings-section__header">
                <p className="ai-settings-section__title">Offline model</p>
                <p className="ai-settings-section__hint">
                  Local mode uses Ollama on your machine.
                </p>
              </div>

              <div className="ai-settings-field">
                <label
                  htmlFor="offline-base-url"
                  className="ai-settings-field__label"
                >
                  Ollama base URL
                </label>
                <input
                  id="offline-base-url"
                  className="ai-settings-input"
                  type="url"
                  value={draftOfflineConfig.url}
                  placeholder="http://localhost:11434"
                  onChange={(event) =>
                    updateOfflineConfig({ url: event.target.value })
                  }
                  disabled={isLoadingPrefs || isSaving}
                />
              </div>

              <div className="ai-settings-field">
                <label
                  htmlFor="offline-model"
                  className="ai-settings-field__label"
                >
                  Model name
                </label>
                <input
                  id="offline-model"
                  className="ai-settings-input"
                  type="text"
                  value={draftOfflineConfig.model}
                  placeholder="llama3"
                  onChange={(event) =>
                    updateOfflineConfig({ model: event.target.value })
                  }
                  disabled={isLoadingPrefs || isSaving}
                />
                <span className="ai-settings-field__hint">
                  Install the model locally first, for example{" "}
                  <code>ollama pull llama3.2-vision</code>. Diagram-to-code
                  works best with a vision-capable model.
                </span>
              </div>

              <div className="ai-settings-test">
                <button
                  className="ai-settings-button ai-settings-button--secondary"
                  type="button"
                  onClick={handleOfflineTest}
                  disabled={isLoadingPrefs || isSaving || offlineTestStatus === "testing"}
                >
                  {offlineTestStatus === "testing"
                    ? "Testing..."
                    : "Test connection"}
                </button>

                {offlineTestStatus !== "idle" &&
                  offlineTestStatus !== "testing" && (
                    <p
                      className={`ai-settings-test__message ai-settings-test__message--${offlineTestStatus}`}
                    >
                      {offlineTestMessage}
                    </p>
                  )}
              </div>
            </section>
          )}
        </div>

        <div className="ai-settings-dialog__footer">
          <button
            className="ai-settings-button ai-settings-button--ghost"
            type="button"
            onClick={close}
            disabled={isSaving || isLoadingPrefs}
          >
            Cancel
          </button>
          <button
            className="ai-settings-button ai-settings-button--primary"
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoadingPrefs}
          >
            {isLoadingPrefs ? "Loading..." : isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
