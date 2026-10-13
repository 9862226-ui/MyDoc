"use client";

import { Info, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { api } from "@/lib/client";
import type { Channel, NotifyConfig, NotifyState } from "@/lib/notify";
import { Card, LastResult, PillRadio } from "./settings-ui";
import { Button, Checkbox, Field, Input, Select } from "./ui";
import { useUI } from "./ui-context";

interface ChannelInfo {
  label: string;
  /** 「推送地址」输入框的名称和示例 */
  field: string;
  placeholder: string;
  /** 怎么获取地址 */
  help: ReactNode;
  /** 支持「加签」 */
  secret?: boolean;
}

export const CHANNEL_INFO: Record<Channel, ChannelInfo> = {
  wecom: {
    label: "企业微信",
    field: "群机器人 Webhook 地址",
    placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
    help: "在企业微信群里点右上角「…」›「添加群机器人」›「新创建一个机器人」，复制 Webhook 地址。个人也可以注册企业微信，只拉自己进群。",
  },
  dingtalk: {
    label: "钉钉",
    field: "群机器人 Webhook 地址",
    placeholder: "https://oapi.dingtalk.com/robot/send?access_token=…",
    help: "在钉钉群里点「群设置」›「机器人」›「添加机器人」›「自定义」。安全设置选「自定义关键词」填 MyDoc，或者选「加签」并把密钥填到下面。",
    secret: true,
  },
  feishu: {
    label: "飞书",
    field: "群机器人 Webhook 地址",
    placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/…",
    help: "在飞书群里点「设置」›「群机器人」›「添加机器人」›「自定义机器人」。如果开启了「签名校验」，把密钥填到下面。",
    secret: true,
  },
  serverchan: {
    label: "微信（Server酱）",
    field: "SendKey",
    placeholder: "SCT…… 或 sctp……",
    help: "打开 sct.ftqq.com 用微信扫码登录，在「SendKey」页面复制。消息会通过服务号推送到你的微信。",
  },
  bark: {
    label: "iPhone（Bark）",
    field: "Bark 推送地址",
    placeholder: "https://api.day.app/你的Key",
    help: "在 iPhone 上安装 Bark App，打开后复制首页上的推送地址（只要到 Key 为止的部分）。",
  },
  webhook: {
    label: "自定义 Webhook",
    field: "Webhook 地址",
    placeholder: "https://…",
    help: "MyDoc 会 POST 一段 JSON：{ title, text, markdown, url }。可以接 n8n、Home Assistant 或你自己的服务。",
  },
};

const CHANNEL_ORDER: Channel[] = ["wecom", "dingtalk", "feishu", "serverchan", "bark", "webhook"];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function NotifySection() {
  const ui = useUI();
  const { data, mutate } = useSWR("/api/settings/notify", (url: string) =>
    api<{ config: NotifyConfig; state: NotifyState }>(url),
  );
  const [form, setForm] = useState<NotifyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.config);
  }, [data, form]);

  if (!form || !data) {
    return (
      <Card title="提醒推送">
        <div className="skeleton my-3 h-40 rounded-md" />
      </Card>
    );
  }

  const info = CHANNEL_INFO[form.channel];
  const set = <K extends keyof NotifyConfig>(key: K, value: NotifyConfig[K]) => setForm({ ...form, [key]: value });

  /** 时区和访问地址取当前浏览器的 */
  const current = (): NotifyConfig => ({
    ...form,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    siteUrl: window.location.origin,
  });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ config: NotifyConfig; state: NotifyState }>("/api/settings/notify", {
        method: "PUT",
        body: current(),
      });
      setForm(r.config);
      await mutate(r, { revalidate: false });
      ui.toast(r.config.enabled ? `已保存，每天 ${r.config.hour}:00 推送` : "已保存");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await api("/api/settings/notify/test", { body: current() });
      ui.toast("已发送测试消息，去看看收到没有");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Card title="提醒推送" description="每天定时把快到期、已过期的事项推送到你的手机，不用打开 MyDoc 也不会错过。">
        <form
          className="flex flex-col gap-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <Checkbox checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="size-4" />
            开启每日推送
          </label>

          <Field as="div" label="推送到">
            <PillRadio
              label="推送到"
              value={form.channel}
              onChange={(v) =>
                setForm({ ...form, channel: v, target: v === form.channel ? form.target : "", secret: "" })
              }
              options={CHANNEL_ORDER.map((c) => ({ value: c, label: CHANNEL_INFO[c].label }))}
            />
          </Field>

          <Field label={info.field} below={<p className="text-xs leading-5 text-faint">{info.help}</p>}>
            <Input
              value={form.target}
              onChange={(e) => set("target", e.target.value)}
              placeholder={info.placeholder}
              className="font-mono text-[13px] placeholder:font-sans"
            />
          </Field>

          {info.secret && (
            <Field label="加签密钥（可选）" hint="机器人安全设置里选了「加签」或「签名校验」时填写">
              <Input
                value={form.secret}
                onChange={(e) => set("secret", e.target.value)}
                placeholder="SEC……"
                className="font-mono text-[13px] placeholder:font-sans"
              />
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="每天推送时间">
              <Select value={form.hour} onChange={(e) => set("hour", Number(e.target.value))}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={form.includeLinks}
              onChange={(e) => set("includeLinks", e.target.checked)}
              className="size-4"
            />
            同时提醒 7 天内到期的分享链接
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              保存
            </Button>
            <Button loading={testing} disabled={!form.target.trim()} onClick={() => void test()}>
              <Send size={14} />
              发送测试消息
            </Button>
          </div>
          <LastResult label="上次推送" result={data.state.last} />
        </form>
      </Card>

      <section className="flex items-start gap-2.5 rounded-lg bg-surface px-5 py-4 text-[13px] text-muted md:px-6">
        <Info size={16} className="mt-[3px] shrink-0 text-icon" />
        <span>
          每天到了设定的时间，如果有需要处理的提醒事项（已过期，或进入了提前提醒的天数），就推送一条汇总；没有就不打扰。
          已过期的事项每天都会提醒，直到你在「提醒事项」里点「已续期」或「完成」。
        </span>
      </section>
    </>
  );
}
