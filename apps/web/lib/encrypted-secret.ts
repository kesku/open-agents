import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getEncryptionKey(): Buffer {
  const configuredKey = process.env.ENCRYPTION_KEY?.trim();
  if (!configuredKey) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const key = /^[0-9a-f]{64}$/i.test(configuredKey)
    ? Buffer.from(configuredKey, "hex")
    : Buffer.from(configuredKey, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "ENCRYPTION_KEY must encode exactly 32 bytes as hex or base64",
    );
  }

  return key;
}

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function encryptSecret(plaintext: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(ciphertext: string, purpose: string): string {
  const [version, ivValue, encryptedValue, authTagValue, extra] =
    ciphertext.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    encryptedValue === undefined ||
    !authTagValue ||
    extra !== undefined
  ) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = toBuffer(ivValue);
  const encrypted = toBuffer(encryptedValue);
  const authTag = toBuffer(authTagValue);
  if (iv.length !== IV_BYTES || authTag.length !== 16) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}
