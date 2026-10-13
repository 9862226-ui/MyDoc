/** 把 fetch 的网络错误翻译成看得懂的提示 */
export function networkErrorMessage(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err.name === "TimeoutError" || err.name === "AbortError") return "连接超时";
  const code = err.cause?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "找不到这个地址的域名，请检查地址";
  if (code === "ECONNREFUSED") return "连接被拒绝，请检查地址和端口";
  if (code === "ECONNRESET") return "连接被中断";
  if (code.startsWith("ERR_TLS") || code.includes("CERT")) return "HTTPS 证书有问题";
  return `连接失败（${err.cause?.message ?? err.message}）`;
}
