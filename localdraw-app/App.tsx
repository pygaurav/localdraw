import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@excalidraw/excalidraw/components/ShareableLinkDialog";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv,
} from "@localdraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { useCallbackRefState } from "@excalidraw/excalidraw/hooks/useCallbackRefState";
import { t } from "@excalidraw/excalidraw/i18n";
import { isElementLink } from "@localdraw/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@localdraw/element";
import { isInitializedImageElement } from "@localdraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  ExcalidrawElement,
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@localdraw/element/types";
import type {
  AppState,
  DataURL,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@localdraw/common/utility-types";
import type { ResolvablePromise } from "@localdraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import {
  exportToBackend,
  getCollaborationLinkData,
  importFromBackend,
  isCollaborationLink,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import {
  loadActiveScene,
  saveScene,
  flushSave as diskFlushSave,
  createTab,
  deleteTab,
  renameTab,
  setActiveTab as setActiveTabOnServer,
  loadScene,
  saveSceneNow,
} from "./data/diskStorage";

import { TabBar } from "./components/TabBar";
import { tabsAtom, activeTabIdAtom } from "./tabs-store";

import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { AIComponents } from "./components/AI";
import { ExcalidrawPlusIframeExport } from "./ExcalidrawPlusIframeExport";
import { AIPreferencesDialog } from "./components/AIPreferencesDialog";
import { AISettingsDialog } from "./components/AISettingsDialog";
import {
  IconPicker,
  iconPickerAnchorAtom,
  iconPickerOpenAtom,
} from "./components/IconPicker";
import { ALL_ICONS, buildIconSVG } from "./data/iconData";

import { loadDefaultLibraries } from "./data/defaultLibraries";
import { loadPrefsCache, getPrefsCache, updatePrefs } from "./data/prefsCache";
import { validateEmbeddableUrl } from "./embeddable";

import "./index.scss";

import type { TabMeta } from "./data/diskStorage";
import type { IconEntry } from "./data/iconData";
import type { CollabAPI } from "./collab/Collab";

polyfill();

window.LOCALDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const ICON_ID_DATA_ATTR_REGEX = /data-localdraw-icon-id="([^"]+)"/;
const SVG_DATA_URL_PREFIX = "data:image/svg+xml,";

const normalizeIconSvgSignature = (svg: string) =>
  svg
    .replace(/\sdata-localdraw-icon-id="[^"]*"/g, "")
    .replace(/stroke-width="[^"]*"/g, 'stroke-width="__W__"')
    .replace(/stroke="[^"]*"/g, 'stroke="__C__"')
    .replace(/fill="(?!none)[^"]*"/g, 'fill="__C__"')
    .replace(/\s+/g, " ")
    .trim();

const ICON_ENTRY_BY_ID = new Map(ALL_ICONS.map((icon) => [icon.id, icon]));
const ICON_SIGNATURE_TO_ID = new Map(
  ALL_ICONS.map((icon) => [
    normalizeIconSvgSignature(buildIconSVG(icon, "__C__", 2)),
    icon.id,
  ]),
);

const getSvgMarkupFromDataURL = (dataURL: string | undefined) => {
  if (!dataURL?.startsWith(SVG_DATA_URL_PREFIX)) {
    return null;
  }
  try {
    return decodeURIComponent(dataURL.slice(SVG_DATA_URL_PREFIX.length));
  } catch {
    return null;
  }
};

const getIconIdFromSvgMarkup = (svgMarkup: string): string | null => {
  const taggedId = svgMarkup.match(ICON_ID_DATA_ATTR_REGEX)?.[1];
  if (taggedId) {
    return taggedId;
  }
  return ICON_SIGNATURE_TO_ID.get(normalizeIconSvgSignature(svgMarkup)) ?? null;
};

/**
 * Returns a tab name that doesn't collide with any existing tab name.
 * Tries `base`, then `base 2`, `base 3`, … until a free slot is found.
 */
function uniqueTabName(existing: TabMeta[], base = "Drawing"): string {
  const names = new Set(existing.map((t) => t.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) {
    return base;
  }
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) {
    i++;
  }
  return `${base} ${i}`;
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
  localDataState: {
    elements: ExcalidrawElement[];
    appState: Partial<AppState> | null;
  } | null;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = opts.localDataState ?? {
    elements: [],
    appState: null,
  };

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
        );

        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true,
            }),
            localDataState?.elements,
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState,
          ),
        };
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/localdraw/localdraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const ExcalidrawWrapper = () => {
  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = isRunningInIframe();

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  // ── Tabs state ────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom);

  // ── Icon picker ───────────────────────────────────────────────────────────
  const [iconPickerOpen, setIconPickerOpen] = useAtom(iconPickerOpenAtom);
  const [, setIconPickerAnchor] = useAtom(iconPickerAnchorAtom);
  /** Map of canvas elementId → the IconEntry that was inserted */
  const iconEntryRef = useRef(new Map<string, IconEntry>());
  /** Map of canvas elementId → { color, strokeWidth } last used to render SVG */
  const iconStyleRef = useRef(
    new Map<string, { color: string; strokeWidth: number }>(),
  );
  /** Guard against reentrant onChange → updateScene → onChange loops */
  const iconSyncInProgressRef = useRef(false);
  // Refs to always access latest values in callbacks without stale closures
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTabId;
  const tabsRef = useRef<TabMeta[]>([]);
  tabsRef.current = tabs;

  // Recently-closed tab stack (session-only, max 10 entries)
  type ClosedTabEntry = {
    name: string;
    elements: readonly ExcalidrawElement[];
    appState: Partial<AppState>;
  };
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<
    ClosedTabEntry[]
  >([]);
  // ─────────────────────────────────────────────────────────────────────────

  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  // ── Seed default icon libraries on first run ─────────────────────────────
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    if (getPrefsCache().defaultLibsSeeded) {
      return;
    }
    // Delay slightly to let the IDB adapter finish its initial library load
    // so we merge *after* user's existing items have been loaded.
    const timer = setTimeout(async () => {
      try {
        const libraryItems = await loadDefaultLibraries();
        if (libraryItems.length > 0) {
          await excalidrawAPI.updateLibrary({
            libraryItems,
            merge: true,
            openLibraryMenu: false,
          });
        }
        updatePrefs({ defaultLibsSeeded: true });
      } catch (err) {
        console.warn(
          "[defaultLibraries] Failed to seed default libraries:",
          err,
        );
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [excalidrawAPI]);
  // ─────────────────────────────────── default icon libraries seeding ──────

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    const loadImages = (
      data: ResolutionType<typeof initializeScene>,
      isInitialLoad = false,
    ) => {
      if (!data.scene) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
        }
      }
    };

    // Load active scene and app-level prefs from disk in parallel, then initialize
    Promise.all([loadActiveScene(), loadPrefsCache()])
      .then(([{ sceneData, tabsState }]) => {
        setTabs(tabsState.tabs);
        setActiveTabId(tabsState.activeTabId);
        const diskState = sceneData
          ? {
              elements: sceneData.elements as ExcalidrawElement[],
              appState: sceneData.appState,
            }
          : null;
        return initializeScene({
          collabAPI,
          excalidrawAPI,
          localDataState: diskState,
        });
      })
      .catch((err) => {
        console.error(
          "[init] Failed to load from disk, starting with empty scene:",
          err,
        );
        return initializeScene({
          collabAPI,
          excalidrawAPI,
          localDataState: null,
        });
      })
      .then(async (data) => {
        loadImages(data, /* isInitialLoad */ true);
        initialStatePromiseRef.current.promise.resolve(data.scene);
      });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({
          collabAPI,
          excalidrawAPI,
          localDataState: null,
        }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      diskFlushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        diskFlushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [
    isCollabDisabled,
    collabAPI,
    excalidrawAPI,
    setLangCode,
    setActiveTabId,
    setTabs,
  ]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      diskFlushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaluate the nested expression every time
    if (!LocalData.isSavePaused()) {
      const currentTabId = activeTabIdRef.current;
      const currentTabName = tabsRef.current.find(
        (t) => t.id === currentTabId,
      )?.name;

      if (currentTabId) {
        saveScene(currentTabId, elements, appState, currentTabName, () => {
          // Save image files to IndexedDB after scene is persisted
          LocalData.fileStorage.saveFiles({ elements, files });

          if (excalidrawAPI) {
            let didChange = false;

            const sceneElements = excalidrawAPI
              .getSceneElementsIncludingDeleted()
              .map((element) => {
                if (
                  LocalData.fileStorage.shouldUpdateImageElementStatus(element)
                ) {
                  const newElement = newElementWith(element, {
                    status: "saved",
                  });
                  if (newElement !== element) {
                    didChange = true;
                  }
                  return newElement;
                }
                return element;
              });

            if (didChange) {
              excalidrawAPI.updateScene({
                elements: sceneElements,
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }
          }
        });
      }
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }

    // ── Icon colour/stroke live-sync ─────────────────────────────────────────
    // When the user selects an icon element and changes stroke colour or stroke
    // width via the Excalidraw properties panel, regenerate the SVG file so the
    // icon visually reflects the new style.
    if (!iconSyncInProgressRef.current) {
      type UpdatePair = {
        elementId: string;
        newColor: string;
        newStrokeWidth: number;
      };
      const updates: UpdatePair[] = [];
      const metadataUpdates = new Map<string, string>();

      for (const element of elements) {
        if (!appState.selectedElementIds[element.id]) {
          continue;
        }
        if (!isInitializedImageElement(element)) {
          continue;
        }
        const elementId = element.id;
        let entry = iconEntryRef.current.get(elementId);

        // Backfill from persisted customData when this icon was loaded from disk/tab switch.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customDataIconId = (element as any).customData?.localdrawIconId;
        if (!entry && customDataIconId) {
          entry = ICON_ENTRY_BY_ID.get(customDataIconId);
          if (entry) {
            iconEntryRef.current.set(elementId, entry);
          }
        }

        // Legacy fallback: infer the icon id from the stored SVG file when
        // customData isn't present yet.
        if (!entry) {
          const fileData =
            files[element.fileId] ?? excalidrawAPI?.getFiles()[element.fileId];
          const svgMarkup = getSvgMarkupFromDataURL(fileData?.dataURL);
          const inferredIconId = svgMarkup
            ? getIconIdFromSvgMarkup(svgMarkup)
            : null;
          if (inferredIconId) {
            entry = ICON_ENTRY_BY_ID.get(inferredIconId);
            if (entry) {
              iconEntryRef.current.set(elementId, entry);
            }
          }
        }

        if (!entry) {
          continue;
        }

        if (customDataIconId !== entry.id) {
          metadataUpdates.set(elementId, entry.id);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = element as any;
        const newColor: string =
          el.strokeColor && el.strokeColor !== "transparent"
            ? el.strokeColor
            : "#1e1e2e";
        const newStrokeWidth: number = el.strokeWidth ?? 2;
        const last = iconStyleRef.current.get(elementId);
        if (
          !last ||
          last.color !== newColor ||
          last.strokeWidth !== newStrokeWidth
        ) {
          updates.push({ elementId, newColor, newStrokeWidth });
          // Update tracking immediately to guard the reentrant call
          iconStyleRef.current.set(elementId, {
            color: newColor,
            strokeWidth: newStrokeWidth,
          });
        }
      }

      if ((updates.length > 0 || metadataUpdates.size > 0) && excalidrawAPI) {
        iconSyncInProgressRef.current = true;

        const newFiles =
          updates.length > 0
            ? updates.map(({ elementId, newColor, newStrokeWidth }) => {
                const entry = iconEntryRef.current.get(elementId)!;
                const svg = buildIconSVG(entry, newColor, newStrokeWidth);
                return {
                  elementId,
                  fileId: crypto.randomUUID() as unknown as FileId,
                  dataURL: `data:image/svg+xml,${encodeURIComponent(
                    svg,
                  )}` as DataURL,
                };
              })
            : [];

        if (newFiles.length) {
          excalidrawAPI.addFiles(
            newFiles.map(({ fileId, dataURL }) => ({
              id: fileId,
              dataURL,
              mimeType: "image/svg+xml" as const,
              created: Date.now(),
              lastRetrieved: Date.now(),
            })),
          );
        }

        const fileMap = new Map<string, FileId>(
          newFiles.map((f) => [f.elementId, f.fileId]),
        );
        excalidrawAPI.updateScene({
          elements: elements.map((el) => {
            const newFileId = fileMap.get(el.id);
            const iconId = metadataUpdates.get(el.id);
            if (!newFileId && !iconId) {
              return el;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nextEl: any = newFileId ? { ...el, fileId: newFileId } : el;
            if (iconId) {
              nextEl.customData = {
                ...(nextEl.customData || {}),
                localdrawIconId: iconId,
              };
            }
            return nextEl;
          }),
          captureUpdate: CaptureUpdateAction.NEVER,
        });

        setTimeout(() => {
          iconSyncInProgressRef.current = false;
        }, 0);
      }
    }
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  // ── Tab handlers ──────────────────────────────────────────────────────────

  const loadMissingFilesForElements = useCallback(
    async (sceneElements: readonly ExcalidrawElement[]) => {
      if (!excalidrawAPI) {
        return;
      }
      const currentFiles = excalidrawAPI.getFiles();
      const fileIds =
        sceneElements.reduce((acc, element) => {
          if (
            isInitializedImageElement(element) &&
            !currentFiles[element.fileId]
          ) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, [] as FileId[]) || [];

      if (!fileIds.length) {
        return;
      }

      const { loadedFiles, erroredFiles } =
        await LocalData.fileStorage.getFiles(fileIds);
      if (loadedFiles.length) {
        excalidrawAPI.addFiles(loadedFiles);
      }
      updateStaleImageStatuses({
        excalidrawAPI,
        erroredFiles,
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
      });
    },
    [excalidrawAPI],
  );

  const handleTabSwitch = useCallback(
    async (newTabId: string) => {
      if (newTabId === activeTabIdRef.current || !excalidrawAPI) {
        return;
      }

      // Immediately persist the current scene before leaving it
      const currentTabId = activeTabIdRef.current;
      if (currentTabId) {
        const currentTabName = tabsRef.current.find(
          (t) => t.id === currentTabId,
        )?.name;
        try {
          const currentElements = excalidrawAPI.getSceneElements();
          const currentAppState = excalidrawAPI.getAppState();
          await saveSceneNow(
            currentTabId,
            currentElements,
            currentAppState,
            currentTabName,
          );
          // Ensure image/icon files are durably stored before leaving tab.
          await LocalData.fileStorage.saveFiles({
            elements: currentElements,
            files: excalidrawAPI.getFiles(),
          });
        } catch (err) {
          console.error("[TabSwitch] Failed to save current scene:", err);
        }
      }

      // Load the target tab scene
      try {
        const sceneData = await loadScene(newTabId);
        excalidrawAPI.updateScene({
          elements: restoreElements(
            sceneData.elements as ExcalidrawElement[],
            null,
            {
              repairBindings: true,
              deleteInvisibleElements: true,
            },
          ),
          appState: restoreAppState(
            sceneData.appState,
            excalidrawAPI.getAppState(),
          ),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        await loadMissingFilesForElements(
          sceneData.elements as ExcalidrawElement[],
        );
        excalidrawAPI.history.clear();
      } catch {
        // New/empty tab – just clear the canvas
        excalidrawAPI.resetScene();
      }

      setActiveTabId(newTabId);
      setActiveTabOnServer(newTabId).catch(console.error);
    },
    [excalidrawAPI, setActiveTabId, loadMissingFilesForElements],
  );

  const handleTabAdd = useCallback(async () => {
    try {
      const name = uniqueTabName(tabsRef.current);
      const newTab = await createTab(name);
      setTabs((prev) => [...prev, newTab]);
      await handleTabSwitch(newTab.id);
    } catch (err) {
      console.error("[TabAdd] Failed to create tab:", err);
    }
  }, [handleTabSwitch, setTabs]);

  // Insert an SVG icon into the Excalidraw canvas.
  // Colour is taken from the current Excalidraw stroke tool settings so the
  // native properties panel controls the look of the icon both at insert time
  // and afterwards (see onChange for the live-update logic).
  const handleIconInsert = useCallback(
    (entry: IconEntry) => {
      if (!excalidrawAPI) {
        return;
      }

      const appState = excalidrawAPI.getAppState();
      // Use the icon's own brand/original colour; fall back to the tool's
      // current stroke only for plain stroke icons that have no brand colour.
      const color =
        entry.brandColor ??
        (entry.renderType === "stroke"
          ? appState.currentItemStrokeColor || "#1e1e2e"
          : "#1e1e2e");
      const strokeWidth = appState.currentItemStrokeWidth ?? 2;

      const svgString = buildIconSVG(entry, color, strokeWidth);
      const fileId = crypto.randomUUID() as unknown as FileId;
      const dataURL = `data:image/svg+xml,${encodeURIComponent(
        svgString,
      )}` as DataURL;

      excalidrawAPI.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: "image/svg+xml",
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      ]);

      const SIZE = 96;
      const x =
        (-appState.scrollX + window.innerWidth / 2) / appState.zoom.value -
        SIZE / 2;
      const y =
        (-appState.scrollY + window.innerHeight / 2) / appState.zoom.value -
        SIZE / 2;

      const elementId = crypto.randomUUID();

      // Register so onChange can regenerate the SVG when the user changes colours
      iconEntryRef.current.set(elementId, entry);
      iconStyleRef.current.set(elementId, { color, strokeWidth });

      excalidrawAPI.updateScene({
        elements: [
          ...excalidrawAPI.getSceneElements(),
          {
            id: elementId,
            type: "image",
            x,
            y,
            width: SIZE,
            height: SIZE,
            fileId,
            status: "saved",
            angle: 0,
            // Expose strokeColor so Excalidraw's properties panel reflects it
            strokeColor: color,
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            seed: Math.floor(Math.random() * 2147483646),
            version: 1,
            versionNonce: Math.floor(Math.random() * 2147483646),
            isDeleted: false,
            groupIds: [],
            frameId: null,
            boundElements: null,
            customData: { localdrawIconId: entry.id },
            updated: Date.now(),
            link: null,
            locked: false,
            scale: [1, 1],
            roundness: null,
            crop: null,
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPI],
  );

  const handleTabClose = useCallback(
    async (tabId: string) => {
      if (tabsRef.current.length === 1) {
        return;
      }
      try {
        // ── Snapshot the scene before deletion so it can be reopened ──────
        const tabMeta = tabsRef.current.find((t) => t.id === tabId);
        if (tabMeta) {
          let closedElements: readonly ExcalidrawElement[] = [];
          let closedAppState: Partial<AppState> = {};
          if (activeTabIdRef.current === tabId && excalidrawAPI) {
            diskFlushSave();
            closedElements = excalidrawAPI.getSceneElements();
            closedAppState = excalidrawAPI.getAppState();
          } else {
            try {
              const sceneData = await loadScene(tabId);
              closedElements = sceneData.elements as ExcalidrawElement[];
              closedAppState = sceneData.appState;
            } catch {
              // Scene file missing — store empty scene
            }
          }
          setRecentlyClosedTabs((prev) =>
            [
              {
                name: tabMeta.name,
                elements: closedElements,
                appState: closedAppState,
              },
              ...prev,
            ].slice(0, 10),
          );
        }
        // ──────────────────────────────────────────────────────────────────

        const result = await deleteTab(tabId);
        setTabs((prev) => prev.filter((t) => t.id !== tabId));

        if (activeTabIdRef.current === tabId && result.activeTabId) {
          const sceneData = await loadScene(result.activeTabId);
          excalidrawAPI?.updateScene({
            elements: restoreElements(
              sceneData.elements as ExcalidrawElement[],
              null,
              {
                repairBindings: true,
                deleteInvisibleElements: true,
              },
            ),
            appState: restoreAppState(
              sceneData.appState,
              excalidrawAPI.getAppState(),
            ),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          await loadMissingFilesForElements(
            sceneData.elements as ExcalidrawElement[],
          );
          excalidrawAPI?.history.clear();
          setActiveTabId(result.activeTabId);
        }
      } catch (err) {
        console.error("[TabClose] Failed to delete tab:", err);
      }
    },
    [
      excalidrawAPI,
      setTabs,
      setActiveTabId,
      setRecentlyClosedTabs,
      loadMissingFilesForElements,
    ],
  );

  const handleTabRename = useCallback(
    async (tabId: string, name: string) => {
      // Guard: ignore if name collides with another tab (TabBar already reverted UI)
      const isDuplicate = tabsRef.current.some(
        (t) => t.id !== tabId && t.name.toLowerCase() === name.toLowerCase(),
      );
      if (isDuplicate) {
        return;
      }
      try {
        const updated = await renameTab(tabId, name);
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, name: updated.name } : t)),
        );
      } catch (err) {
        console.error("[TabRename] Failed to rename tab:", err);
      }
    },
    [setTabs],
  );

  const handleReopenTab = useCallback(
    async (index: number) => {
      const entry = recentlyClosedTabs[index];
      if (!entry) {
        return;
      }
      // Remove this entry from the stack
      setRecentlyClosedTabs((prev) => prev.filter((_, i) => i !== index));
      try {
        const newTab = await createTab(
          uniqueTabName(tabsRef.current, entry.name),
        );
        const baseAppState = excalidrawAPI?.getAppState() ?? ({} as AppState);
        await saveSceneNow(
          newTab.id,
          entry.elements,
          { ...baseAppState, ...entry.appState } as AppState,
          entry.name,
        );
        setTabs((prev) => [...prev, newTab]);
        await handleTabSwitch(newTab.id);
      } catch (err) {
        console.error("[ReopenTab] Failed to reopen tab:", err);
      }
    },
    [
      recentlyClosedTabs,
      excalidrawAPI,
      setTabs,
      setRecentlyClosedTabs,
      handleTabSwitch,
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      className={clsx("excalidraw excalidraw-app", {
        "is-collaborating": isCollaborating,
        "theme--dark": editorTheme === THEME.DARK,
      })}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSwitch={handleTabSwitch}
        onTabAdd={handleTabAdd}
        onTabClose={handleTabClose}
        onTabRename={handleTabRename}
      />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* ── Icon picker panel (global overlay) ─────────────────────────── */}
        <IconPicker onInsert={handleIconInsert} />

        <Excalidraw
          excalidrawAPI={excalidrawRefCallback}
          onChange={onChange}
          initialData={initialStatePromiseRef.current.promise}
          isCollaborating={isCollaborating}
          onPointerUpdate={collabAPI?.onPointerUpdate}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
              export: {
                onExportToBackend,
              },
            },
          }}
          langCode={langCode}
          renderCustomStats={renderCustomStats}
          detectScroll={false}
          handleKeyboardGlobally={true}
          autoFocus={true}
          theme={editorTheme}
          validateEmbeddable={validateEmbeddableUrl}
          renderToolbarExtra={() => (
            <button
              className={`ip-toolbar-btn${
                iconPickerOpen ? " ip-toolbar-btn--active" : ""
              }`}
              onMouseDown={(e) => {
                // Prevent canvas handlers from consuming the toolbar click.
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect();
                setIconPickerAnchor({
                  bottom: rect.bottom,
                  centerX: rect.left + rect.width / 2,
                });
                // Always open on button click; close via outside click / Esc.
                setIconPickerOpen(true);
              }}
              title="Insert icon"
              type="button"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
              Icons
            </button>
          )}
          renderTopRightUI={(isMobile) => {
            if (isMobile || !collabAPI || isCollabDisabled) {
              return null;
            }
            if (!collabError.message) {
              return null;
            }
            return (
              <div className="excalidraw-ui-top-right">
                <CollabError collabError={collabError} />
              </div>
            );
          }}
          onLinkOpen={(element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.scrollToContent(element.link, { animate: true });
            }
          }}
        >
          <AppMainMenu
            theme={appTheme}
            setTheme={(theme) => setAppTheme(theme)}
            refresh={() => forceRefresh((prev) => !prev)}
          />
          <AppWelcomeScreen />
          <OverwriteConfirmDialog>
            <OverwriteConfirmDialog.Actions.ExportToImage />
            <OverwriteConfirmDialog.Actions.SaveToDisk />
          </OverwriteConfirmDialog>
          <AppFooter onChange={() => excalidrawAPI?.refresh()} />
          {excalidrawAPI && (
            <AIComponents
              excalidrawAPI={excalidrawAPI}
              activeTabId={activeTabId}
            />
          )}

          <TTDDialogTrigger />
          {isCollaborating && isOffline && (
            <div className="alertalert--warning">
              {t("alerts.collabOfflineWarning")}
            </div>
          )}
          {localStorageQuotaExceeded && (
            <div className="alert alert--danger">
              {t("alerts.localStorageQuotaExceeded")}
            </div>
          )}
          {latestShareableLink && (
            <ShareableLinkDialog
              link={latestShareableLink}
              onCloseRequest={() => setLatestShareableLink(null)}
              setErrorMessage={setErrorMessage}
            />
          )}
          {excalidrawAPI && !isCollabDisabled && (
            <Collab excalidrawAPI={excalidrawAPI} />
          )}

          <AISettingsDialog />
          <AIPreferencesDialog />

          {errorMessage && (
            <ErrorDialog onClose={() => setErrorMessage("")}>
              {errorMessage}
            </ErrorDialog>
          )}

          <CommandPalette
            customCommandPaletteItems={[
              {
                ...CommandPalette.defaultItems.toggleTheme,
                perform: () => {
                  setAppTheme(
                    editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                  );
                },
              },
              {
                label: t("labels.installPWA"),
                category: DEFAULT_CATEGORIES.app,
                predicate: () => !!pwaEvent,
                perform: () => {
                  if (pwaEvent) {
                    pwaEvent.prompt();
                    pwaEvent.userChoice.then(() => {
                      // event cannot be reused, but we'll hopefully
                      // grab new one as the event should be fired again
                      pwaEvent = null;
                    });
                  }
                },
              },

              // ── Tab management ───────────────────────────────────────────
              {
                label: "New Tab",
                category: "Tabs",
                predicate: true,
                keywords: [
                  "tab",
                  "canvas",
                  "drawing",
                  "create",
                  "add",
                  "new",
                  "open",
                ],
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    <line x1="12" y1="14" x2="12" y2="18" />
                    <line x1="10" y1="16" x2="14" y2="16" />
                  </svg>
                ),
                perform: () => handleTabAdd(),
              },
              {
                label: "Close Current Tab",
                category: "Tabs",
                predicate: tabs.length > 1,
                keywords: [
                  "tab",
                  "canvas",
                  "drawing",
                  "close",
                  "remove",
                  "delete",
                ],
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    <line x1="10" y1="14" x2="14" y2="18" />
                    <line x1="14" y1="14" x2="10" y2="18" />
                  </svg>
                ),
                perform: () => {
                  if (activeTabId) {
                    handleTabClose(activeTabId);
                  }
                },
              },
              // One entry per recently-closed tab — lets users reopen by name
              ...recentlyClosedTabs.map((entry, index) => ({
                label: `Reopen: ${entry.name}`,
                category: "Tabs",
                predicate: true,
                keywords: [
                  "reopen",
                  "restore",
                  "closed",
                  "undo",
                  "tab",
                  entry.name.toLowerCase(),
                ],
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    <path d="M8 15 L12 11 L16 15" />
                    <line x1="12" y1="11" x2="12" y2="18" />
                  </svg>
                ),
                perform: () => handleReopenTab(index),
              })),

              // One entry per existing tab — lets users jump to any tab by name
              ...tabs.map((tab) => ({
                label:
                  tab.id === activeTabId ? `${tab.name} (active)` : tab.name,
                category: "Tabs",
                predicate: true,
                keywords: [
                  "tab",
                  "canvas",
                  "drawing",
                  "switch",
                  "go",
                  "open",
                  tab.name.toLowerCase(),
                ],
                icon: (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    {tab.id === activeTabId && (
                      <circle
                        cx="12"
                        cy="15"
                        r="1.5"
                        fill="currentColor"
                        stroke="none"
                      />
                    )}
                  </svg>
                ),
                perform: () => handleTabSwitch(tab.id),
              })),
            ]}
          />
          {isVisualDebuggerEnabled() && excalidrawAPI && (
            <DebugCanvas
              appState={excalidrawAPI.getAppState()}
              scale={window.devicePixelRatio}
              ref={debugCanvasRef}
            />
          )}
        </Excalidraw>
      </div>
    </div>
  );
};

const ExcalidrawApp = () => {
  const isCloudExportWindow =
    window.location.pathname === "/excalidraw-plus-export";
  if (isCloudExportWindow) {
    return <ExcalidrawPlusIframeExport />;
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawWrapper />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
