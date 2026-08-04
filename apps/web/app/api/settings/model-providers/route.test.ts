import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SettingsProvider {
  providerId: string;
  displayName: string;
  baseUrl: string;
  hasApiKey: boolean;
}

class DirectModelProvidersDisabledError extends Error {
  constructor() {
    super("Direct model providers are disabled");
    this.name = "DirectModelProvidersDisabledError";
  }
}

let directProvidersEnabled = true;
let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};
let providers: SettingsProvider[] = [];
const upsertCalls: Array<{ userId: string; input: Record<string, unknown> }> =
  [];
const deleteCalls: Array<{ userId: string; providerId: string }> = [];

mock.module("@/lib/model-provider-access", () => ({
  isDirectModelProvidersEnabled: () => directProvidersEnabled,
}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/db/model-providers", () => ({
  DirectModelProvidersDisabledError,
  normalizeProviderId: (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  normalizeBaseUrl: (value: string) => value.trim().replace(/\/+$/, ""),
  getModelProvidersForSettings: async () => providers,
  upsertModelProvider: async (
    userId: string,
    input: Record<string, unknown>,
  ) => {
    upsertCalls.push({ userId, input });
    const provider = {
      providerId: String(input.providerId),
      displayName: String(input.displayName),
      baseUrl: String(input.baseUrl),
      hasApiKey: Boolean(input.apiKey),
    };
    providers = [provider];
    return provider;
  },
  deleteModelProvider: async (userId: string, providerId: string) => {
    deleteCalls.push({ userId, providerId });
    const previousLength = providers.length;
    providers = providers.filter(
      (provider) => provider.providerId !== providerId,
    );
    return providers.length !== previousLength;
  },
}));

const routeModulePromise = import("./route");

function createJsonRequest(method: "POST" | "DELETE", body: unknown) {
  return new Request("http://localhost/api/settings/model-providers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  directProvidersEnabled = true;
  currentSession = { user: { id: "user-1" } };
  providers = [];
  upsertCalls.length = 0;
  deleteCalls.length = 0;
});

describe("/api/settings/model-providers", () => {
  test("is unavailable when direct providers are disabled", async () => {
    directProvidersEnabled = false;
    const { GET, POST } = await routeModulePromise;

    expect((await GET()).status).toBe(404);
    expect(
      (
        await POST(
          createJsonRequest("POST", {
            providerId: "openrouter",
            displayName: "OpenRouter",
            baseUrl: "https://openrouter.ai/api/v1",
          }),
        )
      ).status,
    ).toBe(404);
    expect(upsertCalls).toEqual([]);
  });

  test("requires authentication", async () => {
    currentSession = null;
    const { GET } = await routeModulePromise;

    expect((await GET()).status).toBe(401);
  });

  test("normalizes and saves a provider without returning its API key", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest("POST", {
        providerId: " Open Router ",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1/",
        apiKey: "secret-key",
      }),
    );
    const body = (await response.json()) as {
      provider: SettingsProvider;
      providers: SettingsProvider[];
    };

    expect(response.ok).toBe(true);
    expect(upsertCalls).toEqual([
      {
        userId: "user-1",
        input: {
          providerId: "open-router",
          displayName: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "secret-key",
        },
      },
    ]);
    expect(body.provider.hasApiKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret-key");
  });

  test("supports explicitly keyless providers", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest("POST", {
        providerId: "ollama",
        displayName: "Ollama",
        baseUrl: "http://ollama:11434/v1",
        apiKey: "",
      }),
    );
    const body = (await response.json()) as {
      provider: SettingsProvider;
    };

    expect(response.ok).toBe(true);
    expect(upsertCalls[0]?.input).toMatchObject({ apiKey: "" });
    expect(body.provider.hasApiKey).toBe(false);
  });

  test("rejects credentials embedded in provider URLs", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest("POST", {
        providerId: "private",
        displayName: "Private provider",
        baseUrl: "https://user:password@example.com/v1",
      }),
    );

    expect(response.status).toBe(400);
    expect(upsertCalls).toEqual([]);
  });

  test("deletes providers only within the authenticated user", async () => {
    providers = [
      {
        providerId: "ollama",
        displayName: "Ollama",
        baseUrl: "http://ollama:11434/v1",
        hasApiKey: false,
      },
    ];
    const { DELETE } = await routeModulePromise;
    const response = await DELETE(
      createJsonRequest("DELETE", { providerId: "ollama" }),
    );

    expect(response.ok).toBe(true);
    expect(deleteCalls).toEqual([{ userId: "user-1", providerId: "ollama" }]);
  });
});
