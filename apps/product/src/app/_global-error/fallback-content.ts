/**
 * global-error.tsx 用の静的フォールバックコンテンツ
 *
 * Root Layout が描画されないため NextIntlClientProvider が利用不可。
 * そのため i18n を使わない静的英語テキストと、Tailwind CSS変数が
 * 使えない場合に備えたインライン CSS変数フォールバックを提供する。
 */

// Static text for global error page (outside i18n context)
export const ERROR_TEXT = {
  title: 'Something went wrong',
  description: 'We apologize for the inconvenience. An unexpected error occurred.',
  errorId: 'Error ID',
  showDetails: 'Show details',
  retry: 'Try again',
  goHome: 'Go to Home',
  recoveryHint: 'Try again or reload the page.',
};

/**
 * デザインシステム準拠のフォールバックCSS変数
 *
 * primitives.css / colors.css のOKLCH値をそのまま使用。
 * Root Layout のCSSが読めない場合でもデザインシステムと一貫した色を提供する。
 */
export const FALLBACK_STYLES = `
  :root {
    --ge-background: oklch(0.12 0 0);
    --ge-foreground: oklch(0.99 0 0);
    --ge-card: oklch(0.24 0 0);
    --ge-card-inset: oklch(0.16 0 0);
    --ge-border: oklch(0.3715 0 0);
    --ge-muted: oklch(0.78 0 0);
    --ge-primary: oklch(0.5 0.188 259.8145);
    --ge-destructive: oklch(0.65 0.24 25.33);
  }
`;
