import { z } from "zod";
import type { DB } from "./db";
import { HttpError } from "./errors";
import { detectPlatform, fallbackTitle } from "./platforms";
import * as rr from "./reminder-repo";
import { isReminderDue, reminderState, sortReminders } from "./reminders";
import * as repo from "./repo";
import { parseShareText } from "./share-text";
import * as sr from "./snippet-repo";
import type { AppData, Link, Reminder, Snippet } from "./types";
import { toHttpUrl, urlKey } from "./url";
import { projectIndex, projectPathLabel, search, snippetMatches } from "./view";

/** 工具执行时出的错：返回给 AI 看，方便它自己改正 */
export class ToolError extends Error {}

export interface ToolContext {
  db: DB;
  /** 获取网页标题（测试时可以替换） */
  fetchTitle: (url: string) => Promise<string>;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (ctx: ToolContext, args: never) => unknown;
}

function tool<S extends z.ZodType>(
  def: Omit<Tool, "input" | "run"> & { input: S; run: (ctx: ToolContext, args: z.infer<S>) => unknown },
): Tool {
  return def as unknown as Tool;
}

/* ---------- 参数 ---------- */

const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const tags = z.array(z.string().trim().min(1).max(30)).max(30);
const projectRef = z
  .union([z.number().int(), z.string().trim().min(1)])
  .describe("项目：项目 id、「分组/项目」或项目名称；「收件箱」表示不放进项目");

/* ---------- 输出 ---------- */

function linkOut(l: Link, data: AppData) {
  const index = projectIndex(data);
  const out: Record<string, unknown> = {
    id: l.id,
    title: l.title,
    url: l.url,
    project: projectPathLabel(l.projectId === null ? undefined : index.get(l.projectId)),
    platform: detectPlatform(l.url).name,
  };
  if (l.accessCode) out.accessCode = l.accessCode;
  if (l.tags.length) out.tags = l.tags;
  if (l.note) out.note = l.note;
  if (l.expiresAt) out.expiresAt = l.expiresAt;
  if (l.favorite) out.favorite = true;
  if (l.pinned) out.pinned = true;
  if (l.deletedAt) out.deletedAt = l.deletedAt;
  out.visitCount = l.visitCount;
  if (l.lastVisitedAt) out.lastVisitedAt = l.lastVisitedAt;
  out.createdAt = l.createdAt;
  return out;
}

function snippetOut(s: Snippet, data: AppData) {
  const out: Record<string, unknown> = { id: s.id, content: s.content };
  if (s.projectId !== null) out.project = projectPathLabel(projectIndex(data).get(s.projectId));
  if (s.tags.length) out.tags = s.tags;
  if (s.sourceUrl) out.sourceUrl = s.sourceUrl;
  if (s.sourceTitle) out.sourceTitle = s.sourceTitle;
  out.createdAt = s.createdAt;
  return out;
}

function reminderOut(r: Reminder) {
  const state = reminderState(r);
  const out: Record<string, unknown> = {
    id: r.id,
    title: r.title,
    dueDate: r.dueDate,
    status: state.label,
    needsAttention: isReminderDue(r),
    repeat: r.repeat,
    remindDays: r.remindDays,
  };
  if (r.url) out.url = r.url;
  if (r.note) out.note = r.note;
  if (r.doneAt) out.doneAt = r.doneAt;
  return out;
}

/* ---------- 查找项目 ---------- */

const INBOX_NAMES = ["收件箱", "inbox", "未分类", "none", "null"];

/** 把「项目 id / 分组/项目 / 项目名」换成项目 id；收件箱返回 null */
export function resolveProject(data: AppData, ref: number | string): number | null {
  if (typeof ref === "number" || /^\d+$/.test(ref)) {
    const pid = Number(ref);
    if (!data.projects.some((p) => p.id === pid)) throw new ToolError(`项目 ${pid} 不存在，可以用 list_projects 查看`);
    return pid;
  }
  const text = ref.trim();
  if (INBOX_NAMES.includes(text.toLowerCase())) return null;
  const index = projectIndex(data);
  const lower = (s: string) => s.trim().toLowerCase();
  const slash = text.split(/\s*\/\s*/);
  let found = [...index.values()];
  if (slash.length === 2) {
    found = found.filter(
      (i) => lower(i.group?.name ?? "") === lower(slash[0]) && lower(i.project.name) === lower(slash[1]),
    );
  } else {
    found = found.filter((i) => lower(i.project.name) === lower(text));
  }
  if (found.length === 1) return found[0].project.id;
  if (found.length > 1) {
    throw new ToolError(
      `有多个叫「${text}」的项目，请用「分组/项目」或项目 id：${found.map(projectPathLabel).join("、")}`,
    );
  }
  throw new ToolError(`没有找到项目「${text}」，可以用 list_projects 查看已有项目，或用 create_project 新建`);
}

function existingLink(db: DB, url: string): Link | undefined {
  const key = urlKey(url);
  return repo.getAppData(db).links.find((l) => urlKey(l.url) === key);
}

function getLiveLink(db: DB, linkId: number): Link {
  try {
    return repo.getLink(db, linkId);
  } catch (e) {
    if (e instanceof HttpError) throw new ToolError(`链接 ${linkId} 不存在`);
    throw e;
  }
}

function getReminder(db: DB, reminderId: number): Reminder {
  try {
    return rr.getReminder(db, reminderId);
  } catch (e) {
    if (e instanceof HttpError) throw new ToolError(`提醒 ${reminderId} 不存在`);
    throw e;
  }
}

/** 网址，或者含网址的分享文案（会拆出提取码和标题） */
function parseUrlInput(text: string): { url: string; title: string; accessCode: string } {
  const url = toHttpUrl(text);
  if (url) return { url, title: "", accessCode: "" };
  const draft = parseShareText(text)[0];
  if (!draft) throw new ToolError("链接格式不正确（只支持 http / https 链接）");
  return draft;
}

/* ---------- 工具 ---------- */

export const TOOLS: Tool[] = [
  tool({
    name: "search_links",
    title: "搜索链接",
    description:
      "在 MyDoc 收藏的链接里搜索（标题、网址、备注、标签、项目名、平台名都会匹配，也支持拼音和首字母，多个关键词用空格分开）。" +
      "不填 query 时按最近更新列出。返回链接的 id、标题、网址、所在项目、提取码等。",
    input: z.object({
      query: z.string().optional().describe("搜索关键词，例如「排期 飞书」"),
      project: projectRef.optional(),
      tag: z.string().optional().describe("只看带这个标签的链接"),
      favorite: z.boolean().optional().describe("只看收藏的链接"),
      limit: z.number().int().min(1).max(100).default(20).describe("最多返回多少条，默认 20"),
    }),
    annotations: { readOnlyHint: true },
    run: ({ db }, a) => {
      const data = repo.getAppData(db);
      let links = a.query?.trim()
        ? search(data, a.query, 10000).links
        : [...data.links].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
      if (a.project !== undefined) {
        const pid = resolveProject(data, a.project);
        links = links.filter((l) => l.projectId === pid);
      }
      if (a.tag) links = links.filter((l) => l.tags.some((t) => t.toLowerCase() === a.tag!.toLowerCase()));
      if (a.favorite) links = links.filter((l) => l.favorite);
      return { total: links.length, links: links.slice(0, a.limit).map((l) => linkOut(l, data)) };
    },
  }),

  tool({
    name: "get_link",
    title: "查看链接",
    description: "按 id 查看一个链接的全部信息。",
    input: z.object({ id }),
    annotations: { readOnlyHint: true },
    run: ({ db }, a) => linkOut(getLiveLink(db, a.id), repo.getAppData(db)),
  }),

  tool({
    name: "list_projects",
    title: "列出项目和标签",
    description:
      "列出所有分组、项目（含 id 和链接数量）、收件箱里的链接数和全部标签。添加或移动链接前可以先用它确认项目。",
    input: z.object({ include_archived: z.boolean().default(false).describe("是否包含已归档的项目") }),
    annotations: { readOnlyHint: true },
    run: ({ db }, a) => {
      const data = repo.getAppData(db);
      const count = (pid: number | null) => data.links.filter((l) => l.projectId === pid).length;
      const tagCount = (name: string) =>
        data.links.filter((l) => l.tags.some((t) => t.toLowerCase() === name.toLowerCase())).length;
      return {
        groups: data.groups.map((g) => ({
          name: g.name,
          projects: data.projects
            .filter((p) => p.groupId === g.id && (a.include_archived || !p.archived))
            .map((p) => ({
              id: p.id,
              name: p.name,
              ...(p.description ? { description: p.description } : {}),
              ...(p.archived ? { archived: true } : {}),
              links: count(p.id),
            })),
        })),
        inbox: count(null),
        tags: data.tags.map((t) => ({ name: t.name, links: tagCount(t.name) })),
      };
    },
  }),

  tool({
    name: "add_link",
    title: "添加链接",
    description:
      "收藏一个链接。url 也可以是整段分享文案（如「链接: https://pan.baidu.com/s/xxx 提取码: ab12」），会自动拆出提取码。" +
      "不填标题时自动获取网页标题。链接已存在时不会重复添加，而是返回已有的那条（除非 allow_duplicate 为 true）。",
    input: z.object({
      url: z.string().min(1).max(4096).describe("网址或分享文案"),
      title: z.string().trim().max(200).optional(),
      project: projectRef.optional().describe("放进哪个项目，不填放进收件箱"),
      tags: tags.optional(),
      note: z.string().max(5000).optional(),
      access_code: z.string().trim().max(64).optional().describe("提取码 / 访问密码"),
      expires_at: date.optional().describe("分享链接的到期日期 YYYY-MM-DD"),
      favorite: z.boolean().optional(),
      allow_duplicate: z.boolean().default(false),
    }),
    run: async ({ db, fetchTitle }, a) => {
      const parsed = parseUrlInput(a.url);
      const data = repo.getAppData(db);
      const projectId = a.project === undefined ? null : resolveProject(data, a.project);
      const dup = existingLink(db, parsed.url);
      if (dup && !a.allow_duplicate) {
        return { added: false, message: "这个链接已经收藏过了", existing: linkOut(dup, data) };
      }
      const title = a.title || parsed.title || (await fetchTitle(parsed.url)) || fallbackTitle(parsed.url);
      const link = repo.createLink(db, {
        url: parsed.url,
        title,
        projectId,
        note: a.note ?? "",
        accessCode: a.access_code ?? parsed.accessCode,
        expiresAt: a.expires_at ?? null,
        pinned: false,
        favorite: a.favorite ?? false,
        tags: a.tags ?? [],
      });
      return { added: true, link: linkOut(link, repo.getAppData(db)) };
    },
  }),

  tool({
    name: "update_link",
    title: "修改链接",
    description:
      "修改链接：只改传入的字段。tags 会整体替换；expires_at 传 null 表示长期有效；project 传「收件箱」移出项目。",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(200).optional(),
      url: z.string().max(4096).optional(),
      project: projectRef.optional(),
      tags: tags.optional(),
      note: z.string().max(5000).optional(),
      access_code: z.string().trim().max(64).optional(),
      expires_at: date.nullable().optional(),
      favorite: z.boolean().optional(),
      pinned: z.boolean().optional(),
    }),
    annotations: { idempotentHint: true },
    run: ({ db }, a) => {
      getLiveLink(db, a.id);
      const data = repo.getAppData(db);
      let url: string | undefined;
      if (a.url !== undefined) {
        url = toHttpUrl(a.url) ?? undefined;
        if (!url) throw new ToolError("链接格式不正确（只支持 http / https 链接）");
      }
      const link = repo.updateLink(db, a.id, {
        title: a.title,
        url,
        projectId: a.project === undefined ? undefined : resolveProject(data, a.project),
        tags: a.tags,
        note: a.note,
        accessCode: a.access_code,
        expiresAt: a.expires_at,
        favorite: a.favorite,
        pinned: a.pinned,
      });
      return linkOut(link, repo.getAppData(db));
    },
  }),

  tool({
    name: "delete_link",
    title: "删除链接",
    description: "把链接移到回收站（30 天内可以在网页上恢复）。",
    input: z.object({ id }),
    annotations: { destructiveHint: true, idempotentHint: true },
    run: ({ db }, a) => {
      const link = getLiveLink(db, a.id);
      repo.batchLinks(db, [a.id], { action: "delete" });
      return { deleted: true, title: link.title, message: "已移到回收站，30 天内可以恢复" };
    },
  }),

  tool({
    name: "create_project",
    title: "新建项目",
    description: "在某个分组下新建项目；分组不存在时自动创建。项目已存在时直接返回它。",
    input: z.object({
      group: z.string().trim().min(1).max(60).describe("分组名，例如「工作」"),
      name: z.string().trim().min(1).max(60).describe("项目名"),
      description: z.string().trim().max(500).optional(),
    }),
    annotations: { idempotentHint: true },
    run: ({ db }, a) => {
      let data = repo.getAppData(db);
      const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
      const group = data.groups.find((g) => same(g.name, a.group)) ?? repo.createGroup(db, a.group);
      const existing = data.projects.find((p) => p.groupId === group.id && same(p.name, a.name));
      if (existing) return { created: false, id: existing.id, project: `${group.name} / ${existing.name}` };
      const p = repo.createProject(db, { groupId: group.id, name: a.name, description: a.description ?? "" });
      data = repo.getAppData(db);
      return { created: true, id: p.id, project: projectPathLabel(projectIndex(data).get(p.id)) };
    },
  }),

  tool({
    name: "list_reminders",
    title: "列出提醒事项",
    description:
      "列出提醒事项（账号、域名、会员等的到期时间），按到期日排序。status：due 只看需要处理的（已过期或进入提前提醒期），" +
      "active 看所有未完成的（默认），all 包括已完成的。",
    input: z.object({ status: z.enum(["due", "active", "all"]).default("active") }),
    annotations: { readOnlyHint: true },
    run: ({ db }, a) => {
      let list = sortReminders(rr.listReminders(db));
      if (a.status === "due") list = list.filter((r) => isReminderDue(r));
      else if (a.status === "active") list = list.filter((r) => !r.doneAt);
      return { total: list.length, reminders: list.map(reminderOut) };
    },
  }),

  tool({
    name: "add_reminder",
    title: "添加提醒",
    description:
      "记录一个到期时间，例如服务器、域名、会员、证书。repeat 为 monthly / yearly 时，处理完会顺延到下一个周期。",
    input: z.object({
      title: z.string().trim().min(1).max(100),
      due_date: date.describe("到期日期 YYYY-MM-DD"),
      repeat: z.enum(["none", "monthly", "yearly"]).default("none"),
      remind_days: z.number().int().min(0).max(365).default(7).describe("提前几天提醒，0 表示当天"),
      url: z.string().max(4096).optional().describe("续费或管理地址"),
      note: z.string().max(2000).optional(),
    }),
    run: ({ db }, a) => {
      const url = a.url ? toHttpUrl(a.url) : "";
      if (url === null) throw new ToolError("续费地址格式不正确（只支持 http / https 链接）");
      const r = rr.createReminder(db, {
        title: a.title,
        dueDate: a.due_date,
        repeat: a.repeat,
        remindDays: a.remind_days,
        url,
        note: a.note ?? "",
      });
      return reminderOut(r);
    },
  }),

  tool({
    name: "update_reminder",
    title: "修改提醒",
    description: "修改提醒：只改传入的字段。done 为 true 标记完成，false 重新打开。",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(100).optional(),
      due_date: date.optional(),
      repeat: z.enum(["none", "monthly", "yearly"]).optional(),
      remind_days: z.number().int().min(0).max(365).optional(),
      url: z.string().max(4096).optional().describe("传空字符串清除"),
      note: z.string().max(2000).optional(),
      done: z.boolean().optional(),
    }),
    annotations: { idempotentHint: true },
    run: ({ db }, a) => {
      getReminder(db, a.id);
      let url: string | undefined;
      if (a.url !== undefined) {
        const u = a.url.trim() ? toHttpUrl(a.url) : "";
        if (u === null) throw new ToolError("续费地址格式不正确（只支持 http / https 链接）");
        url = u;
      }
      return reminderOut(
        rr.updateReminder(db, a.id, {
          title: a.title,
          dueDate: a.due_date,
          repeat: a.repeat,
          remindDays: a.remind_days,
          url,
          note: a.note,
          done: a.done,
        }),
      );
    },
  }),

  tool({
    name: "complete_reminder",
    title: "完成提醒",
    description: "续费或处理完一个提醒：重复的顺延到下一个周期，不重复的标记为已完成。",
    input: z.object({ id }),
    run: ({ db }, a) => {
      getReminder(db, a.id);
      return reminderOut(rr.completeReminder(db, a.id));
    },
  }),

  tool({
    name: "delete_reminder",
    title: "删除提醒",
    description: "彻底删除一个提醒（无法恢复）。",
    input: z.object({ id }),
    annotations: { destructiveHint: true, idempotentHint: true },
    run: ({ db }, a) => {
      const r = getReminder(db, a.id);
      rr.deleteReminder(db, a.id);
      return { deleted: true, title: r.title };
    },
  }),

  tool({
    name: "search_snippets",
    title: "搜索摘录",
    description:
      "在摘录（用户收集的文字片段，例如会议结论、账号说明、文章段落）里搜索，内容、来源、标签、项目名都会匹配，支持拼音。" +
      "不填 query 时按最新列出。",
    input: z.object({
      query: z.string().optional(),
      project: projectRef.optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    annotations: { readOnlyHint: true },
    run: ({ db }, a) => {
      const data = repo.getAppData(db);
      let list = data.snippets.filter((x) => snippetMatches(x, data, a.query ?? ""));
      if (a.project !== undefined) {
        const pid = resolveProject(data, a.project);
        list = list.filter((x) => x.projectId === pid);
      }
      return { total: list.length, snippets: list.slice(0, a.limit).map((x) => snippetOut(x, data)) };
    },
  }),

  tool({
    name: "add_snippet",
    title: "添加摘录",
    description: "把一段文字存成摘录，可以放进项目、加标签、记下来源网页。适合保存不是链接的内容。",
    input: z.object({
      content: z.string().trim().min(1).max(20000),
      project: projectRef.optional().describe("放进哪个项目，不填就不放进项目"),
      tags: tags.optional(),
      source_url: z.string().max(4096).optional().describe("来源网页"),
      source_title: z.string().trim().max(200).optional(),
    }),
    run: ({ db }, a) => {
      const data = repo.getAppData(db);
      let sourceUrl = "";
      if (a.source_url) {
        sourceUrl = toHttpUrl(a.source_url) ?? "";
        if (!sourceUrl) throw new ToolError("来源链接格式不正确（只支持 http / https 链接）");
      }
      const s = sr.createSnippet(db, {
        content: a.content,
        projectId: a.project === undefined ? null : resolveProject(data, a.project),
        tags: a.tags ?? [],
        sourceUrl,
        sourceTitle: a.source_title ?? "",
        pinned: false,
      });
      return snippetOut(s, repo.getAppData(db));
    },
  }),

  tool({
    name: "delete_snippet",
    title: "删除摘录",
    description: "彻底删除一条摘录（无法恢复）。",
    input: z.object({ id }),
    annotations: { destructiveHint: true, idempotentHint: true },
    run: ({ db }, a) => {
      try {
        sr.deleteSnippet(db, a.id);
      } catch (e) {
        if (e instanceof HttpError) throw new ToolError(`摘录 ${a.id} 不存在`);
        throw e;
      }
      return { deleted: true };
    },
  }),
];
