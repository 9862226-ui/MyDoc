import MarkdownIt from "markdown-it";
import { REF_LABEL, refHref, refRegExp, type RefType } from "./refs";

/**
 * 把 Markdown 渲染成 HTML。不允许原始 HTML（html: false，所有尖括号都会转义），
 * 链接只允许 http(s) / mailto 等安全协议（markdown-it 自带检查），所以可以直接放进页面。
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// 链接在新标签页打开
const defaultLink = md.renderer.rules.link_open ?? ((tokens, i, opts, _env, self) => self.renderToken(tokens, i, opts));
md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
  tokens[i].attrSet("target", "_blank");
  tokens[i].attrSet("rel", "noopener noreferrer");
  return defaultLink(tokens, i, opts, env, self);
};

// 正文里的 #标签 高亮（标签可以分层：#项目/知识库）
const TAG_RE = /(^|[\s(（，,。；;])#([\p{L}\p{N}_\-/]+)/gu;
md.renderer.rules.text = (tokens, i) =>
  md.utils.escapeHtml(tokens[i].content).replace(TAG_RE, '$1<span class="md-tag">#$2</span>');

// 待办清单：- [ ] / - [x]，按出现顺序编号，点击时按编号改原文
md.core.ruler.after("inline", "task-list", (state) => {
  let n = 0;
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "inline" || tokens[i - 1].type !== "paragraph_open" || tokens[i - 2].type !== "list_item_open")
      continue;
    const m = t.content.match(/^\[([ xX])\](\s|$)/);
    const first = t.children?.[0];
    if (!m || !first || first.type !== "text") continue;
    const checked = m[1] !== " ";
    first.content = first.content.replace(/^\[[ xX]\]\s?/, "");
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" class="md-task" data-task="${n++}"${checked ? " checked" : ""}> `;
    t.children!.unshift(box);
    tokens[i - 2].attrJoin("class", checked ? "md-task-item md-task-done" : "md-task-item");
  }
});

// 内容引用：[[log:12|标题]] 显示成一个可以点的引用；链接类型在新标签页打开
const REF_STICKY = refRegExp("y");
md.inline.ruler.before("link", "ref", (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5b) return false;
  REF_STICKY.lastIndex = state.pos;
  const m = REF_STICKY.exec(state.src);
  if (!m) return false;
  if (!silent) {
    const type = m[1] as RefType;
    const id = Number(m[2]);
    const label = (m[3] ?? "").trim() || REF_LABEL[type];
    const external = type === "link" ? ' target="_blank" rel="noopener noreferrer"' : "";
    const token = state.push("html_inline", "", 0);
    token.content =
      `<a class="md-ref md-ref-${type}" href="${refHref(type, id)}" data-ref="${type}:${id}" title="${REF_LABEL[type]}"${external}>` +
      `${md.utils.escapeHtml(label)}</a>`;
  }
  state.pos += m[0].length;
  return true;
});

export function renderMarkdown(src: string): string {
  return md.render(src);
}
