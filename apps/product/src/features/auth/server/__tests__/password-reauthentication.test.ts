import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { verifyPasswordWithCaptchaBypass } from '../password-reauthentication';

const EMAIL = 'user@example.com';
const PASSWORD = 'current-password';

beforeEach(() => {
  vi.clearAllMocks();
  createServiceRoleClient.mockImplementation(() => ({ auth: { signInWithPassword, signOut } }));
  signInWithPassword.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
});

describe('verifyPasswordWithCaptchaBypass', () => {
  it('service-role client の signInWithPassword で検証する（user-scoped client を使うと captcha で必ず失敗する）', async () => {
    const result = await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ outcome: 'verified' });
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  // scope を省くと既定 'global' でユーザーの全端末が強制ログアウトされる
  it('検証のために発行した session を local scope で破棄する', async () => {
    await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('session の破棄に失敗しても検証結果は verified のまま返す', async () => {
    signOut.mockRejectedValue(new Error('network'));

    const result = await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ outcome: 'verified' });
  });

  it('検証に失敗した時は session が発行されないので signOut しない', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });

    await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(signOut).not.toHaveBeenCalled();
  });

  it('client を呼び出しごとに生成する（module スコープに保持すると権限が降格したまま再利用される）', async () => {
    await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });
    await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(createServiceRoleClient).toHaveBeenCalledTimes(2);
  });

  it('invalid_credentials はパスワード誤りとして扱い alert を鳴らさない', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });

    const result = await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ outcome: 'invalid_password' });
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  // レート制限はサーバー側 egress IP を全ユーザーで共有するため通常運用で起こりうる。
  // ここで alert を鳴らすと canary が狼少年になる
  it.each([
    ['over_request_rate_limit', { code: 'over_request_rate_limit', status: 429 }],
    ['code なしの 429', { status: 429 }],
    ['user_banned', { code: 'user_banned', status: 403 }],
    ['email_not_confirmed', { code: 'email_not_confirmed', status: 400 }],
  ])('%s は削除を通さないが alert は鳴らさない', async (_label, error) => {
    signInWithPassword.mockResolvedValue({ error });

    const result = await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ outcome: 'unavailable' });
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  // 迂回が壊れた時のシグナル。captcha_failed は lib/sentry の EXPECTED_AUTH_ERROR_CODES に
  // 含まれるため observeAuthOperation 経由では報告されない。直接 capture する必要がある
  it.each([
    ['captcha_failed（迂回が効かなくなった）', { code: 'captcha_failed', status: 400 }],
    ['bad_jwt（service role key が失効・誤設定）', { code: 'bad_jwt', status: 401 }],
    ['未知の code', { code: 'something_new', status: 400 }],
    ['code を持たない失敗', { message: 'boom' }],
  ])('%s は構成故障として alert を鳴らす', async (_label, error) => {
    signInWithPassword.mockResolvedValue({ error });

    const result = await verifyPasswordWithCaptchaBypass({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ outcome: 'unavailable' });
    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);

    const [reported, context] = captureUnexpectedError.mock.calls[0] ?? [];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).cause).toBe(error);
    expect(context).toMatchObject({
      feature: 'account_deletion',
      operation: 'delete_account_reauthenticate',
      source: 'captcha_bypass',
    });
  });
});
