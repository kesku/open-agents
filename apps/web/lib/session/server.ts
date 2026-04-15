import type { NextRequest } from "next/server";
import type { Session } from "./types";
import { getLocalAuthSession } from "./local-auth";

export async function getSessionFromCookie(
  _cookieValue?: string,
): Promise<Session> {
  return getLocalAuthSession();
}

export async function getSessionFromReq(_req: NextRequest): Promise<Session> {
  return getLocalAuthSession();
}
