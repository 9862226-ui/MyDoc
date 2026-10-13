import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { pinyinIndex, syllables } from "./pinyin";
import * as repo from "./repo";
import { applyFilters, pinyinHits, pinyinMatch, search } from "./view";

describe("syllables", () => {
  it("中文转拼音，多音字按词语读", () => {
    expect(syllables("官网改版排期表")).toBe("guan wang gai ban pai qi biao");
    expect(syllables("重庆银行")).toBe("chong qing yin hang");
    expect(syllables("2026 报价单 v2")).toBe("bao jia dan");
    expect(syllables("Figma")).toBe("");
    expect(pinyinIndex("需求文档", "设计", "v2")).toBe("xu qiu wen dang | she ji");
    expect(pinyinIndex("abc")).toBeUndefined();
  });
});

describe("pinyinMatch", () => {
  const py = "guan wang gai ban pai qi biao | she ji";
  it("首字母、全拼、混着打都能对上", () => {
    for (const t of ["pqb", "paiqibiao", "paiqb", "pqbiao", "gwgb", "guanwang", "gaib", "sj", "sheji"]) {
      expect(pinyinMatch(t, py), t).toBe(true);
    }
  });
  it("不会乱匹配", () => {
    for (const t of ["qp", "pqx", "biaoshe", "bs", "wanggaiz", "排期", "pq1"]) {
      expect(pinyinMatch(t, py), t).toBe(false);
    }
    expect(pinyinMatch("pqb", undefined)).toBe(false);
  });
});

describe("pinyinHits", () => {
  it("标出拼音对上的字", () => {
    const hits = (q: string) =>
      [...pinyinHits("官网 v2 排期表", "guan wang pai qi biao", q.split(" "))].sort((a, b) => a - b);
    expect(hits("pqb")).toEqual([6, 7, 8]);
    expect(hits("gw pq")).toEqual([0, 1, 6, 7]);
    expect(hits("xyz")).toEqual([]);
    expect([...pinyinHits("排期", "pai qi biao", ["pq"])]).toEqual([]);
  });
});

describe("拼音搜索", () => {
  const db = openDb(":memory:");
  const g = repo.createGroup(db, "工作");
  const p = repo.createProject(db, { groupId: g.id, name: "官网改版", description: "" });
  const base = { note: "", accessCode: "", expiresAt: null, pinned: false, favorite: false };
  repo.createLink(db, { ...base, url: "https://a.feishu.cn/sheets/1", title: "排期表", projectId: p.id, tags: [] });
  repo.createLink(db, {
    ...base,
    url: "https://docs.qq.com/doc/2",
    title: "周会纪要",
    projectId: null,
    tags: ["会议"],
  });
  const data = repo.getAppData(db);
  const titles = (q: string) => search(data, q).links.map((l) => l.title);

  it("按标题、标签、项目名的拼音都能找到", () => {
    expect(titles("pqb")).toEqual(["排期表"]);
    expect(titles("zhouhui")).toEqual(["周会纪要"]);
    expect(titles("hy")).toEqual(["周会纪要"]);
    expect(titles("gwgb")).toEqual(["排期表"]);
    expect(titles("gwgb pq")).toEqual(["排期表"]);
    expect(search(data, "gwgb").projects.map((i) => i.project.name)).toEqual(["官网改版"]);
  });

  it("列表筛选也支持拼音", () => {
    const f = (q: string) => applyFilters(data.links, data, { q, platform: "", tag: "" }).map((l) => l.title);
    expect(f("zhjy")).toEqual(["周会纪要"]);
    expect(f("feishu pqb")).toEqual(["排期表"]);
  });
});
