/**
 * Ollama local AI connection settings.
 * Persisted to disk via prefsCache — no localStorage used.
 */

import { getPrefsCache, updatePrefs } from "./prefsCache";

import type { OllamaConfig } from "./prefsCache";

export type { OllamaConfig } from "./prefsCache";

const DEFAULT_CONFIG: OllamaConfig = {
  enabled: false,
  url: "http://localhost:11434",
  model: "llama3",
};

export const OllamaSettings = {
  /**
   * Read Ollama config from the in-memory prefs cache.
   * Returns merged defaults if nothing has been saved yet.
   */
  get(): OllamaConfig {
    return { ...DEFAULT_CONFIG, ...getPrefsCache().ollamaSettings };
  },

  /**
   * Persist Ollama config to disk via the prefs cache.
   */
  set(config: Partial<OllamaConfig>): void {
    const current = OllamaSettings.get();
    updatePrefs({ ollamaSettings: { ...current, ...config } });
  },

  /**
   * Reset Ollama config to defaults.
   */
  clear(): void {
    updatePrefs({ ollamaSettings: { ...DEFAULT_CONFIG } });
  },

  /**
   * Quick check: is Ollama mode active?
   */
  isEnabled(): boolean {
    return OllamaSettings.get().enabled;
  },
};
