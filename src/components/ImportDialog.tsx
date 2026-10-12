"use client";

import { ClipboardPaste, FileUp } from "lucide-react";
import { useMemo, useState } from "react";
import { parseBookmarksHtml } from "@/lib/bookmarks";
import { api, refreshData, useAppData } from "@/lib/client";
import { parseShareText } from "@/lib/share-text";
import { toHttpUrl, urlKey } from "@/lib/url";
import { ProjectSelect, TagInput } from "./fields";
import { Button, cx, Dialog, Field, Input, PlatformIcon, Spinner, Textarea } from "./ui";
import { useUI } from "./ui-context";

interface Row {
  url: string;
  title: string;
  accessCode: string;
  folder: string;
  duplicate: boolean;
  include: boolean;
}

const PREVIEW_LIMIT = 300;

const PLACEHOLDER = `每行一个链接，链接前后可以写标题，例如：
需求文档 https://xxx.feishu.cn/docx/AbCd
https://docs.qq.com/sheet/DSkx

也可以直接粘贴网盘、腾讯文档的分享文案，或从 Excel 复制（标题、链接、提取码 三列）`;

export function ImportDialog({ open, onClose, initialText }: { open: boolean; onClose: () => void; initialText?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="批量导入" size="lg">
      <ImportForm initialText={initialText} onDone={onClose} />
    </Dialog>
  );
}

function ImportForm({ initialText, onDone }: { initialText?: string; onDone: () => void }) {
  const { data } = useAppData();
  const ui = useUI();
  const [mode, setMode] = useState<"text" | "bookmarks">("text");
  const [text, setText] = useState(initialText ?? "");
  const [fileName, setFileName] = useState("");
  const [fileItems, setFileItems] = useState<{ url: string; title: string; folder: string }[]>([]);
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
    setFileName(file.name);
    setEdits({});
    setFileItems(parseBookmarksHtml(await file.text()));
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
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-line p-0.5">
        {(
          [
            ["text", "粘贴文本", <ClipboardPaste key="t" size={15} />],
            ["bookmarks", "浏览器书签", <FileUp key="b" size={15} />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setEdits({});
            }}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px]",
              mode === key ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <Textarea
          data-autofocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdits({});
          }}
          rows={6}
          placeholder={PLACEHOLDER}
          className="font-mono text-[13px]"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-line p-4 text-[13px]">
          <p className="mb-2 text-muted">
            在浏览器的「书签管理器」里选择「导出书签」，得到一个 .html 文件，然后在这里选择它。
          </p>
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="text-[13px] file:mr-3 file:h-8 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-fg hover:file:bg-surface-2"
          />
          {fileName && (
            <p className="mt-2 text-muted">
              {fileName}：找到 {fileItems.length} 个链接
            </p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2 text-[13px]">
              <span>
                识别到 {rows.length} 个链接，已选 {selected.length} 个
                {rows.some((r) => r.duplicate) && (
                  <span className="text-muted">（已存在的默认不导入）</span>
                )}
              </span>
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => {
                  const all = selected.length !== rows.length;
                  setEdits((e) =>
                    Object.fromEntries(rows.map((_, i) => [i, { ...e[i], include: all }])),
                  );
                }}
              >
                {selected.length === rows.length ? "全不选" : "全选"}
              </button>
            </div>
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                <li key={i} className={cx("flex items-center gap-2 px-3 py-1.5", !row.include && "opacity-50")}>
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => edit(i, { include: e.target.checked })}
                    aria-label="导入这个链接"
                    className="size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <PlatformIcon url={row.url} size={22} />
                  <div className="min-w-0 flex-1">
                    <Input
                      value={row.title}
                      onChange={(e) => edit(i, { title: e.target.value })}
                      placeholder={fetchTitles ? "（自动获取标题）" : "（使用默认名称）"}
                      className="h-7 border-transparent bg-transparent px-1.5 hover:border-line"
                    />
                    <div className="truncate px-1.5 text-xs text-muted">
                      {row.url}
                      {row.folder && <span className="ml-2">📁 {row.folder}</span>}
                    </div>
                  </div>
                  {row.accessCode && (
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                      {row.accessCode}
                    </span>
                  )}
                  {row.duplicate && (
                    <span className="shrink-0 rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">已存在</span>
                  )}
                </li>
              ))}
              {rows.length > PREVIEW_LIMIT && (
                <li className="px-3 py-2 text-xs text-muted">还有 {rows.length - PREVIEW_LIMIT} 个未显示，也会一起导入</li>
              )}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="导入到">
              <ProjectSelect data={data} value={projectId} onChange={setProjectId} />
            </Field>
            <Field label="统一添加标签">
              <TagInput value={tags} onChange={setTags} suggestions={data.tags.map((t) => t.name)} placeholder="可选" />
            </Field>
          </div>

          <div className="space-y-2 text-[13px]">
            {mode === "bookmarks" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={folderAsTag}
                  onChange={(e) => setFolderAsTag(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                把书签所在的文件夹名作为标签
              </label>
            )}
            {missingTitles > 0 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fetchTitles}
                  onChange={(e) => setFetchTitles(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                自动获取 {Math.min(missingTitles, 100)} 个缺少的标题（需要一点时间；获取不到的会用默认名称）
              </label>
            )}
          </div>
        </>
      )}

      {mode === "text" && text.trim() && rows.length === 0 && (
        <p className="text-[13px] text-muted">没有识别到链接，请确认链接以 http:// 或 https:// 开头</p>
      )}

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

      <div className="-mx-5 -mb-4 flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        <Button onClick={onDone}>取消</Button>
        <Button variant="primary" disabled={busy || selected.length === 0} onClick={submit}>
          {busy && <Spinner size={14} />}
          {busy && fetchTitles && missingTitles > 0 ? "正在获取标题并导入…" : `导入 ${selected.length} 个`}
        </Button>
      </div>
    </div>
  );
}
