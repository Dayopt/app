import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  COMMENT_MARKER,
  DANGEROUS_PATH_PATTERNS,
  MAX_DIFF_BYTES,
  RULE_ATTACHMENTS,
  buildPrompt,
  callGemini,
  collectDiff,
  extractRlsSections,
  hasBlockingFinding,
  isDangerousPath,
  parseReviewResponse,
  renderComment,
  selectRuleAttachments,
  truncateToBytes,
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

  // 実ファイルは `## ポリシー一覧（table 別）` の下に `### <table>` がぶら下がる二階層。
  // 偽の構造（`## <table>`）で書いたテストだと、table 名が一度も見出しに現れないまま
  // 汎用語だけで当たっている状態を検出できない。実ファイルを直接使う。
  const REAL_SNAPSHOT = readFileSync(
    join(process.cwd(), 'docs/engineering/data/db/rls-snapshot.md'),
    'utf8',
  );

  it('実ファイルの ### table 見出しを拾う', () => {
    expect(REAL_SNAPSHOT).toContain('### oauth_tokens');
    const extracted = extractRlsSections(
      REAL_SNAPSHOT,
      'alter policy "x" on public.oauth_tokens using (user_id = auth.uid());',
    );
    expect(extracted).toContain('### oauth_tokens');
    // 無関係な table の policy まで引き込まない
    expect(extracted).not.toContain('### stripe_webhook_events');
  });

  it('table 単位の section を category より前に置く', () => {
    const extracted = extractRlsSections(
      REAL_SNAPSHOT,
      'alter policy "x" on public.oauth_tokens using (true); grant select on public.plans to authenticated;',
    );
    const table = extracted.indexOf('### oauth_tokens');
    const grant = extracted.indexOf('## GRANT');
    expect(table).toBeGreaterThanOrEqual(0);
    // GRANT 一覧は 100 行超あるので、先に置くと clamp で table section が落ちる
    if (grant >= 0) expect(table).toBeLessThan(grant);
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

describe('バイト単位の切り詰め', () => {
  it('予算内ならそのまま返す', () => {
    expect(truncateToBytes('abc', 10)).toBe('abc');
  });

  it('UTF-16 ではなく UTF-8 のバイト数で切る', () => {
    // 「あ」は UTF-8 で 3 バイト。9 バイト予算なら 3 文字ぶん入る。
    expect(truncateToBytes('あああああ', 9)).toBe('あああ');
  });

  it('マルチバイト文字の途中で切って U+FFFD を作らない', () => {
    // 7 バイトは「あ」2 個（6 バイト）+ 3 バイト文字の 1 バイト目。境界まで戻す。
    const result = truncateToBytes('あああ', 7);
    expect(result).toBe('เมื'.slice(0, 0) + 'ああ');
    expect(result).not.toContain('�');
  });
});

describe('diff の予算配分', () => {
  const line = (file: string, bytes: number): string =>
    `diff --git a/${file} b/${file}\n${'+'.repeat(Math.max(1, bytes - file.length * 2 - 20))}`;

  it('巨大な危険ファイルがあっても、全ての危険ファイルが diff に載る', () => {
    const files = [
      'supabase/migrations/0001_huge.sql',
      'apps/product/src/features/auth/server/service.ts',
      'apps/product/src/app/api/trpc/_server/app-router.ts',
    ];
    const sizes: Record<string, number> = {
      // 1 ファイルで予算を食い尽くす巨大 migration
      'supabase/migrations/0001_huge.sql': MAX_DIFF_BYTES * 2,
      'apps/product/src/features/auth/server/service.ts': 500,
      'apps/product/src/app/api/trpc/_server/app-router.ts': 500,
    };
    const result = collectDiff('base', 'head', files, (file) => line(file, sizes[file] ?? 100));

    // 小さい 2 ファイルは全量が載る（water-filling で余剰が巨大ファイルへ回る）
    expect(result.diff).toContain('apps/product/src/features/auth/server/service.ts');
    expect(result.diff).toContain('apps/product/src/app/api/trpc/_server/app-router.ts');
    // 巨大ファイルも先頭部分は必ず載る
    expect(result.diff).toContain('supabase/migrations/0001_huge.sql');
    // 全量を載せられなかったのは巨大ファイルだけ
    expect(result.incompleteDangerous).toEqual(['supabase/migrations/0001_huge.sql']);
    expect(result.truncated).toBe(true);
  });

  it('全部収まるなら incompleteDangerous は空で truncated も false', () => {
    const files = ['apps/product/src/features/auth/server/service.ts', 'README.md'];
    const result = collectDiff('base', 'head', files, (file) => line(file, 200));
    expect(result.incompleteDangerous).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.diff).toContain('README.md');
  });

  it('予算が苦しい時に落ちるのは非危険ファイルの側', () => {
    const files = ['supabase/migrations/0001_big.sql', 'README.md'];
    const result = collectDiff('base', 'head', files, (file) =>
      line(file, file === 'README.md' ? MAX_DIFF_BYTES : MAX_DIFF_BYTES - 1000),
    );
    // 危険クラスは全量載り、非危険は落ちる
    expect(result.incompleteDangerous).toEqual([]);
    expect(result.diff).toContain('supabase/migrations/0001_big.sql');
    expect(result.diff).not.toContain('README.md');
    expect(result.truncated).toBe(true);
  });

  it('diff 全体が予算を超えない', () => {
    const files = ['supabase/migrations/0001_a.sql', 'supabase/migrations/0002_b.sql', 'README.md'];
    const result = collectDiff('base', 'head', files, (file) => line(file, MAX_DIFF_BYTES));
    expect(Buffer.byteLength(result.diff, 'utf8')).toBeLessThanOrEqual(MAX_DIFF_BYTES + 10);
  });
});

describe('危険クラスを見切れなかった時の扱い', () => {
  it('prompt に、先頭しか見えていないファイルを明示する', () => {
    const prompt = buildPrompt({
      contract: 'contract',
      diff: 'diff',
      changedFiles: ['supabase/migrations/0001_huge.sql'],
      attachments: [],
      truncated: true,
      incompleteDangerous: ['supabase/migrations/0001_huge.sql'],
    });
    expect(prompt).toContain('先頭部分しか含まれていません');
    expect(prompt).toContain('supabase/migrations/0001_huge.sql');
  });

  it('comment に fail の理由と該当ファイルを出す', () => {
    const body = renderComment(
      { summary: '要約', findings: [] },
      {
        model: 'gemini-3-pro-preview',
        sha: 'abcdef1234567890',
        incompleteDangerous: ['supabase/migrations/0001_huge.sql'],
      },
    );
    expect(body).toContain('この check は fail しています');
    expect(body).toContain('supabase/migrations/0001_huge.sql');
    expect(body).toContain('指摘が無いことは安全の根拠になりません');
  });
});
