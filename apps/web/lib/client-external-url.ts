function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

function normalizeBrokenHttpPrefix(raw: string): string {
  return raw
    .replace(/^https?\/\//i, (match) => `${match.slice(0, -2)}://`)
    .replace(/^https?:\/(?!\/)/i, (match) => `${match}/`);
}

function looksLikeHostOrHostPort(raw: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#].*)?$/i.test(
    raw,
  );
}

export function normalizeClientExternalUrl(
  rawUrl: string,
  currentProtocol: `${"http" | "https"}:` | string = typeof window !==
  "undefined"
    ? window.location.protocol
    : "https:",
): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const protocol = currentProtocol === "http:" ? "http:" : "https:";

  let normalized = normalizeBrokenHttpPrefix(trimmed);
  if (normalized.startsWith("//")) {
    normalized = `${protocol}${normalized}`;
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    if (looksLikeHostOrHostPort(normalized)) {
      normalized = `${protocol}//${normalized}`;
    }
  } else if (
    !isHttpProtocol(
      normalized.slice(0, normalized.indexOf(":") + 1).toLowerCase(),
    )
  ) {
    if (looksLikeHostOrHostPort(normalized)) {
      normalized = `${protocol}//${normalized}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(normalized);
    return isHttpProtocol(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
