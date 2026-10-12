"use client";

import { useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
          });
          if (res.ok) {
            window.location.href = "/";
            return;
          }
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "登录失败");
        } catch {
          setError("网络错误，请重试");
        }
        setBusy(false);
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">密码</span>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !password}>
        {busy && <Spinner size={14} />}
        登录
      </Button>
    </form>
  );
}
