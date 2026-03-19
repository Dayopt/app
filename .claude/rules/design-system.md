# デザインシステムルール

## 色

- **semantic token経由のみ**使用可。直接Tailwind色クラス (`text-red-500`, `bg-zinc-800` 等) / hex / rgb / oklch リテラル禁止
- 許可されるクラス: `bg-primary`, `text-foreground`, `border-border`, `bg-tag-blue`, `bg-chronotype-peak` 等、`tailwind-theme.css` で定義済みのもの
- **例外**:
  - メールテンプレート (`src/emails/`): CSS変数が使えない環境のためhex許容。`src/emails/styles.ts` に集約
  - OG画像 (`src/app/opengraph-image.tsx`): Satori制約のため `src/lib/og-colors.ts` の定数を参照

## Elevation / Shadow

- **`surface-*` utility を使用**。直接 `shadow-sm`, `shadow-lg` 等のクラスは原則禁止
  - `surface-sunken` → input, well（凹み）
  - `surface-flat` → card, コンテンツ面
  - `surface-raised` → dropdown, popover, toast
  - `surface-raised-heavy` → dialog, sheet, inspector, modal
- **例外**: `shadow-none`（リセット用）、装飾的シャドウ（CurrentTimeLine等の視覚インジケータ）

## Glassmorphism

- `glass-light` / `glass-medium` / `glass-heavy` utility を使用
- 定義: `src/styles/tokens/elevation.css` + `src/styles/utilities.css`

## Spacing

- **8px グリッド準拠**: Tailwindデフォルト値 (`p-1`=4px, `p-2`=8px, `p-4`=16px...) または `--spacing-*` トークンを使用
- 任意値 (`p-[Xpx]`) は原則禁止。やむを得ない場合はデザイントークンとして定義してから使用
- **`border-l-[3px]`**: 左ボーダーインジケータとして `--border-indicator` トークンで定義済み

## Border Radius

- `radius.css` で定義済みのスケールを使用: `rounded-sm`(4px), `rounded-md`(8px), `rounded-xl`(16px), `rounded-2xl`(24px), `rounded-full`
- 任意値 (`rounded-[Xpx]`) は禁止

## Typography

- Tailwindデフォルトのみ: `text-xs`, `text-sm`, `text-base`, `text-lg` 等
- 任意値 (`text-[11px]`) は禁止
