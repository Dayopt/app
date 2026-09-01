import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { CODEX_BOT_LOGIN } from '../lib/issue-review-core.mjs';
import {
  assertBodyNotEditedAfterReview,
  findLatestCodexComment,
  generateIssueReviewMarker,
} from '../tasks/generate-issue-review-marker.mjs';

const CODEX_COMMENT_URL = 'https://github.com/Dayopt/dayopt/issues/2530#issuecomment-42';

interface IssueFixture {
  title?: string;
  body?: string;
  labels?: string[];
  lastEditedAt?: string | null;
  comments?: Array<{ createdAt: string; url: string; login: string }>;
}

function ghStub(issue: IssueFixture) {
  return vi.fn(() =>
    JSON.stringify({
      data: {
        repository: {
          issue: {
            number: 2530,
            title: issue.title ?? 'タイトル',
            body: issue.body ?? '本文',
            createdAt: '2026-09-01T00:00:00Z',
            lastEditedAt: issue.lastEditedAt ?? null,
            labels: { nodes: (issue.labels ?? ['review:full']).map((name) => ({ name })) },
            comments: {
              nodes: (issue.comments ?? []).map((c) => ({
                createdAt: c.createdAt,
                url: c.url,
                author: { login: c.login },
              })),
            },
          },
        },
      },
    }),
  );
}

const CODEX_REVIEWED = {
  createdAt: '2026-09-01T01:00:00Z',
  url: CODEX_COMMENT_URL,
  login: CODEX_BOT_LOGIN,
};

function generate(issue: IssueFixture, args: Record<string, unknown> = {}) {
  return generateIssueReviewMarker(
    {
      issueNumber: 2530,
      repo: 'Dayopt/dayopt',
      p1Count: 0,
      p2Count: 0,
      ...args,
    } as never,
    { execFileImpl: ghStub(issue) as never },
  );
}

describe('findLatestCodexComment', () => {
  it('Codex bot のコメントのうち最新を返す', () => {
    const latest = findLatestCodexComment({
      nodes: [
        { createdAt: '2026-09-01T01:00:00Z', url: 'old', author: { login: CODEX_BOT_LOGIN } },
        { createdAt: '2026-09-02T01:00:00Z', url: 'new', author: { login: CODEX_BOT_LOGIN } },
        { createdAt: '2026-09-03T01:00:00Z', url: 'human', author: { login: 't3-nico' } },
      ],
    });
    expect(latest?.url).toBe('new');
  });

  it('Codex bot のコメントが無ければ null', () => {
    expect(
      findLatestCodexComment({
        nodes: [{ createdAt: '2026-09-01T01:00:00Z', url: 'x', author: { login: 't3-nico' } }],
      }),
    ).toBeNull();
  });
});

describe('assertBodyNotEditedAfterReview', () => {
  it('未編集（lastEditedAt が null）なら通す', () => {
    expect(() =>
      assertBodyNotEditedAfterReview({ lastEditedAt: null }, CODEX_REVIEWED),
    ).not.toThrow();
  });

  it('レビュー前の編集なら通す', () => {
    expect(() =>
      assertBodyNotEditedAfterReview({ lastEditedAt: '2026-09-01T00:30:00Z' }, CODEX_REVIEWED),
    ).not.toThrow();
  });

  it('レビュー後の編集は拒否する（順序の逆転を検出）', () => {
    expect(() =>
      assertBodyNotEditedAfterReview({ lastEditedAt: '2026-09-01T02:00:00Z' }, CODEX_REVIEWED),
    ).toThrow(/より後に編集されています/);
  });

  it('時刻を解釈できなければ fail closed', () => {
    expect(() =>
      assertBodyNotEditedAfterReview({ lastEditedAt: 'not-a-date' }, CODEX_REVIEWED),
    ).toThrow(/fail closed/);
  });
});

describe('generateIssueReviewMarker', () => {
  it('Codex コメントがあれば marker を生成し fingerprint を実測値で埋める', () => {
    const marker = generate({ comments: [CODEX_REVIEWED] });
    expect(marker).toContain('[codex-issue-review]');
    expect(marker).toContain('issue: #2530');
    expect(marker).toMatch(/^fingerprint: [0-9a-f]{64}$/m);
    expect(marker).toContain(`reviewed-comment: ${CODEX_COMMENT_URL}`);
    expect(marker).toContain('status: pass');
    expect(marker).toContain('P1: なし');
  });

  it('Codex コメントが無ければ marker を生成しない', () => {
    expect(() => generate({ comments: [] })).toThrow(/レビューコメントがありません/);
  });

  it('レビュー後に本文が編集されていたら marker を生成しない', () => {
    expect(() =>
      generate({ comments: [CODEX_REVIEWED], lastEditedAt: '2026-09-01T02:00:00Z' }),
    ).toThrow(/より後に編集されています/);
  });

  it('P1 が非ゼロで resolution-note が無ければ status: findings（gate は通らない）', () => {
    const marker = generate({ comments: [CODEX_REVIEWED] }, { p1Count: 2, p1Note: 'コメント参照' });
    expect(marker).toContain('status: findings');
    expect(marker).toContain('P1: 2 件（コメント参照）');
  });

  it('P1 が非ゼロでも resolution-note があれば status: pass + resolution 行', () => {
    const marker = generate(
      { comments: [CODEX_REVIEWED] },
      { p1Count: 2, p1Note: 'コメント参照', resolutionNote: '本文を修正し再レビュー済み' },
    );
    expect(marker).toContain('status: pass');
    expect(marker).toContain('resolution: 本文を修正し再レビュー済み');
  });

  it('review:full ラベルの有無で fingerprint が変わる（gate と同じ canonical を使う）', () => {
    const withLabel = generate({ comments: [CODEX_REVIEWED], labels: ['review:full'] });
    const withoutLabel = generate({ comments: [CODEX_REVIEWED], labels: [] });
    expect(withLabel).not.toBe(withoutLabel);
  });
});

describe('CLI 引数の契約', () => {
  const scriptPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../tasks/generate-issue-review-marker.mjs',
  );

  function runCli(args: string[]) {
    return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  }

  // fingerprint / reviewed-comment / status を手入力できると、実測値で束縛する
  // 設計そのものが無効化される。dispatch skill が明記している契約。
  it.each([['--fingerprint'], ['--reviewed-comment'], ['--status']])(
    '%s は受け付けない（捏造経路を塞ぐ）',
    (flag) => {
      const result = runCli(['2530', flag, 'x']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('引数で受け付けません');
    },
  );

  it('issue 番号が無ければ失敗する', () => {
    const result = runCli([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('issue 番号');
  });

  it('--p1 / --p2 に非数値は渡せない', () => {
    const result = runCli(['2530', '--p1', 'いくつか']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('0 以上の整数');
  });
});
