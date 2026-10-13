"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAppData } from "@/lib/client";
import { isReminderDue } from "@/lib/reminders";
import { isExpiring } from "@/lib/view";
import { AlarmIcon, Button, Tabs } from "./ui";
import { useUI } from "./ui-context";

export type DueTab = "accounts" | "links";

const TAB_HREF: Record<DueTab, string> = { accounts: "/reminders", links: "/expiring" };

/** 需要处理的数量：快到期或已过期的提醒事项、7 天内到期或已过期的分享链接 */
export function useDueCounts() {
  const { data } = useAppData();
  return useMemo(
    () => ({
      accounts: data?.reminders.filter((r) => isReminderDue(r)).length ?? 0,
      links: data?.links.filter((l) => isExpiring(l)).length ?? 0,
    }),
    [data],
  );
}

/** 「到期提醒」页的页头：账号与会员 / 分享链接 两个标签 */
export function DueHeader({ active }: { active: DueTab }) {
  const ui = useUI();
  const router = useRouter();
  const counts = useDueCounts();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-warn text-white md:size-12"
        >
          <AlarmIcon size={22} className="stroke-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="hidden text-xl leading-7 font-semibold md:block">到期提醒</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {active === "accounts"
              ? "账号、域名、服务器、会员的到期时间，快到期时提醒你"
              : "设置了有效期的分享链接，7 天内到期或已经过期的都在这里"}
          </p>
        </div>
        {active === "accounts" && (
          <Button variant="primary" className="hidden md:inline-flex" onClick={() => ui.editReminder()}>
            <Plus size={16} />
            添加提醒
          </Button>
        )}
      </div>
      <Tabs
        label="到期提醒"
        value={active}
        onChange={(v) => router.push(TAB_HREF[v])}
        items={[
          { value: "accounts", label: "账号与会员", count: counts.accounts || undefined },
          { value: "links", label: "分享链接", count: counts.links || undefined },
        ]}
        className="border-b border-line"
      />
    </div>
  );
}
