import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import * as mr from "./meeting-repo";
import { appendToSection, meetingText, NOTES_TEMPLATE, parseTasks, splitSentences, type Meeting } from "./meetings";
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
      "【会议纪要】周会\n时间：2026-10-14\n项目：知识库\n参会：张三、李四\n\n【要点】\n- 上线\n\n【待办】\n- ☐ a\n- ☑ b",
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
