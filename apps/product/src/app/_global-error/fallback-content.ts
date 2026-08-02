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
 * colors.css の .dark のOKLCH値をそのまま使用（エラー画面はダーク固定）。
 * Root Layout のCSSが読めない場合でもデザインシステムと一貫した色を提供する。
 *
 * トークンを変えたらここも直す。値は colors.css からコピーする（近似で書かない）。
 */
export const FALLBACK_STYLES = `
  :root {
    --ge-background: oklch(0.18 0.008 60);
    --ge-foreground: oklch(0.9 0.005 70);
    --ge-card: oklch(0.22 0.008 60);
    --ge-card-inset: oklch(0.15 0.008 60);
    --ge-border: oklch(1 0 0 / 0.12);
    --ge-muted: oklch(0.68 0.005 60);
    --ge-primary: oklch(0.55 0.13 259.8145);
    --ge-destructive: oklch(0.65 0.14 25);
  }
`;
