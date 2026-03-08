import {
  DEFAULT_AI_PROVIDER_CONFIGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_OFFLINE_MODEL_CONFIG,
  cloneAiSettings,
} from "./aiProviders";
import {
  getPrefsCache,
  isPrefsLoaded,
  loadPrefsCache,
  updatePrefs,
} from "./prefsCache";

import type {
  AiMode,
  AiProviderConfig,
  AiProviderId,
  AiSettings as AiSettingsConfig,
  OfflineModelConfig,
  PersistedAiSettings,
} from "./prefsCache";

export type { AiMode, AiProviderConfig, AiProviderId } from "./prefsCache";
export type { OfflineModelConfig, PersistedAiSettings } from "./prefsCache";
export type { AiSettingsConfig as AiSettings };

export const AISettings = {
  get(): AiSettingsConfig {
    return cloneAiSettings(getPrefsCache().aiSettings);
  },

  async refresh(): Promise<AiSettingsConfig> {
    const prefs = await loadPrefsCache();
    return cloneAiSettings(prefs.aiSettings);
  },

  async ensureLoaded(): Promise<AiSettingsConfig> {
    if (!isPrefsLoaded()) {
      return AISettings.refresh();
    }
    return AISettings.get();
  },

  async set(config: PersistedAiSettings): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({ aiSettings: config });
  },

  async clear(): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({ aiSettings: cloneAiSettings(DEFAULT_AI_SETTINGS) });
  },
};

export const OfflineModelSettings = {
  get(): OfflineModelConfig {
    return { ...AISettings.get().offlineModel };
  },

  async set(config: Partial<OfflineModelConfig>): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({ aiSettings: { offlineModel: config } });
  },

  async clear(): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({
      aiSettings: { offlineModel: { ...DEFAULT_OFFLINE_MODEL_CONFIG } },
    });
  },
};

const getSelectedProviderId = (): AiProviderId =>
  AISettings.get().onlineProvider;

export const OnlineProviderSettings = {
  getSelectedProvider(): AiProviderId {
    return getSelectedProviderId();
  },

  async setSelectedProvider(provider: AiProviderId): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({ aiSettings: { onlineProvider: provider } });
  },

  get(provider?: AiProviderId): AiProviderConfig {
    const resolvedProvider = provider ?? getSelectedProviderId();
    return { ...AISettings.get().onlineProviders[resolvedProvider] };
  },

  async set(
    provider: AiProviderId,
    config: Partial<AiProviderConfig>,
  ): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({
      aiSettings: {
        onlineProvider: provider,
        onlineProviders: {
          [provider]: config,
        },
      },
    });
  },

  async clear(provider?: AiProviderId): Promise<void> {
    await AISettings.ensureLoaded();
    const resolvedProvider = provider ?? getSelectedProviderId();
    await updatePrefs({
      aiSettings: {
        onlineProviders: {
          [resolvedProvider]: {
            ...DEFAULT_AI_PROVIDER_CONFIGS[resolvedProvider],
          },
        },
      },
    });
  },
};

export const AiModeSettings = {
  get(): AiMode {
    return AISettings.get().mode;
  },

  async set(mode: AiMode): Promise<void> {
    await AISettings.ensureLoaded();
    await updatePrefs({ aiSettings: { mode } });
  },
};
