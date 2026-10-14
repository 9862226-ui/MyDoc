"use client";

import {
  ArrowRight,
  BellPlus,
  CalendarDays,
  ClipboardCheck,
  FileText,
  FolderPlus,
  Import,
  Link2,
  NotebookPen,
  Quote,
  Sunrise,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CommandId } from "@/lib/commands";
import type { UI } from "./ui-context";

/** 每个操作的图标和底色；跳转用同一个箭头 */
export const COMMAND_ICONS: Record<string, [LucideIcon, string]> = {
  log: [NotebookPen, "#13A3A3"],
  plan: [Sunrise, "#F59E0B"],
  shutdown: [ClipboardCheck, "#4F7BF7"],
  meeting: [Users, "#E8488B"],
  today: [FileText, "#13A3A3"],
  weekly: [FileText, "#13A3A3"],
  calendar: [CalendarDays, "#13A3A3"],
  link: [Link2, "#3B82F6"],
  import: [Import, "#3B82F6"],
  snippet: [Quote, "#7B61FF"],
  reminder: [BellPlus, "#F97316"],
  project: [FolderPlus, "#64748B"],
  go: [ArrowRight, "#64748B"],
};

/**
 * 执行命令。工作记录、会议纪要的操作通过地址参数告诉页面要做什么（页面处理完会去掉参数），
 * 这样在别的页面和在当前页面都能用
 */
export function runCommand(id: CommandId, ctx: { push: (href: string) => void; ui: UI; hasGroups: boolean }) {
  if (id.startsWith("go:")) return ctx.push(id.slice(3));
  switch (id) {
    case "log":
      return ctx.push("/work?do=capture");
    case "plan":
      return ctx.push("/work?do=plan");
    case "shutdown":
      return ctx.push("/work?do=shutdown");
    case "today":
      return ctx.push("/work?do=today");
    case "weekly":
      return ctx.push("/work?do=weekly");
    case "calendar":
      return ctx.push("/work?do=calendar");
    case "meeting":
      return ctx.push("/meetings?do=new");
    case "link":
      return ctx.ui.addLink();
    case "import":
      return ctx.ui.importLinks();
    case "snippet":
      return ctx.ui.editSnippet();
    case "reminder":
      return ctx.ui.editReminder();
    case "project":
      // 还没有分组时先建分组
      return ctx.hasGroups ? ctx.ui.editProject() : ctx.ui.editGroup();
  }
}
