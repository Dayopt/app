/**
 * MCP Streamable HTTP transport（canonical public path）
 *
 * token endpoint と同じ filesystem route 方式で、Production / Preview のどの host でも
 * rewrite に依存せず `/mcp` を解決する。Preview は branch origin の `/mcp` が transport
 * になる（resource URI は origin のまま）。host 分離は handler 冒頭の
 * `rejectUnexpectedOAuthHost` が担い、resource surface を持たない host（production の
 * app host など）からの到達は 404 になる。production の `mcp.dayopt.app` では
 * vercel.json の rewrite（`/` と `/mcp`）より filesystem route が優先されるが、
 * 同一 handler に到達するため挙動は変わらない。
 */
export const dynamic = 'force-dynamic';

export { DELETE, GET, POST } from '@/app/api/mcp/route';
