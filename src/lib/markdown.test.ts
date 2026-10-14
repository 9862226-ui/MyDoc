import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { codeOp, enterOp, indentOp, linePrefixOp, linkOp, plainText, toggleTask, wrapOp, type EditOp } from "./md-edit";

const apply = (text: string, op: EditOp | null) =>
  op ? text.slice(0, op.start) + op.insert + text.slice(op.end) : text;

describe("编辑操作", () => {
  it("加粗：包住选中的字，再点一次去掉；没选中时插入占位", () => {
    expect(apply("你好世界", wrapOp("你好世界", 2, 4, "**", "**", "加粗"))).toBe("你好**世界**");
    expect(apply("你好**世界**", wrapOp("你好**世界**", 4, 6, "**", "**", "加粗"))).toBe("你好世界");
    const op = wrapOp("", 0, 0, "**", "**", "加粗");
    expect(op.insert).toBe("**加粗**");
    expect([op.selStart, op.selEnd]).toEqual([2, 4]);
  });

  it("列表、编号、待办、引用：整行加前缀，再点一次去掉，切换时替换", () => {
    const t = "第一行\n第二行";
    expect(apply(t, linePrefixOp(t, 0, t.length, "ul"))).toBe("- 第一行\n- 第二行");
    expect(apply(t, linePrefixOp(t, 0, t.length, "ol"))).toBe("1. 第一行\n2. 第二行");
    expect(apply("- 第一行", linePrefixOp("- 第一行", 0, 0, "ul"))).toBe("第一行");
    // 空行点「待办」「标题」是加上前缀
    expect(apply("", linePrefixOp("", 0, 0, "task"))).toBe("- [ ] ");
    expect(apply("a\n", linePrefixOp("a\n", 2, 2, "h2"))).toBe("a\n## ");
    expect(apply("- 第一行", linePrefixOp("- 第一行", 0, 0, "task"))).toBe("- [ ] 第一行");
    expect(apply("1. 第一行", linePrefixOp("1. 第一行", 0, 0, "quote"))).toBe("> 第一行");
  });

  it("回车接着写列表：编号加一，待办接着是待办，空项结束列表", () => {
    expect(apply("1. 写接口", enterOp("1. 写接口", 7))).toBe("1. 写接口\n2. ");
    expect(apply("- [x] 完成", enterOp("- [x] 完成", 8))).toBe("- [x] 完成\n- [ ] ");
    expect(apply("  - 子项", enterOp("  - 子项", 6))).toBe("  - 子项\n  - ");
    expect(apply("1. a\n2. ", enterOp("1. a\n2. ", 8))).toBe("1. a\n\n");
    expect(enterOp("普通文字", 4)).toBeNull();
  });

  it("Tab 缩进列表项，Shift+Tab 取消；普通单行不处理", () => {
    expect(apply("- a", indentOp("- a", 3, 3, false))).toBe("  - a");
    expect(apply("  - a", indentOp("  - a", 5, 5, true))).toBe("- a");
    expect(indentOp("普通", 2, 2, false)).toBeNull();
  });

  it("代码和链接", () => {
    expect(apply("a\nb", codeOp("a\nb", 0, 3))).toBe("```\na\nb\n```");
    expect(apply("npm", codeOp("npm", 0, 3))).toBe("`npm`");
    expect(apply("文档", linkOp("文档", 0, 2))).toBe("[文档](https://)");
  });

  it("打勾：按顺序数待办，代码块里的不算", () => {
    const t = "- [ ] 一\n```\n- [ ] 代码\n```\n1. [x] 二\n> - [ ] 三";
    expect(toggleTask(t, 0)).toContain("- [x] 一");
    expect(toggleTask(t, 1)).toContain("1. [ ] 二");
    expect(toggleTask(t, 2)).toContain("> - [x] 三");
    expect(toggleTask(t, 1)).toContain("- [ ] 代码");
  });

  it("去掉标记变成纯文字", () => {
    expect(plainText("## 标题\n- [x] **完成**接口 [文档](https://a.b)\n```\ncode\n```")).toBe("标题 完成接口 文档");
  });
});

describe("渲染", () => {
  it("不允许 HTML 和危险链接", () => {
    const html = renderMarkdown("<script>alert(1)</script> <img src=x onerror=alert(1)> [点我](javascript:alert(1))");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
  });

  it("待办渲染成勾选框，编号和 toggleTask 一致", () => {
    const html = renderMarkdown("- [ ] 一\n- [x] 二\n\n1. [ ] 三");
    expect(html.match(/data-task="(\d)"/g)).toEqual(['data-task="0"', 'data-task="1"', 'data-task="2"']);
    expect(html).toContain('data-task="1" checked');
    expect(html).not.toContain("[ ]");
  });

  it("#标签高亮，链接在新窗口打开，网址自动变链接", () => {
    const html = renderMarkdown("今天 #知识库/测试 完成 https://example.com");
    expect(html).toContain('<span class="md-tag">#知识库/测试</span>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com"');
  });
});

describe("打勾（真实内容）", () => {
  it("标题下面的待办", () => {
    const t = "## 周会结论\n- [ ] 确认上线时间\n- [ ] 整理测试问题集\n负责人：张三 #官网改版 **周五前**";
    expect(toggleTask(t, 0)).toContain("- [x] 确认上线时间");
  });
});
