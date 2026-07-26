import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  COMMENT_MARKER,
  DANGEROUS_PATH_PATTERNS,
  RULE_ATTACHMENTS,
  buildPrompt,
  callGemini,
  extractRlsSections,
  hasBlockingFinding,
  isDangerousPath,
  parseReviewResponse,
  renderComment,
  selectRuleAttachments,
} from '../review';

/**
 * ai-review は「所見があれば止める / インフラ障害では止めない」を両立させる gate なので、
 * 判定と fail-open 側の分岐だけを contract として固定する。実 API は叩かない。
 */

const WORKFLOW = readFileSync(join(process.cwd(), '.github/workflows/ai-review.yml'), 'utf8');

function response(findings: unknown[]): string {
  return JSON.stringify({ summary: 'テスト', findings });
}

function okFetch(text: string): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
        status: 200,
      }),
  ) as unknown as typeof fetch;
}

describe('危険クラス path の判定', () => {
  it('migration と server と auth を対象にする', () => {
    expect(isDangerousPath('supabase/migrations/20260725000000_add_policy.sql')).toBe(true);
    expect(isDangerousPath('apps/product/src/features/tags/server/tags-service.ts')).toBe(true);
    expect(isDangerousPath('apps/product/src/features/auth/components/LoginForm.tsx')).toBe(true);
    expect(isDangerousPath('apps/product/src/lib/trpc/procedures.ts')).toBe(true);
  });

  it('UI やドキュメントは対象にしない', () => {
    expect(isDangerousPath('apps/product/src/features/calendar/components/DayView.tsx')).toBe(
      false,
    );
    expect(isDangerousPath('docs/product/principles.md')).toBe(false);
    expect(isDangerousPath('apps/web/src/app/page.tsx')).toBe(false);
  });

  it('workflow の paths filter と script の判定が一致する', () => {
    // 片方だけ広げると「workflow が走らないので何も見ない」か「走るが全 skip」になり、
    // どちらも green のまま gate が消える。代表 path で両側を突き合わせる。
    const cases: { glob: string; sample: string }[] = [
      { glob: 'supabase/migrations/**', sample: 'supabase/migrations/20260725_x.sql' },
      { glob: 'supabase/functions/**', sample: 'supabase/functions/cron/index.ts' },
      {
        glob: 'apps/product/src/features/*/server/**',
        sample: 'apps/product/src/features/tags/server/router.ts',
      },
      {
        glob: 'apps/product/src/features/auth/**',
        sample: 'apps/product/src/features/auth/hooks/useSession.ts',
      },
      {
        glob: 'apps/product/src/lib/database/**',
        sample: 'apps/product/src/lib/database/client.ts',
      },
      {
        glob: 'apps/product/src/lib/supabase/**',
        sample: 'apps/product/src/lib/supabase/server.ts',
      },
      { glob: 'apps/product/src/lib/trpc/**', sample: 'apps/product/src/lib/trpc/procedures.ts' },
      { glob: 'apps/product/src/app/api/**', sample: 'apps/product/src/app/api/health/route.ts' },
    ];

    for (const { glob, sample } of cases) {
      expect(WORKFLOW).toContain(`- '${glob}'`);
      expect(isDangerousPath(sample)).toBe(true);
    }
    expect(DANGEROUS_PATH_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('rules 添付の選択', () => {
  it('migration では security 規約を添付する', () => {
    const selected = selectRuleAttachments(['supabase/migrations/20260725_x.sql']);
    expect(selected.map((item) => item.path)).toContain('.claude/skills/security/SKILL.md');
  });

  it('timeblock を触る時は時刻制約を添付する', () => {
    const selected = selectRuleAttachments([
      'apps/product/src/features/timeblock/server/timeblock-service.ts',
    ]);
    expect(selected.map((item) => item.path)).toContain('.claude/rules/temporal-constraints.md');
  });

  it('関係ない変更では何も添付しない', () => {
    expect(selectRuleAttachments(['docs/README.md'])).toHaveLength(0);
  });

  it('添付する rules は実在する', () => {
    for (const attachment of RULE_ATTACHMENTS) {
      expect(() => readFileSync(join(process.cwd(), attachment.path), 'utf8')).not.toThrow();
    }
  });
});

describe('RLS snapshot の抜粋', () => {
  const snapshot = [
    '# RLS snapshot',
    '凡例',
    '## plans',
    'plans の policy',
    '## tags',
    'tags の policy',
  ].join('\n');

  it('diff に出てきた table の section だけを返す', () => {
    const extracted = extractRlsSections(snapshot, 'alter table plans enable row level security;');
    expect(extracted).toContain('plans の policy');
    expect(extracted).not.toContain('tags の policy');
  });

  it('一致しない時は先頭（凡例）を返す', () => {
    expect(extractRlsSections(snapshot, 'create table unrelated_thing ();')).toContain('凡例');
  });
});

describe('prompt の組み立て', () => {
  it('契約・diff・危険クラス表示を含む', () => {
    const prompt = buildPrompt({
      contract: 'CONTRACT',
      diff: 'diff --git a/x b/x',
      changedFiles: ['supabase/migrations/20260725_x.sql', 'docs/README.md'],
      attachments: [{ label: 'security', body: 'RULE' }],
      truncated: false,
    });
    expect(prompt).toContain('CONTRACT');
    expect(prompt).toContain('RULE');
    expect(prompt).toContain('supabase/migrations/20260725_x.sql ← 危険クラス');
    expect(prompt).not.toContain('docs/README.md ← 危険クラス');
  });

  it('省略した時は推測を禁じる注意を入れる', () => {
    const prompt = buildPrompt({
      contract: 'C',
      diff: 'd',
      changedFiles: [],
      attachments: [],
      truncated: true,
    });
    expect(prompt).toContain('推測で指摘しないでください');
  });
});

describe('応答の検証', () => {
  it('正常な応答を parse する', () => {
    const result = parseReviewResponse(
      response([
        {
          severity: 'P0',
          title: 'RLS 欠落',
          file: 'supabase/migrations/x.sql',
          line: 12,
          failureScenario: '他ユーザーの行が読める',
          evidence: 'policy がない',
        },
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(hasBlockingFinding(result)).toBe(true);
  });

  it('findings 空は指摘なしとして通す', () => {
    const result = parseReviewResponse(response([]));
    expect(result.findings).toHaveLength(0);
    expect(hasBlockingFinding(result)).toBe(false);
  });

  it('壊れた応答は throw する（黙って PASS にしない）', () => {
    // shape 不正を「指摘なし」と読むと、gate が green のまま無効化される。
    expect(() => parseReviewResponse('not json')).toThrow();
    expect(() => parseReviewResponse('{"summary":"x"}')).toThrow();
    expect(() => parseReviewResponse(response([{ severity: 'P3', title: 'x' }]))).toThrow();
    expect(() =>
      parseReviewResponse(
        response([{ severity: 'P0', title: 'x', file: 'y', failureScenario: '', evidence: 'z' }]),
      ),
    ).toThrow();
  });
});

describe('comment の描画', () => {
  it('marker と P0 のブロック説明を含む', () => {
    const body = renderComment(
      {
        summary: '1 件',
        findings: [
          {
            severity: 'P0',
            title: 'RLS 欠落',
            file: 'a.sql',
            line: 3,
            failureScenario: '他ユーザーが読める',
            evidence: 'policy なし',
          },
        ],
      },
      { model: 'gemini-3-pro-preview', sha: 'abcdef1234567890' },
    );
    // marker が無いと毎回新しい comment が積み上がる。
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('P0 が 1 件あるため');
    expect(body).toContain('a.sql:3');
    expect(body).toContain('abcdef1');
  });
});

describe('API 呼び出し', () => {
  it('構造化応答を返す', async () => {
    const result = await callGemini({
      apiKey: 'k',
      model: 'm',
      prompt: 'p',
      fetchImpl: okFetch(response([])),
    });
    expect(result.findings).toHaveLength(0);
  });

  it('404 は model id の誤りとして即座に throw する', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('no such model', { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(
      callGemini({ apiKey: 'k', model: 'wrong', prompt: 'p', fetchImpl }),
    ).rejects.toThrow(/AI_REVIEW_MODEL/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('400 は retry しない', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('bad request', { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(callGemini({ apiKey: 'k', model: 'm', prompt: 'p', fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('workflow の contract', () => {
  it('comment を書くための権限だけを持つ', () => {
    expect(WORKFLOW).toContain('contents: read');
    expect(WORKFLOW).toContain('pull-requests: write');
    // 外部モデルの出力を受けて動く job に write 権限を持たせない。
    expect(WORKFLOW).not.toContain('contents: write');
  });

  it('PR の code を credential 付きで checkout しない', () => {
    expect(WORKFLOW).toContain('persist-credentials: false');
  });

  it('base...head の diff が取れる履歴を取得する', () => {
    expect(WORKFLOW).toContain('fetch-depth: 0');
  });
});
