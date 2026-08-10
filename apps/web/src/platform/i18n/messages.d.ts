/**
 * next-intl の型 augmentation
 *
 * `messages/en/*.json` の型を merge して `AppConfig.Messages` に登録する。
 * これにより `t()` / `getTranslations()` のキー引数が存在しないキーだと
 * `pnpm typecheck` がコンパイルエラーとして検出する（issue #1899）。
 *
 * en を正とする理由: `pnpm lint:i18n` が en/ja のキーパリティを別途保証するため、
 * 型はどちらか一方（en）だけを見れば十分（両方 import すると型が二重に重くなる）。
 *
 * namespace ファイルを追加/削除したら `NAMESPACES`（request.ts）とこの import 一覧を
 * 両方更新する。追従を忘れても新 namespace のキーが型エラーとして即座に表面化するため、
 * 「更新し忘れたまま気づかれない」状態にはならない（サイレントに stale 化しない）。
 *
 * apps/product との違い: apps/web は tsconfig が別（独立した TypeScript program）
 * のため、この augmentation は apps/web 内でのみ有効。apps/product 側は
 * apps/product/src/lib/i18n/messages.d.ts が別途同じ役割を持つ。
 */
import type common from '../../../messages/en/common.json';
import type legal from '../../../messages/en/legal.json';
import type marketing from '../../../messages/en/marketing.json';
import type search from '../../../messages/en/search.json';

type Messages = typeof common & typeof legal & typeof marketing & typeof search;

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
