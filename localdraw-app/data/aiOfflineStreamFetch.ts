/**
 * Streaming fetch adapter for the local Ollama API.
 *
 * Ollama's `/api/chat` endpoint returns NDJSON (one JSON object per line)
 * when `stream: true`. Each line looks like:
 *   {"model":"llama3","message":{"role":"assistant","content":"..."},"done":false}
 *
 * This adapter reads that stream and returns a result object with the same
 * shape as `TTDStreamFetch`, so it can be used as a drop-in replacement in
 * the `TTDDialog.onTextSubmit` handler.
 */

import { RequestError } from "@excalidraw/excalidraw/errors";

import type { LLMMessage } from "@excalidraw/excalidraw/components/TTDDialog/types";
import type { TTTDDialog } from "@excalidraw/excalidraw/components/TTDDialog/types";

import { buildSystemPrompt } from "./aiSystemPrompt";

interface OllamaStreamOptions {
  /** Ollama base URL, e.g. http://localhost:11434 */
  baseUrl: string;
  /** Model to use, e.g. "llama3" */
  model: string;
  /** Conversation messages to send */
  messages: readonly LLMMessage[];
  /** Called for each content chunk */
  onChunk?: (chunk: string) => void;
  /** Called once the stream has been created (response starts) */
  onStreamCreated?: () => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaStreamChunk {
  model?: string;
  message?: OllamaMessage;
  done: boolean;
  error?: string;
}

function buildMessages(messages: readonly LLMMessage[]): OllamaMessage[] {
  const system: OllamaMessage = {
    role: "system",
    content: buildSystemPrompt(),
  };
  return [system, ...messages];
}

export async function offlineAIStreamFetch(
  options: OllamaStreamOptions,
): Promise<TTTDDialog.OnTextSubmitRetValue> {
  const { baseUrl, model, messages, onChunk, onStreamCreated, signal } =
    options;

  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(messages),
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      let errorMsg = `Ollama request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body?.error) {
          errorMsg = body.error;
        }
      } catch {
        // ignore JSON parse errors
      }
      return {
        error: new RequestError({ message: errorMsg, status: response.status }),
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        error: new RequestError({
          message: "Could not get reader from Ollama response",
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // NDJSON: split on newlines and process each complete line
        const lines = buffer.split("\n");
        // keep any incomplete last line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const chunk: OllamaStreamChunk = JSON.parse(trimmed);

            if (chunk.error) {
              streamError = new RequestError({
                message: chunk.error,
                status: 500,
              });
              break;
            }

            const delta = chunk.message?.content;
            if (delta) {
              fullResponse += delta;
              onChunk?.(delta);
            }

            if (chunk.done) {
              break;
            }
          } catch {
            // skip malformed lines
            console.warn("[Ollama] Could not parse NDJSON line:", trimmed);
          }
        }

        if (streamError) {
          break;
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return {
          error: new RequestError({ message: "Request aborted", status: 499 }),
        };
      }
      streamError = new RequestError({
        message: err?.message ?? "Streaming error",
        status: 500,
      });
    } finally {
      reader.releaseLock();
    }

    if (streamError) {
      return { error: streamError };
    }

    if (!fullResponse) {
      return {
        error: new RequestError({
          message: "Ollama returned an empty response",
          status: 500,
        }),
      };
    }

    return { generatedResponse: fullResponse, error: null };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return {
        error: new RequestError({ message: "Request aborted", status: 499 }),
      };
    }

    const isConnectionError =
      err instanceof TypeError && err.message.includes("fetch");

    return {
      error: new RequestError({
        message: isConnectionError
          ? `Cannot connect to Ollama at ${baseUrl}. Make sure Ollama is running (\`ollama serve\`).`
          : err?.message ?? "Ollama request failed",
        status: 503,
      }),
    };
  }
}
