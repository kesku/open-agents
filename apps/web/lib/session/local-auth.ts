import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { Session } from "./types";

function getOptionalEnvString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isLocalAuthEnabled(): boolean {
  return process.env.LOCAL_AUTH_ENABLED === "true";
}

function getLocalAuthUser() {
  return {
    id: getOptionalEnvString("LOCAL_AUTH_USER_ID") ?? "local-user",
    username: getOptionalEnvString("LOCAL_AUTH_USERNAME") ?? "local",
    email:
      getOptionalEnvString("LOCAL_AUTH_EMAIL") ?? "local@open-agents.local",
    name: getOptionalEnvString("LOCAL_AUTH_NAME") ?? "Local User",
    avatar: getOptionalEnvString("LOCAL_AUTH_AVATAR_URL") ?? "/favicon.ico",
  };
}

async function ensureLocalUserRecord(): Promise<Session["user"]> {
  const localUser = getLocalAuthUser();
  const [existingUser] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, localUser.id))
    .limit(1);

  const now = new Date();

  if (!existingUser) {
    await db.insert(users).values({
      id: localUser.id,
      provider: "vercel",
      externalId: `local:${localUser.id}`,
      accessToken: "local-auth",
      username: localUser.username,
      email: localUser.email,
      name: localUser.name,
      avatarUrl: localUser.avatar,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    return localUser;
  }

  if (
    existingUser.username !== localUser.username ||
    existingUser.email !== localUser.email ||
    existingUser.name !== localUser.name ||
    existingUser.avatarUrl !== localUser.avatar
  ) {
    await db
      .update(users)
      .set({
        username: localUser.username,
        email: localUser.email,
        name: localUser.name,
        avatarUrl: localUser.avatar,
        updatedAt: now,
      })
      .where(eq(users.id, localUser.id));
  }

  return localUser;
}

export async function getLocalAuthSession(): Promise<Session | undefined> {
  if (!isLocalAuthEnabled()) {
    return undefined;
  }

  const user = await ensureLocalUserRecord();
  return {
    created: Date.now(),
    authProvider: "local",
    user,
  };
}
