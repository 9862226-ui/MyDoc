import { route } from "@/lib/api";
import { getFavicon, normalizeHost } from "@/lib/favicon";

export const dynamic = "force-dynamic";

/** 网站图标：GET /api/favicon?host=example.com，没有图标时返回 204 */
export const GET = route(async (req) => {
  const host = normalizeHost(new URL(req.url).searchParams.get("host") ?? "");
  const icon = host ? await getFavicon(host) : null;
  const headers = { "cache-control": "private, max-age=604800" };
  if (!icon) return new Response(null, { status: 204, headers });
  return new Response(Buffer.from(icon.bytes), {
    headers: {
      ...headers,
      "content-type": icon.type,
      "x-content-type-options": "nosniff",
      // SVG 图标里可能带脚本，禁止它在本站执行
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
