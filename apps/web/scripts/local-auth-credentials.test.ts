import { describe, expect, test } from "bun:test";
import {
  parseLocalAuthEmail,
  parseLocalAuthPassword,
} from "./local-auth-credentials";

describe("local auth credential validation", () => {
  test("normalizes valid owner emails", () => {
    expect(parseLocalAuthEmail(" Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
  });

  test("rejects invalid owner emails", () => {
    expect(() => parseLocalAuthEmail("owner")).toThrow(
      "must be a valid email address",
    );
  });

  test("matches Better Auth's default password length limits", () => {
    expect(parseLocalAuthPassword("12345678")).toBe("12345678");
    expect(() => parseLocalAuthPassword("1234567")).toThrow(
      "at least 8 characters",
    );
    expect(() => parseLocalAuthPassword("x".repeat(129))).toThrow(
      "at most 128 characters",
    );
  });
});
