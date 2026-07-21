import { ERROR_TEXT, FALLBACK_STYLES } from './fallback-content';

interface FailureErrorLike {
  name: string;
  message: string;
  digest?: string;
}

export interface GlobalErrorFailureContext {
  title: string;
  description: string;
  errorIdLabel: string;
  showDetailsLabel: string;
  retryLabel: string;
  goHomeLabel: string;
  recoveryHint: string;
  fallbackStyles: string;
  errorName: string;
  errorMessage: string;
  errorDigest: string | undefined;
  shouldShowDetails: boolean;
}

/**
 * global-error 用の表示情報を normalized な形で作る
 *
 * - i18n 依存を持たないため、文字列キーは constants から固定取得。
 * - 開発時のみ error message を details に含める。
 */
export function buildFailureContext(
  error: Error & FailureErrorLike,
  options: { isDevelopment?: boolean } = {},
): GlobalErrorFailureContext {
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development';

  return {
    title: ERROR_TEXT.title,
    description: ERROR_TEXT.description,
    errorIdLabel: ERROR_TEXT.errorId,
    showDetailsLabel: ERROR_TEXT.showDetails,
    retryLabel: ERROR_TEXT.retry,
    goHomeLabel: ERROR_TEXT.goHome,
    recoveryHint: ERROR_TEXT.recoveryHint,
    fallbackStyles: FALLBACK_STYLES,
    errorName: error.name,
    errorMessage: error.message,
    errorDigest: error.digest,
    shouldShowDetails: isDevelopment,
  };
}
