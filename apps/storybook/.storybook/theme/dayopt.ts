/**
 * Dayopt Storybook カスタムテーマ
 *
 * @dayopt/foundations/src/tokens/colors.css のデザイントークンから変換したhex値を使用。
 * Storybook の create() API は CSS変数を受け付けないため、
 * 各値にトークン参照コメントを付けて同期を保つ。
 *
 * トークン変更時はこのファイルも更新すること。
 * @see @dayopt/foundations/src/tokens/colors.css
 */
import { create } from 'storybook/theming/create';

export const dayoptLightTheme = create({
  base: 'light',
  brandTitle: 'Dayopt Design System',
  brandTarget: '_self',

  // base.css body font-family と同一スタック
  fontBase:
    "'Source Sans 3', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontCode: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",

  // --primary: oklch(0.4 0.105 259.8145)
  colorPrimary: '#23467f',
  // --chart-1: oklch(0.6231 0.14 259.8145) — brand の明るい段
  colorSecondary: '#5286da',

  // --background: oklch(0.97 0.005 75)
  appBg: '#f7f5f1',
  // --card: oklch(0.99 0.005 75)
  appContentBg: '#fefbf8',
  appPreviewBg: '#f7f5f1',

  // --border: oklch(0 0 0 / 0.12) の不透明相当
  appBorderColor: '#d9d7d5',
  // --radius-md: 0.5rem (8px)
  appBorderRadius: 8,

  // --foreground: oklch(0.13 0 0)
  textColor: '#070707',
  // --muted-foreground: oklch(0.4 0 0)
  textMutedColor: '#484848',

  barTextColor: '#484848',
  // --chart-1: oklch(0.6231 0.14 259.8145)
  barHoverColor: '#5286da',
  // --primary: oklch(0.4 0.105 259.8145)
  barSelectedColor: '#23467f',
  // --card: oklch(0.99 0.005 75)
  barBg: '#fefbf8',

  inputBg: '#fefbf8',
  // --border: oklch(0 0 0 / 0.12) の不透明相当
  inputBorder: '#d9d7d5',
  // --foreground: oklch(0.13 0 0)
  inputTextColor: '#070707',
  inputBorderRadius: 8,
});

export const dayoptDarkTheme = create({
  base: 'dark',
  brandTitle: 'Dayopt Design System',
  brandTarget: '_self',

  // base.css body font-family と同一スタック
  fontBase:
    "'Source Sans 3', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontCode: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",

  // --primary dark: oklch(0.55 0.13 259.8145)
  colorPrimary: '#4270bc',
  // --chart-1 dark: oklch(0.7137 0.1434 254.624) — brand の明るい段
  colorSecondary: '#60a5fa',

  // --background dark: oklch(0.18 0.008 60)
  appBg: '#14110e',
  // --container dark: oklch(0.15 0.008 60)
  appContentBg: '#0e0a08',
  // --background dark: oklch(0.18 0.008 60)
  appPreviewBg: '#14110e',

  // --border dark: oklch(1 0 0 / 0.12) — alpha overlay, hex近似
  appBorderColor: '#404040',
  appBorderRadius: 8,

  // --foreground dark: oklch(0.9 0.005 70)
  textColor: '#e0ddda',
  // --muted-foreground dark: oklch(0.68 0.005 60)
  textMutedColor: '#9b9895',

  barTextColor: '#9b9895',
  // --chart-1 dark: oklch(0.7137 0.1434 254.624)
  barHoverColor: '#60a5fa',
  // --primary dark: oklch(0.55 0.13 259.8145)
  barSelectedColor: '#4270bc',
  // --container dark: oklch(0.15 0.008 60)
  barBg: '#0e0a08',

  // --background dark: oklch(0.18 0.008 60)
  inputBg: '#14110e',
  // --border dark: oklch(1 0 0 / 0.12) — alpha overlay, hex近似
  inputBorder: '#404040',
  // --foreground dark: oklch(0.9 0.005 70)
  inputTextColor: '#e0ddda',
  inputBorderRadius: 8,
});
