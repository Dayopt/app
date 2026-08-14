import { describe, expect, it } from 'vitest';

import {
  buildLedger,
  findUnlistedKeys,
  normalizeEnvKeys,
  runReplicaCheck,
} from '../env/check-vercel-replica';

/**
 * replica ⊆ 台帳 検査（#2084）の契約を固定する。
 * 守る契約は 2 つ: (1) 値を一切保持・出力しない (2) fail closed
 * （応答が想定外なら pass ではなく throw に倒す）。
 */

const SECRET_VALUE = 'sk_live_do_not_leak_1234567890';

function envsResponse(envs: unknown[]): unknown {
  return { envs };
}

describe('normalizeEnvKeys（値を落とす射影）', () => {
  it('key / targets だけに射影し、value プロパティを一切保持しない', () => {
    const result = normalizeEnvKeys(
      envsResponse([
        {
          key: 'SOME_KEY',
          value: SECRET_VALUE,
          type: 'encrypted',
          target: ['production', 'preview'],
        },
      ]),
    );

    expect(result).toEqual([{ key: 'SOME_KEY', targets: ['production', 'preview'] }]);
    expect(JSON.stringify(result)).not.toContain(SECRET_VALUE);
  });

  it('key が string でない entry と object でない entry は黙って落とす', () => {
    const result = normalizeEnvKeys(
      envsResponse([
        { key: 123, target: ['production'] },
        'garbage',
        null,
        { target: ['production'] },
      ]),
    );
    expect(result).toEqual([]);
  });

  it('target が配列でなければ targets は空（unknown 扱いで production 判定に載らない）', () => {
    const result = normalizeEnvKeys(envsResponse([{ key: 'K', target: 'production' }]));
    expect(result).toEqual([{ key: 'K', targets: [] }]);
  });

  it('envs 配列を持たない応答は fail closed で throw する', () => {
    for (const malformed of [null, undefined, 'text', {}, { envs: 'not-array' }]) {
      expect(() => normalizeEnvKeys(malformed)).toThrow(
        'Vercel environment metadata response is invalid',
      );
    }
  });
});

describe('findUnlistedKeys（台帳との突合）', () => {
  const ledger: ReadonlySet<string> = new Set(['IN_LEDGER']);

  it('production target かつ台帳に無い key だけを検出する', () => {
    const entries = [
      { key: 'IN_LEDGER', targets: ['production'] },
      { key: 'NOT_IN_LEDGER', targets: ['production'] },
      { key: 'PREVIEW_ONLY_UNKNOWN', targets: ['preview'] },
    ];
    expect(findUnlistedKeys(entries, ledger)).toEqual(['NOT_IN_LEDGER']);
  });

  it('allowlist に載っている key は検出しない', () => {
    const entries = [{ key: 'ALLOWED', targets: ['production'] }];
    const allowlist = new Map([['ALLOWED', '理由']]);
    expect(findUnlistedKeys(entries, ledger, allowlist)).toEqual([]);
  });

  it('重複を除去し、sort して返す', () => {
    const entries = [
      { key: 'ZZZ', targets: ['production'] },
      { key: 'AAA', targets: ['production'] },
      { key: 'ZZZ', targets: ['production', 'preview'] },
    ];
    expect(findUnlistedKeys(entries, ledger)).toEqual(['AAA', 'ZZZ']);
  });
});

describe('buildLedger（schema との接続）', () => {
  it('onePasswordEnvSchema の envName を含み、未知の key を含まない', () => {
    const ledger = buildLedger();
    expect(ledger.has('SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
    expect(ledger.has('SENTRY_AUTH_TOKEN')).toBe(true);
    expect(ledger.has('TOTALLY_UNKNOWN_KEY')).toBe(false);
  });
});

describe('runReplicaCheck（end-to-end 契約）', () => {
  function fetchStub(payloadByProject: Record<string, unknown>): typeof fetch {
    return (async (url: URL | RequestInfo) => {
      const href = url instanceof URL ? url.href : String(url);
      const project = href.includes('/projects/product/') ? 'product' : 'web';
      return {
        ok: true,
        status: 200,
        json: async () => payloadByProject[project],
      } as Response;
    }) as typeof fetch;
  }

  it('token / teamId が無ければ throw する（fail closed）', async () => {
    await expect(runReplicaCheck({ token: undefined, teamId: 't' })).rejects.toThrow(
      'VERCEL_TOKEN is required',
    );
    await expect(runReplicaCheck({ token: 'x', teamId: undefined })).rejects.toThrow(
      'VERCEL_TEAM_ID is required',
    );
  });

  it('両 project を検査し、findings に値を含めない', async () => {
    const payload = envsResponse([
      { key: 'NOT_IN_LEDGER', value: SECRET_VALUE, target: ['production'] },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', value: SECRET_VALUE, target: ['production'] },
    ]);
    const findings = await runReplicaCheck({
      token: 'x',
      teamId: 't',
      fetchImpl: fetchStub({ product: payload, web: envsResponse([]) }),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('product: NOT_IN_LEDGER');
    expect(findings.join('\n')).not.toContain(SECRET_VALUE);
  });

  it('HTTP エラーはレスポンス本文を echo せず status だけで throw する', async () => {
    const failingFetch = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: SECRET_VALUE } }),
      }) as Response) as typeof fetch;

    await expect(
      runReplicaCheck({ token: 'x', teamId: 't', fetchImpl: failingFetch }),
    ).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes('status 401') && !message.includes(SECRET_VALUE);
    });
  });

  it('想定外の応答形は pass ではなく throw に倒す', async () => {
    await expect(
      runReplicaCheck({
        token: 'x',
        teamId: 't',
        fetchImpl: fetchStub({ product: { unexpected: true }, web: envsResponse([]) }),
      }),
    ).rejects.toThrow('Vercel environment metadata response is invalid');
  });
});
