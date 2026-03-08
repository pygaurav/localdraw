/**
 * Streaming fetch adapter for online AI APIs.
 *
 * All provider-specific logic (endpoint, auth headers, SSE parsing) is
 * handled server-side by LangChain via the /api/ai/stream endpoint.
 * The browser just sends a unified request and reads a simple SSE stream.
 *
 * Supported providers (set apiFormat in the dialog):
 *   "openai"    → ChatOpenAI  (OpenAI · Groq · Together · Mistral · LM Studio …)
 *   "anthropic" → ChatAnthropic (Claude · any Anthropic-compatible proxy)
 */

import { RequestError } from "@excalidraw/excalidraw/errors";

import type { LLMMessage } from "@excalidraw/excalidraw/components/TTDDialog/types";
import type { TTTDDialog } from "@excalidraw/excalidraw/components/TTDDialog/types";

import { DISK_STORAGE_SERVER_URL } from "../app_constants";

import { buildSystemPrompt } from "./aiSystemPrompt";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnlineModelStreamOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Explicit API format — stored in user prefs and set via the dialog's
   * "API Format" radio buttons.
   *   "openai"    → ChatOpenAI (OpenAI-compatible APIs)
   *   "anthropic" → ChatAnthropic (Anthropic Messages API)
   */
  apiFormat?: "openai" | "anthropic";
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
}

// ─── SSE stream reader ────────────────────────────────────────────────────────

/**
 * Parse the simple SSE format emitted by /api/ai/stream:
 *   data: {"chunk":"..."}  — text delta
 *   data: [DONE]            — stream finished
 *   data: {"error":"..."}  — server-side error
 */
async function readAiStream(
  response: Response,
  onChunk?: (chunk: string) => void,
  onStreamCreated?: () => void,
): Promise<{ fullResponse: string; error: RequestError | null }> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      fullResponse: "",
      error: new RequestError({
        message: "Could not get reader from response",
        status: 500,
      }),
    };
  }

  onStreamCreated?.();

  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";
  let streamError: RequestError | null = null;

  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }

        if (trimmed === "data: [DONE]") {
          break outer;
        }

        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) {
          continue;
        }

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (data.error && typeof data.error === "string") {
          streamError = new RequestError({
            message: data.error,
            status: 500,
          });
          break outer;
        }

        if (data.chunk && typeof data.chunk === "string") {
          fullResponse += data.chunk;
          onChunk?.(data.chunk);
        }
      }
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") {
      return {
        fullResponse: "",
        error: new RequestError({ message: "Request aborted", status: 499 }),
      };
    }
    streamError = new RequestError({
      message: (err as Error)?.message ?? "Streaming error",
      status: 500,
    });
  } finally {
    reader.releaseLock();
  }

  return { fullResponse, error: streamError };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function onlineModelStreamFetch(
  options: OnlineModelStreamOptions,
): Promise<TTTDDialog.OnTextSubmitRetValue> {
  const {
    baseUrl,
    apiKey,
    model,
    apiFormat,
    messages,
    onChunk,
    onStreamCreated,
    signal,
  } = options;

  const serverUrl = `${DISK_STORAGE_SERVER_URL}/api/ai/stream`;

  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: apiFormat === "anthropic" ? "anthropic" : "openai",
        baseUrl,
        apiKey,
        model,
        systemPrompt: buildSystemPrompt(),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.error === "string") {
          message = body.error;
        }
      } catch {
        // ignore
      }
      return {
        error: new RequestError({ message, status: response.status }),
      };
    }

    const { fullResponse, error } = await readAiStream(
      response,
      onChunk,
      onStreamCreated,
    );

    if (error) {
      return { error };
    }
    if (!fullResponse) {
      return {
        error: new RequestError({
          message: "Online model returned an empty response",
          status: 500,
        }),
      };
    }
    return { generatedResponse: fullResponse, error: null };
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") {
      return {
        error: new RequestError({ message: "Request aborted", status: 499 }),
      };
    }
    const isNetworkError =
      err instanceof TypeError &&
      (err.message.includes("fetch") || err.message.includes("Failed"));
    return {
      error: new RequestError({
        message: isNetworkError
          ? "Cannot connect to the LocalDraw backend. Make sure the server is running."
          : (err as Error)?.message ?? "Online model request failed",
        status: 503,
      }),
    };
  }
}
