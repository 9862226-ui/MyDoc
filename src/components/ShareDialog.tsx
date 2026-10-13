"use client";

import { Copy, Link2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api, copyText } from "@/lib/client";
import { localDate, relativeTime, shortDate } from "@/lib/format";
import type { Share } from "@/lib/shares";
import type { Project } from "@/lib/types";
import { PillRadio } from "./settings-ui";
import { Button, Checkbox, cx, Dialog, Field, IconButton, Input, Tag } from "./ui";
import { useUI } from "./ui-context";

type Days = "7" | "30" | "forever";

const DAY_OPTIONS: { value: Days; label: string }[] = [
  { value: "7", label: "7 天" },
  { value: "30", label: "30 天" },
  { value: "forever", label: "永久有效" },
];

export const SHARES_KEY = "/api/shares";

const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

/** 分享链接的状态说明：有效期、密码、打开次数 */
function shareMeta(s: Share): string {
  const parts = [
    s.expired ? "已过期" : s.expiresAt ? `${shortDate(localDate(new Date(s.expiresAt)))}到期` : "永久有效",
    s.hasPassword ? "有密码" : "无密码",
    s.showNotes ? "显示备注" : "",
    s.viewCount ? `打开过 ${s.viewCount} 次，最近 ${relativeTime(s.lastViewedAt)}` : "还没人打开过",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** 分享链接列表，项目弹窗和设置页共用 */
export function ShareList({ shares, showProject = false }: { shares: Share[]; showProject?: boolean }) {
  const ui = useUI();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const stop = async (s: Share) => {
    const ok = await ui.confirm({
      title: "停止分享？",
      message: "这个链接会立即失效，已经拿到链接的人也打不开了。",
      confirmText: "停止分享",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/shares/${s.id}`, { method: "DELETE" });
      await globalMutate((key) => typeof key === "string" && key.startsWith(SHARES_KEY));
      ui.toast("已停止分享");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <ul>
      {shares.map((s) => (
        <li key={s.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
          <Link2 size={16} className={cx("shrink-0", s.expired ? "text-disabled" : "text-icon")} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {showProject && <span className="shrink-0 font-medium">{s.projectName}</span>}
              <span
                className={cx("truncate font-mono text-[13px]", s.expired ? "text-faint line-through" : "text-muted")}
              >
                {origin}/s/{s.token}
              </span>
              {s.expired && <Tag tone="danger">已过期</Tag>}
            </div>
            <div className="text-xs text-faint">{shareMeta(s)}</div>
          </div>
          {!s.expired && (
            <IconButton
              label="复制链接"
              size="sm"
              onClick={async () => {
                const ok = await copyText(shareUrl(s.token));
                ui.toast(ok ? "已复制分享链接" : "复制失败", { kind: ok ? "ok" : "error" });
              }}
            >
              <Copy size={15} />
            </IconButton>
          )}
          <IconButton
            label={s.expired ? "删除" : "停止分享"}
            size="sm"
            className="hover:text-danger-text"
            onClick={() => void stop(s)}
          >
            <Trash2 size={15} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

export function ShareDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title={project ? `分享「${project.name}」` : ""}
      description="生成一个只读链接，对方不用登录就能看到这个项目里的链接和提取码；之后新加的链接也会出现在分享页里。"
    >
      {project && <ShareForm project={project} />}
    </Dialog>
  );
}

function ShareForm({ project }: { project: Project }) {
  const ui = useUI();
  const key = `${SHARES_KEY}?projectId=${project.id}`;
  const { data: shares, mutate } = useSWR(key, (url: string) => api<Share[]>(url));
  const [days, setDays] = useState<Days>("30");
  const [password, setPassword] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ share: Share; password: string } | null>(null);

  const shareText = (s: Share, pwd: string) =>
    `「${project.name}」的文档链接：${shareUrl(s.token)}${pwd ? ` 访问密码：${pwd}` : ""}`;

  const create = async () => {
    setBusy(true);
    try {
      const share = await api<Share>(SHARES_KEY, {
        body: { projectId: project.id, days: days === "forever" ? null : Number(days), password, showNotes },
      });
      await mutate();
      await globalMutate(SHARES_KEY);
      setCreated({ share, password });
      setPassword("");
      const ok = await copyText(shareText(share, password));
      ui.toast(ok ? "分享链接已生成并复制" : "分享链接已生成");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {created && (
        <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success-soft p-3.5">
          <div className="font-medium text-success-text">分享链接已生成</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-surface px-2.5 py-1.5 font-mono text-[13px] break-all">
              {shareUrl(created.share.token)}
              {created.password && <span className="block text-muted">访问密码：{created.password}</span>}
            </code>
            <Button
              size="sm"
              onClick={async () => {
                const ok = await copyText(shareText(created.share, created.password));
                ui.toast(ok ? "已复制" : "复制失败", { kind: ok ? "ok" : "error" });
              }}
            >
              <Copy size={14} />
              复制
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field as="div" label="有效期">
          <PillRadio label="有效期" value={days} onChange={setDays} options={DAY_OPTIONS} />
        </Field>
        <Field label="访问密码" hint="可选；设置后对方要输入密码才能看到">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={64}
            placeholder="留空表示不需要密码"
            autoComplete="off"
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="size-4" />
          分享页显示链接的备注
        </label>
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            生成分享链接
          </Button>
        </div>
      </form>

      {!!shares?.length && (
        <div>
          <div className="mb-1 font-medium">已有的分享链接</div>
          <ShareList shares={shares} />
        </div>
      )}
    </div>
  );
}

/** 设置 › 分享链接：所有项目的分享 */
export function SharesSection() {
  const { data: shares } = useSWR(SHARES_KEY, (url: string) => api<Share[]>(url));
  const active = shares?.filter((s) => !s.expired) ?? [];
  return (
    <section className="rounded-lg bg-surface px-5 py-5 md:px-6">
      <h2 className="text-base font-semibold">分享链接</h2>
      <p className="mt-1 text-[13px] text-muted">
        在项目页点「分享」可以生成只读链接。这里是所有分享出去的链接{shares ? `，有效的 ${active.length} 个` : ""}。
      </p>
      <div className="mt-2">
        {!shares ? (
          <div className="skeleton my-3 h-10 rounded-md" />
        ) : shares.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-faint">还没有分享过项目</p>
        ) : (
          <ShareList shares={shares} showProject />
        )}
      </div>
    </section>
  );
}
