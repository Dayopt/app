# ADR-017: CLAUDE.md コーディング規範のポジティブ例示化

## ステータス

accepted（2026-04-17）

## コンテキスト

CLAUDE.md の `## 絶対禁止` セクションは、11 項目を「禁止 → 代替」形式で列挙していた。Opus 4.7 以降のモデルはネガティブ指示（"Don't X"）よりもポジティブ例示（"Do Y, like `...`"）の方が解釈精度が高い傾向がある。同じ意図を望ましい挙動を主語にしたポジティブ形式へ書き換えることで、モデルの遵守率が改善されると見込む。

ただし一部ルール（`features/` 直下に新しいトップレベル feature を勝手に作らない）は「相談必須のプロセス要件」であり、ポジティブ化すると境界判断が曖昧化する。これはネガティブ形のまま残す。

## 決定

CLAUDE.md の `## 絶対禁止` セクションを `## コーディング規範（必須パターン）` に改名し、11 項目のうち 10 項目を「望ましい挙動 + 具体例 1 つ」のポジティブ形式に書き換える。残り 1 項目（feature トップレベル相談）はネガティブ形のまま理由を明示して残す。

意味・境界はゼロ差分。表現のみ変更。セクション位置・見出しレベル（`##`）・他セクションは触らない。

## 詳細

### 変換対応表（Before / After）

| #   | Before                                                                      | After                                                                                                                          | 分類 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | `any` / `unknown` / `Function` / `as any` → 具体的な型、`as never`          | **型**: 具体的な型を書く。union variance の逃げは `as never`。例: `type Status = 'idle' \| 'loading'` / `value as never`       | (a)  |
| 2   | `console.log` → `@/lib/logger`                                              | **ログ**: `@/lib/logger` で構造化ログを出す。例: `logger.info({ userId }, 'entry saved')`                                      | (a)  |
| 3   | `useEffect`でのfetch → tRPC / TanStack Query                                | **通信**: tRPC / TanStack Query でサーバーデータを取得。例: `const { data } = api.entries.list.useQuery({ date })`             | (a)  |
| 4   | `style`属性 / 直接カラー(`text-blue-500`) → セマンティックトークン          | **スタイル**: Tailwind のセマンティックトークンで書く。例: `<div className="bg-card text-foreground p-4" />`                   | (a)  |
| 5   | `export default`（App Router特殊ファイル例外） → named export               | **export**: named export を使う（App Router 特殊ファイルのみ `export default` 例外）。例: `export function EntryCard() {}`     | (a)  |
| 6   | `React.FC` → `export function ComponentName() {}`                           | **Component**: 関数宣言で props 型を直接注釈する。例: `export function Foo({ id }: { id: string }) {}`                         | (a)  |
| 7   | `@/features/X` を他featureから直接import → Composition Layer経由            | **Feature 間参照**: 他 feature の結合は Composition Layer（ページ/ルート）で行う。例: `src/app/(app)/calendar/page.tsx` で合成 | (a)  |
| 8   | `features/` 内に新しいトップレベルfeatureを勝手に作らない → 相談すること    | **新規トップレベル feature 追加**: `features/` 直下に新 feature を作る前に相談する（プロセス要件のためネガティブ形のまま維持） | (b)  |
| 9   | `lib/` から `features/` をimportしない → 依存方向は features → lib のみ     | **依存方向**: `features/ → lib/` の一方向。`lib/` は feature 非依存の再利用コードだけを置く                                    | (a)  |
| 10  | barrel（`index.ts`）以外のdeep importをしない → `@/features/X` 経由のみ     | **Import 経路**: feature barrel（`index.ts`）から import する。例: `import { EntryCard } from '@/features/entries'`            | (a)  |
| 11  | `utils.ts` / `helpers.ts` という名前のファイルを作らない → 責務を表す具体名 | **ファイル命名**: 責務を表す具体名で切る。例: `formatDuration.ts` / `dateRangeFilter.ts`（`utils.ts` / `helpers.ts` は不可）   | (a)  |

### 分類

- **(a) ポジティブ変換**: 望ましい挙動を主語にして書き直し、具体例を 1 つ以上添える。
- **(b) ネガティブ維持**: プロセス要件（相談が必要）で、ポジティブ化すると境界判断が希薄化するため原形維持。理由を行内に明示。

### #8 をポジティブ化しなかった理由

「相談する」は行動ではなく意思決定プロセスの要件。「必要なら相談する」とポジティブ化すると、相談不要だと自己判断する余地を与える。ネガティブ形（"勝手に作らない"）の方が「判断前に立ち止まる」という意図が強く伝わる。

## 影響

### 意図されたもの

- Opus 4.7 以降のモデルによる遵守率が向上する見込み
- 各項目に具体例が 1 つ以上つき、参照性が向上
- セクションタイトルが内容と整合（規範 = Do のリスト）

### 非影響（意図的に変更しない）

- ルールの意図・境界はゼロ差分
- CLAUDE.md の thin pointer としての性質（詳細は `.claude/rules/` 側）
- 他セクションの文言・構造
- `.claude/rules/*.md`、`AGENTS.md` 側の記述

### 計測

- CLAUDE.md 行数: 104 → 約 115 行（+約 10%、+30% 以内の目安内）
- モデルの遵守率は別途観測。明確な劣化が見られたら差し戻す

## 参考

- [CLAUDE.md](../../../CLAUDE.md)
- 変更時ブランチ: `feat/tag-detail-entries-pagination`
