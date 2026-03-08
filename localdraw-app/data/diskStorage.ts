/**
 * diskStorage.ts
 *
 * Frontend API client for the local Express disk-storage backend.
 * Replaces localStorage-based scene persistence with REST calls that
 * write actual .excalidraw files to disk.
 *
 * Binary image files (BinaryFiles) remain in IndexedDB via LocalData.fileStorage.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  debounce,
} from "@localdraw/common";
import { getNonDeletedElements } from "@localdraw/element";

import type { ExcalidrawElement } from "@localdraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import {
  DISK_STORAGE_SERVER_URL,
  SAVE_TO_LOCAL_STORAGE_TIMEOUT,
} from "../app_constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabMeta {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface TabsState {
  tabs: TabMeta[];
  activeTabId: string | null;
}

export interface SceneData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
}

// ---------------------------------------------------------------------------
// Low-level fetch helpers
// ---------------------------------------------------------------------------

const BASE = DISK_STORAGE_SERVER_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[diskStorage] ${options?.method ?? "GET"} ${path} → ${
        res.status
      }: ${body}`,
    );
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tab API
// ---------------------------------------------------------------------------

export const listTabs = (): Promise<TabsState> =>
  apiFetch<TabsState>("/api/tabs");

export const createTab = (name?: string): Promise<TabMeta> =>
  apiFetch<TabMeta>("/api/tabs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const deleteTab = (
  id: string,
): Promise<{ success: boolean; activeTabId: string | null }> =>
  apiFetch(`/api/tabs/${id}`, { method: "DELETE" });

export const renameTab = (id: string, name: string): Promise<TabMeta> =>
  apiFetch<TabMeta>(`/api/tabs/${id}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const setActiveTab = (
  activeTabId: string,
): Promise<{ activeTabId: string }> =>
  apiFetch("/api/tabs/active", {
    method: "PATCH",
    body: JSON.stringify({ activeTabId }),
  });

// ---------------------------------------------------------------------------
// Scene API
// ---------------------------------------------------------------------------

export const loadScene = (id: string): Promise<SceneData> =>
  apiFetch<SceneData>(`/api/scenes/${id}`);

/** Serialise and immediately PUT a scene to the backend. */
export const saveSceneNow = async (
  tabId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  tabName?: string,
): Promise<void> => {
  const _appState = clearAppStateForLocalStorage(appState);

  // Suppress canvas-search sidebar from being persisted
  if (
    _appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    _appState.openSidebar.tab === CANVAS_SEARCH_TAB
  ) {
    _appState.openSidebar = null;
  }

  await apiFetch(`/api/scenes/${tabId}`, {
    method: "PUT",
    body: JSON.stringify({
      elements: getNonDeletedElements(elements),
      appState: _appState,
      name: tabName,
    }),
  });
};

// ---------------------------------------------------------------------------
// Debounced save (mirrors LocalData._save pattern)
// ---------------------------------------------------------------------------

type SaveCallback = () => void;

const _debouncedSave = debounce(
  async (
    tabId: string,
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    tabName: string | undefined,
    onSaved: SaveCallback,
  ) => {
    try {
      await saveSceneNow(tabId, elements, appState, tabName);
      onSaved();
    } catch (err) {
      console.error("[diskStorage] auto-save failed:", err);
    }
  },
  SAVE_TO_LOCAL_STORAGE_TIMEOUT,
);

export const saveScene = (
  tabId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  tabName: string | undefined,
  onSaved: SaveCallback,
) => {
  _debouncedSave(tabId, elements, appState, tabName, onSaved);
};

/** Flush any pending debounced save immediately (call on blur/unload). */
export const flushSave = () => {
  _debouncedSave.flush();
};

// ---------------------------------------------------------------------------
// Preferences API (theme, language, etc.) — stored on disk, tab-independent
// ---------------------------------------------------------------------------

export interface OfflineModelConfig {
  url: string;
  model: string;
}

export interface LegacyOllamaConfig extends OfflineModelConfig {
  enabled: boolean;
}

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "groq"
  | "together"
  | "mistral"
  | "custom";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Explicit API format choice — independent of base URL so custom/proxy URLs
   * still call the correct endpoint and send the correct auth headers.
   *   "openai"    → POST /chat/completions, Authorization: Bearer
   *   "anthropic" → POST /messages, x-api-key, anthropic-version header
   */
  apiFormat: "openai" | "anthropic";
}

export interface LegacyOnlineModelConfig extends AiProviderConfig {}

export type AiMode = "offline" | "online";

export interface AiSettings {
  mode: AiMode;
  onlineProvider: AiProviderId;
  offlineModel: OfflineModelConfig;
  onlineProviders: Record<AiProviderId, AiProviderConfig>;
}

export type PersistedAiSettings = Omit<
  Partial<AiSettings>,
  "offlineModel" | "onlineProviders"
> & {
  offlineModel?: Partial<OfflineModelConfig>;
  onlineProviders?: Partial<Record<AiProviderId, Partial<AiProviderConfig>>>;
};

export interface AppPrefs {
  theme?: "light" | "dark" | "system";
  aiSettings?: PersistedAiSettings;
  ollamaSettings?: LegacyOllamaConfig;
  onlineModelSettings?: LegacyOnlineModelConfig;
  aiMode?: AiMode | "ollama" | "default";
  defaultLibsSeeded?: boolean;
  collabUsername?: string;
  debugEnabled?: boolean;
  [key: string]: unknown;
}

export const getPrefs = (): Promise<AppPrefs> =>
  apiFetch<AppPrefs>("/api/prefs");

export const savePrefs = (prefs: Partial<AppPrefs>): Promise<AppPrefs> =>
  apiFetch<AppPrefs>("/api/prefs", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });

// ---------------------------------------------------------------------------
// Bootstrap: ensure at least one tab + scene exist, return active scene
// ---------------------------------------------------------------------------

/**
 * Called once at app startup instead of importFromLocalStorage().
 * Returns the active scene data (elements + appState) and the full tabs state.
 */
export const loadActiveScene = async (): Promise<{
  sceneData: SceneData | null;
  tabsState: TabsState;
}> => {
  let tabsState = await listTabs();

  // First run: create the initial tab
  if (tabsState.tabs.length === 0) {
    await createTab("Drawing 1");
    tabsState = await listTabs();
  }

  // Ensure an activeTabId is set
  if (!tabsState.activeTabId && tabsState.tabs.length > 0) {
    const firstId = tabsState.tabs[0].id;
    await setActiveTab(firstId);
    tabsState.activeTabId = firstId;
  }

  if (!tabsState.activeTabId) {
    return { sceneData: null, tabsState };
  }

  try {
    const sceneData = await loadScene(tabsState.activeTabId);
    return { sceneData, tabsState };
  } catch {
    // Scene file missing – return empty scene
    return {
      sceneData: {
        id: tabsState.activeTabId,
        name:
          tabsState.tabs.find((t) => t.id === tabsState.activeTabId)?.name ??
          "Drawing",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        elements: [],
        appState: {},
      },
      tabsState,
    };
  }
};
