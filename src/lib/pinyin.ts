import { pinyin } from "pinyin-pro";

const cache = new Map<string, string>();
const MAX_CACHE = 20000;
const HAS_HAN = /\p{Script=Han}/u;

/**
 * 中文转成不带声调的拼音音节，用空格分开，例如「排期表」→「pai qi biao」；没有中文时返回空字符串。
 * 每个汉字对应一个音节（查不到读音的字记为「_」），这样搜索时能标出是哪几个字对上了。
 */
export function syllables(text: string): string {
  if (!HAS_HAN.test(text)) return "";
  let py = cache.get(text);
  if (py === undefined) {
    py = pinyin(text, { toneType: "none", type: "array", nonZh: "removed" })
      .map((s) => s.toLowerCase().replace(/[^a-z]/g, "") || "_")
      .join(" ");
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(text, py);
  }
  return py;
}

/** 多段文字（标题、标签……）的拼音，段与段之间用「 | 」隔开，匹配时不会跨段 */
export function pinyinIndex(...texts: string[]): string | undefined {
  const parts = texts.map(syllables).filter(Boolean);
  return parts.length ? parts.join(" | ") : undefined;
}
