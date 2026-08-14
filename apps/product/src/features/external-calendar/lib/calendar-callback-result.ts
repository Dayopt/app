export type CalendarCallbackError =
  | 'access_denied'
  | 'account_mismatch'
  | 'authorization_expired'
  | 'pro_required'
  | 'rate_limited'
  | 'reconnect_target_invalid'
  | 'mfa_verification_required'
  | 'scope_not_granted'
  | 'unavailable'
  | 'generic';

type CalendarCallbackResult =
  { type: 'connected' } | { type: 'error'; error: CalendarCallbackError };

type SearchParamsReader = Pick<URLSearchParams, 'get'>;

const CALLBACK_ERROR_GROUPS: Readonly<Record<string, CalendarCallbackError>> = {
  access_denied: 'access_denied',
  account_mismatch: 'account_mismatch',
  // 使用済み / 期限切れ code。二度押しや戻るボタンで普通に起きるので、汎用の失敗文言に
  // 畳まず「やり直せば済む」と分かる文言へ回す。
  authorization_expired: 'authorization_expired',
  pro_required: 'pro_required',
  rate_limited: 'rate_limited',
  reconnect_target_invalid: 'reconnect_target_invalid',
  mfa_verification_required: 'mfa_verification_required',
  // narrow pair の granular consent で片方だけ許可された場合。汎用の失敗文言に畳むと
  // 「2 つの権限を両方許可すればよい」が伝わらない。
  scope_not_granted: 'scope_not_granted',
  assurance_lookup_failed: 'unavailable',
  unsupported_environment: 'unavailable',
  token_endpoint_unreachable: 'unavailable',
  token_exchange_rejected: 'unavailable',
};

/**
 * OAuth callback の query を、UI に表示してよい固定コードだけへ畳み込む。
 * provider 由来や未知の reason をそのまま表示しない。
 */
export function parseCalendarCallbackResult(
  searchParams: SearchParamsReader,
): CalendarCallbackResult | null {
  const calendar = searchParams.get('calendar');
  if (calendar === 'connected') return { type: 'connected' };
  if (calendar !== 'error') return null;

  const reason = searchParams.get('reason');
  return {
    type: 'error',
    error: reason ? (CALLBACK_ERROR_GROUPS[reason] ?? 'generic') : 'generic',
  };
}

/** OAuth callback 専用の query だけを除き、returnTo など他の query は保持する。 */
export function removeCalendarCallbackParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete('calendar');
  next.delete('reason');
  return next;
}
