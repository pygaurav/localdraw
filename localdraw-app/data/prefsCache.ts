/**
 * prefsCache.ts
 *
 * In-memory cache of all app-level preferences backed by the disk storage
 * server. Provides synchronous reads (from the cache) and asynchronous writes
 * (to the disk). Nothing is ever written to localStorage.
 *
 * Usage:
 *   1. Call `loadPrefsCache()` once at app startup.
 *   2. Use `getPrefsCache()` for synchronous reads anywhere.
 *   3. Use `updatePrefs(patch)` to update one or more fields; the cache is
 *      updated immediately and the disk write happens in the background.
 */

import { getPrefs, savePrefs } from "./diskStorage";

import type { OllamaConfig, OnlineModelConfig, AiMode } from "./diskStorage";

export type { OllamaConfig, OnlineModelConfig, AiMode } from "./diskStorage";

export interface PrefsCacheShape {
  theme: "light" | "dark" | "system";
  ollamaSettings: OllamaConfig;
  onlineModelSettings: OnlineModelConfig;
  aiMode: AiMode;
  defaultLibsSeeded: boolean;
  collabUsername: string;
  debugEnabled: boolean;
}

const DEFAULTS: PrefsCacheShape = {
  theme: "dark",
  ollamaSettings: {
    enabled: false,
    url: "http://localhost:11434",
    model: "llama3",
  },
  onlineModelSettings: {
    baseUrl: "",
    apiKey: "",
    model: "",
    apiFormat: "openai",
  },
  aiMode: "default",
  defaultLibsSeeded: false,
  collabUsername: "",
  debugEnabled: false,
};

let cache: PrefsCacheShape = {
  ...DEFAULTS,
  ollamaSettings: { ...DEFAULTS.ollamaSettings },
  onlineModelSettings: { ...DEFAULTS.onlineModelSettings },
};
let _loaded = false;

/**
 * Load preferences from disk into the cache. Call once at app startup before
 * any synchronous reads are needed.
 */
export const loadPrefsCache = async (): Promise<PrefsCacheShape> => {
  try {
    const prefs = await getPrefs();

    // Migrate: if no aiMode saved but ollamaSettings.enabled was true, use "ollama"
    const savedAiMode: AiMode =
      (prefs.aiMode as AiMode) ??
      (prefs.ollamaSettings?.enabled ? "ollama" : "default");

    cache = {
      ...DEFAULTS,
      ...prefs,
      ollamaSettings: {
        ...DEFAULTS.ollamaSettings,
        ...prefs.ollamaSettings,
      },
      onlineModelSettings: (() => {
        const saved = prefs.onlineModelSettings ?? {};
        // Migrate: derive apiFormat from old providerPreset field or URL
        const apiFormat: "openai" | "anthropic" =
          (saved as any).apiFormat ??
          ((saved as any).providerPreset === "anthropic" ||
          (saved as any).baseUrl?.includes("anthropic.com")
            ? "anthropic"
            : "openai");
        return {
          ...DEFAULTS.onlineModelSettings,
          ...saved,
          apiFormat,
        };
      })(),
      aiMode: savedAiMode,
    } as PrefsCacheShape;
  } catch (err) {
    console.warn(
      "[prefsCache] Failed to load prefs from disk, using defaults:",
      err,
    );
  }
  _loaded = true;
  return cache;
};

/** Returns true once `loadPrefsCache()` has resolved. */
export const isPrefsLoaded = (): boolean => _loaded;

/** Synchronous read from the in-memory cache. */
export const getPrefsCache = (): Readonly<PrefsCacheShape> => cache;

/**
 * Update one or more preference fields. Updates the cache synchronously and
 * writes to disk asynchronously in the background.
 */
export const updatePrefs = (updates: Partial<PrefsCacheShape>): void => {
  cache = {
    ...cache,
    ...updates,
    ollamaSettings: updates.ollamaSettings
      ? { ...cache.ollamaSettings, ...updates.ollamaSettings }
      : cache.ollamaSettings,
    onlineModelSettings: updates.onlineModelSettings
      ? { ...cache.onlineModelSettings, ...updates.onlineModelSettings }
      : cache.onlineModelSettings,
  };
  savePrefs(updates).catch((err) =>
    console.warn("[prefsCache] Failed to persist prefs to disk:", err),
  );
};
