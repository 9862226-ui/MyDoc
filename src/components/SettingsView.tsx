"use client";

import { Bookmark, Copy, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, copyText, refreshData, useAppData } from "@/lib/client";
import type { Tag } from "@/lib/types";
import { AutoBackupCard, BackupSyncCard } from "./BackupSettings";
import { ShortcutList } from "./HelpDialog";
import { McpSection } from "./McpSettings";
import { NotifySection } from "./NotifySettings";
import { Card, Row } from "./settings-ui";
import { Button, cx, Input, Kbd, useModKey } from "./ui";
import { useUI } from "./ui-context";

type Section = "data" | "backup" | "notify" | "bookmarklet" | "mcp" | "tags" | "keys" | "account";

const SECTIONS: [Section, string][] = [
  ["data", "导入与导出"],
  ["backup", "备份"],
  ["notify", "提醒推送"],
  ["bookmarklet", "浏览器"],
  ["mcp", "AI 助手（MCP）"],
  ["tags", "标签管理"],
  ["keys", "快捷键"],
  ["account", "账号与安全"],
];

const isSection = (s: string): s is Section => SECTIONS.some(([k]) => k === s);

export function SettingsView() {
  const [section, setSection] = useState<Section>("data");

  // 地址里的 #tags 之类可以直接打开对应分区
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (isSection(hash)) setSection(hash);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const pick = (s: Section) => {
    setSection(s);
    history.replaceState(null, "", `#${s}`);
  };

  return (
    <div className="min-h-full bg-field dark:bg-bg">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4 p-4 md:flex-row md:items-start md:gap-6 md:p-6">
        <nav
          aria-label="设置分区"
          className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 md:mx-0 md:w-[200px] md:flex-col md:gap-0.5 md:rounded-lg md:bg-surface md:p-2"
        >
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={section === key ? "page" : undefined}
              onClick={() => pick(key)}
              className={cx(
                "flex h-[38px] shrink-0 cursor-pointer items-center rounded-md px-3 text-left whitespace-nowrap transition-colors",
                section === key
                  ? "bg-accent-soft font-medium text-accent-text"
                  : "text-fg hover:bg-hover max-md:bg-surface",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {section === "data" && <DataSection />}
          {section === "backup" && (
            <>
              <AutoBackupCard />
              <BackupSyncCard />
            </>
          )}
          {section === "notify" && <NotifySection />}
          {section === "bookmarklet" && (
            <>
              <BookmarkletSection />
              <SearchEngineCard />
            </>
          )}
          {section === "mcp" && <McpSection />}
          {section === "tags" && <TagsSection />}
          {section === "keys" && (
            <Card title="快捷键">
              <ShortcutList />
            </Card>
          )}
          {section === "account" && <AccountSection />}
        </div>
      </div>
    </div>
  );
}

function ExportLink({ format }: { format: string }) {
  return (
    <a
      href={`/api/export?format=${format}`}
      download
      className="inline-flex h-8 shrink-0 items-center rounded-md border border-control bg-surface px-4 hover:bg-hover"
    >
      导出
    </a>
  );
}

function DataSection() {
  const { data } = useAppData();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setRestoring(true);
    try {
      let body: unknown;
      try {
        body = JSON.parse(await file.text());
      } catch {
        throw new Error("文件不是有效的 JSON 备份");
      }
      const r = await api<{ imported: number; skipped: number; reminders: number }>("/api/backup", { body });
      await refreshData();
      ui.toast(
        `已恢复 ${r.imported} 个链接${r.reminders ? `、${r.reminders} 个提醒` : ""}${r.skipped ? `，跳过 ${r.skipped} 个已存在的链接` : ""}`,
      );
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Card title="导出数据" description="随时把数据带走，三种格式任选">
        <Row title="JSON 备份" description="包含全部分组、项目、链接、标签和提醒，可以用来恢复">
          <ExportLink format="json" />
        </Row>
        <Row title="CSV 表格" description="用 Excel 或 WPS 打开，方便查看和整理">
          <ExportLink format="csv" />
        </Row>
        <Row title="浏览器书签" description="按「分组 / 项目」建好文件夹，可以导入 Chrome、Edge、Safari">
          <ExportLink format="html" />
        </Row>
      </Card>
      <Card title="导入数据" description="从别的地方把链接搬进来">
        <Row title="批量导入链接或浏览器书签" description="粘贴多行文本、分享文案、Excel 表格，或选择书签文件">
          <Button variant="primary" onClick={() => ui.importLinks()}>
            批量导入
          </Button>
        </Row>
        <Row title="从 JSON 备份恢复" description="按名称合并分组和项目，已有的链接会跳过，不会删除现有数据">
          <Button loading={restoring} onClick={() => fileRef.current?.click()}>
            选择文件
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </Row>
      </Card>
      <section className="flex items-start gap-2.5 rounded-lg bg-surface px-5 py-4 text-[13px] text-muted md:px-6">
        <Info size={16} className="mt-[3px] shrink-0 text-icon" />
        <span>
          所有数据保存在服务器的 <code className="rounded bg-field px-1 font-mono">data/mydoc.db</code>{" "}
          文件里，自动备份就是这个文件的完整副本。
          {data && `当前共有 ${data.links.length} 个链接、${data.projects.length} 个项目、${data.tags.length} 个标签。`}
        </span>
      </section>
    </>
  );
}

function TagsSection() {
  const { data } = useAppData();
  const count = (name: string) =>
    data?.links.filter((l) => l.tags.some((t) => t.toLowerCase() === name.toLowerCase())).length ?? 0;
  return (
    <Card title="标签管理" description="重命名成已有的标签名，两个标签会合并">
      {!data ? null : data.tags.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-faint">还没有标签。添加或编辑链接时可以给它加标签。</p>
      ) : (
        <ul>
          {data.tags.map((t) => (
            <TagRow key={t.id} tag={t} count={count(t.name)} />
          ))}
        </ul>
      )}
    </Card>
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
    if (!name.trim() || name.trim() === tag.name) {
      setName(tag.name);
      return setEditing(false);
    }
    void run(() => api(`/api/tags/${tag.id}`, { method: "PATCH", body: { name } }), "已重命名");
  };

  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-line-soft last:border-b-0">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            aria-label="新的标签名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setName(tag.name);
                setEditing(false);
              }
            }}
            className="h-8 max-w-60"
            maxLength={30}
          />
          <Button type="submit" variant="primary" size="sm">
            保存
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setName(tag.name);
              setEditing(false);
            }}
          >
            取消
          </Button>
        </form>
      ) : (
        <>
          <span className="max-w-[50%] truncate rounded bg-field px-2 text-[13px] leading-[22px]"># {tag.name}</span>
          <span className="flex-1 text-[13px] text-faint">{count} 个链接</span>
          <Button variant="text" size="sm" onClick={() => setEditing(true)}>
            重命名
          </Button>
          <Button
            variant="dangerGhost"
            size="sm"
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
            删除
          </Button>
        </>
      )}
    </li>
  );
}

function AccountSection() {
  const [busy, setBusy] = useState(false);
  return (
    <Card title="账号与安全">
      <Row title="登录密码" description="在服务器的环境变量 APP_PASSWORD 里设置，修改后重启服务生效" />
      <Row
        title="登录保持"
        description="登录时勾选「30 天内免登录」，30 天内不用再输入密码；不勾选时关闭浏览器就会退出。同一来源 15 分钟内输错 10 次密码会被暂时锁定"
      />
      <Row title="退出登录" description="退出后需要重新输入密码">
        <Button
          loading={busy}
          className="border-danger/40 text-danger-text hover:bg-danger-soft"
          onClick={async () => {
            setBusy(true);
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          退出登录
        </Button>
      </Row>
    </Card>
  );
}

/** 书签栏上的「收藏到 MyDoc」按钮：在任意网页点一下，弹出添加窗口 */
export function bookmarkletCode(origin: string): string {
  return (
    "javascript:(function(){" +
    `var u='${origin}/add?url='+encodeURIComponent(location.href)` +
    "+'&title='+encodeURIComponent(document.title)" +
    "+'&note='+encodeURIComponent(String(window.getSelection()||'').slice(0,500));" +
    "var w=window.open(u,'mydoc','width=640,height=800,resizable=yes,scrollbars=yes');" +
    "if(!w)location.href=u;})();"
  );
}

/** 地址栏搜索：把 MyDoc 加成浏览器的「网站搜索」 */
function SearchEngineCard() {
  const ui = useUI();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/search?q=%s`), []);
  const copy = async (text: string) => {
    const ok = await copyText(text);
    ui.toast(ok ? "已复制" : "复制失败", { kind: ok ? "ok" : "error" });
  };
  return (
    <Card
      title="在地址栏搜索"
      description="设置好后，在浏览器地址栏输入 md 加空格再输入关键词（支持拼音首字母），回车就能搜 MyDoc；只有一个结果时直接打开。"
    >
      <Row title="搜索网址" description={<code className="font-mono break-all text-muted">{url || " "}</code>}>
        <Button disabled={!url} onClick={() => void copy(url)}>
          <Copy size={15} />
          复制网址
        </Button>
      </Row>
      <div className="flex flex-col gap-4 py-3 text-muted">
        <div>
          <div className="mb-1 font-medium text-fg">Chrome、Edge</div>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>
              打开设置 › 搜索引擎 ›「管理搜索引擎和网站搜索」（Edge 是 设置 › 隐私、搜索和服务 › 地址栏和搜索 ›
              管理搜索引擎）
            </li>
            <li>在「网站搜索」旁边点「添加」：名称填 MyDoc，快捷字词填 md，网址粘贴上面复制的网址</li>
            <li>
              以后在地址栏输入 <Kbd>md</Kbd> <Kbd>空格</Kbd> 再输入关键词，例如 md pqb
            </li>
          </ol>
        </div>
        <div>
          <div className="mb-1 font-medium text-fg">Firefox</div>
          <p>新建一个书签，网址粘贴上面复制的网址，「关键词」填 md，用法相同。</p>
        </div>
      </div>
    </Card>
  );
}

function BookmarkletSection() {
  const ui = useUI();
  const mod = useModKey();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const c = bookmarkletCode(window.location.origin);
    setCode(c);
    // React 不允许直接写 javascript: 链接，这里手动设置
    linkRef.current?.setAttribute("href", c);
  }, []);

  return (
    <Card
      title="浏览器收藏按钮"
      description="把下面的按钮放到浏览器的书签栏。看到有用的网页时点一下，就会弹出添加窗口，网址和标题都已填好；网页上选中的文字会作为备注。"
    >
      <div className="flex flex-col items-start gap-5 py-3">
        <a
          ref={linkRef}
          href="#"
          draggable
          onClick={(e) => {
            e.preventDefault();
            ui.toast("请把按钮拖到书签栏，在别的网页上点它", { kind: "info" });
          }}
          className="inline-flex h-10 cursor-grab items-center gap-2 rounded-md border-2 border-dashed border-accent/50 bg-accent-soft px-4 font-medium text-accent-text active:cursor-grabbing"
        >
          <Bookmark size={16} />
          收藏到 MyDoc
        </a>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted">
          <li>
            显示书签栏：Chrome、Edge 按 <Kbd>{mod}</Kbd> <Kbd>Shift</Kbd> <Kbd>B</Kbd>
          </li>
          <li>用鼠标把上面的「收藏到 MyDoc」按钮拖到书签栏上</li>
          <li>打开任意网页，点书签栏上的「收藏到 MyDoc」</li>
        </ol>
      </div>
      <Row
        title="拖不动？"
        description="复制代码后，在书签栏上右键「添加网页 / 添加书签」，名称填「收藏到 MyDoc」，网址粘贴刚才复制的代码"
      >
        <Button
          disabled={!code}
          onClick={async () => {
            const ok = await copyText(code);
            ui.toast(ok ? "已复制，去新建书签粘贴到网址里" : "复制失败", { kind: ok ? "ok" : "error" });
          }}
        >
          <Copy size={15} />
          复制代码
        </Button>
      </Row>
      <p className="mt-3 text-[13px] text-faint">
        手机浏览器不方便用书签按钮：在手机上复制网址，打开 MyDoc 点右下角的「+」粘贴即可。
      </p>
    </Card>
  );
}
