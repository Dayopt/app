import type { MessageKeys, Messages, NestedKeyOf, NestedValueOf } from 'next-intl';

/**
 * 存在する翻訳キーの完全パス（全 namespace 横断のフラットな leaf key union）。
 *
 * config テーブル（例: タブ定義、カテゴリ定義）が「i18n キーへの参照」を緩い
 * `string` ではなくこの型で持つことで、存在しないキー・削除済みキーへの参照を
 * `pnpm typecheck` が検出できる（issue #1899）。`next-intl` が `AppConfig.Messages`
 * から公開している `MessageKeys` / `NestedKeyOf` をそのまま使うだけで、
 * 内部実装には触れない。
 */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

/**
 * 特定 namespace（例: `'marketing'`）配下だけを見た、存在する leaf key の相対パス union。
 *
 * `useTranslations(NS)` / `getTranslations({ namespace: NS })` でスコープされた
 * translator にキーを渡すデータ構造はこちらを使う。`next-intl` 内部の
 * `NamespacedMessageKeys` と同じ計算を、公開されている `MessageKeys` /
 * `NestedKeyOf` / `NestedValueOf` だけで再現している。
 */
export type ScopedMessageKey<NS extends NestedKeyOf<Messages>> = MessageKeys<
  NestedValueOf<Messages, NS>,
  NestedKeyOf<NestedValueOf<Messages, NS>>
>;
