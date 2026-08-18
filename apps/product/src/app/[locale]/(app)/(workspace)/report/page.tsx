/**
 * `/report` のプレースホルダ。
 *
 * workspace-shell-restructure Step 1 の scope は URL 契約の新設のみで、
 * 中身（1スクロール構成の本体）は Step 4 で実装する
 * （docs/projects/workspace-shell-restructure/overview.md §6・§9）。
 *
 * 【暫定】この placeholder は新規 i18n namespace を追加しない。既存の Messages 型
 * （`apps/product/src/lib/i18n/messages.d.ts`）が TypeScript の union 型展開の
 * 上限に近く、新規キー追加（namespace 新設・既存 namespace への追加を問わず）が
 * 無関係な既存ファイルまで含めて型エラーを誘発することを実測で確認した（起票済み、
 * 根本修正は別 issue）。Step 4 で本体を実装する際にこの制約が解消している前提を
 * 置かず、必要なら Step 4 の scope として先に根本修正の完了を確認すること。
 */
export const dynamic = 'force-dynamic';

const ReportPage = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8" role="status" />
  );
};

export default ReportPage;
