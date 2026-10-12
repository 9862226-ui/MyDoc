import { describe, expect, it } from "vitest";
import { INBOX_COLOR, initialOf, PROJECT_COLORS, projectColor } from "./colors";

describe("projectColor", () => {
  it("按 id 循环分配颜色", () => {
    expect(projectColor(1)).toBe(PROJECT_COLORS[0]);
    expect(projectColor(2)).toBe(PROJECT_COLORS[1]);
    expect(projectColor(PROJECT_COLORS.length + 1)).toBe(PROJECT_COLORS[0]);
  });
  it("收件箱用灰色", () => {
    expect(projectColor(null)).toBe(INBOX_COLOR);
  });
});

describe("initialOf", () => {
  it("取第一个字", () => {
    expect(initialOf("官网改版")).toBe("官");
    expect(initialOf("  design")).toBe("D");
    expect(initialOf("😀 表情")).toBe("😀");
    expect(initialOf("")).toBe("#");
  });
});
