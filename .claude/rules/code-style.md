---
paths:
  - 'apps/product/src/**/*.{ts,tsx}'
  - 'package.json'
  # §技術選定スタンス はベンダー・サービス・ツールの採用面でも発火させる
  # （workflow への action 追加、Vercel / Supabase 設定、運用 script も採用の入口）
  - 'apps/*/package.json'
  - 'packages/*/package.json'
  - 'apps/product/vercel.json'
  - 'supabase/**'
  - '.github/workflows/**'
  - 'scripts/**'
---

# コーディング規約

## 型定義

具体的な型を使い、型安全性を最大化する。

- union型のvariance問題には `as never`（`as any` 禁止）
- `unknown` は型ガードと組み合わせる場合のみ許可

## スタイリング

正本は `.claude/rules/design-system.md` §色。semantic token 経由のみ使用可（直接カラー・style 属性禁止）で、ダークモード対応を自動化する。許可クラス・透過トークン・メール/OG画像の例外は同ファイルを参照する。

## UIコンポーネント

Storybookに記載されているパターンのみ使用。新パターンは先にStory追加。

## Export

named export を使う。App Router の特殊ファイル（`page.tsx` / `layout.tsx` / `loading.tsx` 等、Next.js が規約で `export default` を要求するもの）だけ `export default` を許可する。feature の公開 API（`index.ts` barrel）の named export 限定は別契約（`.claude/rules/feature-boundaries.md` §Barrel Export）。

## Component

関数宣言 + props 型の直接注釈を基本にする。

```tsx
// ✅
type Props = { label: string };
function Button({ label }: Props) { ... }

// ❌ アロー関数 const、props 型の間接参照
const Button = (props: ButtonProps) => { ... };
```

## 命名

`utils.ts` / `helpers.ts` を避け、責務を表す具体名にする（例: `formatDuration.ts`、`normalizeTagInput.ts`）。

## ログ出力

`@/lib/logger` を使用。`console.log` は本番コード禁止。

## Server Component vs Client Component

Server Component をデフォルト。useState / useEffect / イベントハンドラ / ブラウザAPIが必要な場合のみ Client。

## セキュリティ

- 認証必須エンドポイントは `protectedProcedure`
- `ctx.userId` でデータアクセスを制限
- `dangerouslySetInnerHTML` 禁止

## zod v3/v4 分裂（意図的トレードオフ）

策定日: 2026-08-23（[#2307](https://github.com/Dayopt/dayopt/issues/2307)、epic #2165 の follow-up）

`apps/product` は zod `^3.25.76`、`apps/web` は zod `4.3.6` を使う。**この分裂は意図的に維持する。統一（v4 へ寄せる）は見送り済み。**

- **障壁の実測**: `apps/product/src` で zod を直接 import するファイルは 37（`grep -rl "from ['\"]zod['\"]" apps/product/src | wc -l`）。issue の撤退条件（変更ファイル 20 超）を超過
- **決定打は typecheck では検出できない実行時破壊**: `apps/product` の `@hookform/resolvers@^3.10.0`（`zodResolver`）は内部で `Array.isArray(error?.errors)` によって `ZodError` を判定するが、zod v4 の `ZodError` は `.errors` を持たず `.issues` のみを持つ。zod だけを v4 へ上げると、`tsc --noEmit` は 0 エラーで通過する一方、`LoginForm.test.tsx` の実行時テストが未捕捉の `ZodError` throw で fail する（実測済み）。apps/web は既に `@hookform/resolvers@^5.1.1` で zod v4 と揃えている
- **意味すること**: 統一には zod 本体だけでなく `@hookform/resolvers` を含む依存 chain 全体の協調アップグレードと、全 37 ファイルの実行時再検証が要る。typecheck green は安全の証拠にならない
- **新規コードのルール**: `apps/product` 配下は zod v3 系（`^3.x`）に留める。`apps/web` 配下は zod v4 系（`4.x`）に留める。app 間で zod スキーマを共有しない（`features/ -> lib/` の依存方向とも整合し、そもそも app 境界を跨ぐ共有はしない）
- **再検討条件**: `@hookform/resolvers` を v4/v5 系へ先行アップグレードし、`apps/product` の全 zod 消費箇所（フォーム・tRPC input・外部 API レスポンス検証）を実行時テストで再検証できる見込みが立った時

## Tailwind v4 既知の落とし穴

- `@theme` で `--spacing-xs/sm/md/lg/xl/2xl` を定義すると `max-w-sm/md/lg` 等が壊れる
- Tailwind v4 は `--spacing-*` > `--container-*` の優先順で解決するため
- **対策**: カスタムスペーシングは `:root` で定義し `@theme` に入れない
- 同様に `--radius-*` 等のカスタム名もTailwindデフォルトと衝突する可能性あり

## 依存関係の追加

パッケージ追加前に確認:

1. ブラウザ標準API or 言語標準で実現できないか？
2. 既存の依存で代替できないか？
3. GitHub Stars >= 1000、最終コミット6ヶ月以内か？
4. 1つの機能のためだけに大きなライブラリを追加しない
5. 出口コストを言えるか？ — 捨てる・乗り換える時に何が壊れるか（API の浸透範囲、データの持ち出し、継続課金）を 1 文で言えない依存は採用前に調べる

### 技術選定スタンス（依存・ベンダー・ツール共通）

選定の巧拙より「ダメになった時に捨てられること」を重視する（反脆弱性・脱固定化・可逆性。経緯は 2026-08-09-antifragility-stance.md（削除済み、git 履歴参照））:

- **出口コストを見る**: 深く浸透する依存（DB / 認証 / 決済級）は [infra.md §出口コスト台帳](../../docs/engineering/infra.md#出口コスト台帳) に浸透の深さ・逃げ道・出口検討トリガーを登録する
- **小さく試してから広げる**: 本採用の前に限定 scope で検証する。全面導入を初手にしない
- **単一固定を可視化する**: 単一ベンダー・単一手段が構造上不可避な場合（例: DB）は、回避ではなく固定した事実と出口を台帳で見えるようにする。「念のため adapter 層」は作らない（YAGNI）

## eslint-disable の運用

disable は「ルールが誤検知している／意図的に逸脱する」場合の最終手段。まずコード側で解消できないか検討する。やむを得ず disable する場合は次を守る:

1. **必ず inline で `-- 理由` を書く**。前行コメントではなく disable ディレクティブと同じ行に書く（grep で「理由なし disable」を検出できる状態を保つ）。

   ```ts
   // ✅ react-hooks/exhaustive-deps -- 初回マウント時のみ URL から復元する意図的な mount-only effect
   // ❌ 理由なし、または前行コメントに分離
   ```

2. **`eslint-disable`（ファイル全体）より `eslint-disable-next-line`（1 行）を優先**。影響範囲を最小化する。
3. **未使用 disable は CI で fail する**。`reportUnusedDisableDirectives: 'error'`（`apps/product` / `apps/web` の `eslint.config.mjs`）により、対象ルールが発火しなくなった disable は自動検出される。リファクタで不要になった disable は放置せず削除する。
4. 新しいルールを `off` にして黙らせるより、`warn` + 段階的解消を検討する（例: `@typescript-eslint/no-unused-vars` は TS 本体 + Prettier が未使用 import を消すため低優先で `off`）。
