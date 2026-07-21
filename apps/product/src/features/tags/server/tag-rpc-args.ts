import 'server-only';

/**
 * batch_reorder_tags_hierarchy の p_parent_ids は Postgres 側で UUID[]（要素はNULL許容）だが、
 * Supabase の型生成は配列引数の要素 nullability を表現できず string[] を生成する。
 * root タグの parent_id=null を tag_ids/sort_orders と位置対応させたまま渡す必要があるため、
 * RPC呼び出し境界でのみ `as never`（既知 variance、generator を直しても解消しない）。
 * 戻り値を never のままにして、null を含む配列を string[] として再利用できる値に
 * 見せかけない（呼び出し側で null が無いと誤信させないため、string[] にはキャストしない）。
 */
export function toParentIdsRpcArg(parentIds: (string | null)[]): never {
  return parentIds as never;
}
