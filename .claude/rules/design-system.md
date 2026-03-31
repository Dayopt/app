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
- **入力系:** `shadow-inner`（input, well）は Elevation とは別。`shadow-none` はリセット用
- `shadow-md` / `shadow-lg` / `shadow-xl` は使用禁止。`shadow-sm` と `shadow-card` の2種のみ

## Spacing

- **8px グリッド準拠**: Tailwindデフォルト値 (`p-1`=4px, `p-2`=8px, `p-4`=16px...) または `--spacing-*` トークンを使用
- 任意値 (`p-[Xpx]`) は原則禁止。やむを得ない場合はデザイントークンとして定義してから使用
- **`border-l-[3px]`**: 左ボーダーインジケータとして `--border-indicator` トークンで定義済み

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
