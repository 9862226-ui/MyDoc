import { describe, expect, it } from "vitest";
import { expiryInfo, relativeTime } from "./format";
import type { AppData, Link } from "./types";
import { applyFilters, daysUntil, linksForView, search, sortLinks } from "./view";

function link(id: number, patch: Partial<Link> = {}): Link {
  return {
    id,
    projectId: null,
    title: `链接${id}`,
    url: `https://example.com/${id}`,
    note: "",
    accessCode: "",
    expiresAt: null,
    pinned: false,
    favorite: false,
    visitCount: 0,
    lastVisitedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    ...patch,
  };
}

const data: AppData = {
  groups: [{ id: 1, name: "工作", sort: 0 }],
  projects: [{ id: 10, groupId: 1, name: "官网改版", description: "", archived: false, sort: 0 }],
  tags: [],
  reminders: [],
  links: [
    link(1, { title: "需求文档", projectId: 10, url: "https://a.feishu.cn/docx/1", tags: ["需求"], visitCount: 3 }),
    link(2, { title: "排期表", url: "https://docs.qq.com/sheet/2", lastVisitedAt: "2026-10-01T00:00:00Z" }),
    link(3, { title: "设计稿 需求评审", projectId: 10, favorite: true, lastVisitedAt: "2026-10-05T00:00:00Z" }),
  ],
};

describe("daysUntil", () => {
  const today = new Date(2026, 9, 12, 15, 30);
  it("按本地日期计算", () => {
    expect(daysUntil("2026-10-12", today)).toBe(0);
    expect(daysUntil("2026-10-13", today)).toBe(1);
    expect(daysUntil("2026-10-01", today)).toBe(-11);
  });
  it("到期提示文字", () => {
    expect(expiryInfo("2026-10-11", today)).toEqual({ label: "已过期", level: "expired" });
    expect(expiryInfo("2026-10-15", today)).toEqual({ label: "3 天后到期", level: "soon" });
    expect(expiryInfo("2026-12-01", today).level).toBe("later");
  });
});

describe("relativeTime", () => {
  const now = new Date(2026, 9, 12, 15, 30);
  it("显示相对时间", () => {
    expect(relativeTime(new Date(2026, 9, 12, 15, 29, 30).toISOString(), now)).toBe("刚刚");
    expect(relativeTime(new Date(2026, 9, 12, 13, 0).toISOString(), now)).toBe("2 小时前");
    expect(relativeTime(new Date(2026, 9, 11, 23, 0).toISOString(), now)).toBe("昨天");
    expect(relativeTime(new Date(2026, 9, 8, 10, 0).toISOString(), now)).toBe("4 天前");
    expect(relativeTime(new Date(2026, 5, 1).toISOString(), now)).toBe("6月1日");
    expect(relativeTime(null, now)).toBe("从未");
  });
});

describe("linksForView", () => {
  it("收件箱、项目、标签、最近访问", () => {
    expect(linksForView(data, { kind: "inbox" }).map((l) => l.id)).toEqual([2]);
    expect(linksForView(data, { kind: "project", id: 10 }).map((l) => l.id)).toEqual([1, 3]);
    expect(linksForView(data, { kind: "tag", name: "需求" }).map((l) => l.id)).toEqual([1]);
    expect(linksForView(data, { kind: "recent" }).map((l) => l.id)).toEqual([3, 2]);
    expect(linksForView(data, { kind: "favorites" }).map((l) => l.id)).toEqual([3]);
  });
});

describe("sortLinks", () => {
  it("置顶在前，名称按拼音排序", () => {
    const sorted = sortLinks([link(1, { title: "需求" }), link(2, { title: "安排" }), link(3, { title: "排期", pinned: true })], "title");
    expect(sorted.map((l) => l.title)).toEqual(["排期", "安排", "需求"]);
  });
});

describe("搜索与筛选", () => {
  it("所有关键词都要匹配，可搜项目名和平台", () => {
    expect(applyFilters(data.links, data, { q: "官网 需求", platform: "", tag: "" }).map((l) => l.id)).toEqual([1, 3]);
    expect(applyFilters(data.links, data, { q: "腾讯", platform: "", tag: "" }).map((l) => l.id)).toEqual([2]);
    expect(applyFilters(data.links, data, { q: "", platform: "feishu", tag: "" }).map((l) => l.id)).toEqual([1]);
  });

  it("标题以关键词开头的排前面，也返回匹配的项目", () => {
    const r = search(data, "需求");
    expect(r.links.map((l) => l.id)).toEqual([1, 3]);
    expect(search(data, "官网").projects.map((p) => p.project.id)).toEqual([10]);
    expect(search(data, "  ").links).toEqual([]);
  });
});
