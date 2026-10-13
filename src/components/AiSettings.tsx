"use client";

import { Info, ListRestart, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { AiConfig } from "@/lib/ai";
import { AI_PRESETS, AI_PROVIDERS, type AiProvider } from "@/lib/ai-presets";
import { api } from "@/lib/client";
import { AI_KEY, useAiSettings } from "./AiOrganize";
import { Card, PillRadio } from "./settings-ui";
import { Button, Checkbox, Field, Input } from "./ui";
import { useUI } from "./ui-context";

export function AiSection() {
  const ui = useUI();
  const { data, mutate } = useAiSettings();
  const [form, setForm] = useState<AiConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data.config);
  }, [data, form]);

  if (!form || !data) {
    return (
      <Card title="AI 模型">
        <div className="skeleton my-3 h-40 rounded-md" />
      </Card>
    );
  }

  const preset = AI_PRESETS[form.provider];
  const set = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => setForm({ ...form, [key]: value });

  const pickProvider = (p: AiProvider) => {
    if (p === form.provider) return;
    setForm({ ...form, provider: p, baseUrl: AI_PRESETS[p].baseUrl, model: AI_PRESETS[p].models[0] ?? "", apiKey: "" });
    setModels([]);
    setTestResult(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ config: AiConfig; ready: boolean }>(AI_KEY, { method: "PUT", body: form });
      setForm(r.config);
      await mutate(r, { revalidate: false });
      ui.toast(r.ready ? "已保存" : "已保存，还差 API Key 或模型没填");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api<{ reply: string; ms: number }>(`${AI_KEY}/test`, { body: form });
      setTestResult({ ok: true, text: `连接成功，${(r.ms / 1000).toFixed(1)} 秒收到回复：「${r.reply}」` });
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const r = await api<{ models: string[] }>(`${AI_KEY}/models`, { body: form });
      setModels(r.models);
      ui.toast(r.models.length ? `找到 ${r.models.length} 个模型，点输入框选择` : "服务商没有返回模型列表");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setLoadingModels(false);
    }
  };

  const suggestions = [...new Set([...preset.models, ...models])];

  return (
    <>
      <Card
        title="AI 模型"
        description="接入大模型后，AI 可以把链接放进合适的项目、加上标签。支持 DeepSeek、通义千问、智谱、Kimi、豆包等兼容 OpenAI 接口的模型。"
      >
        <form
          className="flex flex-col gap-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field as="div" label="服务商">
            <PillRadio
              label="服务商"
              value={form.provider}
              onChange={pickProvider}
              options={AI_PROVIDERS.map((p) => ({ value: p, label: AI_PRESETS[p].label }))}
            />
          </Field>

          <Field label="接口地址">
            <Input
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://…/v1"
              className="font-mono text-[13px] placeholder:font-sans"
            />
          </Field>

          {!preset.noKey && (
            <Field label="API Key" below={<p className="text-xs leading-5 text-faint">{preset.keyHelp}</p>}>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder="sk-……"
                autoComplete="new-password"
                className="font-mono text-[13px] placeholder:font-sans"
              />
            </Field>
          )}

          <Field
            as="div"
            label={<span id="ai-model-label">模型</span>}
            extra={
              <button
                type="button"
                disabled={loadingModels}
                onClick={() => void fetchModels()}
                className="flex cursor-pointer items-center gap-1 text-[13px] font-normal text-accent-text hover:underline disabled:opacity-50"
              >
                <ListRestart size={14} />
                {loadingModels ? "获取中…" : "获取模型列表"}
              </button>
            }
            hint={preset.noKey ? preset.keyHelp : undefined}
          >
            <Input
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              list="ai-models"
              aria-labelledby="ai-model-label"
              placeholder="填写模型名，或点右边的「获取模型列表」"
              className="font-mono text-[13px] placeholder:font-sans"
            />
            <datalist id="ai-models">
              {suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <div className="flex flex-col gap-2.5">
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={form.autoClassify}
                onChange={(e) => set("autoClassify", e.target.checked)}
                className="mt-[3px] size-4"
              />
              <span>
                添加链接时自动归类
                <span className="block text-[13px] text-faint">
                  添加时没选项目（放进收件箱）的链接，让 AI 放进合适的项目、加上标签；不满意可以马上撤销
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={form.allowNewTags}
                onChange={(e) => set("allowNewTags", e.target.checked)}
                className="mt-[3px] size-4"
              />
              <span>
                允许 AI 新建标签
                <span className="block text-[13px] text-faint">关闭后只会使用已有的标签</span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              保存
            </Button>
            <Button loading={testing} onClick={() => void test()}>
              <Zap size={14} />
              测试连接
            </Button>
          </div>
          {testResult && (
            <p className={testResult.ok ? "text-[13px] text-success-text" : "text-[13px] text-danger-text"}>
              {testResult.text}
            </p>
          )}
        </form>
      </Card>

      <section className="flex items-start gap-2.5 rounded-lg bg-surface px-5 py-4 text-[13px] text-muted md:px-6">
        <Info size={16} className="mt-[3px] shrink-0 text-icon" />
        <span>
          归类时会把链接的标题、网址、备注，以及你的项目名称和标签名称发送给所选的模型服务商；提取码不会发送。
          收件箱里的链接可以点页面右上角的「AI 整理」批量归类，确认后才会移动。归类一个链接的费用通常不到一分钱。
        </span>
      </section>
    </>
  );
}
