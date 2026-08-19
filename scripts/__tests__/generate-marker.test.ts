import { describe, expect, it } from 'vitest';

import { buildMarkerBody } from '../review/generate-marker-core.ts';

/**
 * generate-marker-core の契約テスト（#2230）。
 *
 * branch:finish の gate（scripts/git/finish-branch.sh）が要求する marker 契約を
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
