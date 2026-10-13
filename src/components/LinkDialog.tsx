"use client";

import { Check, CircleAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { api, refreshData, useAppData } from "@/lib/client";
import { addDays, shortDate } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import { parseShareText } from "@/lib/share-text";
import type { Link } from "@/lib/types";
import { toHttpUrl, urlKey } from "@/lib/url";
import { EXPIRING_DAYS, projectIndex, projectPathLabel } from "@/lib/view";
import { ProjectPicker, TagInput } from "./fields";
import {
  Banner,
  Button,
  Checkbox,
  cx,
  Dialog,
  DialogFooter,
  DocIcon,
  Field,
  Input,
  Spinner,
  Tag,
  Textarea,
  useModKey,
} from "./ui";
import { useLinkActions, useUI, type LinkInit } from "./ui-context";

type TitleStatus = "idle" | "loading" | "failed";
type ExpiryMode = "forever" | "d7" | "d30" | "custom";

const EXPIRY_OPTIONS: [ExpiryMode, string][] = [
  ["forever", "长期有效"],
  ["d7", "7 天"],
  ["d30", "30 天"],
  ["custom", "自定义日期"],
];

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
    <Dialog open={open} onClose={onClose} title={link ? "编辑链接" : "添加链接"} bodyClassName="pb-0">
      <LinkForm link={link} init={init} onDone={onClose} />
    </Dialog>
  );
}

/** 从分享文案里识别出了哪些内容，例如「链接、标题和提取码」 */
function recognizedText(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join("、")}和${parts[parts.length - 1]}` : parts[0];
}

function LinkForm({ link, init, onDone }: { link?: Link; init?: LinkInit; onDone: () => void }) {
  const { data } = useAppData();
  const ui = useUI();
  const actions = useLinkActions();
  const mod = useModKey();

  const [url, setUrl] = useState(link?.url ?? init?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? init?.title ?? "");
  const [projectId, setProjectId] = useState<number | null>(
    link ? link.projectId : init?.projectId !== undefined ? init.projectId : ui.defaultProjectId,
  );
  const [tags, setTags] = useState<string[]>(link?.tags ?? init?.tags ?? []);
  const [accessCode, setAccessCode] = useState(link?.accessCode ?? init?.accessCode ?? "");
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>(link?.expiresAt ? "custom" : "forever");
  const [customDate, setCustomDate] = useState(link?.expiresAt ?? "");
  const [note, setNote] = useState(link?.note ?? "");
  const [favorite, setFavorite] = useState(link?.favorite ?? false);
  const [pinned, setPinned] = useState(link?.pinned ?? false);
  const [titleStatus, setTitleStatus] = useState<TitleStatus>("idle");
  // 从分享文案里识别出的内容，用于顶部提示
  const [recognized, setRecognized] = useState<string[]>(() =>
    !link && init?.url && (init.title || init.accessCode)
      ? ["链接", ...(init.title ? ["标题"] : []), ...(init.accessCode ? ["提取码"] : [])]
      : [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleTouched = useRef(!!(link || init?.title));
  const fetchedFor = useRef<string | null>(link ? link.url : null);

  const normalized = toHttpUrl(url);
  const expiresAt =
    expiryMode === "forever"
      ? null
      : expiryMode === "d7"
        ? addDays(7)
        : expiryMode === "d30"
          ? addDays(30)
          : customDate || null;

  const duplicate = useMemo(() => {
    if (!normalized || !data) return null;
    const key = urlKey(normalized);
    const found = data.links.find((l) => l.id !== link?.id && urlKey(l.url) === key);
    if (!found) return null;
    const info = found.projectId === null ? undefined : projectIndex(data).get(found.projectId);
    return { link: found, where: projectPathLabel(info) };
  }, [normalized, data, link?.id]);

  const fetchTitle = async (target: string, force: boolean) => {
    fetchedFor.current = target;
    setTitleStatus("loading");
    try {
      const r = await api<{ title: string }>("/api/fetch-title", { body: { url: target } });
      if (!force && titleTouched.current) return setTitleStatus("idle");
      if (r.title) {
        setTitle(r.title);
        if (force) titleTouched.current = true;
        setTitleStatus("idle");
      } else setTitleStatus("failed");
    } catch {
      setTitleStatus("failed");
    }
  };

  // 填好链接后自动获取标题
  useEffect(() => {
    if (!normalized || titleTouched.current || fetchedFor.current === normalized) return;
    const timer = setTimeout(() => void fetchTitle(normalized, false), 400);
    return () => clearTimeout(timer);
  }, [normalized]);

  /** 粘贴整段分享文案时，自动拆出链接、标题和提取码 */
  const onUrlPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const [parsed] = parseShareText(text);
    if (!parsed || parsed.url === text.trim()) return;
    e.preventDefault();
    setUrl(parsed.url);
    const found = ["链接"];
    if (parsed.title && !title) {
      setTitle(parsed.title);
      titleTouched.current = true;
      found.push("标题");
    }
    if (parsed.accessCode && !accessCode) {
      setAccessCode(parsed.accessCode);
      found.push("提取码");
    }
    setRecognized(found.length > 1 ? found : []);
  };

  const save = async () => {
    if (!normalized) return setError("请输入正确的链接（以 http:// 或 https:// 开头）");
    if (expiryMode === "custom" && !customDate) return setError("请选择到期日期，或改成「长期有效」");
    setSaving(true);
    setError("");
    const body = {
      url: normalized,
      title: title.trim(),
      projectId,
      tags,
      accessCode: accessCode.trim(),
      expiresAt,
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

  const expiryHint =
    expiryMode === "forever"
      ? "链接不会过期"
      : expiresAt
        ? `${shortDate(expiresAt)}到期，到期前 ${EXPIRING_DAYS} 天提醒`
        : "选择到期日期";

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
      className="flex flex-col gap-[18px]"
    >
      {recognized.length > 0 && (
        <Banner
          tone="success"
          icon={<Check size={16} strokeWidth={2.4} className="shrink-0 text-accent-text" />}
          className="py-2 text-[13px]"
        >
          已从粘贴的分享文案中识别出{recognizedText(recognized)}
        </Banner>
      )}

      <Field
        label="链接"
        error={url && !normalized ? "链接格式不正确，需要以 http:// 或 https:// 开头" : undefined}
        hint={!url ? "也可以直接粘贴整段分享文案，会自动识别链接、标题和提取码" : undefined}
      >
        <span
          className={cx(
            "flex h-9 items-center gap-2 rounded-md border border-control bg-surface pr-1.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 hover:border-accent/60",
            normalized ? "pl-2" : "pl-2.5",
          )}
        >
          {normalized && <DocIcon url={normalized} size={22} />}
          <input
            data-autofocus={!link ? "" : undefined}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setRecognized([]);
            }}
            onPaste={onUrlPaste}
            placeholder="https://"
            inputMode="url"
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-icon"
          />
          {normalized && <Tag className="max-w-[45%] truncate">{platformLabel(normalized)}</Tag>}
        </span>
        {duplicate && (
          <span className="flex items-start gap-1.5 text-[13px] text-warn-text">
            <CircleAlert size={14} className="mt-[3px] shrink-0 text-warn" />
            {link
              ? `「${duplicate.link.title}」也是这个地址，在「${duplicate.where}」里`
              : `这个链接已经在「${duplicate.where}」里了（${duplicate.link.title}），仍然可以保存一份`}
          </span>
        )}
      </Field>

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
        <span className="flex gap-2">
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
            variant="text"
            size="lg"
            className="px-3"
            onClick={() => normalized && void fetchTitle(normalized, true)}
            disabled={!normalized || titleStatus === "loading"}
          >
            重新获取
          </Button>
        </span>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="项目">
          <ProjectPicker data={data} value={projectId} onChange={setProjectId} />
        </Field>
        <Field label="提取码 / 访问密码">
          <Input
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="没有可不填"
            className="font-mono placeholder:font-sans"
          />
        </Field>
      </div>

      <Field label="标签">
        <TagInput value={tags} onChange={setTags} suggestions={data.tags.map((t) => t.name)} />
      </Field>

      <Field as="div" label={<span id="expiry-label">有效期</span>}>
        <div role="radiogroup" aria-labelledby="expiry-label" className="flex flex-wrap items-center gap-2">
          {EXPIRY_OPTIONS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={expiryMode === mode}
              onClick={() => setExpiryMode(mode)}
              className={cx(
                "h-8 cursor-pointer rounded-md border px-3.5 transition-colors",
                expiryMode === mode
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-control bg-surface hover:border-accent/60",
              )}
            >
              {label}
            </button>
          ))}
          {expiryMode === "custom" && (
            <Input
              type="date"
              aria-label="到期日期"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-8 w-40"
            />
          )}
          <span className="text-[13px] text-faint">{expiryHint}</span>
        </div>
      </Field>

      <Field label="备注">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="可选，比如这个链接是谁发的、用来做什么"
          className="resize-y"
        />
      </Field>

      <div className="flex gap-6">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="size-4" />
          收藏
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4" />
          置顶
        </label>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <DialogFooter>
        {link && (
          <Button
            variant="dangerGhost"
            className="-ml-2 px-2"
            onClick={() => {
              onDone();
              void actions.remove([link.id]);
            }}
          >
            <Trash2 size={15} />
            删除
          </Button>
        )}
        <span className="flex-1 text-xs text-faint max-sm:hidden">{mod} + Enter 保存</span>
        <Button onClick={onDone}>取消</Button>
        <Button type="submit" variant="primary" loading={saving}>
          确定
        </Button>
      </DialogFooter>
    </form>
  );
}
