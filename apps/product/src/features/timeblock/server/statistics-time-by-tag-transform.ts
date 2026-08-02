/**
 * `getTimeByTag` procedure の RPC response transform。
 *
 * RPC `get_time_by_tag` の snake_case 行配列を tRPC response の
 * 短縮 camelCase shape に変換する server-side adapter。
 *
 * 注: domain ではなく server に置く理由:
 * - RPC response shape (snake_case の `tag_*` field 群) に密結合
 * - `tag_name` → `name` / `tag_color` → `color` の接頭辞除去は RPC↔tRPC adapter 役割
 */

/** RPC `get_time_by_tag` が返す snake_case 行 */
interface TimeByTagRpcRow {
  tag_id: string | null;
  tag_name: string | null;
  tag_color: string | null;
  hours: number;
  is_uncategorized: boolean;
}

/** tRPC response item (tag_ 接頭辞除去 + camelCase) */
interface TimeByTagItem {
  tagId: string | null;
  name: string | null;
  color: string | null;
  hours: number;
  isUncategorized: boolean;
}

/**
 * RPC `get_time_by_tag` の戻り値を tRPC response shape に変換する。
 *
 * - `null` / `undefined` 入力は空配列にフォールバック
 * - `tag_id` → `tagId` (camelCase)
 * - `tag_name` → `name` (接頭辞除去)
 * - `tag_color` → `color` (接頭辞除去)
 * - `hours` はそのまま
 */
export function transformTimeByTagResponse(data: unknown): TimeByTagItem[] {
  const rows = (data ?? []) as ReadonlyArray<TimeByTagRpcRow>;
  return rows.map((row) => ({
    tagId: row.tag_id,
    name: row.tag_name,
    color: row.tag_color,
    hours: row.hours,
    isUncategorized: row.is_uncategorized,
  }));
}
