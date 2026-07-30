/**
 * OG画像用カラー定数
 *
 * Next.js ImageResponse (Satori) は CSS変数・OKLCH 非対応のため、
 * デザイントークンを hex に換算して定義する。
 *
 * **product と marketing の OG はこのファイルだけを参照する。**
 * 以前は apps/product 側に同じ palette を持ち、marketing 側は
 * 生の Tailwind パレット（blue-600 / violet-600 / emerald-600）を
 * 使っていたため、SNS に出る2つの OG が別ブランドの顔になっていた。
 * さらに product 側の hex が実トークンから 26.8° ずれた紫のまま
 * 「oklch(0.5 0.188 259.8145) の近似」と注記されていた。
 * palette を複製するとこの drift が再発するので1箇所に置く。
 *
 * hex は必ず oklch から換算した実値を書く（近似で書かない）。
 * トークンを変えたらここも換算し直す。
 *
 * @see ./tokens/primitives.css
 * @see ./tokens/colors.css
 */

export const OG_COLORS = {
  /** ページ背景（OG カード専用のダーク基調。oklch(0.23 0 0) 相当） */
  background: '#1c1c1c',

  /** 背景グラデーション中間（oklch(0.26 0 0) 相当） */
  backgroundMid: '#242424',

  /** 背景グラデーション暗（oklch(0.21 0 0) 相当） */
  backgroundDark: '#191919',

  /** テキスト色（white: oklch(1 0 0)） */
  foreground: '#ffffff',

  /** muted テキスト */
  muted: 'rgba(255,255,255,0.6)',

  /** 極muted テキスト */
  mutedSubtle: 'rgba(255,255,255,0.3)',

  /** ブランドPrimary（--primary dark: oklch(0.55 0.13 259.8145)） */
  primary: '#4270bc',

  /** ブランドPrimary明るめ（oklch(0.62 0.12 259.8145)） */
  primaryLight: '#5a86ce',

  /** ブランドPrimary glow（装飾circle用。primary の rgb 66,112,188） */
  primaryGlow15: 'rgba(66, 112, 188, 0.15)',
  primaryGlow10: 'rgba(66, 112, 188, 0.10)',
  primaryGlow30: 'rgba(66, 112, 188, 0.3)',

  /** チップ・ラベルの地色（primary を薄く敷く。上に foreground を載せる） */
  primaryChip: 'rgba(66, 112, 188, 0.3)',

  /** 面の区切り線 */
  border: 'rgba(255,255,255,0.12)',
} as const;
