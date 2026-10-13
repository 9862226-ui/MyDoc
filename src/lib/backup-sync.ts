import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { backupDir, createBackup, isBackupName, listBackups } from "./backup";
import type { DB } from "./db";
import { networkErrorMessage } from "./net-error";
import { getSetting, setSetting } from "./settings";

/** 异地备份：把每天的自动备份再传一份到 WebDAV（坚果云等）或 S3 兼容的对象存储（阿里云 OSS、腾讯云 COS 等） */

export type SyncType = "webdav" | "s3";
export type S3Provider = "oss" | "cos" | "other";

export interface SyncConfig {
  enabled: boolean;
  type: SyncType;
  /** WebDAV 文件夹地址，例如 https://dav.jianguoyun.com/dav/MyDoc/ */
  webdavUrl: string;
  webdavUser: string;
  webdavPassword: string;
  s3Provider: S3Provider;
  /** 其他 S3 服务的地址；阿里云、腾讯云按地域自动生成 */
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  /** 存放的目录，例如 mydoc/ */
  s3Prefix: string;
  /** MinIO 等自建服务需要用路径风格 */
  s3PathStyle: boolean;
  /** 远端保留多少份 */
  keep: number;
}

export const DEFAULT_SYNC: SyncConfig = {
  enabled: false,
  type: "webdav",
  webdavUrl: "https://dav.jianguoyun.com/dav/MyDoc/",
  webdavUser: "",
  webdavPassword: "",
  s3Provider: "oss",
  s3Endpoint: "",
  s3Region: "",
  s3Bucket: "",
  s3AccessKey: "",
  s3SecretKey: "",
  s3Prefix: "mydoc/",
  s3PathStyle: false,
  keep: 30,
};

export const SYNC_SECRETS: (keyof SyncConfig)[] = ["webdavPassword", "s3SecretKey"];

export interface SyncResult {
  at: string;
  ok: boolean;
  message: string;
}

export interface SyncState {
  /** 最近一次成功上传的备份文件名 */
  uploaded?: string;
  /** 失败的日期和次数：同一天最多自动重试 3 次 */
  failDate?: string;
  attempts: number;
  last?: SyncResult;
}

const CONFIG_KEY = "backupSync";
const STATE_KEY = "backupSync.state";
const MAX_ATTEMPTS = 3;
const TIMEOUT = 120_000;

export const getSyncConfig = (db: DB) => getSetting(db, CONFIG_KEY, DEFAULT_SYNC);
export const setSyncConfig = (db: DB, c: SyncConfig) => setSetting(db, CONFIG_KEY, c);
export const getSyncState = (db: DB) => getSetting<SyncState>(db, STATE_KEY, { attempts: 0 });
const setSyncState = (db: DB, s: SyncState) => setSetting(db, STATE_KEY, s);

/** 远端存储：上传、列出备份文件名、删除 */
export interface Remote {
  put(name: string, data: Buffer): Promise<void>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

async function request(url: string, init: RequestInit & { timeout?: number }): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout ?? TIMEOUT) });
  } catch (e) {
    throw new Error(networkErrorMessage(e));
  }
}

function httpError(service: string, res: Response, body = ""): Error {
  if (res.status === 401 || res.status === 403) {
    const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
    return new Error(`${service}拒绝访问（${res.status}${code ? ` ${code}` : ""}），请检查账号、密码或密钥`);
  }
  if (res.status === 404) return new Error(`${service}返回 404，请检查地址或存储桶名称`);
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
  return new Error(`${service}返回 ${res.status}${code ? ` ${code}` : ""}`);
}

/* ---------- WebDAV ---------- */

export function webdavRemote(c: Pick<SyncConfig, "webdavUrl" | "webdavUser" | "webdavPassword">): Remote {
  if (!/^https?:\/\/\S+$/i.test(c.webdavUrl.trim())) throw new Error("请填写正确的 WebDAV 地址");
  const base = c.webdavUrl.trim().replace(/\/*$/, "/");
  const auth = `Basic ${Buffer.from(`${c.webdavUser}:${c.webdavPassword}`).toString("base64")}`;
  let folderReady = false;

  const ensureFolder = async () => {
    if (folderReady) return;
    const res = await request(base, { method: "MKCOL", headers: { authorization: auth }, timeout: 20_000 });
    // 201 新建成功；405 / 301 表示已经存在
    if (!res.ok && res.status !== 405 && res.status !== 301) throw httpError("WebDAV ", res, await res.text());
    folderReady = true;
  };

  return {
    async put(name, data) {
      await ensureFolder();
      const res = await request(base + encodeURIComponent(name), {
        method: "PUT",
        headers: { authorization: auth, "content-type": "application/octet-stream" },
        body: new Uint8Array(data),
      });
      if (!res.ok) throw httpError("WebDAV ", res, await res.text());
    },
    async list() {
      const res = await request(base, {
        method: "PROPFIND",
        headers: { authorization: auth, depth: "1", "content-type": "application/xml" },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
        timeout: 30_000,
      });
      if (!res.ok) throw httpError("WebDAV ", res, await res.text());
      const xml = await res.text();
      const names = [...xml.matchAll(/<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/gi)].map((m) => {
        const href = m[1].trim().replace(/\/+$/, "");
        return decodeURIComponent(href.slice(href.lastIndexOf("/") + 1));
      });
      return names.filter(isBackupName);
    },
    async remove(name) {
      const res = await request(base + encodeURIComponent(name), {
        method: "DELETE",
        headers: { authorization: auth },
        timeout: 20_000,
      });
      if (!res.ok && res.status !== 404) throw httpError("WebDAV ", res, await res.text());
    },
  };
}

/* ---------- S3 兼容（AWS Signature V4） ---------- */

/** 阿里云、腾讯云按地域生成地址 */
export function s3Endpoint(c: Pick<SyncConfig, "s3Provider" | "s3Endpoint" | "s3Region">): string {
  const region = c.s3Region.trim();
  if (c.s3Provider === "oss") return `https://s3.oss-${region.replace(/^oss-/, "")}.aliyuncs.com`;
  if (c.s3Provider === "cos") return `https://cos.${region}.myqcloud.com`;
  return c.s3Endpoint.trim().replace(/\/+$/, "");
}

const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data).digest();
/** RFC 3986 编码（S3 签名要求） */
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

export interface S3Request {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/** 生成带签名的请求（不分块上传，阿里云 OSS 只支持这种） */
export function signS3(
  c: Pick<
    SyncConfig,
    "s3Provider" | "s3Endpoint" | "s3Region" | "s3Bucket" | "s3AccessKey" | "s3SecretKey" | "s3PathStyle"
  >,
  method: string,
  key: string,
  query: Record<string, string>,
  body: Buffer | string,
  now = new Date(),
): S3Request {
  const endpoint = new URL(s3Endpoint(c));
  const bucket = c.s3Bucket.trim();
  const region = (c.s3Provider === "oss" ? c.s3Region.trim().replace(/^oss-/, "") : c.s3Region.trim()) || "us-east-1";
  const keyPath = key.split("/").map(enc).join("/");
  const host = c.s3PathStyle ? endpoint.host : `${bucket}.${endpoint.host}`;
  const uri = c.s3PathStyle ? `/${enc(bucket)}/${keyPath}` : `/${keyPath}`;
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k])}`)
    .join("&");
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = [
    method,
    uri,
    qs,
    signed.map((h) => `${h}:${headers[h]}\n`).join(""),
    signed.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.s3SecretKey}`, day), region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(toSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.s3AccessKey}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`;
  delete headers.host;
  return { method, url: `${endpoint.protocol}//${host}${uri}${qs ? `?${qs}` : ""}`, headers };
}

export function s3Remote(c: SyncConfig): Remote {
  if (!c.s3Bucket.trim() || !c.s3AccessKey.trim() || !c.s3SecretKey) throw new Error("请填写存储桶和访问密钥");
  if (c.s3Provider !== "other" && !c.s3Region.trim()) throw new Error("请填写地域，例如 cn-hangzhou");
  if (!/^https?:\/\/\S+$/i.test(s3Endpoint(c))) throw new Error("请填写正确的服务地址");
  const prefix = c.s3Prefix.trim().replace(/^\/+/, "").replace(/\/*$/, "/").replace(/^\/$/, "");
  const send = async (method: string, key: string, query: Record<string, string> = {}, body: Buffer | string = "") => {
    const r = signS3(c, method, key, query, body);
    const res = await request(r.url, {
      method,
      headers: r.headers,
      body: method === "PUT" ? new Uint8Array(body as Buffer) : undefined,
    });
    if (!res.ok && !(method === "DELETE" && res.status === 404)) throw httpError("对象存储", res, await res.text());
    return res;
  };
  return {
    async put(name, data) {
      await send("PUT", prefix + name, {}, data);
    },
    async list() {
      const names: string[] = [];
      let token = "";
      for (let page = 0; page < 20; page++) {
        const query: Record<string, string> = { "list-type": "2", prefix };
        if (token) query["continuation-token"] = token;
        const xml = await (await send("GET", "", query)).text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
          const name = m[1].slice(prefix.length);
          if (isBackupName(name)) names.push(name);
        }
        token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "";
        if (!token) break;
      }
      return names;
    },
    async remove(name) {
      await send("DELETE", prefix + name);
    },
  };
}

export function makeRemote(c: SyncConfig): Remote {
  return c.type === "webdav" ? webdavRemote(c) : s3Remote(c);
}

/* ---------- 同步 ---------- */

/** 上传一个备份文件，然后删掉远端多余的旧备份 */
export async function uploadBackup(remote: Remote, file: string, keep: number): Promise<void> {
  const name = path.basename(file);
  await remote.put(name, fs.readFileSync(file));
  const all = (await remote.list()).sort().reverse();
  for (const old of all.slice(Math.max(1, keep))) {
    if (old !== name) await remote.remove(old);
  }
}

/** 定时任务调用：最新的本地备份还没上传过就上传（失败时当天最多重试 3 次） */
export async function syncLatestBackup(db: DB, now = new Date(), makeR = makeRemote): Promise<string> {
  const c = getSyncConfig(db);
  if (!c.enabled) return "off";
  const latest = listBackups()[0];
  const state = getSyncState(db);
  if (!latest || state.uploaded === latest.name) return "up-to-date";
  const today = now.toISOString().slice(0, 10);
  const attempts = state.failDate === today ? state.attempts : 0;
  if (attempts >= MAX_ATTEMPTS) return "gave-up";
  try {
    await uploadBackup(makeR(c), path.join(backupDir(), latest.name), c.keep);
    setSyncState(db, {
      uploaded: latest.name,
      attempts: 0,
      last: { at: now.toISOString(), ok: true, message: `已上传 ${latest.name}` },
    });
    return "uploaded";
  } catch (e) {
    setSyncState(db, {
      ...state,
      failDate: today,
      attempts: attempts + 1,
      last: { at: now.toISOString(), ok: false, message: (e as Error).message },
    });
    return "failed";
  }
}

/** 「立即同步」：现在备份一次并上传，结果直接返回给页面 */
export async function syncNow(db: DB, c: SyncConfig, makeR = makeRemote): Promise<SyncResult> {
  const remote = makeR(c);
  const backup = await createBackup(db);
  const at = new Date().toISOString();
  try {
    await uploadBackup(remote, path.join(backupDir(), backup.name), c.keep);
    const result = { at, ok: true, message: `已上传 ${backup.name}` };
    setSyncState(db, { uploaded: backup.name, attempts: 0, last: result });
    return result;
  } catch (e) {
    const result = { at, ok: false, message: (e as Error).message };
    setSyncState(db, { ...getSyncState(db), last: result });
    return result;
  }
}
