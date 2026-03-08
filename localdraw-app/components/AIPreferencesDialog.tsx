import React, { useEffect, useRef, useState } from "react";

import { atom, useAtom } from "../app-jotai";
import { DISK_STORAGE_SERVER_URL } from "../app_constants";
import { AISettings } from "../data/AISettings";
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_PROVIDER_CONFIGS,
  getFirstConfiguredOnlineProvider,
  hasConfiguredProviderConfig,
} from "../data/aiProviders";

import "./AISettingsDialog.scss";

import type {
  AiProviderConfig,
  AiProviderId,
  AiSettings as AiSettingsShape,
} from "../data/AISettings";

type TestStatus = "idle" | "testing" | "success" | "error";

const getSelectedOnlineConfig = (
  settings: AiSettingsShape,
): AiProviderConfig => settings.onlineProviders[settings.onlineProvider];

const getApiFormatLabel = (config: AiProviderConfig) =>
  config.apiFormat === "anthropic"
    ? "Anthropic Messages API"
    : "OpenAI-compatible API";

export const aiPreferencesDialogOpenAtom = atom(false);

export const AIPreferencesDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(aiPreferencesDialogOpenAtom);
  const [draftSettings, setDraftSettings] = useState<AiSettingsShape>(() =>
    AISettings.get(),
  );
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);
  const [onlineTestStatus, setOnlineTestStatus] = useState<TestStatus>("idle");
  const [onlineTestMessage, setOnlineTestMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const onlineAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    setIsLoadingPrefs(true);
    setOnlineTestStatus("idle");
    setOnlineTestMessage("");
    setIsSaving(false);

    void AISettings.refresh()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const firstConfiguredProvider = getFirstConfiguredOnlineProvider(
          settings.onlineProviders,
        );
        const shouldSwitchProvider =
          firstConfiguredProvider &&
          !hasConfiguredProviderConfig(
            settings.onlineProviders[settings.onlineProvider],
          );

        setDraftSettings({
          ...settings,
          onlineProvider: shouldSwitchProvider
            ? firstConfiguredProvider
            : settings.onlineProvider,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrefs(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const selectedProviderPreset =
    AI_PROVIDER_PRESETS.find(
      (preset) => preset.id === draftSettings.onlineProvider,
    ) ?? AI_PROVIDER_PRESETS[0];
  const onlineConfig = getSelectedOnlineConfig(draftSettings);

  const close = () => {
    onlineAbortRef.current?.abort();
    setIsLoadingPrefs(false);
    setIsOpen(false);
  };

  const selectOnlineProvider = (provider: AiProviderId) => {
    setDraftSettings((current) => ({
      ...current,
      onlineProvider: provider,
    }));
    setOnlineTestStatus("idle");
    setOnlineTestMessage("");
  };

  const updateOnlineConfig = (patch: Partial<AiProviderConfig>) => {
    setDraftSettings((current) => ({
      ...current,
      onlineProviders: {
        ...current.onlineProviders,
        [current.onlineProvider]: {
          ...current.onlineProviders[current.onlineProvider],
          ...patch,
          ...(current.onlineProvider === "custom"
            ? {}
            : {
                apiFormat:
                  DEFAULT_AI_PROVIDER_CONFIGS[current.onlineProvider].apiFormat,
              }),
        },
      },
    }));
    setOnlineTestStatus("idle");
    setOnlineTestMessage("");
  };

  const handleSave = async () => {
    if (isLoadingPrefs) {
      return;
    }
    setIsSaving(true);
    await AISettings.set({
      onlineProvider: draftSettings.onlineProvider,
      onlineProviders: draftSettings.onlineProviders,
    });
    setIsSaving(false);
    close();
  };

  const handleOnlineTest = async () => {
    if (isLoadingPrefs) {
      return;
    }
    onlineAbortRef.current?.abort();
    const controller = new AbortController();
    onlineAbortRef.current = controller;

    if (!onlineConfig.baseUrl.trim()) {
      setOnlineTestStatus("error");
      setOnlineTestMessage("Base URL is required.");
      return;
    }

    if (!onlineConfig.model.trim()) {
      setOnlineTestStatus("error");
      setOnlineTestMessage("Model name is required.");
      return;
    }

    setOnlineTestStatus("testing");
    setOnlineTestMessage("");

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch(`${DISK_STORAGE_SERVER_URL}/api/ai/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider:
            onlineConfig.apiFormat === "anthropic" ? "anthropic" : "openai",
          baseUrl: onlineConfig.baseUrl,
          apiKey: onlineConfig.apiKey,
          model: onlineConfig.model,
          messages: [{ role: "user", content: "Say hi in one word." }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errMsg = `Server returned ${response.status}`;
        try {
          const errBody = (await response.json()) as Record<string, unknown>;
          if (typeof errBody.error === "string") {
            errMsg = errBody.error;
          }
        } catch {
          // ignore malformed error bodies
        }
        throw new Error(errMsg);
      }

      reader = response.body?.getReader() ?? null;
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let gotContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const text = decoder.decode(value, { stream: true });

        if (text.includes('"error"')) {
          const match = /"error"\s*:\s*"([^"]+)"/.exec(text);
          if (match) {
            throw new Error(match[1]);
          }
        }

        if (text.includes('"chunk"') || text.includes("[DONE]")) {
          gotContent = true;
          await reader.cancel();
          break;
        }
      }

      if (!gotContent) {
        throw new Error("Model did not return any output.");
      }

      setOnlineTestStatus("success");
      setOnlineTestMessage(
        `Connected. ${selectedProviderPreset.label} is responding with "${onlineConfig.model}".`,
      );
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name === "AbortError") {
        return;
      }
      setOnlineTestStatus("error");
      setOnlineTestMessage(err.message ?? "Connection failed.");
    } finally {
      reader?.releaseLock();
    }
  };

  return (
    <div className="ai-settings-backdrop">
      <div
        className="ai-settings-dialog ai-settings-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-preferences-dialog-title"
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
                id="ai-preferences-dialog-title"
                className="ai-settings-dialog__title"
              >
                AI Provider Preferences
              </h2>
              <p className="ai-settings-dialog__subtitle">
                Online provider credentials are saved globally across tabs.
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
              <p className="ai-settings-section__title">Active online provider</p>
              <p className="ai-settings-section__hint">
                Choose which saved provider profile should be used whenever AI
                mode is set to online.
              </p>
            </div>

            <div className="ai-settings-provider-grid">
              {AI_PROVIDER_PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  className={`ai-settings-card ${
                    draftSettings.onlineProvider === preset.id
                      ? "ai-settings-card--selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="aiProvider"
                    value={preset.id}
                    checked={draftSettings.onlineProvider === preset.id}
                    onChange={() => selectOnlineProvider(preset.id)}
                    className="ai-settings-card__radio"
                    disabled={isLoadingPrefs || isSaving}
                  />
                  <span className="ai-settings-card__content">
                    <span className="ai-settings-card__label">
                      {preset.label}
                    </span>
                    <span className="ai-settings-card__description">
                      {preset.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="ai-settings-section">
            <div className="ai-settings-callout">
              <p className="ai-settings-callout__title">
                {selectedProviderPreset.label}
              </p>
              <p className="ai-settings-callout__copy">
                {selectedProviderPreset.authNote ??
                  getApiFormatLabel(onlineConfig)}
              </p>
            </div>

            {draftSettings.onlineProvider === "custom" && (
              <div className="ai-settings-field">
                <span className="ai-settings-field__label">API format</span>
                <div className="ai-settings-format-grid">
                  {(["openai", "anthropic"] as const).map((apiFormat) => (
                    <label
                      key={apiFormat}
                      className={`ai-settings-card ${
                        onlineConfig.apiFormat === apiFormat
                          ? "ai-settings-card--selected"
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="customApiFormat"
                        value={apiFormat}
                        checked={onlineConfig.apiFormat === apiFormat}
                        onChange={() => updateOnlineConfig({ apiFormat })}
                        className="ai-settings-card__radio"
                        disabled={isLoadingPrefs || isSaving}
                      />
                      <span className="ai-settings-card__content">
                        <span className="ai-settings-card__label">
                          {apiFormat === "openai"
                            ? "OpenAI-compatible"
                            : "Anthropic Messages"}
                        </span>
                        <span className="ai-settings-card__description">
                          {apiFormat === "openai"
                            ? "Uses /chat/completions"
                            : "Uses /messages"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-settings-field">
              <label
                htmlFor="online-base-url"
                className="ai-settings-field__label"
              >
                Base URL
              </label>
              <input
                id="online-base-url"
                className="ai-settings-input"
                type="url"
                value={onlineConfig.baseUrl}
                placeholder={selectedProviderPreset.baseUrl || "https://..."}
                onChange={(event) =>
                  updateOnlineConfig({ baseUrl: event.target.value })
                }
                disabled={isLoadingPrefs || isSaving}
              />
              <span className="ai-settings-field__hint">
                {onlineConfig.apiFormat === "anthropic"
                  ? "Anthropic-compatible endpoints use /messages."
                  : "OpenAI-compatible endpoints use /chat/completions."}
              </span>
            </div>

            <div className="ai-settings-field">
              <label
                htmlFor="online-api-key"
                className="ai-settings-field__label"
              >
                API key
              </label>
              <input
                id="online-api-key"
                className="ai-settings-input"
                type="password"
                value={onlineConfig.apiKey}
                placeholder={
                  onlineConfig.apiFormat === "anthropic"
                    ? "sk-ant-..."
                    : "sk-..."
                }
                autoComplete="off"
                onChange={(event) =>
                  updateOnlineConfig({ apiKey: event.target.value })
                }
                disabled={isLoadingPrefs || isSaving}
              />
              <span className="ai-settings-field__hint">
                Stored locally in this app and shared across all tabs.
              </span>
            </div>

            <div className="ai-settings-field">
              <label
                htmlFor="online-model"
                className="ai-settings-field__label"
              >
                Model name
              </label>
              <input
                id="online-model"
                className="ai-settings-input"
                type="text"
                value={onlineConfig.model}
                placeholder={selectedProviderPreset.modelPlaceholder}
                onChange={(event) =>
                  updateOnlineConfig({ model: event.target.value })
                }
                disabled={isLoadingPrefs || isSaving}
              />
            </div>

            <div className="ai-settings-test">
              <button
                className="ai-settings-button ai-settings-button--secondary"
                type="button"
                onClick={handleOnlineTest}
                disabled={isLoadingPrefs || onlineTestStatus === "testing" || isSaving}
              >
                {onlineTestStatus === "testing"
                  ? "Testing..."
                  : "Test connection"}
              </button>

              {onlineTestStatus !== "idle" &&
                onlineTestStatus !== "testing" && (
                  <p
                    className={`ai-settings-test__message ai-settings-test__message--${onlineTestStatus}`}
                  >
                    {onlineTestMessage}
                  </p>
                )}
            </div>
          </section>
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
