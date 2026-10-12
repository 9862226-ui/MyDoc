"use client";

import { Check, Download, FileJson, Hash, Pencil, Settings, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api, refreshData, useAppData } from "@/lib/client";
import type { Tag } from "@/lib/types";
import { Button, IconButton, Input, Kbd, Spinner, useModKey } from "./ui";
import { useUI } from "./ui-context";

export function SettingsView() {
  const { data } = useAppData();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const mod = useModKey();

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setRestoring(true);
    try {
      let body: unknown;
      try {
        body = JSON.parse(await file.text());
      } catch {
        throw new Error("文件不是有效的 JSON");
      }
      const r = await api<{ imported: number; skipped: number }>("/api/backup", { body });
      await refreshData();
      ui.toast(`已恢复 ${r.imported} 个链接${r.skipped ? `，跳过 ${r.skipped} 个已存在的` : ""}`);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tagCount = (name: string) => data?.links.filter((l) => l.tags.includes(name)).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-16 md:p-8">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Settings size={20} className="text-muted" />
        导入导出与设置
      </h1>

      <Card title="导入" description="从其他地方把链接搬进来">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ui.importLinks()}>
            <Upload size={15} />
            批量导入链接 / 浏览器书签
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={restoring}>
            {restoring ? <Spinner size={14} /> : <FileJson size={15} />}
            从 JSON 备份恢复
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </div>
        <p className="mt-2 text-xs text-muted">恢复备份是合并操作：按名称合并分组和项目，已存在的链接会跳过，不会删除现有数据。</p>
      </Card>

      <Card title="导出" description="随时把数据带走">
        <div className="flex flex-wrap gap-2">
          <ExportButton format="json" label="JSON 备份（可恢复）" />
          <ExportButton format="csv" label="CSV 表格（Excel 可打开）" />
          <ExportButton format="html" label="浏览器书签" />
        </div>
        <p className="mt-2 text-xs text-muted">
          所有数据保存在服务器的 <code className="rounded bg-surface-2 px-1">data/mydoc.db</code>{" "}
          文件里，定期复制这个文件也是一种备份方式。
        </p>
      </Card>

      <Card title="标签" description="重命名为已有的标签名会把两个标签合并">
        {!data ? (
          <Spinner />
        ) : data.tags.length === 0 ? (
          <p className="text-[13px] text-muted">还没有标签。编辑链接时可以添加标签。</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.tags.map((t) => (
              <TagRow key={t.id} tag={t} count={tagCount(t.name)} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="快捷键">
        <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
          <Shortcut keys={[mod, "K"]} text="搜索并打开文档" />
          <Shortcut keys={["/"]} text="搜索" />
          <Shortcut keys={["N"]} text="添加链接" />
          <Shortcut keys={[mod, "V"]} text="在页面空白处粘贴，快速添加" />
          <Shortcut keys={[mod, "Enter"]} text="保存正在编辑的链接" />
          <Shortcut keys={["Shift", "点击"]} text="连续选择多个链接" />
        </ul>
      </Card>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ExportButton({ format, label }: { format: string; label: string }) {
  return (
    <a
      href={`/api/export?format=${format}`}
      download
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 font-medium hover:bg-surface-2"
    >
      <Download size={15} />
      {label}
    </a>
  );
}

function Shortcut({ keys, text }: { keys: string[]; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
      <span className="text-muted">{text}</span>
    </li>
  );
}

function TagRow({ tag, count }: { tag: Tag; count: number }) {
  const ui = useUI();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      await refreshData();
      ui.toast(message);
      setEditing(false);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const save = () => {
    if (name.trim() === tag.name) return setEditing(false);
    void run(() => api(`/api/tags/${tag.id}`, { method: "PATCH", body: { name } }), "已重命名");
  };

  return (
    <li className="flex h-11 items-center gap-2">
      <Hash size={14} className="shrink-0 text-muted" />
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            className="h-8 max-w-60"
            maxLength={30}
          />
          <IconButton label="保存" type="submit">
            <Check size={16} />
          </IconButton>
          <IconButton
            label="取消"
            onClick={() => {
              setName(tag.name);
              setEditing(false);
            }}
          >
            <X size={16} />
          </IconButton>
        </form>
      ) : (
        <>
          <span className="flex-1 truncate">{tag.name}</span>
          <span className="text-xs text-muted">{count} 个链接</span>
          <IconButton label="重命名" onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </IconButton>
          <IconButton
            label="删除标签"
            className="hover:text-danger"
            onClick={async () => {
              const ok = await ui.confirm({
                title: `删除标签「${tag.name}」？`,
                message: count ? `会从 ${count} 个链接上移除这个标签，链接本身不受影响。` : undefined,
                confirmText: "删除",
                danger: true,
              });
              if (ok) void run(() => api(`/api/tags/${tag.id}`, { method: "DELETE" }), "已删除标签");
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        </>
      )}
    </li>
  );
}
