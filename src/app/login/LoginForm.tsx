"use client";

import { useState } from "react";
import { Button, Checkbox, Input } from "@/components/ui";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password, remember }),
          });
          if (res.ok) {
            window.location.href = "/";
            return;
          }
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "登录失败，请重试");
        } catch {
          setError("网络错误，请重试");
        }
        setBusy(false);
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">访问密码</span>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          aria-invalid={!!error}
          aria-describedby={error ? "login-error" : undefined}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 px-3"
        />
        {error && (
          <span id="login-error" role="alert" className="text-[13px] text-danger-text">
            {error}
          </span>
        )}
      </label>
      <label className="flex cursor-pointer items-center gap-2 self-start text-muted">
        <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4" />
        30 天内免登录
      </label>
      <Button type="submit" variant="primary" className="h-10 w-full" loading={busy} disabled={!password}>
        登录
      </Button>
      <p className="text-[13px] text-faint">密码在服务器的环境变量 APP_PASSWORD 中设置</p>
    </form>
  );
}
