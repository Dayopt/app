---
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.css'
---

# デザインシステムルール

## 色

- **semantic token経由のみ**使用可。直接Tailwind色クラス (`text-red-500`, `bg-zinc-800` 等) / hex / rgb / oklch リテラル禁止
- 許可されるクラス: `bg-primary`, `text-foreground`, `border-border`, `bg-tag-blue`, `bg-chronotype-peak` 等、`tailwind-theme.css` で定義済みのもの
- **例外**:
  - メールテンプレート (`src/emails/`): CSS変数が使えない環境のためhex許容。`src/emails/styles.ts` に集約
  - OG画像 (`src/app/opengraph-image.tsx`): Satori制約のため `src/lib/og-colors.ts` の定数を参照

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
- **許可される shadow**: `shadow-xs`, `shadow-sm`, `shadow-card` の3種のみ
  - `shadow-xs`: form control 専用（input, select, textarea, radio）
  - `shadow-sm`: Raised elevation（bg-card を使うカード・セクション）
  - `shadow-card`: Overlay elevation（dropdown, popover, dialog, modal）
- `shadow-md` / `shadow-lg` / `shadow-xl` は使用禁止。`shadow-none` はリセット用

## Spacing

- **8px グリッド準拠（4pxサブグリッド）**
- 任意値 (`p-[Xpx]`) は禁止。やむを得ない場合はデザイントークンとして定義してから使用
- **`border-l-[3px]`**: 左ボーダーインジケータとして `--border-indicator` トークンで定義済み

| Tailwind | px   | 用途例                        |
| -------- | ---- | ----------------------------- |
| 0        | 0    | リセット                      |
| 1        | 4px  | アイコン-テキスト間、最小間隔 |
| 2        | 8px  | コンパクト間隔                |
| 4        | 16px | 標準間隔、カード内パディング  |
| 6        | 24px | セクション間                  |
| 8        | 32px | 大間隔                        |
| 12       | 48px | ページ間隔                    |
| 16       | 64px | ヒーロー間隔                  |
| 24       | 96px | 最大間隔                      |

**禁止**: `*-0.5`(2px), `*-1.5`(6px), `*-2.5`(10px), `*-3`(12px), `*-3.5`(14px), `*-5`(20px), `*-7`(28px), `*-9`(36px)

## Border Radius

- 4段階のみ: `rounded-none`(0), `rounded-lg`(8px), `rounded-2xl`(16px), `rounded-full`
- `rounded-sm`, `rounded-md`, `rounded-xl`, bare `rounded` は禁止
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

## Transition

- **デフォルト**: `transition-colors duration-150` — ホバー、フォーカス、状態変化の色切り替え。迷ったらこれ
- ease は指定しない（Tailwind デフォルトの `ease-in-out` で十分）
- `duration-150` を標準とし、ほぼ全てのインタラクションに使う

**用途別:**

| クラス                              | 用途               |
| ----------------------------------- | ------------------ |
| `transition-colors duration-150`    | 色のみ変化（標準） |
| `transition-all duration-150`       | サイズ変化を含む   |
| `transition-transform duration-200` | transform のみ     |

**duration 推奨値:**

| duration       | 用途                                         |
| -------------- | -------------------------------------------- |
| `duration-75`  | 即座のフィードバック（active 押下など）      |
| `duration-150` | **標準（デフォルト）** — ほぼ全てこれを使う  |
| `duration-200` | transform、やや重い要素の移動                |
| `duration-300` | 大きな面積の展開・折りたたみ（accordion 等） |

上記4つ以外の duration は禁止

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

- コンポーネント: `EmptyState` (`@/components/common/EmptyState`)
- アイコン: `size-10` (40px), `text-muted-foreground`
- ARIA: `role="status"`
- 用途: データが存在しない場合の表示
- **ルール**: 親コンテナが空状態を所有する。子の可視化コンポーネントは `return null`

### Error State

- コンポーネント: `ErrorState` (`@/components/common/ErrorState`)
- アイコン: `AlertCircle`, `size-8` (32px), `text-destructive`
- ARIA: `role="alert"`
- リトライ: `Button variant="outline"`
- 用途: tRPC クエリの `isError` 等、データ取得失敗時
- **ルール**: UI を描画する全 `useQuery` は `isError` を ErrorState でハンドリング必須

### Loading State

- Skeleton (`animate-shimmer`): コンテンツ形状のローディング、300ms〜3s
- Spinner (`@/components/ui/spinner`): 短いインラインローディング、〜2s
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
