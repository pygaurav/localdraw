import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
} from "@excalidraw/excalidraw";
import { getDataURL } from "@excalidraw/excalidraw/data/blob";
import { safelyParseJSON, randomId } from "@localdraw/common";
import { useMemo, useRef } from "react";

// Import the singleton editor Jotai store and every TTD atom so we can
// reset them synchronously (before render) when the active tab changes.
import { editorJotaiStore } from "@excalidraw/excalidraw/editor-jotai";
import {
  chatHistoryAtom,
  errorAtom,
  rateLimitsAtom,
} from "@excalidraw/excalidraw/components/TTDDialog/TTDContext";
import {
  savedChatsAtom,
  chatsLoadedAtom,
  isLoadingChatsAtom,
} from "@excalidraw/excalidraw/components/TTDDialog/useTTDChatStorage";

import { DISK_STORAGE_SERVER_URL } from "../app_constants";
import { DiskTTDAdapter } from "../data/TTDStorage";
import { fetchOfflineDiagramToCode } from "../data/aiOfflineDiagramToCodeFetch";
import { offlineAIStreamFetch } from "../data/aiOfflineStreamFetch";
import { AISettings } from "../data/AISettings";
import { onlineModelStreamFetch } from "../data/onlineModelStreamFetch";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Reset all TTD dialog atoms to a blank state in the editor Jotai store. */
function resetTTDAtoms() {
  editorJotaiStore.set(chatHistoryAtom, {
    id: randomId(),
    messages: [],
    currentPrompt: "",
  });
  editorJotaiStore.set(savedChatsAtom, []);
  editorJotaiStore.set(chatsLoadedAtom, false);
  editorJotaiStore.set(isLoadingChatsAtom, false);
  editorJotaiStore.set(errorAtom, null);
  editorJotaiStore.set(rateLimitsAtom, null);
}

const getResolvedAiConfig = async () => {
  const aiSettings = await AISettings.ensureLoaded();

  if (aiSettings.mode === "online") {
    return {
      mode: "online" as const,
      onlineConfig: aiSettings.onlineProviders[aiSettings.onlineProvider],
    };
  }

  return {
    mode: "offline" as const,
    offlineConfig: aiSettings.offlineModel,
  };
};

const getErrorMessage = (errorJSON: any, fallbackText: string) =>
  errorJSON?.message ||
  errorJSON?.error?.message ||
  errorJSON?.error ||
  fallbackText;

type DiagramToCodeFetchError = {
  status: number;
  text: string;
  errorJSON: Record<string, any> | null;
};

type DiagramToCodeFetchResult =
  | {
      ok: true;
      html: string;
    }
  | {
      ok: false;
      error: DiagramToCodeFetchError;
    };

const fetchDiagramToCode = async ({
  texts,
  image,
  theme,
}: {
  texts: string;
  image: string;
  theme: "light" | "dark";
}): Promise<DiagramToCodeFetchResult> => {
  const resolvedAiConfig = await getResolvedAiConfig();

  if (resolvedAiConfig.mode === "online") {
    const { baseUrl, apiKey, model, apiFormat } = resolvedAiConfig.onlineConfig;
    const response = await fetch(
      `${DISK_STORAGE_SERVER_URL}/api/ai/diagram-to-code/generate`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: apiFormat === "anthropic" ? "anthropic" : "openai",
          baseUrl,
          apiKey,
          model,
          texts,
          image,
          theme,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: {
          status: response.status,
          text,
          errorJSON: safelyParseJSON(text),
        },
      };
    }

    const { html } = await response.json();
    if (!html) {
      throw new Error("Generation failed (invalid response)");
    }

    return {
      ok: true,
      html,
    };
  }

  const { url, model } = resolvedAiConfig.offlineConfig;

  return {
    ok: true,
    html: await fetchOfflineDiagramToCode({
      baseUrl: url,
      model,
      texts,
      image,
      theme,
    }),
  };
};

export const AIComponents = ({
  excalidrawAPI,
  activeTabId,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  activeTabId: string | null;
}) => {
  const tabId = activeTabId ?? "default";

  // Track the previous tabId. When it changes, reset all TTD atoms
  // synchronously in the render phase — before any child renders — so the
  // dialog never sees stale data from the previous tab.
  const prevTabIdRef = useRef<string>(tabId);
  if (prevTabIdRef.current !== tabId) {
    prevTabIdRef.current = tabId;
    resetTTDAtoms();
  }

  const persistenceAdapter = useMemo(() => new DiskTTDAdapter(tabId), [tabId]);
  return (
    <>
      <DiagramToCodePlugin
        generate={async ({ frame, children }) => {
          const appState = excalidrawAPI.getAppState();

          const blob = await exportToBlob({
            elements: children,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            exportingFrame: frame,
            files: excalidrawAPI.getFiles(),
            mimeType: MIME_TYPES.jpg,
          });

          const dataURL = await getDataURL(blob);

          const textFromFrameChildren = getTextFromElements(children);

          const result = await fetchDiagramToCode({
            texts: textFromFrameChildren,
            image: dataURL,
            theme: appState.theme,
          });

          if (!result.ok) {
            const { text, errorJSON } = result.error;
            if (!errorJSON) {
              throw new Error(text);
            }

            throw new Error(getErrorMessage(errorJSON, text));
          }

          return {
            html: result.html,
          };
        }}
      />

      <TTDDialog
        key={tabId}
        onTextSubmit={async (props) => {
          const { onChunk, onStreamCreated, signal, messages } = props;

          // ── Resolve active AI mode ────────────────────────────────────
          const resolvedAiConfig = await getResolvedAiConfig();

          // ── Offline (Ollama) mode ─────────────────────────────────────────
          if (resolvedAiConfig.mode === "offline") {
            const { url, model } = resolvedAiConfig.offlineConfig;
            return offlineAIStreamFetch({
              baseUrl: url,
              model,
              messages,
              onChunk,
              onStreamCreated,
              signal,
            });
          }

          const { baseUrl, apiKey, model, apiFormat } =
            resolvedAiConfig.onlineConfig;
          return onlineModelStreamFetch({
            baseUrl,
            apiKey,
            model,
            apiFormat,
            messages,
            onChunk,
            onStreamCreated,
            signal,
          });
        }}
        persistenceAdapter={persistenceAdapter}
      />
    </>
  );
};
