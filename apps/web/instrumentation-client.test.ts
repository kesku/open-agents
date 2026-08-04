import { describe, expect, mock, test } from "bun:test";

const initBotIdCalls: unknown[] = [];

process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";

mock.module("botid/client/core", () => ({
  initBotId: (config: unknown) => {
    initBotIdCalls.push(config);
  },
}));

describe("BotID client instrumentation", () => {
  test("protects session creation to match the server-side BotID gate", async () => {
    const { botIdProtectedRoutes } = await import("./instrumentation-client");

    expect(botIdProtectedRoutes).toContainEqual({
      path: "/api/sessions",
      method: "POST",
    });
    expect(initBotIdCalls).toContainEqual({
      protect: botIdProtectedRoutes,
    });
  });
});
