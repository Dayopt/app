import { describe, expect, it, vi } from 'vitest';

import { STORAGE_OBJECTS_APP_POLICY_NAMES } from './lib/storage-objects-app-policy-names.mjs';
import {
  auditProductionStorageRls,
  runProductionStorageRlsAudit,
} from './production-storage-rls-audit.mjs';

/** allow-list どおりの production 応答（drift なし）。 */
function compliantRow(): Record<string, unknown> {
  return { unexpected_policies: [], rls_enabled: true, rls_forced: false };
}

describe('auditProductionStorageRls', () => {
  it('allow-list どおりの応答は error を返さない', () => {
    expect(auditProductionStorageRls([compliantRow()])).toEqual([]);
  });

  it('block: allow-list 外の policy 名が 1 件でもあれば error にする', () => {
    // #2316 の root cause と同型（legacy policy が DROP されず production に残存する）。
    const errors = auditProductionStorageRls([
      { ...compliantRow(), unexpected_policies: ['legacy leftover policy'] },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('legacy leftover policy');
  });

  it('block: RLS が無効化されていれば error にする', () => {
    const errors = auditProductionStorageRls([{ ...compliantRow(), rls_enabled: false }]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('無効化されています');
  });

  it('block: FORCE ROW LEVEL SECURITY が付いていれば error にする（この repo は使っていない設定）', () => {
    const errors = auditProductionStorageRls([{ ...compliantRow(), rls_forced: true }]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FORCE');
  });

  it('複数の drift は全件を並べて返す', () => {
    const errors = auditProductionStorageRls([
      {
        unexpected_policies: ['rogue policy'],
        rls_enabled: false,
        rls_forced: false,
      },
    ]);

    expect(errors).toHaveLength(2);
  });

  it('fail closed: row が 0 件・複数件は failure にする（「確認できた」に倒さない）', () => {
    expect(auditProductionStorageRls([])).toEqual([
      expect.stringContaining('expected exactly 1 row'),
    ]);
    expect(auditProductionStorageRls([compliantRow(), compliantRow()])).toEqual([
      expect.stringContaining('expected exactly 1 row'),
    ]);
  });

  it('fail closed: 配列でない応答は failure にする', () => {
    expect(auditProductionStorageRls(null)).toEqual([expect.stringContaining('unexpected shape')]);
    expect(auditProductionStorageRls({})).toEqual([expect.stringContaining('unexpected shape')]);
  });

  it('fail closed: 想定外の row shape（型不一致・欠落フィールド）は failure にする', () => {
    expect(auditProductionStorageRls([{ unexpected_policies: [], rls_enabled: true }])).toEqual([
      expect.stringContaining('unexpected row shape'),
    ]);
    expect(
      auditProductionStorageRls([
        { unexpected_policies: 'not-an-array', rls_enabled: true, rls_forced: false },
      ]),
    ).toEqual([expect.stringContaining('unexpected row shape')]);
  });
});

describe('runProductionStorageRlsAudit', () => {
  it('token 未設定は実行前に落とす', async () => {
    await expect(runProductionStorageRlsAudit({ token: '' })).rejects.toThrow(
      'SUPABASE_STORAGE_RLS_AUDIT_TOKEN is required',
    );
  });

  it('production project の database/query endpoint を read_only: true 付きで Bearer token で叩く', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json([compliantRow()]),
    );

    await runProductionStorageRlsAudit({ token: 'test-token', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toMatch(/\/database\/query$/u);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });

    const body = JSON.parse(init?.body as string);
    expect(body.read_only).toBe(true);
    // allow-list 由来の名前が SQL 本文に含まれること（クエリが正しい allow-list を
    // 参照していることの確認。任意の 1 件で十分）。
    expect(body.query).toContain(STORAGE_OBJECTS_APP_POLICY_NAMES[0]);
  });

  it('非 2xx はレスポンス本文を出さずに throw する', async () => {
    const body = 'unauthorized: token-shaped-secret';
    const fetchImpl = vi.fn(async () => new Response(body, { status: 401 }));

    await expect(runProductionStorageRlsAudit({ token: 'bad', fetchImpl })).rejects.toThrow(
      /database query request failed/u,
    );
    await expect(runProductionStorageRlsAudit({ token: 'bad', fetchImpl })).rejects.not.toThrow(
      new RegExp(body, 'u'),
    );
  });

  it('drift があれば全件を並べて throw する', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        { unexpected_policies: ['rogue policy'], rls_enabled: false, rls_forced: false },
      ]),
    );

    await expect(runProductionStorageRlsAudit({ token: 'test-token', fetchImpl })).rejects.toThrow(
      /rogue policy[\s\S]*無効化されています/u,
    );
  });
});
