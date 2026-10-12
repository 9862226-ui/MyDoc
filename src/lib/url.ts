/** 补全协议并校验，只接受 http/https；不合法返回 null */
export function toHttpUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = /^(utm_\w+|from|spm|share_source|share_from|sharer|scene|ref)$/i;

/** 用于判断重复：忽略大小写的域名、末尾斜杠、常见的分享来源参数 */
export function urlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? "?" + new URLSearchParams(params).toString() : "";
    const path = u.pathname.replace(/\/+$/, "");
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const port = u.port ? ":" + u.port : "";
    return `${host}${port}${path}${query}${u.hash}`;
  } catch {
    return url.trim();
  }
}

/** decodeURIComponent，遇到不合法的编码时原样返回 */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
