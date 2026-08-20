---
paths:
  - 'apps/product/src/**/*.tsx'
  - 'apps/product/src/**/*.css'
---

# デザインシステムルール

## 色

- **semantic token経由のみ**使用可。直接Tailwind色クラス (`text-red-500`, `bg-zinc-800` 等) / hex / rgb / oklch リテラル禁止
- 許可されるクラス: `bg-primary`, `text-foreground`, `border-border`, `bg-category-blue` 等、`packages/foundations/src/tailwind-theme.css` で定義済みのもの
- **例外**:
  - メールテンプレート (`apps/product/src/emails/`): CSS変数が使えない環境のためhex許容。`apps/product/src/emails/styles.ts` に集約
  - OG画像 (`apps/product/src/app/opengraph-image.tsx` / `apps/web/src/app/api/og/route.tsx`): Satori制約のため `@dayopt/foundations/og-colors` の定数を参照。product と marketing で palette を複製しない

## Elevation / Shadow

- Elevation レベル（4段階）

| レベル  | Surface       | Shadow      | Border                      | 用途                             |
| ------- | ------------- | ----------- | --------------------------- | -------------------------------- |
| Sunken  | bg-container  | なし        | border-border               | sidebar, footer                  |
| Base    | bg-background | なし        | —                           | ページ地                         |
| Raised  | bg-card       | shadow-sm   | border border-border-subtle | stat card, セクション内カード    |
| Overlay | bg-card       | shadow-card | border border-border-subtle | dropdown, popover, dialog, modal |

- **判断基準:**
  - Raised: ページと一緒にスクロールする要素
  - Overlay: ページの上に重なる要素。下のコンテンツを覆う
- **入力系:** input, textarea, select, radio 等のフォームコントロールは `shadow-xs` を使用
- **許可される shadow**: `shadow-xs`, `shadow-sm`, `shadow-card` の3種のみ。**theme をリセットしてあるので `shadow-md` 等は生成されない**
  - `shadow-xs`: form control 専用（input, select, textarea, radio）
  - `shadow-sm`: Raised elevation（bg-card を使うカード・セクション）
  - `shadow-card`: Overlay elevation（dropdown, popover, dialog, modal）
- `shadow-md` / `shadow-lg` / `shadow-xl` は使用禁止。`shadow-none` はリセット用

## Spacing

- **8px グリッド準拠（4pxサブグリッド）**
- 任意値 (`p-[Xpx]`) は禁止。やむを得ない場合はデザイントークンとして定義してから使用
- **`border-l-[3px]`**: 左ボーダーインジケータとして `--border-indicator` トークンで定義済み

レイアウトの間隔（gap / セクション間）は 8 の倍数を基本にし、コンポーネント内側の padding は 4px 刻みまで使える。12px は密な UI の内側専用（text-sm + py-3 = 44px で、タッチターゲット最小値 min-h-11 に一致する唯一の padding。行高 20px は 8 の倍数でないため、text-sm の高さはどの padding でも 8 の倍数にならない）。

| Tailwind | px   | 用途例                                      |
| -------- | ---- | ------------------------------------------- |
| 0        | 0    | リセット                                    |
| 1        | 4px  | アイコン-テキスト間、最小間隔               |
| 2        | 8px  | コンパクト間隔                              |
| 3        | 12px | チップ・バッジ・密な行の内側（44px タッチ） |
| 4        | 16px | 標準間隔、カード内パディング                |
| 6        | 24px | セクション間                                |
| 8        | 32px | 大間隔                                      |
| 12       | 48px | ページ間隔                                  |
| 16       | 64px | ヒーロー間隔                                |
| 24       | 96px | 最大間隔                                    |

**禁止**: `*-0.5`(2px), `*-1.5`(6px), `*-2.5`(10px), `*-3.5`(14px) — 4px サブグリッド外。`*-5`(20px), `*-7`(28px), `*-9`(36px) — サブグリッド上だが、段を増やすほど選択が迷いになるので採らない。必要になったら 12px と同じく「その値でしか満たせない制約」を根拠に昇格させる

## Border Radius

- 4段階のみ: `rounded-none`(0), `rounded-lg`(8px), `rounded-2xl`(16px), `rounded-full`
- `rounded-sm`, `rounded-md`, `rounded-xl`, bare `rounded` は禁止。**theme をリセットしてあるので、書いてもクラスが生成されず何も起きない**
- 任意値 (`rounded-[Xpx]`) は禁止
- **Elevation との対応:**
  - Sunken (sidebar, input) → `rounded-lg` (8px)
  - Raised (card, セクション) → `rounded-lg` (8px)
  - Overlay (dropdown, popover) → `rounded-lg` (8px)
  - Overlay (modal, dialog) → `rounded-2xl` (16px)
  - 原則: Overlay の中でも画面中央に出る大きな面だけ `rounded-2xl`。それ以外は `rounded-lg` で統一

## Typography

- Tailwindデフォルトのみ: `text-xs`, `text-sm`, `text-base`, `text-lg` 等
- 任意値 (`text-[11px]`) は禁止

## Icon Size

6種のみ使用可。任意値 (`size-[Xpx]`) は禁止。`size-3` は `size-3.5` に統一済み。

**標準（迷ったらこれ）:**

| Tailwind   | px   | 用途                                          |
| ---------- | ---- | --------------------------------------------- |
| `size-3.5` | 14px | 補助（矢印、Eye、ExternalLink等）text-sm の横 |
| `size-4`   | 16px | 標準（ボタン内、text-base の横）              |

**必要なときだけ:**

| Tailwind | px   | 用途       |
| -------- | ---- | ---------- |
| `size-5` | 20px | ナビ、強調 |
| `size-6` | 24px | 見出し横   |

**特殊用途:**

| Tailwind  | px   | 用途                     |
| --------- | ---- | ------------------------ |
| `size-8`  | 32px | カード主アイコン、エラー |
| `size-10` | 40px | 空状態、オンボーディング |

**禁止**: `size-3`(12px), `size-7`(28px), `size-9`(36px) 等、上記以外のサイズ
**注**: `size-8`, `size-9` 等がボタン/コンテナのサイズとして使われる場合はアイコンサイズ規約の対象外

## Motion / Transition

**正本は `packages/foundations/src/tokens/Motion.mdx`**（Storybook の Shared/Foundations/Motion）。段階表をここに複製しない。

覚えておく最小限:

- **デフォルト**: `transition-colors duration-150 ease-standard` — 迷ったらこれ
- duration は `150` / `200` / `300` の 3 段のみ。任意値と `cubic-bezier` 直書きは禁止
- easing は `ease-standard`（その場で変わる）と `ease-settle`（入る・着地する）の 2 種のみ
- どれを使うかは「その操作が 4 層のどれか」で決まる。層と禁止リスト（confetti / バウンス / バッジ等）は Motion.mdx を読む

> 旧規約の「ease は指定しない」と `duration-75` は撤回した。前者は実コード約 10 ファイルと矛盾しており、着地の質感を失っていた。後者は使用実績がゼロだった。

## Z-Index

- **トークン経由のみ**: `z-modal`, `z-tooltip` 等。`z-[200]` 等の任意値は禁止
- **50 刻み規則**: 通常コンテキスト 40〜450、Inspector 1000〜1100、Overlay 1200〜1400、tooltip 9999

| グループ         | 範囲      | 用途                                                                |
| ---------------- | --------- | ------------------------------------------------------------------- |
| 通常コンテキスト | 40–450    | dropdown, popover, sheet, modal, confirm, toast, context-menu, tour |
| Inspector        | 1000–1100 | calendar-drag, inspector-backdrop, inspector                        |
| Overlay          | 1200–1400 | Inspector 上の modal, popover, confirm                              |
| 最前面           | 9999      | tooltip                                                             |

- **Elevation との関係**: Sunken / Base / Raised は z-index 指定なし。Overlay のみ z-index を使用。見た目の浮き（shadow）は Elevation、スタッキング順序は Z-Index。別の関心事

## State Patterns (Error / Empty / Loading)

### Empty State

- コンポーネント: `EmptyState` (`@/components/ui/feedback/EmptyState`)
- アイコン: `size-10` (40px), `text-muted-foreground`
- ARIA: `role="status"`
- 用途: データが存在しない場合の表示
- **ルール**: 親コンテナが空状態を所有する。子の可視化コンポーネントは `return null`

### Error State

- コンポーネント: `ErrorState` (`@/components/ui/feedback/ErrorState`)
- アイコン: `AlertCircle`, `size-8` (32px), `text-destructive`
- ARIA: `role="alert"`
- リトライ: `Button variant="outline"`
- 用途: tRPC クエリの `isError` 等、データ取得失敗時
- **ルール**: UI を描画する全 `useQuery` は `isError` を ErrorState でハンドリング必須

### Loading State

- Skeleton (`animate-shimmer`): コンテンツ形状のローディング、300ms〜3s
- Spinner (`@dayopt/components`): 短いインラインローディング、〜2s
- `loading.tsx` (Next.js): ページレベルの Skeleton
- **ルール**: コンテンツ領域は Skeleton 優先。生 `Loader2` 禁止、必ず Spinner コンポーネントを使用

### 判断マトリクス

| シナリオ                 | コンポーネント  | サイズ                   |
| ------------------------ | --------------- | ------------------------ |
| tRPC クエリ失敗          | `ErrorState`    | 親コンテキストに合わせる |
| データなし（親コンテナ） | `EmptyState`    | 親コンテキストに合わせる |
| データなし（子の可視化） | `return null`   | —                        |
| コンポーネントクラッシュ | `ErrorBoundary` | —                        |
| ページエラー             | `error.tsx`     | フルページ               |
| Mutation 失敗            | Toast (sonner)  | —                        |
| 初期データ読み込み       | Skeleton        | コンテンツ形状に合わせる |
| ボタン/インライン操作    | Spinner         | sm / md                  |

## Interaction Patterns

### 確認フロー

不可逆・重要な操作の前に確認ダイアログを挟む。

| 操作                             | variant       | 例                         |
| -------------------------------- | ------------- | -------------------------- |
| 不可逆な削除                     | `destructive` | アカウント削除、データ削除 |
| 大量更新・変更破棄               | `warning`     | 一括変更、未保存破棄       |
| 通常の確認                       | `default`     | アーカイブ、エクスポート   |
| 取り消し可能な操作（保存・作成） | 確認不要      | —                          |

- コンポーネント: `ConfirmDialog` (`@/components/ui/overlays/confirm-dialog`)
- Props: `title`, `description`, `variant`, `icon?` (LucideIcon), `confirmLabel?`, `confirmDisabled?`
- `onConfirm` は async 可。Loading 中は両ボタン自動 disable、ESC・backdrop click ブロック
- 入力を伴う確認（パスワード確認等）は `AlertDialog` (`@radix-ui/react-alert-dialog`) を直接使用
- z-index: 通常 `z-confirm` (250)、Inspector 上は `z-overlay-confirm` (1400)

### Toast フィードバック

操作結果のフィードバックに `toast` (`@/lib/toast`) を使用。`sonner` の直接 import は禁止。

| タイプ       | 呼び出し          | duration                | 用途           |
| ------------ | ----------------- | ----------------------- | -------------- |
| 成功         | `toast.success()` | 3秒（action 付き: 5秒） | Mutation 成功  |
| エラー       | `toast.error()`   | 3秒（action 付き: 5秒） | Mutation 失敗  |
| 非同期進行中 | `toast.promise()` | 自動                    | エクスポート等 |

- 1行構成、description なし、close ボタンなし
- 高さ: 48px 固定、幅: 100vw-32px(mobile) / 360px(desktop)
- 位置: mobile `top-center`、desktop `top-right`
- 同時表示: 最大1つ。新トーストが旧トーストを cross-fade で差し替え
- 消去: 自動消去 + swipe(mobile) + Esc/クリック(desktop)
- アクション: テキストリンク（brand color）。ボタン形状にしない
- Undo 可能な操作: `action: { label: '元に戻す', onClick }` を付与
- `info` / `warning` の toast は提供しない。該当用途は Inline Banner(`@dayopt/components` の `InlineBanner` + `apps/product/src/app/[locale]/(app)/_shell/useAppInlineBanner.ts`)を使う
- ページレベルの持続的エラーは Toast ではなく `ErrorState` / インライン通知を使用
- **import**: `import { toast } from '@/lib/toast'`（`sonner` 直接禁止）

### フォームバリデーション

react-hook-form + Zod + Field コンポーネント。

- **バリデーションタイミング**: `mode: 'onBlur'`（初回はフィールド離脱時）、`reValidateMode: 'onChange'`（以降はリアルタイム）
- **エラー表示**: `FieldError` — `text-sm text-destructive`、`＊` prefix 自動付与
- **サーバーエラー**: `FieldError announceImmediately` でスクリーンリーダー即時通知（`role="alert"` をオプトイン）
- **成功表示**: なし（正常が当たり前）
- **保存中**: `Button loading={isSubmitting}` でスピナー + disabled
- DADS 準拠: デフォルトは `role="alert"` なし。サーバーエラーのみ `announceImmediately`

### ドラッグ操作

ドラッグはカレンダーグリッド内のブロック操作だけに使う。

| レイヤー | 実装                      | 用途                               |
| -------- | ------------------------- | ---------------------------------- |
| Local    | interaction state machine | カレンダー内ブロック移動・リサイズ |

リスト並び替えの DnD は廃止した（#2162）。サイドバーのアクティビティは名前順に固定し、
カテゴリーの付け替えは行メニューの「カテゴリーを変更」で行う。`@dnd-kit` は依存ごと撤去済みで、
並び替え UI を新設する場合はこの表に層を足す前に必要性から議論する。

**ビジュアル状態:**

| 状態         | スタイル                                 | トークン/クラス                                                                              |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| ドラッグ中   | ゴースト: `opacity-85` + `shadow-card`   | `GhostRenderer`（Portal）                                                                    |
| ソースカード | `opacity-30`                             | —                                                                                            |
| ドロップ先   | 16% foreground overlay                   | `bg-state-dragged`                                                                           |
| 重複検出     | 全面 destructive 化 + cursor not-allowed | `bg-destructive-tint` + `text-destructive` + body cursor `not-allowed`（赤リングは使わない） |
| ドロップ拒否 | 200ms ease-out スナップバック            | GhostRenderer 内蔵                                                                           |

- カーソル: 通常 `cursor-grab`、ドラッグ中 `cursor-grabbing`（`document.body` に直接設定）
- z-index: ゴーストは `9999`（`z-tooltip` 層）。`createPortal` + `position: fixed` で body 直下に描画され、ドラッグ中も開いたままの Inspector / Overlay（1050〜1400）を越える必要があるため。`z-calendar-drag` (1000) に下げると Inspector の裏へ消える
- 過去ブロックへのドラッグは UI + ロジックの二重拒否（`temporal-constraints.md` 参照）
