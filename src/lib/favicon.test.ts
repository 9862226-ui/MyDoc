import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) },
}));

import { extractIconHrefs, fetchFavicon, normalizeHost, sniffImageType } from "./favicon";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);

describe("normalizeHost", () => {
  it("只接受普通域名", () => {
    expect(normalizeHost("Example.COM")).toBe("example.com");
    expect(normalizeHost("a.b.example.co.uk.")).toBe("a.b.example.co.uk");
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("evil.com/../x")).toBeNull();
    expect(normalizeHost("a b.com")).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("按文件头识别图片", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(ICO)).toBe("image/x-icon");
    expect(sniffImageType(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="x"></svg>'))).toBe(
      "image/svg+xml",
    );
    expect(sniffImageType(new TextEncoder().encode("<!doctype html><html>登录</html>"))).toBeNull();
  });
});

describe("extractIconHrefs", () => {
  it("标准图标优先，合适的尺寸排前面", () => {
    const html = `
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="icon" sizes="16x16" href="/16.png">
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel="icon" type="image/png" sizes="32x32" href="/32.png">
      <link rel="stylesheet" href="/a.css">
      <link rel="icon" href="data:image/png;base64,xx">`;
    expect(extractIconHrefs(html)).toEqual(["/32.png", "/16.png", "/favicon.ico", "/apple.png"]);
  });
});

describe("fetchFavicon", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (routes: Record<string, () => Response>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        const key = String(url);
        return routes[key]?.() ?? new Response("not found", { status: 404 });
      }),
    );

  it("用网页里声明的图标", async () => {
    respond({
      "https://example.com/": () =>
        new Response('<link rel="icon" href="/static/logo.png">', { headers: { "content-type": "text/html" } }),
      "https://example.com/static/logo.png": () => new Response(PNG),
    });
    expect((await fetchFavicon("example.com"))?.type).toBe("image/png");
  });

  it("网页里没有时用 /favicon.ico，返回的不是图片则视为没有", async () => {
    respond({
      "https://a.com/": () => new Response("<title>a</title>", { headers: { "content-type": "text/html" } }),
      "https://a.com/favicon.ico": () => new Response(ICO),
    });
    expect((await fetchFavicon("a.com"))?.type).toBe("image/x-icon");

    respond({
      "https://b.com/": () => new Response("<title>b</title>", { headers: { "content-type": "text/html" } }),
      "https://b.com/favicon.ico": () =>
        new Response("<html>login</html>", { headers: { "content-type": "text/html" } }),
    });
    expect(await fetchFavicon("b.com")).toBeNull();
  });
});
