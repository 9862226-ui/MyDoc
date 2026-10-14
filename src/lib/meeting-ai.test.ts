import { describe, expect, it } from "vitest";
import { DEFAULT_AI } from "./ai";
import { openDb } from "./db";
import { buildMeetingPrompt, MAX_SOURCE, notesFromAi, organizeMeeting } from "./meeting-ai";
import { parseTaskMeta, parseTasks } from "./meetings";

describe("AI 整理会议纪要", () => {
  it("提示词：按模板的小节、写明待办格式、带上日期和参会人", () => {
    const [sys, user] = buildMeetingPrompt({
      title: "",
      date: "2026-10-14",
      attendees: "小林、王工",
      source: "发言人 1：上线定在 11 月 20 日。",
      sections: ["本周计划", "问题与风险", "待办"],
    });
    expect(sys.content).toContain("「本周计划」、「问题与风险」、「待办」");
    expect(sys.content).toContain('"本周计划":["..."]');
    expect(sys.content).toContain("@负责人");
    expect(user.content).toContain("2026-10-14（周三）");
    expect(user.content).toContain("参会人：小林、王工");
    expect(user.content).toContain("会议标题：（没填）");
  });

  it("没有模板小节时用「要点、结论、待办」", () => {
    expect(
      buildMeetingPrompt({ title: "x", date: "2026-10-14", attendees: "", source: "a", sections: [] })[0].content,
    ).toContain("「要点」、「结论」、「待办」");
  });

  it("把返回的 JSON 拼成纪要：按小节顺序、去掉空小节和多余的编号，待办写成可以打勾的", () => {
    const { notes, title } = notesFromAi(
      {
        title: " 知识库上线评审 ",
        sections: {
          待办: ["@小林 周五前 写完权限配置文档", "- [ ] @王工 下周二前完成压测"],
          要点: ["1. 测试环境已部署", "  切片清理问题已修复 ", "3.5 版本先上线"],
          结论: [],
          其他: "引用来源展示放到下个版本",
        },
      },
      ["要点", "结论", "待办"],
    );
    expect(title).toBe("知识库上线评审");
    expect(notes).toBe(
      "## 要点\n- 测试环境已部署\n- 切片清理问题已修复\n- 3.5 版本先上线\n\n## 待办\n- [ ] @小林 周五前 写完权限配置文档\n- [ ] @王工 下周二前完成压测\n\n## 其他\n- 引用来源展示放到下个版本",
    );
    // 整理出来的待办能认出负责人和截止日期
    const t = parseTasks(notes);
    expect(parseTaskMeta(t[1].text, "2026-10-14")).toEqual({ owner: "王工", due: "2026-10-20" });
  });

  it("返回的东西不对时给空结果", () => {
    expect(notesFromAi(null, ["要点"])).toEqual({ notes: "", title: "" });
    expect(notesFromAi({ sections: { 要点: [1, null] } }, ["要点"]).notes).toBe("");
  });

  it("没配模型、没有原文、原文太长时提示", async () => {
    const db = openDb(":memory:");
    const input = { title: "", date: "2026-10-14", attendees: "", source: "内容", sections: [] };
    await expect(organizeMeeting(db, input, DEFAULT_AI)).rejects.toThrow("还没有配置 AI 模型");
    const ready = { ...DEFAULT_AI, apiKey: "k" };
    await expect(organizeMeeting(db, { ...input, source: " " }, ready)).rejects.toThrow("先粘贴会议文字稿");
    await expect(organizeMeeting(db, { ...input, source: "字".repeat(MAX_SOURCE + 1) }, ready)).rejects.toThrow(
      "文字稿太长",
    );
  });
});
