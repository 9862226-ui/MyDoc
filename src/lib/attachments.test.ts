import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  attachmentStats,
  cleanName,
  cleanupAttachments,
  getAttachment,
  readAttachmentFile,
  saveAttachment,
} from "./attachment-repo";
import { openDb } from "./db";
import { exportZip, importZip } from "./full-backup";
import { renderMarkdown } from "./markdown";
import { createSnippet } from "./snippet-repo";
import * as wr from "./worklog-repo";
import { crc32, createZip, readZip } from "./zip";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

beforeEach(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mydoc-att-"));
});

describe("ZIP", () => {
  it("写进去再读出来一样；文本压缩，图片直接存", () => {
    const text = Buffer.from("工作记录".repeat(200));
    const zip = createZip([
      { name: "a/备份.json", data: text },
      { name: "b.png", data: PNG },
    ]);
    expect(zip.length).toBeLessThan(text.length);
    const out = readZip(zip);
    expect(out.map((e) => e.name)).toEqual(["a/备份.json", "b.png"]);
    expect(out[0].data.equals(text)).toBe(true);
    expect(out[1].data.equals(PNG)).toBe(true);
  });

  it("CRC32 和标准值一致；坏文件报错", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(() => readZip(Buffer.from("not a zip at all, definitely not"))).toThrow("不是有效的 ZIP 文件");
    const zip = createZip([{ name: "x.txt", data: Buffer.from("hello hello hello hello hello hello hello hello") }]);
    zip[40] ^= 0xff;
    expect(() => readZip(zip)).toThrow();
  });
});

describe("附件", () => {
  it("同样内容只存一份；截图没有名字时起一个", () => {
    const db = openDb(":memory:");
    const a = saveAttachment(db, { name: "image.png", mime: "image/png", data: PNG });
    const b = saveAttachment(db, { name: "另一个.png", mime: "", data: PNG });
    expect(b.id).toBe(a.id);
    expect(a.name).toMatch(/^截图-\d{8}-\d{6}\.png$/);
    expect(readAttachmentFile(getAttachment(db, a.id)!)!.equals(PNG)).toBe(true);
    expect(cleanName("C:\\Users\\me\\报告.pdf", "application/pdf")).toBe("报告.pdf");
    expect(() => saveAttachment(db, { name: "x", mime: "", data: Buffer.alloc(0) })).toThrow("文件是空的");
  });

  it("清理没用到的：正文里用到的、一天内新传的留着", () => {
    const db = openDb(":memory:");
    const used = saveAttachment(db, { name: "a.png", mime: "image/png", data: PNG });
    const unused = saveAttachment(db, { name: "b.txt", mime: "text/plain", data: Buffer.from("x") });
    wr.createWorkLogs(db, [
      {
        date: "2026-10-14",
        period: "am",
        projectId: null,
        content: "截图",
        detail: `![a](/api/attachments/${used.id})`,
        hours: null,
        done: true,
      },
    ]);
    expect(attachmentStats(db)).toMatchObject({ count: 2, unused: 1 });
    expect(cleanupAttachments(db)).toEqual({ removed: 0, bytes: 0 });
    expect(cleanupAttachments(db, Date.now() + 2 * 86400_000)).toEqual({ removed: 1, bytes: 1 });
    expect(getAttachment(db, unused.id)).toBeNull();
    expect(getAttachment(db, used.id)).not.toBeNull();
  });

  it("图片显示出来，点开看原图", () => {
    expect(renderMarkdown("![截图](/api/attachments/3)")).toContain(
      '<a href="/api/attachments/3" target="_blank" rel="noopener noreferrer" class="md-image"><img src="/api/attachments/3" alt="截图" loading="lazy"></a>',
    );
    expect(renderMarkdown("![x](javascript:alert(1))")).not.toContain("<img");
  });
});

describe("完整备份（ZIP）", () => {
  it("导出后恢复到另一个库：附件换成新 id，正文里的地址跟着换", () => {
    const db = openDb(":memory:");
    saveAttachment(db, { name: "占位.txt", mime: "text/plain", data: Buffer.from("先占一个 id") });
    const img = saveAttachment(db, { name: "a.png", mime: "image/png", data: PNG });
    createSnippet(db, {
      content: `看图 ![a](/api/attachments/${img.id})`,
      projectId: null,
      tags: [],
      sourceUrl: "",
      sourceTitle: "",
      pinned: false,
    });
    const zip = exportZip(db);
    expect(readZip(zip).map((e) => e.name)).toEqual([
      "README.txt",
      "mydoc-backup.json",
      "attachments/1-占位.txt",
      `attachments/${img.id}-a.png`,
      "attachments.json",
    ]);

    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mydoc-att2-"));
    const db2 = openDb(":memory:");
    const r = importZip(db2, zip);
    expect(r.attachments).toBe(2);
    const content = (db2.prepare("SELECT content FROM snippets").get() as { content: string }).content;
    const id = Number(content.match(/attachments\/(\d+)/)![1]);
    expect(readAttachmentFile(getAttachment(db2, id)!)!.equals(PNG)).toBe(true);
  });

  it("不是 MyDoc 的压缩包会提示", () => {
    const db = openDb(":memory:");
    expect(() => importZip(db, createZip([{ name: "a.txt", data: Buffer.from("x") }]))).toThrow(
      "不是 MyDoc 的完整备份",
    );
  });
});
