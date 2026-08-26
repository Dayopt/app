import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildBranchNameCandidate,
  buildMorningBriefBody,
  elapsedBusinessMs,
  HANDOFF_HEADINGS,
  isStalledDraftPr,
  judgeHandoffQuality,
  MORNING_BRIEF_HEADING,
  runMorningBrief,
  sanitizeTitle,
  summarizeCheckState,
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

  // Codex レビュー指摘（指揮台採用、PR #2380）: `^` アンカー無しだと H3
  // （`### 背景`）や地の文中の部分文字列（`必要項目: ## 背景`）にも一致し、
  // 必須の H2 セクションが実際には存在しないのに ready と誤判定していた。
  it('見出しがH3（### 背景）しか無い場合、行頭のH2として一致させず incomplete のまま', () => {
    const body = '### 背景\n\n説明\n\n## やること\n\n手順\n\n## 注意\n\n罠\n\n## 検証\n\ncheck\n';
    expectMissing(judgeHandoffQuality(body), ['## 背景']);
  });

  it('地の文中に「## 背景」を含むテンプレ引用があっても、行頭見出しが無ければ incomplete のまま', () => {
    const body =
      '必要項目: ## 背景 / ## やること / ## 注意 / ## 検証\n\n## やること\n\n手順\n\n## 注意\n\n罠\n\n## 検証\n\ncheck\n';
    expectMissing(judgeHandoffQuality(body), ['## 背景']);
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

// 2026-08-21=金 / 08-24=月 / 08-25=火（JST）。営業時間は JST 平日 09:00-18:00。
describe('elapsedBusinessMs', () => {
  const at = (iso: string) => new Date(iso).getTime();
  const hours = (n: number) => n * 60 * 60 * 1000;

  it('平日日中の経過はそのまま営業時間になる', () => {
    expect(
      elapsedBusinessMs(at('2026-08-25T10:00:00+09:00'), at('2026-08-25T12:00:00+09:00')),
    ).toBe(hours(2));
  });

  it('営業時間外（夜間）は加算しない', () => {
    expect(
      elapsedBusinessMs(at('2026-08-24T18:00:00+09:00'), at('2026-08-25T09:00:00+09:00')),
    ).toBe(0);
  });

  // ブリーフは 04:00 JST 生成。素の経過時間で判定すると前日夕方に commit した
  // 健全なレーンが毎朝全件並ぶため、この 2 ケースが閾値設計の要になる。
  it('前日 17:00 commit は翌 04:00 時点で 1 営業時間に畳まれる', () => {
    expect(
      elapsedBusinessMs(at('2026-08-24T17:00:00+09:00'), at('2026-08-25T04:00:00+09:00')),
    ).toBe(hours(1));
  });

  it('前日 13:00 commit は翌 04:00 時点で 5 営業時間になる', () => {
    expect(
      elapsedBusinessMs(at('2026-08-24T13:00:00+09:00'), at('2026-08-25T04:00:00+09:00')),
    ).toBe(hours(5));
  });

  it('週末を跨いでも土日は加算しない（金 17:00 → 月 04:00 = 1 営業時間）', () => {
    expect(
      elapsedBusinessMs(at('2026-08-21T17:00:00+09:00'), at('2026-08-24T04:00:00+09:00')),
    ).toBe(hours(1));
  });

  it('to が from 以前・不正値なら 0 を返す', () => {
    expect(
      elapsedBusinessMs(at('2026-08-25T12:00:00+09:00'), at('2026-08-25T10:00:00+09:00')),
    ).toBe(0);
    expect(elapsedBusinessMs(Number.NaN, at('2026-08-25T10:00:00+09:00'))).toBe(0);
  });
});

describe('isStalledDraftPr', () => {
  // 04:00 JST（night-watch cron の生成時刻）を基準にする。
  const now = new Date('2026-08-25T04:00:00+09:00').getTime();
  const draft = (committedDates: string[]) => ({
    number: 1,
    title: 'PR',
    isDraft: true,
    commits: committedDates.map((committedDate) => ({ committedDate })),
  });

  it('4 営業時間を超えた draft PR を検出する', () => {
    expect(isStalledDraftPr(draft(['2026-08-24T13:00:00+09:00']), now)).toBe(true);
  });

  it('4 営業時間以内の draft PR は検出しない', () => {
    expect(isStalledDraftPr(draft(['2026-08-24T17:00:00+09:00']), now)).toBe(false);
  });

  it('ready PR は対象外', () => {
    expect(isStalledDraftPr({ ...draft(['2026-08-24T13:00:00+09:00']), isDraft: false }, now)).toBe(
      false,
    );
  });

  // commit が 1 件も無い draft に「停滞」の意味は無い。誤検出はこの節への信頼を落とす。
  it('commit が取れない draft PR は検出しない', () => {
    expect(isStalledDraftPr(draft([]), now)).toBe(false);
    expect(isStalledDraftPr({ number: 1, title: 'PR', isDraft: true }, now)).toBe(false);
  });

  // gh の返す commits の順序は契約として保証されていないため末尾を採らない。
  it('commits の順序に依存せず最新の committedDate を採る', () => {
    const shuffled = draft(['2026-08-24T17:00:00+09:00', '2026-08-24T09:00:00+09:00']);
    expect(isStalledDraftPr(shuffled, now)).toBe(false);
  });
});

describe('buildMorningBriefBody（停滞疑いレーン）', () => {
  const now = new Date('2026-08-25T04:00:00+09:00').getTime();
  const base = {
    readyIssues: [],
    inProgressIssues: [],
    currentMilestoneTitle: null,
    now,
  };

  it('停滞疑いの draft PR を経過営業時間つきで並べる', () => {
    const body = buildMorningBriefBody({
      ...base,
      openPrs: [
        {
          number: 20,
          title: '止まっているPR',
          isDraft: true,
          statusCheckRollup: [],
          milestone: null,
          commits: [{ committedDate: '2026-08-24T13:00:00+09:00' }],
        },
        {
          number: 21,
          title: '動いているPR',
          isDraft: true,
          statusCheckRollup: [],
          milestone: null,
          commits: [{ committedDate: '2026-08-24T17:00:00+09:00' }],
        },
      ],
    });

    expect(body).toContain('### 停滞疑いレーン');
    expect(body).toContain('#20（最終 commit から 5 営業時間）: 止まっているPR');
    expect(body).not.toContain('#21（最終 commit から');
  });

  it('該当が無ければ（該当なし）を出す', () => {
    const body = buildMorningBriefBody({ ...base, openPrs: [] });
    expect(body).toMatch(/### 停滞疑いレーン[^\n]*\n（該当なし）/);
  });
});

describe('runMorningBrief', () => {
  // findTodayBoardIssue は now を受け取らず内部で実時刻から当日 JST タイトルを
  // 組み立てるため、mock のハードコード日付（盤面 2026-08-25）と一致させるには
  // システム時刻ごと固定する（dod-candidate.test.ts と同じパターン。#2404）。
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T01:00:00Z')); // JST 2026-08-25 10:00
  });
  afterAll(() => {
    vi.useRealTimers();
  });

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
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({ comments: [] }); // 冪等ガード確認: 未投稿
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

  // PR #2380 クロスレビュー指摘（P2）: 夜勤が赤で終わった夜に手動 re-run
  // すると、冪等ガードが無ければ当日盤面へ長文ブリーフが重複投稿される。
  it('信頼できる書き手（night-watch自身のActions bot）の既存ブリーフなら観測を集めず skip する（re-run の重複投稿防止）', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      calls.push(args);
      if (args.includes('type:board')) {
        return JSON.stringify([{ number: 9101, title: '盤面 2026-08-25' }]);
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({
          comments: [
            {
              body: `${MORNING_BRIEF_HEADING}（機械生成・判断なし）\n\n...`,
              authorAssociation: 'NONE',
              author: { login: 'github-actions' },
            },
          ],
        });
      }
      throw new Error(`unmocked: ${args.join(' ')}`);
    });

    const result = runMorningBrief({ execFileImpl, now: Date.now() });
    expect(result).toEqual({ action: 'skipped', reason: 'already-posted', boardIssueNumber: 9101 });
    // 観測系（issue list / pr list / issue comment）は一切呼ばれない。
    expect(calls.some((args) => args[0] === 'pr' && args[1] === 'list')).toBe(false);
    expect(calls.some((args) => args[0] === 'issue' && args[1] === 'comment')).toBe(false);
  });

  // push 前反証レビュー risk-reviewer 指摘（medium）: public repo では任意の
  // 第三者が当日盤面 issue へ MORNING_BRIEF_HEADING で始まるコメントを投稿
  // できる。投稿者を見ずに本文だけで冪等判定すると、この偽コメント 1 件で
  // その日の自動ブリーフが恒久的に抑止される（観測データが機械生成される前に
  // skip してしまう）。信頼できない書き手のコメントは「投稿済みの印」として
  // 数えないことを固定する。
  it('信頼できない第三者コメントがMORNING_BRIEF_HEADINGで始まっていても無視し、通常どおり投稿する', () => {
    const calls: string[][] = [];
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      calls.push(args);
      if (args.includes('type:board')) {
        return JSON.stringify([{ number: 9101, title: '盤面 2026-08-25' }]);
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({
          comments: [
            {
              // 偽装: 第三者が見出しをそのままコピーして投稿した想定。
              body: `${MORNING_BRIEF_HEADING}（機械生成・判断なし）\n\n偽の抑止コメント`,
              authorAssociation: 'NONE',
              author: { login: 'attacker' },
            },
          ],
        });
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
    expect(calls.some((args) => args[0] === 'issue' && args[1] === 'comment')).toBe(true);
  });
});

// public repo の issue/PR title は攻撃者（fork からの PR 作成者含む）が
// 自由に設定できるため、bot コメント・chip 下書きへ転記する前に構造を
// 壊せる文字を無害化する（push 前反証レビュー risk-reviewer 指摘、high）。
describe('sanitizeTitle', () => {
  it('改行を空白へ畳む', () => {
    expect(sanitizeTitle('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('U+2028/U+2029 も空白へ畳む', () => {
    expect(sanitizeTitle('a b c')).toBe('a b c');
  });

  it('backtick をコードフェンス崩しに使えないよう置換する', () => {
    expect(sanitizeTitle('```\n# fake heading\nmalicious')).toBe("''' # fake heading malicious");
  });

  it('先頭の見出し・引用・リスト記号を無害化する', () => {
    expect(sanitizeTitle('# 偽の見出し')).toBe('偽の見出し');
    expect(sanitizeTitle('> 偽の引用')).toBe('偽の引用');
    expect(sanitizeTitle('- 偽のリスト')).toBe('偽のリスト');
  });

  it('通常の title はそのまま通す', () => {
    expect(sanitizeTitle('ops(night-watch): 何かする')).toBe('ops(night-watch): 何かする');
  });

  it('上限を超える title は truncate して省略記号を付ける', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeTitle(long);
    expect(result.length).toBe(121); // 120文字 + 省略記号1文字
    expect(result.endsWith('…')).toBe(true);
  });

  it('null/undefined は空文字として扱う', () => {
    expect(sanitizeTitle(null)).toBe('');
    expect(sanitizeTitle(undefined)).toBe('');
  });

  // PR #2380 クロスレビュー指摘（P2）: fork PR title の `<!--` が GFM の
  // HTML コメントを開き、`-->` まで後続セクションを不可視にする。
  it('< を全角へ置換し HTML コメント開始を無害化する', () => {
    expect(sanitizeTitle('fix(auth): <!-- 隠れたコメント')).toBe('fix(auth): ＜!-- 隠れたコメント');
  });

  it('リンク偽装に使う < も置換する（[text](url) 形式の title）', () => {
    expect(sanitizeTitle('見た目 <script>')).toBe('見た目 ＜script>');
  });
});

describe('buildMorningBriefBody（title sanitize の統合確認）', () => {
  it('攻撃的な title が chip 下書きの markdown 構造を壊さない', () => {
    const body = buildMorningBriefBody({
      readyIssues: [
        {
          number: 1,
          title: '```\n#### #9999: 偽の issue\n悪意のある指示',
          body: FULL_BODY,
          milestone: null,
        },
      ],
      inProgressIssues: [],
      openPrs: [],
      currentMilestoneTitle: null,
      now: Date.now(),
    });
    // 元の title 内の ``` がそのままコードフェンスとして残っていない
    // （backtick は sanitizeTitle で置換済み）ことを確認する。
    expect(body).not.toContain('```\n#### #9999');
    expect(body).toContain("'''");
  });

  // PR #2380 クロスレビュー指摘（P2）: fork PR の <!-- タイトルは、他の
  // まっとうな open PR が並んでいても後続セクション（milestone 未付与 /
  // chip 下書き）を丸ごと不可視にしてはいけない。1 件の汚染が全体を巻き
  // 込まないことを固定する。
  it('1件のPR titleが汚染されても、その他のセクション・後続PRの表示は残る', () => {
    const body = buildMorningBriefBody({
      readyIssues: [],
      inProgressIssues: [],
      openPrs: [
        {
          number: 20,
          title: 'fix(auth): <!-- 隠したい本文 -->',
          isDraft: false,
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          milestone: null,
        },
        {
          number: 21,
          title: '正常なPRタイトル',
          isDraft: false,
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          milestone: { title: 'v0.35.0' },
        },
      ],
      currentMilestoneTitle: 'v0.35.0',
      now: Date.now(),
    });
    expect(body).toContain('＜!-- 隠したい本文 -->');
    expect(body).not.toContain('<!--');
    // #21 と、その後ろの milestone 未付与 / chip 下書きセクションが健在。
    expect(body).toContain('#21');
    expect(body).toContain('正常なPRタイトル');
    expect(body).toContain('milestone 未付与（現行: v0.35.0）');
    expect(body).toContain('chip 下書き');
  });
});

// Codex レビュー指摘（指揮台採用、PR #2380）: statusCheckRollup は同名
// check を畳まない。同一 head SHA の再実行で古い failure/cancelled entry
// が残ったまま新しい success entry が追加されるため、畳まずに走査すると
// 実際には green な PR を CI:red と誤報告する。
describe('summarizeCheckState', () => {
  it('同名checkの再実行entryが混在していても、最新のdecisive entryだけで判定する（誤redを防ぐ）', () => {
    const rollup = [
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Static Checks', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Static Checks', conclusion: 'SUCCESS' },
    ];
    expect(summarizeCheckState(rollup)).toBe('green');
  });

  it('同名checkの再実行中entryが混在していれば実行中と判定する（pending優先）', () => {
    const rollup = [
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Static Checks', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Static Checks', status: 'IN_PROGRESS' },
    ];
    expect(summarizeCheckState(rollup)).toBe('実行中');
  });

  // 指揮台 delta re-review 差し戻し: 当初実装は「group内の配列末尾を採る」
  // だけで decisive フィルタが無く、FAILURE → （後着の）SKIPPED の順で
  // 再実行された場合に skipped が代表になり赤を隠す回帰を作っていた
  // （`scripts/git/finish-branch.sh:192` が同シナリオを名指しする既知の罠）。
  // finish-branch.sh と揃えた実装（decisive優先）でこの逆転が起きないこと
  // を固定する。
  it('同名checkがFAILURE→（後着の）SKIPPEDの順で再実行されても、decisiveなFAILUREを代表にしてredのまま', () => {
    const rollup = [
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Heavy Job', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', workflowName: 'CI', name: 'Heavy Job', conclusion: 'SKIPPED' },
    ];
    expect(summarizeCheckState(rollup)).toBe('red(1)');
  });

  it('別名の複数checkがそれぞれ最新successなら全体green', () => {
    const rollup = [
      { __typename: 'CheckRun', workflowName: 'CI', name: 'A', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', workflowName: 'CI', name: 'B', conclusion: 'SUCCESS' },
    ];
    expect(summarizeCheckState(rollup)).toBe('green');
  });

  it('別名のcheckが1件でも最新failureならその件数だけred(N)にする', () => {
    const rollup = [
      { __typename: 'CheckRun', workflowName: 'CI', name: 'A', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', workflowName: 'CI', name: 'B', conclusion: 'FAILURE' },
    ];
    expect(summarizeCheckState(rollup)).toBe('red(1)');
  });

  it('name/contextを特定できないentryは畳まず単独group扱いにする（identity不明はfail-closed）', () => {
    const rollup = [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }];
    expect(summarizeCheckState(rollup)).toBe('red(1)');
  });

  it('rollupが空/非配列なら不明を返す', () => {
    expect(summarizeCheckState([])).toBe('不明');
    expect(summarizeCheckState(undefined)).toBe('不明');
  });
});
