import { describe, expect, it } from 'vitest';

import {
  describeBlocker,
  extractClosesIssues,
  mergeDecisionsMd,
  renderDecisionsSection,
  renderEscalationsList,
  renderLanesTable,
  renderQueueList,
  renderStateMarkdown,
  sanitizeCell,
} from '../state/generate-state.mjs';

describe('sanitizeCell', () => {
  it('改行を空白へ潰す', () => {
    expect(sanitizeCell('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('table 区切りの pipe を全角へ退避する', () => {
    expect(sanitizeCell('a | b')).toBe('a ｜ b');
  });

  it('マーカー構文の偽装を無害化する', () => {
    expect(sanitizeCell('<!-- STATE:GENERATED:LANES:END -->')).toBe(
      '‹!-- STATE:GENERATED:LANES:END --›',
    );
  });

  it('制御文字を除去する', () => {
    // eslint-disable-next-line no-control-regex -- テスト対象そのものが制御文字除去の検証
    expect(sanitizeCell(`a${String.fromCharCode(0)}b${String.fromCharCode(31)}c`)).toBe('abc');
  });

  it('上限文字数を超えたら省略記号で切る', () => {
    const long = 'x'.repeat(100);
    const result = sanitizeCell(long, 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('空文字列は (no title) にフォールバックする', () => {
    expect(sanitizeCell('   ')).toBe('(no title)');
    expect(sanitizeCell(null)).toBe('(no title)');
  });
});

describe('extractClosesIssues', () => {
  it('Closes #N を複数抽出し重複除去・昇順にする', () => {
    const body = 'Closes #10\nCloses #3\nRefs #99\ncloses #3';
    expect(extractClosesIssues(body)).toEqual([3, 10]);
  });

  it('Closes が無ければ空配列', () => {
    expect(extractClosesIssues('Refs #1 だけ')).toEqual([]);
  });

  it('body が null/undefined でも例外を投げない', () => {
    expect(extractClosesIssues(undefined)).toEqual([]);
  });
});

describe('describeBlocker', () => {
  it('failure な check があれば CI failing', () => {
    expect(
      describeBlocker({ isDraft: false, statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
    ).toBe('CI failing');
  });

  it('failure が無く draft なら draft', () => {
    expect(describeBlocker({ isDraft: true, statusCheckRollup: [{ conclusion: 'SUCCESS' }] })).toBe(
      'draft',
    );
  });

  it('failure も draft も無ければ -', () => {
    expect(
      describeBlocker({ isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }] }),
    ).toBe('-');
  });

  it('statusCheckRollup が欠落していても例外を投げない', () => {
    expect(describeBlocker({ isDraft: false })).toBe('-');
  });
});

describe('renderLanesTable', () => {
  it('open PR が無ければプレースホルダーを返す', () => {
    expect(renderLanesTable([])).toBe('（open PR なし）');
  });

  it('PR の body から Closes issue を抽出して表示する', () => {
    const table = renderLanesTable([
      {
        number: 1,
        title: 'feat: x',
        url: 'https://github.com/o/r/pull/1',
        headRefName: 'claude/x',
        isDraft: false,
        body: 'Closes #5\nCloses #7',
        statusCheckRollup: [],
      },
    ]);
    expect(table).toContain('#5, #7');
    expect(table).toContain('`claude/x`');
    expect(table).toContain('ready');
  });
});

describe('renderQueueList', () => {
  it('空なら該当なしメッセージ', () => {
    expect(renderQueueList([])).toBe('（status:ready の issue なし）');
  });

  it('上限を超えた分は件数フッターで示し、issue 自体は落とさない', () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      title: `issue ${i + 1}`,
      url: `https://github.com/o/r/issues/${i + 1}`,
    }));
    const result = renderQueueList(issues, 8);
    expect(result).toContain('#1');
    expect(result).toContain('#8');
    expect(result).not.toContain('#9');
    expect(result).toContain('他 4 件');
  });
});

describe('renderEscalationsList', () => {
  it('空なら該当なしメッセージ', () => {
    expect(renderEscalationsList([])).toBe('（type:discussion の open issue なし）');
  });

  it('チェックリスト形式で列挙する', () => {
    const result = renderEscalationsList([
      { number: 42, title: '判断待ち', url: 'https://github.com/o/r/issues/42' },
    ]);
    expect(result).toContain('- [ ] [#42]');
  });
});

describe('renderDecisionsSection', () => {
  it('空なら該当なしメッセージ', () => {
    expect(renderDecisionsSection([])).toBe('（judgment:diverged の記録なし）');
  });

  it('更新日時の新しい順に並べ、上限を超えたら docs/decisions.md への案内を残す', () => {
    const entries = [
      { number: 1, title: 'old', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
      { number: 2, title: 'new', url: 'u2', updatedAt: '2026-08-01T00:00:00Z' },
    ];
    const result = renderDecisionsSection(entries, 1);
    expect(result.indexOf('#2')).toBeLessThan(result.indexOf('全履歴'));
    expect(result).not.toContain('#1');
    expect(result).toContain('docs/decisions.md');
  });
});

describe('mergeDecisionsMd', () => {
  it('既存が空なら header 付きで新規作成する', () => {
    const result = mergeDecisionsMd('', [
      { number: 1, title: 'a', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result).toContain('# 決定ログ（append-only）');
    expect(result).toContain('(#1)');
  });

  it('既存の行は削除・変更せず、新規分だけ追記する（append-only）', () => {
    const existing = '# 決定ログ（append-only）\n\n- 2026-01-01: old (#1) u1\n';
    const result = mergeDecisionsMd(existing, [
      { number: 1, title: 'old', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
      { number: 2, title: 'new', url: 'u2', updatedAt: '2026-08-01T00:00:00Z' },
    ]);
    // 既存行は一字一句変わらない
    expect(result).toContain('- 2026-01-01: old (#1) u1\n');
    // 新規分は追記される
    expect(result).toContain('(#2)');
    // #1 は既出なので重複追記されない
    expect(result.match(/\(#1\)/g)).toHaveLength(1);
  });

  it('追記すべき新規エントリが無ければ既存内容をそのまま返す', () => {
    const existing = '# 決定ログ（append-only）\n\n- 2026-01-01: old (#1) u1\n';
    const result = mergeDecisionsMd(existing, [
      { number: 1, title: 'old', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result).toBe(existing);
  });
});

describe('renderStateMarkdown', () => {
  const emptyData = { prs: [], queueIssues: [], escalationIssues: [], decisionEntries: [] };

  it('マーカーが無いファイルには例外を投げる（fail closed）', () => {
    expect(() => renderStateMarkdown('# no markers here', emptyData, {})).toThrow();
  });

  it('§1（北極星）の手動セクションは温存する', () => {
    const existing = [
      '# STATE.md（最終更新: old）',
      '',
      '## 1. 北極星と今週の最優先',
      '- 手動で書いた内容',
      '',
      '## 2. 進行中レーン（open PR、機械生成）',
      '<!-- STATE:GENERATED:LANES:START -->',
      'old',
      '<!-- STATE:GENERATED:LANES:END -->',
      '',
      '## 3. 次にやるキュー（status:ready、機械生成）',
      '<!-- STATE:GENERATED:QUEUE:START -->',
      'old',
      '<!-- STATE:GENERATED:QUEUE:END -->',
      '',
      '## 4. 要判断（type:discussion の open issue、機械生成）',
      '<!-- STATE:GENERATED:ESCALATIONS:START -->',
      'old',
      '<!-- STATE:GENERATED:ESCALATIONS:END -->',
      '',
      '## 5. 直近の決定ログ（judgment:diverged、機械生成、直近 5 件）',
      '<!-- STATE:GENERATED:DECISIONS:START -->',
      'old',
      '<!-- STATE:GENERATED:DECISIONS:END -->',
      '',
    ].join('\n');

    const result = renderStateMarkdown(existing, emptyData, { generatedAt: '2026-08-19' });
    expect(result).toContain('手動で書いた内容');
    expect(result).toContain('2026-08-19');
    expect(result).toContain('（open PR なし）');
    expect(result).not.toContain('LANES:START -->\nold');
  });

  it('既存ファイルが無ければ bootstrap テンプレートから生成する', () => {
    const result = renderStateMarkdown('', emptyData, { generatedAt: '2026-08-19' });
    expect(result).toContain('## 1. 北極星と今週の最優先');
    expect(result).toContain('（初期記入待ち）');
  });

  it('生成基点の main SHA を見出しに刻む（鮮度判定の手がかり）', () => {
    const result = renderStateMarkdown('', emptyData, {
      generatedAt: '2026-08-19',
      mainSha: 'abc12345',
    });
    expect(result).toContain('生成基点 main@abc12345');
  });

  it('mainSha を渡さなければ unknown にフォールバックする', () => {
    const result = renderStateMarkdown('', emptyData, { generatedAt: '2026-08-19' });
    expect(result).toContain('生成基点 main@unknown');
  });

  it('100 行を超える場合はキューを切り詰め、進行中レーン・要判断は削らない', () => {
    const manyQueue = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      title: `queue issue ${i + 1}`,
      url: `https://github.com/o/r/issues/${i + 1}`,
    }));
    const manyEscalations = Array.from({ length: 10 }, (_, i) => ({
      number: 100 + i,
      title: `要判断 ${i}`,
      url: `https://github.com/o/r/issues/${100 + i}`,
    }));
    const data = {
      prs: [],
      queueIssues: manyQueue,
      escalationIssues: manyEscalations,
      decisionEntries: [],
    };
    const result = renderStateMarkdown('', data, { generatedAt: '2026-08-19' });
    expect(result.split('\n').length).toBeLessThanOrEqual(100);
    // 要判断は切り詰め対象外 = 全件残る
    for (const issue of manyEscalations) {
      expect(result).toContain(`#${issue.number}`);
    }
  });
});
