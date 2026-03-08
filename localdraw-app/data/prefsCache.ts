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
import {
  DEFAULT_AI_PROVIDER_CONFIGS,
  DEFAULT_AI_SETTINGS,
  cloneAiSettings,
  detectAiProviderId,
  getFirstConfiguredOnlineProvider,
  hasConfiguredProviderConfig,
  mergeAiSettings,
  normalizeAiMode,
  normalizeAiProviderConfig,
  normalizeUrl,
} from "./aiProviders";

import type {
  AiMode,
  AiProviderConfig,
  AiProviderId,
  AiSettings,
  AppPrefs,
  LegacyOnlineModelConfig,
  PersistedAiSettings,
} from "./diskStorage";

export type {
  AiMode,
  AiProviderConfig,
  AiProviderId,
  AiSettings,
  OfflineModelConfig,
  PersistedAiSettings,
} from "./diskStorage";

export interface PrefsCacheShape {
  theme: "light" | "dark" | "system";
  aiSettings: AiSettings;
  defaultLibsSeeded: boolean;
  collabUsername: string;
  debugEnabled: boolean;
}

const DEFAULTS: PrefsCacheShape = {
  theme: "dark",
  aiSettings: cloneAiSettings(DEFAULT_AI_SETTINGS),
  defaultLibsSeeded: false,
  collabUsername: "",
  debugEnabled: false,
};

let cache: PrefsCacheShape = {
  ...DEFAULTS,
  aiSettings: cloneAiSettings(DEFAULTS.aiSettings),
};
let _loaded = false;

type PrefsUpdate = Omit<Partial<PrefsCacheShape>, "aiSettings"> & {
  aiSettings?: PersistedAiSettings;
};

const getLegacyApiFormat = (
  saved: Partial<LegacyOnlineModelConfig> | undefined,
): AiProviderConfig["apiFormat"] =>
  saved?.apiFormat === "anthropic" ||
  (saved as Record<string, unknown> | undefined)?.providerPreset ===
    "anthropic" ||
  saved?.baseUrl?.includes("anthropic.com")
    ? "anthropic"
    : "openai";

const getLegacyAiSettings = (prefs: AppPrefs): PersistedAiSettings => {
  const legacyOnline: Partial<LegacyOnlineModelConfig> =
    prefs.onlineModelSettings ?? {};
  const legacyApiFormat = getLegacyApiFormat(legacyOnline);
  const legacyProvider = detectAiProviderId({
    baseUrl: legacyOnline.baseUrl,
    apiFormat: legacyApiFormat,
  });
  const normalizedLegacyOnline = normalizeAiProviderConfig(legacyProvider, {
    baseUrl: legacyOnline.baseUrl,
    apiKey: legacyOnline.apiKey,
    model: legacyOnline.model,
    apiFormat: legacyApiFormat,
  });
  const hasLegacyOnlineValues = Boolean(
    normalizedLegacyOnline.baseUrl.trim() ||
      normalizedLegacyOnline.apiKey.trim() ||
      normalizedLegacyOnline.model.trim(),
  );

  return {
    offlineModel: prefs.ollamaSettings
      ? {
          url: prefs.ollamaSettings.url,
          model: prefs.ollamaSettings.model,
        }
      : undefined,
    onlineProvider: legacyProvider,
    onlineProviders: hasLegacyOnlineValues
      ? { [legacyProvider]: normalizedLegacyOnline }
      : undefined,
  };
};

const shouldPersistNormalizedAiSettings = (prefs: AppPrefs): boolean => {
  if (!prefs.aiSettings) {
    return true;
  }

  return (
    !prefs.aiSettings.offlineModel ||
    !prefs.aiSettings.onlineProviders ||
    !prefs.aiSettings.onlineProvider ||
    !prefs.aiSettings.mode
  );
};

const isBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length === 0;

const isDefaultOnlineProviderConfig = (
  provider: AiProviderId,
  config?: Partial<AiProviderConfig>,
): boolean => {
  if (!config) {
    return true;
  }

  const normalizedConfig = normalizeAiProviderConfig(provider, config);
  const defaultConfig = DEFAULT_AI_PROVIDER_CONFIGS[provider];

  return (
    normalizeUrl(normalizedConfig.baseUrl) === normalizeUrl(defaultConfig.baseUrl) &&
    isBlank(normalizedConfig.apiKey) &&
    isBlank(normalizedConfig.model) &&
    normalizedConfig.apiFormat === defaultConfig.apiFormat
  );
};

const repairPersistedAiSettings = (
  persistedAiSettings: PersistedAiSettings | undefined,
  legacyAiSettings: PersistedAiSettings,
): {
  repairedAiSettings?: PersistedAiSettings;
  didRepair: boolean;
} => {
  if (!persistedAiSettings?.onlineProviders || !legacyAiSettings.onlineProviders) {
    return {
      repairedAiSettings: persistedAiSettings,
      didRepair: false,
    };
  }

  let didRepair = false;
  const repairedOnlineProviders = { ...persistedAiSettings.onlineProviders };

  for (const [providerId, legacyConfig] of Object.entries(
    legacyAiSettings.onlineProviders,
  ) as Array<[AiProviderId, Partial<AiProviderConfig>]>) {
    const normalizedLegacyConfig = normalizeAiProviderConfig(
      providerId,
      legacyConfig,
    );
    const persistedConfig = persistedAiSettings.onlineProviders[providerId];

    if (
      !normalizedLegacyConfig.apiKey.trim() &&
      !normalizedLegacyConfig.model.trim()
    ) {
      continue;
    }

    if (isDefaultOnlineProviderConfig(providerId, persistedConfig)) {
      repairedOnlineProviders[providerId] = { ...normalizedLegacyConfig };
      didRepair = true;
      continue;
    }

    const normalizedPersistedConfig = normalizeAiProviderConfig(
      providerId,
      persistedConfig,
    );
    const repairedConfig = { ...normalizedPersistedConfig };
    let didRepairProvider = false;

    if (!repairedConfig.apiKey.trim() && normalizedLegacyConfig.apiKey.trim()) {
      repairedConfig.apiKey = normalizedLegacyConfig.apiKey;
      didRepairProvider = true;
    }

    if (!repairedConfig.model.trim() && normalizedLegacyConfig.model.trim()) {
      repairedConfig.model = normalizedLegacyConfig.model;
      didRepairProvider = true;
    }

    if (
      !repairedConfig.baseUrl.trim() &&
      normalizedLegacyConfig.baseUrl.trim()
    ) {
      repairedConfig.baseUrl = normalizedLegacyConfig.baseUrl;
      didRepairProvider = true;
    }

    if (didRepairProvider) {
      repairedOnlineProviders[providerId] = repairedConfig;
      didRepair = true;
    }
  }

  return {
    repairedAiSettings: didRepair
      ? {
          ...persistedAiSettings,
          onlineProviders: repairedOnlineProviders,
        }
      : persistedAiSettings,
    didRepair,
  };
};

/**
 * Load preferences from disk into the cache. Call once at app startup before
 * any synchronous reads are needed.
 */
export const loadPrefsCache = async (): Promise<PrefsCacheShape> => {
  try {
    const prefs = await getPrefs();
    const migratedLegacyAiSettings = getLegacyAiSettings(prefs);
    const { repairedAiSettings, didRepair } = repairPersistedAiSettings(
      prefs.aiSettings,
      migratedLegacyAiSettings,
    );
    const aiSettings = mergeAiSettings(
      mergeAiSettings(DEFAULT_AI_SETTINGS, migratedLegacyAiSettings),
      repairedAiSettings
        ? { ...repairedAiSettings, mode: undefined }
        : undefined,
    );
    const firstConfiguredProvider = getFirstConfiguredOnlineProvider(
      aiSettings.onlineProviders,
    );
    const selectedProviderHasConfig = hasConfiguredProviderConfig(
      aiSettings.onlineProviders[aiSettings.onlineProvider],
    );
    const resolvedOnlineProvider =
      selectedProviderHasConfig || !firstConfiguredProvider
        ? aiSettings.onlineProvider
        : firstConfiguredProvider;
    const preferredOnlineConfig =
      aiSettings.onlineProviders[resolvedOnlineProvider];
    const fallbackMode: AiMode = hasConfiguredProviderConfig(
      preferredOnlineConfig,
    )
      ? "online"
      : "offline";
    const resolvedMode = prefs.ollamaSettings?.enabled
      ? "offline"
      : normalizeAiMode(
          prefs.aiSettings?.mode ?? prefs.aiMode ?? fallbackMode,
          fallbackMode,
        );

    cache = {
      theme: prefs.theme ?? DEFAULTS.theme,
      aiSettings: {
        ...aiSettings,
        onlineProvider: resolvedOnlineProvider,
        mode: resolvedMode,
      },
      defaultLibsSeeded: Boolean(prefs.defaultLibsSeeded),
      collabUsername:
        typeof prefs.collabUsername === "string" ? prefs.collabUsername : "",
      debugEnabled: Boolean(prefs.debugEnabled),
    };

    if (
      shouldPersistNormalizedAiSettings(prefs) ||
      prefs.aiSettings?.onlineProvider !== resolvedOnlineProvider ||
      didRepair
    ) {
      await savePrefs({
        aiSettings: cloneAiSettings(cache.aiSettings),
      });
    }
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
export const updatePrefs = async (updates: PrefsUpdate): Promise<void> => {
  cache = {
    ...cache,
    ...updates,
    aiSettings: updates.aiSettings
      ? mergeAiSettings(cache.aiSettings, updates.aiSettings)
      : cache.aiSettings,
  };

  const persistedUpdates: Partial<AppPrefs> = {
    ...updates,
    ...(updates.aiSettings ? { aiSettings: cloneAiSettings(cache.aiSettings) } : {}),
  };

  try {
    await savePrefs(persistedUpdates);
  } catch (err) {
    console.warn("[prefsCache] Failed to persist prefs to disk:", err);
  }
};

export const getSelectedAiProviderConfig = (): AiProviderConfig => {
  const { onlineProvider, onlineProviders } = cache.aiSettings;
  return { ...onlineProviders[onlineProvider] };
};
