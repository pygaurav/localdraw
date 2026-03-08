import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
  TTDStreamFetch,
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
import { fetchOllamaDiagramToCode } from "../data/ollamaDiagramToCodeFetch";
import { OllamaSettings } from "../data/OllamaSettings";
import { ollamaStreamFetch } from "../data/ollamaStreamFetch";
import {
  OnlineModelSettings,
  AiModeSettings,
} from "../data/OnlineModelSettings";
import { onlineModelStreamFetch } from "../data/onlineModelStreamFetch";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const DEFAULT_CLOUD_AI_BACKEND = "https://oss-ai.excalidraw.com";

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

const hasConfiguredOnlineModel = (
  config: ReturnType<typeof OnlineModelSettings.get>,
) => Boolean(config.baseUrl.trim() && config.model.trim());

const getResolvedAiConfig = () => {
  const aiMode = AiModeSettings.get();

  if (aiMode === "ollama") {
    return {
      mode: "ollama" as const,
      ollamaConfig: OllamaSettings.get(),
    };
  }

  const onlineConfig = OnlineModelSettings.get();
  if (aiMode === "online" || hasConfiguredOnlineModel(onlineConfig)) {
    return {
      mode: "online" as const,
      onlineConfig,
    };
  }

  return {
    mode: "default" as const,
  };
};

const getCloudAiBackendUrl = () => {
  const configuredUrl = import.meta.env.VITE_APP_AI_BACKEND?.trim();

  if (
    !configuredUrl ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1):3016\/?$/i.test(configuredUrl)
  ) {
    return DEFAULT_CLOUD_AI_BACKEND;
  }

  return configuredUrl.replace(/\/$/, "");
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
      usesCloudFallback: boolean;
    }
  | {
      ok: false;
      error: DiagramToCodeFetchError;
      usesCloudFallback: boolean;
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
  const resolvedAiConfig = getResolvedAiConfig();

  if (resolvedAiConfig.mode === "ollama") {
    const { url, model } = resolvedAiConfig.ollamaConfig;
    return {
      ok: true,
      html: await fetchOllamaDiagramToCode({
        baseUrl: url,
        model,
        texts,
        image,
        theme,
      }),
      usesCloudFallback: false,
    };
  }

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
        usesCloudFallback: false,
      };
    }

    const { html } = await response.json();
    if (!html) {
      throw new Error("Generation failed (invalid response)");
    }

    return {
      ok: true,
      html,
      usesCloudFallback: false,
    };
  }

  const response = await fetch(
    `${getCloudAiBackendUrl()}/v1/ai/diagram-to-code/generate`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      usesCloudFallback: true,
    };
  }

  const { html } = await response.json();
  if (!html) {
    throw new Error("Generation failed (invalid response)");
  }

  return {
    ok: true,
    html,
    usesCloudFallback: true,
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
            const { text, errorJSON, status } = result.error;
            if (!errorJSON) {
              throw new Error(text);
            }

            if (
              result.usesCloudFallback &&
              (status === 429 || errorJSON.statusCode === 429)
            ) {
              return {
                html: `<html>
                <body style="margin: 0; text-align: center">
                <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100vh; padding: 0 60px">
                  <div style="color:red">Too many requests today,</br>please try again tomorrow!</div>
                  </br>
                  </br>
                  <div>You can also try <a href="${
                    import.meta.env.VITE_APP_PLUS_LP
                  }/plus?utm_source=excalidraw&utm_medium=app&utm_content=d2c" target="_blank" rel="noopener">Excalidraw+</a> to get more requests.</div>
                </div>
                </body>
                </html>`,
              };
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
          const resolvedAiConfig = getResolvedAiConfig();

          // ── Ollama (local) mode ───────────────────────────────────────────
          if (resolvedAiConfig.mode === "ollama") {
            const { url, model } = resolvedAiConfig.ollamaConfig;
            return ollamaStreamFetch({
              baseUrl: url,
              model,
              messages,
              onChunk,
              onStreamCreated,
              signal,
            });
          }

          // ── Online model mode (proxied, Anthropic or OpenAI-compatible) ───
          if (resolvedAiConfig.mode === "online") {
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
          }

          // ── Default: Excalidraw cloud backend ─────────────────────────────
          const result = await TTDStreamFetch({
            url: `${getCloudAiBackendUrl()}/v1/ai/text-to-diagram/chat-streaming`,
            messages,
            onChunk,
            onStreamCreated,
            extractRateLimits: true,
            signal,
          });

          return result;
        }}
        persistenceAdapter={persistenceAdapter}
      />
    </>
  );
};
