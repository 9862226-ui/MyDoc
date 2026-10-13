import { redirect } from "next/navigation";
import { DocIcon, Logo } from "@/components/icons";
import { isAuthenticated, isPasswordConfigured } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "登录 · MyDoc" };

/** 左侧品牌区里的白色标志 */
function WhiteLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#FFFFFF" />
      <rect x="11" y="7" width="13" height="16" rx="2.5" fill="#3370FF" opacity="0.35" />
      <path
        d="M8 11.5A2.5 2.5 0 0 1 10.5 9h7.2l3.3 3.3v9.2a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 8 21.5z"
        fill="#3370FF"
      />
      <path d="M11 16.5h7M11 19.5h4.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 品牌区的两张示意卡片（固定浅色，不跟随深色模式） */
function BrandCards() {
  return (
    <div aria-hidden className="relative h-[300px] max-w-[460px] text-[#1F2329]">
      <div className="absolute top-6 left-0 w-[300px] -rotate-4 rounded-[10px] bg-white p-4 shadow-[0_12px_32px_rgb(15_30_80/0.25)]">
        <div className="flex items-center gap-2.5">
          <DocIcon kind="sheet" size={28} />
          <span className="font-medium">官网改版排期表</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-px border border-[#E5E6EB] bg-[#E5E6EB]">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={i < 4 ? "h-3 bg-[#D9F2E3]" : "h-3 bg-white"} />
          ))}
        </div>
        <div className="mt-2.5 text-xs text-[#6E7480]">飞书 · 表格 · 工作 / 官网改版</div>
      </div>
      <div className="absolute top-[120px] left-[150px] w-[290px] rotate-3 rounded-[10px] bg-white p-4 shadow-[0_12px_32px_rgb(15_30_80/0.25)]">
        <div className="flex items-center gap-2.5">
          <DocIcon kind="disk" size={28} />
          <span className="font-medium">合同扫描件</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded border border-[#DEE0E3] px-1.5 font-mono text-xs leading-5">提取码 8s2k</span>
          <span className="rounded bg-[#FFF3E8] px-1.5 text-xs leading-[22px] text-[#C25700]">3 天后到期</span>
        </div>
        <div className="mt-2.5 text-xs text-[#6E7480]">阿里云盘 · 客户A / 合同与报价</div>
      </div>
    </div>
  );
}

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return (
    <div className="flex min-h-dvh">
      <section
        aria-label="产品介绍"
        className="hidden flex-[1_1_520px] flex-col justify-between gap-12 overflow-hidden bg-[#3370FF] px-16 py-14 text-white lg:flex"
      >
        <div className="flex items-center gap-2.5">
          <WhiteLogo />
          <span className="text-lg font-semibold">MyDoc</span>
        </div>
        <div className="flex flex-col gap-7">
          <BrandCards />
          <div>
            <h2 className="text-[32px] leading-[44px] font-semibold">所有共享文档，一处收好</h2>
            <p className="mt-2.5 text-base leading-[26px] text-white/85">
              飞书、腾讯文档、网盘的分享链接，按项目归类，需要时一秒找到并打开
            </p>
          </div>
        </div>
        <p className="text-[13px] text-white/70">部署在你自己的服务器上，数据只保存在你手里</p>
      </section>

      <section aria-label="登录" className="flex flex-[1_1_440px] items-center justify-center px-6 py-12">
        <div className="flex w-[360px] max-w-full flex-col gap-5">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Logo size={32} />
            <span className="text-lg font-semibold">MyDoc</span>
          </div>
          <div>
            <h1 className="text-2xl leading-[34px] font-semibold">登录 MyDoc</h1>
            <p className="mt-1 text-muted">输入访问密码进入你的文档链接库</p>
          </div>
          {isPasswordConfigured() ? (
            <LoginForm />
          ) : (
            <p role="alert" className="rounded-md bg-warn-soft px-3.5 py-2.5 leading-relaxed text-warn-text">
              还没有设置登录密码。请在服务器上设置环境变量 <code className="font-mono">APP_PASSWORD</code> 后重启服务。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
