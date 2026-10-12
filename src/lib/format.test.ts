import { describe, expect, it } from "vitest";
import { expiryInfo, shortDate, shortTime } from "./format";

describe("shortTime", () => {
  const now = new Date(2026, 9, 12, 15, 30);
  it("今天和昨天显示时间", () => {
    expect(shortTime(new Date(2026, 9, 12, 10, 42).toISOString(), now)).toBe("今天 10:42");
    expect(shortTime(new Date(2026, 9, 12, 0, 5).toISOString(), now)).toBe("今天 00:05");
    expect(shortTime(new Date(2026, 9, 11, 18, 20).toISOString(), now)).toBe("昨天 18:20");
  });
  it("更早的显示日期，跨年带年份", () => {
    expect(shortTime(new Date(2026, 9, 9, 8, 0).toISOString(), now)).toBe("10月9日");
    expect(shortTime(new Date(2025, 2, 1, 8, 0).toISOString(), now)).toBe("2025年3月1日");
  });
});

describe("shortDate", () => {
  it("今年不带年份", () => {
    const today = new Date(2026, 9, 12);
    expect(shortDate("2026-10-19", today)).toBe("10月19日");
    expect(shortDate("2027-01-05", today)).toBe("2027年1月5日");
  });
});

describe("expiryInfo", () => {
  it("超过 7 天显示到期日期", () => {
    expect(expiryInfo("2026-11-11", new Date(2026, 9, 12))).toEqual({ label: "11月11日到期", level: "later" });
  });
});
