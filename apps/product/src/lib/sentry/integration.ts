/**
 * Product capture helpers. Sentry initialization lives in instrumentation files.
 */

import { sanitizeTechnicalContext, type TechnicalErrorContext } from '@dayopt/observability';
import * as Sentry from '@sentry/nextjs';
import { isAuthSessionMissingError } from '@supabase/auth-js';

interface CaptureErrorContext extends TechnicalErrorContext {
  userId?: string;
  componentStack?: string;
}

const capturedErrors = new WeakSet<Error>();
const normalizedErrorObjects = new WeakMap<object, Error>();

function normalizeUnexpectedError(error: unknown, message: string): Error {
  if (error instanceof Error) return error;
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
    const cached = normalizedErrorObjects.get(error);
    if (cached) return cached;
    const normalized = new Error(message, { cause: error });
    normalizedErrorObjects.set(error, normalized);
    return normalized;
  }
  return new Error(message);
}

function hasErrorCode(error: Error): error is Error & { code: string } {
  return 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

function authErrorStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}

function authErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function authErrorMessage(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('message' in error)) return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

/**
 * GoTrue は Turnstile secret 自体が無効な時も `code: 'captcha_failed'`（bot を弾いた正常系と
 * 同じ構造化コード）を返すが、raw message に siteverify の error-codes をそのまま埋め込む
 * 形式（`captcha protection: request disallowed (invalid-input-secret)`）で区別できる。
 * #2031 でローカル GoTrue に対して実測確認済み（有効な secret + 不正 token は
 * `invalid-input-response` になり、この判定には一致しない）。
 *
 * この文言は Cloudflare の公開仕様（siteverify error-codes）ではなく GoTrue 実装依存のため、
 * GoTrue のバージョンアップで静かに変わりうる。`__tests__/integration.test.ts` の
 * captcha_failed 系 test が現行文言を pin しており、そちらが red になったら本判定も同時に
 * 壊れている。message 判定が効かなくなった場合、passive instrumentation では検知できなく
 * なるため能動的な canary（production の GoTrue endpoint へ低頻度で合成 probe を送る設計）
 * への切替を検討する（検討済みの設計比較は docs/operations/log/2026-08-17-turnstile-secret-detection-design.md 参照）。
 */
const TURNSTILE_SECRET_INVALID_MESSAGE = 'invalid-input-secret';

const EXPECTED_AUTH_ERROR_CODES = new Set([
  'bad_code_verifier',
  'bad_jwt',
  'bad_oauth_callback',
  'bad_oauth_state',
  'conflict',
  'email_address_invalid',
  'email_address_not_authorized',
  'email_conflict_identity_not_deletable',
  'email_exists',
  'email_not_confirmed',
  'flow_state_expired',
  'flow_state_not_found',
  'identity_already_exists',
  'identity_not_found',
  'insufficient_aal',
  'invalid_credentials',
  'invite_not_found',
  'mfa_challenge_expired',
  'mfa_factor_name_conflict',
  'mfa_factor_not_found',
  'mfa_ip_address_mismatch',
  'mfa_verification_failed',
  'mfa_verification_rejected',
  'mfa_verified_factor_exists',
  'no_authorization',
  'not_admin',
  'otp_disabled',
  'otp_expired',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
  'phone_exists',
  'phone_not_confirmed',
  'provider_email_needs_verification',
  'reauth_nonce_missing',
  'reauthentication_needed',
  'reauthentication_not_valid',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'same_password',
  'session_expired',
  'session_not_found',
  'single_identity_not_deletable',
  'too_many_enrolled_mfa_factors',
  'user_already_exists',
  'user_banned',
  'user_not_found',
  'user_sso_managed',
  'validation_failed',
  'weak_password',
]);

export function isExpectedAuthError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;

  const code = authErrorCode(error);
  if (code === 'captcha_failed') {
    // secret 自体が無効なケースはシステム構成の障害であり、bot を弾いた正常系とは区別する
    return !authErrorMessage(error)?.includes(TURNSTILE_SECRET_INVALID_MESSAGE);
  }
  if (code && EXPECTED_AUTH_ERROR_CODES.has(code)) return true;

  const status = authErrorStatus(error);
  return status !== undefined && [401, 403, 404, 409, 422, 429].includes(status);
}

function stringTags(context: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      tags[key] = String(value);
    }
  }
  return tags;
}

/** Captures an unexpected error once while preserving its original stack and cause. */
export function captureUnexpectedError(error: Error, context: CaptureErrorContext = {}): void {
  if (capturedErrors.has(error)) return;
  capturedErrors.add(error);

  const { userId, componentStack, ...technicalContext } = context;
  const sanitized = sanitizeTechnicalContext(technicalContext);

  Sentry.withScope((scope) => {
    scope.setTags(stringTags(sanitized));

    if (hasErrorCode(error)) {
      scope.setTag('errorCode', error.code);
    }
    if (userId) {
      scope.setUser({ id: userId });
    }
    if (componentStack) {
      scope.setContext('react', { componentStack });
    }

    Sentry.captureException(error);
  });
}

/** Browser boundaries leave digest-bearing Server Component failures to onRequestError. */
export function captureClientBoundaryError(
  error: Error & { digest?: string },
  context: CaptureErrorContext = {},
): void {
  if (error.digest) return;
  captureUnexpectedError(error, context);
}

/**
 * Supabase Auth 4xx responses are expected user-flow outcomes. Transport,
 * SDK/configuration, and server failures are unexpected and retain the original Error.
 */
export function captureUnexpectedAuthError(
  error: unknown,
  context: CaptureErrorContext = {},
): Error | undefined {
  if (error === null || error === undefined || isExpectedAuthError(error)) return undefined;

  const original = normalizeUnexpectedError(error, 'Unexpected authentication failure');
  captureUnexpectedError(original, {
    ...context,
    feature: context.feature ?? 'auth',
    source: context.source ?? 'supabase_auth',
  });
  return original;
}

/** Returned Supabase/PostgREST failures are never classified as expected Auth outcomes. */
export function captureUnexpectedDatabaseError(
  error: unknown,
  context: CaptureErrorContext = {},
): Error {
  const original = normalizeUnexpectedError(error, 'Unexpected database failure');
  captureUnexpectedError(original, {
    ...context,
    source: context.source ?? 'supabase_database',
  });
  return original;
}

/** Runs a Supabase Auth call and classifies both returned and thrown failures. */
export async function observeAuthOperation<T extends { error: unknown }>(
  operation: string,
  call: () => PromiseLike<T>,
  context: Omit<CaptureErrorContext, 'operation'> = {},
): Promise<T> {
  try {
    const result = await call();
    captureUnexpectedAuthError(result.error, { ...context, operation });
    return result;
  } catch (error) {
    const original = captureUnexpectedAuthError(error, { ...context, operation });
    throw original ?? error;
  }
}

export function handleReactError(
  error: Error,
  errorInfo?: { componentStack?: string | null },
  context: TechnicalErrorContext = {},
): void {
  const captureContext: CaptureErrorContext = {
    ...context,
    source: context.source ?? 'react_error_boundary',
  };
  if (errorInfo?.componentStack) captureContext.componentStack = errorInfo.componentStack;
  captureUnexpectedError(error, captureContext);
}
