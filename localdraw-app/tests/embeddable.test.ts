import { validateEmbeddableUrl } from "../embeddable";

describe("validateEmbeddableUrl", () => {
  it("allows external https urls", () => {
    expect(validateEmbeddableUrl("https://example.com/embed")).toBe(true);
  });

  it("allows external http urls", () => {
    expect(validateEmbeddableUrl("http://example.com/embed")).toBe(true);
  });

  it("rejects same-origin urls", () => {
    expect(
      validateEmbeddableUrl(`${window.location.origin}/embedded-page`),
    ).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(validateEmbeddableUrl("javascript:alert(1)")).toBe(false);
  });
});
