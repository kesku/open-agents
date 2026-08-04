import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const ORIGINAL_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TEST_KEY = "a".repeat(64);

const encryptedSecretModulePromise = import("./encrypted-secret");

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (ORIGINAL_ENCRYPTION_KEY === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  }
});

describe("encrypted secrets", () => {
  test("round trips with AES-256-GCM", async () => {
    const { decryptSecret, encryptSecret } = await encryptedSecretModulePromise;
    const encrypted = encryptSecret("secret-value", "user-1:provider-1");

    expect(encrypted).toStartWith("v1.");
    expect(encrypted).not.toContain("secret-value");
    expect(decryptSecret(encrypted, "user-1:provider-1")).toBe("secret-value");
  });

  test("rejects ciphertext moved to a different user or provider", async () => {
    const { decryptSecret, encryptSecret } = await encryptedSecretModulePromise;
    const encrypted = encryptSecret("secret-value", "user-1:provider-1");

    expect(() => decryptSecret(encrypted, "user-2:provider-1")).toThrow();
  });

  test("rejects tampered ciphertext", async () => {
    const { decryptSecret, encryptSecret } = await encryptedSecretModulePromise;
    const encrypted = encryptSecret("secret-value", "user-1:provider-1");
    const parts = encrypted.split(".");
    const encryptedValue = parts[2] ?? "";
    parts[2] = `${encryptedValue.startsWith("A") ? "B" : "A"}${encryptedValue.slice(1)}`;

    expect(() => decryptSecret(parts.join("."), "user-1:provider-1")).toThrow();
  });

  test("requires a 32-byte encryption key", async () => {
    const { encryptSecret } = await encryptedSecretModulePromise;
    process.env.ENCRYPTION_KEY = "too-short";

    expect(() => encryptSecret("secret", "purpose")).toThrow(
      "ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  });
});
