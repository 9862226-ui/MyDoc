"use client";

import { Upload } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { parseBookmarksHtml } from "@/lib/bookmarks";
import { api, refreshData, useAppData } from "@/lib/client";
import { platformLabel } from "@/lib/platforms";
import { parseShareText } from "@/lib/share-text";
import { toHttpUrl, urlKey } from "@/lib/url";
import { ProjectPicker, TagInput } from "./fields";
import { Banner, Button, Checkbox, cx, Dialog, DialogFooter, DocIcon, Field, Spinner, Tag, Textarea } from "./ui";
import { useUI } from "./ui-context";

interface Row {
  url: string;
  title: string;
  accessCode: string;
  folder: string;
  duplicate: boolean;
  include: boolean;
}

type Mode = "text" | "bookmarks";

const PREVIEW_LIMIT = 300;

const PLACEHOLDER = `需求文档 https://xxx.feishu.cn/docx/AbCd
https://docs.qq.com/sheet/DSkx

我用夸克网盘分享了「宣传视频」，点击链接即可保存。
链接：https://pan.quark.cn/s/abc  提取码：V7pq`;

export function ImportDialog({
  open,
  onClose,
  initialText,
}: {
  open: boolean;
  onClose: () => void;
  initialText?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="批量导入" size="lg" bodyClassName="pb-0">
      <ImportForm initialText={initialText} onDone={onClose} />
    </Dialog>
  );
}

function ImportForm({ initialText, onDone }: { initialText?: string; onDone: () => void }) {
  const { data } = useAppData();
  const ui = useUI();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState(initialText ?? "");
  const [fileName, setFileName] = useState("");
  const [fileItems, setFileItems] = useState<{ url: string; title: string; folder: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [edits, setEdits] = useState<Record<number, Partial<Row>>>({});
  const [projectId, setProjectId] = useState<number | null>(ui.defaultProjectId);
  const [tags, setTags] = useState<string[]>([]);
  const [folderAsTag, setFolderAsTag] = useState(true);
  const [fetchTitles, setFetchTitles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const existing = useMemo(() => new Set((data?.links ?? []).map((l) => urlKey(l.url))), [data]);

  const baseRows: Row[] = useMemo(() => {
    const source =
      mode === "text"
        ? parseShareText(text).map((p) => ({ ...p, folder: "" }))
        : fileItems.map((b) => ({ ...b, accessCode: "" }));
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const item of source) {
      const url = toHttpUrl(item.url);
      if (!url) continue;
      const key = urlKey(url);
      const duplicate = existing.has(key) || seen.has(key);
      seen.add(key);
      rows.push({ ...item, url, duplicate, include: !duplicate });
    }
    return rows;
  }, [mode, text, fileItems, existing]);

  const rows = baseRows.map((r, i) => ({ ...r, ...edits[i] }));
  const selected = rows.filter((r) => r.include);
  const missingTitles = selected.filter((r) => !r.title.trim()).length;

  const edit = (i: number, patch: Partial<Row>) => setEdits((e) => ({ ...e, [i]: { ...e[i], ...patch } }));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setError("请选择浏览器导出的书签文件（.html）");
      return;
    }
    setError("");
    setFileName(file.name);
    setEdits({});
    setFileItems(parseBookmarksHtml(await file.text()));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ imported: number; skipped: number }>("/api/import", {
        body: {
          items: selected.map((row) => ({
            url: row.url,
            title: row.title.trim(),
            accessCode: row.accessCode.trim(),
            tags: mode === "bookmarks" && folderAsTag && row.folder ? [row.folder] : [],
          })),
          projectId,
          tags,
          fetchTitles: fetchTitles && missingTitles > 0,
        },
      });
      await refreshData();
      ui.toast(r.skipped ? `已导入 ${r.imported} 个，跳过 ${r.skipped} 个重复链接` : `已导入 ${r.imported} 个链接`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (!data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="导入方式" className="inline-flex self-start rounded-md bg-field p-0.5">
        {(
          [
            ["text", "粘贴文本"],
            ["bookmarks", "书签文件"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setEdits({});
              setError("");
            }}
            className={cx(
              "h-7 cursor-pointer rounded px-3.5 text-[13px] transition-colors",
              mode === key
                ? "bg-surface text-fg shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
                : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">
            每行一个链接，链接前后可以写标题；网盘、腾讯文档的分享文案和 Excel 复制的表格都能直接粘贴
          </span>
          <Textarea
            data-autofocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEdits({});
            }}
            rows={6}
            placeholder={PLACEHOLDER}
            className="resize-y px-3 py-2.5 font-mono text-[13px] leading-[21px] placeholder:font-sans"
          />
        </label>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex h-[168px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center text-muted transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-disabled bg-side hover:border-accent/60",
          )}
        >
          <Upload size={28} strokeWidth={1.8} className="text-accent-text" />
          {fileName ? (
            <span>
              {fileName}：找到 {fileItems.length} 个链接，<span className="text-accent-text">重新选择</span>
            </span>
          ) : (
            <span>
              把浏览器导出的书签文件（.html）拖到这里，或 <span className="text-accent-text">点击选择文件</span>
            </span>
          )}
          <span className="text-xs text-faint">Chrome、Edge、Safari、Firefox 都可以在书签管理器里导出</span>
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-side px-3 py-2 text-[13px]">
              <span>
                识别到 {rows.length} 个链接，已选 <b className="font-semibold">{selected.length}</b> 个
                {rows.some((r) => r.duplicate) && <span className="text-faint">（已存在的默认不导入）</span>}
              </span>
              <button
                type="button"
                className="shrink-0 cursor-pointer text-accent-text hover:underline"
                onClick={() => {
                  const all = selected.length !== rows.length;
                  setEdits((e) => Object.fromEntries(rows.map((_, i) => [i, { ...e[i], include: all }])));
                }}
              >
                {selected.length === rows.length ? "全不选" : "全选"}
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                <li
                  key={i}
                  className={cx(
                    "flex items-center gap-3 border-b border-line-soft px-3 py-2 last:border-b-0",
                    !row.include && "opacity-55",
                  )}
                >
                  <Checkbox
                    checked={row.include}
                    onChange={(e) => edit(i, { include: e.target.checked })}
                    aria-label={`导入 ${row.title || row.url}`}
                    className="size-4"
                  />
                  <DocIcon url={row.url} size={26} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <input
                      value={row.title}
                      onChange={(e) => edit(i, { title: e.target.value })}
                      placeholder={fetchTitles ? "（导入时自动获取标题）" : "（使用默认名称）"}
                      aria-label="标题"
                      className="-mx-1.5 h-6 rounded border border-transparent bg-transparent px-1.5 font-medium outline-none placeholder:font-normal placeholder:text-icon hover:border-control focus:border-accent"
                    />
                    <span className="truncate text-xs leading-[18px] text-faint" title={row.url}>
                      {platformLabel(row.url)} · {row.url}
                      {row.folder && <> · 文件夹「{row.folder}」</>}
                    </span>
                  </div>
                  {row.accessCode && (
                    <Tag tone="outline" className="max-sm:hidden">
                      提取码 {row.accessCode}
                    </Tag>
                  )}
                  <Tag tone={row.duplicate ? "warn" : "success"} className="px-2">
                    {row.duplicate ? "已存在" : "新链接"}
                  </Tag>
                </li>
              ))}
              {rows.length > PREVIEW_LIMIT && (
                <li className="px-3 py-2 text-xs text-faint">
                  还有 {rows.length - PREVIEW_LIMIT} 个没有显示，会按勾选状态一起导入
                </li>
              )}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="导入到">
              <ProjectPicker data={data} value={projectId} onChange={setProjectId} />
            </Field>
            <Field label="统一添加标签">
              <TagInput
                value={tags}
                onChange={setTags}
                suggestions={data.tags.map((t) => t.name)}
                placeholder="可选，输入后回车"
              />
            </Field>
          </div>

          {(mode === "bookmarks" || missingTitles > 0) && (
            <div className="flex flex-col gap-2 text-[13px] text-muted">
              {mode === "bookmarks" && (
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={folderAsTag}
                    onChange={(e) => setFolderAsTag(e.target.checked)}
                    className="size-4"
                  />
                  把书签所在的文件夹名作为标签
                </label>
              )}
              {missingTitles > 0 && (
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={fetchTitles}
                    onChange={(e) => setFetchTitles(e.target.checked)}
                    className="size-4"
                  />
                  没有标题的链接，自动从网页获取标题（{Math.min(missingTitles, 100)} 个，需要一点时间）
                </label>
              )}
            </div>
          )}
        </>
      )}

      {mode === "text" && text.trim() && rows.length === 0 && (
        <p className="text-[13px] text-faint">没有识别到链接，请确认链接以 http:// 或 https:// 开头</p>
      )}
      {mode === "bookmarks" && fileName && fileItems.length === 0 && (
        <p className="text-[13px] text-faint">这个文件里没有找到书签，请确认是浏览器导出的书签文件</p>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <DialogFooter>
        <Button onClick={onDone}>取消</Button>
        <Button variant="primary" loading={busy} disabled={selected.length === 0} onClick={submit}>
          {busy && fetchTitles && missingTitles > 0 ? "正在获取标题并导入…" : `导入 ${selected.length} 个`}
        </Button>
      </DialogFooter>
    </div>
  );
}
