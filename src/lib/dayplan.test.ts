import { describe, expect, it } from "vitest";
import { isPlanDone, nextWorkday, planProgress, sameText, type DayPlanItem } from "./dayplan";
import { applyPlanOp, getDayPlan } from "./dayplan-repo";
import { openDb } from "./db";
import { createMeeting } from "./meeting-repo";
import { DEFAULT_WORK_SETTINGS, type WorkLog } from "./worklog";
import * as wr from "./worklog-repo";

const FRI = "2026-10-16";
const MON = "2026-10-19";

describe("计划的纯函数", () => {
  it("下一个工作日跳过周末和放假，调休上班算工作日", () => {
    expect(nextWorkday(DEFAULT_WORK_SETTINGS, FRI)).toBe(MON);
    const s = {
      ...DEFAULT_WORK_SETTINGS,
      specialDays: { [MON]: { off: true, name: "放假" }, "2026-10-17": { off: false, name: "补班" } },
    };
    expect(nextWorkday(s, FRI)).toBe("2026-10-17");
    expect(nextWorkday(s, "2026-10-17")).toBe("2026-10-20");
  });

  it("同一件事：忽略「继续」和结尾标点", () => {
    expect(sameText("继续修复切片问题。", "修复切片问题")).toBe(true);
    expect(sameText("写接口", "写接口文档")).toBe(false);
  });

  it("今天记过一样内容的算做完了；顺延和不做了的不算进度", () => {
    const item = (text: string, status: DayPlanItem["status"]): DayPlanItem => ({
      id: text,
      text,
      projectId: null,
      source: "manual",
      status,
    });
    const logs = [{ content: "写接口", done: true } as WorkLog];
    expect(isPlanDone(item("写接口", "todo"), logs)).toBe(true);
    expect(planProgress([item("写接口", "todo"), item("评审", "todo"), item("a", "carried")], logs)).toEqual({
      done: 1,
      total: 2,
    });
  });
});

describe("开工和收工", () => {
  const setup = () => {
    const db = openDb(":memory:");
    const p = wr.createWorkProject(db, { name: "知识库", code: "", taskName: "", taskCode: "", archived: false });
    return { db, p };
  };

  it("可以挑的事：前几天没处理的计划、没做完的记录、会议待办，去掉重复和已经记过的", () => {
    const { db, p } = setup();
    applyPlanOp(db, "2026-10-15", {
      op: "add",
      items: [{ text: "整理测试问题集", projectId: p.id, source: "manual" }],
    });
    wr.createWorkLogs(db, [
      { date: "2026-10-14", period: "am", projectId: p.id, content: "修复切片问题", hours: null, done: false },
      { date: "2026-10-14", period: "am", projectId: p.id, content: "写接口", hours: null, done: false },
      // 写接口第二天做完了，不再算没做完
      { date: "2026-10-15", period: "pm", projectId: p.id, content: "写接口", hours: null, done: true },
    ]);
    createMeeting(db, {
      title: "周会",
      date: "2026-10-15",
      projectId: p.id,
      attendees: "",
      source: "",
      notes: "- [ ] 确认服务器扩容\n- [x] 已经做完的\n- [ ] 修复切片问题",
    });
    const plan = getDayPlan(db, FRI);
    expect(plan.candidates.map((c) => [c.source, c.text])).toEqual([
      ["leftover", "整理测试问题集"],
      ["unfinished", "修复切片问题"],
      ["meeting", "确认服务器扩容"],
    ]);
    expect(plan.nextWorkday).toBe(MON);
  });

  it("挑了前几天的计划，原来那条记成顺延，不再出现", () => {
    const { db } = setup();
    const day1 = applyPlanOp(db, "2026-10-15", {
      op: "add",
      items: [{ text: "a", projectId: null, source: "manual" }],
    });
    const c = getDayPlan(db, FRI).candidates[0];
    applyPlanOp(db, FRI, { op: "add", items: [{ text: c.text, projectId: null, source: "leftover", ref: c.ref }] });
    const old = getDayPlan(db, "2026-10-15").items.find((i) => i.id === day1.items[0].id)!;
    expect([old.status, old.carriedTo]).toEqual(["carried", FRI]);
    expect(getDayPlan(db, FRI).candidates).toEqual([]);
  });

  it("打勾记成工作记录，取消打勾删掉；原来就有的记录不删", () => {
    const { db, p } = setup();
    let plan = applyPlanOp(db, FRI, {
      op: "add",
      items: [
        { text: "评审接口文档", projectId: p.id, source: "manual" },
        { text: "写周报", projectId: null, source: "manual" },
        { text: "评审接口文档", projectId: null, source: "manual" },
      ],
    });
    expect(plan.items).toHaveLength(2);
    const [a, b] = plan.items;
    plan = applyPlanOp(db, FRI, { op: "check", id: a.id, period: "am" });
    const logs = wr.listWorkLogs(db, FRI, FRI);
    expect(logs.map((l) => [l.content, l.projectId, l.period, l.done])).toEqual([["评审接口文档", p.id, "am", true]]);
    expect(plan.items[0]).toMatchObject({ status: "done", logId: logs[0].id, createdLog: true });
    applyPlanOp(db, FRI, { op: "uncheck", id: a.id });
    expect(wr.listWorkLogs(db, FRI, FRI)).toHaveLength(0);

    // 已经记过（还没完成）的：打勾时改成已完成，取消打勾时保留
    wr.createWorkLogs(db, [
      { date: FRI, period: "pm", projectId: null, content: "写周报。", hours: null, done: false },
    ]);
    applyPlanOp(db, FRI, { op: "check", id: b.id, period: "pm" });
    expect(wr.listWorkLogs(db, FRI, FRI).map((l) => [l.content, l.done])).toEqual([["写周报。", true]]);
    applyPlanOp(db, FRI, { op: "uncheck", id: b.id });
    expect(wr.listWorkLogs(db, FRI, FRI)).toHaveLength(1);
  });

  it("顺延到下一个工作日，可以撤销；收工记下时间", () => {
    const { db } = setup();
    const [a] = applyPlanOp(db, FRI, { op: "add", items: [{ text: "压测", projectId: null, source: "manual" }] }).items;
    let plan = applyPlanOp(db, FRI, { op: "carry", id: a.id });
    expect(plan.items[0]).toMatchObject({ status: "carried", carriedTo: MON });
    expect(getDayPlan(db, MON).items.map((i) => [i.text, i.source, i.status])).toEqual([["压测", "carry", "todo"]]);
    plan = applyPlanOp(db, FRI, { op: "restore", id: a.id });
    expect(plan.items[0].status).toBe("todo");
    expect(getDayPlan(db, MON).items).toEqual([]);
    applyPlanOp(db, FRI, { op: "drop", id: a.id });
    expect(applyPlanOp(db, FRI, { op: "shutdown" }).shutdownAt).toBeTruthy();
    expect(getDayPlan(db, FRI).items[0].status).toBe("dropped");
  });

  it("计划会跟着 JSON 备份一起导出", () => {
    const { db } = setup();
    applyPlanOp(db, FRI, { op: "add", items: [{ text: "压测", projectId: null, source: "manual" }] });
    const r = wr.exportWork(db).reports.find((x) => x.key === FRI)!;
    expect((r.fields.plan as DayPlanItem[])[0].text).toBe("压测");
  });
});

describe("下班提醒里的计划", () => {
  it("说一下今天计划完成了几件", async () => {
    const { remindMessage } = await import("./worklog-remind");
    const db = openDb(":memory:");
    const plan = applyPlanOp(db, FRI, {
      op: "add",
      items: [
        { text: "压测", projectId: null, source: "manual" },
        { text: "写周报", projectId: null, source: "manual" },
      ],
    });
    applyPlanOp(db, FRI, { op: "check", id: plan.items[0].id, period: "pm" });
    const msg = remindMessage("daily", wr.getWorkWeek(db, FRI), FRI, "https://doc.example.test", false);
    expect(msg.text).toContain("今天计划 2 件，完成了 1 件");
    expect(msg.markdown).toContain("[收工：核对今天、整理日报](https://doc.example.test/work?do=shutdown)");
  });
});
