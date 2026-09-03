import { describe, expect, it } from 'vitest';

import { hasPendingChecks, isAwaitingCodexResponse, resolveScope } from './review-request.mjs';

// `main` は gh 実行の副作用そのものなので、ここでは投稿するかどうかを決める
// 純粋な判定だけを固定する（gh を挟む経路は finish-branch.test.ts と同じく
// stub 前提になるため、判定の contract をこちらで担保する）。
describe('review-request の判定', () => {
  describe('resolveScope', () => {
    it('review:full があれば all（保護対象外の変更でも証跡を失効させる）', () => {
      expect(resolveScope(['priority:p1', 'review:full'])).toBe('all');
    });

    it('無ければ protected', () => {
      expect(resolveScope(['priority:p1'])).toBe('protected');
      expect(resolveScope([])).toBe('protected');
    });
  });

  describe('hasPendingChecks', () => {
    it('IN_PROGRESS / QUEUED / PENDING を実行中とみなす', () => {
      expect(hasPendingChecks([{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }])).toBe(true);
      expect(hasPendingChecks([{ status: 'QUEUED' }])).toBe(true);
      expect(hasPendingChecks([{ state: 'PENDING' }])).toBe(true);
    });

    it('全て完了していれば false', () => {
      expect(hasPendingChecks([{ status: 'COMPLETED' }, { state: 'SUCCESS' }])).toBe(false);
    });

    it('rollup が空 / 欠落でも落ちない', () => {
      expect(hasPendingChecks([])).toBe(false);
      expect(hasPendingChecks(undefined)).toBe(false);
    });
  });

  describe('isAwaitingCodexResponse', () => {
    const request = { author: { login: 't3-nico' }, body: '@codex review' };
    const codexResponse = {
      author: { login: 'chatgpt-codex-connector' },
      body: '**Reviewed commit:** `abc1234`',
    };

    it('依頼の後に Codex の投稿が無ければ応答待ち（連投を止める）', () => {
      expect(isAwaitingCodexResponse([request])).toBe(true);
      expect(isAwaitingCodexResponse([codexResponse, request])).toBe(true);
    });

    it('依頼の後に Codex の投稿があれば応答済み', () => {
      expect(isAwaitingCodexResponse([request, codexResponse])).toBe(false);
    });

    it('`[bot]` サフィックス付きの login も Codex とみなす', () => {
      expect(
        isAwaitingCodexResponse([
          request,
          { author: { login: 'chatgpt-codex-connector[bot]' }, body: 'ok' },
        ]),
      ).toBe(false);
    });

    it('依頼が 1 件も無ければ応答待ちではない（初回は投稿してよい）', () => {
      expect(isAwaitingCodexResponse([{ author: { login: 't3-nico' }, body: 'よろしく' }])).toBe(
        false,
      );
    });
  });
});
