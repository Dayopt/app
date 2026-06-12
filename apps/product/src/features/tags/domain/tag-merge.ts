/**
 * tag merge 操作で使う pure formatting。
 *
 * Service 層 (`features/tags/server/tag-service.ts`) の `merge()` から
 * DB 非依存の純粋なロジックだけを切り出している。
 */

/** @public Pending domain barrel contract cleanup in I-08. */
export interface RpcErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Supabase RPC のエラーオブジェクトを debug 用の 1行 string に整形する。
 *
 * PostgREST が返す 502 は `message` が generic ("invalid response from upstream") に
 * なるため、`code` / `details` / `hint` を含めて debug できるようにする。
 */
export function formatRpcErrorDetail(rpcError: RpcErrorLike): string {
  return [
    rpcError.message,
    rpcError.code ? `code=${rpcError.code}` : null,
    rpcError.details ? `details=${rpcError.details}` : null,
    rpcError.hint ? `hint=${rpcError.hint}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}
