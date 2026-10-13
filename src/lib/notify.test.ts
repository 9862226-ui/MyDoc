import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import {
  barkUrl,
  buildDigest,
  DEFAULT_NOTIFY,
  formatDigest,
  getNotifyState,
  runDailyNotify,
  serverChanUrl,
  setNotifyConfig,
  type Message,
  type NotifyConfig,
} from "./notify";
import * as rr from "./reminder-repo";
import * as repo from "./repo";
import { zonedNow } from "./settings";

let db: DB;
const base = { note: "", accessCode: "", pinned: false, favorite: false, tags: [], projectId: null };

beforeEach(() => {
  db = openDb(":memory:");
});

describe("zonedNow", () => {
  it("按指定时区算日期和小时", () => {
    const t = zonedNow("Asia/Shanghai", new Date("2026-10-13T17:30:00Z"));
    expect(t).toMatchObject({ date: "2026-10-14", hour: 1 });
    expect(t.local.getDate()).toBe(14);
    expect(zonedNow("America/New_York", new Date("2026-10-13T17:30:00Z")).hour).toBe(13);
  });
});

describe("推送内容", () => {
  it("包含需要处理的提醒和 7 天内到期的分享链接", () => {
    const today = new Date(2026, 9, 13, 9);
    rr.createReminder(db, { title: "域名", dueDate: "2026-10-10", repeat: "yearly", remindDays: 7, url: "", note: "" });
    rr.createReminder(db, { title: "以后的", dueDate: "2026-12-10", repeat: "none", remindDays: 7, url: "", note: "" });
    repo.createLink(db, { ...base, url: "https://pan.baidu.com/s/1", title: "合同", expiresAt: "2026-10-15" });
    repo.createLink(db, { ...base, url: "https://pan.baidu.com/s/2", title: "早过期了", expiresAt: "2026-09-01" });
    const digest = buildDigest(repo.getAppData(db), today, true);
    expect(digest.reminders.map((r) => r.title)).toEqual(["域名"]);
    expect(digest.links.map((l) => l.title)).toEqual(["合同"]);
    expect(buildDigest(repo.getAppData(db), today, false).links).toEqual([]);

    const m = formatDigest(digest, today, "https://doc.example.com/");
    expect(m.title).toBe("MyDoc 提醒：2 项快到期或已过期");
    expect(m.markdown).toContain("- 域名：**已过期 3 天（10月10日）**");
    expect(m.markdown).toContain("[合同](https://pan.baidu.com/s/1)：2 天后到期（10月15日）");
    expect(m.text).toContain("打开查看：https://doc.example.com/reminders");
  });
});

describe("推送地址", () => {
  it("Server酱两种 SendKey", () => {
    expect(serverChanUrl("SCT123abc")).toBe("https://sctapi.ftqq.com/SCT123abc.send");
    expect(serverChanUrl("sctp4567tABC")).toBe("https://4567.push.ft07.com/send/sctp4567tABC.send");
    expect(() => serverChanUrl("bad key/")).toThrow();
  });
  it("Bark 可以填地址或 Key", () => {
    expect(barkUrl("https://api.day.app/abc/")).toBe("https://api.day.app/abc");
    expect(barkUrl("abc")).toBe("https://api.day.app/abc");
  });
});

describe("每天定时推送", () => {
  const sent: Message[] = [];
  let fail = false;
  const send = async (_c: NotifyConfig, m: Message) => {
    if (fail) throw new Error("连接超时");
    sent.push(m);
  };
  const at = (iso: string) => new Date(iso);

  beforeEach(() => {
    sent.length = 0;
    fail = false;
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, enabled: true, target: "https://x", hour: 9, timeZone: "Asia/Shanghai" });
    rr.createReminder(db, {
      title: "服务器",
      dueDate: "2026-10-15",
      repeat: "yearly",
      remindDays: 7,
      url: "",
      note: "",
    });
  });

  it("到点才发，一天只发一次", async () => {
    expect(await runDailyNotify(db, at("2026-10-13T00:30:00Z"), send)).toBe("waiting"); // 北京时间 8:30
    expect(await runDailyNotify(db, at("2026-10-13T01:05:00Z"), send)).toBe("sent"); // 9:05
    expect(await runDailyNotify(db, at("2026-10-13T05:00:00Z"), send)).toBe("waiting");
    expect(sent).toHaveLength(1);
    expect(await runDailyNotify(db, at("2026-10-14T01:00:00Z"), send)).toBe("sent");
  });

  it("没有要提醒的事项就不发", async () => {
    db.prepare("DELETE FROM reminders").run();
    expect(await runDailyNotify(db, at("2026-10-13T02:00:00Z"), send)).toBe("nothing");
    expect(sent).toHaveLength(0);
  });

  it("失败后重试，同一天最多 3 次", async () => {
    fail = true;
    for (let i = 0; i < 3; i++) expect(await runDailyNotify(db, at("2026-10-13T02:00:00Z"), send)).toBe("failed");
    expect(await runDailyNotify(db, at("2026-10-13T03:00:00Z"), send)).toBe("gave-up");
    expect(getNotifyState(db).last).toMatchObject({ ok: false, message: "连接超时" });
    fail = false;
    expect(await runDailyNotify(db, at("2026-10-14T02:00:00Z"), send)).toBe("sent");
  });

  it("关闭时不发", async () => {
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, enabled: false, target: "https://x" });
    expect(await runDailyNotify(db, at("2026-10-13T02:00:00Z"), send)).toBe("off");
  });
});
