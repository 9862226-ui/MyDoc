import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SYNC, s3Endpoint, signS3, uploadBackup, type Remote } from "./backup-sync";

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
