import type { MetadataRoute } from "next";

/** 手机浏览器「添加到主屏幕 / 安装应用」时使用；安装后在其他 App 里「分享」可以选 MyDoc（安卓） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MyDoc 文档链接管理",
    short_name: "MyDoc",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: { action: "/add", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
