import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachmentsDir, getAttachment, saveAttachment } from "./attachment-repo";
import { createBackup, listBackups, mirrorAttachments, mirrorDir } from "./backup";
import {
  DEFAULT_SYNC,
  s3Endpoint,
  s3Remote,
  signS3,
  uploadAttachments,
  uploadBackup,
  type Remote,
} from "./backup-sync";
import { openDb } from "./db";

describe("S3 签名", () => {
  it("和 AWS 文档的示例一致（GET Bucket）", () => {
    const r = signS3(
      {
        s3Provider: "other",
        s3Endpoint: "https://s3.amazonaws.com",
        s3Region: "us-east-1",
        s3Bucket: "examplebucket",
        s3AccessKey: "AKIAIOSFODNN7EXAMPLE",
        s3SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        s3PathStyle: false,
        r2AccountId: "",
      },
      "GET",
      "",
      { "max-keys": "2", prefix: "J" },
      "",
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(r.url).toBe("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J");
    expect(r.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, " +
        "Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    );
  });

  it("阿里云、腾讯云按地域生成地址", () => {
    expect(s3Endpoint({ ...DEFAULT_SYNC, s3Provider: "oss", s3Region: "cn-hangzhou" })).toBe(
      "https://s3.oss-cn-hangzhou.aliyuncs.com",
    );
    expect(s3Endpoint({ ...DEFAULT_SYNC, s3Provider: "oss", s3Region: "oss-cn-beijing" })).toBe(
      "https://s3.oss-cn-beijing.aliyuncs.com",
    );
    expect(s3Endpoint({ ...DEFAULT_SYNC, s3Provider: "cos", s3Region: "ap-guangzhou" })).toBe(
      "https://cos.ap-guangzhou.myqcloud.com",
    );
  });

  it("路径风格把存储桶放在路径里", () => {
    const r = signS3(
      {
        ...DEFAULT_SYNC,
        s3Provider: "other",
        s3Endpoint: "http://127.0.0.1:9000",
        s3Bucket: "b",
        s3AccessKey: "k",
        s3SecretKey: "s",
        s3PathStyle: true,
      },
      "PUT",
      "mydoc/a b.db",
      {},
      Buffer.from("x"),
    );
    expect(r.url).toBe("http://127.0.0.1:9000/b/mydoc/a%20b.db");
  });
});

describe("上传并清理远端旧备份", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mydoc-sync-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("只保留最近的几份", async () => {
    const files = new Map<string, Buffer>();
    for (const d of ["01", "02", "03"]) files.set(`mydoc-2026-10-${d}-030000.db`, Buffer.from(d));
    files.set("其他文件.txt", Buffer.from(""));
    const remote: Remote = {
      put: async (n, data) => void files.set(n, data),
      putAttachment: async () => undefined,
      list: async () => [...files.keys()].filter((n) => n.startsWith("mydoc-")),
      remove: async (n) => void files.delete(n),
    };
    const file = path.join(dir, "mydoc-2026-10-04-030000.db");
    fs.writeFileSync(file, "new");
    await uploadBackup(remote, file, 2);
    expect([...files.keys()].sort()).toEqual([
      "mydoc-2026-10-03-030000.db",
      "mydoc-2026-10-04-030000.db",
      "其他文件.txt",
    ]);
    expect(files.get("mydoc-2026-10-04-030000.db")?.toString()).toBe("new");
  });
});

describe("附件的异地备份和 R2", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mydoc-sync-att-"));
    process.env.DATA_DIR = dir;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("R2 用账户 ID 生成地址，地域 auto，路径风格", () => {
    const c = {
      ...DEFAULT_SYNC,
      type: "s3" as const,
      s3Provider: "r2" as const,
      r2AccountId: "0123456789abcdef0123456789abcdef",
      s3Bucket: "mydoc",
      s3AccessKey: "k",
      s3SecretKey: "s",
    };
    expect(s3Endpoint(c)).toBe("https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
    const r = signS3(c, "PUT", "mydoc/a.db", {}, "x", new Date("2026-10-14T00:00:00Z"));
    expect(r.url).toBe("https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/mydoc/mydoc/a.db");
    expect(r.headers.authorization).toContain("/20261014/auto/s3/aws4_request");
    expect(() => s3Remote({ ...c, r2AccountId: "abc" })).toThrow("账户 ID");
  });

  it("只传新的附件；中途失败时记下已经传上去的，下次接着传；换了地方重新传", async () => {
    const db = openDb(":memory:");
    const a = saveAttachment(db, { name: "a.png", mime: "image/png", data: Buffer.from("aaaa") });
    saveAttachment(db, { name: "b.txt", mime: "text/plain", data: Buffer.from("bbbb") });
    const sent: string[] = [];
    let failOn = "";
    const remote: Remote = {
      put: async () => undefined,
      putAttachment: async (n) => {
        if (n === failOn) throw new Error("网络断了");
        sent.push(n);
      },
      list: async () => [],
      remove: async () => undefined,
    };
    failOn = path.basename(getAttachment(db, 2)!.file);
    const err = await uploadAttachments(db, remote, "t1", undefined).catch((e) => e);
    expect(err.message).toBe("网络断了");
    expect(err.files.names).toEqual([path.basename(a.file)]);
    failOn = "";
    const r = await uploadAttachments(db, remote, "t1", err.files);
    expect(r.count).toBe(1);
    expect(sent).toHaveLength(2);
    expect((await uploadAttachments(db, remote, "t1", r.files)).count).toBe(0);
    expect((await uploadAttachments(db, remote, "t2", r.files)).count).toBe(2);
  });

  it("本地自动备份带上附件：新的复制过去，保留的备份还在用的不删", async () => {
    const db = openDb(":memory:");
    const a = saveAttachment(db, { name: "a.png", mime: "image/png", data: Buffer.from("aaaa") });
    const backups = path.join(dir, "backups");
    await createBackup(db, backups, new Date(2026, 9, 13, 3, 0, 0));
    const mirrored = path.join(mirrorDir(backups), a.file);
    expect(fs.readFileSync(mirrored, "utf8")).toBe("aaaa");
    // 清理掉附件后，旧备份里还用着它，备份目录里的留着
    db.prepare("DELETE FROM attachments").run();
    fs.rmSync(path.join(attachmentsDir(), a.file));
    await createBackup(db, backups, new Date(2026, 9, 14, 3, 0, 0));
    expect(fs.existsSync(mirrored)).toBe(true);
    // 用到它的备份都过期删掉了，就不留了
    for (const b of listBackups(backups).slice(1)) fs.rmSync(path.join(backups, b.name));
    mirrorAttachments(db, backups);
    expect(fs.existsSync(mirrored)).toBe(false);
  });
});
