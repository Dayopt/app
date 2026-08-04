import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { serializeUntrustedMcpData } from './untrusted-data-serialization';

// v2 (#1576): review.get の破壊的契約変更（tagId nullable 化、isUncategorized /
// isArchived の必須field追加、basis.rowFilter literal の active_tagged_start_in_period
// → active_start_in_period 変更）を機械可読に伝えるための bump。読み取り系 tool の
// 出力封筒にのみ使う。mutation receipt (plans.create 等) の schemaVersion は DB
// (mcp_mutation_receipts.envelope_version) に永続化された別系統の値のため、
// MCP_MUTATION_RECEIPT_SCHEMA_VERSION（features/timeblock/server/mcp-mutation-contract.ts）
// を使う。混同すると SDK の outputSchema 検証が実際の DB 値と食い違って壊れる。
export const MCP_TOOL_SCHEMA_VERSION = 2 as const;

/**
 * 成功結果の legacy text は必ず untrusted data として枠付けする。
 *
 * title / note / tag 名など、返す payload はすべてユーザーが書いた自由テキストを
 * 含みうる。枠付けを個々の tool 側に置くと read tool を足すたび漏れるので、
 * 唯一の成功経路であるここに寄せる。structuredContent は outputSchema 検証を
 * 通す機械可読チャネルなので枠を付けず生のまま返す。
 */
export function createMcpToolSuccess(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: serializeUntrustedMcpData(structuredContent),
      },
    ],
    structuredContent,
  };
}

export function createMcpToolError(
  code: string,
  message: string,
  retryable = false,
): CallToolResult {
  const errorContent = {
    schemaVersion: MCP_TOOL_SCHEMA_VERSION,
    error: { code, message, retryable },
  };
  return {
    // SDK 1.29 validates structuredContent against the success outputSchema even
    // when isError=true. Keep stable JSON in legacy text and omit structuredContent
    // so clients receive the domain error instead of a false output-schema failure.
    content: [{ type: 'text', text: JSON.stringify(errorContent, null, 2) }],
    isError: true,
  };
}
