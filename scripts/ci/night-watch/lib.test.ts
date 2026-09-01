import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALERT_RUN_STATE_TTL_MS,
  extractTrailingNumber,
  isLatestWorkflowRunPending,
  MAX_NEW_ISSUES_PER_RUN,
  readAlertRunState,
  reserveAlertRunSlot,
} from './lib.mjs';

// push前反証レビュー risk-reviewer 指摘（P3）: 未知の曜日ラベルで無言
// fallback すると isJstWeekend/isJstMonday がどちらも false（平日扱い）を
// 返し、weekend skip が無音で無効化される。throw への変更（fail-open →
// fail-closed の意図的な取り替え）を回帰確認する。

// #2341: scheduled workflow の遅延で直近 run がまだ in_progress/queued の時、
// 旧判定規約（status も無条件で赤判定に含める）は誤って赤と判定していた。
describe('isLatestWorkflowRunPending', () => {
  it.each(['in_progress', 'queued'])('直近 run が status: %s なら true', (status) => {
    expect(isLatestWorkflowRunPending([{ status }, { status: 'completed' }])).toBe(true);
  });

  it('直近 run が completed（terminal）なら false（赤判定を進めてよい）', () => {
    expect(isLatestWorkflowRunPending([{ status: 'completed' }])).toBe(false);
  });

  it('過去の run が in_progress でも直近 run が completed なら false', () => {
    // 配列先頭（最新）だけを見る。2件目以降の in_progress は拾わない。
    expect(isLatestWorkflowRunPending([{ status: 'completed' }, { status: 'in_progress' }])).toBe(
      false,
    );
  });

  it('run が 0 件なら false（別途 fail-closed の取得失敗パスで扱われる想定）', () => {
    expect(isLatestWorkflowRunPending([])).toBe(false);
  });
});

describe('extractTrailingNumber', () => {
  it('issue URL 末尾の番号を取り出す', () => {
    expect(extractTrailingNumber('https://github.com/Dayopt/dayopt/issues/2345\n')).toBe(2345);
  });

  it('comment URL（#issuecomment-ID 付き）でも issue 番号側を取り出す', () => {
    // gh issue comment の出力は https://.../issues/2345#issuecomment-999 形式。
    // 欲しいのは issue 番号（2345）で comment ID（999）ではない。
    expect(
      extractTrailingNumber('https://github.com/Dayopt/dayopt/issues/2345#issuecomment-999'),
    ).toBe(2345);
  });

  it('数字が無ければ null を返す', () => {
    expect(extractTrailingNumber('')).toBeNull();
  });
});

// #2332: night-watch の 1 run あたり起票上限（scripts/ci/night-watch/alert-issue.mjs
// runAlertSync が利用する run-scoped state）。plan-review（plan-critic）指摘に
// 従い、関数注入のスタブではなく実 tmpdir の fs で検証する。
describe('readAlertRunState / reserveAlertRunSlot', () => {
  let stateDir: string;
  let statePath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T01:00:00Z'));
    stateDir = mkdtempSync(join(tmpdir(), 'night-watch-run-state-'));
    statePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(stateDir, { recursive: true, force: true });
  });

  describe('readAlertRunState', () => {
    it('state file が無ければ healthy な fresh state を返す', () => {
      expect(readAlertRunState({ statePath })).toEqual({
        healthy: true,
        updatedAt: Date.now(),
        actedCheckIds: [],
        createdCount: 0,
      });
    });

    it('破損した JSON は healthy: false の fresh state として扱う（fail-open）', () => {
      writeFileSync(statePath, 'not json', 'utf8');
      const state = readAlertRunState({ statePath });
      expect(state.healthy).toBe(false);
      expect(state.actedCheckIds).toEqual([]);
      expect(state.createdCount).toBe(0);
    });

    it.each([
      ['createdCount が上限超過', { updatedAt: Date.now(), actedCheckIds: [], createdCount: 99 }],
      ['createdCount が負数', { updatedAt: Date.now(), actedCheckIds: [], createdCount: -1 }],
      [
        'actedCheckIds が文字列以外を含む',
        { updatedAt: Date.now(), actedCheckIds: [123], createdCount: 0 },
      ],
      ['updatedAt が欠落', { actedCheckIds: [], createdCount: 0 }],
    ])('構造が壊れた state（%s）は healthy: false の fresh state として扱う', (_label, value) => {
      writeFileSync(statePath, JSON.stringify(value), 'utf8');
      const state = readAlertRunState({ statePath });
      expect(state.healthy).toBe(false);
      expect(state.actedCheckIds).toEqual([]);
      expect(state.createdCount).toBe(0);
    });

    it('TTL 超過の state は healthy な fresh state として扱う（別 run とみなす）', () => {
      writeFileSync(
        statePath,
        JSON.stringify({
          updatedAt: Date.now() - ALERT_RUN_STATE_TTL_MS - 1,
          actedCheckIds: ['docs-check'],
          createdCount: 3,
        }),
        'utf8',
      );
      const state = readAlertRunState({ statePath });
      expect(state.healthy).toBe(true);
      expect(state.actedCheckIds).toEqual([]);
      expect(state.createdCount).toBe(0);
    });

    it('TTL 内の state はそのまま返す', () => {
      writeFileSync(
        statePath,
        JSON.stringify({
          updatedAt: Date.now() - 1000,
          actedCheckIds: ['docs-check'],
          createdCount: 1,
        }),
        'utf8',
      );
      const state = readAlertRunState({ statePath });
      expect(state).toEqual({
        healthy: true,
        updatedAt: Date.now() - 1000,
        actedCheckIds: ['docs-check'],
        createdCount: 1,
      });
    });
  });

  describe('reserveAlertRunSlot', () => {
    it('初回は許可し、state を書き込む', () => {
      const result = reserveAlertRunSlot({ checkId: 'docs-check', willCreate: true, statePath });
      expect(result).toEqual({ allowed: true });
      expect(readAlertRunState({ statePath })).toEqual({
        healthy: true,
        updatedAt: Date.now(),
        actedCheckIds: ['docs-check'],
        createdCount: 1,
      });
    });

    it('同一 check-id への 2 回目は拒否する（無制限追記ループの class を閉じる）', () => {
      reserveAlertRunSlot({ checkId: 'docs-check', willCreate: false, statePath });
      const second = reserveAlertRunSlot({ checkId: 'docs-check', willCreate: false, statePath });
      expect(second).toEqual({ allowed: false, reason: 'run-cap-reached' });
    });

    it(`新規起票（willCreate: true）は ${MAX_NEW_ISSUES_PER_RUN} 件目までを許可し、それ以降は拒否する`, () => {
      const checkIds = ['a', 'b', 'c', 'd'];
      const results = checkIds.map((checkId) =>
        reserveAlertRunSlot({ checkId, willCreate: true, statePath }),
      );
      expect(results.slice(0, MAX_NEW_ISSUES_PER_RUN)).toEqual(
        Array.from({ length: MAX_NEW_ISSUES_PER_RUN }, () => ({ allowed: true })),
      );
      expect(results[MAX_NEW_ISSUES_PER_RUN]).toEqual({
        allowed: false,
        reason: 'run-cap-reached',
      });
    });

    it('コメント追記（willCreate: false）は新規起票の cap を消費しない', () => {
      // 新規起票を上限まで使い切っても、既存 issue への追記（別 check-id）は
      // 「新規起票のみ 3 件」の cap 対象外（check-id 単位の冪等性だけが効く）。
      ['a', 'b', 'c'].forEach((checkId) =>
        reserveAlertRunSlot({ checkId, willCreate: true, statePath }),
      );
      const result = reserveAlertRunSlot({ checkId: 'sentry-new', willCreate: false, statePath });
      expect(result).toEqual({ allowed: true });
    });

    // push前反証レビュー risk-reviewer 指摘（P2）: state の書き込み失敗
    // （tmpdir read-only / ENOSPC / 権限不足）を無視して例外を投げると、
    // gh を一切呼ばずに CLI が exit 1 し、その run の全 check-id で起票・
    // 追記が 1 件も出なくなる。fail-open（allowed: true を返す）を固定する。
    it('state の書き込みに失敗しても fail-open で許可する（例外を投げない）', () => {
      const unwritablePath = join(stateDir, 'no-such-subdir', 'state.json');
      expect(() =>
        reserveAlertRunSlot({ checkId: 'docs-check', willCreate: true, statePath: unwritablePath }),
      ).not.toThrow();
      expect(
        reserveAlertRunSlot({ checkId: 'deadcode', willCreate: true, statePath: unwritablePath }),
      ).toEqual({ allowed: true });
    });
  });
});
