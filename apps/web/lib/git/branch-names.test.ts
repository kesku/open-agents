import { describe, expect, test } from "bun:test";
import {
  isValidBranchName,
  renderBranchNameTemplate,
  slugifyBranchSegment,
} from "./branch-names";

describe("branch name helpers", () => {
  test("slugifies worktree names for branch paths", () => {
    expect(slugifyBranchSegment("Fix API Validation!")).toBe(
      "fix-api-validation",
    );
    expect(slugifyBranchSegment("東京")).toBe("worktree");
  });

  test("renders templates with worktree, user, and random placeholders", () => {
    expect(
      renderBranchNameTemplate({
        template: "kesku/[worktree]-[random]",
        title: "Fix Login",
        username: "Kesku",
        randomSuffix: "abc12345",
      }),
    ).toBe("kesku/fix-login-abc12345");

    expect(
      renderBranchNameTemplate({
        template: "[user]/[worktree]",
        title: "Ship UI",
        username: "Kesku",
        randomSuffix: "abc12345",
      }),
    ).toBe("kesku/ship-ui");
  });

  test("treats templates without placeholders as prefixes", () => {
    expect(
      renderBranchNameTemplate({
        template: "kesku",
        title: "Build Search",
        username: "kesku",
        randomSuffix: "abc12345",
      }),
    ).toBe("kesku/build-search");
  });

  test("rejects unsafe branch names", () => {
    expect(isValidBranchName("kesku/worktree")).toBe(true);
    expect(isValidBranchName("bad branch")).toBe(false);
    expect(isValidBranchName("bad..branch")).toBe(false);
    expect(isValidBranchName("/bad")).toBe(false);
    expect(isValidBranchName("bad/")).toBe(false);
  });
});
