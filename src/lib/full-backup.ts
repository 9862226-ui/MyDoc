/**
 * 完整备份（ZIP）：JSON 备份 + 所有图片和附件。换服务器搬家、长期存档时用。
 * 恢复时附件的 id 会变，正文里的 /api/attachments/旧id 会换成新的
 */
import { listAttachments, readAttachmentFile, saveAttachment } from "./attachment-repo";
import type { DB } from "./db";
import { ImportRefs } from "./ref-remap";
import { HttpError } from "./errors";
import { exportBackup, importBackup } from "./repo";
import { backupSchema } from "./schemas";
import { DEFAULT_WORK_SETTINGS } from "./worklog";
import { exportWork, importWork } from "./worklog-repo";
import { createZip, readZip, type ZipEntry } from "./zip";

const JSON_NAME = "mydoc-backup.json";
const MANIFEST_NAME = "attachments.json";

interface ManifestItem {
  id: number;
  name: string;
  mime: string;
  path: string;
}

const README = `MyDoc 完整备份

mydoc-backup.json  全部分组、项目、链接、标签、提醒、摘录、工作记录、会议纪要
attachments/       正文里用到的图片和附件
attachments.json   附件清单

在 MyDoc 的「设置 › 导入与导出 › 从备份恢复」里选择这个 ZIP 文件就能恢复（合并，不会删除现有数据）。
`;

/** 文件名里去掉不适合放进压缩包的字符 */
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100);

export function exportZip(db: DB, now = new Date()): Buffer {
  const json = JSON.stringify({ ...exportBackup(db), work: exportWork(db) }, null, 2);
  const entries: ZipEntry[] = [
    { name: "README.txt", data: Buffer.from(README) },
    { name: JSON_NAME, data: Buffer.from(json) },
  ];
  const manifest: ManifestItem[] = [];
  for (const a of listAttachments(db)) {
    const data = readAttachmentFile(a);
    if (!data) continue;
    const path = `attachments/${a.id}-${safeName(a.name)}`;
    manifest.push({ id: a.id, name: a.name, mime: a.mime, path });
    entries.push({ name: path, data });
  }
  entries.push({ name: MANIFEST_NAME, data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  return createZip(entries, now);
}

/** 从 JSON 备份恢复（合并） */
export function restoreJson(db: DB, raw: unknown) {
  const backup = backupSchema.parse(raw);
  // 记下编号的对应关系，最后把内容里的引用 [[log:12]] 换成这里的编号
  const refs = new ImportRefs();
  return db.transaction(() => {
    const result = importBackup(db, backup, refs);
    const work = backup.work
      ? importWork(db, { ...backup.work, settings: { ...DEFAULT_WORK_SETTINGS, ...backup.work.settings } }, refs)
      : 0;
    refs.apply(db);
    return { ...result, work };
  })();
}

/** 从完整备份恢复：先恢复附件，把正文里的附件地址换成新的 id，再恢复数据 */
export function importZip(db: DB, buf: Buffer) {
  let entries: ZipEntry[];
  try {
    entries = readZip(buf);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const file = (name: string) => entries.find((e) => e.name === name || e.name.endsWith(`/${name}`));
  const json = file(JSON_NAME);
  if (!json) throw new HttpError(400, "压缩包里没有 mydoc-backup.json，不是 MyDoc 的完整备份");
  let manifest: ManifestItem[] = [];
  const m = file(MANIFEST_NAME);
  if (m) {
    try {
      manifest = JSON.parse(m.data.toString("utf8")) as ManifestItem[];
    } catch {
      throw new HttpError(400, "附件清单已损坏");
    }
  }
  // 压缩包可能被解开后又打包过一次，外面多了一层文件夹
  const prefix = json.name.slice(0, json.name.length - JSON_NAME.length);
  const ids = new Map<number, number>();
  for (const item of manifest) {
    const entry = entries.find((e) => e.name === prefix + item.path);
    if (!entry) continue;
    ids.set(item.id, saveAttachment(db, { name: item.name, mime: item.mime, data: entry.data }).id);
  }
  const text = json.data
    .toString("utf8")
    .replace(/\/api\/attachments\/(\d+)/g, (s, id: string) =>
      ids.has(Number(id)) ? `/api/attachments/${ids.get(Number(id))}` : s,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "mydoc-backup.json 已损坏");
  }
  return { ...restoreJson(db, raw), attachments: ids.size };
}
