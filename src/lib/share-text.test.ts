import { describe, expect, it } from "vitest";
import { parseShareText } from "./share-text";

describe("parseShareText", () => {
  it("百度网盘旧版分享文案", () => {
    const r = parseShareText(
      "链接: https://pan.baidu.com/s/1AbCdEf?pwd=x1y2 提取码: x1y2 复制这段内容后打开百度网盘手机App，操作更方便哦",
    );
    expect(r).toEqual([{ url: "https://pan.baidu.com/s/1AbCdEf?pwd=x1y2", title: "", accessCode: "x1y2" }]);
  });

  it("百度网盘新版分享文案（多行）", () => {
    const r = parseShareText(
      "通过网盘分享的文件：设计素材.zip\n链接: https://pan.baidu.com/s/1AbC?pwd=ab12 提取码: ab12\n--来自百度网盘超级会员v3的分享",
    );
    expect(r).toEqual([{ url: "https://pan.baidu.com/s/1AbC?pwd=ab12", title: "设计素材.zip", accessCode: "ab12" }]);
  });

  it("夸克网盘：标题在前、提取码在后", () => {
    const r = parseShareText(
      "我用夸克网盘分享了「项目资料」，点击链接即可保存。打开「夸克APP」，无需下载在线播放视频。\n链接：https://pan.quark.cn/s/abc123\n提取码：K9ab",
    );
    expect(r).toEqual([{ url: "https://pan.quark.cn/s/abc123", title: "项目资料", accessCode: "K9ab" }]);
  });

  it("腾讯文档：【腾讯文档】标题 + 下一行链接", () => {
    const r = parseShareText("【腾讯文档】2026 Q4 排期表\nhttps://docs.qq.com/sheet/DSkxYz");
    expect(r).toEqual([{ url: "https://docs.qq.com/sheet/DSkxYz", title: "2026 Q4 排期表", accessCode: "" }]);
  });

  it("一行一个链接，带或不带标题", () => {
    const r = parseShareText(
      "需求文档 https://a.feishu.cn/docx/AAA\nhttps://a.feishu.cn/sheets/BBB\n\n接口说明：https://www.yuque.com/x/y",
    );
    expect(r.map((x) => [x.title, x.url])).toEqual([
      ["需求文档", "https://a.feishu.cn/docx/AAA"],
      ["", "https://a.feishu.cn/sheets/BBB"],
      ["接口说明", "https://www.yuque.com/x/y"],
    ]);
  });

  it("链接后面紧跟中文标点", () => {
    const r = parseShareText("看这个https://example.com/a，很重要");
    expect(r[0].url).toBe("https://example.com/a");
  });

  it("Markdown 链接", () => {
    const r = parseShareText("- [设计稿](https://www.figma.com/file/abc)");
    expect(r).toEqual([{ url: "https://www.figma.com/file/abc", title: "设计稿", accessCode: "" }]);
  });

  it("Excel 复制的 Tab 分隔行", () => {
    const r = parseShareText("合同扫描件\thttps://pan.baidu.com/s/1xyz\tq1w2\n报价单\thttps://docs.qq.com/sheet/D1\t");
    expect(r).toEqual([
      { url: "https://pan.baidu.com/s/1xyz", title: "合同扫描件", accessCode: "q1w2" },
      { url: "https://docs.qq.com/sheet/D1", title: "报价单", accessCode: "" },
    ]);
  });

  it("没有链接时返回空", () => {
    expect(parseShareText("随便一段文字\n提取码: abcd")).toEqual([]);
  });
});
