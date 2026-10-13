import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyDoc · 文档链接管理",
  description: "收集、分组、快速打开共享文档链接",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "MyDoc", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1015" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh font-sans text-sm antialiased">
        {/* 让浏览器把 MyDoc 识别为可以在地址栏搜索的网站 */}
        <link rel="search" type="application/opensearchdescription+xml" title="MyDoc" href="/opensearch.xml" />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
