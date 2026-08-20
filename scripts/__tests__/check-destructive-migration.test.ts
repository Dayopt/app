import { describe, expect, it } from 'vitest';

import {
  checkFiles,
  detectDestructivePatterns,
  formatGithubOutput,
  formatSummary,
} from '../ci/check-destructive-migration.mjs';

describe('detectDestructivePatterns', () => {
  it('DROP TABLE を検知する', () => {
    const findings = detectDestructivePatterns('DROP TABLE public.legacy_tags;');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'DROP_TABLE', line: 1 });
  });

  it('DROP COLUMN を検知する', () => {
    const findings = detectDestructivePatterns('ALTER TABLE public.tags DROP COLUMN legacy_flag;');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'DROP_COLUMN' });
  });

  it('TRUNCATE を検知する', () => {
    const findings = detectDestructivePatterns('TRUNCATE public.stripe_webhook_events;');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'TRUNCATE' });
  });

  it('列の型変更(ALTER COLUMN ... TYPE)を検知する', () => {
    const findings = detectDestructivePatterns(
      'ALTER TABLE public.tags ALTER COLUMN name TYPE varchar(50);',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'ALTER_COLUMN_TYPE' });
  });

  it('SET DATA TYPE 構文も検知する', () => {
    const findings = detectDestructivePatterns(
      'ALTER TABLE public.tags ALTER COLUMN name SET DATA TYPE varchar(50);',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'ALTER_COLUMN_TYPE' });
  });

  it('DELETE FROM を検知する', () => {
    const findings = detectDestructivePatterns(
      'DELETE FROM public.tags WHERE archived_at IS NOT NULL;',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'DELETE_FROM' });
  });

  it('DROP POLICY を検知する', () => {
    const findings = detectDestructivePatterns(
      'DROP POLICY "Users can view own plans" ON public.plans;',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'DROP_POLICY' });
  });

  it('REVOKE を検知する', () => {
    const findings = detectDestructivePatterns('REVOKE SELECT ON public.tags FROM authenticated;');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'REVOKE' });
  });

  it.each(['RENAME COLUMN old_name TO new_name', 'RENAME TO new_table_name'])(
    'RENAME (%s) を検知する',
    (clause) => {
      const findings = detectDestructivePatterns(`ALTER TABLE public.tags ${clause};`);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ kind: 'RENAME' });
    },
  );

  it.each([
    ['DROP FUNCTION public.legacy_fn();', 'DROP_FUNCTION'],
    ['DROP TRIGGER legacy_trigger ON public.tags;', 'DROP_TRIGGER'],
    ['ALTER TABLE public.tags DROP CONSTRAINT legacy_check;', 'DROP_CONSTRAINT'],
  ])('%s を検知する', (sql, kind) => {
    const findings = detectDestructivePatterns(sql);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind });
  });

  it('複数行に折り返された ALTER COLUMN ... TYPE も検知する（行単位マッチの穴を塞ぐ）', () => {
    const sql = [
      'ALTER TABLE public.tags',
      '  ALTER COLUMN very_long_column_name',
      '  TYPE varchar(50);',
    ].join('\n');
    const findings = detectDestructivePatterns(sql);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'ALTER_COLUMN_TYPE' });
  });

  it('コメント行内の DROP には反応しない', () => {
    const findings = detectDestructivePatterns(
      '-- 過去に DROP TABLE を検討したが見送った\nCREATE TABLE public.new_table (id uuid primary key);',
    );
    expect(findings).toHaveLength(0);
  });

  it('通常の CREATE / ADD COLUMN 系には反応しない', () => {
    const findings = detectDestructivePatterns(
      'CREATE TABLE public.tags (id uuid primary key);\nALTER TABLE public.tags ADD COLUMN sort_order int NOT NULL DEFAULT 0;',
    );
    expect(findings).toHaveLength(0);
  });

  it('1ファイル内の複数検知を全て拾う（行番号付き）', () => {
    const sql = ['DROP TABLE public.a;', 'ALTER TABLE public.b DROP COLUMN c;'].join('\n');
    const findings = detectDestructivePatterns(sql);
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'DROP_TABLE', line: 1 }),
      expect.objectContaining({ kind: 'DROP_COLUMN', line: 2 }),
    ]);
  });
});

describe('checkFiles', () => {
  it('status=added かつ supabase/migrations/ 配下のみを対象にする', () => {
    const results = checkFiles([
      {
        path: 'supabase/migrations/20260101000000_drop.sql',
        status: 'added',
        content: 'DROP TABLE x;',
      },
      // status が modified の既存ファイルは対象外（append-only 前提、ノイズ回避）
      {
        path: 'supabase/migrations/20260101000001_old.sql',
        status: 'modified',
        content: 'DROP TABLE y;',
      },
      // migrations 配下でないファイルは対象外
      { path: 'apps/product/src/foo.sql', status: 'added', content: 'DROP TABLE z;' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('supabase/migrations/20260101000000_drop.sql');
  });

  it('破壊的パターンが無い新規 migration は結果に含めない', () => {
    const results = checkFiles([
      {
        path: 'supabase/migrations/20260101000002_add.sql',
        status: 'added',
        content: 'CREATE TABLE public.new_table (id uuid primary key);',
      },
    ]);
    expect(results).toEqual([]);
  });
});

describe('formatSummary / formatGithubOutput', () => {
  it('検知結果ゼロなら安全側のサマリーとdestructive=falseを返す', () => {
    expect(formatSummary([])).toContain('検知しませんでした');
    expect(formatGithubOutput([])).toBe('destructive=false\n');
  });

  it('検知結果ありならファイル・行・パターンを含むサマリーとdestructive=trueを返す', () => {
    const results = [
      {
        path: 'supabase/migrations/20260101000000_drop.sql',
        findings: [
          { kind: 'DROP_TABLE', label: 'DROP TABLE', line: 3, snippet: 'DROP TABLE public.x;' },
        ],
      },
    ];
    const summary = formatSummary(results);
    expect(summary).toContain('supabase/migrations/20260101000000_drop.sql');
    expect(summary).toContain('L3');
    expect(summary).toContain('EXPLICIT AUTHORITY');
    expect(formatGithubOutput(results)).toBe('destructive=true\n');
  });
});
