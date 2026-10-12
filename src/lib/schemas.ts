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
});
