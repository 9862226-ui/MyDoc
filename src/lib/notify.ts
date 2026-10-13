import crypto from "node:crypto";
import type { DB } from "./db";
import { networkErrorMessage } from "./net-error";
import { expiryInfo, shortDate } from "./format";
import { isReminderDue, reminderState, sortReminders } from "./reminders";
import { getAppData } from "./repo";
import { getSetting, setSetting, zonedNow } from "./settings";
import type { AppData, Link, Reminder } from "./types";
import { daysUntil, EXPIRING_DAYS } from "./view";

export type Channel = "wecom" | "dingtalk" | "feishu" | "serverchan" | "bark" | "webhook";

export const CHANNELS: Channel[] = ["wecom", "dingtalk", "feishu", "serverchan", "bark", "webhook"];

export interface NotifyConfig {
  enabled: boolean;
  channel: Channel;
  /** 机器人 Webhook 地址；Server酱是 SendKey；Bark 是推送地址或 Key */
  target: string;
  /** 钉钉、飞书机器人的「加签」密钥，可以不填 */
  secret: string;
  /** 每天几点推送（0~23） */
  hour: number;
  /** 按哪个时区算「几点」，保存设置时取浏览器的时区 */
  timeZone: string;
  /** 同时提醒快到期的分享链接 */
  includeLinks: boolean;
  /** MyDoc 的访问地址，消息里附上链接 */
  siteUrl: string;
}

export const DEFAULT_NOTIFY: NotifyConfig = {
  enabled: false,
  channel: "wecom",
  target: "",
  secret: "",
  hour: 9,
  timeZone: "Asia/Shanghai",
  includeLinks: true,
  siteUrl: "",
};

export interface NotifyResult {
  at: string;
  ok: boolean;
  message: string;
}

export interface NotifyState {
  /** 已经处理过的日期（YYYY-MM-DD），当天不再推送 */
  date?: string;
  /** 推送失败的日期和次数：同一天最多试 3 次 */
  failDate?: string;
  attempts: number;
  last?: NotifyResult;
}

const CONFIG_KEY = "notify";
const STATE_KEY = "notify.state";
const MAX_ATTEMPTS = 3;

export const getNotifyConfig = (db: DB) => getSetting(db, CONFIG_KEY, DEFAULT_NOTIFY);
export const setNotifyConfig = (db: DB, c: NotifyConfig) => setSetting(db, CONFIG_KEY, c);
export const getNotifyState = (db: DB) => getSetting<NotifyState>(db, STATE_KEY, { attempts: 0 });
const setNotifyState = (db: DB, s: NotifyState) => setSetting(db, STATE_KEY, s);

/* ---------- 消息内容 ---------- */

export interface Digest {
  reminders: Reminder[];
  links: Link[];
}

/** 今天要提醒的事项：需要处理的提醒事项，以及 7 天内到期、还没过期的分享链接 */
export function buildDigest(data: AppData, today: Date, includeLinks: boolean): Digest {
  const reminders = sortReminders(data.reminders.filter((r) => isReminderDue(r, today)));
  const links = includeLinks
    ? data.links
        .filter((l) => {
          if (!l.expiresAt) return false;
          const d = daysUntil(l.expiresAt, today);
          return d >= 0 && d <= EXPIRING_DAYS;
        })
        .sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!))
    : [];
  return { reminders, links };
}

export interface Message {
  title: string;
  /** 企业微信、钉钉、Server酱 用 Markdown */
  markdown: string;
  /** 飞书、Bark 用纯文本 */
  text: string;
  url?: string;
}

const MAX_ITEMS = 20;

export function formatDigest(digest: Digest, today: Date, siteUrl: string, test = false): Message {
  const count = digest.reminders.length + digest.links.length;
  const title = test
    ? "MyDoc 测试消息"
    : `MyDoc 提醒：${count} 项快到期${digest.reminders.some((r) => reminderState(r, today).level === "overdue") ? "或已过期" : ""}`;
  const md: string[] = [];
  const txt: string[] = [];
  if (test) {
    const intro = count
      ? "推送设置成功，下面是现在需要处理的事项："
      : "推送设置成功。现在没有快到期的事项，有的时候会在这里提醒你。";
    md.push(intro);
    txt.push(intro);
  }
  if (digest.reminders.length) {
    md.push("**提醒事项**");
    txt.push("【提醒事项】");
    for (const r of digest.reminders.slice(0, MAX_ITEMS)) {
      const s = reminderState(r, today);
      const when = `${s.label}（${shortDate(r.dueDate, today)}）`;
      md.push(`- ${r.title}：${s.level === "overdue" ? `**${when}**` : when}`);
      txt.push(`· ${r.title}：${when}`);
    }
  }
  if (digest.links.length) {
    md.push("**分享链接**");
    txt.push("【分享链接】");
    for (const l of digest.links.slice(0, MAX_ITEMS)) {
      const when = `${expiryInfo(l.expiresAt!, today).label}（${shortDate(l.expiresAt!, today)}）`;
      md.push(`- [${l.title.replace(/[[\]]/g, "")}](${l.url})：${when}`);
      txt.push(`· ${l.title}：${when}`);
    }
  }
  const more = count - Math.min(digest.reminders.length, MAX_ITEMS) - Math.min(digest.links.length, MAX_ITEMS);
  if (more > 0) {
    md.push(`……还有 ${more} 项`);
    txt.push(`……还有 ${more} 项`);
  }
  const url = siteUrl
    ? `${siteUrl.replace(/\/+$/, "")}${digest.reminders.length || !digest.links.length ? "/reminders" : "/expiring"}`
    : undefined;
  if (url) {
    md.push(`[打开 MyDoc 查看](${url})`);
    txt.push(`打开查看：${url}`);
  }
  return { title, markdown: md.join("\n"), text: txt.join("\n"), url };
}

/* ---------- 发送 ---------- */

const hmacBase64 = (key: string, data: string) => crypto.createHmac("sha256", key).update(data).digest("base64");

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json;charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new Error(networkErrorMessage(e));
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 有的服务返回纯文本
  }
  if (!res.ok)
    throw new Error(
      `服务返回 ${res.status}${json.message || json.msg || json.errmsg ? `：${json.message ?? json.msg ?? json.errmsg}` : ""}`,
    );
  return { status: res.status, json };
}

const ensureHttpUrl = (url: string, name: string) => {
  if (!/^https?:\/\/\S+$/i.test(url.trim())) throw new Error(`请填写正确的${name}`);
  return url.trim();
};

/** Server酱：SCT 开头的 SendKey 和 Server酱³（sctp 开头）地址不同 */
export function serverChanUrl(key: string): string {
  const k = key.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(k)) throw new Error("SendKey 格式不正确");
  const sc3 = k.match(/^sctp(\d+)t/i);
  return sc3 ? `https://${sc3[1]}.push.ft07.com/send/${k}.send` : `https://sctapi.ftqq.com/${k}.send`;
}

/** Bark：可以填完整的推送地址（https://api.day.app/xxxx），也可以只填 Key */
export function barkUrl(target: string): string {
  const t = target.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(t)) return t;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) throw new Error("Bark 地址格式不正确");
  return `https://api.day.app/${t}`;
}

export async function sendMessage(c: NotifyConfig, m: Message): Promise<void> {
  switch (c.channel) {
    case "wecom": {
      const { json } = await postJson(ensureHttpUrl(c.target, "Webhook 地址"), {
        msgtype: "markdown",
        // 企业微信 Markdown 最长 4096 字节
        markdown: { content: `### ${m.title}\n${m.markdown}`.slice(0, 1300) },
      });
      if (json.errcode !== 0) throw new Error(`企业微信返回：${json.errmsg ?? "未知错误"}`);
      return;
    }
    case "dingtalk": {
      let url = ensureHttpUrl(c.target, "Webhook 地址");
      if (c.secret) {
        const ts = Date.now();
        url += `${url.includes("?") ? "&" : "?"}timestamp=${ts}&sign=${encodeURIComponent(hmacBase64(c.secret, `${ts}\n${c.secret}`))}`;
      }
      const { json } = await postJson(url, {
        msgtype: "markdown",
        markdown: { title: m.title, text: `### ${m.title}\n\n${m.markdown.replace(/\n/g, "\n\n")}` },
      });
      if (json.errcode !== 0) throw new Error(`钉钉返回：${json.errmsg ?? "未知错误"}`);
      return;
    }
    case "feishu": {
      const body: Record<string, unknown> = { msg_type: "text", content: { text: `${m.title}\n${m.text}` } };
      if (c.secret) {
        const ts = String(Math.floor(Date.now() / 1000));
        body.timestamp = ts;
        body.sign = crypto.createHmac("sha256", `${ts}\n${c.secret}`).update("").digest("base64");
      }
      const { json } = await postJson(ensureHttpUrl(c.target, "Webhook 地址"), body);
      const code = json.code ?? json.StatusCode;
      if (code !== 0) throw new Error(`飞书返回：${json.msg ?? json.StatusMessage ?? "未知错误"}`);
      return;
    }
    case "serverchan": {
      const { json } = await postJson(serverChanUrl(c.target), { title: m.title, desp: m.markdown });
      if (json.code !== 0) throw new Error(`Server酱返回：${json.message ?? "未知错误"}`);
      return;
    }
    case "bark": {
      const { json } = await postJson(barkUrl(c.target), {
        title: m.title,
        body: m.text,
        group: "MyDoc",
        ...(m.url ? { url: m.url } : {}),
      });
      if (json.code !== undefined && json.code !== 200) throw new Error(`Bark 返回：${json.message ?? "未知错误"}`);
      return;
    }
    case "webhook": {
      await postJson(ensureHttpUrl(c.target, "Webhook 地址"), {
        title: m.title,
        text: m.text,
        markdown: m.markdown,
        url: m.url ?? null,
      });
      return;
    }
  }
}

/* ---------- 定时推送 ---------- */

export type Sender = (c: NotifyConfig, m: Message) => Promise<void>;

/** 每天到了设定的时间推送一次；没有要提醒的事项就不发 */
export async function runDailyNotify(db: DB, now = new Date(), send: Sender = sendMessage) {
  const c = getNotifyConfig(db);
  if (!c.enabled || !c.target.trim()) return "off";
  const t = zonedNow(c.timeZone, now);
  const state = getNotifyState(db);
  if (state.date === t.date || t.hour < c.hour) return "waiting";
  const attempts = state.failDate === t.date ? state.attempts : 0;
  if (attempts >= MAX_ATTEMPTS) return "gave-up";

  const digest = buildDigest(getAppData(db), t.local, c.includeLinks);
  if (!digest.reminders.length && !digest.links.length) {
    setNotifyState(db, { ...state, date: t.date });
    return "nothing";
  }
  try {
    await send(c, formatDigest(digest, t.local, c.siteUrl));
    setNotifyState(db, { date: t.date, attempts: 0, last: { at: now.toISOString(), ok: true, message: "推送成功" } });
    return "sent";
  } catch (e) {
    setNotifyState(db, {
      ...state,
      failDate: t.date,
      attempts: attempts + 1,
      last: { at: now.toISOString(), ok: false, message: (e as Error).message },
    });
    return "failed";
  }
}

/** 发一条测试消息（内容是现在需要处理的事项） */
export async function sendTestMessage(db: DB, c: NotifyConfig, send: Sender = sendMessage): Promise<void> {
  const t = zonedNow(c.timeZone);
  const digest = buildDigest(getAppData(db), t.local, c.includeLinks);
  await send(c, formatDigest(digest, t.local, c.siteUrl, true));
}
