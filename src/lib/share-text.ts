import type { LinkDraft } from "./types";

const URL_RE = /https?:\/\/[^\s<>"'`，。；、！？（）【】「」《》　]+/gi;
const CODE_RE = /(?:提取码|访问码|访问密码|密码|pwd|passcode)\s*[:：=]?\s*([A-Za-z0-9]{3,16})(?![A-Za-z0-9])/i;
const BARE_CODE_RE = /^[A-Za-z0-9]{4,8}$/;
const MD_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** 分享文案里的广告语、提示语，不作为标题 */
const NOISE_RE =
  /复制这段内容|复制此消息|点击链接|打开.{0,6}(app|APP|App)|手机\s*App|操作更方便|无需下载|来自.{0,20}分享|超级会员|在线播放|倍速|投屏|保存到|长按|扫码|^--+/;
const TITLE_PREFIX_RE =
  /^(?:通过网盘分享的文件|通过百度网盘分享的文件|分享的文件|分享文件|文件名称?|标题|名称)\s*[:：]\s*|^我用.{0,10}分享了\s*/;
const LABEL_RE = /(?:链接|地址|网址|分享链接|link|url)\s*[:：]\s*/gi;

function extractUrls(line: string): string[] {
  return (line.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ""));
}

function codeFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const pwd = u.searchParams.get("pwd") ?? u.searchParams.get("password");
    return pwd && BARE_CODE_RE.test(pwd) ? pwd : "";
  } catch {
    return "";
  }
}

function extractTitle(text: string): string {
  const quoted = text.match(/「([^」]{1,120})」/);
  if (quoted) return quoted[1].trim();
  const bracketed = text.match(/^【[^】]{1,20}】\s*(.+)$/);
  let t = (bracketed ? bracketed[1] : text)
    .replace(URL_RE, " ")
    .replace(new RegExp(CODE_RE.source, "gi"), " ")
    .replace(LABEL_RE, " ")
    .replace(TITLE_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,，;；:：|｜\-—–·•>*#]+|[\s,，;；:：|｜\-—–·•]+$/g, "")
    .trim();
  t = t.replace(TITLE_PREFIX_RE, "").trim();
  if (!t || NOISE_RE.test(t) || t.length > 120) return "";
  return t;
}

/** Excel 等表格复制出来的 Tab 分隔行：标题 / 链接 / 提取码 */
function parseTabbedLine(line: string): LinkDraft | null {
  const cols = line.split("\t").map((c) => c.trim());
  if (cols.length < 2) return null;
  const urlIndex = cols.findIndex((c) => extractUrls(c).length > 0);
  if (urlIndex < 0) return null;
  const url = extractUrls(cols[urlIndex])[0];
  let title = "";
  let accessCode = "";
  cols.forEach((c, i) => {
    if (i === urlIndex || !c) return;
    const labelled = c.match(CODE_RE);
    if (!accessCode && (labelled || BARE_CODE_RE.test(c))) accessCode = labelled ? labelled[1] : c;
    else if (!title) title = extractTitle(c);
  });
  return { url, title, accessCode: accessCode || codeFromUrl(url) };
}

/**
 * 解析粘贴的文本，支持：
 * - 一行一个链接，链接前后可带标题
 * - 网盘 / 文档平台的分享文案（标题、链接、提取码分散在多行）
 * - Markdown 链接、Excel 复制的 Tab 分隔行
 */
export function parseShareText(text: string): LinkDraft[] {
  const results: LinkDraft[] = [];
  let pendingTitle = "";
  const normalized = text.replace(MD_LINK_RE, "$1 $2");

  for (const raw of normalized.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes("\t")) {
      const tabbed = parseTabbedLine(line);
      if (tabbed) {
        results.push(tabbed);
        pendingTitle = "";
        continue;
      }
    }

    const urls = extractUrls(line);
    const code = line.match(CODE_RE)?.[1] ?? "";

    if (urls.length === 0) {
      const last = results.at(-1);
      if (code && last && !last.accessCode) {
        last.accessCode = code;
        continue;
      }
      const title = extractTitle(line);
      if (title) pendingTitle = title;
      continue;
    }

    const lineTitle = urls.length === 1 ? extractTitle(line) : "";
    urls.forEach((url, i) => {
      results.push({
        url,
        title: lineTitle || (i === 0 ? pendingTitle : ""),
        accessCode: (urls.length === 1 ? code : "") || codeFromUrl(url),
      });
    });
    pendingTitle = "";
  }
  return results;
}

/** 文本里是否含有链接 */
export function containsUrl(text: string): boolean {
  return extractUrls(text).length > 0;
}
