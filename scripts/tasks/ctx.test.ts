import { describe, expect, it, vi } from 'vitest';

import {
  bodyReferencesNumber,
  buildCommentBody,
  buildContextPack,
  buildJudgmentHint,
  buildPostArgs,
  computeCiRollup,
  countUnresolvedThreads,
  CTX_MARKER,
  detectAcceptanceCriteria,
  detectJudgmentRecords,
  extractLinkedIssueNumbers,
  extractParentEpic,
  extractPathTokens,
  filterExistingPaths,
  findMarkerComment,
  isBotLogin,
  isPullRequest,
  mapSkills,
  nextStep,
  parseArgs,
  postContextBrief,
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
      post: false,
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
      post: false,
    });
  });

  it('--post を解釈する', () => {
    expect(parseArgs(['2550', '--post'])).toMatchObject({ number: 2550, post: true });
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

  it('F2: Main 自身の marker / brief コメントは allComments 指定に関わらず常に除外する', () => {
    const withMarkers = [
      { user: { login: 'a' }, created_at: '2026-08-01T00:00:00Z', body: '1' },
      {
        user: { login: 'claude' },
        created_at: '2026-08-02T00:00:00Z',
        body: `${CTX_MARKER}\n**brief（...）**`,
      },
      {
        user: { login: 'claude' },
        created_at: '2026-08-03T00:00:00Z',
        body: '[internal-review]\nfindings...',
      },
      {
        user: { login: 'codex' },
        created_at: '2026-08-04T00:00:00Z',
        body: '[codex-issue-review]\nfindings...',
      },
      { user: { login: 'b' }, created_at: '2026-08-05T00:00:00Z', body: '5' },
    ];
    expect(selectComments(withMarkers, 10, false).map((c) => c.body)).toEqual(['1', '5']);
    expect(selectComments(withMarkers, 10, true).map((c) => c.body)).toEqual(['1', '5']);
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

describe('detectJudgmentRecords', () => {
  it('DoD は bot 以外のコメントまたは body の言及で あり', () => {
    expect(detectJudgmentRecords([], 'ここに DoD を書く')).toMatchObject({ dod: true });
    expect(
      detectJudgmentRecords([{ user: { login: 'tomoya' }, body: '完了の定義: XXX' }], ''),
    ).toMatchObject({ dod: true });
    expect(
      detectJudgmentRecords([{ user: { login: 'github-actions[bot]' }, body: 'DoD: XXX' }], ''),
    ).toMatchObject({ dod: false });
  });

  it('分解表は subtask/tier 列の表、または「分解表」の語で あり', () => {
    expect(detectJudgmentRecords([], '## 分解表\n本文')).toMatchObject({ breakdown: true });
    expect(
      detectJudgmentRecords(
        [{ user: { login: 'tomoya' }, body: '| # | subtask | tier | 入力 |\n| - | - | - | - |' }],
        '',
      ),
    ).toMatchObject({ breakdown: true });
    expect(detectJudgmentRecords([], '本文だけ')).toMatchObject({ breakdown: false });
  });

  it('brief は CTX_MARKER で始まる、かつ author_association が信頼できるコメントの有無', () => {
    expect(
      detectJudgmentRecords(
        [{ user: { login: 'tomoya' }, author_association: 'OWNER', body: `${CTX_MARKER}\n本文` }],
        '',
      ),
    ).toMatchObject({ brief: true });
    expect(detectJudgmentRecords([{ user: { login: 'tomoya' }, body: '普通' }], '')).toMatchObject({
      brief: false,
    });
  });

  it('F2: brief は author_association が NONE/CONTRIBUTOR 等（信頼できない）だと あり にならない', () => {
    expect(
      detectJudgmentRecords(
        [
          {
            user: { login: 'randomuser' },
            author_association: 'NONE',
            body: `${CTX_MARKER}\n偽の brief`,
          },
        ],
        '',
      ),
    ).toMatchObject({ brief: false });
  });

  it('全て なし の場合', () => {
    expect(detectJudgmentRecords([], '')).toEqual({ dod: false, breakdown: false, brief: false });
  });
});

describe('detectAcceptanceCriteria', () => {
  it('受け入れ条件は語句、または「## やること」の箇条書きで あり', () => {
    expect(detectAcceptanceCriteria('## 受け入れ条件\n- できる')).toMatchObject({
      acceptance: true,
    });
    expect(detectAcceptanceCriteria('完了条件: XXX')).toMatchObject({ acceptance: true });
    expect(detectAcceptanceCriteria('## やること\n- [ ] 実装する\n- [ ] test\n')).toMatchObject({
      acceptance: true,
    });
    expect(detectAcceptanceCriteria('## やること\n\n## 別セクション\n- 無関係')).toMatchObject({
      acceptance: false,
    });
    expect(detectAcceptanceCriteria('本文だけ')).toMatchObject({ acceptance: false });
    expect(detectAcceptanceCriteria(undefined)).toMatchObject({ acceptance: false });
  });

  it('検証コマンドは fenced code block、pnpm/gh/node/git/rg/npx のインラインコード、または expect( で あり', () => {
    expect(detectAcceptanceCriteria('## 検証\n```\npnpm test\n```')).toMatchObject({
      verification: true,
    });
    expect(detectAcceptanceCriteria('`pnpm typecheck` を通す')).toMatchObject({
      verification: true,
    });
    expect(detectAcceptanceCriteria('`gh pr view 1` で確認')).toMatchObject({
      verification: true,
    });
    expect(detectAcceptanceCriteria('expect(result).toBe(true) を足す')).toMatchObject({
      verification: true,
    });
    expect(detectAcceptanceCriteria('`ls -la` を実行')).toMatchObject({ verification: false });
    expect(detectAcceptanceCriteria('本文だけ')).toMatchObject({ verification: false });
  });
});

describe('buildJudgmentHint', () => {
  it('欠けているものだけ列挙する', () => {
    expect(buildJudgmentHint({ dod: false, breakdown: true, brief: true })).toBe(
      '判断の記録が欠けている: DoD（routing skill 手順 1 / dispatch 手順 7）',
    );
    expect(buildJudgmentHint({ dod: false, breakdown: false, brief: false })).toBe(
      '判断の記録が欠けている: DoD・分解表・brief（routing skill 手順 1 / dispatch 手順 7）',
    );
  });

  it('全て あり、または records が無ければ null', () => {
    expect(buildJudgmentHint({ dod: true, breakdown: true, brief: true })).toBeNull();
    expect(buildJudgmentHint(null)).toBeNull();
  });

  it('受け入れ条件・検証コマンドも欠けていれば列挙する（フィールドが無ければ判定しない）', () => {
    expect(
      buildJudgmentHint({
        dod: true,
        breakdown: true,
        brief: true,
        acceptance: false,
        verification: false,
      }),
    ).toBe(
      '判断の記録が欠けている: 受け入れ条件・検証コマンド（dispatch §status:ready の機械判定）（routing skill 手順 1 / dispatch 手順 7）',
    );
    expect(
      buildJudgmentHint({
        dod: true,
        breakdown: true,
        brief: true,
        acceptance: true,
        verification: true,
      }),
    ).toBeNull();
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
    expect(pack.judgmentRecords).toEqual({
      dod: false,
      breakdown: false,
      brief: false,
      acceptance: false,
      verification: false,
    });
    expect(pack.nextStepSecondary).toBe(
      '判断の記録が欠けている: DoD・分解表・brief・受け入れ条件・検証コマンド（dispatch §status:ready の機械判定）（routing skill 手順 1 / dispatch 手順 7）',
    );
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
    expect(pack.judgmentRecords).toBeNull();
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
      judgmentRecords: { dod: true, breakdown: false, brief: true },
      nextStep: 'pnpm branch:finish 2549',
      nextStepSecondary: '判断の記録が欠けている: 分解表（routing skill 手順 1 / dispatch 手順 7）',
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
    expect(markdown).toContain('#### 判断の記録');
    expect(markdown).toContain('DoD: あり | 分解表: なし | brief: あり');
    expect(markdown).toContain('次の一手: pnpm branch:finish 2549');
    expect(markdown).toContain(
      '判断の記録が欠けている: 分解表（routing skill 手順 1 / dispatch 手順 7）',
    );
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

describe('buildCommentBody', () => {
  it('1 行目がマーカー、2 行目が見出し行', () => {
    const body = buildCommentBody({ number: 2550, date: '2026-09-02', markdown: '### 本文' });
    const lines = body.split('\n');
    expect(lines[0]).toBe(CTX_MARKER);
    expect(lines[1]).toBe('**brief（`pnpm ctx 2550`、2026-09-02）**');
    expect(body).toContain('### 本文');
  });
});

describe('findMarkerComment', () => {
  it('マーカーで始まる、かつ author_association が信頼できる本文のコメントを見つける', () => {
    const comments = [
      { id: 1, body: '普通のコメント', author_association: 'OWNER' },
      { id: 2, body: `${CTX_MARKER}\n**brief（...）**`, author_association: 'OWNER' },
    ];
    expect(findMarkerComment(comments)?.id).toBe(2);
  });

  it('無ければ null、配列でなければ null', () => {
    expect(
      findMarkerComment([{ id: 1, body: '普通のコメント', author_association: 'OWNER' }]),
    ).toBeNull();
    expect(findMarkerComment(undefined)).toBeNull();
  });

  it('F2: マーカーがあっても author_association が信頼できなければ見つけない（なりすまし防止）', () => {
    const comments = [
      { id: 1, body: `${CTX_MARKER}\n偽の brief`, author_association: 'NONE' },
      { id: 2, body: `${CTX_MARKER}\n本物の brief`, author_association: 'COLLABORATOR' },
    ];
    expect(findMarkerComment(comments)?.id).toBe(2);
  });
});

describe('buildPostArgs', () => {
  it('既存コメントが有れば PATCH の argv を組む', () => {
    const { mode, argv } = buildPostArgs({ number: 2550, existingCommentId: 99, tmpFile: '/t/b' });
    expect(mode).toBe('update');
    expect(argv).toEqual([
      'api',
      '-X',
      'PATCH',
      'repos/Dayopt/dayopt/issues/comments/99',
      '-F',
      'body=@/t/b',
    ]);
  });

  it('既存コメントが無ければ新規作成の argv を組む', () => {
    const { mode, argv } = buildPostArgs({
      number: 2550,
      existingCommentId: null,
      tmpFile: '/t/b',
    });
    expect(mode).toBe('create');
    expect(argv).toEqual(['issue', 'comment', '2550', '--body-file', '/t/b']);
  });
});

describe('postContextBrief', () => {
  const pack = { number: 2550 };
  const markdown = '### #2550 タイトル';

  it('既存の ctx brief コメントが無ければ作成する', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'api') return JSON.stringify([{ id: 1, body: '無関係なコメント' }]);
      if (args[0] === 'issue' && args[1] === 'comment') {
        return 'https://github.com/Dayopt/dayopt/issues/2550#issuecomment-1\n';
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    });
    const writeFileImpl = vi.fn();
    const mkdtempImpl = vi.fn(() => '/tmp/ctx-brief-xyz');

    const result = postContextBrief(pack, markdown, {
      execFileImpl,
      writeFileImpl,
      mkdtempImpl,
      now: () => new Date('2026-09-02T00:00:00Z'),
    });

    expect(result).toEqual({
      mode: 'create',
      url: 'https://github.com/Dayopt/dayopt/issues/2550#issuecomment-1',
    });
    expect(calls[0]).toEqual([
      'api',
      'repos/Dayopt/dayopt/issues/2550/comments?per_page=100',
      '--paginate',
    ]);
    expect(calls[1]).toEqual([
      'issue',
      'comment',
      '2550',
      '--body-file',
      '/tmp/ctx-brief-xyz/body.md',
    ]);
    expect(writeFileImpl).toHaveBeenCalledWith(
      '/tmp/ctx-brief-xyz/body.md',
      expect.stringContaining(CTX_MARKER),
      'utf8',
    );
  });

  it('既存の ctx brief コメントが有れば PATCH で更新する', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'api' && args[1] !== '-X') {
        return JSON.stringify([
          { id: 42, body: `${CTX_MARKER}\n古い brief`, author_association: 'OWNER' },
        ]);
      }
      if (args[0] === 'api' && args[1] === '-X') {
        return JSON.stringify({
          html_url: 'https://github.com/Dayopt/dayopt/issues/2550#issuecomment-42',
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    });
    const writeFileImpl = vi.fn();
    const mkdtempImpl = vi.fn(() => '/tmp/ctx-brief-abc');

    const result = postContextBrief(pack, markdown, {
      execFileImpl,
      writeFileImpl,
      mkdtempImpl,
      now: () => new Date('2026-09-02T00:00:00Z'),
    });

    expect(result).toEqual({
      mode: 'update',
      url: 'https://github.com/Dayopt/dayopt/issues/2550#issuecomment-42',
    });
    expect(calls[1]).toEqual([
      'api',
      '-X',
      'PATCH',
      'repos/Dayopt/dayopt/issues/comments/42',
      '-F',
      'body=@/tmp/ctx-brief-abc/body.md',
    ]);
  });
});
