/**
 * OG画像用カラー定数
 *
 * Next.js ImageResponse (Satori) はCSS変数・OKLCH非対応のため、
 * デザインシステムのトークン値をhexに換算して定義。
 *
 * ブランドカラー基準:
 *   --hue-brand: 259.8145 (青紫)
 *   --primary (dark): oklch(0.55 0.13 259.8145) → #4270bc
 *
 * hex は必ず oklch から換算した実値を書く。過去に primary が #5b3cc4
 * （色相 286.6 の紫。ブランド色相から 26.8° ずれ）のまま
 * 「oklch(0.5 0.188 259.8145) の近似」と注記されており、OG 画像だけ
 * 紫のブランドカラーで SNS に出ていた。
 *
 * @see packages/foundations/src/tokens/primitives.css
 * @see packages/foundations/src/tokens/colors.css
 */

/** OG画像用カラー定数（Satori CSS変数非対応のためhex値で定義） */
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
} as const;
