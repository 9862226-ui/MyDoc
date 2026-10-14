/**
 * 命令面板里的「操作」和「跳转」，以及对应的快捷键。
 * py 是标题的拼音（手写，免得在浏览器里加载拼音库），可以用首字母或全拼搜到，例如「kg」找到「开工」
 */
import { pinyinMatch } from "./view";

export type CommandId =
  | "log"
  | "plan"
  | "shutdown"
  | "meeting"
  | "today"
  | "weekly"
  | "calendar"
  | "link"
  | "import"
  | "snippet"
  | "reminder"
  | "project"
  | `go:${string}`;

export interface Command {
  id: CommandId;
  title: string;
  py: string;
  group: "操作" | "跳转";
  /** 快捷键，按顺序按，例如 ["G", "W"] */
  keys?: string[];
  /** 跳转的地址 */
  href?: string;
}

const action = (id: CommandId, title: string, py: string, keys?: string[]): Command => ({
  id,
  title,
  py,
  group: "操作",
  keys,
});

const go = (key: string, title: string, py: string, href: string): Command => ({
  id: `go:${href}`,
  title: `前往${title}`,
  py: `qian wang ${py}`,
  group: "跳转",
  keys: ["G", key],
  href,
});

export const COMMANDS: Command[] = [
  action("log", "记一笔工作", "ji yi bi gong zuo", ["C"]),
  action("plan", "开工：安排今天的计划", "kai gong an pai jin tian de ji hua"),
  action("shutdown", "收工：核对今天、整理日报", "shou gong he dui jin tian zheng li ri bao"),
  action("meeting", "新建会议纪要", "xin jian hui yi ji yao"),
  action("today", "打开今天的日报", "da kai jin tian de ri bao"),
  action("weekly", "打开本周周报", "da kai ben zhou zhou bao"),
  action("calendar", "打开工作日历", "da kai gong zuo ri li"),
  action("link", "添加链接", "tian jia lian jie", ["N"]),
  action("import", "批量导入链接", "pi liang dao ru lian jie"),
  action("snippet", "添加摘录", "tian jia zhai lu"),
  action("reminder", "添加提醒", "tian jia ti xing"),
  action("project", "新建项目", "xin jian xiang mu"),
  go("H", "工作台", "gong zuo tai", "/"),
  go("W", "工作记录", "gong zuo ji lu", "/work"),
  go("M", "会议纪要", "hui yi ji yao", "/meetings"),
  go("I", "收件箱", "shou jian xiang", "/inbox"),
  go("F", "我的收藏", "wo de shou cang", "/favorites"),
  go("R", "到期提醒", "dao qi ti xing", "/reminders"),
  go("E", "摘录", "zhai lu", "/snippets"),
  go("A", "全部链接", "quan bu lian jie", "/all"),
  go("S", "设置", "she zhi", "/settings"),
];

/** 搜索框为空时先列出来的常用操作 */
export const QUICK_COMMANDS: CommandId[] = ["log", "plan", "shutdown", "meeting", "today", "link"];

/** 先按 G 再按这个键跳到对应页面 */
export const GO_KEYS: Record<string, string> = Object.fromEntries(
  COMMANDS.filter((c) => c.href).map((c) => [c.keys![1].toLowerCase(), c.href!]),
);

export function getCommand(id: CommandId): Command {
  return COMMANDS.find((c) => c.id === id)!;
}

/**
 * 按关键字找操作：每个关键字都要对上标题或拼音。
 * 标题开头就对上的排前面（「开工」先出「开工：安排今天」，再出「打开工作日历」）
 */
export function matchCommands(query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const at = (c: Command) => {
    const i = c.title.toLowerCase().indexOf(words[0]);
    return i < 0 ? 99 : i;
  };
  return COMMANDS.filter((c) => words.every((w) => c.title.toLowerCase().includes(w) || pinyinMatch(w, c.py))).sort(
    (a, b) => at(a) - at(b),
  );
}
