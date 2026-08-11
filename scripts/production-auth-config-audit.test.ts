import { describe, expect, it, vi } from 'vitest';

import {
  auditSupabaseAuthConfig,
  AUTH_CONFIG_CONTRACT,
  runProductionAuthConfigAudit,
  SUPABASE_PRODUCTION_PROJECT_REF,
} from './production-auth-config-audit.mjs';

/** 契約を満たす応答。secret 同梱の実レスポンスを模して余分な key も混ぜる。 */
function compliantAuthConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {
    security_captcha_secret: 'must-not-appear',
    smtp_pass: 'must-not-appear',
    site_url: 'https://app.dayopt.app',
  };
  for (const { key, expected } of AUTH_CONFIG_CONTRACT) {
    config[key] = expected;
  }
  return config;
}

describe('auditSupabaseAuthConfig', () => {
  it('現在の production 値と一致する応答は error を返さない', () => {
    expect(auditSupabaseAuthConfig(compliantAuthConfig())).toEqual([]);
  });

  it('期待値と違う値は key ごとに error を返す', () => {
    const config = { ...compliantAuthConfig(), mailer_secure_email_change_enabled: false };

    const errors = auditSupabaseAuthConfig(config);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('mailer_secure_email_change_enabled must be true, got false');
  });

  it('enum の drift も検出する', () => {
    const config = { ...compliantAuthConfig(), security_captcha_provider: 'hcaptcha' };

    const errors = auditSupabaseAuthConfig(config);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('security_captcha_provider must be "turnstile", got "hcaptcha"');
  });

  it('key が欠落した応答は failure にする（fail closed）', () => {
    const config = compliantAuthConfig();
    delete config.security_captcha_enabled;

    const errors = auditSupabaseAuthConfig(config);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('security_captcha_enabled is missing');
  });

  it('null は compliant にしない（nullable 応答を素通りさせない）', () => {
    const config = { ...compliantAuthConfig(), security_manual_linking_enabled: null };

    expect(auditSupabaseAuthConfig(config)).toHaveLength(1);
  });

  it('object でない応答は failure にする', () => {
    expect(auditSupabaseAuthConfig(null)).toEqual(['Supabase Auth config response is invalid']);
    expect(auditSupabaseAuthConfig([])).toEqual(['Supabase Auth config response is invalid']);
  });

  it('契約は boolean と enum だけを扱う（値が credential になり得ない型に限る）', () => {
    for (const { key, expected } of AUTH_CONFIG_CONTRACT) {
      expect(['boolean', 'string'], key).toContain(typeof expected);
      expect(key, key).not.toMatch(/_secret$|_key$|_token$/u);
    }
  });
});

describe('runProductionAuthConfigAudit', () => {
  it('token 未設定は実行前に落とす', async () => {
    await expect(runProductionAuthConfigAudit({ token: '' })).rejects.toThrow(
      'SUPABASE_AUTH_AUDIT_TOKEN is required',
    );
  });

  it('production project の auth config endpoint を Bearer token で読む', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(compliantAuthConfig()),
    );

    await runProductionAuthConfigAudit({ token: 'test-token', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      `https://api.supabase.com/v1/projects/${SUPABASE_PRODUCTION_PROJECT_REF}/config/auth`,
    );
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('非 2xx はレスポンス本文を出さずに throw する', async () => {
    const body = 'unauthorized: token-shaped-secret';
    const fetchImpl = vi.fn(async () => new Response(body, { status: 401 }));

    await expect(runProductionAuthConfigAudit({ token: 'bad', fetchImpl })).rejects.toThrow(
      /Supabase Auth config request failed/u,
    );
    await expect(runProductionAuthConfigAudit({ token: 'bad', fetchImpl })).rejects.not.toThrow(
      new RegExp(body, 'u'),
    );
  });

  it('drift があれば全件を並べて throw する', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ...compliantAuthConfig(),
        security_captcha_enabled: false,
        mailer_autoconfirm: true,
      }),
    );

    await expect(runProductionAuthConfigAudit({ token: 'test-token', fetchImpl })).rejects.toThrow(
      /security_captcha_enabled[\s\S]*mailer_autoconfirm/u,
    );
  });
});
