import type { MessageKey } from '@/lib/i18n';

/**
 * auth.schema.ts の Zod custom message を `t()` に渡せる形へ戻す。
 *
 * react-hook-form の `FieldError.message` / `SafeParseError.issues[].message` は
 * どちらも素の `string | undefined` で、Zod スキーマ側で `satisfies MessageKey` に
 * より検証済みという制約を型として運べない（呼び出し元の型は widen される）。
 * このヘルパーはその「スキーマ側で検証済み」という前提を明示する境界。
 *
 * @param message - FieldError.message / ZodIssue.message
 * @param fallback - message が無い場合の既定キー
 */
export function resolveSchemaMessageKey(
  message: string | undefined,
  fallback: MessageKey = 'auth.errors.unexpectedError',
): MessageKey {
  return message !== undefined ? (message as MessageKey) : fallback;
}
