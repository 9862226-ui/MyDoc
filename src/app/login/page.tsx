import { redirect } from "next/navigation";
import { isAuthenticated, isPasswordConfigured } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "登录 · MyDoc" };

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-fg">
            M
          </span>
          <div>
            <h1 className="text-lg font-semibold">MyDoc</h1>
            <p className="text-xs text-muted">共享文档链接管理</p>
          </div>
        </div>
        {isPasswordConfigured() ? (
          <LoginForm />
        ) : (
          <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-warn">
            还没有设置登录密码。请在服务器上设置环境变量 <code>APP_PASSWORD</code> 后重启服务。
          </p>
        )}
      </div>
    </div>
  );
}
