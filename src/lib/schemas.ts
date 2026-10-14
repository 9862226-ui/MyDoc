import { z } from "zod";
import { toHttpUrl } from "./url";

const name = (label: string, max = 60) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 个字`);

export const urlSchema = z
  .string()
  .max(4096, "链接太长了")
  .transform((s, ctx) => {
    const url = toHttpUrl(s);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "链接格式不正确（只支持 http / https 链接）" });
      return z.NEVER;
    }
    return url;
  });

const id = z.number().int().positive();
const tags = z.array(z.string().max(30, "标签不能超过 30 个字")).max(30, "标签太多了");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确")
  .nullable();

export const groupSchema = z.object({ name: name("分组名") });

export const projectCreateSchema = z.object({
  groupId: id,
  name: name("项目名"),
  description: z.string().trim().max(500, "简介不能超过 500 个字").default(""),
});

export const projectPatchSchema = z
  .object({
    groupId: id,
    name: name("项目名"),
    description: z.string().trim().max(500, "简介不能超过 500 个字"),
    archived: z.boolean(),
  })
  .partial();

const linkFields = {
  url: urlSchema,
  title: z.string().trim().max(200, "标题不能超过 200 个字"),
  projectId: id.nullable(),
  note: z.string().max(5000, "备注太长了"),
  accessCode: z.string().trim().max(64, "提取码太长了"),
  expiresAt: date,
  pinned: z.boolean(),
  favorite: z.boolean(),
  tags,
};

/** 修改链接：只更新传入的字段 */
export const linkPatchSchema = z.object(linkFields).partial();

export const linkCreateSchema = z.object({
  url: linkFields.url,
  title: linkFields.title.default(""),
  projectId: linkFields.projectId.default(null),
  note: linkFields.note.default(""),
  accessCode: linkFields.accessCode.default(""),
  expiresAt: linkFields.expiresAt.default(null),
  pinned: linkFields.pinned.default(false),
  favorite: linkFields.favorite.default(false),
  tags: linkFields.tags.default([]),
});

export const batchSchema = z.object({
  ids: z.array(id).min(1).max(5000),
  op: z.discriminatedUnion("action", [
    z.object({ action: z.literal("move"), projectId: id.nullable() }),
    z.object({ action: z.literal("addTags"), tags }),
    z.object({ action: z.literal("removeTag"), tag: z.string() }),
    z.object({ action: z.literal("favorite"), value: z.boolean() }),
    z.object({ action: z.literal("pin"), value: z.boolean() }),
    z.object({ action: z.literal("delete") }),
    z.object({ action: z.literal("restore") }),
    z.object({ action: z.literal("purge") }),
  ]),
});

export const reorderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("groups"), ids: z.array(id) }),
  z.object({ kind: z.literal("projects"), groupId: id, ids: z.array(id) }),
]);

export const tagRenameSchema = z.object({ name: name("标签名", 30) });

export const importSchema = z.object({
  items: z
    .array(
      z.object({
        url: urlSchema,
        title: z.string().trim().max(200).default(""),
        accessCode: z.string().trim().max(64).default(""),
        tags: tags.default([]),
      }),
    )
    .min(1, "没有可导入的链接")
    .max(5000, "一次最多导入 5000 条"),
  projectId: id.nullable(),
  tags: tags.default([]),
  fetchTitles: z.boolean().default(false),
});

/** 可以为空的链接 */
const optionalUrl = z
  .string()
  .trim()
  .max(4096, "链接太长了")
  .transform((s, ctx) => {
    if (!s) return "";
    const url = toHttpUrl(s);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "链接格式不正确（只支持 http / https 链接）" });
      return z.NEVER;
    }
    return url;
  });

const reminderFields = {
  title: name("名称", 100),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择到期日期"),
  repeat: z.enum(["none", "monthly", "yearly"]),
  remindDays: z.number().int().min(0, "提前天数不正确").max(365, "最多提前 365 天"),
  url: optionalUrl,
  note: z.string().max(2000, "备注太长了"),
};

export const reminderCreateSchema = z.object({
  title: reminderFields.title,
  dueDate: reminderFields.dueDate,
  repeat: reminderFields.repeat.default("none"),
  remindDays: reminderFields.remindDays.default(7),
  url: reminderFields.url.default(""),
  note: reminderFields.note.default(""),
});

/** 修改提醒：只更新传入的字段；done 标记为已完成或重新打开 */
export const reminderPatchSchema = z.object({ ...reminderFields, done: z.boolean() }).partial();

const backupReminder = z.object({
  title: z.string().max(100),
  dueDate: reminderFields.dueDate,
  repeat: reminderFields.repeat.default("none"),
  remindDays: z.number().int().min(0).max(365).default(7),
  url: optionalUrl.default(""),
  note: z.string().default(""),
  doneAt: z.string().nullable().default(null),
  createdAt: z.string().default(() => new Date().toISOString()),
});

const backupLink = z.object({
  title: z.string().max(200),
  url: urlSchema,
  note: z.string().default(""),
  accessCode: z.string().default(""),
  expiresAt: date.default(null),
  pinned: z.boolean().default(false),
  favorite: z.boolean().default(false),
  visitCount: z.number().int().min(0).default(0),
  lastVisitedAt: z.string().nullable().default(null),
  createdAt: z.string().default(() => new Date().toISOString()),
  tags: tags.default([]),
});

const backupSnippet = z.object({
  content: z.string().max(20000),
  group: z.string().nullable().default(null),
  project: z.string().nullable().default(null),
  tags: tags.default([]),
  sourceUrl: z.string().max(4096).default(""),
  sourceTitle: z.string().max(200).default(""),
  pinned: z.boolean().default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
});

const snippetFields = {
  content: z.string().trim().min(1, "内容不能为空").max(20000, "内容太长了（最多 2 万字）"),
  projectId: id.nullable(),
  tags,
  sourceUrl: z
    .string()
    .trim()
    .max(4096)
    .transform((s, ctx) => {
      if (!s) return "";
      const url = toHttpUrl(s);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "来源链接格式不正确" });
        return z.NEVER;
      }
      return url;
    }),
  sourceTitle: z.string().trim().max(200, "来源标题太长了"),
  pinned: z.boolean(),
};

export const snippetCreateSchema = z.object({
  content: snippetFields.content,
  projectId: snippetFields.projectId.default(null),
  tags: snippetFields.tags.default([]),
  sourceUrl: snippetFields.sourceUrl.default(""),
  sourceTitle: snippetFields.sourceTitle.default(""),
  pinned: snippetFields.pinned.default(false),
});

export const snippetPatchSchema = z.object(snippetFields).partial();

export const backupSchema = z.object({
  app: z.literal("mydoc", { message: "不是 MyDoc 的备份文件" }),
  version: z.literal(1),
  exportedAt: z.string(),
  groups: z.array(
    z.object({
      name: name("分组名"),
      projects: z.array(
        z.object({
          name: name("项目名"),
          description: z.string().default(""),
          archived: z.boolean().default(false),
          links: z.array(backupLink),
        }),
      ),
    }),
  ),
  inbox: z.array(backupLink).default([]),
  reminders: z.array(backupReminder).default([]),
  snippets: z.array(backupSnippet).default([]),
});

export const notifyConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(["wecom", "dingtalk", "feishu", "serverchan", "bark", "webhook"]),
  target: z.string().trim().max(2000, "地址太长了"),
  secret: z.string().trim().max(500),
  hour: z.number().int().min(0).max(23),
  timeZone: z.string().max(64),
  includeLinks: z.boolean(),
  siteUrl: z.string().max(500),
});

export const syncConfigSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["webdav", "s3"]),
  webdavUrl: z.string().trim().max(1000),
  webdavUser: z.string().trim().max(200),
  webdavPassword: z.string().max(500),
  s3Provider: z.enum(["oss", "cos", "other"]),
  s3Endpoint: z.string().trim().max(500),
  s3Region: z.string().trim().max(100),
  s3Bucket: z.string().trim().max(200),
  s3AccessKey: z.string().trim().max(200),
  s3SecretKey: z.string().max(500),
  s3Prefix: z.string().trim().max(200),
  s3PathStyle: z.boolean(),
  keep: z.number().int().min(1).max(365),
});

export const aiConfigSchema = z.object({
  provider: z.enum(["deepseek", "qwen", "zhipu", "kimi", "doubao", "siliconflow", "ollama", "custom"]),
  baseUrl: z.string().trim().max(500),
  apiKey: z.string().trim().max(500),
  model: z.string().trim().max(200),
  autoClassify: z.boolean(),
  allowNewTags: z.boolean(),
});

/* ---------- 工作记录 ---------- */

const workDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确");
const code = (label: string) => z.string().trim().max(60, `${label}不能超过 60 个字`);

const workProjectFields = {
  name: name("项目名称", 120),
  code: code("项目编号"),
  taskName: code("任务名称"),
  taskCode: code("任务编号"),
  archived: z.boolean(),
};

export const workProjectCreateSchema = z.object({
  name: workProjectFields.name,
  code: workProjectFields.code.default(""),
  taskName: workProjectFields.taskName.default(""),
  taskCode: workProjectFields.taskCode.default(""),
  archived: workProjectFields.archived.default(false),
});

export const workProjectPatchSchema = z.object(workProjectFields).partial();

const workLogFields = {
  date: workDate,
  period: z.enum(["am", "pm"]),
  projectId: id.nullable(),
  content: z.string().trim().min(1, "内容不能为空").max(2000, "内容太长了（最多 2000 字）"),
  hours: z.number().min(0).max(24, "工时不能超过 24 小时").nullable(),
  done: z.boolean(),
};

/** 一次可以加多条（粘贴多行时每行一条） */
export const workLogCreateSchema = z.object({
  date: workLogFields.date,
  period: workLogFields.period,
  projectId: workLogFields.projectId.default(null),
  contents: z.array(workLogFields.content).min(1, "内容不能为空").max(50, "一次最多添加 50 条"),
  hours: workLogFields.hours.default(null),
  done: workLogFields.done.default(true),
});

export const workLogPatchSchema = z.object(workLogFields).partial();

const reportText = z.string().max(10000, "内容太长了").nullable().optional();

export const workReportSchema = z.object({
  kind: z.enum(["daily", "weekly"]),
  key: workDate,
  fields: z.object({ amSummary: reportText, pmSummary: reportText, summary: reportText, plan: reportText }),
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式不正确");
const weekday = z.number().int().min(0).max(6);

/** 只传要改的字段 */
export const workSettingsSchema = z
  .object({
    dailyHours: z.number().min(0.5).max(24),
    remindDaily: z.boolean(),
    remindTime: clock,
    remindDays: z.array(weekday).max(7),
    remindWeekly: z.boolean(),
    weeklyDay: weekday,
    weeklyTime: clock,
    remindWithReport: z.boolean(),
  })
  .partial();

export const workRemindTestSchema = z.object({ kind: z.enum(["daily", "weekly"]) });

export const workAiSchema = z.object({ kind: z.enum(["daily", "weekly"]), date: workDate });
