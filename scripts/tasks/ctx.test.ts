import { describe, expect, it, vi } from 'vitest';

import {
  bodyReferencesNumber,
  buildContextPack,
  computeCiRollup,
  countUnresolvedThreads,
  extractLinkedIssueNumbers,
  extractParentEpic,
  extractPathTokens,
  filterExistingPaths,
  isBotLogin,
  isPullRequest,
  mapSkills,
  nextStep,
  parseArgs,
  renderMarkdown,
  selectComments,
  truncateBody,
  truncateCommentBody,
} from './ctx.mjs';

describe('parseArgs', () => {
  it('番号のみ指定した既定値', () => {
    expect(parseArgs(['2550'])).toEqual({
      number: 2550,
      json: false,
      comments: 5,
      bodyLines: 60,
      allComments: false,
    });
  });

  it('--json / --comments / --body-lines / --all-comments を解釈する', () => {
    expect(
      parseArgs(['2550', '--json', '--comments', '3', '--body-lines', '10', '--all-comments']),
    ).toEqual({
      number: 2550,
      json: true,
      comments: 3,
      bodyLines: 10,
      allComments: true,
    });
  });

  it('番号が無い・不正・複数は例外', () => {
    expect(() => parseArgs([])).toThrow(/番号を 1 つ/);
    expect(() => parseArgs(['abc'])).toThrow(/不正な番号/);
    expect(() => parseArgs(['1', '2'])).toThrow(/番号を 1 つ/);
  });

  it('未知の引数は例外', () => {
    expect(() => parseArgs(['1', '--foo'])).toThrow(/未知の引数/);
  });
});

describe('isPullRequest', () => {
  it('pull_request キーの有無で判定する', () => {
    expect(isPullRequest({ pull_request: { url: 'x' } })).toBe(true);
    expect(isPullRequest({ title: 'issue' })).toBe(false);
    expect(isPullRequest(null)).toBe(false);
  });
});

describe('truncateBody', () => {
  it('maxLines 以下ならそのまま', () => {
    expect(truncateBody('a\nb', 60)).toEqual({ text: 'a\nb', truncated: false, remaining: 0 });
  });

  it('超過分は切り詰めて残り行数を返す', () => {
    const body = Array.from({ length: 65 }, (_, i) => `line${i}`).join('\n');
    const result = truncateBody(body, 60);
    expect(result.truncated).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.text.split('\n')).toHaveLength(60);
  });

  it('bodyLines=0 は切り詰めない', () => {
    const body = 'a\nb\nc';
    expect(truncateBody(body, 0)).toEqual({ text: body, truncated: false, remaining: 0 });
  });
});

describe('truncateCommentBody', () => {
  it('先頭 8 行だけ残す', () => {
    const body = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n');
    expect(truncateCommentBody(body).split('\n')).toHaveLength(8);
  });
});

describe('isBotLogin / selectComments', () => {
  it('[bot] で終わる login を bot 判定する', () => {
    expect(isBotLogin('github-actions[bot]')).toBe(true);
    expect(isBotLogin('tomoya')).toBe(false);
  });

  const comments = [
    { user: { login: 'a' }, created_at: '2026-08-01T00:00:00Z', body: '1' },
    { user: { login: 'github-actions[bot]' }, created_at: '2026-08-02T00:00:00Z', body: '2' },
    { user: { login: 'b' }, created_at: '2026-08-03T00:00:00Z', body: '3' },
    { user: { login: 'c' }, created_at: '2026-08-04T00:00:00Z', body: '4' },
  ];

  it('既定は bot を除外して最新 K 件', () => {
    const selected = selectComments(comments, 2, false);
    expect(selected.map((c) => c.body)).toEqual(['3', '4']);
  });

  it('--all-comments 相当（allComments=true）なら bot も含める', () => {
    const selected = selectComments(comments, 2, true);
    expect(selected.map((c) => c.body)).toEqual(['3', '4']);
    const selectedAll = selectComments(comments, 4, true);
    expect(selectedAll.map((c) => c.body)).toEqual(['1', '2', '3', '4']);
  });

  it('k=0 は空配列', () => {
    expect(selectComments(comments, 0, false)).toEqual([]);
  });
});

describe('extractLinkedIssueNumbers', () => {
  it('単一の Closes/Refs/Fixes を拾う', () => {
    expect(extractLinkedIssueNumbers('Closes #123')).toEqual([123]);
    expect(extractLinkedIssueNumbers('Refs #45 の続き')).toEqual([45]);
    expect(extractLinkedIssueNumbers('Fixes #7')).toEqual([7]);
  });

  it('`Closes #1, #2` は両方を拾う（実際に close するのは先頭のみだが列挙対象にする）', () => {
    expect(extractLinkedIssueNumbers('Closes #1, #2')).toEqual([1, 2]);
  });

  it('複数キーワードの重複は 1 回にまとめる', () => {
    expect(extractLinkedIssueNumbers('Closes #1\n\nRefs #1, #2')).toEqual([1, 2]);
  });

  it('該当なしは空配列', () => {
    expect(extractLinkedIssueNumbers('ただの本文 #1')).toEqual([]);
    expect(extractLinkedIssueNumbers(null)).toEqual([]);
  });
});

describe('extractParentEpic', () => {
  it('sub-issue of #M を優先する', () => {
    expect(extractParentEpic('sub-issue of #10\nRefs #20')).toBe(10);
  });

  it('無ければ Refs #M の初出', () => {
    expect(extractParentEpic('本文\nRefs #20\nRefs #30')).toBe(20);
  });

  it('どちらも無ければ null', () => {
    expect(extractParentEpic('ただの本文')).toBeNull();
    expect(extractParentEpic(null)).toBeNull();
  });
});

describe('bodyReferencesNumber', () => {
  it('Closes #12 が #12 に一致し #120 には一致しない', () => {
    expect(bodyReferencesNumber('Closes #12', 12)).toBe(true);
    expect(bodyReferencesNumber('Closes #120', 12)).toBe(false);
  });

  it('カンマ区切りの 2 番目も一致する', () => {
    expect(bodyReferencesNumber('Closes #1, #2', 2)).toBe(true);
  });
});

describe('extractPathTokens / filterExistingPaths', () => {
  it('拡張子付き path らしき token を抽出する', () => {
    expect(extractPathTokens('see apps/product/src/foo.ts and docs/bar.md, done')).toEqual([
      'apps/product/src/foo.ts',
      'docs/bar.md',
    ]);
  });

  it('existsFn で実在するものだけ残す', () => {
    const existsFn = (p: string) => p.endsWith('real.ts');
    const result = filterExistingPaths(['a/real.ts', 'b/fake.ts'], existsFn, '/repo');
    expect(result).toEqual(['a/real.ts']);
  });
});

describe('computeCiRollup', () => {
  it('CheckRun の conclusion / StatusContext の state を分類する', () => {
    const rollup = [
      { conclusion: 'SUCCESS' },
      { conclusion: 'FAILURE' },
      { status: 'IN_PROGRESS' },
      { state: 'PENDING' },
      { state: 'ERROR' },
    ];
    expect(computeCiRollup(rollup)).toEqual({ success: 1, failure: 2, pending: 2 });
  });

  it('空配列は全 0', () => {
    expect(computeCiRollup([])).toEqual({ success: 0, failure: 0, pending: 0 });
    expect(computeCiRollup(undefined)).toEqual({ success: 0, failure: 0, pending: 0 });
  });
});

describe('countUnresolvedThreads', () => {
  it('isResolved=false の件数を数える', () => {
    expect(
      countUnresolvedThreads([{ isResolved: true }, { isResolved: false }, { isResolved: false }]),
    ).toBe(2);
  });

  it('空・未取得は 0', () => {
    expect(countUnresolvedThreads([])).toBe(0);
    expect(countUnresolvedThreads(undefined)).toBe(0);
  });
});

describe('mapSkills', () => {
  it('ファイル種別ごとに正しい skill を対応付ける', () => {
    expect(mapSkills(['supabase/migrations/0001_x.sql'], false)).toEqual(['supabase']);
    expect(mapSkills(['apps/product/src/features/foo/server/router.ts'], false)).toEqual([
      'trpc-router-creating',
      'security',
    ]);
    expect(mapSkills(['packages/components/Button.stories.tsx'], false)).toEqual(['storybook']);
    expect(mapSkills(['apps/product/messages/ja/common.json'], false)).toEqual(['i18n']);
    expect(mapSkills(['docs/foo.md'], false)).toEqual(['docs-writing']);
    expect(mapSkills(['scripts/ci/check.mjs'], false)).toEqual(['pr-cross-review']);
    expect(mapSkills(['foo.test.ts'], false)).toEqual(['test']);
  });

  it('protectedRequired なら pr-cross-review を必ず含める', () => {
    expect(mapSkills(['README.md'], true)).toEqual(['pr-cross-review']);
  });

  it('重複は 1 回にまとめる', () => {
    const skills = mapSkills(
      ['apps/product/src/features/foo/server/router.ts', 'foo.test.ts'],
      false,
    );
    expect(new Set(skills).size).toBe(skills.length);
  });
});

describe('nextStep', () => {
  it('issue で紐付く PR が無い', () => {
    expect(nextStep({ kind: 'issue', number: 1, hasLinkedPr: false })).toBe(
      '分解表を issue コメントに書く（routing skill）',
    );
  });

  it('PR draft かつ CI 失敗', () => {
    expect(
      nextStep({ kind: 'pr', number: 1, isDraft: true, ciFailure: true, unresolvedThreads: 0 }),
    ).toBe('失敗 check を直す');
  });

  it('PR ready かつ未解決 thread あり', () => {
    expect(
      nextStep({ kind: 'pr', number: 1, isDraft: false, ciFailure: false, unresolvedThreads: 2 }),
    ).toBe('thread を resolve');
  });

  it('PR green + resolved なら branch:finish', () => {
    expect(
      nextStep({ kind: 'pr', number: 42, isDraft: false, ciFailure: false, unresolvedThreads: 0 }),
    ).toBe('pnpm branch:finish 42');
  });

  it('issue で PR 紐付き済みは空文字', () => {
    expect(nextStep({ kind: 'issue', number: 1, hasLinkedPr: true, linkedPrNumber: 5 })).toBe(
      'linked PR #5 を進める（pnpm ctx 5）',
    );
  });

  it('PR が main から乖離（DIRTY / BEHIND）していれば追従を最優先で促す', () => {
    expect(
      nextStep({
        kind: 'pr',
        number: 7,
        isDraft: false,
        ciFailure: true,
        mergeStateStatus: 'DIRTY',
      }),
    ).toBe('origin/main を merge して追従する（mergeStateStatus: DIRTY）');
    expect(
      nextStep({ kind: 'pr', number: 7, isDraft: true, mergeStateStatus: 'BEHIND' }),
    ).toContain('BEHIND');
  });

  it('draft で CI green・thread ゼロなら ready 化を促す', () => {
    expect(
      nextStep({ kind: 'pr', number: 9, isDraft: true, ciFailure: false, unresolvedThreads: 0 }),
    ).toBe('pnpm check を通して ready 化する（gh pr ready 9）');
  });
});

describe('buildContextPack (execFileImpl 経由の gh 呼び出し形)', () => {
  it('issue: issues API → comments → search prs → pr view(headRefName,files) の順で argv を渡す', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/Dayopt/dayopt/issues/2550`) {
        return JSON.stringify({
          title: 'issue タイトル',
          state: 'open',
          labels: [{ name: 'bug' }],
          milestone: null,
          assignees: [],
          html_url: 'https://github.com/Dayopt/dayopt/issues/2550',
          body: 'Refs #1\n触るファイル: apps/product/src/foo.ts',
        });
      }
      if (
        args[0] === 'api' &&
        args[1] === 'repos/Dayopt/dayopt/issues/2550/comments?per_page=100'
      ) {
        return JSON.stringify([
          { user: { login: 'tomoya' }, created_at: '2026-08-01T00:00:00Z', body: 'コメント' },
        ]);
      }
      if (args[0] === 'api' && args[1] === 'repos/Dayopt/dayopt/issues/1') {
        return JSON.stringify({ state: 'open', title: '親 issue', labels: [] });
      }
      if (args[0] === 'search') {
        return JSON.stringify([{ number: 99, title: 'PR', state: 'MERGED', body: 'Closes #2550' }]);
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          headRefName: 'sonnet/foo-2550',
          files: [{ path: 'apps/product/src/foo.ts' }],
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    });

    const pack = buildContextPack(
      { number: 2550, comments: 5, bodyLines: 60, allComments: false },
      { execFileImpl, existsFn: (p: string) => p.endsWith('foo.ts'), readFileImpl: () => '' },
    );

    expect(pack.kind).toBe('issue');
    expect(pack.header.title).toBe('issue タイトル');
    expect(pack.related.parentEpic).toEqual({ number: 1, state: 'open', title: '親 issue' });
    expect(pack.related.prs).toEqual([
      { number: 99, state: 'MERGED', title: 'PR', headRefName: 'sonnet/foo-2550' },
    ]);
    expect(pack.files).toContain('apps/product/src/foo.ts');
    expect(calls[0]).toEqual(['api', 'repos/Dayopt/dayopt/issues/2550']);
  });

  it('PR: pull_request キー検出後 pr view + graphql(reviewThreads) を呼ぶ', () => {
    const execFileImpl = vi.fn((_cmd: string, args: string[]) => {
      if (args[0] === 'api' && args[1] === `repos/Dayopt/dayopt/issues/2549`) {
        return JSON.stringify({ pull_request: { url: 'x' } });
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 2549,
          title: 'PR タイトル',
          state: 'OPEN',
          url: 'https://github.com/Dayopt/dayopt/pull/2549',
          labels: [],
          milestone: null,
          assignees: [],
          headRefName: 'sonnet/foo',
          baseRefName: 'main',
          isDraft: false,
          mergeStateStatus: 'CLEAN',
          reviewDecision: 'APPROVED',
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          body: 'Closes #2550',
          files: [{ path: 'apps/product/src/foo.ts' }],
        });
      }
      if (args[0] === 'api' && args[1] === 'graphql') {
        expect(args.some((a) => a.includes('reviewThreads'))).toBe(true);
        return JSON.stringify({
          data: {
            repository: { pullRequest: { reviewThreads: { nodes: [{ isResolved: true }] } } },
          },
        });
      }
      if (
        args[0] === 'api' &&
        args[1] === 'repos/Dayopt/dayopt/issues/2549/comments?per_page=100'
      ) {
        return JSON.stringify([]);
      }
      if (args[0] === 'api' && args[1] === 'repos/Dayopt/dayopt/issues/2550') {
        return JSON.stringify({ state: 'closed', title: '紐付け issue', labels: [] });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    });

    const pack = buildContextPack(
      { number: 2549, comments: 5, bodyLines: 60, allComments: false },
      { execFileImpl, existsFn: () => false, readFileImpl: () => '' },
    );

    expect(pack.kind).toBe('pr');
    expect(pack.header.headRefName).toBe('sonnet/foo');
    expect(pack.header.unresolvedThreads).toBe(0);
    expect(pack.related.linkedIssues).toEqual([
      { number: 2550, state: 'closed', title: '紐付け issue', labels: [] },
    ]);
    expect(pack.nextStep).toBe('pnpm branch:finish 2549');
  });

  it('gh 呼び出し全滅でも例外にせず未取得の pack を返す', () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('gh not found');
    });
    const pack = buildContextPack(
      { number: 1, comments: 5, bodyLines: 60, allComments: false },
      {
        execFileImpl,
        existsFn: () => false,
        readFileImpl: () => {
          throw new Error('no file');
        },
      },
    );
    expect(pack.kind).toBe('issue');
    expect(pack.header.title).toBeNull();
    expect(pack.comments).toBeNull();
    expect(pack.protectedRequired).toBe(false);
  });
});

describe('renderMarkdown', () => {
  it('固定 fixture で全セクションを描画し150行以内に収める', () => {
    const pack = {
      number: 2549,
      kind: 'pr' as const,
      header: {
        title: 'PR タイトル',
        state: 'OPEN',
        labels: ['area:ctx'],
        milestone: null,
        assignee: 'tomoya',
        url: 'https://github.com/Dayopt/dayopt/pull/2549',
        headRefName: 'sonnet/foo',
        baseRefName: 'main',
        isDraft: false,
        mergeStateStatus: 'CLEAN',
        reviewDecision: 'APPROVED',
        ciRollup: { success: 3, failure: 0, pending: 0 },
        unresolvedThreads: 0,
      },
      body: { text: '本文の抜粋', truncated: true, remaining: 10 },
      comments: [{ author: 'tomoya', date: '2026-08-01', body: 'レビューコメント' }],
      related: {
        parentEpic: null,
        prs: null,
        linkedIssues: [{ number: 2550, state: 'closed', title: '紐付け issue', labels: ['bug'] }],
      },
      files: ['apps/product/src/foo.ts', 'scripts/ci/check.mjs'],
      protectedRequired: true,
      decisionLines: ['2026-08-01 #2549 の決定ログ行'],
      skills: ['pr-cross-review', 'test'],
      nextStep: 'pnpm branch:finish 2549',
    };

    const markdown = renderMarkdown(pack);
    expect(markdown).toContain('### #2549 PR タイトル');
    expect(markdown).toContain('種別: PR');
    expect(markdown).toContain('sonnet/foo → main');
    expect(markdown).toContain('CI: SUCCESS 3 / FAILURE 0 / PENDING 0');
    expect(markdown).toContain('未解決 thread: 0');
    expect(markdown).toContain('#### 本文');
    expect(markdown).toContain('…（残り 10 行）');
    expect(markdown).toContain('#### 直近コメント（最新 1 件）');
    expect(markdown).toContain('#### 関連');
    expect(markdown).toContain('#2550 closed 紐付け issue [bug]');
    expect(markdown).toContain('#### 触るファイル');
    expect(markdown).toContain('保護対象: 必要');
    expect(markdown).toContain('#### 決定ログ');
    expect(markdown).toContain('#### 関連 skill 候補');
    expect(markdown).toContain('次の一手: pnpm branch:finish 2549');
    expect(markdown.split('\n').length).toBeLessThanOrEqual(150);
  });

  it('空セクションは丸ごと省く', () => {
    const pack = {
      number: 1,
      kind: 'issue' as const,
      header: {
        title: 'issue',
        state: 'open',
        labels: [],
        milestone: null,
        assignee: null,
        url: 'x',
      },
      body: { text: '', truncated: false, remaining: 0 },
      comments: [],
      related: { parentEpic: null, prs: null, linkedIssues: null },
      files: null,
      protectedRequired: null,
      decisionLines: [],
      skills: [],
      nextStep: '',
    };
    const markdown = renderMarkdown(pack);
    expect(markdown).not.toContain('直近コメント');
    expect(markdown).not.toContain('関連');
    expect(markdown).not.toContain('触るファイル');
    expect(markdown).not.toContain('決定ログ');
    expect(markdown).not.toContain('skill');
    expect(markdown).not.toContain('次の一手');
  });
});
