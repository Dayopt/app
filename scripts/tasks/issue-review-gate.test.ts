import { describe, expect, it, vi } from 'vitest';

import {
  buildIssueReviewMarkerBody,
  CODEX_BOT_LOGIN,
  computeIssueFingerprintFromIssue,
} from '../lib/issue-review-core.mjs';
import { resolveContentChangedAt, runIssueReviewGate } from './issue-review-gate.mjs';

const REVIEWED_URL = 'https://github.com/Dayopt/dayopt/issues/2530#issuecomment-1';

interface IssueFixture {
  title: string;
  body: string;
  labels: string[];
  comments: Array<{
    authorAssociation: string;
    login: string;
    body: string;
    createdAt?: string;
    url?: string;
  }>;
  lastEditedAt?: string | null;
  removedLabels?: string[];
  totalCount?: number;
}

/** gh api graphql の応答を返す execFileImpl スタブを作る。 */
function ghStub(issue: IssueFixture | null) {
  return vi.fn(() =>
    JSON.stringify({
      data: {
        repository: {
          issue: issue
            ? {
                number: 2530,
                title: issue.title,
                body: issue.body,
                labels: { nodes: issue.labels.map((name) => ({ name })) },
                lastEditedAt: issue.lastEditedAt ?? null,
                renames: { nodes: [] },
                unlabeled: {
                  nodes: (issue.removedLabels ?? []).map((name) => ({ label: { name } })),
                },
                comments: {
                  totalCount: issue.totalCount ?? issue.comments.length,
                  nodes: issue.comments.map((c) => ({
                    authorAssociation: c.authorAssociation,
                    author: { login: c.login },
                    body: c.body,
                    createdAt: c.createdAt,
                    url: c.url,
                  })),
                },
              }
            : null,
        },
      },
    }),
  );
}

function markerFor(issue: Pick<IssueFixture, 'title' | 'body' | 'labels'>, overrides = {}) {
  return buildIssueReviewMarkerBody({
    issueNumber: 2530,
    fingerprint: computeIssueFingerprintFromIssue(issue),
    reviewedCommentUrl: REVIEWED_URL,
    p1Count: 0,
    p2Count: 0,
    ...overrides,
  });
}

const BASE = { title: '設計を見直す', body: '## 背景\n本文', labels: ['review:full'] };

function codexCommentEntry(overrides: Partial<IssueFixture['comments'][number]> = {}) {
  return {
    authorAssociation: 'NONE',
    login: CODEX_BOT_LOGIN,
    body: 'レビュー結果です。',
    url: REVIEWED_URL,
    createdAt: '2026-09-01T01:00:00Z',
    ...overrides,
  };
}

function markerEntry(body: string, authorAssociation = 'OWNER') {
  return { authorAssociation, login: 't3-nico', body, createdAt: '2026-09-01T02:00:00Z' };
}

function run(issue: IssueFixture | null) {
  return runIssueReviewGate({ issueNumber: 2530, execFileImpl: ghStub(issue) as never });
}

describe('runIssueReviewGate', () => {
  // #2530 検証 1
  it('review:full が無い issue は required:false で通す', () => {
    const result = run({ ...BASE, labels: ['type:chore'], comments: [] });
    expect(result).toEqual({ required: false, ok: true });
  });

  // #2530 検証 2
  it('review:full だが証跡が無ければ停止する', () => {
    const result = run({ ...BASE, comments: [] });
    expect(result.required).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(CODEX_BOT_LOGIN);
  });

  // #2530 検証 3
  it('現 fingerprint の marker + Codex コメントが揃えば通す', () => {
    const result = run({
      ...BASE,
      comments: [codexCommentEntry(), markerEntry(markerFor(BASE))],
    });
    expect(result.ok).toBe(true);
    expect(result.fingerprint).toBe(computeIssueFingerprintFromIssue(BASE));
  });

  // #2530 検証 4
  it('本文更新後は旧 fingerprint の marker が stale になり停止する', () => {
    const staleMarker = markerFor(BASE);
    const result = run({
      ...BASE,
      body: '## 背景\n本文（実装中に追記した）',
      comments: [codexCommentEntry(), markerEntry(staleMarker)],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('stale');
  });

  // #2530 検証 5
  it('本文更新後に再レビューして marker を出し直せば通る', () => {
    const updated = { ...BASE, body: '## 背景\n本文（修正済み）' };
    const result = run({
      ...updated,
      comments: [
        codexCommentEntry(),
        markerEntry(markerFor(BASE)),
        markerEntry(markerFor(updated)),
      ],
    });
    expect(result.ok).toBe(true);
  });

  // #2530 検証 6（gh 失敗 = fail closed）
  it('gh の取得に失敗したら throw して呼び出し側を停止させる', () => {
    const failing = vi.fn(() => {
      throw new Error('network down');
    });
    expect(() => runIssueReviewGate({ issueNumber: 2530, execFileImpl: failing as never })).toThrow(
      /gh api graphql に失敗/,
    );
  });

  it('応答に issue が無ければ throw する（fail closed）', () => {
    expect(() => run(null)).toThrow(/取得できませんでした/);
  });

  it('応答が JSON でなければ throw する（fail closed）', () => {
    const broken = vi.fn(() => 'not json');
    expect(() => runIssueReviewGate({ issueNumber: 2530, execFileImpl: broken as never })).toThrow(
      /JSON として解釈できません/,
    );
  });

  // #2530 検証 7
  it('P1/P2 未解決（status: findings）では停止する', () => {
    const findingsMarker = markerFor(BASE, { p1Count: 2, p1Note: 'コメント参照' });
    const result = run({
      ...BASE,
      comments: [codexCommentEntry(), markerEntry(findingsMarker)],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('status:');
  });

  it('marker だけあり Codex コメントが無ければ停止する（自己申告を通さない）', () => {
    const result = run({ ...BASE, comments: [markerEntry(markerFor(BASE))] });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(CODEX_BOT_LOGIN);
  });

  it('第三者（NONE）が投稿した marker は無効', () => {
    const result = run({
      ...BASE,
      comments: [codexCommentEntry(), markerEntry(markerFor(BASE), 'NONE')],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('OWNER/MEMBER/COLLABORATOR');
  });

  it('コメント総数が窓を超えていれば truncated を立てる（判定自体は緩めない）', () => {
    const result = run({ ...BASE, comments: [], totalCount: 150 });
    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(true);
  });

  // #2530 Issue Review P2: review:full を外すだけでは軽量経路へ降格させない。
  it('review:full を外しても review 痕跡がある issue は gate 対象のまま', () => {
    const findingsMarker = markerFor(
      { ...BASE, labels: [] },
      { p1Count: 1, p1Note: 'コメント参照' },
    );
    const result = run({
      ...BASE,
      labels: [],
      comments: [codexCommentEntry(), markerEntry(findingsMarker)],
    });
    expect(result.required).toBe(true);
    expect(result.requiredBy).toBe('existing-review-evidence');
    expect(result.ok).toBe(false);
  });

  it('review 痕跡もラベルも無ければ従来どおり軽量経路', () => {
    const result = run({ ...BASE, labels: [], comments: [codexCommentEntry()] });
    expect(result).toEqual({ required: false, ok: true });
  });

  // #2530 Issue Review P2: 複数 marker が同居した時、古い pass が新しい findings を
  // 打ち消してはいけない。
  it('現 fingerprint の marker が複数あれば最新の 1 件だけで判定する', () => {
    const passMarker = markerFor(BASE);
    const findingsMarker = markerFor(BASE, { p1Count: 1, p1Note: '再レビューで新たに検出' });
    const result = runIssueReviewGate({
      issueNumber: 2530,
      execFileImpl: ghStub({
        ...BASE,
        comments: [
          codexCommentEntry(),
          { ...markerEntry(passMarker), createdAt: '2026-09-01T01:00:00Z' },
          { ...markerEntry(findingsMarker), createdAt: '2026-09-01T02:00:00Z' },
        ],
      }) as never,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('古い pass では通しません');
  });

  it('最新が pass なら過去の findings marker があっても通す', () => {
    const findingsMarker = markerFor(BASE, { p1Count: 1, p1Note: '初回指摘' });
    const passMarker = markerFor(BASE);
    const result = runIssueReviewGate({
      issueNumber: 2530,
      execFileImpl: ghStub({
        ...BASE,
        comments: [
          codexCommentEntry(),
          { ...markerEntry(findingsMarker), createdAt: '2026-09-01T01:00:00Z' },
          { ...markerEntry(passMarker), createdAt: '2026-09-01T02:00:00Z' },
        ],
      }) as never,
    });
    expect(result.ok).toBe(true);
  });

  it('REST 形式の login（[bot] サフィックス付き）も Codex コメントとして認識する', () => {
    const result = run({
      ...BASE,
      comments: [
        codexCommentEntry({ login: `${CODEX_BOT_LOGIN}[bot]` }),
        markerEntry(markerFor(BASE)),
      ],
    });
    expect(result.ok).toBe(true);
  });

  // push 前反証レビュー P2: marker が出る前（Codex が P1 を返した直後）に
  // ラベルを剥がす窓を塞ぐ。
  it('review:full の削除履歴があれば marker が無くても gate 対象', () => {
    const result = run({ ...BASE, labels: [], removedLabels: ['review:full'], comments: [] });
    expect(result.required).toBe(true);
    expect(result.requiredBy).toBe('review-full-label-removed');
    expect(result.ok).toBe(false);
  });

  it('無関係なラベルの削除では gate 対象にならない', () => {
    const result = run({ ...BASE, labels: [], removedLabels: ['status:ready'], comments: [] });
    expect(result).toEqual({ required: false, ok: true });
  });

  // Codex コメントの存在だけで gate 対象にすると、review:full と無関係な issue で
  // 一度 Codex を呼んだだけで恒久的に止まる。そうはしない。
  it('Codex コメントがあるだけでは gate 対象にならない', () => {
    const result = run({ ...BASE, labels: [], comments: [codexCommentEntry()] });
    expect(result).toEqual({ required: false, ok: true });
  });

  it('本文がレビュー後に編集されていれば停止する', () => {
    const result = run({
      ...BASE,
      lastEditedAt: '2026-09-01T03:00:00Z',
      comments: [codexCommentEntry(), markerEntry(markerFor(BASE))],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('後に Issue が更新されています');
  });

  it('--repo 相当の owner/name が不正なら throw する', () => {
    expect(() =>
      runIssueReviewGate({
        issueNumber: 2530,
        repo: 'invalid',
        execFileImpl: ghStub(null) as never,
      }),
    ).toThrow(/owner\/name/);
  });
});

describe('resolveContentChangedAt', () => {
  it('本文編集と title 変更の遅い方を返す', () => {
    expect(
      resolveContentChangedAt({
        lastEditedAt: '2026-09-01T01:00:00Z',
        lastRenamedAt: '2026-09-01T02:00:00Z',
      }),
    ).toBe('2026-09-01T02:00:00Z');
    expect(
      resolveContentChangedAt({
        lastEditedAt: '2026-09-01T03:00:00Z',
        lastRenamedAt: '2026-09-01T02:00:00Z',
      }),
    ).toBe('2026-09-01T03:00:00Z');
  });

  // fingerprint は title も含むため、rename だけでも再レビューが要る。
  it('title 変更しか無くてもその時刻を返す', () => {
    expect(resolveContentChangedAt({ lastRenamedAt: '2026-09-01T02:00:00Z' })).toBe(
      '2026-09-01T02:00:00Z',
    );
  });

  it('どちらも無ければ null', () => {
    expect(resolveContentChangedAt({})).toBeNull();
  });
});
