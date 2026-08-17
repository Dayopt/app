import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionMissingError } from '@supabase/auth-js';

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  setContext: vi.fn(),
  setFingerprint: vi.fn(),
  setTag: vi.fn(),
  setTags: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: sentry.addBreadcrumb,
  captureException: sentry.captureException,
  withScope: (callback: (scope: typeof sentry) => void) => callback(sentry),
}));

import {
  captureClientBoundaryError,
  captureUnexpectedAuthError,
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
  handleReactError,
  isExpectedAuthError,
  observeAuthOperation,
} from '../integration';

describe('Product Sentry capture helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the original Error once with scoped technical context', () => {
    const original = new Error('database failed');

    captureUnexpectedError(original, {
      feature: 'calendar',
      operation: 'load',
      route: '/day?search=private',
      requestId: 'request-123',
      userId: 'user-123',
    });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(original);
    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'calendar',
      operation: 'load',
      route: '/day',
      requestId: 'request-123',
    });
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'user-123' });
    expect(sentry.setFingerprint).not.toHaveBeenCalled();
  });

  it('adds React component context before capturing the same error', () => {
    const original = new Error('render failed');

    handleReactError(original, { componentStack: 'Calendar > Grid' }, { feature: 'calendar' });

    expect(sentry.setContext).toHaveBeenCalledWith('react', {
      componentStack: 'Calendar > Grid',
    });
    expect(sentry.captureException).toHaveBeenCalledWith(original);
    expect(sentry.setTags).toHaveBeenCalledBefore(sentry.captureException);
  });

  it('captures the same Error instance only once across nested handlers', () => {
    const original = new Error('nested failure');

    captureUnexpectedError(original, { source: 'inner_handler' });
    captureUnexpectedError(original, { source: 'outer_handler' });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(original);
  });

  it('leaves digest-bearing Server Component failures to onRequestError', () => {
    const serverError = Object.assign(new Error('server render failed'), { digest: 'digest-123' });
    const clientError = new Error('client render failed');

    captureClientBoundaryError(serverError, { source: 'root_error_boundary' });
    captureClientBoundaryError(clientError, { source: 'root_error_boundary' });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(clientError);
  });

  it('drops expected auth responses and captures unexpected auth failures once with the original stack', () => {
    const expected = Object.assign(new Error('invalid credentials'), {
      status: 400,
      code: 'invalid_credentials',
    });
    const serverFailure = Object.assign(new Error('auth service unavailable'), { status: 503 });

    captureUnexpectedAuthError(expected, { operation: 'sign_in' });
    captureUnexpectedAuthError(serverFailure, { operation: 'sign_in' });
    captureUnexpectedAuthError(serverFailure, { operation: 'sign_in_retry' });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(serverFailure);
    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'auth',
      operation: 'sign_in',
      source: 'supabase_auth',
    });
  });

  it('drops the Supabase missing-session outcome without hiding other SDK 400 failures', () => {
    const missingSession = new AuthSessionMissingError();
    const providerDisabled = Object.assign(new Error('provider disabled'), {
      status: 400,
      code: 'provider_disabled',
    });

    expect(isExpectedAuthError(missingSession)).toBe(true);
    captureUnexpectedAuthError(missingSession, { operation: 'get_user' });
    captureUnexpectedAuthError(providerDisabled, { operation: 'sign_in_oauth' });

    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(providerDisabled);
  });

  it('captures configuration and SDK 4xx errors instead of classifying by status alone', () => {
    const providerDisabled = Object.assign(new Error('provider disabled'), {
      status: 400,
      code: 'provider_disabled',
    });
    const malformedResponse = Object.assign(new Error('bad json'), {
      status: 400,
      code: 'bad_json',
    });

    captureUnexpectedAuthError(providerDisabled, { operation: 'sign_in_oauth' });
    captureUnexpectedAuthError(malformedResponse, { operation: 'get_session' });

    expect(sentry.captureException).toHaveBeenNthCalledWith(1, providerDisabled);
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, malformedResponse);
  });

  it('exposes the same expected Auth taxonomy to downstream wrappers', () => {
    expect(
      isExpectedAuthError(
        Object.assign(new Error('session expired'), { status: 401, code: 'session_expired' }),
      ),
    ).toBe(true);
    expect(
      isExpectedAuthError(
        Object.assign(new Error('provider disabled'), { status: 400, code: 'provider_disabled' }),
      ),
    ).toBe(false);
  });

  // #2031: GoTrue は Turnstile secret 自体が無効な時も code: 'captcha_failed' を返す
  // （bot を弾いた正常系と同じ構造化コード）ため、raw message で区別する必要がある。
  // ローカル GoTrue に対する実測（config.toml の [auth.captcha] を一時的に有効化して確認、
  // commit なし）で採取した実際の文言を pin する。GoTrue のバージョンアップでこの文言が
  // 変わると検知が静かに壊れるため、この test が red になったら
  // apps/product/src/lib/sentry/integration.ts の TURNSTILE_SECRET_INVALID_MESSAGE 判定も
  // 同時に見直すこと。
  it('classifies captcha_failed as expected when the token itself is rejected (secret is healthy)', () => {
    const badToken = Object.assign(
      new Error('captcha protection: request disallowed (invalid-input-response)'),
      { status: 400, code: 'captcha_failed' },
    );
    expect(isExpectedAuthError(badToken)).toBe(true);
  });

  it('classifies captcha_failed as unexpected when the Turnstile secret itself is invalid', () => {
    const invalidSecret = Object.assign(
      new Error('captcha protection: request disallowed (invalid-input-secret)'),
      { status: 400, code: 'captcha_failed' },
    );
    expect(isExpectedAuthError(invalidSecret)).toBe(false);

    captureUnexpectedAuthError(invalidSecret, { operation: 'sign_in' });
    expect(sentry.captureException).toHaveBeenCalledWith(invalidSecret);
  });

  // user-service.ts の requestEmailChange（#2064）は、handleServiceError の自動報告が
  // isExpectedAuthError でゲートされるため email_address_not_authorized をこの経路に
  // 乗せられないという前提の上で、captureUnexpectedError を直接呼ぶ設計にしている。
  // status を fallback 対象外（500）にして code 単独の判定であることを固定し、この
  // 前提が将来の EXPECTED_AUTH_ERROR_CODES 編集で静かに崩れないようにする
  it('classifies email_address_not_authorized as expected via code alone (status outside the 4xx fallback)', () => {
    expect(
      isExpectedAuthError(
        Object.assign(new Error('email address not authorized'), {
          status: 500,
          code: 'email_address_not_authorized',
        }),
      ),
    ).toBe(true);
  });

  // user-service.ts の requestEmailChange（#2064）が依存する dedup 契約を固定する:
  // observeAuthOperation が先に capture した error instance を、呼び出し側が同一
  // instance のまま captureUnexpectedError へ渡しても Sentry.captureException は
  // 1 回だけ。unexpected な code（EXPECTED_AUTH_ERROR_CODES に無い）で検証する —
  // expected な code だと observeAuthOperation 側が最初から capture しないため、
  // dedup の成立を検証できない
  it('dedups when observeAuthOperation captures an error and the caller then passes the same instance directly', async () => {
    const updateError = Object.assign(new Error('gotrue internal error'), {
      status: 500,
      code: 'unexpected_failure',
    });

    await observeAuthOperation('update_email', async () => ({ error: updateError }), {
      feature: 'email_change',
    });
    captureUnexpectedError(updateError, {
      feature: 'email_change',
      operation: 'update_email',
      source: 'supabase_auth',
    });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(updateError);
  });

  it('captures returned database errors regardless of an auth-like status and preserves them as cause', () => {
    const returnedFailure = {
      code: 'PGRST404',
      message: 'database function missing',
      status: 404,
    };

    const captured = captureUnexpectedDatabaseError(returnedFailure, {
      feature: 'mfa',
      operation: 'count_recovery_codes',
    });

    expect(captured.cause).toBe(returnedFailure);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(captured);
    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'mfa',
      operation: 'count_recovery_codes',
      source: 'supabase_database',
    });
  });

  it('normalizes the same returned PostgREST object once across nested handlers', () => {
    const returnedFailure = { code: 'PGRST500', message: 'database unavailable' };

    const first = captureUnexpectedDatabaseError(returnedFailure, { operation: 'inner' });
    const second = captureUnexpectedDatabaseError(returnedFailure, { operation: 'outer' });

    expect(second).toBe(first);
    expect(first.cause).toBe(returnedFailure);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(first);
  });

  it('classifies both returned and thrown failures from an auth operation', async () => {
    const returnedFailure = Object.assign(new Error('provider disabled'), {
      status: 400,
      code: 'provider_disabled',
    });
    const thrownFailure = new TypeError('fetch failed');

    await observeAuthOperation('oauth', async () => ({ error: returnedFailure }));
    await expect(
      observeAuthOperation('refresh_session', async () => {
        throw thrownFailure;
      }),
    ).rejects.toBe(thrownFailure);

    expect(sentry.captureException).toHaveBeenNthCalledWith(1, returnedFailure);
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, thrownFailure);
  });

  it('returns and rethrows the normalized Error so outer boundaries dedupe the same instance', async () => {
    const returnedFailure = { status: 503, message: 'auth unavailable' };
    const normalized = captureUnexpectedAuthError(returnedFailure, { operation: 'direct' });

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized?.cause).toBe(returnedFailure);
    await expect(
      observeAuthOperation('thrown', async () => {
        throw returnedFailure;
      }),
    ).rejects.toBe(normalized);
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });
});
