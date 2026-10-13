"use client";

import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { S3Provider, SyncConfig, SyncResult, SyncState, SyncType } from "@/lib/backup-sync";
import { api } from "@/lib/client";
import { Card, LastResult, PillRadio } from "./settings-ui";
import { Button, Checkbox, Field, Input, Select } from "./ui";
import { useUI } from "./ui-context";

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AutoBackupCard() {
  const ui = useUI();
  const { data, mutate } = useSWR("/api/backups", (url: string) => api<{ backups: BackupFile[]; keep: number }>(url));
  const [busy, setBusy] = useState(false);

  const backupNow = async () => {
    setBusy(true);
    try {
      await api("/api/backups", { method: "POST" });
      await mutate();
      ui.toast("已备份");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="自动备份"
      description={`每天自动备份一次完整数据库，保留最近 ${data?.keep ?? 7} 份，存放在服务器的 data/backups 目录`}
    >
      {!data ? (
        <div className="skeleton my-3 h-10 rounded-md" />
      ) : data.backups.length === 0 ? (
        <p className="py-4 text-[13px] text-faint">还没有备份。服务启动后会自动备份一次，也可以现在手动备份。</p>
      ) : (
        <ul>
          {data.backups.map((b) => (
            <li key={b.name} className="flex items-center gap-4 border-b border-line-soft py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 tabular-nums">{formatTime(b.createdAt)}</span>
              <span className="text-[13px] text-faint tabular-nums">{formatSize(b.size)}</span>
              <a href={`/api/backups/${b.name}`} download className="text-accent-text hover:underline">
                下载
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button loading={busy} onClick={() => void backupNow()}>
          立即备份
        </Button>
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer text-accent-text">怎么用备份文件恢复？</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>停止 MyDoc 服务</li>
            <li>
              用备份文件替换 <code className="rounded bg-field px-1 font-mono">data/mydoc.db</code>，并删除同目录下的{" "}
              <code className="rounded bg-field px-1 font-mono">mydoc.db-wal</code> 和{" "}
              <code className="rounded bg-field px-1 font-mono">mydoc.db-shm</code>
            </li>
            <li>重新启动服务</li>
          </ol>
        </details>
      </div>
    </Card>
  );
}

const PROVIDERS: Record<S3Provider, { label: string; region: string; regionHint: string }> = {
  oss: {
    label: "阿里云 OSS",
    region: "cn-hangzhou",
    regionHint: "Bucket 概览页「地域」里的 ID，例如 cn-hangzhou、cn-beijing",
  },
  cos: { label: "腾讯云 COS", region: "ap-guangzhou", regionHint: "存储桶所在地域，例如 ap-guangzhou、ap-shanghai" },
  other: { label: "其他 S3 兼容服务", region: "us-east-1", regionHint: "不清楚就填 us-east-1" },
};

const KEEP_OPTIONS = [7, 30, 90];

/** 异地备份：每天的自动备份再传一份到 WebDAV 或对象存储 */
export function BackupSyncCard() {
  const ui = useUI();
  const { data, mutate } = useSWR("/api/settings/backup-sync", (url: string) =>
    api<{ config: SyncConfig; state: SyncState }>(url),
  );
  const [form, setForm] = useState<SyncConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.config);
  }, [data, form]);

  if (!form || !data) {
    return (
      <Card title="异地备份">
        <div className="skeleton my-3 h-40 rounded-md" />
      </Card>
    );
  }

  const set = <K extends keyof SyncConfig>(key: K, value: SyncConfig[K]) => setForm({ ...form, [key]: value });
  const provider = PROVIDERS[form.s3Provider];

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ config: SyncConfig; state: SyncState }>("/api/settings/backup-sync", {
        method: "PUT",
        body: form,
      });
      setForm(r.config);
      await mutate(r, { revalidate: false });
      ui.toast("已保存");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await api<{ result: SyncResult; config: SyncConfig; state: SyncState }>(
        "/api/settings/backup-sync/run",
        { body: form },
      );
      setForm(r.config);
      await mutate({ config: r.config, state: r.state }, { revalidate: false });
      await mutate();
      ui.toast(r.result.ok ? "备份已上传" : `上传失败：${r.result.message}`, { kind: r.result.ok ? "ok" : "error" });
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      title="异地备份"
      description="每天自动备份后，再把备份文件传一份到别的地方。服务器硬盘坏了、被误删或到期没续费，数据也不会丢。"
    >
      <form
        className="flex flex-col gap-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <Checkbox checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="size-4" />
          开启异地备份
        </label>

        <Field as="div" label="传到哪里">
          <PillRadio<SyncType>
            label="传到哪里"
            value={form.type}
            onChange={(v) => set("type", v)}
            options={[
              { value: "webdav", label: "WebDAV 网盘（坚果云等）" },
              { value: "s3", label: "对象存储（阿里云 OSS、腾讯云 COS 等）" },
            ]}
          />
        </Field>

        {form.type === "webdav" ? (
          <>
            <Field
              label="WebDAV 地址"
              hint="坚果云填 https://dav.jianguoyun.com/dav/ 加上文件夹名，例如 …/dav/MyDoc/，文件夹不存在会自动创建"
            >
              <Input
                value={form.webdavUrl}
                onChange={(e) => set("webdavUrl", e.target.value)}
                className="font-mono text-[13px]"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="账号">
                <Input
                  value={form.webdavUser}
                  onChange={(e) => set("webdavUser", e.target.value)}
                  placeholder="坚果云是登录邮箱"
                  autoComplete="off"
                />
              </Field>
              <Field label="密码">
                <Input
                  type="password"
                  value={form.webdavPassword}
                  onChange={(e) => set("webdavPassword", e.target.value)}
                  placeholder="坚果云要用应用密码"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <p className="-mt-2 text-xs leading-5 text-faint">
              坚果云的应用密码：网页版右上角「账户信息」›「安全选项」›「第三方应用管理」›「添加应用」。免费版每月上传
              1GB，够用很久。
            </p>
          </>
        ) : (
          <>
            <Field as="div" label="服务商">
              <PillRadio<S3Provider>
                label="服务商"
                value={form.s3Provider}
                onChange={(v) => setForm({ ...form, s3Provider: v, s3PathStyle: v === "other" && form.s3PathStyle })}
                options={(Object.keys(PROVIDERS) as S3Provider[]).map((p) => ({ value: p, label: PROVIDERS[p].label }))}
              />
            </Field>
            {form.s3Provider === "other" && (
              <Field
                label="服务地址（Endpoint）"
                hint="例如 https://s3.cn-east-1.qiniucs.com、http://192.168.1.10:9000"
              >
                <Input
                  value={form.s3Endpoint}
                  onChange={(e) => set("s3Endpoint", e.target.value)}
                  className="font-mono text-[13px]"
                />
              </Field>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="存储桶（Bucket）"
                hint={form.s3Provider === "cos" ? "腾讯云的名称带 APPID，例如 mydoc-1250000000" : undefined}
              >
                <Input value={form.s3Bucket} onChange={(e) => set("s3Bucket", e.target.value)} />
              </Field>
              <Field label="地域" hint={provider.regionHint}>
                <Input
                  value={form.s3Region}
                  onChange={(e) => set("s3Region", e.target.value)}
                  placeholder={provider.region}
                />
              </Field>
              <Field label="AccessKey ID">
                <Input
                  value={form.s3AccessKey}
                  onChange={(e) => set("s3AccessKey", e.target.value)}
                  autoComplete="off"
                  className="font-mono text-[13px]"
                />
              </Field>
              <Field label="AccessKey Secret">
                <Input
                  type="password"
                  value={form.s3SecretKey}
                  onChange={(e) => set("s3SecretKey", e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="存放目录">
                <Input
                  value={form.s3Prefix}
                  onChange={(e) => set("s3Prefix", e.target.value)}
                  placeholder="mydoc/"
                  className="font-mono text-[13px]"
                />
              </Field>
            </div>
            {form.s3Provider === "other" && (
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={form.s3PathStyle}
                  onChange={(e) => set("s3PathStyle", e.target.checked)}
                  className="size-4"
                />
                使用路径风格访问（MinIO 等自建服务勾选）
              </label>
            )}
            <p className="-mt-2 text-xs leading-5 text-faint">
              建议新建一个只能访问这个存储桶的子账号（阿里云 RAM、腾讯云 CAM），用它的 AccessKey，不要用主账号的。
            </p>
          </>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="远端保留">
            <Select value={form.keep} onChange={(e) => set("keep", Number(e.target.value))}>
              {[...new Set([...KEEP_OPTIONS, form.keep])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    最近 {n} 份
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={saving}>
            保存
          </Button>
          <Button loading={syncing} onClick={() => void syncNow()}>
            <CloudUpload size={15} />
            立即备份并上传
          </Button>
        </div>
        <LastResult label="上次上传" result={data.state.last} />
      </form>
    </Card>
  );
}
