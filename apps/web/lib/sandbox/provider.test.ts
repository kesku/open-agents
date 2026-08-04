import { afterEach, describe, expect, test } from "bun:test";
import { getConfiguredSandboxProvider } from "./provider";

const originalServerProvider = process.env.SANDBOX_PROVIDER;
const originalPublicProvider = process.env.NEXT_PUBLIC_SANDBOX_PROVIDER;

afterEach(() => {
  if (originalServerProvider === undefined) {
    delete process.env.SANDBOX_PROVIDER;
  } else {
    process.env.SANDBOX_PROVIDER = originalServerProvider;
  }
  if (originalPublicProvider === undefined) {
    delete process.env.NEXT_PUBLIC_SANDBOX_PROVIDER;
  } else {
    process.env.NEXT_PUBLIC_SANDBOX_PROVIDER = originalPublicProvider;
  }
});

describe("getConfiguredSandboxProvider", () => {
  test("defaults local deployments to Docker", () => {
    delete process.env.SANDBOX_PROVIDER;
    delete process.env.NEXT_PUBLIC_SANDBOX_PROVIDER;

    expect(getConfiguredSandboxProvider()).toBe("docker");
  });

  test("preserves explicit Vercel deployments", () => {
    process.env.SANDBOX_PROVIDER = "vercel";
    process.env.NEXT_PUBLIC_SANDBOX_PROVIDER = "vercel";

    expect(getConfiguredSandboxProvider()).toBe("vercel");
  });

  test("fails fast for an invalid provider", () => {
    process.env.SANDBOX_PROVIDER = "remote";
    delete process.env.NEXT_PUBLIC_SANDBOX_PROVIDER;

    expect(() => getConfiguredSandboxProvider()).toThrow(
      "SANDBOX_PROVIDER must be one of: docker, vercel",
    );
  });

  test("fails fast when public and server configuration disagree", () => {
    process.env.SANDBOX_PROVIDER = "docker";
    process.env.NEXT_PUBLIC_SANDBOX_PROVIDER = "vercel";

    expect(() => getConfiguredSandboxProvider()).toThrow(
      "SANDBOX_PROVIDER and NEXT_PUBLIC_SANDBOX_PROVIDER must match",
    );
  });
});
