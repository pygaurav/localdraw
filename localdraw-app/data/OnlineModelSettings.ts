/**
 * Online AI model connection settings (OpenAI-compatible APIs).
 * Persisted to disk via prefsCache — no localStorage used.
 */

import { getPrefsCache, updatePrefs } from "./prefsCache";

import type { OnlineModelConfig, AiMode } from "./prefsCache";

export type { OnlineModelConfig, AiMode } from "./prefsCache";

const DEFAULT_CONFIG: OnlineModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  apiFormat: "openai",
};

export const OnlineModelSettings = {
  get(): OnlineModelConfig {
    return { ...DEFAULT_CONFIG, ...getPrefsCache().onlineModelSettings };
  },

  set(config: Partial<OnlineModelConfig>): void {
    const current = OnlineModelSettings.get();
    updatePrefs({ onlineModelSettings: { ...current, ...config } });
  },

  clear(): void {
    updatePrefs({ onlineModelSettings: { ...DEFAULT_CONFIG } });
  },
};

export const AiModeSettings = {
  get(): AiMode {
    return getPrefsCache().aiMode ?? "default";
  },

  set(mode: AiMode): void {
    updatePrefs({ aiMode: mode });
  },
};
