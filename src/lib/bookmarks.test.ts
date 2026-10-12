import { describe, expect, it } from "vitest";
import { parseBookmarksHtml } from "./bookmarks";

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://a.feishu.cn/docx/1" ADD_DATE="1">需求 &amp; 设计</A>
        <DT><H3>客户A</H3>
        <DL><p>
            <DT><A HREF="https://docs.qq.com/sheet/2">报价单</A>
            <DT><A HREF="javascript:void(0)">小工具</A>
        </DL><p>
        <DT><A HREF="https://example.com/">Example</A>
    </DL><p>
</DL><p>`;

describe("parseBookmarksHtml", () => {
  it("解析链接和所在文件夹，跳过非 http 链接", () => {
    expect(parseBookmarksHtml(html)).toEqual([
      { url: "https://a.feishu.cn/docx/1", title: "需求 & 设计", folder: "书签栏" },
      { url: "https://docs.qq.com/sheet/2", title: "报价单", folder: "客户A" },
      { url: "https://example.com/", title: "Example", folder: "书签栏" },
    ]);
  });
});
