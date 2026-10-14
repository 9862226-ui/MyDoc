import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import * as mr from "./meeting-repo";
import {
  appendToSection,
  isBlankNotes,
  MEETING_TEMPLATES,
  meetingMarkdown,
  meetingSeries,
  meetingText,
  NOTES_TEMPLATE,
  openTasksFrom,
  parseDue,
  parseOwner,
  parseTasks,
  previousMeeting,
  sectionsOf,
  tidyNotes,
  splitSentences,
  toTemplate,
  type Meeting,
} from "./meetings";
import { toggleTask } from "./md-edit";
import * as wr from "./worklog-repo";

describe("会议纪要", () => {
  it("从文字稿拆句子，去掉发言人和时间行", () => {
    const src =
      "发言人 1 00:12\n今天主要对一下上线时间。我建议 11 月 20 日上线！\n\n发言人2\n测试问题集周五前整理完；小林负责";
    expect(splitSentences(src)).toEqual([
      "今天主要对一下上线时间。",
      "我建议 11 月 20 日上线！",
      "测试问题集周五前整理完；",
      "小林负责",
    ]);
  });

  it("加到要点、待办：先替换模板里的空项，再往后加；没有这一节就新建", () => {
    let n = appendToSection(NOTES_TEMPLATE, "要点", "11 月 20 日上线");
    n = appendToSection(n, "待办", "整理测试问题集");
    n = appendToSection(n, "待办", "确认上线时间");
    n = appendToSection(n, "要点", "小林负责测试");
    expect(n).toBe("## 要点\n- 11 月 20 日上线\n- 小林负责测试\n\n## 待办\n- [ ] 整理测试问题集\n- [ ] 确认上线时间");
    expect(appendToSection("随便写的", "待办", "a")).toBe("随便写的\n\n## 待办\n- [ ] a");
  });

  it("解析待办，编号和打勾一致", () => {
    const notes = "## 待办\n- [ ] 一\n- [x] 二\n```\n- [ ] 代码\n```\n- [ ] 三";
    const tasks = parseTasks(notes);
    expect(tasks).toEqual([
      { index: 0, text: "一", done: false },
      { index: 1, text: "二", done: true },
      { index: 2, text: "三", done: false },
    ]);
    expect(parseTasks(toggleTask(notes, 2))[2].done).toBe(true);
  });

  it("复制成纯文本", () => {
    const m = {
      title: "周会",
      date: "2026-10-14",
      attendees: "张三、李四",
      notes: "## 要点\n- **上线**\n\n## 待办\n- [ ] a\n- [x] b",
    } as Meeting;
    expect(meetingText(m, "知识库")).toBe(
      "【会议纪要】周会\n时间：2026-10-14\n项目：知识库\n参会：张三、李四\n\n【要点】\n1. 上线\n\n【待办】\n☐ a\n☑ b",
    );
  });

  it("增删改查；删掉报工项目后纪要保留", () => {
    const db = openDb(":memory:");
    const p = wr.createWorkProject(db, { name: "知识库", code: "", taskName: "", taskCode: "", archived: false });
    const m = mr.createMeeting(db, {
      title: "周会",
      date: "2026-10-14",
      projectId: p.id,
      attendees: "",
      source: "",
      notes: "",
    });
    mr.createMeeting(db, { title: "评审", date: "2026-10-15", projectId: null, attendees: "", source: "", notes: "" });
    expect(mr.listMeetings(db).map((x) => x.title)).toEqual(["评审", "周会"]);
    expect(mr.updateMeeting(db, m.id, { notes: "## 要点" }).notes).toBe("## 要点");
    wr.deleteWorkProject(db, p.id);
    expect(mr.getMeeting(db, m.id).projectId).toBeNull();
    expect(() => mr.updateMeeting(db, m.id, { projectId: 999 })).toThrow("项目不存在");
    mr.deleteMeeting(db, m.id);
    expect(mr.listMeetings(db)).toHaveLength(1);
  });
});

describe("会议纪要：模板、复制、待办识别、上次待办", () => {
  it("保存前去掉模板里没填的空项和空小节", () => {
    const weekly = MEETING_TEMPLATES.find((t) => t.id === "weekly")!.notes;
    const written = appendToSection(appendToSection(weekly, "本周计划", "压测"), "待办", "写文档");
    expect(tidyNotes(written)).toBe("## 本周计划\n- 压测\n\n## 待办\n- [ ] 写文档");
    expect(tidyNotes(weekly)).toBe("");
    expect(tidyNotes("# 标题\n## 空\n\n## 有\n正文")).toBe("# 标题\n## 有\n正文");
    expect(tidyNotes("随手写的\n- 一条")).toBe("随手写的\n- 一条");
  });
  it("模板：小节、是否还没写内容、存成模板", () => {
    const weekly = MEETING_TEMPLATES.find((t) => t.id === "weekly")!.notes;
    expect(sectionsOf(weekly)).toEqual(["上周进展", "本周计划", "问题与风险", "待办"]);
    expect(isBlankNotes(weekly)).toBe(true);
    const written = appendToSection(weekly, "问题与风险", "服务器没到");
    expect(isBlankNotes(written)).toBe(false);
    expect(toTemplate(appendToSection(written, "待办", "催运维"))).toBe(weekly);
  });

  it("复制成微信格式：编号、下级缩进、空的小节不要、链接和引用变文字", () => {
    const m = {
      title: "周会",
      date: "2026-10-14",
      attendees: "",
      notes:
        "## 要点\n- 上线定在 [[log:3|11 月 20 日]]\n  - 先灰度\n- 见[文档](https://example.com/a) ![图](/api/attachments/2)\n\n## 风险\n- \n\n## 待办\n- [ ] 小林整理问题集",
    } as Meeting;
    expect(meetingText(m)).toBe(
      "【会议纪要】周会\n时间：2026-10-14\n\n【要点】\n1. 上线定在 11 月 20 日\n   · 先灰度\n2. 见文档（https://example.com/a） [图片]\n\n【待办】\n☐ 小林整理问题集",
    );
    expect(meetingMarkdown(m, "知识库")).toContain(
      "# 周会\n\n- 时间：2026-10-14\n- 项目：知识库\n\n## 要点\n- 上线定在 11 月 20 日",
    );
    expect(meetingMarkdown(m)).toContain("[图片：图]");
  });

  it("认出截止日期（会议在 2026-10-14 周三）", () => {
    const d = "2026-10-14";
    expect(parseDue("小林周五前把测试问题集整理出来", d)).toBe("2026-10-16");
    expect(parseDue("周一给答复", d)).toBe("2026-10-19");
    expect(parseDue("王工下周二前确认服务器扩容", d)).toBe("2026-10-20");
    expect(parseDue("明天发邮件", d)).toBe("2026-10-15");
    expect(parseDue("11月20日上线", d)).toBe("2026-11-20");
    expect(parseDue("1月5日前交年度总结", "2026-12-20")).toBe("2027-01-05");
    expect(parseDue("本周内出方案", d)).toBe("2026-10-16");
    expect(parseDue("月底前结项", d)).toBe("2026-10-31");
    expect(parseDue("20号之前", d)).toBe("2026-10-20");
    expect(parseDue("10号之前", d)).toBe("2026-11-10");
    expect(parseDue("整理文档", d)).toBeUndefined();
  });

  it("认出负责人", () => {
    expect(parseOwner("小林周五前把测试问题集整理出来")).toBe("小林");
    expect(parseOwner("王工下周二前确认服务器扩容")).toBe("王工");
    expect(parseOwner("确认扩容 @张三")).toBe("张三");
    expect(parseOwner("出方案，负责人：李四")).toBe("李四");
    expect(parseOwner("欧阳娜娜跟进合同", "欧阳娜娜、张三")).toBe("欧阳娜娜");
    expect(parseOwner("测试环境这周部署好")).toBeUndefined();
    expect(parseOwner("好的，引用来源展示我这两天补上")).toBeUndefined();
  });

  it("上次会议：同一个系列、同一个项目，带过来还没完成、这次也还没写的待办", () => {
    expect(meetingSeries("知识库周会 10.14")).toBe(meetingSeries("知识库周会（第 3 次）"));
    const mk = (id: number, title: string, date: string, notes: string, projectId: number | null = 1) =>
      ({ id, title, date, notes, projectId }) as Meeting;
    const list = [
      mk(1, "知识库周会 10.7", "2026-10-07", "## 待办\n- [ ] 整理问题集\n- [x] 部署测试环境\n- [ ] 确认扩容"),
      mk(2, "知识库周会 9.30", "2026-09-30", "## 待办\n- [ ] 很早的事"),
      mk(3, "评审会", "2026-10-10", "## 待办\n- [ ] 别的会"),
      mk(4, "知识库周会", "2026-10-09", "## 待办\n- [ ] 别的项目", 2),
    ];
    const prev = previousMeeting(list, { title: "知识库周会 10.14", date: "2026-10-14", projectId: 1 });
    expect(prev?.id).toBe(1);
    expect(openTasksFrom(prev, "## 待办\n- [ ] 确认扩容").map((t) => t.text)).toEqual(["整理问题集"]);
    expect(previousMeeting(list, { title: "", date: "2026-10-14", projectId: 1 })).toBeUndefined();
  });
});
