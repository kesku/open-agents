import { hashPassword } from "better-auth/crypto";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { getDeploymentMode } from "../lib/deployment/mode.ts";
import {
  parseLocalAuthEmail,
  parseLocalAuthPassword,
} from "./local-auth-credentials.ts";

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

async function bootstrapLocalUser(): Promise<void> {
  if (getDeploymentMode() !== "local") {
    console.log("Skipping local owner bootstrap for Vercel deployment mode");
    return;
  }

  requireEnvironmentValue("BETTER_AUTH_SECRET");
  const postgresUrl = requireEnvironmentValue("POSTGRES_URL");
  const email = parseLocalAuthEmail(
    requireEnvironmentValue("LOCAL_AUTH_EMAIL"),
  );
  const password = parseLocalAuthPassword(
    requireEnvironmentValue("LOCAL_AUTH_PASSWORD"),
  );
  const name = process.env.LOCAL_AUTH_NAME?.trim() || "Open Agents Owner";
  const username =
    process.env.LOCAL_AUTH_USERNAME?.trim() ||
    email.split("@", 1)[0] ||
    "owner";

  const client = postgres(postgresUrl, { max: 1 });
  try {
    await client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(741092841)`;
      const existingUsers = await transaction<
        { email: string | null }[]
      >`SELECT email FROM users LIMIT 2`;
      const configuredUserExists = existingUsers.some(
        (user) => user.email?.toLowerCase() === email,
      );

      if (configuredUserExists) {
        console.log(`Local owner ${email} already exists`);
        return;
      }

      if (existingUsers.length > 0) {
        throw new Error(
          "Refusing to create a second local owner. Reset the database or restore LOCAL_AUTH_EMAIL to the existing owner.",
        );
      }

      const userId = nanoid();
      const now = new Date();
      const passwordHash = await hashPassword(password);

      await transaction`
        INSERT INTO users (
          id, username, email, email_verified, name, is_admin,
          created_at, updated_at, last_login_at
        ) VALUES (
          ${userId}, ${username}, ${email}, true, ${name}, false,
          ${now}, ${now}, ${now}
        )
      `;
      await transaction`
        INSERT INTO accounts (
          id, account_id, provider_id, user_id, password, created_at, updated_at
        ) VALUES (
          ${nanoid()}, ${userId}, 'credential', ${userId}, ${passwordHash},
          ${now}, ${now}
        )
      `;

      console.log(`Created local owner ${email}`);
    });
  } finally {
    await client.end();
  }
}

try {
  await bootstrapLocalUser();
} catch (error) {
  console.error("Failed to bootstrap local owner:", error);
  process.exit(1);
}
