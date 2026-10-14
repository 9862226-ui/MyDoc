import { describe, expect, it } from "vitest";
import { COMMANDS, GO_KEYS, matchCommands, QUICK_COMMANDS } from "./commands";

describe("命令面板的操作", () => {
  it("可以用中文、拼音首字母、全拼找到", () => {
    expect(matchCommands("开工").map((c) => c.id)).toEqual(["plan", "calendar"]);
    expect(matchCommands("kg").map((c) => c.id)).toContain("plan");
    expect(matchCommands("shougong").map((c) => c.id)).toEqual(["shutdown"]);
    expect(matchCommands("会议").map((c) => c.id)).toEqual(["meeting", "go:/meetings"]);
    expect(matchCommands("今天 日报").map((c) => c.id)[0]).toBe("today");
    expect(matchCommands("")).toEqual([]);
  });

  it("G 加字母跳转，按键不重复", () => {
    expect(GO_KEYS.w).toBe("/work");
    expect(GO_KEYS.m).toBe("/meetings");
    const keys = COMMANDS.filter((c) => c.href).map((c) => c.keys![1]);
    expect(new Set(keys).size).toBe(keys.length);
    // 单键快捷键不能占用 G
    expect(COMMANDS.some((c) => c.keys?.length === 1 && c.keys[0] === "G")).toBe(false);
  });

  it("常用操作都存在", () => {
    for (const id of QUICK_COMMANDS) expect(COMMANDS.some((c) => c.id === id)).toBe(true);
  });
});
