import { describe, expect, it } from "vitest";
import { clearFailures, createSession, lockedSeconds, MAX_FAILURES, recordFailure, validateSession } from "./auth";
import { openDb } from "./db";

describe("登录失败限制", () => {
  it("返回剩余次数，用完后锁定", () => {
    const key = "test-" + Math.random();
    expect(recordFailure(key)).toBe(MAX_FAILURES - 1);
    expect(recordFailure(key)).toBe(MAX_FAILURES - 2);
    for (let i = 2; i < MAX_FAILURES - 1; i++) recordFailure(key);
    expect(lockedSeconds(key)).toBe(0);
    expect(recordFailure(key)).toBe(0);
    expect(lockedSeconds(key)).toBeGreaterThan(0);
    clearFailures(key);
    expect(lockedSeconds(key)).toBe(0);
  });
});

describe("createSession", () => {
  it("按天数设置有效期", () => {
    const db = openDb(":memory:");
    const long = createSession(db);
    const short = createSession(db, 1);
    const day = 86400_000;
    expect(long.expires.getTime() - Date.now()).toBeGreaterThan(29 * day);
    expect(short.expires.getTime() - Date.now()).toBeLessThanOrEqual(day);
    expect(validateSession(db, short.token)).toBe(true);
    expect(validateSession(db, "nope")).toBe(false);
  });
});
