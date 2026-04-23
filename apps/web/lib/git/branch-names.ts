const SAFE_BRANCH_PATTERN = /^[\w\-/.]+$/;
const MAX_BRANCH_NAME_LENGTH = 180;

export const DEFAULT_BRANCH_NAME_TEMPLATE = "";

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function slugifyBranchSegment(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[-.]+$/g, "")
    .replace(/^[-.]+/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return slug || "worktree";
}

export function isValidBranchName(value: string): boolean {
  const branch = value.trim();
  if (branch.length === 0 || branch.length > MAX_BRANCH_NAME_LENGTH) {
    return false;
  }

  if (
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("//") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.includes("\\") ||
    branch.includes("~") ||
    branch.includes("^") ||
    branch.includes(":") ||
    branch.includes("?") ||
    branch.includes("*") ||
    branch.includes("[") ||
    branch.includes("]") ||
    branch.includes(" ")
  ) {
    return false;
  }

  return SAFE_BRANCH_PATTERN.test(branch);
}

export function normalizeBranchNameTemplate(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_BRANCH_NAME_TEMPLATE;
  }

  const template = value.trim();
  return template.length > MAX_BRANCH_NAME_LENGTH
    ? DEFAULT_BRANCH_NAME_TEMPLATE
    : template;
}

export function renderBranchNameTemplate(params: {
  template: string | null | undefined;
  title: string;
  username: string;
  randomSuffix: string;
}): string | null {
  const template = normalizeBranchNameTemplate(params.template);
  if (!template) {
    return null;
  }

  const worktree = slugifyBranchSegment(params.title);
  const user = slugifyBranchSegment(params.username);
  const random = slugifyBranchSegment(params.randomSuffix);

  const rendered = template.includes("[worktree]")
    ? template
        .replaceAll("[worktree]", worktree)
        .replaceAll("[user]", user)
        .replaceAll("[random]", random)
    : `${stripSlashes(template)}/${worktree}`;

  const branch = stripSlashes(rendered);
  return isValidBranchName(branch) ? branch : null;
}
