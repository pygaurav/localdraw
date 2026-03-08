const fs = require("fs/promises");
const path = require("path");
const https = require("https");
const http = require("http");

const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 6002;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const SCENES_DIR = path.join(DATA_DIR, "scenes");
const CHATS_DIR = path.join(DATA_DIR, "chats");
const TABS_FILE = path.join(DATA_DIR, "tabs.json");
const PREFS_FILE = path.join(DATA_DIR, "prefs.json");

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDataDirs() {
  await fs.mkdir(SCENES_DIR, { recursive: true });
  await fs.mkdir(CHATS_DIR, { recursive: true });
}

const chatFilePath = (tabId) => path.join(CHATS_DIR, `${tabId}.json`);

async function readTabsFile() {
  try {
    const raw = await fs.readFile(TABS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

async function writeTabsFile(data) {
  await fs.writeFile(TABS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function sceneFilePath(id) {
  return path.join(SCENES_DIR, `${id}.localdraw`);
}

// ---------------------------------------------------------------------------
// Tabs routes
// ---------------------------------------------------------------------------

/** GET /api/tabs — list all tabs + active tab id */
app.get("/api/tabs", async (_req, res) => {
  try {
    const data = await readTabsFile();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read tabs" });
  }
});

/** POST /api/tabs — create a new tab */
app.post("/api/tabs", async (req, res) => {
  try {
    const data = await readTabsFile();
    const id = uuidv4();
    const name = req.body?.name || `Drawing ${data.tabs.length + 1}`;
    const now = Date.now();

    const newTab = {
      id,
      name,
      order: data.tabs.length,
      createdAt: now,
      updatedAt: now,
    };
    data.tabs.push(newTab);

    // If this is the first tab, make it active
    if (data.tabs.length === 1) {
      data.activeTabId = id;
    }

    await writeTabsFile(data);

    // Create an empty scene file for the tab
    const emptyScene = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      elements: [],
      appState: {},
    };
    await fs.writeFile(
      sceneFilePath(id),
      JSON.stringify(emptyScene, null, 2),
      "utf-8",
    );

    res.status(201).json(newTab);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create tab" });
  }
});

/** DELETE /api/tabs/:id — delete a tab and its scene */
app.delete("/api/tabs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readTabsFile();

    const idx = data.tabs.findIndex((t) => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Tab not found" });
    }

    // Cannot delete the last tab
    if (data.tabs.length === 1) {
      return res.status(400).json({ error: "Cannot delete the last tab" });
    }

    data.tabs.splice(idx, 1);

    // Reassign active tab if needed
    if (data.activeTabId === id) {
      const newActive = data.tabs[Math.max(0, idx - 1)];
      data.activeTabId = newActive?.id ?? null;
    }

    await writeTabsFile(data);

    // Remove scene file and chat history for this tab
    await Promise.allSettled([
      fs.unlink(sceneFilePath(id)),
      fs.unlink(chatFilePath(id)),
    ]);

    res.json({ success: true, activeTabId: data.activeTabId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tab" });
  }
});

/** PATCH /api/tabs/:id/name — rename a tab */
app.patch("/api/tabs/:id/name", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    const data = await readTabsFile();
    const tab = data.tabs.find((t) => t.id === id);
    if (!tab) {
      return res.status(404).json({ error: "Tab not found" });
    }

    tab.name = name.trim();
    tab.updatedAt = Date.now();
    await writeTabsFile(data);

    // Also update name stored in scene file if it exists
    try {
      const sceneRaw = await fs.readFile(sceneFilePath(id), "utf-8");
      const scene = JSON.parse(sceneRaw);
      scene.name = tab.name;
      scene.updatedAt = tab.updatedAt;
      await fs.writeFile(
        sceneFilePath(id),
        JSON.stringify(scene, null, 2),
        "utf-8",
      );
    } catch {
      // scene file may not exist yet
    }

    res.json(tab);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to rename tab" });
  }
});

/** PATCH /api/tabs/active — set active tab */
app.patch("/api/tabs/active", async (req, res) => {
  try {
    const { activeTabId } = req.body;
    const data = await readTabsFile();

    const exists = data.tabs.some((t) => t.id === activeTabId);
    if (!exists) {
      return res.status(404).json({ error: "Tab not found" });
    }

    data.activeTabId = activeTabId;
    await writeTabsFile(data);
    res.json({ activeTabId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to set active tab" });
  }
});

// ---------------------------------------------------------------------------
// Scene routes
// ---------------------------------------------------------------------------

/** GET /api/scenes/:id — load scene */
app.get("/api/scenes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = sceneFilePath(id);

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: "Scene not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load scene" });
  }
});

/** PUT /api/scenes/:id — save/update scene */
app.put("/api/scenes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { elements, appState, name } = req.body;

    if (!Array.isArray(elements)) {
      return res.status(400).json({ error: "elements must be an array" });
    }

    // Read existing scene to preserve createdAt
    let existing = null;
    try {
      const raw = await fs.readFile(sceneFilePath(id), "utf-8");
      existing = JSON.parse(raw);
    } catch {
      // new scene
    }

    const now = Date.now();
    const scene = {
      id,
      name: name ?? existing?.name ?? "Drawing",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      elements,
      appState: appState ?? {},
    };

    await fs.writeFile(
      sceneFilePath(id),
      JSON.stringify(scene, null, 2),
      "utf-8",
    );

    // Update updatedAt in tabs metadata
    try {
      const data = await readTabsFile();
      const tab = data.tabs.find((t) => t.id === id);
      if (tab) {
        tab.updatedAt = now;
        if (name) {
          tab.name = name;
        }
        await writeTabsFile(data);
      }
    } catch {
      // non-critical
    }

    res.json({ success: true, updatedAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save scene" });
  }
});

// ---------------------------------------------------------------------------
// Preferences — global app prefs stored on disk (theme, language, etc.)
// ---------------------------------------------------------------------------

const DEFAULT_PREFS = { theme: "dark" };

async function readPrefsFile() {
  try {
    const raw = await fs.readFile(PREFS_FILE, "utf-8");
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function writePrefsFile(data) {
  await fs.writeFile(PREFS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source;
  }

  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    merged[key] =
      isPlainObject(merged[key]) && isPlainObject(value)
        ? deepMerge(merged[key], value)
        : value;
  }

  return merged;
}

const DIAGRAM_TO_CODE_MAX_TOKENS = 4096;
const DIAGRAM_TO_CODE_SYSTEM_PROMPT = `
You convert UI diagrams and wireframes into polished single-file HTML prototypes.
Return only a complete HTML document.
Do not use Markdown fences, explanations, or comments outside the HTML.
Use semantic HTML, inline CSS, and only minimal inline JavaScript when necessary.
Do not rely on external assets, CDNs, fonts, or network requests.
Make the result responsive, visually coherent, and faithful to the provided diagram.
If some text or controls are unclear, infer sensible defaults while preserving the overall structure.
`.trim();

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function parseDataUrl(value) {
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

function extractHtmlDocument(value) {
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

function buildDiagramToCodePrompt({ texts, theme }) {
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

async function parseProviderError(response) {
  const text = await response.text();
  const json = safeJsonParse(text);
  const message =
    json?.error?.message ||
    json?.error ||
    json?.message ||
    json?.detail ||
    text ||
    `Request failed (${response.status})`;

  return {
    status: response.status,
    message,
  };
}

function getOpenAIResponseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }

  return "";
}

function getAnthropicResponseText(payload) {
  if (!Array.isArray(payload?.content)) {
    return "";
  }

  return payload.content
    .map((part) =>
      part?.type === "text" && typeof part.text === "string" ? part.text : "",
    )
    .join("");
}

function getOllamaResponseText(payload) {
  if (typeof payload?.message?.content === "string") {
    return payload.message.content;
  }

  if (typeof payload?.response === "string") {
    return payload.response;
  }

  return "";
}

function requireHtmlOutput(html) {
  const normalizedHtml = extractHtmlDocument(html);

  if (!normalizedHtml) {
    throw new Error("AI provider returned an empty HTML response");
  }

  return normalizedHtml;
}

function buildTextOnlyDiagramToCodePrompt({ texts, theme }) {
  return [
    buildDiagramToCodePrompt({ texts, theme }),
    "The current model only accepts text input. The diagram image could not be attached.",
    "Infer the layout from the extracted text and common UI patterns, then return the best possible HTML prototype.",
  ].join("\n\n");
}

function shouldRetryDiagramToCodeAsTextOnly(error) {
  const message = String(error?.message || "").toLowerCase();

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

async function requestOpenAICompatibleDiagramToCode({
  baseUrl,
  apiKey,
  payload,
}) {
  const endpoint = `${normalizeUrl(baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseProviderError(response);
  }

  return response.json();
}

async function generateDiagramToCodeWithOpenAICompatible({
  baseUrl,
  apiKey,
  model,
  texts,
  image,
  theme,
}) {
  try {
    const payload = await requestOpenAICompatibleDiagramToCode({
      baseUrl,
      apiKey,
      payload: {
        model,
        temperature: 0.2,
        max_tokens: DIAGRAM_TO_CODE_MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildDiagramToCodePrompt({ texts, theme }),
              },
              {
                type: "image_url",
                image_url: {
                  url: image,
                  detail: "high",
                },
              },
            ],
          },
        ],
      },
    });

    return requireHtmlOutput(getOpenAIResponseText(payload));
  } catch (error) {
    if (!shouldRetryDiagramToCodeAsTextOnly(error)) {
      throw error;
    }

    if (!String(texts || "").trim()) {
      const fallbackError = new Error(
        "The configured model does not support image input and the frame contains no text to fall back on. Use a vision-capable model.",
      );
      fallbackError.status = 400;
      throw fallbackError;
    }

    const payload = await requestOpenAICompatibleDiagramToCode({
      baseUrl,
      apiKey,
      payload: {
        model,
        temperature: 0.2,
        max_tokens: DIAGRAM_TO_CODE_MAX_TOKENS,
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
      },
    });

    return requireHtmlOutput(getOpenAIResponseText(payload));
  }
}

function getAnthropicMessagesEndpoint(baseUrl) {
  const normalizedBaseUrl = normalizeUrl(baseUrl);

  if (normalizedBaseUrl.endsWith("/messages")) {
    return normalizedBaseUrl;
  }

  if (/\/v1\/?$/i.test(normalizedBaseUrl)) {
    return `${normalizedBaseUrl.replace(/\/$/, "")}/messages`;
  }

  return `${normalizedBaseUrl}/v1/messages`;
}

async function generateDiagramToCodeWithAnthropic({
  baseUrl,
  apiKey,
  model,
  texts,
  image,
  theme,
}) {
  const parsedImage = parseDataUrl(image);

  if (!parsedImage) {
    const invalidImageError = new Error(
      "diagram image must be a base64 data URL",
    );
    invalidImageError.status = 400;
    throw invalidImageError;
  }

  const response = await fetch(getAnthropicMessagesEndpoint(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({
      model,
      system: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
      max_tokens: DIAGRAM_TO_CODE_MAX_TOKENS,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildDiagramToCodePrompt({ texts, theme }),
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: parsedImage.mediaType,
                data: parsedImage.base64,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw await parseProviderError(response);
  }

  return requireHtmlOutput(getAnthropicResponseText(await response.json()));
}

async function generateDiagramToCodeWithOllama({
  baseUrl,
  model,
  texts,
  image,
  theme,
}) {
  const parsedImage = parseDataUrl(image);

  if (!parsedImage) {
    const invalidImageError = new Error(
      "diagram image must be a base64 data URL",
    );
    invalidImageError.status = 400;
    throw invalidImageError;
  }

  try {
    const response = await fetch(`${normalizeUrl(baseUrl)}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      throw await parseProviderError(response);
    }

    return requireHtmlOutput(getOllamaResponseText(await response.json()));
  } catch (error) {
    if (!shouldRetryDiagramToCodeAsTextOnly(error)) {
      throw error;
    }

    if (!String(texts || "").trim()) {
      const fallbackError = new Error(
        "The configured model does not support image input and the frame contains no text to fall back on. Use a vision-capable model.",
      );
      fallbackError.status = 400;
      throw fallbackError;
    }

    const response = await fetch(`${normalizeUrl(baseUrl)}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      throw await parseProviderError(response);
    }

    return requireHtmlOutput(getOllamaResponseText(await response.json()));
  }
}

/** GET /api/prefs — return current prefs */
app.get("/api/prefs", async (_req, res) => {
  try {
    res.json(await readPrefsFile());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read prefs" });
  }
});

/** PUT /api/prefs — save prefs (merges with existing) */
app.put("/api/prefs", async (req, res) => {
  try {
    const existing = await readPrefsFile();
    const updated = deepMerge(existing, req.body || {});
    await writePrefsFile(updated);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save prefs" });
  }
});

// ---------------------------------------------------------------------------
// Diagram to Code
//
// POST /api/ai/diagram-to-code/generate
// Body: { provider, baseUrl, apiKey?, model, texts, image, theme }
//
// Supported providers:
//   "openai"    → OpenAI-compatible /chat/completions with image input
//   "anthropic" → Anthropic Messages API with base64 image blocks
//   "ollama"    → Ollama /api/chat with vision-capable local models
// ---------------------------------------------------------------------------

app.post("/api/ai/diagram-to-code/generate", async (req, res) => {
  const {
    provider = "openai",
    baseUrl,
    apiKey,
    model,
    texts = "",
    image,
    theme = "dark",
  } = req.body || {};
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const normalizedModel = typeof model === "string" ? model.trim() : "";

  if (!normalizedBaseUrl) {
    return res.status(400).json({ error: "baseUrl is required" });
  }
  if (!normalizedModel) {
    return res.status(400).json({ error: "model is required" });
  }
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "image is required" });
  }

  try {
    const html =
      provider === "anthropic"
        ? await generateDiagramToCodeWithAnthropic({
            baseUrl: normalizedBaseUrl,
            apiKey: normalizedApiKey,
            model: normalizedModel,
            texts,
            image,
            theme,
          })
        : provider === "ollama"
        ? await generateDiagramToCodeWithOllama({
            baseUrl: normalizedBaseUrl,
            model: normalizedModel,
            texts,
            image,
            theme,
          })
        : await generateDiagramToCodeWithOpenAICompatible({
            baseUrl: normalizedBaseUrl,
            apiKey: normalizedApiKey,
            model: normalizedModel,
            texts,
            image,
            theme,
          });

    res.json({ html });
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    const message = err?.message || "Diagram to code generation failed";
    console.error("[ai/diagram-to-code] Error:", message);
    res.status(status).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// AI Chat History — per-tab persistence
// ---------------------------------------------------------------------------

/** GET /api/chats/:tabId — return saved chats for a tab */
app.get("/api/chats/:tabId", async (req, res) => {
  try {
    const raw = await fs.readFile(chatFilePath(req.params.tabId), "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    // No chats yet for this tab — return empty array
    res.json([]);
  }
});

/** PUT /api/chats/:tabId — overwrite saved chats for a tab */
app.put("/api/chats/:tabId", async (req, res) => {
  try {
    await fs.writeFile(
      chatFilePath(req.params.tabId),
      JSON.stringify(req.body, null, 2),
      "utf-8",
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save chats" });
  }
});

// ---------------------------------------------------------------------------
// AI Streaming via LangChain
//
// POST /api/ai/stream
// Body: { provider, baseUrl, apiKey, model, systemPrompt?, messages }
//
// Supported providers:
//   "openai"    → ChatOpenAI  (OpenAI, Groq, Together, Mistral, LM Studio, …)
//   "anthropic" → ChatAnthropic (Claude, any Anthropic-compatible proxy)
//
// Streams SSE events:
//   data: {"chunk":"..."}  — text delta
//   data: [DONE]            — end of stream
//   data: {"error":"..."}  — error (sent before closing if headers already sent)
// ---------------------------------------------------------------------------

app.post("/api/ai/stream", async (req, res) => {
  const {
    provider = "openai",
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    messages,
  } = req.body || {};
  const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";

  if (!model) {
    return res.status(400).json({ error: "model is required" });
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages must be an array" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeChunk = (text) =>
    res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);

  const writeError = (message) => {
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  };

  let aborted = false;
  const ac = new AbortController();
  res.on("close", () => {
    aborted = true;
    ac.abort();
  });

  try {
    const { HumanMessage, AIMessage, SystemMessage } = await import(
      "@langchain/core/messages"
    );

    const lcMessages = [];
    if (systemPrompt) {
      lcMessages.push(new SystemMessage(systemPrompt));
    }
    for (const msg of messages) {
      if (msg.role === "user") {
        lcMessages.push(new HumanMessage(String(msg.content)));
      } else if (msg.role === "assistant") {
        lcMessages.push(new AIMessage(String(msg.content)));
      }
    }

    let llm;
    if (provider === "anthropic") {
      const { ChatAnthropic } = await import("@langchain/anthropic");
      // Anthropic SDK expects the base URL WITHOUT /v1 — strip it if present
      const anthropicBase = normalizedBaseUrl
        ? normalizedBaseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "")
        : undefined;
      llm = new ChatAnthropic({
        model,
        apiKey: normalizedApiKey || "sk-ant-placeholder",
        anthropicApiKey: normalizedApiKey || "sk-ant-placeholder",
        ...(anthropicBase ? { anthropicApiUrl: anthropicBase } : {}),
        maxTokens: 8192,
        streaming: true,
      });
    } else {
      const { ChatOpenAI } = await import("@langchain/openai");
      llm = new ChatOpenAI({
        model,
        apiKey: normalizedApiKey || "sk-placeholder",
        openAIApiKey: normalizedApiKey || "sk-placeholder",
        streaming: true,
        ...(normalizedBaseUrl
          ? { configuration: { baseURL: normalizedBaseUrl } }
          : {}),
      });
    }

    const stream = await llm.stream(lcMessages, { signal: ac.signal });

    for await (const chunk of stream) {
      if (aborted) {
        break;
      }
      // content can be a string or an array of content blocks (Claude tool use)
      let text = "";
      if (typeof chunk.content === "string") {
        text = chunk.content;
      } else if (Array.isArray(chunk.content)) {
        text = chunk.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("");
      }
      if (text) {
        writeChunk(text);
      }
    }

    if (!aborted) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err) {
    if (aborted || err?.name === "AbortError") {
      return;
    }
    console.error("[ai/stream] Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "AI streaming failed" });
    } else {
      writeError(err.message || "AI streaming failed");
    }
  }
});

// ---------------------------------------------------------------------------
// Legacy AI Proxy — kept for backward compat; new code uses /api/ai/stream
// ---------------------------------------------------------------------------

/**
 * POST /api/ai-proxy/stream
 */
app.post("/api/ai-proxy/stream", (req, res) => {
  const { url, headers: extraHeaders = {}, body: proxyBody } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const isHttps = parsedUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  const bodyStr = JSON.stringify(proxyBody || {});

  const reqHeaders = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(bodyStr),
    ...extraHeaders,
  };

  let proxyDone = false;

  const proxyReq = transport.request(
    {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: reqHeaders,
    },
    (proxyRes) => {
      const contentType =
        proxyRes.headers["content-type"] || "text/event-stream";

      res.status(proxyRes.statusCode || 200);
      res.setHeader("Content-Type", contentType);

      // Pipe the upstream stream straight to the client
      proxyRes.pipe(res);

      proxyRes.on("end", () => {
        proxyDone = true;
      });

      proxyRes.on("error", (err) => {
        console.error("[ai-proxy] Upstream stream error:", err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: "Upstream stream error" });
        } else {
          res.end();
        }
      });
    },
  );

  proxyReq.on("error", (err) => {
    console.error("[ai-proxy] Connection error:", err.message);
    if (!res.headersSent) {
      res.status(503).json({ error: err.message || "Proxy connection failed" });
    } else {
      res.end();
    }
  });

  // Only abort upstream if the client disconnects before the proxy finishes
  res.on("close", () => {
    if (!proxyDone) {
      proxyReq.destroy();
    }
  });

  proxyReq.write(bodyStr);
  proxyReq.end();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

ensureDataDirs().then(() => {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console -- server startup message
    console.log(`LocalDraw disk server running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console -- server startup message
    console.log(`Scenes stored in: ${SCENES_DIR}`);
  });
});
