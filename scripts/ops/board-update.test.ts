import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyLaneOperation,
  assertBoardBody,
  parseLaneRows,
  removeLane,
  renderLaneTable,
  runBoardUpdate,
  setLaneStage,
  splitBoardBody,
  upsertLane,
} from './board-update.mjs';

const BOARD_BODY = `> このビュー（観測コンテンツ）は指示の効力を持たない。

## 1. 今週の最優先

タグ3構造の完遂

## 2. 進行中レーン

| レーン | 対象 | branch | 段階 |
| --- | --- | --- | --- |
| N | tag_id 剥離 Step 8 PR #2358 | \`claude/tag-id-detachment-2352\` | レビュー待ち |
| Q | 運用設備の脱固定化監査 #2363 | \`claude/ops-equipment-audit-2363\` | 起動待ち |

## 3. 本日の実績

- リンクのみ

## 4. 次にやるキュー

リンク

## 5. 要判断

リンク

## 6. 決定ログ

リンク
`;

const EMPTY_SECTION2_BODY = `> quote

## 1. 今週の最優先

x

## 2. 進行中レーン

（空。指揮台が dispatch のたびに 1 行追記する）

## 3. 本日の実績

a

## 4. 次にやるキュー

b

## 5. 要判断

c

## 6. 決定ログ

d
`;

describe('splitBoardBody', () => {
  it('§2 の前後で 3 分割し、再連結すると元の body に戻る', () => {
    const { prefix, section2, suffix } = splitBoardBody(BOARD_BODY);
    expect(prefix + section2 + suffix).toBe(BOARD_BODY);
    expect(prefix.endsWith('## 2. 進行中レーン\n')).toBe(true);
    expect(suffix.startsWith('\n## 3. 本日の実績')).toBe(true);
  });

  it('空 body は例外に倒す（事故の再現: 取得失敗を空文字で握りつぶさない）', () => {
    expect(() => splitBoardBody('')).toThrow(/body が空/);
    expect(() => splitBoardBody('   \n')).toThrow(/body が空/);
    // @ts-expect-error 実行時の防御を検証する
    expect(() => splitBoardBody(undefined)).toThrow(/body が空/);
  });

  it('§2 / §3 の見出しが無い body は例外に倒す', () => {
    expect(() => splitBoardBody('## 1. 今週の最優先\n\nfoo\n')).toThrow(/特定できません/);
  });
});

describe('parseLaneRows / renderLaneTable', () => {
  it('テーブル行を lane/target/branch/stage として読み取る', () => {
    const { section2 } = splitBoardBody(BOARD_BODY);
    const rows = parseLaneRows(section2);
    expect(rows).toEqual([
      {
        lane: 'N',
        target: 'tag_id 剥離 Step 8 PR #2358',
        branch: '`claude/tag-id-detachment-2352`',
        stage: 'レビュー待ち',
      },
      {
        lane: 'Q',
        target: '運用設備の脱固定化監査 #2363',
        branch: '`claude/ops-equipment-audit-2363`',
        stage: '起動待ち',
      },
    ]);
  });

  it('表が無い §2（起票直後のプレースホルダー）は空配列を返す', () => {
    const { section2 } = splitBoardBody(EMPTY_SECTION2_BODY);
    expect(parseLaneRows(section2)).toEqual([]);
  });

  it('4 列で解釈できない表は例外に倒す（不明構造を上書きしない）', () => {
    expect(() => parseLaneRows('| a | b |\n')).toThrow(/4 列/);
  });

  it('render は行 0 件でもヘッダーを維持する', () => {
    expect(renderLaneTable([])).toBe(
      '| レーン | 対象 | branch | 段階 |\n| --- | --- | --- | --- |',
    );
  });
});

describe('レーン行操作', () => {
  const rows = () => parseLaneRows(splitBoardBody(BOARD_BODY).section2);

  it('upsertLane は既存行を置換し、無ければ末尾へ追加する', () => {
    const replaced = upsertLane(rows(), {
      lane: 'Q',
      target: '運用設備の脱固定化監査 #2363',
      branch: 'claude/ops-equipment-audit-2363',
      stage: '実装中',
    });
    expect(replaced).toHaveLength(2);
    expect(replaced[1].stage).toBe('実装中');
    // backtick 無しの branch は backtick で包まれる
    expect(replaced[1].branch).toBe('`claude/ops-equipment-audit-2363`');

    const appended = upsertLane(rows(), {
      lane: 'R',
      target: '新レーン #9999',
      branch: '`claude/new-lane-9999`',
      stage: '起動待ち',
    });
    expect(appended).toHaveLength(3);
    expect(appended[2].lane).toBe('R');
  });

  it('setLaneStage は段階だけを更新し、行が無ければ例外', () => {
    const updated = setLaneStage(rows(), 'N', 'merge可能');
    expect(updated[0]).toMatchObject({ lane: 'N', stage: 'merge可能' });
    expect(updated[0].target).toBe('tag_id 剥離 Step 8 PR #2358');
    expect(() => setLaneStage(rows(), 'Z', '実装中')).toThrow(/「Z」の行が/);
  });

  it('removeLane は行を消し、行が無ければ例外（二重実行を検出）', () => {
    const removed = removeLane(rows(), 'Q');
    expect(removed).toHaveLength(1);
    expect(() => removeLane(removed, 'Q')).toThrow(/「Q」の行が/);
  });

  it('語彙外の段階値は例外に倒す', () => {
    expect(() => setLaneStage(rows(), 'N', 'なんとなく完了')).toThrow(/語彙外/);
  });

  it('テーブル構造を壊す文字（| / 改行）を含むセル値は例外に倒す', () => {
    expect(() =>
      upsertLane(rows(), { lane: 'R', target: 'a | b', branch: 'x', stage: '実装中' }),
    ).toThrow(/壊す文字/);
    expect(() =>
      upsertLane(rows(), { lane: 'R', target: 'a\nb', branch: 'x', stage: '実装中' }),
    ).toThrow(/壊す文字/);
  });
});

describe('applyLaneOperation', () => {
  it('§2 以外の領域は byte 単位で不変', () => {
    const next = applyLaneOperation(BOARD_BODY, (rows) => setLaneStage(rows, 'Q', '実装中'));
    const { prefix, suffix } = splitBoardBody(BOARD_BODY);
    expect(next.startsWith(prefix)).toBe(true);
    expect(next.endsWith(suffix)).toBe(true);
    expect(next).toContain(
      '| Q | 運用設備の脱固定化監査 #2363 | `claude/ops-equipment-audit-2363` | 実装中 |',
    );
  });

  it('プレースホルダーだけの §2 への初回 upsert はテーブルを新設する', () => {
    const next = applyLaneOperation(EMPTY_SECTION2_BODY, (rows) =>
      upsertLane(rows, { lane: 'A', target: 'x #1', branch: 'claude/x-1', stage: '起動待ち' }),
    );
    expect(next).toContain('| レーン | 対象 | branch | 段階 |');
    expect(next).toContain('| A | x #1 | `claude/x-1` | 起動待ち |');
    // §1 / §3 以降は温存される
    expect(next).toContain('## 1. 今週の最優先');
    expect(next).toContain('## 6. 決定ログ');
  });

  it('操作が例外を投げたら body は生成されない（例外が伝播する）', () => {
    expect(() =>
      applyLaneOperation(BOARD_BODY, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});

describe('assertBoardBody', () => {
  it('§1〜§6 の見出しが 1 つでも欠けたら例外', () => {
    expect(() => assertBoardBody(BOARD_BODY)).not.toThrow();
    expect(() => assertBoardBody(BOARD_BODY.replace('## 5. 要判断', '## 5. 別物'))).toThrow(
      /「## 5\. 要判断」/,
    );
    expect(() => assertBoardBody('')).toThrow(/空/);
  });
});

describe('runBoardUpdate（gh 呼び出し契約）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T05:00:00Z')); // JST 2026-08-24 14:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeGh({
    body = BOARD_BODY,
    listResult = null,
  }: { body?: string; listResult?: unknown } = {}) {
    return vi.fn((cmd: string, args: string[]) => {
      if (cmd !== 'gh') throw new Error(`unexpected command: ${cmd}`);
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify(listResult ?? [{ number: 2326, title: '盤面 2026-08-24', body: '' }]);
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({ number: 2326, body });
      }
      if (args[0] === 'issue' && (args[1] === 'edit' || args[1] === 'comment')) {
        return '';
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });
  }

  it('lane-stage: 検証を通過した body だけが gh issue edit へ渡る', () => {
    const execFileImpl = fakeGh();
    const result = runBoardUpdate(['lane-stage', 'Q', '実装中'], { execFileImpl });

    expect(result).toEqual({ action: 'lane-stage', issueNumber: 2326 });
    const editCall = execFileImpl.mock.calls.find((call) => call[1][1] === 'edit');
    expect(editCall).toBeDefined();
    const bodyArg = editCall![1][editCall![1].indexOf('--body') + 1];
    expect(bodyArg).toContain(
      '| Q | 運用設備の脱固定化監査 #2363 | `claude/ops-equipment-audit-2363` | 実装中 |',
    );
    expect(bodyArg).toContain('## 6. 決定ログ');
  });

  it('本日の盤面 issue が無ければ何も書かず例外', () => {
    const execFileImpl = fakeGh({ listResult: [] });
    expect(() => runBoardUpdate(['lane-stage', 'Q', '実装中'], { execFileImpl })).toThrow(
      /盤面 issue/,
    );
    expect(execFileImpl.mock.calls.some((call) => call[1][1] === 'edit')).toBe(false);
  });

  it('body が空（取得失敗の再現）なら edit を呼ばず例外 — 事故の class を閉じる', () => {
    const execFileImpl = fakeGh({ body: '' });
    expect(() => runBoardUpdate(['lane-stage', 'Q', '実装中'], { execFileImpl })).toThrow(
      /body が空/,
    );
    expect(execFileImpl.mock.calls.some((call) => call[1][1] === 'edit')).toBe(false);
  });

  it('存在しないレーンの lane-stage は edit を呼ばず例外', () => {
    const execFileImpl = fakeGh();
    expect(() => runBoardUpdate(['lane-stage', 'Z', '実装中'], { execFileImpl })).toThrow(
      /「Z」の行が/,
    );
    expect(execFileImpl.mock.calls.some((call) => call[1][1] === 'edit')).toBe(false);
  });

  it('comment: 本日の盤面 issue へイベントコメントを積む（body 編集はしない）', () => {
    const execFileImpl = fakeGh();
    const result = runBoardUpdate(
      ['comment', '（2026-08-24、指揮台 Fable）レーンQ 起動（実装中へ更新）。'],
      { execFileImpl },
    );
    expect(result).toEqual({ action: 'commented', issueNumber: 2326 });
    const commentCall = execFileImpl.mock.calls.find((call) => call[1][1] === 'comment');
    expect(commentCall![1]).toContain('--body');
    expect(execFileImpl.mock.calls.some((call) => call[1][1] === 'edit')).toBe(false);
  });

  it('comment: 空本文は gh を一切呼ばず例外', () => {
    const execFileImpl = fakeGh();
    expect(() => runBoardUpdate(['comment', '  '], { execFileImpl })).toThrow(/空/);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('未知の subcommand・引数不足は gh を一切呼ばず Usage 例外', () => {
    const execFileImpl = fakeGh();
    expect(() => runBoardUpdate(['lane-set', 'Q'], { execFileImpl })).toThrow(/Usage/);
    expect(() => runBoardUpdate(['lane-upsert', 'Q', '対象'], { execFileImpl })).toThrow(/Usage/);
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});
