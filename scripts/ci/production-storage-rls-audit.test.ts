import { describe, expect, it, vi } from 'vitest';

import { STORAGE_OBJECTS_APP_POLICY_NAMES } from '../lib/storage-objects-app-policy-names.mjs';
import {
  auditProductionStorageRls,
  EXPECTED_AVATARS_BUCKET,
  runProductionStorageRlsAudit,
} from './production-storage-rls-audit.mjs';

/** config.toml の宣言どおりの avatars bucket 応答（drift なし）。 */
function compliantAvatarsBucket(): Record<string, unknown> {
  return { ...EXPECTED_AVATARS_BUCKET };
}

/** allow-list どおりの production 応答（drift なし）。 */
function compliantRow(): Record<string, unknown> {
  return {
    unexpected_policies: [],
    rls_enabled: true,
    rls_forced: false,
    avatars_bucket: compliantAvatarsBucket(),
  };
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
        avatars_bucket: compliantAvatarsBucket(),
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

  it('fail closed: avatars_bucket が欠落・null（bucket が存在しない）は failure にする', () => {
    // json_build_object の FROM 句が該当行を見つけられなければ avatars_bucket は null になる。
    // 「確認できた」に倒さず shape error にする（#2449）。
    expect(auditProductionStorageRls([{ ...compliantRow(), avatars_bucket: null }])).toEqual([
      expect.stringContaining('unexpected row shape'),
    ]);
    expect(
      auditProductionStorageRls([
        { unexpected_policies: [], rls_enabled: true, rls_forced: false },
      ]),
    ).toEqual([expect.stringContaining('unexpected row shape')]);
  });

  // #2449: avatars bucket metadata が config.toml（実効的な正本、EXPECTED_AVATARS_BUCKET）と
  // 一致する場合・drift する場合の両方を固定する。片側だけの test は緑が証拠にならない
  // （チケット本文の明示要求。skip-conditional-tests-silent-green の教訓と同型）。
  describe('avatars bucket metadata（#2449）', () => {
    it('config.toml どおりの応答は error を返さない', () => {
      expect(auditProductionStorageRls([compliantRow()])).toEqual([]);
    });

    it('block: public が config.toml と食い違えば error にする', () => {
      const errors = auditProductionStorageRls([
        { ...compliantRow(), avatars_bucket: { ...compliantAvatarsBucket(), public: false } },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('avatars bucket metadata drifted');
      expect(errors[0]).toContain('public: expected true, got false');
    });

    it('block: file_size_limit が config.toml と食い違えば error にする', () => {
      const errors = auditProductionStorageRls([
        {
          ...compliantRow(),
          avatars_bucket: { ...compliantAvatarsBucket(), file_size_limit: 10485760 },
        },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('file_size_limit: expected 5242880, got 10485760');
    });

    it('block: allowed_mime_types が config.toml と食い違えば error にする（順序差は drift と数えない）', () => {
      // 順序を入れ替えただけの応答は drift ではない（集合として比較する）。
      const reordered = auditProductionStorageRls([
        {
          ...compliantRow(),
          avatars_bucket: {
            ...compliantAvatarsBucket(),
            allowed_mime_types: [...EXPECTED_AVATARS_BUCKET.allowed_mime_types].reverse(),
          },
        },
      ]);
      expect(reordered).toEqual([]);

      // 実際に集合が変わっていれば drift として検出する。
      const errors = auditProductionStorageRls([
        {
          ...compliantRow(),
          avatars_bucket: {
            ...compliantAvatarsBucket(),
            allowed_mime_types: ['image/jpeg', 'image/png'],
          },
        },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('allowed_mime_types');
    });

    it('複数フィールドの drift は 1 件のメッセージへまとめて全件記載する', () => {
      const errors = auditProductionStorageRls([
        {
          ...compliantRow(),
          avatars_bucket: { public: false, file_size_limit: 10485760, allowed_mime_types: [] },
        },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('public:');
      expect(errors[0]).toContain('file_size_limit:');
      expect(errors[0]).toContain('allowed_mime_types:');
    });
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
        {
          unexpected_policies: ['rogue policy'],
          rls_enabled: false,
          rls_forced: false,
          avatars_bucket: compliantAvatarsBucket(),
        },
      ]),
    );

    await expect(runProductionStorageRlsAudit({ token: 'test-token', fetchImpl })).rejects.toThrow(
      /rogue policy[\s\S]*無効化されています/u,
    );
  });
});
