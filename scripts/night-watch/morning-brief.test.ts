import { describe, expect, it, vi } from 'vitest';

import {
  buildBranchNameCandidate,
  buildMorningBriefBody,
  HANDOFF_HEADINGS,
  judgeHandoffQuality,
  runMorningBrief,
} from './morning-brief.mjs';

const FULL_BODY = `## 背景

なぜやるかの説明。

## やること

1. 手順1
2. 手順2

## 注意

既知の罠。

## 検証

pnpm check
`;

function expectMissing(result: ReturnType<typeof judgeHandoffQuality>, missing: string[]) {
  expect(result.status).toBe('incomplete');
  if (result.status !== 'incomplete') throw new Error('unreachable');
  expect(result.missing).toEqual(missing);
}

describe('judgeHandoffQuality', () => {
  it('4見出しがすべて揃い非空なら ready', () => {
    expect(judgeHandoffQuality(FULL_BODY)).toEqual({ status: 'ready' });
  });

  it('見出しが欠落していれば incomplete で欠落見出しを列挙する', () => {
    const body = FULL_BODY.replace(/## 検証[\s\S]*$/, '');
    expectMissing(judgeHandoffQuality(body), ['## 検証']);
  });

  it('見出しはあるが配下が空なら incomplete', () => {
    const body = FULL_BODY.replace('既知の罠。', '');
    expectMissing(judgeHandoffQuality(body), ['## 注意']);
  });

  it('見出し配下が TBD のままなら incomplete', () => {
    const body = FULL_BODY.replace('1. 手順1\n2. 手順2', 'TBD');
    expectMissing(judgeHandoffQuality(body), ['## やること']);
  });

  it('body が null/undefined なら全見出し欠落として扱う', () => {
    expectMissing(judgeHandoffQuality(undefined), HANDOFF_HEADINGS);
  });

  it('複数見出しが同時に欠落すれば両方列挙する', () => {
    const body = '## 背景\n\n説明\n\n## やること\n\n手順\n';
    expectMissing(judgeHandoffQuality(body), ['## 注意', '## 検証']);
  });
});

describe('buildBranchNameCandidate', () => {
  it('type(scope): title 形式から scope を domain として使う', () => {
    expect(buildBranchNameCandidate('ops(night-watch): 何かする', 2370)).toBe(
      'claude/night-watch-2370',
    );
  });

  it('prefix が無い title は misc domain になる', () => {
    expect(buildBranchNameCandidate('プレフィックスなしのタイトル', 42)).toBe('claude/misc-42');
  });

  it('agent を指定するとその prefix になる', () => {
    expect(buildBranchNameCandidate('fix(auth): x', 1, { agent: 'sonnet' })).toBe('sonnet/auth-1');
  });
});

describe('buildMorningBriefBody', () => {
  it('ready issue の本文不備・in-progress の stale・milestone 未付与を反映する', () => {
    const now = new Date('2026-08-25T05:00:00+09:00').getTime();
    const body = buildMorningBriefBody({
      readyIssues: [
        { number: 1, title: '完備 issue', body: FULL_BODY, milestone: null },
        { number: 2, title: '不備 issue', body: '## 背景\n\n説明\n', milestone: null },
      ],
      inProgressIssues: [
        {
          number: 3,
          title: '古い issue',
          updatedAt: new Date(now - 72 * 60 * 60 * 1000).toISOString(), // 72h前
          milestone: { title: 'v0.35.0' },
        },
        {
          number: 4,
          title: '新しい issue',
          updatedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(), // 1h前
          milestone: null,
        },
      ],
      openPrs: [
        {
          number: 10,
          title: 'あるPR',
          isDraft: true,
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          milestone: { title: 'v0.35.0' },
        },
      ],
      currentMilestoneTitle: 'v0.35.0',
      now,
    });

    expect(body).toContain('#1（dispatch可能）');
    expect(body).toContain('#2（本文不備（## やること, ## 注意, ## 検証 欠落））');
    expect(body).toContain('#3: 古い issue ⚠️stale（48h超）');
    expect(body).toContain('#4: 新しい issue');
    expect(body).not.toContain('#4: 新しい issue ⚠️stale');
    expect(body).toContain('milestone 未付与（現行: v0.35.0）');
    // in-progress #3 は current milestone を持つため missing に出ない、#4 は無いため出る
    expect(body).toContain('in-progress issue: #4');
    // PR #10 は current milestone を持つため PR 側は「なし」
    expect(body).toContain('- PR: なし');
    // #1 のみ dispatch 可能なので chip 下書きは 1 件だけ
    expect(body).toContain('#### #1: 完備 issue');
    expect(body).not.toContain('#### #2:');
    expect(body).toContain('指示の効力を持たない');
  });

  it('全カテゴリ空でも該当なしで正しくレンダリングする', () => {
    const body = buildMorningBriefBody({
      readyIssues: [],
      inProgressIssues: [],
      openPrs: [],
      currentMilestoneTitle: null,
      now: Date.now(),
    });
    expect(body).toContain('（該当なし）');
    expect(body).toContain('milestone 未付与（現行: 不明）');
    expect(body).toContain('（dispatch可能な issue なし）');
  });
});

describe('runMorningBrief', () => {
  it('当日盤面 issue が無ければ gh を追加で呼ばず skip する', () => {
    const execFileImpl = vi.fn(() => JSON.stringify([])); // findTodayBoardIssue が空配列を返す
    const result = runMorningBrief({ execFileImpl, now: Date.now() });
    expect(result).toEqual({ action: 'skipped', reason: 'no-board-issue' });
    // findTodayBoardIssue の issue list 呼び出し 1 回だけで、他の観測 gh は呼ばれない。
    expect(execFileImpl).toHaveBeenCalledTimes(1);
  });

  it('当日盤面 issue があれば観測を集め、盤面へ 1 コメントを投稿する', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      calls.push(args);
      if (args.includes('type:board')) {
        return JSON.stringify([{ number: 9101, title: '盤面 2026-08-25' }]);
      }
      if (args[0] === 'issue' && args[1] === 'list' && args.includes('status:ready')) {
        return JSON.stringify([]);
      }
      if (args[0] === 'issue' && args[1] === 'list' && args.includes('status:in-progress')) {
        return JSON.stringify([]);
      }
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([]);
      }
      if (args[0] === 'api') {
        return JSON.stringify([]);
      }
      if (args[0] === 'issue' && args[1] === 'comment') {
        return '';
      }
      throw new Error(`unmocked: ${args.join(' ')}`);
    });

    const result = runMorningBrief({ execFileImpl, now: Date.now() });
    expect(result).toEqual({ action: 'posted', boardIssueNumber: 9101 });
    const commentCall = calls.find((args) => args[0] === 'issue' && args[1] === 'comment');
    expect(commentCall?.[2]).toBe('9101');
  });
});
