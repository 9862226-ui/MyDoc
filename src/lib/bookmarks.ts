export interface BookmarkItem {
  url: string;
  title: string;
  /** 所在的书签文件夹（最内层），没有则为空字符串 */
  folder: string;
}

const TOKEN_RE = /<h3[^>]*>([\s\S]*?)<\/h3>|<dl[^>]*>|<\/dl>|<a\s([^>]*)>([\s\S]*?)<\/a>/gi;

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** 解析浏览器导出的书签 HTML（Netscape Bookmark 格式），只保留 http/https 链接 */
export function parseBookmarksHtml(html: string): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  const stack: string[] = [];
  let pendingFolder: string | null = null;

  for (const m of html.matchAll(TOKEN_RE)) {
    const token = m[0].toLowerCase();
    if (token.startsWith("<h3")) {
      pendingFolder = stripTags(m[1]);
    } else if (token.startsWith("<dl")) {
      stack.push(pendingFolder ?? stack.at(-1) ?? "");
      pendingFolder = null;
    } else if (token.startsWith("</dl")) {
      stack.pop();
    } else {
      const href = m[2].match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? m[2].match(/href\s*=\s*'([^']*)'/i)?.[1];
      if (!href) continue;
      const url = decodeEntities(href).trim();
      if (!/^https?:\/\//i.test(url)) continue;
      items.push({ url, title: stripTags(m[3]), folder: stack.at(-1) ?? "" });
    }
  }
  return items;
}
