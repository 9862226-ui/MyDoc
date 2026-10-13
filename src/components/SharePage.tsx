"use client";

import { Copy, ExternalLink, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { copyText } from "@/lib/client";
import { expiryInfo, shortTime } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import type { SharedProject } from "@/lib/shares";
import { Button, cx, DocIcon, Input, Logo, ProjectBadge, Tag } from "./ui";

/** 分享页的外框：顶部品牌、居中的内容 */
export function ShareFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-field dark:bg-bg">
      <header className="mx-auto flex max-w-[880px] items-center gap-2 px-4 pt-5 pb-3 md:px-6">
        <Logo size={24} />
        <span className="font-semibold">MyDoc</span>
        <span className="text-[13px] text-faint">· 只读分享</span>
      </header>
      <main className="mx-auto max-w-[880px] px-4 pb-16 md:px-6">{children}</main>
    </div>
  );
}

export function ShareGone() {
  return (
    <ShareFrame>
      <div className="mt-6 rounded-xl bg-surface px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">分享链接已失效</h1>
        <p className="mt-2 text-muted">链接可能已经过期，或者分享的人停止了分享。请联系对方重新分享。</p>
      </div>
    </ShareFrame>
  );
}

export function SharePassword({ token, projectName }: { token: string; projectName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/s/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "出错了，请稍后再试");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <ShareFrame>
      <form
        className="mx-auto mt-6 flex max-w-[400px] flex-col items-center rounded-xl bg-surface px-6 py-10 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-text">
          <Lock size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold">「{projectName}」需要访问密码</h1>
        <p className="mt-1 text-[13px] text-muted">请输入分享人给你的密码</p>
        <Input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          aria-label="访问密码"
          className="mt-5"
        />
        {error && <p className="mt-2 self-start text-xs text-danger-text">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!password} className="mt-4 w-full">
          查看
        </Button>
      </form>
    </ShareFrame>
  );
}

export function SharedProjectView({ data }: { data: SharedProject }) {
  const [toast, setToast] = useState("");
  const copy = async (code: string) => {
    const ok = await copyText(code);
    setToast(ok ? `已复制提取码 ${code}` : "复制失败");
    setTimeout(() => setToast(""), 2000);
  };

  return (
    <ShareFrame>
      <section className="rounded-xl bg-surface">
        <div className="flex items-start gap-4 border-b border-line px-5 py-5 md:px-6">
          <ProjectBadge
            project={{ id: data.projectId, name: data.projectName }}
            size={44}
            className="rounded-[10px] text-lg"
          />
          <div className="min-w-0 flex-1">
            {data.groupName && <p className="text-[13px] text-faint">{data.groupName}</p>}
            <h1 className="text-xl leading-7 font-semibold">{data.projectName}</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {[data.description, `${data.links.length} 个链接`, data.updatedAt && `${shortTime(data.updatedAt)} 更新`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        {data.links.length === 0 ? (
          <p className="px-6 py-14 text-center text-muted">这个项目里还没有链接</p>
        ) : (
          <ul>
            {data.links.map((l, i) => {
              const expiry = l.expiresAt ? expiryInfo(l.expiresAt) : null;
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 border-b border-line-soft px-5 py-3 last:border-b-0 md:px-6"
                >
                  <DocIcon url={l.url} size={32} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => l.accessCode && void copy(l.accessCode)}
                      className="group inline-flex max-w-full items-center gap-1 font-medium hover:text-accent-text"
                    >
                      <span className="truncate">{l.title}</span>
                      <ExternalLink size={13} className="shrink-0 text-icon group-hover:text-accent-text" />
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                      <span>{platformLabel(l.url)}</span>
                      {expiry && (
                        <Tag
                          tone={expiry.level === "expired" ? "danger" : expiry.level === "soon" ? "warn" : "default"}
                        >
                          {expiry.label}
                        </Tag>
                      )}
                    </div>
                    {l.note && <p className="mt-1 text-[13px] whitespace-pre-wrap text-muted">{l.note}</p>}
                  </div>
                  {l.accessCode && (
                    <button
                      type="button"
                      onClick={() => void copy(l.accessCode)}
                      title="点击复制提取码"
                      className={cx(
                        "mt-1 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line-strong px-2 font-mono text-xs",
                        "hover:border-accent hover:text-accent-text",
                      )}
                    >
                      <Copy size={12} />
                      {l.accessCode}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="mt-4 text-center text-xs text-faint">点击带提取码的链接时，会自动复制提取码</p>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 flex justify-center px-4">
        {toast && (
          <span className="rounded-lg bg-[#1F2329] px-4 py-2 text-[13px] text-white shadow-pop dark:bg-[#43464C]">
            {toast}
          </span>
        )}
      </div>
    </ShareFrame>
  );
}
