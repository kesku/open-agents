import { describe, expect, test } from "bun:test";
import { getRandomAnimeName, getRandomCityName } from "./random-city";

describe("getRandomAnimeName", () => {
  test("returns a non-empty string when no names are used", () => {
    const result = getRandomAnimeName(new Set());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returned name is not in the usedNames set", () => {
    const used = new Set(["naruto", "bleach", "onepiece"]);
    const result = getRandomAnimeName(used);
    expect(used.has(result)).toBe(false);
  });

  test("avoids all used names when many are excluded", () => {
    const used = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const name = getRandomAnimeName(used);
      expect(used.has(name)).toBe(false);
      used.add(name);
    }
    expect(used.size).toBe(50);
  });

  test("falls back to numbered suffix when all names are exhausted", () => {
    const used = new Set<string>();
    for (let i = 0; i < 260; i++) {
      const name = getRandomAnimeName(used);
      used.add(name);
    }

    const overflow = getRandomAnimeName(used);
    expect(/-\d+$/.test(overflow)).toBe(true);
  });

  test("numbered suffix increments to avoid already-used suffixed names", () => {
    const used = new Set<string>();
    for (let i = 0; i < 260; i++) {
      used.add(getRandomAnimeName(used));
    }

    for (let i = 0; i < 5; i++) {
      const overflow = getRandomAnimeName(used);
      expect(used.has(overflow)).toBe(false);
      expect(/-\d+$/.test(overflow)).toBe(true);
      used.add(overflow);
    }
  });

  test("does not mutate the usedNames set", () => {
    const used = new Set(["naruto", "bleach"]);
    const sizeBefore = used.size;
    getRandomAnimeName(used);
    expect(used.size).toBe(sizeBefore);
  });

  test("keeps compatibility with the old city function name", () => {
    const result = getRandomCityName(new Set());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
