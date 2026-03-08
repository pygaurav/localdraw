type DiagramToCodeTheme = "light" | "dark";

interface FetchOfflineDiagramToCodeOptions {
  baseUrl: string;
  model: string;
  texts: string;
  image: string;
  theme: DiagramToCodeTheme;
  signal?: AbortSignal;
}

interface OllamaChatPayload {
  message?: {
    content?: string;
  };
  response?: string;
}

const DIAGRAM_TO_CODE_SYSTEM_PROMPT = `
You convert UI diagrams and wireframes into polished single-file HTML prototypes.
Return only a complete HTML document.
Do not use Markdown fences, explanations, or comments outside the HTML.
Use semantic HTML, inline CSS, and only minimal inline JavaScript when necessary.
Do not rely on external assets, CDNs, fonts, or network requests.
Make the result responsive, visually coherent, and faithful to the provided diagram.
If some text or controls are unclear, infer sensible defaults while preserving the overall structure.
`.trim();

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeUrl(value: string) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
    String(value || ""),
  );

  if (!match) {
    return null;
  }

  return {
    mediaType: match[1],
    base64: match[2],
  };
}

export function extractHtmlDocument(value: string) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const fencedMatch = trimmed.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  const unwrapped = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const doctypeIndex = unwrapped.search(/<!DOCTYPE html>/i);
  if (doctypeIndex >= 0) {
    const htmlEndIndex = unwrapped.search(/<\/html>/i);
    return (
      htmlEndIndex >= 0
        ? unwrapped.slice(doctypeIndex, htmlEndIndex + "</html>".length)
        : unwrapped.slice(doctypeIndex)
    ).trim();
  }

  const htmlIndex = unwrapped.search(/<html[\s>]/i);
  if (htmlIndex >= 0) {
    const htmlEndIndex = unwrapped.search(/<\/html>/i);
    return (
      htmlEndIndex >= 0
        ? unwrapped.slice(htmlIndex, htmlEndIndex + "</html>".length)
        : unwrapped.slice(htmlIndex)
    ).trim();
  }

  return unwrapped;
}

function requireHtmlOutput(html: string) {
  const normalizedHtml = extractHtmlDocument(html);

  if (!normalizedHtml) {
    throw new Error("AI provider returned an empty HTML response");
  }

  return normalizedHtml;
}

function buildDiagramToCodePrompt({
  texts,
  theme,
}: {
  texts: string;
  theme: DiagramToCodeTheme;
}) {
  const normalizedTexts = typeof texts === "string" ? texts.trim() : "";
  const normalizedTheme = theme === "light" ? "light" : "dark";

  return [
    "Create a faithful HTML/CSS implementation of the provided diagram.",
    `Preferred theme: ${normalizedTheme}.`,
    normalizedTexts
      ? `Text detected in the diagram:\n${normalizedTexts}`
      : "No readable text was detected in the diagram. Infer sensible UI copy.",
    "Return a complete HTML document that fills the viewport.",
    "Use inline CSS only. Avoid external libraries, remote images, and remote fonts.",
    "Use placeholder shapes, gradients, or icons when assets are implied but not present.",
  ].join("\n\n");
}

function buildTextOnlyDiagramToCodePrompt({
  texts,
  theme,
}: {
  texts: string;
  theme: DiagramToCodeTheme;
}) {
  return [
    buildDiagramToCodePrompt({ texts, theme }),
    "The current model only accepts text input. The diagram image could not be attached.",
    "Infer the layout from the extracted text and common UI patterns, then return the best possible HTML prototype.",
  ].join("\n\n");
}

export function shouldRetryDiagramToCodeAsTextOnly(error: unknown) {
  const message = String(
    (error as { message?: string })?.message || "",
  ).toLowerCase();

  return [
    "content must be a string",
    "messages[1].content must be a string",
    "expected a string",
    "invalid type for 'messages",
    "image_url",
    "images are not supported",
    "vision is not supported",
    "multimodal",
  ].some((needle) => message.includes(needle));
}

function getOllamaResponseText(payload: OllamaChatPayload) {
  if (typeof payload?.message?.content === "string") {
    return payload.message.content;
  }

  if (typeof payload?.response === "string") {
    return payload.response;
  }

  return "";
}

async function buildOllamaError(response: Response) {
  const text = await response.text();
  const json = safeJsonParse(text) as {
    error?: { message?: string } | string;
    message?: string;
    detail?: string;
  } | null;
  const message =
    (typeof json?.error === "object" && json?.error?.message) ||
    (typeof json?.error === "string" ? json.error : "") ||
    json?.message ||
    json?.detail ||
    text ||
    `Ollama request failed (${response.status})`;

  const error = new Error(message) as Error & { status?: number };
  error.status = response.status;
  return error;
}

function normalizeOllamaError(error: unknown, baseUrl: string) {
  if ((error as { name?: string })?.name === "AbortError") {
    return new Error("Request aborted");
  }

  const isConnectionError =
    error instanceof TypeError &&
    (error.message.includes("fetch") || error.message.includes("Failed"));

  if (isConnectionError) {
    return new Error(
      `Cannot connect to Ollama at ${baseUrl}. Make sure Ollama is running (\`ollama serve\`).`,
    );
  }

  return error instanceof Error ? error : new Error("Ollama request failed");
}

async function requestOllamaDiagramToCode({
  baseUrl,
  body,
  signal,
}: {
  baseUrl: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const response = await fetch(`${normalizeUrl(baseUrl)}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw await buildOllamaError(response);
  }

  return (await response.json()) as OllamaChatPayload;
}

export async function fetchOfflineDiagramToCode({
  baseUrl,
  model,
  texts,
  image,
  theme,
  signal,
}: FetchOfflineDiagramToCodeOptions) {
  const parsedImage = parseDataUrl(image);

  if (!parsedImage) {
    throw new Error("diagram image must be a base64 data URL");
  }

  try {
    try {
      const payload = await requestOllamaDiagramToCode({
        baseUrl,
        signal,
        body: {
          model,
          stream: false,
          messages: [
            {
              role: "system",
              content: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildDiagramToCodePrompt({ texts, theme }),
              images: [parsedImage.base64],
            },
          ],
          options: {
            temperature: 0.2,
          },
        },
      });

      return requireHtmlOutput(getOllamaResponseText(payload));
    } catch (error) {
      if (!shouldRetryDiagramToCodeAsTextOnly(error)) {
        throw error;
      }

      if (!String(texts || "").trim()) {
        throw new Error(
          "The configured model does not support image input and the frame contains no text to fall back on. Use a vision-capable model.",
        );
      }

      const payload = await requestOllamaDiagramToCode({
        baseUrl,
        signal,
        body: {
          model,
          stream: false,
          messages: [
            {
              role: "system",
              content: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildTextOnlyDiagramToCodePrompt({ texts, theme }),
            },
          ],
          options: {
            temperature: 0.2,
          },
        },
      });

      return requireHtmlOutput(getOllamaResponseText(payload));
    }
  } catch (error) {
    throw normalizeOllamaError(error, baseUrl);
  }
}
