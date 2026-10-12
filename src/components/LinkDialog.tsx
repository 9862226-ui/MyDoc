"use client";

import { CircleAlert, Sparkles, Star, Pin, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, refreshData, useAppData } from "@/lib/client";
import { addDays } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import { parseShareText } from "@/lib/share-text";
import type { Link } from "@/lib/types";
import { toHttpUrl, urlKey } from "@/lib/url";
import { projectIndex, projectPathLabel } from "@/lib/view";
import { ProjectSelect, TagInput } from "./fields";
import { Button, cx, Dialog, Field, Input, PlatformIcon, Spinner, Textarea, useModKey } from "./ui";
import { useLinkActions, useUI, type LinkInit } from "./ui-context";

type TitleStatus = "idle" | "loading" | "failed";

export function LinkDialog({
  open,
  onClose,
  link,
  init,
}: {
  open: boolean;
  onClose: () => void;
  link?: Link;
  init?: LinkInit;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={link ? "编辑链接" : "添加链接"}>
      <LinkForm link={link} init={init} onDone={onClose} />
    </Dialog>
  );
}

function LinkForm({ link, init, onDone }: { link?: Link; init?: LinkInit; onDone: () => void }) {
  const { data } = useAppData();
  const ui = useUI();
  const actions = useLinkActions();

  const [url, setUrl] = useState(link?.url ?? init?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? init?.title ?? "");
  const [projectId, setProjectId] = useState<number | null>(
    link ? link.projectId : init?.projectId !== undefined ? init.projectId : ui.defaultProjectId,
  );
  const [tags, setTags] = useState<string[]>(link?.tags ?? init?.tags ?? []);
  const [accessCode, setAccessCode] = useState(link?.accessCode ?? init?.accessCode ?? "");
  const [expiresAt, setExpiresAt] = useState(link?.expiresAt ?? "");
  const [note, setNote] = useState(link?.note ?? "");
  const [favorite, setFavorite] = useState(link?.favorite ?? false);
  const [pinned, setPinned] = useState(link?.pinned ?? false);
  const [titleStatus, setTitleStatus] = useState<TitleStatus>("idle");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const mod = useModKey();
  const titleTouched = useRef(!!(link || init?.title));
  const fetchedFor = useRef<string | null>(link ? link.url : null);

  const normalized = toHttpUrl(url);

  const duplicate = useMemo(() => {
    if (!normalized || !data) return null;
    const key = urlKey(normalized);
    const found = data.links.find((l) => l.id !== link?.id && urlKey(l.url) === key);
    if (!found) return null;
    const info = found.projectId === null ? undefined : projectIndex(data).get(found.projectId);
    return { link: found, where: projectPathLabel(info) };
  }, [normalized, data, link?.id]);

  // 填好链接后自动获取标题
  useEffect(() => {
    if (!normalized || titleTouched.current || fetchedFor.current === normalized) return;
    const timer = setTimeout(async () => {
      fetchedFor.current = normalized;
      setTitleStatus("loading");
      try {
        const r = await api<{ title: string }>("/api/fetch-title", { body: { url: normalized } });
        if (titleTouched.current) return setTitleStatus("idle");
        if (r.title) {
          setTitle(r.title);
          setTitleStatus("idle");
        } else setTitleStatus("failed");
      } catch {
        setTitleStatus("failed");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [normalized]);

  const fetchTitleNow = async () => {
    if (!normalized) return;
    setTitleStatus("loading");
    try {
      const r = await api<{ title: string }>("/api/fetch-title", { body: { url: normalized } });
      if (r.title) {
        setTitle(r.title);
        titleTouched.current = true;
        setTitleStatus("idle");
      } else setTitleStatus("failed");
    } catch {
      setTitleStatus("failed");
    }
  };

  /** 粘贴整段分享文案时，自动拆出链接、标题和提取码 */
  const onUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const [parsed] = parseShareText(text);
    if (!parsed || parsed.url === text.trim()) return;
    e.preventDefault();
    setUrl(parsed.url);
    if (parsed.title && !title) {
      setTitle(parsed.title);
      titleTouched.current = true;
    }
    if (parsed.accessCode && !accessCode) setAccessCode(parsed.accessCode);
  };

  const save = async () => {
    if (!normalized) return setError("请输入正确的链接（以 http:// 或 https:// 开头）");
    setSaving(true);
    setError("");
    const body = {
      url: normalized,
      title: title.trim(),
      projectId,
      tags,
      accessCode: accessCode.trim(),
      expiresAt: expiresAt || null,
      note,
      favorite,
      pinned,
    };
    try {
      if (link) await api(`/api/links/${link.id}`, { method: "PATCH", body });
      else await api("/api/links", { body });
      await refreshData();
      ui.toast(link ? "已保存" : "已添加");
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (!data) return <Spinner />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
      className="space-y-4"
    >
      <Field
        label="链接"
        hint={!url ? "也可以直接粘贴整段分享文案，会自动识别链接、标题和提取码" : undefined}
        error={url && !normalized ? "链接格式不正确" : undefined}
      >
        <div className="relative">
          <Input
            data-autofocus={!link ? "" : undefined}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={onUrlPaste}
            placeholder="https://"
            className={cx(normalized && "pl-10")}
            inputMode="url"
          />
          {normalized && (
            <span className="absolute top-1/2 left-2 -translate-y-1/2">
              <PlatformIcon url={normalized} size={22} />
            </span>
          )}
        </div>
        {normalized && <span className="mt-1 block text-xs text-muted">{platformLabel(normalized)}</span>}
      </Field>

      {duplicate && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            这个链接已经在「{duplicate.where}」里了：{duplicate.link.title}
            {!link && "。仍然可以保存一份。"}
          </span>
        </div>
      )}

      <Field
        label="标题"
        hint={
          titleStatus === "loading" ? (
            <span className="inline-flex items-center gap-1">
              <Spinner size={12} /> 正在获取标题…
            </span>
          ) : titleStatus === "failed" ? (
            "没获取到标题（文档可能需要登录才能查看），请手动填写；留空会使用默认名称"
          ) : undefined
        }
      >
        <div className="flex gap-2">
          <Input
            value={title}
            data-autofocus={link ? "" : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              titleTouched.current = true;
            }}
            placeholder="文档名称"
          />
          <Button
            variant="ghost"
            onClick={fetchTitleNow}
            disabled={!normalized || titleStatus === "loading"}
            title="从网页获取标题"
          >
            <Sparkles size={15} />
            获取
          </Button>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="项目">
          <ProjectSelect data={data} value={projectId} onChange={setProjectId} />
        </Field>
        <Field label="提取码 / 访问密码">
          <Input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="没有可不填" />
        </Field>
      </div>

      <Field label="标签">
        <TagInput value={tags} onChange={setTags} suggestions={data.tags.map((t) => t.name)} />
      </Field>

      <Field label="有效期" hint="分享链接有期限时填写，快到期时会提醒">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-auto min-w-40 flex-1"
          />
          <Button size="sm" variant="ghost" onClick={() => setExpiresAt(addDays(7))}>
            7 天
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpiresAt(addDays(30))}>
            30 天
          </Button>
          {expiresAt && (
            <Button size="sm" variant="ghost" onClick={() => setExpiresAt("")}>
              永久
            </Button>
          )}
        </div>
      </Field>

      <Field label="备注">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="可选" />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Toggle checked={favorite} onChange={setFavorite} icon={<Star size={15} />} label="收藏" />
        <Toggle checked={pinned} onChange={setPinned} icon={<Pin size={15} />} label="置顶" />
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

      <div className="-mx-5 -mb-4 flex items-center gap-2 border-t border-line px-5 py-3">
        {link && (
          <Button
            variant="ghost"
            className="text-danger"
            onClick={() => {
              onDone();
              void actions.remove([link.id]);
            }}
          >
            <Trash2 size={15} />
            删除
          </Button>
        )}
        <span className="mr-auto hidden text-xs text-muted sm:inline">{mod} + Enter 保存</span>
        <Button onClick={onDone}>取消</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving && <Spinner size={14} />}
          保存
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition",
        checked ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface-2",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
