import React, { useEffect, useRef, useState } from "react";

import { atom, useAtom } from "../app-jotai";
import { DISK_STORAGE_SERVER_URL } from "../app_constants";
import { OllamaSettings } from "../data/OllamaSettings";
import {
  OnlineModelSettings,
  AiModeSettings,
} from "../data/OnlineModelSettings";

import "./OllamaSettingsDialog.scss";

import type { OllamaConfig } from "../data/OllamaSettings";
import type { OnlineModelConfig, AiMode } from "../data/OnlineModelSettings";

// ─── Atom (exported so other components can open the dialog) ─────────────────

export const ollamaSettingsDialogOpenAtom = atom(false);
// Alias kept for forward-compat usage
export const aiSettingsDialogOpenAtom = ollamaSettingsDialogOpenAtom;

// ─── Provider presets ─────────────────────────────────────────────────────────

interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
  authNote?: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-3-5-sonnet-20241022",
    authNote: "Uses x-api-key auth — handled automatically.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    modelPlaceholder: "mistral-large-latest",
  },
  {
    id: "custom",
    label: "Custom / Self-hosted",
    baseUrl: "",
    modelPlaceholder: "model-name",
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type TestStatus = "idle" | "testing" | "success" | "error";

// ─── Dialog ──────────────────────────────────────────────────────────────────

export const OllamaSettingsDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(ollamaSettingsDialogOpenAtom);
  const normalizeAiMode = (mode: AiMode): AiMode =>
    mode === "default" ? "online" : mode;

  const [aiMode, setAiMode] = useState<AiMode>(() =>
    normalizeAiMode(AiModeSettings.get()),
  );
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>(() =>
    OllamaSettings.get(),
  );
  const [onlineConfig, setOnlineConfig] = useState<OnlineModelConfig>(() =>
    OnlineModelSettings.get(),
  );

  // Which preset is shown in the Provider quick-fill dropdown (cosmetic only)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const saved = OnlineModelSettings.get();
    return (
      PROVIDER_PRESETS.find(
        (p) => p.id !== "custom" && p.baseUrl === saved.baseUrl,
      )?.id ?? "custom"
    );
  });

  const [ollamaTestStatus, setOllamaTestStatus] = useState<TestStatus>("idle");
  const [ollamaTestMessage, setOllamaTestMessage] = useState("");
  const [onlineTestStatus, setOnlineTestStatus] = useState<TestStatus>("idle");
  const [onlineTestMessage, setOnlineTestMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setAiMode(normalizeAiMode(AiModeSettings.get()));
      setOllamaConfig(OllamaSettings.get());
      const savedOnline = OnlineModelSettings.get();
      setOnlineConfig(savedOnline);
      setSelectedPresetId(
        PROVIDER_PRESETS.find(
          (p) => p.id !== "custom" && p.baseUrl === savedOnline.baseUrl,
        )?.id ?? "custom",
      );
      setOllamaTestStatus("idle");
      setOllamaTestMessage("");
      setOnlineTestStatus("idle");
      setOnlineTestMessage("");
    }
  }, [isOpen]);

  const ollamaAbortRef = useRef<AbortController | null>(null);
  const onlineAbortRef = useRef<AbortController | null>(null);

  if (!isOpen) {
    return null;
  }

  const close = () => {
    ollamaAbortRef.current?.abort();
    onlineAbortRef.current?.abort();
    setIsOpen(false);
  };

  const handleSave = () => {
    const nextAiMode = normalizeAiMode(aiMode);
    AiModeSettings.set(nextAiMode);
    // Keep ollamaSettings.enabled in sync for backward compat
    OllamaSettings.set({
      ...ollamaConfig,
      enabled: nextAiMode === "ollama",
    });
    // apiFormat is stored directly in onlineConfig (set by radio buttons in the form)
    OnlineModelSettings.set(onlineConfig);
    close();
  };

  // ── Ollama test ─────────────────────────────────────────────────────────

  const handleOllamaTest = async () => {
    ollamaAbortRef.current?.abort();
    const controller = new AbortController();
    ollamaAbortRef.current = controller;

    setOllamaTestStatus("testing");
    setOllamaTestMessage("");

    try {
      const url = `${ollamaConfig.url.replace(/\/$/, "")}/api/tags`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const modelCount: number = data?.models?.length ?? 0;
      setOllamaTestStatus("success");
      setOllamaTestMessage(
        modelCount > 0
          ? `Connected! ${modelCount} model${
              modelCount !== 1 ? "s" : ""
            } available.`
          : "Connected! No models installed yet — run `ollama pull <model>`.",
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      setOllamaTestStatus("error");
      setOllamaTestMessage(
        err?.message?.includes("fetch") || err?.message?.includes("Failed")
          ? "Cannot connect. Make sure Ollama is running (`ollama serve`)."
          : err?.message ?? "Connection failed.",
      );
    }
  };

  // ── Online model test ───────────────────────────────────────────────────

  const handleOnlineTest = async () => {
    onlineAbortRef.current?.abort();
    const controller = new AbortController();
    onlineAbortRef.current = controller;

    if (!onlineConfig.baseUrl) {
      setOnlineTestStatus("error");
      setOnlineTestMessage("Base URL is required.");
      return;
    }
    if (!onlineConfig.model) {
      setOnlineTestStatus("error");
      setOnlineTestMessage("Model name is required.");
      return;
    }

    setOnlineTestStatus("testing");
    setOnlineTestMessage("");

    try {
      // Route through the unified streaming endpoint — it handles provider differences
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
          if (typeof errBody?.error === "string") {
            errMsg = errBody.error;
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      // Drain the stream to verify we get a real response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }
      const decoder = new TextDecoder();
      let gotContent = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const text = decoder.decode(value, { stream: true });
          if (!gotContent && text.includes('"chunk"')) {
            gotContent = true;
            // Got a response — no need to drain the whole thing
            controller.abort();
            break;
          }
          if (text.includes("[DONE]")) {
            gotContent = true;
            break;
          }
          // Forward streaming errors from the server
          if (text.includes('"error"')) {
            const match = /"error"\s*:\s*"([^"]+)"/.exec(text);
            if (match) {
              throw new Error(match[1]);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      setOnlineTestStatus("success");
      setOnlineTestMessage(
        `Connected! Model "${onlineConfig.model}" is responding.`,
      );
    } catch (err: unknown) {
      const anyErr = err as { name?: string; message?: string };
      if (anyErr?.name === "AbortError") {
        // AbortError from controller.abort() after success — treat as success
        if (onlineTestStatus !== "testing") {
          return;
        }
        setOnlineTestStatus("success");
        setOnlineTestMessage(
          `Connected! Model "${onlineConfig.model}" is responding.`,
        );
        return;
      }
      setOnlineTestStatus("error");
      setOnlineTestMessage(anyErr?.message ?? "Connection failed.");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    // Backdrop is decorative only — no click-to-close, no event handling
    <div className="ollama-dialog-backdrop">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="ollama-dialog ollama-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Stop global shortcut handlers from consuming keystrokes
          e.stopPropagation();
          if (e.key === "Escape") {
            close();
          }
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="ollama-dialog__header">
          <div className="ollama-dialog__title-row">
            <span className="ollama-dialog__icon">🤖</span>
            <h2 id="ai-settings-dialog-title" className="ollama-dialog__title">
              AI Settings
            </h2>
          </div>
          <button
            className="ollama-dialog__close"
            onClick={close}
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="ollama-dialog__body">
          {/* Provider selector */}
          <div className="ai-provider-section">
            <p className="ollama-field__label ai-provider-section__heading">
              Active AI Provider
            </p>
            <div className="ai-provider-options">
              {(
                [
                  {
                    value: "ollama",
                    label: "Ollama",
                    sub: "Local model on your machine",
                  },
                  {
                    value: "online",
                    label: "Online Model",
                    sub: "OpenAI-compatible API",
                  },
                ] as const
              ).map(({ value, label, sub }) => (
                <label key={value} className="ai-provider-option">
                  <input
                    type="radio"
                    name="aiMode"
                    value={value}
                    checked={aiMode === value}
                    onChange={() => setAiMode(value)}
                    className="ai-provider-option__radio"
                  />
                  <span className="ai-provider-option__content">
                    <span className="ai-provider-option__label">{label}</span>
                    <span className="ai-provider-option__sub">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Ollama config — shown when ollama is selected */}
          {aiMode === "ollama" && (
            <>
              <hr className="ollama-divider" />

              <p className="ollama-description">
                Requests will be sent to your local <strong>Ollama</strong>{" "}
                server instead of an online hosted backend.
              </p>

              <div className="ollama-field">
                <label htmlFor="ollama-url" className="ollama-field__label">
                  Ollama base URL
                </label>
                <input
                  id="ollama-url"
                  className="ollama-input"
                  type="url"
                  value={ollamaConfig.url}
                  placeholder="http://localhost:11434"
                  onChange={(e) => {
                    const val = e.target.value;
                    setOllamaConfig((c) => ({ ...c, url: val }));
                  }}
                />
              </div>

              <div className="ollama-field">
                <label htmlFor="ollama-model" className="ollama-field__label">
                  Model name
                </label>
                <input
                  id="ollama-model"
                  className="ollama-input"
                  type="text"
                  value={ollamaConfig.model}
                  placeholder="llama3"
                  onChange={(e) => {
                    const val = e.target.value;
                    setOllamaConfig((c) => ({ ...c, model: val }));
                  }}
                />
                <span className="ollama-field__hint">
                  The model must be installed locally (e.g.{" "}
                  <code>ollama pull llama3.2-vision</code>). Wireframe to code
                  works best with a <strong>vision-capable</strong> model.
                  Non-vision models can only fall back to detected text from the
                  frame.
                </span>
              </div>

              <div className="ollama-test">
                <button
                  className="ollama-btn ollama-btn--secondary"
                  type="button"
                  onClick={handleOllamaTest}
                  disabled={ollamaTestStatus === "testing"}
                >
                  {ollamaTestStatus === "testing"
                    ? "Testing…"
                    : "Test connection"}
                </button>

                {ollamaTestStatus !== "idle" && ollamaTestStatus !== "testing" && (
                  <p
                    className={`ollama-test__message ollama-test__message--${ollamaTestStatus}`}
                  >
                    {ollamaTestStatus === "success" ? "✓" : "✗"}{" "}
                    {ollamaTestMessage}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Online model config — shown when online is selected */}
          {aiMode === "online" && (
            <>
              <hr className="ollama-divider" />

              {/* ── API Format — the most important choice ── */}
              <div className="ollama-field">
                <span className="ollama-field__label">API Format</span>
                <div className="api-format-options">
                  <label className="api-format-option">
                    <input
                      type="radio"
                      name="apiFormat"
                      value="openai"
                      checked={onlineConfig.apiFormat === "openai"}
                      onChange={() =>
                        setOnlineConfig((c) => ({ ...c, apiFormat: "openai" }))
                      }
                    />
                    <span className="api-format-option__content">
                      <span className="api-format-option__label">
                        OpenAI-compatible
                      </span>
                      <span className="api-format-option__sub">
                        OpenAI · Groq · Together · Mistral · LM Studio · Ollama
                        OpenAI compat
                      </span>
                    </span>
                  </label>
                  <label className="api-format-option">
                    <input
                      type="radio"
                      name="apiFormat"
                      value="anthropic"
                      checked={onlineConfig.apiFormat === "anthropic"}
                      onChange={() =>
                        setOnlineConfig((c) => ({
                          ...c,
                          apiFormat: "anthropic",
                        }))
                      }
                    />
                    <span className="api-format-option__content">
                      <span className="api-format-option__label">
                        Anthropic Messages API
                      </span>
                      <span className="api-format-option__sub">
                        Claude models · any Anthropic-compatible proxy
                      </span>
                    </span>
                  </label>
                </div>
                {onlineConfig.apiFormat === "anthropic" && (
                  <p className="ollama-field__hint ollama-field__hint--info">
                    Uses the Anthropic Messages API format and works with the
                    official API or Anthropic-compatible proxy URLs.
                  </p>
                )}
              </div>

              {/* ── Provider quick-fill (cosmetic only — does not change API format) ── */}
              <div className="ollama-field">
                <label
                  htmlFor="online-provider"
                  className="ollama-field__label"
                >
                  Quick-fill base URL
                </label>
                <select
                  id="online-provider"
                  className="ollama-input ollama-select"
                  value={selectedPresetId}
                  onChange={(e) => {
                    const presetId = e.target.value;
                    setSelectedPresetId(presetId);
                    const preset = PROVIDER_PRESETS.find(
                      (p) => p.id === presetId,
                    );
                    if (preset && preset.id !== "custom") {
                      setOnlineConfig((c) => ({
                        ...c,
                        baseUrl: preset.baseUrl,
                        // Also set the recommended apiFormat for this preset
                        apiFormat:
                          preset.id === "anthropic" ? "anthropic" : "openai",
                      }));
                    }
                    setOnlineTestStatus("idle");
                    setOnlineTestMessage("");
                  }}
                >
                  {PROVIDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="ollama-field__hint">
                  Selects a preset base URL. You can still edit the URL below.
                </span>
              </div>

              <div className="ollama-field">
                <label
                  htmlFor="online-base-url"
                  className="ollama-field__label"
                >
                  Base URL
                </label>
                <input
                  id="online-base-url"
                  className="ollama-input"
                  type="url"
                  value={onlineConfig.baseUrl}
                  placeholder={
                    onlineConfig.apiFormat === "anthropic"
                      ? "https://api.anthropic.com/v1"
                      : "https://api.openai.com/v1"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedPresetId("custom");
                    setOnlineConfig((c) => ({ ...c, baseUrl: val }));
                  }}
                />
                <span className="ollama-field__hint">
                  {onlineConfig.apiFormat === "anthropic"
                    ? "Uses the /messages endpoint. If your URL ends with /v1, it is normalized automatically."
                    : "Uses the /chat/completions endpoint. Include /v1 in the URL (e.g. https://api.openai.com/v1)."}
                </span>
              </div>

              <div className="ollama-field">
                <label htmlFor="online-api-key" className="ollama-field__label">
                  API Key
                </label>
                <input
                  id="online-api-key"
                  className="ollama-input"
                  type="password"
                  value={onlineConfig.apiKey}
                  placeholder={
                    onlineConfig.apiFormat === "anthropic"
                      ? "sk-ant-..."
                      : "sk-..."
                  }
                  autoComplete="off"
                  onChange={(e) => {
                    const val = e.target.value;
                    setOnlineConfig((c) => ({ ...c, apiKey: val }));
                  }}
                />
                <span className="ollama-field__hint">
                  {onlineConfig.apiFormat === "anthropic"
                    ? "Sent as x-api-key header."
                    : "Sent as Authorization: Bearer header."}{" "}
                  Stored locally in this app.
                </span>
              </div>

              <div className="ollama-field">
                <label htmlFor="online-model" className="ollama-field__label">
                  Model name
                </label>
                <input
                  id="online-model"
                  className="ollama-input"
                  type="text"
                  value={onlineConfig.model}
                  placeholder={
                    onlineConfig.apiFormat === "anthropic"
                      ? "claude-3-5-sonnet-20241022"
                      : PROVIDER_PRESETS.find((p) => p.id === selectedPresetId)
                          ?.modelPlaceholder ?? "gpt-4o"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setOnlineConfig((c) => ({ ...c, model: val }));
                  }}
                />
              </div>

              <div className="ollama-test">
                <button
                  className="ollama-btn ollama-btn--secondary"
                  type="button"
                  onClick={handleOnlineTest}
                  disabled={onlineTestStatus === "testing"}
                >
                  {onlineTestStatus === "testing"
                    ? "Testing…"
                    : "Test connection"}
                </button>

                {onlineTestStatus !== "idle" && onlineTestStatus !== "testing" && (
                  <p
                    className={`ollama-test__message ollama-test__message--${onlineTestStatus}`}
                  >
                    {onlineTestStatus === "success" ? "✓" : "✗"}{" "}
                    {onlineTestMessage}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="ollama-dialog__footer">
          <button
            className="ollama-btn ollama-btn--ghost"
            type="button"
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="ollama-btn ollama-btn--primary"
            type="button"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
