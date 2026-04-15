import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { Session } from "./types";
import { LOCAL_WORKSPACE_USER } from "./local-workspace-user";

async function ensureLocalUserRecord(): Promise<Session["user"]> {
  const [existingUser] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, LOCAL_WORKSPACE_USER.id))
    .limit(1);

  const now = new Date();

  if (!existingUser) {
    await db.insert(users).values({
      id: LOCAL_WORKSPACE_USER.id,
      provider: "local",
      externalId: `local:${LOCAL_WORKSPACE_USER.id}`,
      accessToken: "local-auth",
      username: LOCAL_WORKSPACE_USER.username,
      email: LOCAL_WORKSPACE_USER.email,
      name: LOCAL_WORKSPACE_USER.name,
      avatarUrl: LOCAL_WORKSPACE_USER.avatar,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    return LOCAL_WORKSPACE_USER;
  }

  if (
    existingUser.username !== LOCAL_WORKSPACE_USER.username ||
    existingUser.email !== LOCAL_WORKSPACE_USER.email ||
    existingUser.name !== LOCAL_WORKSPACE_USER.name ||
    existingUser.avatarUrl !== LOCAL_WORKSPACE_USER.avatar
  ) {
    await db
      .update(users)
      .set({
        username: LOCAL_WORKSPACE_USER.username,
        email: LOCAL_WORKSPACE_USER.email,
        name: LOCAL_WORKSPACE_USER.name,
        avatarUrl: LOCAL_WORKSPACE_USER.avatar,
        updatedAt: now,
      })
      .where(eq(users.id, LOCAL_WORKSPACE_USER.id));
  }

  return LOCAL_WORKSPACE_USER;
}

export async function getLocalAuthSession(): Promise<Session> {
  const user = await ensureLocalUserRecord();
  return {
    created: Date.now(),
    authProvider: "local",
    user,
  };
}
