/**
 * OG画像用カラー定数
 *
 * Next.js ImageResponse (Satori) はCSS変数・OKLCH非対応のため、
 * デザインシステムのトークン値をhexに換算して定義。
 *
 * ブランドカラー基準:
 *   --hue-brand: 259.8145 (青紫)
 *   --primary (dark): oklch(0.5 0.188 259.8145) ≈ #5b3cc4
 *
 * @see @dayopt/foundations/src/tokens/primitives.css
 * @see @dayopt/foundations/src/tokens/colors.css
 */

/** OG画像用カラー定数（Satori CSS変数非対応のためhex値で定義） */
export const OG_COLORS = {
  /** ページ背景（neutral-12相当: oklch(0.12 0 0)） */
  background: '#1c1c1c',

  /** 背景グラデーション中間（neutral-15相当） */
  backgroundMid: '#242424',

  /** 背景グラデーション暗（neutral-10相当） */
  backgroundDark: '#191919',

  /** テキスト色（white: oklch(1 0 0)） */
  foreground: '#ffffff',

  /** muted テキスト（neutral-78相当: oklch(0.78 0 0)） */
  muted: 'rgba(255,255,255,0.6)',

  /** 極muted テキスト */
  mutedSubtle: 'rgba(255,255,255,0.3)',

  /** ブランドPrimary（oklch(0.5 0.188 259.8145) のhex近似） */
  primary: '#5b3cc4',

  /** ブランドPrimary明るめ（oklch(0.55 0.20 259.8145) 相当） */
  primaryLight: '#6b4fd6',

  /** ブランドPrimary glow（装飾circle用） */
  primaryGlow15: 'rgba(91, 60, 196, 0.15)',
  primaryGlow10: 'rgba(91, 60, 196, 0.10)',
  primaryGlow30: 'rgba(91, 60, 196, 0.3)',
} as const;
