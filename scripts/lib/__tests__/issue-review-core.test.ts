import { describe, expect, it } from 'vitest';

import {
  CODEX_BOT_LOGIN,
  buildIssueReviewMarkerBody,
  canonicalizeIssueForReview,
  computeIssueFingerprint,
  computeIssueFingerprintFromIssue,
  formatIssueReviewCountLine,
  validateIssueReviewEvidence,
} from '../issue-review-core.mjs';

const REVIEWED_URL = 'https://github.com/Dayopt/dayopt/issues/2530#issuecomment-1';

function fingerprintOf(issue: { title?: string; body?: string; labels?: string[] }): string {
  return computeIssueFingerprintFromIssue(issue);
}

function markerComment(body: string, overrides: Record<string, unknown> = {}) {
  return { authorAssociation: 'OWNER', author: { login: 't3-nico' }, body, ...overrides };
}

function botComment(body = 'Codex のレビュー結果です。') {
  return { authorAssociation: 'NONE', author: { login: CODEX_BOT_LOGIN }, body };
}

describe('canonicalizeIssueForReview / computeIssueFingerprint', () => {
  it('同じ内容なら fingerprint は決定的', () => {
    const issue = { title: 'タイトル', body: '本文', labels: ['review:full'] };
    expect(fingerprintOf(issue)).toBe(fingerprintOf({ ...issue }));
    expect(fingerprintOf(issue)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('CRLF と LF は同じ fingerprint になる', () => {
    const lf = { title: 'a', body: '1 行目\n2 行目', labels: [] };
    const crlf = { title: 'a', body: '1 行目\r\n2 行目', labels: [] };
    expect(fingerprintOf(lf)).toBe(fingerprintOf(crlf));
  });

  it('行末の空白差は fingerprint を変えない', () => {
    const clean = { title: 'a', body: '本文\n次の行', labels: [] };
    const trailing = { title: 'a', body: '本文   \n次の行\t', labels: [] };
    expect(fingerprintOf(clean)).toBe(fingerprintOf(trailing));
  });

  // dispatch は status:ready -> status:in-progress を必ず付け替える。ここで
  // fingerprint が変わると、着手した瞬間に自分の review が stale になる。
  it('status:* ラベルの変化は fingerprint を変えない', () => {
    const before = { title: 'a', body: 'b', labels: ['review:full', 'status:ready'] };
    const after = { title: 'a', body: 'b', labels: ['review:full', 'status:in-progress'] };
    expect(fingerprintOf(before)).toBe(fingerprintOf(after));
  });

  it('review:full の有無は fingerprint を変える', () => {
    const withLabel = { title: 'a', body: 'b', labels: ['review:full'] };
    const withoutLabel = { title: 'a', body: 'b', labels: [] };
    expect(fingerprintOf(withLabel)).not.toBe(fingerprintOf(withoutLabel));
  });

  it('title / body の変更は fingerprint を変える', () => {
    const base = { title: 'a', body: 'b', labels: [] };
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, title: 'a2' }));
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, body: 'b2' }));
  });

  it('canonical 表現は title / body / labels の 3 行構造', () => {
    const canonical = canonicalizeIssueForReview({
      title: 'T',
      body: 'B',
      labels: ['review:full', 'type:chore'],
    });
    expect(canonical).toBe('title:T\nbody:B\nlabels:review:full');
    expect(computeIssueFingerprint(canonical)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('body 欠落（null / undefined）でも例外を投げない', () => {
    expect(() => fingerprintOf({ title: 'a', labels: [] })).not.toThrow();
  });
});

describe('formatIssueReviewCountLine', () => {
  it('0 件は zerolike の「なし」固定', () => {
    expect(formatIssueReviewCountLine('P1', 0, undefined)).toBe('なし');
  });

  it('0 件へ注釈を付けようとすると失敗する', () => {
    expect(() => formatIssueReviewCountLine('P1', 0, '対応済み')).toThrow(/注釈を付けられません/);
  });

  it('非ゼロは件数、注釈付きは括弧書き', () => {
    expect(formatIssueReviewCountLine('P2', 2, undefined)).toBe('2 件');
    expect(formatIssueReviewCountLine('P2', 2, 'コメント参照')).toBe('2 件（コメント参照）');
  });

  it('負数・非整数は拒否する', () => {
    expect(() => formatIssueReviewCountLine('P1', -1, undefined)).toThrow();
    expect(() => formatIssueReviewCountLine('P1', 1.5, undefined)).toThrow();
  });
});

describe('buildIssueReviewMarkerBody', () => {
  const fingerprint = 'a'.repeat(64);

  it('指摘ゼロなら status: pass の marker を組み立てる', () => {
    const body = buildIssueReviewMarkerBody({
      issueNumber: 2530,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 0,
      p2Count: 0,
    });
    expect(body).toBe(
      [
        '[codex-issue-review]',
        'issue: #2530',
        `fingerprint: ${fingerprint}`,
        `reviewed-comment: ${REVIEWED_URL}`,
        'status: pass',
        'P1: なし',
        'P2: なし',
      ].join('\n'),
    );
  });

  it('P1/P2 が非ゼロで resolution が無ければ status: findings', () => {
    const body = buildIssueReviewMarkerBody({
      issueNumber: 2530,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 1,
      p2Count: 0,
    });
    expect(body).toContain('status: findings');
    expect(body).toContain('P1: 1 件');
    expect(body).not.toContain('resolution:');
  });

  it('P1/P2 が非ゼロでも resolution があれば status: pass と resolution 行が付く', () => {
    const body = buildIssueReviewMarkerBody({
      issueNumber: 2530,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 1,
      p1Note: 'コメント参照',
      p2Count: 0,
      resolutionNote: '本文を修正し再レビュー済み',
    });
    expect(body).toContain('status: pass');
    expect(body).toContain('resolution: 本文を修正し再レビュー済み');
  });

  it('P3 は指定時だけ行が増える', () => {
    const withP3 = buildIssueReviewMarkerBody({
      issueNumber: 2530,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 0,
      p2Count: 0,
      p3: '記録のみ',
    });
    expect(withP3).toContain('P3: 記録のみ');
  });

  it('64 桁 hex でない fingerprint を拒否する（手書き経路を塞ぐ）', () => {
    expect(() =>
      buildIssueReviewMarkerBody({
        issueNumber: 2530,
        fingerprint: 'deadbeef',
        reviewedCommentUrl: REVIEWED_URL,
        p1Count: 0,
        p2Count: 0,
      }),
    ).toThrow(/64 桁 hex/);
  });

  it('reviewed-comment URL が無ければ拒否する', () => {
    expect(() =>
      buildIssueReviewMarkerBody({
        issueNumber: 2530,
        fingerprint,
        reviewedCommentUrl: '',
        p1Count: 0,
        p2Count: 0,
      }),
    ).toThrow(/reviewed-comment/);
  });

  it('issue 番号が不正なら拒否する', () => {
    expect(() =>
      buildIssueReviewMarkerBody({
        issueNumber: 0,
        fingerprint,
        reviewedCommentUrl: REVIEWED_URL,
        p1Count: 0,
        p2Count: 0,
      }),
    ).toThrow(/issue 番号/);
  });
});

describe('validateIssueReviewEvidence', () => {
  const issueNumber = 2530;
  const fingerprint = 'b'.repeat(64);
  const validMarker = buildIssueReviewMarkerBody({
    issueNumber,
    fingerprint,
    reviewedCommentUrl: REVIEWED_URL,
    p1Count: 0,
    p2Count: 0,
  });

  it('bot コメント + 現 fingerprint の marker が揃えば ok', () => {
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(validMarker)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(true);
  });

  it('Codex bot コメントが無ければ marker があっても停止する', () => {
    const result = validateIssueReviewEvidence({
      comments: [markerComment(validMarker)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(CODEX_BOT_LOGIN);
  });

  it('marker が無ければ bot コメントがあっても停止する', () => {
    const result = validateIssueReviewEvidence({
      comments: [botComment()],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('[codex-issue-review]');
  });

  it('fingerprint が古ければ stale として停止する', () => {
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(validMarker)],
      issueNumber,
      expectedFingerprint: 'c'.repeat(64),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('stale');
  });

  it('第三者（NONE）の marker は無効', () => {
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(validMarker, { authorAssociation: 'NONE' })],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('OWNER/MEMBER/COLLABORATOR');
  });

  it('引用された marker（先頭が >）は無効', () => {
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(`> ${validMarker}`)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
  });

  it('issue 番号が違う marker は無効', () => {
    const otherIssueMarker = buildIssueReviewMarkerBody({
      issueNumber: 9999,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 0,
      p2Count: 0,
    });
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(otherIssueMarker)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('issue:');
  });

  it('status: findings の marker は通さない', () => {
    const findingsMarker = buildIssueReviewMarkerBody({
      issueNumber,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 1,
      p2Count: 0,
    });
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(findingsMarker)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('status:');
  });

  // marker 自体は手書きできるため、generator の導出だけでは守れない。
  it('非ゼロ P1 に status: pass を手書きしても resolution が無ければ無効', () => {
    const handwritten = [
      '[codex-issue-review]',
      `issue: #${issueNumber}`,
      `fingerprint: ${fingerprint}`,
      `reviewed-comment: ${REVIEWED_URL}`,
      'status: pass',
      'P1: 2 件',
      'P2: なし',
    ].join('\n');
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(handwritten)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('resolution:');
  });

  it('非ゼロ P1 + resolution なら通る', () => {
    const resolved = buildIssueReviewMarkerBody({
      issueNumber,
      fingerprint,
      reviewedCommentUrl: REVIEWED_URL,
      p1Count: 2,
      p1Note: 'コメント参照',
      p2Count: 0,
      resolutionNote: '本文を修正して再レビュー済み',
    });
    const result = validateIssueReviewEvidence({
      comments: [botComment(), markerComment(resolved)],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(true);
  });

  it('コメントが空でも例外を投げず停止側に倒れる', () => {
    const result = validateIssueReviewEvidence({
      comments: [],
      issueNumber,
      expectedFingerprint: fingerprint,
    });
    expect(result.ok).toBe(false);
  });
});
