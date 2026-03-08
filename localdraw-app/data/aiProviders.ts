import type {
  AiMode,
  AiProviderConfig,
  AiProviderId,
  AiSettings,
  PersistedAiSettings,
  OfflineModelConfig,
} from "./diskStorage";

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  description: string;
  baseUrl: string;
  modelPlaceholder: string;
  apiFormat: AiProviderConfig["apiFormat"];
  authNote?: string;
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "Hosted OpenAI models",
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
    apiFormat: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude via Messages API",
    baseUrl: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-3-5-sonnet-20241022",
    apiFormat: "anthropic",
    authNote: "Uses x-api-key auth automatically.",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Fast OpenAI-compatible inference",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
    apiFormat: "openai",
  },
  {
    id: "together",
    label: "Together AI",
    description: "Hosted open models",
    baseUrl: "https://api.together.xyz/v1",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    apiFormat: "openai",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    description: "Mistral hosted APIs",
    baseUrl: "https://api.mistral.ai/v1",
    modelPlaceholder: "mistral-large-latest",
    apiFormat: "openai",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Self-hosted or proxy endpoint",
    baseUrl: "",
    modelPlaceholder: "model-name",
    apiFormat: "openai",
  },
];

export const DEFAULT_OFFLINE_MODEL_CONFIG: OfflineModelConfig = {
  url: "http://localhost:11434",
  model: "llama3",
};

export const isAiProviderId = (value: unknown): value is AiProviderId =>
  AI_PROVIDER_PRESETS.some((preset) => preset.id === value);

export const normalizeAiMode = (
  value: unknown,
  fallback: AiMode = "offline",
): AiMode => {
  if (value === "offline" || value === "online") {
    return value;
  }
  if (value === "ollama") {
    return "offline";
  }
  return fallback;
};

export const normalizeAiProviderId = (
  value: unknown,
  fallback: AiProviderId = "openai",
): AiProviderId => (isAiProviderId(value) ? value : fallback);

export const normalizeUrl = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\/$/, "");

const getProviderPreset = (provider: AiProviderId) =>
  AI_PROVIDER_PRESETS.find((preset) => preset.id === provider)!;

export const normalizeAiProviderConfig = (
  provider: AiProviderId,
  config?: Partial<AiProviderConfig>,
): AiProviderConfig => {
  const preset = getProviderPreset(provider);
  const merged = {
    baseUrl: preset.baseUrl,
    apiKey: "",
    model: "",
    apiFormat: preset.apiFormat,
    ...config,
  };

  return {
    baseUrl:
      typeof merged.baseUrl === "string" ? merged.baseUrl : preset.baseUrl,
    apiKey: typeof merged.apiKey === "string" ? merged.apiKey : "",
    model: typeof merged.model === "string" ? merged.model : "",
    apiFormat: provider === "custom" ? merged.apiFormat : preset.apiFormat,
  };
};

export const cloneAiProviderConfigs = (
  configs?: Partial<Record<AiProviderId, Partial<AiProviderConfig>>>,
): Record<AiProviderId, AiProviderConfig> =>
  AI_PROVIDER_PRESETS.reduce(
    (acc, preset) => {
      acc[preset.id] = normalizeAiProviderConfig(preset.id, configs?.[preset.id]);
      return acc;
    },
    {} as Record<AiProviderId, AiProviderConfig>,
  );

export const DEFAULT_AI_PROVIDER_CONFIGS = cloneAiProviderConfigs();

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "offline",
  onlineProvider: "openai",
  offlineModel: { ...DEFAULT_OFFLINE_MODEL_CONFIG },
  onlineProviders: cloneAiProviderConfigs(),
};

export const cloneAiSettings = (
  settings: AiSettings = DEFAULT_AI_SETTINGS,
): AiSettings => ({
  ...settings,
  offlineModel: { ...settings.offlineModel },
  onlineProviders: cloneAiProviderConfigs(settings.onlineProviders),
});

export const detectAiProviderId = (
  config?: Partial<AiProviderConfig>,
): AiProviderId => {
  const normalizedBaseUrl = normalizeUrl(config?.baseUrl);
  if (!normalizedBaseUrl) {
    return "openai";
  }

  const presetMatch = AI_PROVIDER_PRESETS.find(
    (preset) => normalizeUrl(preset.baseUrl) === normalizedBaseUrl,
  );
  if (presetMatch) {
    return presetMatch.id;
  }

  if (config?.apiFormat === "anthropic") {
    return "anthropic";
  }

  return "custom";
};

export const hasConfiguredProviderConfig = (
  config?: Partial<AiProviderConfig>,
): boolean => Boolean(config?.baseUrl?.trim() && config?.model?.trim());

export const getFirstConfiguredOnlineProvider = (
  configs: Record<AiProviderId, AiProviderConfig>,
): AiProviderId | null => {
  for (const preset of AI_PROVIDER_PRESETS) {
    if (hasConfiguredProviderConfig(configs[preset.id])) {
      return preset.id;
    }
  }
  return null;
};

export const mergeAiSettings = (
  base: AiSettings,
  updates?: PersistedAiSettings,
): AiSettings => {
  const next = cloneAiSettings(base);

  if (!updates) {
    return next;
  }

  if (updates.mode !== undefined) {
    next.mode = normalizeAiMode(updates.mode);
  }

  if (updates.onlineProvider !== undefined) {
    next.onlineProvider = normalizeAiProviderId(
      updates.onlineProvider,
      next.onlineProvider,
    );
  }

  if (updates.offlineModel) {
    next.offlineModel = {
      ...next.offlineModel,
      ...updates.offlineModel,
    };
  }

  if (updates.onlineProviders) {
    for (const [providerId, config] of Object.entries(updates.onlineProviders)) {
      if (!isAiProviderId(providerId)) {
        continue;
      }
      next.onlineProviders[providerId] = normalizeAiProviderConfig(
        providerId,
        {
          ...next.onlineProviders[providerId],
          ...config,
        },
      );
    }
  }

  return next;
};
