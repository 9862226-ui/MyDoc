/** 大模型服务商预设：都使用 OpenAI 兼容的 Chat Completions 接口 */

export type AiProvider = "deepseek" | "qwen" | "zhipu" | "kimi" | "doubao" | "siliconflow" | "ollama" | "custom";

export interface AiPreset {
  label: string;
  baseUrl: string;
  /** 推荐的模型（确认过的才填），其他的用「获取模型列表」 */
  models: string[];
  /** 在哪里拿 API Key */
  keyHelp: string;
  /** 本地模型不需要 API Key */
  noKey?: boolean;
}

export const AI_PRESETS: Record<AiProvider, AiPreset> = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    keyHelp: "在 platform.deepseek.com ›「API keys」创建。归类用 deepseek-flash 就够了，又快又便宜。",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [],
    keyHelp: "在阿里云百炼控制台 ›「API-KEY」创建。",
  },
  zhipu: {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [],
    keyHelp: "在 open.bigmodel.cn ›「API Keys」创建。",
  },
  kimi: {
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [],
    keyHelp: "在 platform.moonshot.cn ›「API Key 管理」创建。",
  },
  doubao: {
    label: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [],
    keyHelp: "在火山方舟控制台 ›「API Key 管理」创建；模型填控制台里的模型 ID 或推理接入点 ID。",
  },
  siliconflow: {
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [],
    keyHelp: "在 cloud.siliconflow.cn ›「API 密钥」创建，可以用 DeepSeek、千问等开源模型。",
  },
  ollama: {
    label: "本地 Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: [],
    keyHelp: "在服务器上运行 Ollama 并下载模型（例如 ollama pull qwen3），不需要 API Key。",
    noKey: true,
  },
  custom: {
    label: "其他（OpenAI 兼容）",
    baseUrl: "",
    models: [],
    keyHelp: "填写服务商提供的 OpenAI 兼容接口地址（通常以 /v1 结尾）和 API Key。",
  },
};

export const AI_PROVIDERS = Object.keys(AI_PRESETS) as AiProvider[];
