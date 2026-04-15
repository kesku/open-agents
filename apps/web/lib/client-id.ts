export function createClientId(prefix = "id"): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isClientGeneratedId(value: string, prefix = "id"): boolean {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return true;
  }

  const fallbackPattern = new RegExp(`^${prefix}-[a-z0-9]+-[a-z0-9]{8}$`, "i");
  return fallbackPattern.test(value);
}
