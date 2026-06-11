'use client';

/**
 * InsightSlot — 研究者の所見スロット
 *
 * 各粒度ビューの冒頭に rule-based の所見を 1-2 文だけ表示する。
 * 翻訳済みテキストを受け取る純粋な presentational component。
 * 所見がない期間は呼び出し側が描画しない（沈黙も人格の一部）。
 */
export function InsightSlot({ text, detail }: { text: string; detail?: string | undefined }) {
  return (
    <section className="border-border-subtle bg-card rounded-lg border p-4">
      <p className="text-foreground text-sm">{text}</p>
      {detail && <p className="text-muted-foreground mt-1 text-sm">{detail}</p>}
    </section>
  );
}
