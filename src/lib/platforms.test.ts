import { describe, expect, it } from "vitest";
import { cleanFetchedTitle, detectKind, detectPlatform, docKind, fallbackTitle, platformLabel } from "./platforms";

describe("detectPlatform", () => {
  it("识别常见平台", () => {
    expect(detectPlatform("https://abc.feishu.cn/docx/AbCd").key).toBe("feishu");
    expect(detectPlatform("https://docs.qq.com/sheet/DSkx").key).toBe("tencent");
    expect(detectPlatform("https://pan.baidu.com/s/1abc?pwd=x1y2").key).toBe("baidupan");
    expect(detectPlatform("https://www.alipan.com/s/xyz").key).toBe("alipan");
    expect(detectPlatform("https://wwi.lanzoux.com/iAbc").key).toBe("lanzou");
    expect(detectPlatform("https://alidocs.dingtalk.com/i/nodes/x").key).toBe("dingtalk");
    expect(detectPlatform("https://example.com/a").key).toBe("web");
    expect(detectPlatform("not a url").key).toBe("web");
  });

  it("不会把相似域名误判", () => {
    expect(detectPlatform("https://notfeishu.cn/x").key).toBe("web");
  });
});

describe("detectKind", () => {
  it("按路径识别文档类型", () => {
    expect(detectKind("https://abc.feishu.cn/sheets/xyz")).toBe("表格");
    expect(detectKind("https://abc.feishu.cn/base/xyz")).toBe("多维表格");
    expect(detectKind("https://docs.qq.com/form/page/xyz")).toBe("收集表");
    expect(detectKind("https://docs.google.com/spreadsheets/d/1/edit")).toBe("表格");
    expect(detectKind("https://pan.baidu.com/s/1abc")).toBe("");
    expect(platformLabel("https://docs.qq.com/doc/DAbc")).toBe("腾讯文档 · 文档");
  });
});

describe("cleanFetchedTitle", () => {
  it("去掉平台后缀", () => {
    expect(cleanFetchedTitle("需求文档 v3 - 飞书云文档", "https://a.feishu.cn/docx/x")).toBe("需求文档 v3");
    expect(cleanFetchedTitle("项目排期表 - 腾讯文档", "https://docs.qq.com/sheet/x")).toBe("项目排期表");
    expect(cleanFetchedTitle("接口说明 · 语雀", "https://www.yuque.com/a/b")).toBe("接口说明");
  });

  it("没有意义的标题返回空", () => {
    expect(cleanFetchedTitle("飞书云文档", "https://a.feishu.cn/docx/x")).toBe("");
    expect(cleanFetchedTitle("登录 - 腾讯文档", "https://docs.qq.com/doc/x")).toBe("");
    expect(cleanFetchedTitle("百度网盘-免费云盘丨文件共享软件", "https://pan.baidu.com/s/1")).toBe("");
    expect(cleanFetchedTitle("  ", "https://example.com")).toBe("");
  });

  it("普通网页保留原标题", () => {
    expect(cleanFetchedTitle("Example Domain", "https://example.com")).toBe("Example Domain");
  });
});

describe("fallbackTitle", () => {
  it("已知平台用平台和类型命名", () => {
    expect(fallbackTitle("https://docs.qq.com/sheet/DAbc")).toBe("未命名表格（腾讯文档）");
    expect(fallbackTitle("https://pan.baidu.com/s/1abc")).toBe("未命名链接（百度网盘）");
  });
  it("普通网页用域名和路径", () => {
    expect(fallbackTitle("https://www.example.com/docs/a")).toBe("example.com/docs/a");
  });
});

describe("docKind", () => {
  it("按路径识别类型，识别不出时按平台类别", () => {
    expect(docKind("https://a.feishu.cn/sheets/x")).toBe("sheet");
    expect(docKind("https://a.feishu.cn/base/x")).toBe("base");
    expect(docKind("https://docs.qq.com/slide/x")).toBe("slides");
    expect(docKind("https://www.yuque.com/a/b")).toBe("doc");
    expect(docKind("https://pan.baidu.com/s/1")).toBe("disk");
    expect(docKind("https://www.figma.com/file/x")).toBe("design");
    expect(docKind("https://github.com/a/b")).toBe("code");
    expect(docKind("https://example.com")).toBe("web");
  });
});

describe("platformLabel", () => {
  it("显示平台和类型", () => {
    expect(platformLabel("https://a.feishu.cn/base/x")).toBe("飞书 · 多维表格");
    expect(platformLabel("https://www.figma.com/file/x")).toBe("Figma · 设计稿");
    expect(platformLabel("https://www.notion.so/abc")).toBe("Notion · 文档");
  });
  it("网盘只显示平台，普通网页显示域名", () => {
    expect(platformLabel("https://pan.baidu.com/s/1abc")).toBe("百度网盘");
    expect(platformLabel("https://www.example.com/a")).toBe("example.com");
  });
});
