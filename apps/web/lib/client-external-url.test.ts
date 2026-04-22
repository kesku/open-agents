import { describe, expect, test } from "bun:test";
import { normalizeClientExternalUrl } from "./client-external-url";

describe("normalizeClientExternalUrl", () => {
  test("keeps valid https urls unchanged", () => {
    expect(
      normalizeClientExternalUrl("https://oa-123-8000.kesku.me", "https:"),
    ).toBe("https://oa-123-8000.kesku.me/");
  });

  test("adds the current protocol for bare hosts", () => {
    expect(normalizeClientExternalUrl("oa-123-8000.kesku.me", "https:")).toBe(
      "https://oa-123-8000.kesku.me/",
    );
  });

  test("adds the current protocol for host and port values", () => {
    expect(
      normalizeClientExternalUrl("oa-123-8000.kesku.me:8000", "https:"),
    ).toBe("https://oa-123-8000.kesku.me:8000/");
  });

  test("repairs malformed https prefixes", () => {
    expect(
      normalizeClientExternalUrl("https//oa-123-8000.kesku.me", "https:"),
    ).toBe("https://oa-123-8000.kesku.me/");
    expect(
      normalizeClientExternalUrl("https:/oa-123-8000.kesku.me", "https:"),
    ).toBe("https://oa-123-8000.kesku.me/");
  });

  test("rejects unsupported protocols", () => {
    expect(
      normalizeClientExternalUrl("oa-123-8000.kesku.me://editor", "https:"),
    ).toBeNull();
    expect(
      normalizeClientExternalUrl("ftp://example.com", "https:"),
    ).toBeNull();
  });
});
