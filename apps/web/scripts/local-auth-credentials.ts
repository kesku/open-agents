import { z } from "zod";

const BETTER_AUTH_MIN_PASSWORD_LENGTH = 8;
const BETTER_AUTH_MAX_PASSWORD_LENGTH = 128;

export function parseLocalAuthEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!z.email().safeParse(email).success) {
    throw new Error("LOCAL_AUTH_EMAIL must be a valid email address");
  }
  return email;
}

export function parseLocalAuthPassword(value: string): string {
  if (value.length < BETTER_AUTH_MIN_PASSWORD_LENGTH) {
    throw new Error(
      `LOCAL_AUTH_PASSWORD must contain at least ${BETTER_AUTH_MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (value.length > BETTER_AUTH_MAX_PASSWORD_LENGTH) {
    throw new Error(
      `LOCAL_AUTH_PASSWORD must contain at most ${BETTER_AUTH_MAX_PASSWORD_LENGTH} characters`,
    );
  }
  return value;
}
