"use client";

import { Copy, Info, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { api, copyText } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Card, Row } from "./settings-ui";
import { Button, IconButton, Input, Tabs } from "./ui";
import { useUI } from "./ui-context";

interface ApiToken {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type Client = "claude-code" | "json" | "claude-desktop";

const CLIENTS: { value: Client; label: string }[] = [
  { value: "claude-code", label: "Claude Code" },
  { value: "json", label: "Cursor 等" },
  { value: "claude-desktop", label: "Claude 桌面版" },
];

/** 各个 AI 助手的配置写法 */
export function clientConfig(client: Client, url: string, token: string): string {
  const auth = `Bearer ${token}`;
  switch (client) {
    case "claude-code":
      return `claude mcp add --transport http mydoc ${url} --header "Authorization: ${auth}"`;
    case "json":
      return JSON.stringify(
        { mcpServers: { mydoc: { type: "http", url, headers: { Authorization: auth } } } },
        null,
        2,
      );
    case "claude-desktop":
      return JSON.stringify(
        {
          mcpServers: {
            mydoc: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${MYDOC_AUTH}"],
              env: { MYDOC_AUTH: auth },
            },
          },
        },
        null,
        2,
      );
  }
}

const CLIENT_HINTS: Record<Client, ReactNode> = {
  "claude-code": "在终端里运行这条命令即可。",
  json: "Cursor、Cherry Studio 等客户端：粘贴到 MCP 配置里（Cursor 是 ~/.cursor/mcp.json）。有的客户端把 type 写成 streamableHttp，按它的说明改一下。",
  "claude-desktop":
    "在「设置 › 开发者 › 编辑配置」打开 claude_desktop_config.json，粘贴后重启 Claude。需要电脑上装有 Node.js。",
};

function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const ui = useUI();
  return (
    <Button
      size="sm"
      onClick={async () => {
        const ok = await copyText(text);
        ui.toast(ok ? "已复制" : "复制失败", { kind: ok ? "ok" : "error" });
      }}
    >
      <Copy size={14} />
      {label}
    </Button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-field px-3 py-2.5 pr-20 font-mono text-[12px] leading-5 whitespace-pre-wrap break-all">
        {code}
      </pre>
      <span className="absolute top-1.5 right-1.5">
        <CopyButton text={code} />
      </span>
    </div>
  );
}

export function McpSection() {
  const ui = useUI();
  const { data: tokens, mutate } = useSWR("/api/tokens", (url: string) => api<ApiToken[]>(url));
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [client, setClient] = useState<Client>("claude-code");

  useEffect(() => setUrl(`${window.location.origin}/api/mcp`), []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ token: string; info: ApiToken }>("/api/tokens", { body: { name: name || "AI 助手" } });
      await mutate();
      setCreated({ token: r.token, name: r.info.name });
      setCreating(false);
      setName("");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: ApiToken) => {
    const ok = await ui.confirm({
      title: `删除令牌「${t.name}」？`,
      message: "使用这个令牌的 AI 助手将无法再访问 MyDoc。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/tokens/${t.id}`, { method: "DELETE" });
      await mutate();
      ui.toast("已删除");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <>
      <Card
        title="接入 AI 助手（MCP）"
        description="让 Claude、Cursor、Cherry Studio 等支持 MCP 的 AI 助手直接搜索、收藏和整理你的链接，查看提醒事项。"
      >
        <Row title="服务地址" description={<code className="font-mono break-all text-muted">{url || " "}</code>}>
          <CopyButton text={url} />
        </Row>
        <Row title="访问令牌" description="AI 助手用令牌代替密码访问。每个助手建一个，不用了随时删除。">
          {!creating && !created && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              创建令牌
            </Button>
          )}
        </Row>

        {creating && (
          <form
            className="flex flex-wrap items-center gap-2 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="给令牌起个名字，例如 Claude、Cursor"
              className="max-w-xs flex-1"
            />
            <Button type="submit" variant="primary" loading={busy}>
              创建
            </Button>
            <Button onClick={() => setCreating(false)}>取消</Button>
          </form>
        )}

        {created && (
          <div className="mb-3 flex flex-col gap-3 rounded-lg border border-success/40 bg-success-soft p-4">
            <div>
              <div className="font-medium text-success-text">令牌「{created.name}」已创建</div>
              <div className="text-[13px] text-muted">
                只显示这一次，关掉后就看不到了。请按下面的方法配置到 AI 助手里。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-surface px-3 py-1.5 font-mono text-[13px] break-all">
                {created.token}
              </code>
              <CopyButton text={created.token} label="复制令牌" />
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
              <Tabs
                label="AI 助手"
                value={client}
                onChange={setClient}
                items={CLIENTS}
                className="overflow-x-auto border-b border-line"
              />
              <p className="text-[13px] text-muted">{CLIENT_HINTS[client]}</p>
              <CodeBlock code={clientConfig(client, url, created.token)} />
            </div>
            <div>
              <Button onClick={() => setCreated(null)}>我已保存好</Button>
            </div>
          </div>
        )}

        {tokens && tokens.length > 0 && (
          <ul className="border-t border-line-soft">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                <KeyRound size={16} className="shrink-0 text-icon" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {t.name} <span className="font-mono text-[12px] text-faint">{t.prefix}…</span>
                  </div>
                  <div className="text-xs text-faint">
                    创建于 {relativeTime(t.createdAt)} ·{" "}
                    {t.lastUsedAt ? `${relativeTime(t.lastUsedAt)}用过` : "还没用过"}
                  </div>
                </div>
                <IconButton
                  label="删除令牌"
                  size="sm"
                  className="hover:text-danger-text"
                  onClick={() => void remove(t)}
                >
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="AI 助手能做什么">
        <ul className="flex list-disc flex-col gap-1 py-2 pl-5 text-muted">
          <li>搜索链接，查看项目、标签</li>
          <li>收藏链接：自动获取标题，能识别分享文案里的提取码，已收藏过的不会重复添加</li>
          <li>修改、移动、删除链接（删除的进回收站，30 天内可以恢复），新建项目</li>
          <li>查看、添加、续期提醒事项</li>
        </ul>
        <p className="pt-1 pb-2 text-[13px] text-faint">
          可以这样说：「帮我找一下官网改版的排期表」「把这个链接收藏到
          工作/官网改版，打上设计标签」「最近有哪些账号快到期了？」
        </p>
      </Card>

      <section className="flex items-start gap-2.5 rounded-lg bg-surface px-5 py-4 text-[13px] text-muted md:px-6">
        <Info size={16} className="mt-[3px] shrink-0 text-icon" />
        <span>
          令牌和登录密码一样重要，不要发给别人。AI 助手不在这台服务器上时，请给 MyDoc 配置
          HTTPS，否则令牌会在网络上明文传输。
        </span>
      </section>
    </>
  );
}
