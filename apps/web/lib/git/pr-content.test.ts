import { beforeEach, describe, expect, mock, test } from "bun:test";

let sessionRecord: { userId: string } | null = null;
let chats: Array<{ id: string }> = [];
let userRecord: { name: string | null; username: string | null } | null = null;
let githubAccount: { username: string } | null = null;

mock.module("@/app/api/generate-pr/_lib/generate-pr-helpers", () => ({
  getConversationContext: async () => "",
}));

mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => sessionRecord,
  getChatsBySessionId: async () => chats,
}));

mock.module("@/lib/db/accounts", () => ({
  getGitHubAccount: async () => githubAccount,
}));

mock.module("@/lib/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: async () => userRecord,
      },
    },
  },
}));

const prContentModulePromise = import("./pr-content");

describe("pr-content", () => {
  beforeEach(() => {
    sessionRecord = null;
    chats = [];
    userRecord = null;
    githubAccount = null;
  });

  test("resolvePullRequestContextSection returns a single-line footer with chat link and attribution", async () => {
    const { resolvePullRequestContextSection } = await prContentModulePromise;

    sessionRecord = { userId: "user-1" };
    chats = [{ id: "chat-2" }, { id: "chat-1" }];
    userRecord = { name: "Nico Albanese", username: "nico" };
    githubAccount = { username: "nicoalbanese10" };

    const section = await resolvePullRequestContextSection({
      sessionId: "session-1",
      appBaseUrl: "https://openharness.dev",
    });

    expect(section).toBe(
      "[Chat](https://openharness.dev/sessions/session-1/chats/chat-2) - Built with guidance from [Nico Albanese](https://github.com/nicoalbanese10)",
    );
  });

  test("resolvePullRequestContextSection falls back to plain-text attribution when no GitHub account exists", async () => {
    const { resolvePullRequestContextSection } = await prContentModulePromise;

    sessionRecord = { userId: "user-1" };
    userRecord = { name: null, username: "nico" };

    const section = await resolvePullRequestContextSection({
      sessionId: "session-1",
    });

    expect(section).toBe("Built with guidance from nico");
  });

  test("resolvePullRequestAppBaseUrl uses the provided app origin", async () => {
    const { resolvePullRequestAppBaseUrl } = await prContentModulePromise;

    expect(resolvePullRequestAppBaseUrl("http://192.168.1.141:3000")).toBe(
      "http://192.168.1.141:3000",
    );
    expect(resolvePullRequestAppBaseUrl()).toBeNull();
  });

  test("appendPullRequestContextSection appends the footer after a horizontal rule", async () => {
    const { appendPullRequestContextSection } = await prContentModulePromise;

    expect(
      appendPullRequestContextSection(
        "## Summary\n\nInitial body\n",
        "[Chat](https://example.com) - Built with guidance from Nico",
      ),
    ).toBe(`## Summary

Initial body

---

[Chat](https://example.com) - Built with guidance from Nico`);
  });
});
