import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractHtmlDocument,
  fetchOfflineDiagramToCode,
  shouldRetryDiagramToCodeAsTextOnly,
} from "./aiOfflineDiagramToCodeFetch";

describe("aiOfflineDiagramToCodeFetch", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("extracts a complete HTML document from fenced output", () => {
    expect(
      extractHtmlDocument("```html\n<!DOCTYPE html><html></html>\n```"),
    ).toBe("<!DOCTYPE html><html></html>");
  });

  it("recognizes non-vision model errors for text-only retry", () => {
    expect(
      shouldRetryDiagramToCodeAsTextOnly(
        new Error("vision is not supported for this model"),
      ),
    ).toBe(true);
  });

  it("returns HTML directly when Ollama responds successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: "<!DOCTYPE html><html><body>ok</body></html>",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      fetchOfflineDiagramToCode({
        baseUrl: "http://localhost:11434",
        model: "llama3.2-vision",
        texts: "Login",
        image: "data:image/jpeg;base64,ZmFrZQ==",
        theme: "dark",
      }),
    ).resolves.toBe("<!DOCTYPE html><html><body>ok</body></html>");
  });

  it("retries as text-only when the model does not support images", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "vision is not supported" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: "<!DOCTYPE html><html><body>fallback</body></html>",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(
      fetchOfflineDiagramToCode({
        baseUrl: "http://localhost:11434",
        model: "llama3",
        texts: "Settings page",
        image: "data:image/jpeg;base64,ZmFrZQ==",
        theme: "light",
      }),
    ).resolves.toBe("<!DOCTYPE html><html><body>fallback</body></html>");

    expect(global.fetch).toHaveBeenCalledTimes(2);

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(firstRequest.messages[1].images).toEqual(["ZmFrZQ=="]);
    expect(secondRequest.messages[1].images).toBeUndefined();
    expect(secondRequest.messages[1].content).toContain(
      "The current model only accepts text input.",
    );
  });

  it("fails clearly when a non-vision model has no text fallback", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "vision is not supported" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchOfflineDiagramToCode({
        baseUrl: "http://localhost:11434",
        model: "llama3",
        texts: "",
        image: "data:image/jpeg;base64,ZmFrZQ==",
        theme: "dark",
      }),
    ).rejects.toThrow(
      "The configured model does not support image input and the frame contains no text to fall back on. Use a vision-capable model.",
    );
  });
});
