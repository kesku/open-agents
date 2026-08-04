import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const originalDeploymentMode = process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
const { isDirectModelProvidersEnabled } =
  await import("./model-provider-access");

afterEach(() => {
  if (originalDeploymentMode === undefined) {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = originalDeploymentMode;
  }
});

describe("direct model provider access", () => {
  test("is enabled for local deployments", () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "local";
    expect(isDirectModelProvidersEnabled()).toBe(true);
  });

  test("is disabled for hosted Vercel deployments", () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    expect(isDirectModelProvidersEnabled()).toBe(false);
  });
});
