import { describe, expect, it } from "vitest";
import { safeDecode, toHttpUrl, urlKey } from "./url";

describe("toHttpUrl", () => {
  it("补全协议", () => {
    expect(toHttpUrl("docs.qq.com/doc/abc")).toBe("https://docs.qq.com/doc/abc");
    expect(toHttpUrl("  https://example.com/a  ")).toBe("https://example.com/a");
  });
  it("拒绝非 http 链接", () => {
    expect(toHttpUrl("javascript:alert(1)")).toBeNull();
    expect(toHttpUrl("ftp://example.com")).toBeNull();
    expect(toHttpUrl("hello")).toBeNull();
    expect(toHttpUrl("")).toBeNull();
  });
});

describe("urlKey", () => {
  it("忽略协议、www、末尾斜杠和来源参数", () => {
    expect(urlKey("https://www.Example.com/a/?from=from_copylink")).toBe(urlKey("http://example.com/a"));
    expect(urlKey("https://a.feishu.cn/docx/X?utm_source=x")).toBe(urlKey("https://a.feishu.cn/docx/X"));
  });
  it("保留有意义的参数", () => {
    expect(urlKey("https://pan.baidu.com/s/1?pwd=ab12")).not.toBe(urlKey("https://pan.baidu.com/s/1?pwd=zz99"));
  });
});

describe("safeDecode", () => {
  it("解码合法编码，不合法时原样返回", () => {
    expect(safeDecode("%E8%AE%BE%E8%AE%A1")).toBe("设计");
    expect(safeDecode("%E5")).toBe("%E5");
  });
});
