import fs from "node:fs";
import path from "node:path";
import { decodeEntities } from "./bookmarks";
import { dataDir } from "./db";
import { decodeHtmlBytes, safeFetch } from "./fetch-title";

/** 找到的图标缓存 30 天，没找到的 7 天后再试 */
const FOUND_TTL = 30 * 86400_000;
const MISSING_TTL = 7 * 86400_000;
const MAX_ICON_BYTES = 200 * 1024;

export interface Icon {
  bytes: Uint8Array;
  type: string;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/x-icon": "ico",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

/** 只接受普通域名，例如 example.com、sub.example.co.uk */
export function normalizeHost(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (host.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** 按文件头判断图片格式；不是图片（比如被跳转到登录页）返回 null */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) return "image/x-icon";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** 从网页里找图标地址，按优先级排序：标准图标（尺寸大的优先）、Apple 图标 */
export function extractIconHrefs(html: string): string[] {
  const found: { href: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1]?.toLowerCase() ?? "";
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? tag.match(/\bhref\s*=\s*([^\s>]+)/i)?.[1];
    if (!href || href.startsWith("data:")) continue;
    const rels = rel.split(/\s+/);
    let score: number;
    if (rels.includes("icon")) score = 100;
    else if (rels.includes("apple-touch-icon") || rels.includes("apple-touch-icon-precomposed")) score = 50;
    else continue;
    const size = Number(tag.match(/\bsizes\s*=\s*["']?(\d+)x\d+/i)?.[1] ?? 0);
    // 16~64 像素最合适；太大的图片也能用但排后面
    if (size >= 16 && size <= 64) score += size / 4;
    else if (size > 64) score += 5;
    if (/\.svg(\?|$)/i.test(href)) score += 8;
    found.push({ href: decodeEntities(href.trim()), score });
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.href);
}

async function downloadIcon(url: string): Promise<Icon | null> {
  const r = await safeFetch(url, { accept: "image/*,*/*;q=0.5", timeoutMs: 5000, maxBytes: MAX_ICON_BYTES + 1 });
  if (!r || r.bytes.length === 0 || r.bytes.length > MAX_ICON_BYTES) return null;
  const type = sniffImageType(r.bytes);
  return type ? { bytes: r.bytes, type } : null;
}

/** 从网站首页找图标，找不到再试 /favicon.ico */
export async function fetchFavicon(host: string): Promise<Icon | null> {
  const page = await safeFetch(`https://${host}/`, { accept: "text/html", timeoutMs: 6000, maxBytes: 256 * 1024 });
  const base = page?.url ?? new URL(`https://${host}/`);
  const candidates: string[] = [];
  if (page && page.contentType.includes("html")) {
    for (const href of extractIconHrefs(decodeHtmlBytes(page.bytes, page.contentType)).slice(0, 3)) {
      try {
        candidates.push(new URL(href, base).toString());
      } catch {
        // 地址写错了就跳过
      }
    }
  }
  candidates.push(new URL("/favicon.ico", base).toString());
  if (base.host !== host) candidates.push(`https://${host}/favicon.ico`);
  for (const url of [...new Set(candidates)]) {
    const icon = await downloadIcon(url);
    if (icon) return icon;
  }
  return null;
}

function cacheDir(): string {
  return path.join(dataDir(), "favicons");
}

const CACHE_EXTS = [...Object.values(EXT), "none"];

function readCache(host: string): Icon | null | undefined {
  for (const ext of CACHE_EXTS) {
    const file = path.join(cacheDir(), `${host}.${ext}`);
    let age: number;
    try {
      age = Date.now() - fs.statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (ext === "none") return age < MISSING_TTL ? null : undefined;
    return age < FOUND_TTL ? { bytes: fs.readFileSync(file), type: TYPE_BY_EXT[ext] } : undefined;
  }
  return undefined;
}

function writeCache(host: string, icon: Icon | null): void {
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const ext of CACHE_EXTS) fs.rmSync(path.join(dir, `${host}.${ext}`), { force: true });
  fs.writeFileSync(path.join(dir, `${host}.${icon ? EXT[icon.type] : "none"}`), icon ? icon.bytes : "");
}

const inflight = new Map<string, Promise<Icon | null>>();

/** 取网站图标（先查缓存）；同一个网站同时只下载一次 */
export async function getFavicon(host: string): Promise<Icon | null> {
  const cached = readCache(host);
  if (cached !== undefined) return cached;
  let p = inflight.get(host);
  if (!p) {
    p = fetchFavicon(host)
      .then((icon) => {
        try {
          writeCache(host, icon);
        } catch (e) {
          console.error("保存网站图标失败", e);
        }
        return icon;
      })
      .finally(() => inflight.delete(host));
    inflight.set(host, p);
  }
  return p;
}
