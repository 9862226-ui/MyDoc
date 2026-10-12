import { safeDecode } from "./url";

export interface Platform {
  key: string;
  name: string;
  /** 图标上显示的简称 */
  short: string;
  color: string;
  hosts: string[];
  hostPattern?: RegExp;
  /** 按路径识别文档类型 */
  kinds?: [RegExp, string][];
  /** 页面标题中的平台后缀，获取标题后去掉 */
  suffixes?: string[];
}

export const PLATFORMS: Platform[] = [
  {
    key: "feishu",
    name: "飞书",
    short: "飞",
    color: "#3370ff",
    hosts: ["feishu.cn", "feishu.net", "larksuite.com", "larkoffice.com"],
    kinds: [
      [/^\/docx?\//, "文档"],
      [/^\/sheets?\//, "表格"],
      [/^\/base\//, "多维表格"],
      [/^\/wiki\//, "知识库"],
      [/^\/mindnotes?\//, "思维笔记"],
      [/^\/slides?\//, "幻灯片"],
      [/^\/drive\/folder\//, "文件夹"],
      [/^\/file\//, "文件"],
      [/^\/minutes\//, "妙记"],
      [/^\/share\/base\//, "多维表格"],
    ],
    suffixes: ["飞书云文档", "飞书文档", "飞书", "Feishu Docs", "Lark Docs", "Lark"],
  },
  {
    key: "tencent",
    name: "腾讯文档",
    short: "腾",
    color: "#1e6fff",
    hosts: ["docs.qq.com"],
    kinds: [
      [/^\/doc\//, "文档"],
      [/^\/sheet\//, "表格"],
      [/^\/smartsheet\//, "智能表格"],
      [/^\/slide\//, "幻灯片"],
      [/^\/form\//, "收集表"],
      [/^\/mind\//, "思维导图"],
      [/^\/flowchart\//, "流程图"],
      [/^\/aio\//, "智能文档"],
      [/^\/folder\//, "文件夹"],
      [/^\/pdf\//, "PDF"],
    ],
    suffixes: ["腾讯文档"],
  },
  {
    key: "shimo",
    name: "石墨文档",
    short: "石",
    color: "#3d4757",
    hosts: ["shimo.im"],
    kinds: [
      [/^\/docs?\//, "文档"],
      [/^\/sheets\//, "表格"],
      [/^\/presentation\//, "幻灯片"],
      [/^\/tables\//, "表格"],
      [/^\/folder\//, "文件夹"],
    ],
    suffixes: ["石墨文档"],
  },
  { key: "yuque", name: "语雀", short: "雀", color: "#00b96b", hosts: ["yuque.com"], suffixes: ["语雀"] },
  {
    key: "dingtalk",
    name: "钉钉文档",
    short: "钉",
    color: "#0089ff",
    hosts: ["alidocs.dingtalk.com", "dingtalk.com"],
    suffixes: ["钉钉文档", "钉钉"],
  },
  {
    key: "kdocs",
    name: "金山文档",
    short: "金",
    color: "#e8452c",
    hosts: ["kdocs.cn", "wps.cn", "wps.com"],
    suffixes: ["金山文档", "WPS云文档", "WPS"],
  },
  { key: "notion", name: "Notion", short: "N", color: "#1f1f1f", hosts: ["notion.so", "notion.site"], suffixes: ["Notion"] },
  {
    key: "google",
    name: "Google",
    short: "G",
    color: "#1a73e8",
    hosts: ["docs.google.com", "drive.google.com"],
    kinds: [
      [/^\/document\//, "文档"],
      [/^\/spreadsheets\//, "表格"],
      [/^\/presentation\//, "幻灯片"],
      [/^\/forms\//, "表单"],
      [/^\/drive\/(u\/\d+\/)?folders\//, "文件夹"],
      [/^\/file\//, "文件"],
    ],
    suffixes: [
      "Google Docs",
      "Google 文档",
      "Google Sheets",
      "Google 表格",
      "Google Slides",
      "Google 幻灯片",
      "Google Drive",
      "Google 云端硬盘",
    ],
  },
  {
    key: "microsoft",
    name: "OneDrive",
    short: "M",
    color: "#0364b8",
    hosts: ["onedrive.live.com", "1drv.ms", "sharepoint.com", "office.com", "onedrive.com"],
    suffixes: ["OneDrive", "Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint"],
  },
  { key: "baidupan", name: "百度网盘", short: "百", color: "#06a7ff", hosts: ["pan.baidu.com"], suffixes: ["百度网盘"] },
  {
    key: "alipan",
    name: "阿里云盘",
    short: "阿",
    color: "#ff6a00",
    hosts: ["alipan.com", "aliyundrive.com"],
    suffixes: ["阿里云盘"],
  },
  { key: "quark", name: "夸克网盘", short: "夸", color: "#4f6bff", hosts: ["pan.quark.cn"], suffixes: ["夸克网盘"] },
  { key: "weiyun", name: "腾讯微云", short: "微", color: "#2f7cf6", hosts: ["weiyun.com"], suffixes: ["微云", "腾讯微云"] },
  {
    key: "lanzou",
    name: "蓝奏云",
    short: "蓝",
    color: "#2d8cf0",
    hosts: [],
    hostPattern: /(^|\.)lanzou[a-z]?\.com$/,
    suffixes: ["蓝奏云"],
  },
  { key: "figma", name: "Figma", short: "F", color: "#a259ff", hosts: ["figma.com"], suffixes: ["Figma"] },
  { key: "mastergo", name: "MasterGo", short: "M", color: "#3c6cf5", hosts: ["mastergo.com"], suffixes: ["MasterGo"] },
  { key: "lanhu", name: "蓝湖", short: "湖", color: "#2878ff", hosts: ["lanhuapp.com"], suffixes: ["蓝湖"] },
  { key: "modao", name: "墨刀", short: "墨", color: "#ff5a5a", hosts: ["modao.cc"], suffixes: ["墨刀"] },
  { key: "processon", name: "ProcessOn", short: "P", color: "#067bef", hosts: ["processon.com"], suffixes: ["ProcessOn"] },
  { key: "boardmix", name: "boardmix", short: "B", color: "#6b4cff", hosts: ["boardmix.cn", "boardmix.com"], suffixes: ["boardmix"] },
  { key: "wolai", name: "wolai", short: "W", color: "#2b2b2b", hosts: ["wolai.com"], suffixes: ["wolai"] },
  { key: "flowus", name: "FlowUs", short: "F", color: "#2f54eb", hosts: ["flowus.cn"], suffixes: ["FlowUs"] },
  { key: "github", name: "GitHub", short: "GH", color: "#24292f", hosts: ["github.com"], suffixes: ["GitHub"] },
  { key: "gitee", name: "Gitee", short: "码", color: "#c71d23", hosts: ["gitee.com"], suffixes: ["Gitee"] },
  { key: "atlassian", name: "Atlassian", short: "A", color: "#0052cc", hosts: ["atlassian.net"], suffixes: ["Confluence", "Jira"] },
];

export const WEB_PLATFORM: Platform = { key: "web", name: "网页", short: "网", color: "#64748b", hosts: [] };

const byKey = new Map(PLATFORMS.map((p) => [p.key, p]));

export function platformByKey(key: string): Platform {
  return byKey.get(key) ?? WEB_PLATFORM;
}

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  return safeUrl(url)?.hostname.replace(/^www\./, "") ?? "";
}

export function detectPlatform(url: string): Platform {
  const host = safeUrl(url)?.hostname.toLowerCase();
  if (!host) return WEB_PLATFORM;
  for (const p of PLATFORMS) {
    if (p.hosts.some((h) => host === h || host.endsWith("." + h))) return p;
    if (p.hostPattern?.test(host)) return p;
  }
  return WEB_PLATFORM;
}

/** 文档类型，例如「表格」「文件夹」，识别不出返回空字符串 */
export function detectKind(url: string, platform = detectPlatform(url)): string {
  const path = safeUrl(url)?.pathname;
  if (!path || !platform.kinds) return "";
  for (const [re, kind] of platform.kinds) if (re.test(path)) return kind;
  return "";
}

export function platformLabel(url: string): string {
  const platform = detectPlatform(url);
  const kind = detectKind(url, platform);
  return kind ? `${platform.name} · ${kind}` : platform.name;
}

/** 链接没有标题时的默认名称 */
export function fallbackTitle(url: string): string {
  const platform = detectPlatform(url);
  if (platform !== WEB_PLATFORM) return `未命名${detectKind(url, platform) || "链接"}（${platform.name}）`;
  const u = safeUrl(url);
  if (!u) return url;
  const path = u.pathname === "/" ? "" : safeDecode(u.pathname);
  return (u.hostname.replace(/^www\./, "") + path).slice(0, 80);
}

const GENERIC_TITLE = /^(登录|登入|sign\s*in|log\s*in|login|sign\s*up|注册|404|403|error|页面不存在|访问受限|无权限|安全验证)/i;

/** 去掉标题里的平台后缀；标题没有意义（如登录页）时返回空字符串 */
export function cleanFetchedTitle(title: string, url: string): string {
  const platform = detectPlatform(url);
  let t = title.replace(/\s+/g, " ").trim();
  const suffixes = [...(platform.suffixes ?? []), platform.name];
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of suffixes) {
      const re = new RegExp(`\\s*[-|_·—–丨]\\s*${escapeRegExp(s)}\\s*$`, "i");
      if (re.test(t)) {
        t = t.replace(re, "").trim();
        changed = true;
      }
    }
  }
  if (!t || GENERIC_TITLE.test(t)) return "";
  if (suffixes.some((s) => s.toLowerCase() === t.toLowerCase())) return "";
  if (platform.key === "baidupan" && /^百度网盘/.test(t)) return "";
  return t.slice(0, 200);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
