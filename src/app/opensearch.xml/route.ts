/** 浏览器「网站搜索」的描述文件，Chrome、Firefox 打开过 MyDoc 后能识别 */
export function GET(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>MyDoc</ShortName>
  <Description>搜索 MyDoc 里收藏的文档链接</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="32" height="32" type="image/svg+xml">${origin}/icon.svg</Image>
  <Url type="text/html" method="get" template="${origin}/search?q={searchTerms}"/>
</OpenSearchDescription>
`;
  return new Response(xml, { headers: { "content-type": "application/opensearchdescription+xml; charset=utf-8" } });
}
