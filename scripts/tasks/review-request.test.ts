import { describe, expect, it } from 'vitest';

import {
  extractReviewedSha,
  hasPendingChecks,
  isAwaitingCodexResponse,
  resolveScope,
} from './review-request.mjs';

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

  // push 前反証レビュー P2: 証跡としては review object しか見ず、応答としては
  // comment しか見ない非対称は、両方向に実害がある。
  describe('証跡と応答の 2 形態（gate と同じ契約）', () => {
    it('`Reviewed commit` 付き comment から sha を取れる（指摘ゼロの clean pass 形態）', () => {
      expect(extractReviewedSha('**Reviewed commit:** `abc1234def`')).toBe('abc1234def');
    });

    it('fix round 後の narrative（現 HEAD `<sha>`）からも sha を取れる', () => {
      expect(extractReviewedSha('現 HEAD `abc1234` を再確認しました')).toBe('abc1234');
    });

    it('sha の無い本文では空文字（usage limit 応答など）', () => {
      expect(extractReviewedSha('You have reached your Codex usage limits.')).toBe('');
    });

    it('review object で応答されていれば応答待ちにしない（再依頼が発火しない穴を塞ぐ）', () => {
      const comments = [
        { author: { login: 't3-nico' }, body: '@codex review', createdAt: '2026-09-03T00:00:00Z' },
      ];
      const reviews = [
        {
          author: { login: 'chatgpt-codex-connector' },
          state: 'COMMENTED',
          submittedAt: '2026-09-03T00:05:00Z',
        },
      ];
      expect(isAwaitingCodexResponse(comments, reviews)).toBe(false);
    });

    it('依頼より前の review object は応答とみなさない', () => {
      const comments = [
        { author: { login: 't3-nico' }, body: '@codex review', createdAt: '2026-09-03T00:10:00Z' },
      ];
      const reviews = [
        {
          author: { login: 'chatgpt-codex-connector' },
          state: 'COMMENTED',
          submittedAt: '2026-09-03T00:05:00Z',
        },
      ];
      expect(isAwaitingCodexResponse(comments, reviews)).toBe(true);
    });

    it('時刻が読めない review object は応答扱いにする（判定不能で投稿を増やさない）', () => {
      const comments = [
        { author: { login: 't3-nico' }, body: '@codex review', createdAt: '2026-09-03T00:00:00Z' },
      ];
      const reviews = [{ author: { login: 'chatgpt-codex-connector' }, state: 'COMMENTED' }];
      expect(isAwaitingCodexResponse(comments, reviews)).toBe(false);
    });
  });
});
