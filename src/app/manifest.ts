import type { MetadataRoute } from "next";

/** 手机浏览器「添加到主屏幕」时使用 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyDoc 文档链接管理",
    short_name: "MyDoc",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
