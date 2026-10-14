import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listAttachments, readAttachmentFile } from "./attachment-repo";
import { backupDir, createBackup, isBackupName, listBackups } from "./backup";
import type { DB } from "./db";
import { networkErrorMessage } from "./net-error";
import { getSetting, setSetting } from "./settings";

/**
 * 异地备份：把每天的自动备份再传一份到 WebDAV（坚果云等）或 S3 兼容的对象存储（阿里云 OSS、腾讯云 COS、Cloudflare R2 等）。
 * 图片和附件放在远端的 attachments/ 文件夹，只传新增的（按内容命名，传过的不会再传）
 */

export type SyncType = "webdav" | "s3";
export type S3Provider = "oss" | "cos" | "r2" | "other";

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
  /** Cloudflare R2 的账户 ID（地址按它生成） */
  r2AccountId: string;
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
  r2AccountId: "",
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
  /** 已经传到远端的附件文件名，target 是传到哪里（换了地方要重新传） */
  files?: { target: string; names: string[] };
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
  /** 传一个附件到 attachments/ 文件夹 */
  putAttachment(name: string, data: Buffer): Promise<void>;
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
  const ready = new Set<string>();

  const ensureFolder = async (url: string) => {
    if (ready.has(url)) return;
    const res = await request(url, { method: "MKCOL", headers: { authorization: auth }, timeout: 20_000 });
    // 201 新建成功；405 / 301 表示已经存在
    if (!res.ok && res.status !== 405 && res.status !== 301) throw httpError("WebDAV ", res, await res.text());
    ready.add(url);
  };
  const putTo = async (url: string, data: Buffer) => {
    const res = await request(url, {
      method: "PUT",
      headers: { authorization: auth, "content-type": "application/octet-stream" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw httpError("WebDAV ", res, await res.text());
  };

  return {
    async put(name, data) {
      await ensureFolder(base);
      await putTo(base + encodeURIComponent(name), data);
    },
    async putAttachment(name, data) {
      await ensureFolder(base);
      await ensureFolder(`${base}attachments/`);
      await putTo(`${base}attachments/${encodeURIComponent(name)}`, data);
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
export function s3Endpoint(c: Pick<SyncConfig, "s3Provider" | "s3Endpoint" | "s3Region" | "r2AccountId">): string {
  const region = c.s3Region.trim();
  if (c.s3Provider === "oss") return `https://s3.oss-${region.replace(/^oss-/, "")}.aliyuncs.com`;
  if (c.s3Provider === "cos") return `https://cos.${region}.myqcloud.com`;
  if (c.s3Provider === "r2") return `https://${c.r2AccountId.trim()}.r2.cloudflarestorage.com`;
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
    | "s3Provider"
    | "s3Endpoint"
    | "s3Region"
    | "s3Bucket"
    | "s3AccessKey"
    | "s3SecretKey"
    | "s3PathStyle"
    | "r2AccountId"
  >,
  method: string,
  key: string,
  query: Record<string, string>,
  body: Buffer | string,
  now = new Date(),
): S3Request {
  const endpoint = new URL(s3Endpoint(c));
  const bucket = c.s3Bucket.trim();
  // R2 的地域固定是 auto，用路径风格
  const r2 = c.s3Provider === "r2";
  const region =
    (r2 ? "auto" : c.s3Provider === "oss" ? c.s3Region.trim().replace(/^oss-/, "") : c.s3Region.trim()) || "us-east-1";
  const pathStyle = r2 || c.s3PathStyle;
  const keyPath = key.split("/").map(enc).join("/");
  const host = pathStyle ? endpoint.host : `${bucket}.${endpoint.host}`;
  const uri = pathStyle ? `/${enc(bucket)}/${keyPath}` : `/${keyPath}`;
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
  if (c.s3Provider === "r2" && !/^[0-9a-f]{32}$/i.test(c.r2AccountId.trim())) {
    throw new Error("请填写 Cloudflare 账户 ID（32 位，在 R2 概览页右侧）");
  }
  if ((c.s3Provider === "oss" || c.s3Provider === "cos") && !c.s3Region.trim()) {
    throw new Error("请填写地域，例如 cn-hangzhou");
  }
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
    async putAttachment(name, data) {
      await send("PUT", `${prefix}attachments/${name}`, {}, data);
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

/** 远端的标识：换了服务、地址、存储桶或目录，附件要重新传 */
export function syncTarget(c: SyncConfig): string {
  return c.type === "webdav"
    ? `webdav:${c.webdavUrl.trim()}`
    : `s3:${s3Endpoint(c)}/${c.s3Bucket.trim()}/${c.s3Prefix.trim()}`;
}

/** 把还没传过的附件传上去；返回新的「已传」清单和这次传了几个 */
export async function uploadAttachments(
  db: DB,
  remote: Remote,
  target: string,
  done: SyncState["files"],
): Promise<{ files: NonNullable<SyncState["files"]>; count: number }> {
  const names = new Set(done?.target === target ? done.names : []);
  let count = 0;
  try {
    for (const a of listAttachments(db)) {
      const name = path.basename(a.file);
      if (names.has(name)) continue;
      const data = readAttachmentFile(a);
      if (!data) continue;
      await remote.putAttachment(name, data);
      names.add(name);
      count++;
    }
  } catch (e) {
    // 传了一半失败：已经传上去的记下来，下次接着传
    const err = e as Error & { files?: unknown };
    err.files = { target, names: [...names] };
    throw err;
  }
  return { files: { target, names: [...names] }, count };
}

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
    const remote = makeR(c);
    await uploadBackup(remote, path.join(backupDir(), latest.name), c.keep);
    const { files, count } = await uploadAttachments(db, remote, syncTarget(c), state.files);
    setSyncState(db, {
      uploaded: latest.name,
      files,
      attempts: 0,
      last: { at: now.toISOString(), ok: true, message: uploadedMessage(latest.name, count) },
    });
    return "uploaded";
  } catch (e) {
    const err = e as Error & { files?: SyncState["files"] };
    setSyncState(db, {
      ...state,
      files: err.files ?? state.files,
      failDate: today,
      attempts: attempts + 1,
      last: { at: now.toISOString(), ok: false, message: err.message },
    });
    return "failed";
  }
}

/** 「立即同步」：现在备份一次并上传，结果直接返回给页面 */
export async function syncNow(db: DB, c: SyncConfig, makeR = makeRemote): Promise<SyncResult> {
  const remote = makeR(c);
  const backup = await createBackup(db);
  const at = new Date().toISOString();
  const state = getSyncState(db);
  try {
    await uploadBackup(remote, path.join(backupDir(), backup.name), c.keep);
    const { files, count } = await uploadAttachments(db, remote, syncTarget(c), state.files);
    const result = { at, ok: true, message: uploadedMessage(backup.name, count) };
    setSyncState(db, { uploaded: backup.name, files, attempts: 0, last: result });
    return result;
  } catch (e) {
    const err = e as Error & { files?: SyncState["files"] };
    const result = { at, ok: false, message: err.message };
    setSyncState(db, { ...state, files: err.files ?? state.files, last: result });
    return result;
  }
}

const uploadedMessage = (name: string, files: number) => `已上传 ${name}${files ? `，新增附件 ${files} 个` : ""}`;
