import { describe, expect, it } from "vitest";
import { extractTitleFromHtml, isPrivateAddress } from "./fetch-title";

describe("isPrivateAddress", () => {
  it("拦截内网和回环地址", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("放行公网地址", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("extractTitleFromHtml", () => {
  it("优先使用 og:title", () => {
    expect(
      extractTitleFromHtml('<title>T</title><meta property="og:title" content="需求文档 &amp; 附件">'),
    ).toBe("需求文档 & 附件");
  });
  it("没有 og:title 时用 <title>", () => {
    expect(extractTitleFromHtml("<html><title>\n  排期表 - 腾讯文档\n</title></html>")).toBe("排期表 - 腾讯文档");
  });
});
