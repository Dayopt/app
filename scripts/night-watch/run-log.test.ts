import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAlertBudgetLine,
  buildBoardNoteComment,
  buildOpsLogComment,
  checkRecentPending,
  resolveOpsLogIssueNumber,
  runBoardNote,
  runEnvFailure,
  runOpsLogReport,
  validateOpsLogReport,
} from './run-log.mjs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24 10:00
});

afterEach(() => {
  vi.useRealTimers();
});

/** `.find()` の結果が無ければ即失敗させる（テストの意図を明確にする）。 */
function mustFind<T>(items: T[], predicate: (item: T) => boolean): T {
  const found = items.find(predicate);
  if (!found) throw new Error('該当する呼び出しが見つかりません');
  return found;
}

const GREEN_REPORT: import('./run-log.mjs').OpsLogReport = {
  executed: 7,
  failed: [],
  results: [],
  baselineRecommend: [],
  board: { status: 'success', issueNumber: 200 },
  dod: { status: 'candidate', prNumber: 301 },
};

describe('resolveOpsLogIssueNumber', () => {
  it('登録済みなら issue 番号を返す', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**（登録済み）\n';
    expect(resolveOpsLogIssueNumber({ readFileImpl })).toBe(1234);
  });

  it('未登録なら例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **未登録**（この行は指揮台が書き換える）\n';
    expect(() => resolveOpsLogIssueNumber({ readFileImpl })).toThrow(/登録されていません/);
  });
});

describe('validateOpsLogReport', () => {
  it('正しい report は例外を投げない', () => {
    expect(() => validateOpsLogReport(GREEN_REPORT)).not.toThrow();
  });

  it('executed が範囲外なら拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, executed: 8 })).toThrow(/executed/);
  });

  it('failed に未知の check-id があれば拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, failed: ['evil'] })).toThrow(/failed/);
  });

  it('results の checkId が未知なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, results: [{ checkId: 'evil', outcome: 'green' }] }),
    ).toThrow(/results/);
  });

  it('results の outcome=issue で issueNumber が無ければ拒否する', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'docs-check', outcome: 'issue' }],
      }),
    ).toThrow(/results/);
  });

  // Codex 実測指摘（P1）: 旧設計（文字集合 denylist で検証する自由文字列
  // detail）は、prompt injection を受けたセッションが Sentry issue の raw
  // title/message（user email 等を含みうる）を 300 文字ずつ small に分けて
  // public な常設運行記録 issue へ掲載する経路になっていた。alert-issue.mjs
  // の SENTRY_EVIDENCE_RE allowlist を迂回する別の書き込み経路であり、
  // 「安全な文字だけで構成された機微情報の断片」は文字集合の denylist では
  // 塞げない。自由文字列自体を廃止し、既知の失敗理由 enum（board.reason）に
  // 置き換えた。
  it('board.status=fail で未知の reason なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'fail', reason: 'evil' } }),
    ).toThrow(/board.reason/);
  });

  it('board.status=fail で reason が無ければ拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'fail' } })).toThrow(
      /board.reason/,
    );
  });

  it.each(['auth-error', 'rate-limited', 'network-error', 'invalid-response', 'unknown'])(
    'board.status=fail で既知の reason（%s）なら通す',
    (reason) => {
      expect(() =>
        validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'fail', reason } }),
      ).not.toThrow();
    },
  );

  it('未知の board.status は拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'evil' } })).toThrow(
      /board.status/,
    );
  });

  it('未知の dod.status は拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, dod: { status: 'evil' } })).toThrow(
      /dod.status/,
    );
  });

  // #2342: JST 土日は Step 1（盤面起票）・Step 4（DoD候補選定）が
  // isJstWeekend 判定で skip する。旧 schema は 'skip'（起票済み・重複回避）/
  // 'none'（前日merge PR無し）しか持たず、「土日につき skip」という別の意味を
  // 表現できなかった（buildOpsLogComment の文言が事実と異なる形で残る）。
  //
  // #2350 クロスレビュー指摘（P3）: weekend の自己申告と実際の JST 曜日を
  // クロス検証する（平日に weekend を自己申告できてしまう穴を閉じる）。
  // 判定は「今日 or 昨日（JST）が土日」の緩和形（risk-reviewer low 指摘:
  // 「今日のみ」だと、指揮台が土曜分の観測を翌月曜に手動代行で catch-up
  // 投稿した時に throw して唯一の故障検出チャネルが無音化するため）。
  it('board.status=weekend を JST 土日なら通す（追加フィールド不要）', () => {
    vi.setSystemTime(new Date('2026-08-22T01:00:00Z')); // JST 2026-08-22（土）
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'weekend' } }),
    ).not.toThrow();
  });

  it('dod.status=weekend を JST 土日なら通す（追加フィールド不要）', () => {
    vi.setSystemTime(new Date('2026-08-22T01:00:00Z')); // JST 2026-08-22（土）
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, dod: { status: 'weekend' } }),
    ).not.toThrow();
  });

  // global beforeEach の既定時刻（2026-08-24 = JST 月曜）は「昨日が日曜」の
  // catch-up 許容ケースに当たるため、この 2 つの受理テストで直接確認する
  // （既定時刻を流用することで、leniency が意図通り動くことを検証する）。
  it('board.status=weekend を翌営業日（JST月曜、昨日が日曜）の catch-up でも通す', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'weekend' } }),
    ).not.toThrow();
  });

  it('dod.status=weekend を翌営業日（JST月曜、昨日が日曜）の catch-up でも通す', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, dod: { status: 'weekend' } }),
    ).not.toThrow();
  });

  // 今日・昨日のどちらも平日（JST水曜、昨日は火曜）なら拒否する。
  it('board.status=weekend を今日・昨日とも平日（JST水曜）なら拒否する', () => {
    vi.setSystemTime(new Date('2026-08-26T01:00:00Z')); // JST 2026-08-26（水）
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'weekend' } })).toThrow(
      /board\.status="weekend"/,
    );
  });

  it('dod.status=weekend を今日・昨日とも平日（JST水曜）なら拒否する', () => {
    vi.setSystemTime(new Date('2026-08-26T01:00:00Z')); // JST 2026-08-26（水）
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, dod: { status: 'weekend' } })).toThrow(
      /dod\.status="weekend"/,
    );
  });

  // #2350 クロスレビュー指摘（P2-1）: heavy-red/integration-red が pending
  // （直近 run 未完了）と判定される class を、旧設計は「取得失敗」と合流させ
  // ていた（コマンド失敗と区別できなかった）。専用の outcome を追加する。
  it('results の outcome=pending を通す（追加フィールド不要）', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'heavy-red', outcome: 'pending' }],
      }),
    ).not.toThrow();
  });

  // Codex 実測指摘（P2）: 旧 schema は results の outcome に "green"/"issue"
  // しか許さず、Step 3 の dedup 検索失敗（fail closed で起票見送り）という
  // 正当な状態を運行記録で表現できなかった。
  it('results の outcome=skipped で既知の reason なら通す', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'sentry-new', outcome: 'skipped', reason: 'dedup-search-failed' }],
      }),
    ).not.toThrow();
  });

  it('results の outcome=skipped で未知の reason なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'sentry-new', outcome: 'skipped', reason: 'evil' }],
      }),
    ).toThrow(/results/);
  });

  // #2333: integration.yml の失敗を夜勤で観測する check-id を追加した回帰確認。
  // CHECK_IDS に含まれていなければ既知の check-id チェックで拒否されるはず。
  it('results の checkId=integration-red を既知として受け付ける', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'integration-red', outcome: 'issue', issueNumber: 800 }],
      }),
    ).not.toThrow();
  });
});

describe('buildOpsLogComment', () => {
  it('all green の場合の本文を組み立てる', () => {
    const comment = buildOpsLogComment(GREEN_REPORT);
    expect(comment).toContain('**night-watch 運行記録 2026-08-24**');
    expect(comment).toContain('- 実行 check 数: 7 / 7（取得失敗を除く）');
    expect(comment).toContain('- 取得失敗: なし');
    expect(comment).toContain('- all green');
    expect(comment).toContain('- baseline 更新推奨: なし');
    expect(comment).toContain('- 盤面起票: 成功（#200）');
    expect(comment).toContain('- DoD監査候補: #301');
  });

  it('異常検出時は起票/追記の一覧を組み立てる', () => {
    const report: import('./run-log.mjs').OpsLogReport = {
      executed: 5,
      failed: ['sentry-new'],
      results: [
        { checkId: 'docs-coverage', outcome: 'issue', issueNumber: 700 },
        { checkId: 'deadcode', outcome: 'green' },
      ],
      baselineRecommend: ['dependabot-alerts'],
      board: { status: 'skip' },
      dod: { status: 'none' },
    };
    const comment = buildOpsLogComment(report);
    expect(comment).toContain('- 取得失敗: sentry-new');
    expect(comment).toContain('- 起票/追記: #700（docs-coverage）');
    expect(comment).toContain('- baseline 更新推奨: dependabot-alerts');
    expect(comment).toContain('- 盤面起票: skip（起票済み）');
    expect(comment).toContain('- DoD監査候補: 前日merge PR無し');
  });

  it('盤面起票失敗時は既知の reason を埋め込む', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      board: { status: 'fail', reason: 'rate-limited' },
    });
    expect(comment).toContain('- 盤面起票: 失敗（rate-limited）');
  });

  // #2342: 土日は 'skip（起票済み）' / '前日merge PR無し' ではなく
  // 'skip（土日）' と書き分ける（事実と異なる文言が毎週2回残る回帰の是正）。
  it('土日（board.status=weekend / dod.status=weekend）は「skip（土日）」と書き分ける', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      board: { status: 'weekend' },
      dod: { status: 'weekend' },
    });
    expect(comment).toContain('- 盤面起票: skip（土日）');
    expect(comment).toContain('- DoD監査候補: skip（土日）');
  });

  // #2350 クロスレビュー指摘（P2-1）: pending（run 未完了で判定保留）は
  // 「取得失敗（コマンド失敗）」とは別物として書き分ける。
  it('outcome=pending は「保留（run未完了）」として書き分け、all green と表示しない', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      results: [{ checkId: 'heavy-red', outcome: 'pending' }],
    });
    expect(comment).toContain('- 保留（run未完了）: heavy-red');
    expect(comment).not.toContain('- all green');
  });

  // Codex 実測指摘（P2）: failed が非空でも results に issue/skipped が
  // 無ければ resultsLine が "all green" になり、取得失敗と同時に誤った
  // 肯定シグナルを出していた。
  it('取得失敗のみ（results に issue/skipped が無い）なら all green と表示しない', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      failed: ['sentry-new'],
      results: [],
    });
    expect(comment).toContain('- 取得失敗: sentry-new');
    expect(comment).not.toContain('- all green');
    expect(comment).toContain('- 取得失敗のみ（起票/追記なし）');
  });

  it('dedup 検索失敗（skipped outcome）を運行記録へ列挙する', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      results: [{ checkId: 'sentry-new', outcome: 'skipped', reason: 'dedup-search-failed' }],
    });
    expect(comment).toContain('- 見送り: sentry-new（dedup-search-failed）');
    expect(comment).not.toContain('- all green');
  });

  it('起票/追記と見送りが両方あれば両方を列挙する', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      results: [
        { checkId: 'docs-coverage', outcome: 'issue', issueNumber: 700 },
        { checkId: 'sentry-new', outcome: 'skipped', reason: 'dedup-search-failed' },
      ],
    });
    expect(comment).toContain('起票/追記: #700（docs-coverage）');
    expect(comment).toContain('見送り: sentry-new（dedup-search-failed）');
  });
});

// #2350 クロスレビュー指摘（P2-1）: heavy-red/integration-red が恒久的に
// pending のまま無期限に無音化するのを防ぐ escalation 判定の read-only
// wrapper。
describe('checkRecentPending', () => {
  const readFileImpl = () => '- 運行記録 issue: **#1234**\n';

  type CommentSeed =
    string | { body: string; authorAssociation?: string; author?: { login: string } };

  function commentsResponse(seeds: CommentSeed[]) {
    return JSON.stringify({
      comments: seeds.map((seed) =>
        typeof seed === 'string'
          ? { body: seed, authorAssociation: 'OWNER' }
          : { authorAssociation: 'OWNER', ...seed },
      ),
    });
  }

  it('直近2件の運行記録レポートで同一 check-id が連続 pending なら true を返す', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n',
        '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: integration-red, heavy-red\n',
      ]),
    );
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: true,
      reportsChecked: 2,
    });
  });

  it('直近1件だけ pending が途切れていれば false を返す', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n',
        '**night-watch 運行記録 2026-08-23**\n\n- all green\n',
      ]),
    );
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: false,
      reportsChecked: 2,
    });
  });

  it('env-failure 等の他コメントは対象外にし、night-watch 運行記録形式だけ数える', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        '**night-watch 運行記録 2026-08-21**\n\n- 保留（run未完了）: heavy-red\n',
        '環境故障: DAYOPT_NIGHT_WATCH 未検出',
        '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n',
      ]),
    );
    // 「night-watch 運行記録」形式は2件（08-21・08-23）。間の env-failure は
    // 対象外のためスキップし、この2件で連続判定する。
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: true,
      reportsChecked: 2,
    });
  });

  it('対象コメントが lookback 件に満たなければ fail-open で false を返す', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse(['**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n']),
    );
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: false,
      reportsChecked: 1,
    });
  });

  it('未知の check-id は例外を投げる', () => {
    const execFileImpl = vi.fn(() => commentsResponse([]));
    expect(() => checkRecentPending('evil', { execFileImpl, readFileImpl })).toThrow(
      /未知の check-id/,
    );
  });

  // #2350 クロスレビュー指摘（P2-1、risk-reviewer medium）: repo は public の
  // ため第三者が「night-watch 運行記録」の見出しを持つ偽コメントを投げられる。
  // 偽の pending 行で escalation を誤発火させる、または保留行の無い偽コメント
  // で真の 2 晩連続を分断し escalation を無音化する、の両方を防ぐため
  // OWNER/MEMBER/COLLABORATOR 以外のコメントは無視する。
  it('信頼できない書き手（authorAssociation が NONE 等）のコメントは無視する', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        { body: '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n' },
        {
          // 第三者による偽装コメント（保留行なし = escalation を分断しようとする形）。
          body: '**night-watch 運行記録 2026-08-23**\n\n- all green\n',
          authorAssociation: 'NONE',
        },
        { body: '**night-watch 運行記録 2026-08-24**\n\n- 保留（run未完了）: heavy-red\n' },
      ]),
    );
    // NONE のコメントを除外すると、信頼できる直近2件は 08-22・08-24 になり、
    // どちらも pending なので true。偽コメントに分断されない。
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: true,
      reportsChecked: 2,
    });
  });

  // 手動代行との重複投稿等で同じ晩に2件投稿されても「2晩連続」に誤カウント
  // しない（同日付は 1 件に畳む）。
  it('同一日付のコメントが複数あっても 1 件として畳み、2 晩連続の判定に使わない', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n',
        '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n', // 同日の重複投稿
      ]),
    );
    // 日付が同じ 08-23 の 2 件は 1 件に畳まれるため、lookback（既定2）に満たず false。
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: false,
      reportsChecked: 1,
    });
  });

  // #2367（夜勤を Claude Routine から GitHub Actions cron へ移植）: 移植後は
  // 常設運行記録 issue へ github-actions[bot]（既定 GITHUB_TOKEN）が投稿する。
  // この投稿者の authorAssociation は実測で NONE（PR #2358 の
  // migration-safety job コメントで確認）のため、authorAssociation だけでは
  // 自分自身の投稿が信頼集合から漏れる。login 完全一致の OR 追加で救う
  // （指揮台承認、issue #2367 コメント参照）。
  it('authorAssociation が NONE でも github-actions[bot] の login なら信頼する', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        {
          body: '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'github-actions[bot]' },
        },
        {
          body: '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'github-actions[bot]' },
        },
      ]),
    );
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: true,
      reportsChecked: 2,
    });
  });

  // PR #2380 クロスレビュー指摘（指揮台実測、#2358/#2330/#2324）: gh の
  // `--json comments`（GraphQL 経由）が返す login には `[bot]` suffix が
  // 付かず、実際の投稿者 login は suffix 無しの `github-actions`。
  // `github-actions[bot]` のみを信頼する実装ではこの実測 login が漏れ、
  // pending escalation が Actions 化後に恒久的に無効化されていた。
  it('authorAssociation が NONE でも github-actions（suffix無し、GraphQL実測の綴り）の login なら信頼する', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        {
          body: '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'github-actions' },
        },
        {
          body: '**night-watch 運行記録 2026-08-23**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'github-actions' },
        },
      ]),
    );
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: true,
      reportsChecked: 2,
    });
  });

  it('github-actions[bot] 以外の login は authorAssociation が NONE なら引き続き信頼しない', () => {
    const execFileImpl = vi.fn(() =>
      commentsResponse([
        {
          // login が似ているだけの偽装（完全一致のみ信頼する設計を確認する）。
          body: '**night-watch 運行記録 2026-08-22**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'evil-actions[bot]' },
        },
        {
          body: '**night-watch 運行記録 2026-08-24**\n\n- 保留（run未完了）: heavy-red\n',
          authorAssociation: 'NONE',
          author: { login: 'github-actions[bot]' },
        },
      ]),
    );
    // 08-22 は信頼されず除外。信頼できる対象は 08-24 の1件のみで lookback 未満。
    expect(checkRecentPending('heavy-red', { execFileImpl, readFileImpl })).toEqual({
      consecutivePending: false,
      reportsChecked: 1,
    });
  });
});

describe('runOpsLogReport', () => {
  // #2332: runOpsLogReport は alert-issue.mjs と同じ run-state file を直接
  // 読んで運行記録へ「起票予算」の 1 行を機械生成で足す（buildAlertBudgetLine
  // 参照）。既定 path を使うと test 間・並行 worker 間で汚染するため、
  // test ごとに専用ディレクトリを用意する（plan-review 指摘、実 fs で検証）。
  let stateDir: string;
  let alertRunStatePath: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'night-watch-ops-log-state-'));
    alertRunStatePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('検証を通った report を運行記録 issue へコメントする（宛先は docs から解決）', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(
      () => 'https://github.com/Dayopt/dayopt/issues/1234#issuecomment-1\n',
    );

    const result = runOpsLogReport({
      report: GREEN_REPORT,
      execFileImpl,
      readFileImpl,
      alertRunStatePath,
    });

    expect(result).toEqual({ issueNumber: 1234 });
    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        `${buildOpsLogComment(GREEN_REPORT)}${buildAlertBudgetLine({ healthy: true, updatedAt: Date.now(), actedCheckIds: [], createdCount: 0 })}\n`,
      ],
      { encoding: 'utf8' },
    );
  });

  it('起票予算 state が壊れていても fail-open で報告し gh を呼ぶ', () => {
    writeFileSync(alertRunStatePath, 'not json', 'utf8');
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(
      (_cmd: string, _args: string[]) =>
        'https://github.com/Dayopt/dayopt/issues/1234#issuecomment-1\n',
    );

    runOpsLogReport({ report: GREEN_REPORT, execFileImpl, readFileImpl, alertRunStatePath });

    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1][6]).toContain('起票予算 state: 利用不可（fail-open、無制限扱いで実行）');
  });

  // push前反証レビュー risk-reviewer 指摘（P2、2巡目）: reserveAlertRunSlot は
  // state 書き込み失敗（EACCES/EROFS 等）時も fail-open で gh を呼ぶが、その
  // check-id は actedCheckIds に載らない。何も手当てしないと state は
  // healthy: true のまま「有効（0/3、0件）」と誤報告し、cap が実質無効に
  // なっている事実が観測できない。report.results の issue 件数と
  // actedCheckIds.length の不整合で検出する。
  it('state の記録より起票実績が多ければ「利用不可（不整合）」と報告する', () => {
    // state file は healthy な空 state（書き込みが一度も成功していない体で
    // 固定する）。report は 1 件の起票を報告しており、不整合になる。
    writeFileSync(
      alertRunStatePath,
      JSON.stringify({ updatedAt: Date.now(), actedCheckIds: [], createdCount: 0 }),
      'utf8',
    );
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(
      (_cmd: string, _args: string[]) =>
        'https://github.com/Dayopt/dayopt/issues/1234#issuecomment-1\n',
    );

    runOpsLogReport({
      report: {
        ...GREEN_REPORT,
        results: [{ checkId: 'docs-check', outcome: 'issue', issueNumber: 700 }],
      },
      execFileImpl,
      readFileImpl,
      alertRunStatePath,
    });

    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1][6]).toContain(
      '起票予算 state: 利用不可（fail-open、state 書き込み失敗の疑い。起票実績が state の記録より多い）',
    );
  });

  it('state の記録が起票実績以上なら「有効」と報告する（不整合の誤検知なし）', () => {
    writeFileSync(
      alertRunStatePath,
      JSON.stringify({ updatedAt: Date.now(), actedCheckIds: ['docs-check'], createdCount: 1 }),
      'utf8',
    );
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(
      (_cmd: string, _args: string[]) =>
        'https://github.com/Dayopt/dayopt/issues/1234#issuecomment-1\n',
    );

    runOpsLogReport({
      report: {
        ...GREEN_REPORT,
        results: [{ checkId: 'docs-check', outcome: 'issue', issueNumber: 700 }],
      },
      execFileImpl,
      readFileImpl,
      alertRunStatePath,
    });

    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1][6]).toContain(
      '起票予算 state: 有効（新規起票 1/3、対応済み check-id 1件）',
    );
  });

  it('未登録なら gh を呼ばずに例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **未登録**\n';
    const execFileImpl = vi.fn();

    expect(() =>
      runOpsLogReport({ report: GREEN_REPORT, execFileImpl, readFileImpl, alertRunStatePath }),
    ).toThrow(/登録されていません/);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('report の検証に失敗したら gh を呼ばずに例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn();

    expect(() =>
      runOpsLogReport({
        report: { ...GREEN_REPORT, executed: 99 },
        execFileImpl,
        readFileImpl,
        alertRunStatePath,
      }),
    ).toThrow(/executed/);
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});

describe('runEnvFailure', () => {
  it('no-var は固定文言を運行記録 issue へコメントする', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(() => 'https://github.com/Dayopt/dayopt/issues/1234\n');

    const result = runEnvFailure({ kind: 'no-var', execFileImpl, readFileImpl });

    expect(result).toEqual({ issueNumber: 1234, kind: 'no-var' });
    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        '環境故障: DAYOPT_NIGHT_WATCH 未検出',
      ],
      { encoding: 'utf8' },
    );
  });

  it('write-token は固定文言を運行記録 issue へコメントする', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(() => 'https://github.com/Dayopt/dayopt/issues/1234\n');

    runEnvFailure({ kind: 'write-token', execFileImpl, readFileImpl });

    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        '環境故障: token に write 権限あり',
      ],
      { encoding: 'utf8' },
    );
  });

  it('未知の kind は拒否する', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    // 意図的に型を破る（実際の CLI 入口は argv の生文字列を渡すため、ここでの
    // 実行時拒否が本物の防御）。
    expect(() => runEnvFailure({ kind: 'evil' as 'no-var', readFileImpl })).toThrow(
      /未知の環境故障種別/,
    );
  });
});

describe('buildBoardNoteComment', () => {
  it('all green の 1 行を組み立てる', () => {
    expect(buildBoardNoteComment({ allGreen: true, issued: 0, observed: 6 })).toBe(
      '⏱ 夜勤: all green | 起票 0 件 / 観測 6 件',
    );
  });

  it('一部取得失敗の 1 行を組み立てる', () => {
    expect(buildBoardNoteComment({ allGreen: false, issued: 2, observed: 4 })).toBe(
      '⏱ 夜勤: 一部取得失敗 | 起票 2 件 / 観測 4 件',
    );
  });
});

describe('runBoardNote', () => {
  function fakeGh(boardIssues: Array<{ number: number; title: string }>) {
    return vi.fn((cmd: string, args: string[]) => {
      if (args[1] === 'list') return JSON.stringify(boardIssues);
      if (args[1] === 'comment') return 'https://github.com/Dayopt/dayopt/issues/200\n';
      throw new Error(`unexpected: ${JSON.stringify(args)}`);
    });
  }

  it('当日盤面 issue へ 1 行コメントする', () => {
    const execFileImpl = fakeGh([{ number: 200, title: '盤面 2026-08-24' }]);

    const result = runBoardNote({ note: { allGreen: true, issued: 0, observed: 6 }, execFileImpl });

    expect(result).toEqual({ boardIssueNumber: 200 });
    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1]).toEqual([
      'issue',
      'comment',
      '200',
      '--repo',
      'Dayopt/dayopt',
      '--body',
      '⏱ 夜勤: all green | 起票 0 件 / 観測 6 件',
    ]);
  });

  it('当日盤面 issue が無ければ例外を投げる', () => {
    const execFileImpl = fakeGh([]);
    expect(() =>
      runBoardNote({ note: { allGreen: true, issued: 0, observed: 6 }, execFileImpl }),
    ).toThrow(/盤面 issue が見つかりません/);
  });

  it('note の形が不正なら拒否する', () => {
    const execFileImpl = fakeGh([{ number: 200, title: '盤面 2026-08-24' }]);
    // 意図的に型を破る（実際の CLI 入口は JSON.parse の結果（型: any）を渡す
    // ため、ここでの実行時拒否が本物の防御）。
    expect(() =>
      runBoardNote({
        note: { allGreen: 'yes' as unknown as boolean, issued: 0, observed: 6 },
        execFileImpl,
      }),
    ).toThrow(/note の形が不正/);
  });

  // push前反証レビュー risk-reviewer 指摘（P2）: board-issue.mjs が Step 1 の
  // 起票を平日のみに絞った（#2334 コメント）ため、土日は当日盤面 issue が
  // 存在せず findTodayBoardIssue が必ず null を返す。weekend skip 無しだと
  // 毎週 2 回、確実に「故障に見える失敗」（例外 → exit 1）が出ていた。
  it.each([
    ['土曜日', '2026-08-22T01:00:00Z'],
    ['日曜日', '2026-08-23T01:00:00Z'],
  ])('%s（JST）は gh を一切呼ばず skip する', (_label, isoDate) => {
    vi.setSystemTime(new Date(isoDate));
    const execFileImpl = vi.fn(() => {
      throw new Error('gh を呼んではいけない（weekend skip は gh 呼び出し前に判定する）');
    });

    const result = runBoardNote({
      note: { allGreen: true, issued: 0, observed: 6 },
      execFileImpl,
    });

    expect(result).toEqual({ action: 'skipped', reason: 'weekend' });
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});
