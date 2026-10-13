"use client";

import { useEffect } from "react";

/** 注册 Service Worker，让 MyDoc 可以安装到手机主屏幕 */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
