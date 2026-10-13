"use client";

import { ChevronLeft, CircleHelp, LogOut, Plus, Search, Settings } from "lucide-react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment } from "react";
import { useAppData } from "@/lib/client";
import { safeDecode } from "@/lib/url";
import { NavIcon, type NavIconName } from "./nav-icons";
import { useCreateMenu } from "./Sidebar";
import { Avatar, cx, IconButton, Kbd, Menu, useModKey } from "./ui";
import { useUI } from "./ui-context";

interface PageTitle {
  title: string;
  /** 桌面端顶栏显示的路径，例如 项目 / 工作 / 官网改版 */
  crumbs?: string[];
  /** 手机端返回按钮的去处；没有时表示这是底部标签页 */
  parent?: string;
}

const SIMPLE_TITLES: Record<string, PageTitle> = {
  "/": { title: "工作台" },
  "/projects": { title: "项目" },
  "/favorites": { title: "我的收藏" },
  "/settings": { title: "设置" },
  "/inbox": { title: "收件箱", parent: "/projects" },
  "/expiring": { title: "即将过期", parent: "/projects" },
  "/reminders": { title: "提醒事项", parent: "/projects" },
  "/snippets": { title: "摘录", parent: "/projects" },
  "/all": { title: "全部链接", parent: "/projects" },
  "/recent": { title: "最近访问", parent: "/" },
  "/trash": { title: "回收站", parent: "/projects" },
  "/search": { title: "搜索结果", parent: "/" },
};

/** 根据地址得到页面标题和路径 */
export function usePageTitle(): PageTitle {
  const pathname = usePathname();
  const { data } = useAppData();
  if (SIMPLE_TITLES[pathname]) return SIMPLE_TITLES[pathname];
  const project = pathname.match(/^\/p\/(\d+)/);
  if (project) {
    const p = data?.projects.find((x) => x.id === Number(project[1]));
    const g = p && data?.groups.find((x) => x.id === p.groupId);
    return {
      title: p?.name ?? "项目",
      crumbs: p ? ["项目", g?.name ?? "", p.name].filter(Boolean) : ["项目"],
      parent: "/projects",
    };
  }
  const tag = pathname.match(/^\/t\/(.+)/);
  if (tag) {
    const name = safeDecode(tag[1]);
    return { title: `# ${name}`, crumbs: ["标签", `# ${name}`], parent: "/projects" };
  }
  return { title: "MyDoc" };
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

/** 桌面端顶栏：标题或路径、搜索框、帮助、头像菜单 */
export function TopBar({ onHelp }: { onHelp: () => void }) {
  const ui = useUI();
  const router = useRouter();
  const mod = useModKey();
  const { title, crumbs } = usePageTitle();

  return (
    <header className="hidden min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-6 py-2.5 md:flex">
      {crumbs && crumbs.length > 1 ? (
        <nav aria-label="当前位置" className="flex min-w-0 flex-1 items-center gap-1.5 text-muted">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-disabled">/</span>}
              <span className={cx("truncate", i === crumbs.length - 1 && "font-medium text-fg")}>{c}</span>
            </Fragment>
          ))}
        </nav>
      ) : (
        <div className="min-w-0 flex-1 truncate text-base font-semibold">{title}</div>
      )}
      <button
        type="button"
        onClick={ui.openPalette}
        className="flex h-8 w-[360px] max-w-full min-w-48 shrink cursor-pointer items-center gap-2 rounded-md bg-field px-2.5 text-faint transition-colors hover:bg-chip"
      >
        <Search size={16} className="shrink-0 text-icon" />
        <span className="flex-1 truncate text-left">搜索文档、项目、标签</span>
        <Kbd>{mod} K</Kbd>
      </button>
      <IconButton label="帮助与快捷键" onClick={onHelp}>
        <CircleHelp size={18} />
      </IconButton>
      <Menu
        label="账户"
        items={[
          { label: "设置", icon: <Settings size={16} />, onSelect: () => router.push("/settings") },
          { divider: true },
          { label: "退出登录", icon: <LogOut size={16} />, onSelect: () => void logout() },
        ]}
        trigger={(props) => (
          <button type="button" aria-label="账户与设置" className="cursor-pointer rounded-full" {...props}>
            <Avatar />
          </button>
        )}
      />
    </header>
  );
}

/** 手机端顶栏：标签页显示标题，下级页面显示返回按钮和居中标题 */
export function MobileHeader() {
  const ui = useUI();
  const pathname = usePathname();
  const createMenu = useCreateMenu();
  const { title, parent } = usePageTitle();

  const search = (
    <IconButton label="搜索" tooltip={false} className="size-11 text-fg" onClick={ui.openPalette}>
      <Search size={21} />
    </IconButton>
  );

  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center border-b border-line-soft bg-bg md:hidden">
      {parent ? (
        <>
          <NextLink
            href={parent}
            aria-label="返回"
            className="ml-1 flex size-11 shrink-0 items-center justify-center text-fg"
          >
            <ChevronLeft size={23} />
          </NextLink>
          <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{title}</h1>
          <span className="mr-1">{search}</span>
        </>
      ) : (
        <>
          <h1 className="min-w-0 flex-1 truncate pl-4 text-lg font-semibold">{title}</h1>
          {search}
          {pathname === "/projects" && (
            <Menu
              label="新建"
              items={createMenu}
              trigger={(props) => (
                <IconButton label="新建" tooltip={false} className="size-11 text-fg" {...props}>
                  <Plus size={22} />
                </IconButton>
              )}
            />
          )}
          <span className="w-1" />
        </>
      )}
    </header>
  );
}

const TABS: { href: string; label: string; icon: NavIconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "工作台", icon: "home", match: (p) => p === "/" || p === "/recent" },
  {
    href: "/projects",
    label: "项目",
    icon: "folder",
    match: (p) => /^\/(projects|inbox|expiring|reminders|snippets|all|trash|p\/|t\/)/.test(p),
  },
  { href: "/favorites", label: "收藏", icon: "star", match: (p) => p === "/favorites" },
  { href: "/settings", label: "我的", icon: "user", match: (p) => p === "/settings" },
];

/** 手机端底部标签栏 + 右下角的添加按钮 */
export function TabBar() {
  const ui = useUI();
  const pathname = usePathname();
  const showFab = pathname !== "/settings" && pathname !== "/trash";
  return (
    <>
      {showFab && (
        <button
          type="button"
          aria-label={pathname === "/reminders" ? "添加提醒" : pathname === "/snippets" ? "添加摘录" : "添加链接"}
          onClick={() =>
            pathname === "/reminders" ? ui.editReminder() : pathname === "/snippets" ? ui.editSnippet() : ui.addLink()
          }
          className="fixed right-5 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex size-[52px] cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_16px_rgb(51_112_255/0.4)] active:bg-accent-hover md:hidden"
        >
          <Plus size={24} strokeWidth={2.4} />
        </button>
      )}
      <nav
        aria-label="底部导航"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <NextLink
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] leading-[14px]",
                active ? "text-accent-text" : "text-muted",
              )}
            >
              <NavIcon name={t.icon} size={22} />
              {t.label}
            </NextLink>
          );
        })}
      </nav>
    </>
  );
}
