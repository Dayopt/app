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
  fontCode:
    "'Source Code Pro', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",

  // --primary: oklch(0.45 0.188 259.8145)
  colorPrimary: '#004bbb',
  // --ring: oklch(0.6231 0.188 259.8145)
  colorSecondary: '#3b82f6',

  // --background: oklch(0.99 0 0)
  appBg: '#fcfcfc',
  appContentBg: '#ffffff',
  appPreviewBg: '#fcfcfc',

  // --border: oklch(0.75 0.01 264.54)
  appBorderColor: '#abaeb4',
  // --radius-md: 0.5rem (8px)
  appBorderRadius: 8,

  // --foreground: oklch(0.25 0 0)
  textColor: '#222222',
  // --muted-foreground: oklch(0.35 0.02 264.54)
  textMutedColor: '#353b45',

  barTextColor: '#353b45',
  // --ring: oklch(0.6231 0.188 259.8145)
  barHoverColor: '#3b82f6',
  // --primary: oklch(0.45 0.188 259.8145)
  barSelectedColor: '#004bbb',
  barBg: '#ffffff',

  inputBg: '#ffffff',
  // --border: oklch(0.75 0.01 264.54)
  inputBorder: '#abaeb4',
  // --foreground: oklch(0.25 0 0)
  inputTextColor: '#222222',
  inputBorderRadius: 8,
});

export const dayoptDarkTheme = create({
  base: 'dark',
  brandTitle: 'Dayopt Design System',
  brandTarget: '_self',

  // base.css body font-family と同一スタック
  fontBase:
    "'Source Sans 3', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontCode:
    "'Source Code Pro', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",

  // --primary dark: oklch(0.5 0.188 259.8145)
  colorPrimary: '#115bcc',
  // --ring: oklch(0.6231 0.188 259.8145)
  colorSecondary: '#3b82f6',

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
  // --ring: oklch(0.6231 0.188 259.8145)
  barHoverColor: '#3b82f6',
  // --primary dark: oklch(0.5 0.188 259.8145)
  barSelectedColor: '#115bcc',
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
