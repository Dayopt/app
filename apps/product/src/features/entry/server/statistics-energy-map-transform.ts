/**
 * `getEnergyMap` procedure の RPC response transform。
 *
 * RPC `get_energy_map` の snake_case 行配列を tRPC response の camelCase に
 * 変換する server-side adapter。
 *
 * 注: domain ではなく server に置く理由:
 * - RPC response shape (snake_case の `avg_fulfillment` / `total_minutes` /
 *   `entry_count` を含む特定構造) に密結合
 * - 過去 PR `statistics-time-by-tag-transform.ts` (#1229) と同じ配置パターン
 */

interface EnergyMapRpcRow {
  hour: number;
  dow: number;
  avg_fulfillment: number | null;
  total_minutes: number;
  entry_count: number;
}

interface EnergyMapItem {
  hour: number;
  dow: number;
  avgFulfillment: number | null;
  totalMinutes: number;
  entryCount: number;
}

/**
 * RPC `get_energy_map` の戻り値を tRPC response shape に変換する。
 *
 * - `null` / `undefined` 入力は空配列にフォールバック
 * - `avg_fulfillment: null` はそのまま `null` で保持（既存契約）
 * - snake → camel: `avg_fulfillment → avgFulfillment` / `total_minutes → totalMinutes` /
 *   `entry_count → entryCount`
 */
export function transformEnergyMapResponse(data: unknown): EnergyMapItem[] {
  const rows = (data ?? []) as ReadonlyArray<EnergyMapRpcRow>;
  return rows.map((row) => ({
    hour: row.hour,
    dow: row.dow,
    avgFulfillment: row.avg_fulfillment,
    totalMinutes: row.total_minutes,
    entryCount: row.entry_count,
  }));
}
