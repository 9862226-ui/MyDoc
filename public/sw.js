// MyDoc 的 Service Worker：只为了让手机浏览器能「安装」MyDoc（安装后才能出现在分享菜单里），不做离线缓存
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
