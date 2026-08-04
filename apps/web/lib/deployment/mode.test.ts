import { afterEach, describe, expect, test } from "bun:test";
import {
  getDeploymentMode,
  getPublicDeploymentMode,
  parseDeploymentMode,
} from "./mode";

const originalServerMode = process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
const originalPublicMode = process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE;

afterEach(() => {
  if (originalServerMode === undefined) {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = originalServerMode;
  }

  if (originalPublicMode === undefined) {
    delete process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE;
  } else {
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = originalPublicMode;
  }
});

describe("deployment mode", () => {
  test("defaults to local", () => {
    delete process.env.OPEN_AGENTS_DEPLOYMENT_MODE;
    delete process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE;

    expect(getDeploymentMode()).toBe("local");
    expect(getPublicDeploymentMode()).toBe("local");
  });

  test("rejects mismatched server and public deployment modes", () => {
    process.env.OPEN_AGENTS_DEPLOYMENT_MODE = "vercel";
    process.env.NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE = "local";

    expect(() => getDeploymentMode()).toThrow(
      "OPEN_AGENTS_DEPLOYMENT_MODE and NEXT_PUBLIC_OPEN_AGENTS_DEPLOYMENT_MODE must match",
    );
    expect(getPublicDeploymentMode()).toBe("local");
  });

  test("rejects unknown modes", () => {
    expect(() => parseDeploymentMode("hosted")).toThrow(
      'Expected "local" or "vercel"',
    );
  });
});
