import { describe, expect, it } from 'vitest';

import {
  assertAgentFieldHasNoKnownReviewerRole,
  buildMarkerBody,
  deriveAgentFieldFromReviewResult,
  derivePartialCoverageRoles,
  deriveRoleFindingsField,
  type ReviewResultEntry,
} from '../lib/generate-marker-core.ts';

/**
 * generate-marker-core の契約テスト（#2230）。
 *
 * branch:finish の gate（scripts/tasks/finish-branch.sh）が要求する marker 契約を
 * 生成側で機械的に満たせているかを固定する:
 *   - head SHA は 40 桁 hex のみ受け付ける（手入力・短縮 SHA の補完を拒否）
 *   - agent は非空必須
 *   - P1/P2 が 0 件の時は zerolike 判定（`^(0|0件|0 件|なし|[Nn]one)$`）に
 *     完全一致する「なし」固定にし、注釈を許さない
 */

const VALID_SHA = '4f2a1c9e8b0d3f6a7c5e2b1d9a8f7c6e5d4b3a2f';

describe('buildMarkerBody', () => {
  it('P1/P2 ゼロ件・docs-only 相当の marker を生成する', () => {
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'docs-only',
      p1Count: 0,
      p2Count: 0,
    });

    expect(body).toBe(
      ['[internal-review]', `head: ${VALID_SHA}`, 'agent: docs-only', 'P1: なし', 'P2: なし'].join(
        '\n',
      ),
    );
  });

  it('非ゼロ件数には注釈を付けられる', () => {
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'risk-reviewer, behavior-verifier',
      p1Count: 0,
      p2Count: 2,
      p2Note: 'review comment 参照',
      p3: '型安全性の軽微な改善余地。issue化検討',
    });

    expect(body.split('\n')).toEqual([
      '[internal-review]',
      `head: ${VALID_SHA}`,
      'agent: risk-reviewer, behavior-verifier',
      'P1: なし',
      'P2: 2 件（review comment 参照）',
      'P3: 型安全性の軽微な改善余地。issue化検討',
    ]);
  });

  it('P3 が空なら行を省略する', () => {
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'architecture-guard',
      p1Count: 0,
      p2Count: 0,
      p3: '   ',
    });

    expect(body).not.toContain('P3:');
  });

  it('0 件の P1 に注釈を付けようとすると拒否する（zerolike 書式汚染の防止）', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'risk-reviewer',
        p1Count: 0,
        p1Note: '念のため確認したが問題なし',
        p2Count: 0,
      }),
    ).toThrow(/zerolike/);
  });

  it('0 件の P2 に注釈を付けようとすると拒否する', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'behavior-verifier',
        p1Count: 0,
        p2Count: 0,
        p2Note: '一応チェック済み',
      }),
    ).toThrow(/zerolike/);
  });

  it('40 桁 hex 以外の head SHA を拒否する（短縮 SHA の補完を防ぐ）', () => {
    expect(() =>
      buildMarkerBody({
        headSha: '4f2a1c9',
        agent: 'docs-only',
        p1Count: 0,
        p2Count: 0,
      }),
    ).toThrow(/head SHA/);
  });

  it('agent が空文字列なら拒否する', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: '   ',
        p1Count: 0,
        p2Count: 0,
      }),
    ).toThrow(/agent/);
  });

  it('partial coverage の role があるのに注釈が無ければ拒否する（#2417、fail-open 防止）', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'risk-reviewer',
        p1Count: 0,
        p2Count: 0,
        partialCoverageRoles: ['risk-reviewer'],
      }),
    ).toThrow(/partial coverage/);
  });

  it('partial coverage の role があり注釈があれば marker に行を追加する', () => {
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'risk-reviewer, behavior-verifier',
      p1Count: 0,
      p2Count: 0,
      partialCoverageRoles: ['risk-reviewer'],
      partialCoverageNote: 'diff 該当箇所を Main が目視確認済み',
    });

    expect(body.split('\n')).toContain(
      'partial coverage: risk-reviewer（diff 該当箇所を Main が目視確認済み）',
    );
  });

  it('partial coverage の role が無ければ注釈が無くても素通りする', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'docs-only',
        p1Count: 0,
        p2Count: 0,
        partialCoverageRoles: [],
      }),
    ).not.toThrow();
  });

  it('roleFindingsField が非空なら findings: 行を agent: の直後・P1: の直前に挟む', () => {
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'risk-reviewer, behavior-verifier',
      roleFindingsField: 'risk-reviewer=2(P1 1/P2 1), behavior-verifier=0',
      p1Count: 0,
      p2Count: 2,
      p2Note: 'review comment 参照',
    });

    expect(body.split('\n')).toEqual([
      '[internal-review]',
      `head: ${VALID_SHA}`,
      'agent: risk-reviewer, behavior-verifier',
      'findings: risk-reviewer=2(P1 1/P2 1), behavior-verifier=0',
      'P1: なし',
      'P2: 2 件（review comment 参照）',
    ]);
  });

  it('roleFindingsField が未指定・空文字列なら findings: 行を省略する（--agent 直接指定・docs-only）', () => {
    const bodyWithoutField = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'docs-only',
      p1Count: 0,
      p2Count: 0,
    });
    const bodyWithBlankField = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'docs-only',
      roleFindingsField: '   ',
      p1Count: 0,
      p2Count: 0,
    });

    expect(bodyWithoutField).not.toContain('findings:');
    expect(bodyWithBlankField).not.toContain('findings:');
  });

  it('findings: 行は finish-branch.sh の head:/agent:/P1:/P2: 行アンカー正規表現と干渉しない', () => {
    // finish-branch.sh は `(?m)^head:`, `(?m)^agent:[ \t]*\S`,
    // `(?m)^P1:[ \t]*(?<v>[^\n\r]*)`, `(?m)^P2:[ \t]*(?<v>[^\n\r]*)` を行頭アンカーで
    // 見る。findings: 行がこれらのどれとも前方一致しないことを固定する。
    const body = buildMarkerBody({
      headSha: VALID_SHA,
      agent: 'risk-reviewer',
      roleFindingsField: 'risk-reviewer=1(P1 1/P2 0)',
      p1Count: 1,
      p1Note: 'review comment 参照',
      p2Count: 0,
    });
    const findingsLine = body.split('\n').find((l) => l.startsWith('findings:'));
    expect(findingsLine).toBeDefined();
    expect(findingsLine).not.toMatch(/^head:/);
    expect(findingsLine).not.toMatch(/^agent:/);
    expect(findingsLine).not.toMatch(/^P1:/);
    expect(findingsLine).not.toMatch(/^P2:/);
    // 5 点チェック用の行はそれぞれ単独行のまま存在し続ける
    expect(body).toMatch(new RegExp(`(?<!\\S)head: ${VALID_SHA}(?!\\S)`));
    expect(body).toMatch(/(?:^|\n)agent: \S/);
    expect(body).toMatch(/(?:^|\n)P1: 1 件（review comment 参照）/);
  });

  it('負数・非整数の件数を拒否する', () => {
    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'docs-only',
        p1Count: -1,
        p2Count: 0,
      }),
    ).toThrow();

    expect(() =>
      buildMarkerBody({
        headSha: VALID_SHA,
        agent: 'docs-only',
        p1Count: 0,
        p2Count: 1.5,
      }),
    ).toThrow();
  });
});

/**
 * deriveAgentFieldFromReviewResult の契約テスト（#2348）。
 *
 * Workflow 経由で reviewer を起動した結果、1 role でも `ok`/`text-fallback`
 * 以外の status が混じっていれば marker 生成そのものを拒否する
 * （1 role が結果を返していないのに `--agent` へ手で書いて gate を素通りさせる
 * 抜け道を、値の手入力自体を無くすことで塞ぐ）。
 */
describe('deriveAgentFieldFromReviewResult', () => {
  it('全 role が ok なら role 名をカンマ区切りで返す', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'ok' },
      { role: 'behavior-verifier', status: 'ok' },
    ];

    expect(deriveAgentFieldFromReviewResult(entries)).toBe('risk-reviewer, behavior-verifier');
  });

  it('text-fallback を含む場合は (text-fallback) を付けて返す', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'ok' },
      { role: 'behavior-verifier', status: 'text-fallback' },
    ];

    expect(deriveAgentFieldFromReviewResult(entries)).toBe(
      'risk-reviewer, behavior-verifier(text-fallback)',
    );
  });

  it('1 role でも empty があれば拒否する', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'ok' },
      { role: 'behavior-verifier', status: 'empty' },
    ];

    expect(() => deriveAgentFieldFromReviewResult(entries)).toThrow(/behavior-verifier\(empty\)/);
  });

  it('1 role でも error があれば拒否する', () => {
    const entries: ReviewResultEntry[] = [{ role: 'architecture-guard', status: 'error' }];

    expect(() => deriveAgentFieldFromReviewResult(entries)).toThrow(/architecture-guard\(error\)/);
  });

  it('空配列は拒否する', () => {
    expect(() => deriveAgentFieldFromReviewResult([])).toThrow(/空です/);
  });

  it('role が空文字列のエントリがあれば拒否する（PR #2354 クロスレビュー P3）', () => {
    const entries: ReviewResultEntry[] = [{ role: '', status: 'ok' }];

    expect(() => deriveAgentFieldFromReviewResult(entries)).toThrow(/role が空/);
  });

  it('role が空白のみのエントリがあれば拒否する', () => {
    const entries: ReviewResultEntry[] = [{ role: '   ', status: 'ok' }];

    expect(() => deriveAgentFieldFromReviewResult(entries)).toThrow(/role が空/);
  });
});

/**
 * derivePartialCoverageRoles の契約テスト（#2417）。
 *
 * pacing discipline を緩めて早期の StructuredOutput 呼び出しを許可すると、
 * 「schema 上は正常だが浅いレビュー」が `status: 'ok'` のまま marker を素通り
 * しうる（fail-open）。この関数はその自己申告（`result.coverage: 'partial'`）を
 * 拾い上げる唯一の経路であり、role/status しか見なかった旧設計を拡張する。
 */
describe('derivePartialCoverageRoles', () => {
  it('coverage: partial の role だけを抽出する', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'ok', result: { coverage: 'partial' } },
      { role: 'behavior-verifier', status: 'ok', result: { coverage: 'complete' } },
    ];

    expect(derivePartialCoverageRoles(entries)).toEqual(['risk-reviewer']);
  });

  it('全て complete なら空配列を返す', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'architecture-guard', status: 'ok', result: { coverage: 'complete' } },
      { role: 'behavior-verifier', status: 'ok', result: { coverage: 'complete' } },
    ];

    expect(derivePartialCoverageRoles(entries)).toEqual([]);
  });

  it('status が ok 以外（text-fallback 等）は coverage: partial でも対象外にする（result 欠落でも fail-closed の対象外）', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'text-fallback', result: { coverage: 'partial' } },
      { role: 'architecture-guard', status: 'empty' },
    ];

    expect(derivePartialCoverageRoles(entries)).toEqual([]);
  });

  it('status:"ok" なのに result が欠落していれば拒否する（fail-closed、PR #2424 クロスレビュー P2）', () => {
    const entries: ReviewResultEntry[] = [{ role: 'behavior-verifier', status: 'ok' }];

    expect(() => derivePartialCoverageRoles(entries)).toThrow(/result\.coverage が欠落または不正/);
  });

  it('status:"ok" なのに coverage が未知の値なら拒否する（fail-closed）', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'risk-reviewer', status: 'ok', result: { coverage: 'mostly-done' } },
    ];

    expect(() => derivePartialCoverageRoles(entries)).toThrow(/result\.coverage が欠落または不正/);
  });
});

/**
 * assertAgentFieldHasNoKnownReviewerRole の契約テスト（PR #2354 クロスレビュー P2）。
 *
 * `--review-result` を新設した本 PR 自身が「1 role が結果を返していないのに
 * `--agent` へ手で書いて gate を通す」抜け道を塞ぐと宣言していたが、`--agent`
 * 経路そのものには既知 role 名の直書きを禁止する仕組みが無く、抜け道が残っていた。
 */
describe('assertAgentFieldHasNoKnownReviewerRole', () => {
  it('docs-only は許可する', () => {
    expect(() => assertAgentFieldHasNoKnownReviewerRole('docs-only')).not.toThrow();
  });

  it('既知の reviewer role 名を単独で拒否する', () => {
    expect(() => assertAgentFieldHasNoKnownReviewerRole('risk-reviewer')).toThrow(/risk-reviewer/);
  });

  it('既知の reviewer role 名がカンマ区切りの一部でも拒否する', () => {
    expect(() => assertAgentFieldHasNoKnownReviewerRole('docs-only, behavior-verifier')).toThrow(
      /behavior-verifier/,
    );
  });

  it('(text-fallback) 注釈付きでも base 部分が既知 role なら拒否する（--agent 直書きでの偽装を防ぐ）', () => {
    expect(() =>
      assertAgentFieldHasNoKnownReviewerRole('architecture-guard(text-fallback)'),
    ).toThrow(/architecture-guard/);
  });

  it('既知 role と無関係な自由記述は許可する', () => {
    expect(() => assertAgentFieldHasNoKnownReviewerRole('my-custom-note')).not.toThrow();
  });
});

/**
 * deriveRoleFindingsField の契約テスト。
 *
 * marker 本文の role 別 findings 内訳を、`--review-result` の `result.findings`
 * （cross-review-workflow.js の SCHEMA_CONTRACT が定義する schema 強制済みの配列）
 * から機械的に導出する。role 別の指摘数は marker にしか現れない authoritative な
 * 数値であり、`scripts/tasks/trace.mjs` がこれを最優先で読む。
 */
describe('deriveRoleFindingsField', () => {
  it('status: ok の role は findings 件数と P1/P2 内訳を組み立てる', () => {
    const entries: ReviewResultEntry[] = [
      {
        role: 'risk-reviewer',
        status: 'ok',
        result: {
          findings: [{ severity: 'critical' }, { severity: 'low' }],
        },
      },
      {
        role: 'behavior-verifier',
        status: 'ok',
        result: { findings: [] },
      },
    ];

    expect(deriveRoleFindingsField(entries)).toBe(
      'risk-reviewer=2(P1 1/P2 1), behavior-verifier=0',
    );
  });

  it('architecture-guard / behavior-verifier は blocker だけを P1 相当として数える', () => {
    const entries: ReviewResultEntry[] = [
      {
        role: 'architecture-guard',
        status: 'ok',
        result: {
          findings: [{ severity: 'blocker' }, { severity: 'warning' }, { severity: 'warning' }],
        },
      },
    ];

    expect(deriveRoleFindingsField(entries)).toBe('architecture-guard=3(P1 1/P2 2)');
  });

  it('text-fallback の role は件数を主張せず (text-fallback)=不明 にする', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'behavior-verifier', status: 'text-fallback' },
      {
        role: 'risk-reviewer',
        status: 'ok',
        result: { findings: [{ severity: 'high' }] },
      },
    ];

    expect(deriveRoleFindingsField(entries)).toBe(
      'behavior-verifier(text-fallback)=不明, risk-reviewer=1(P1 1/P2 0)',
    );
  });

  it('status: ok なのに result.findings が配列でなければ拒否する（fail-closed）', () => {
    const entries: ReviewResultEntry[] = [{ role: 'risk-reviewer', status: 'ok', result: {} }];

    expect(() => deriveRoleFindingsField(entries)).toThrow(/result\.findings が配列ではありません/);
  });

  it('status: ok なのに result 自体が欠落していれば拒否する（fail-closed）', () => {
    const entries: ReviewResultEntry[] = [{ role: 'behavior-verifier', status: 'ok' }];

    expect(() => deriveRoleFindingsField(entries)).toThrow(/result\.findings が配列ではありません/);
  });

  it('empty/error の role は無視する（deriveAgentFieldFromReviewResult が先に例外を投げる前提）', () => {
    const entries: ReviewResultEntry[] = [
      { role: 'architecture-guard', status: 'empty' },
      {
        role: 'risk-reviewer',
        status: 'ok',
        result: { findings: [] },
      },
    ];

    expect(deriveRoleFindingsField(entries)).toBe('risk-reviewer=0');
  });

  it('entries が空なら空文字列を返す', () => {
    expect(deriveRoleFindingsField([])).toBe('');
  });
});
