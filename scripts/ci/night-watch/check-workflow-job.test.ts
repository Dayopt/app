import { describe, expect, it, vi } from 'vitest';

import { runCheckWorkflowJob } from './check-workflow-job.mjs';
import { NIGHTLY_HEAVY_JOB_NAMES, NIGHTLY_INTEGRATION_JOB_NAME } from './run-all.mjs';

/**
 * heavy-red / integration-red を「単一の単純コマンド」として手動代行できる
 * ようにする wrapper（#2483。層3 guard の allowlist から呼ばれる）。
 * 実体（`checkWorkflowJobRun`）の判定ロジックは run-all.test.ts が固定するため、
 * ここでは checkId → 対象 job 名の写像だけを、実 gh を呼ばず execFileImpl の
 * DI で固定する（CI runner に gh 認証が無くても決定的に通す）。
 */
describe('runCheckWorkflowJob', () => {
  it('未知の checkId は例外を投げる（層3 guard は完全一致のみ許可するため、ここに未知値が渡ることは無いが fail closed で守る）', () => {
    expect(() => runCheckWorkflowJob('docs-check')).toThrow(/未知の checkId/);
  });

  it('heavy-red は NIGHTLY_HEAVY_JOB_NAMES（複数 job）で checkWorkflowJobRun を呼ぶ', () => {
    const execFileImpl = vi.fn((file: string, args: string[]) => {
      if (args[0] === 'run' && args[1] === 'list') {
        // 24h window 判定（judgeWorkflowRun）を green 側に倒すため、実行時刻に
        // 近い createdAt を使う（固定日付だと将来 24h を超えて red 化する）。
        return JSON.stringify([{ databaseId: 1, createdAt: new Date().toISOString(), url: 'u1' }]);
      }
      if (args[0] === 'api') {
        return JSON.stringify(
          NIGHTLY_HEAVY_JOB_NAMES.map((name) => ({
            name,
            status: 'completed',
            conclusion: 'success',
            html_url: 'job-url',
          })),
        );
      }
      throw new Error(`unmocked: ${file} ${args.join(' ')}`);
    });
    const outcome = runCheckWorkflowJob('heavy-red', { execFileImpl });
    expect(outcome).toEqual({ status: 'green' });
    const jobsCall = execFileImpl.mock.calls.find((c) => c[1][0] === 'api');
    expect(jobsCall).toBeDefined();
  });

  it('integration-red は NIGHTLY_INTEGRATION_JOB_NAME（単一 job）で checkWorkflowJobRun を呼ぶ', () => {
    const execFileImpl = vi.fn((file: string, args: string[]) => {
      if (args[0] === 'run' && args[1] === 'list') {
        return JSON.stringify([
          { databaseId: 1, createdAt: '2026-08-25T03:30:00+09:00', url: 'u1' },
        ]);
      }
      if (args[0] === 'api') {
        return JSON.stringify([
          {
            name: NIGHTLY_INTEGRATION_JOB_NAME,
            status: 'completed',
            conclusion: 'failure',
            html_url: 'job-url',
          },
        ]);
      }
      throw new Error(`unmocked: ${file} ${args.join(' ')}`);
    });
    const outcome = runCheckWorkflowJob('integration-red', { execFileImpl });
    expect(outcome).toEqual({ status: 'red', evidenceUrl: 'job-url' });
  });

  it('run-list 自体の取得失敗は fetch-failed（例外を投げない）', () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('rate limited');
    });
    expect(runCheckWorkflowJob('heavy-red', { execFileImpl })).toEqual({ status: 'fetch-failed' });
  });
});
