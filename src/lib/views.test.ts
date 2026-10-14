import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { viewCreateSchema } from "./schemas";
import { linkViewHref, readLinkFilters, readWorkFilters, sameHref, workViewHref } from "./views";
import { addView, listViews, setViews } from "./views-repo";

describe("保存的视图", () => {
  it("链接筛选写进地址再读出来；没有筛选参数时不动", () => {
    const href = linkViewHref("/p/3", { q: "排期", platform: "feishu", tag: "技术", kind: "", sort: "visited" });
    expect(href).toBe("/p/3?q=%E6%8E%92%E6%9C%9F&platform=feishu&tag=%E6%8A%80%E6%9C%AF&sort=visited");
    expect(readLinkFilters(new URLSearchParams(href.split("?")[1]))).toEqual({
      q: "排期",
      platform: "feishu",
      tag: "技术",
      kind: "",
      sort: "visited",
    });
    expect(readLinkFilters(new URLSearchParams(""))).toBeNull();
  });

  it("工作记录的筛选：全部项目、全部状态不写", () => {
    expect(workViewHref({ q: " 切片 ", project: "3", status: "all" })).toBe(
      "/work?do=weekly&q=%E5%88%87%E7%89%87&project=3",
    );
    expect(workViewHref({ q: "", project: "all", status: "unsubmitted" })).toBe("/work?do=weekly&status=unsubmitted");
    expect(readWorkFilters(new URLSearchParams("do=weekly&project=none"))).toEqual({
      q: "",
      project: "none",
      status: "all",
    });
    expect(readWorkFilters(new URLSearchParams("do=weekly"))).toBeNull();
  });

  it("参数顺序不同也算同一个视图；同一个地址再存只改名", () => {
    expect(sameHref("/all?tag=a&q=b", "/all?q=b&tag=a")).toBe(true);
    expect(sameHref("/all?tag=a", "/inbox?tag=a")).toBe(false);
    const db = openDb(":memory:");
    addView(db, { name: "技术文档", href: "/all?tag=a&q=b", kind: "links" });
    addView(db, { name: "改个名", href: "/all?q=b&tag=a", kind: "links" });
    expect(listViews(db).map((v) => v.name)).toEqual(["改个名"]);
    const [v] = listViews(db);
    expect(setViews(db, [])).toEqual([]);
    expect(v.id).toBeTruthy();
  });

  it("只能存站内地址", () => {
    expect(viewCreateSchema.safeParse({ name: "x", href: "https://evil.example", kind: "links" }).success).toBe(false);
    expect(viewCreateSchema.safeParse({ name: "x", href: "//evil.example", kind: "links" }).success).toBe(false);
    expect(viewCreateSchema.safeParse({ name: "x", href: "/all?tag=a", kind: "links" }).success).toBe(true);
  });
});
