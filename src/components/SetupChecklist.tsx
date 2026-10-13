"use client";

import { Bell, Bookmark, CircleCheck, CloudUpload, Smartphone, Sparkles, X } from "lucide-react";
import NextLink from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { api } from "@/lib/client";
import type { SetupItem, SetupStatus } from "@/lib/setup";
import { cx, IconButton } from "./ui";
import { useUI } from "./ui-context";

const SETUP_KEY = "/api/setup";

const ITEMS: { key: SetupItem; title: string; text: string; href: string; icon: ReactNode; manual?: boolean }[] = [
  {
    key: "ai",
    title: "配置 AI 模型",
    text: "让 AI 把链接放进合适的项目",
    href: "/settings#ai",
    icon: <Sparkles size={16} />,
  },
  {
    key: "notify",
    title: "开启提醒推送",
    text: "快到期的事项推送到微信、钉钉",
    href: "/settings#notify",
    icon: <Bell size={16} />,
  },
  {
    key: "backup",
    title: "开启异地备份",
    text: "每天把备份传到坚果云或网盘",
    href: "/settings#backup",
    icon: <CloudUpload size={16} />,
  },
  {
    key: "bookmarklet",
    title: "浏览器收藏按钮",
    text: "在任意网页一点就收藏",
    href: "/settings#bookmarklet",
    icon: <Bookmark size={16} />,
    manual: true,
  },
  {
    key: "mobile",
    title: "在手机上收藏",
    text: "在微信等 App 里分享给 MyDoc",
    href: "/settings#bookmarklet",
    icon: <Smartphone size={16} />,
    manual: true,
  },
];

/** 工作台顶部的「设置清单」：全部完成或点了关闭后不再显示 */
export function SetupChecklist() {
  const ui = useUI();
  const { data, mutate } = useSWR(SETUP_KEY, (url: string) => api<SetupStatus>(url));
  if (!data || data.dismissed) return null;
  const doneCount = ITEMS.filter((i) => data.done[i.key]).length;
  if (doneCount === ITEMS.length) return null;

  const update = async (body: object) => {
    try {
      await mutate(await api<SetupStatus>(SETUP_KEY, { method: "PUT", body }), { revalidate: false });
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <section aria-labelledby="setup-title" className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="text-base leading-6 font-semibold">
            把 MyDoc 设置好
          </h2>
          <div className="mt-1.5 flex items-center gap-2.5 text-[13px] text-muted">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-field">
              <span
                className="block h-full rounded-full bg-success transition-[width]"
                style={{ width: `${(doneCount / ITEMS.length) * 100}%` }}
              />
            </span>
            已完成 {doneCount} / {ITEMS.length}
          </div>
        </div>
        <IconButton
          label="不再显示"
          size="sm"
          onClick={() => {
            void update({ dismissed: true });
            ui.toast("已隐藏，以后可以在「设置」里找到这些配置", {
              action: { label: "撤销", onClick: () => void update({ dismissed: false }) },
            });
          }}
        >
          <X size={16} />
        </IconButton>
      </div>
      <ul className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-2.5 lg:grid-cols-5">
        {ITEMS.map((item) => {
          const done = data.done[item.key];
          return (
            <li
              key={item.key}
              className={cx(
                "flex flex-col gap-1 rounded-lg border p-3 max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:py-2.5",
                // 手机上只显示没完成的，免得太长
                done ? "border-transparent bg-field max-sm:hidden" : "border-line-strong",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {done ? (
                  <CircleCheck size={16} className="shrink-0 text-success" />
                ) : (
                  <span className="shrink-0 text-accent-text">{item.icon}</span>
                )}
                <span className={cx("truncate font-medium", done && "text-muted line-through")}>{item.title}</span>
              </div>
              <p className="text-xs leading-5 text-faint max-sm:hidden">{item.text}</p>
              {!done && (
                <div className="mt-0.5 flex shrink-0 items-center gap-3 text-[13px] max-sm:mt-0">
                  <NextLink href={item.href} className="text-accent-text hover:underline">
                    去设置
                  </NextLink>
                  {item.manual && (
                    <button
                      type="button"
                      onClick={() => void update({ manual: { [item.key]: true } })}
                      className="cursor-pointer text-muted hover:text-fg"
                    >
                      标记完成
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
