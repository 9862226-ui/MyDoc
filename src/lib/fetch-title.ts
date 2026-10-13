import dns from "node:dns/promises";
import net from "node:net";
import { decodeEntities } from "./bookmarks";
import { cleanFetchedTitle } from "./platforms";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;

/** 内网、回环等地址不允许服务器去访问 */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new Error("blocked host");
}

async function readLimited(res: Response, maxBytes = MAX_BYTES): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const charset =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function extractTitleFromHtml(html: string): string {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = og?.trim() ? og : (title ?? "");
  return decodeEntities(raw).replace(/\s+/g, " ").trim();
}

export interface SafeFetchResult {
  /** 跟随跳转后的最终地址 */
  url: URL;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * 由服务器去访问外部网址：只允许 http/https，每次跳转都检查不是内网地址，限制大小和时间。
 * 失败（包括非 2xx、被拦截、超时）返回 null。
 */
export async function safeFetch(
  rawUrl: string,
  opts: { accept: string; timeoutMs?: number; maxBytes?: number },
): Promise<SafeFetchResult | null> {
  try {
    let url = new URL(rawUrl);
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 6000);
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      await assertPublicHost(url.hostname);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
          accept: opts.accept,
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      const contentType = res.headers.get("content-type") ?? "";
      return { url, contentType, bytes: await readLimited(res, opts.maxBytes) };
    }
  } catch {
    // 网络错误、超时、被拦截的地址都当作失败
  }
  return null;
}

export function decodeHtmlBytes(bytes: Uint8Array, contentType: string): string {
  return decodeHtml(bytes, contentType);
}

/** 获取网页标题；需要登录的页面、内网地址、超时等情况返回空字符串 */
export async function fetchTitle(rawUrl: string, timeoutMs = 6000): Promise<string> {
  const r = await safeFetch(rawUrl, { accept: "text/html,application/xhtml+xml", timeoutMs });
  if (!r || !r.contentType.includes("html")) return "";
  return cleanFetchedTitle(extractTitleFromHtml(decodeHtml(r.bytes, r.contentType)), rawUrl);
}
