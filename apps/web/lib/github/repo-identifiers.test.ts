import { describe, expect, test } from "bun:test";

import {
  buildGitHubAuthRemoteUrl,
  isValidGitHubRepoName,
  isValidGitHubRepoOwner,
  parseGitHubRepoReference,
} from "./repo-identifiers";

describe("repo-identifiers", () => {
  test("accepts safe GitHub owner and repo segments", () => {
    expect(isValidGitHubRepoOwner("vercel")).toBe(true);
    expect(isValidGitHubRepoOwner("vercel-labs")).toBe(true);
    expect(isValidGitHubRepoName("open-harness")).toBe(true);
    expect(isValidGitHubRepoName("open_harness.v2")).toBe(true);
  });

  test("rejects unsafe GitHub owner and repo segments", () => {
    expect(isValidGitHubRepoOwner('vercel" && echo nope && "')).toBe(false);
    expect(isValidGitHubRepoName("open harness")).toBe(false);
  });

  test("parses bare repo references and common GitHub URLs", () => {
    expect(parseGitHubRepoReference("vercel/open-harness")).toEqual({
      owner: "vercel",
      repo: "open-harness",
    });
    expect(
      parseGitHubRepoReference("https://github.com/vercel/open-harness"),
    ).toEqual({
      owner: "vercel",
      repo: "open-harness",
    });
    expect(
      parseGitHubRepoReference(
        "https://github.com/vercel/open-harness/tree/main",
      ),
    ).toEqual({
      owner: "vercel",
      repo: "open-harness",
    });
    expect(
      parseGitHubRepoReference("git@github.com:vercel/open-harness.git"),
    ).toEqual({
      owner: "vercel",
      repo: "open-harness",
    });
  });

  test("rejects invalid repo references", () => {
    expect(
      parseGitHubRepoReference("https://example.com/vercel/open-harness"),
    ).toBeNull();
    expect(parseGitHubRepoReference("vercel/open harness")).toBeNull();
    expect(parseGitHubRepoReference("")).toBeNull();
  });

  test("builds an encoded auth remote url for valid coordinates", () => {
    expect(
      buildGitHubAuthRemoteUrl({
        token: "ghp token/with?chars",
        owner: "vercel",
        repo: "open-harness",
      }),
    ).toBe(
      "https://x-access-token:ghp%20token%2Fwith%3Fchars@github.com/vercel/open-harness.git",
    );
  });

  test("returns null when the owner or repo is unsafe", () => {
    expect(
      buildGitHubAuthRemoteUrl({
        token: "ghp_test",
        owner: 'vercel" && echo nope && "',
        repo: "open-harness",
      }),
    ).toBeNull();
  });
});
