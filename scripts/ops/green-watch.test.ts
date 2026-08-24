import { describe, expect, it, vi } from 'vitest';

import {
  aggregateChecks,
  DEFAULT_INTERVAL_SECONDS,
  diffSnapshots,
  parseArgs,
  takeSnapshot,
} from './green-watch.mjs';

type PrSnapshot = { number: number; headSha: string; state: 'pending' | 'success' | 'failure' };

function snapshotMap(entries: PrSnapshot[]) {
  return new Map(entries.map((entry) => [`${entry.number}@${entry.headSha}`, entry]));
}

describe('aggregateChecks', () => {
  it('fail / cancel が 1 つでもあれば failure', () => {
    expect(aggregateChecks([{ bucket: 'pass' }, { bucket: 'fail' }])).toBe('failure');
    expect(aggregateChecks([{ bucket: 'pending' }, { bucket: 'cancel' }])).toBe('failure');
  });

  it('fail が無く pending が残れば pending', () => {
    expect(aggregateChecks([{ bucket: 'pass' }, { bucket: 'pending' }])).toBe('pending');
  });

  it('pass / skipping のみなら success', () => {
    expect(aggregateChecks([{ bucket: 'pass' }, { bucket: 'skipping' }])).toBe('success');
  });

  it('checks が空（未報告）は pending 扱い', () => {
    expect(aggregateChecks([])).toBe('pending');
  });
});

describe('diffSnapshots', () => {
  it('既知 head の pending → success / failure を遷移として返す', () => {
    const prev = snapshotMap([{ number: 100, headSha: 'a'.repeat(40), state: 'pending' }]);
    const next = snapshotMap([{ number: 100, headSha: 'a'.repeat(40), state: 'success' }]);
    expect(diffSnapshots(prev, next)).toEqual([
      { number: 100, headSha: 'a'.repeat(40), from: 'pending', to: 'success' },
    ]);
  });

  it('同じ head の同じ状態は再通知しない（head SHA で dedupe）', () => {
    const snapshot = snapshotMap([{ number: 100, headSha: 'a'.repeat(40), state: 'success' }]);
    expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
  });

  it('新 head が pending で現れただけでは通知しない', () => {
    const prev = snapshotMap([]);
    const next = snapshotMap([{ number: 100, headSha: 'b'.repeat(40), state: 'pending' }]);
    expect(diffSnapshots(prev, next)).toEqual([]);
  });

  it('新 head が最初から終端状態で現れたら通知する（poll 間隔跨ぎの取りこぼし防止）', () => {
    const prev = snapshotMap([]);
    const next = snapshotMap([{ number: 100, headSha: 'b'.repeat(40), state: 'failure' }]);
    expect(diffSnapshots(prev, next)).toEqual([
      { number: 100, headSha: 'b'.repeat(40), from: null, to: 'failure' },
    ]);
  });

  it('head が消えた（merge / close / 新 push）は通知しない', () => {
    const prev = snapshotMap([{ number: 100, headSha: 'a'.repeat(40), state: 'pending' }]);
    const next = snapshotMap([]);
    expect(diffSnapshots(prev, next)).toEqual([]);
  });
});

describe('takeSnapshot（gh 呼び出し契約）', () => {
  it('open PR ごとに checks を集約し number@headSha をキーにする', () => {
    const execFileImpl = vi.fn((cmd: string, args: string[]) => {
      if (cmd !== 'gh') throw new Error(`unexpected command: ${cmd}`);
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([{ number: 2364, headRefOid: 'c'.repeat(40) }]);
      }
      if (args[0] === 'pr' && args[1] === 'checks') {
        return JSON.stringify([{ name: 'Static Checks', state: 'SUCCESS', bucket: 'pass' }]);
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    const snapshot = takeSnapshot({ execFileImpl });
    expect(snapshot.get(`2364@${'c'.repeat(40)}`)).toEqual({
      number: 2364,
      headSha: 'c'.repeat(40),
      state: 'success',
    });
  });

  it('gh pr checks の非 0 exit（fail/pending 時の仕様）でも stdout の JSON を使う', () => {
    const execFileImpl = vi.fn((cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([{ number: 2364, headRefOid: 'd'.repeat(40) }]);
      }
      if (args[0] === 'pr' && args[1] === 'checks') {
        const error = new Error('exit 8') as Error & { stdout: string };
        error.stdout = JSON.stringify([
          { name: 'Unit Tests', state: 'PENDING', bucket: 'pending' },
        ]);
        throw error;
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    const snapshot = takeSnapshot({ execFileImpl });
    expect(snapshot.get(`2364@${'d'.repeat(40)}`)?.state).toBe('pending');
  });

  it('checks 未報告の PR（no checks reported）は pending 扱いで watch に残す', () => {
    const execFileImpl = vi.fn((cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([{ number: 2364, headRefOid: 'e'.repeat(40) }]);
      }
      if (args[0] === 'pr' && args[1] === 'checks') {
        const error = new Error('exit 1') as Error & { stdout: string; stderr: string };
        error.stdout = '';
        error.stderr = "no checks reported on the 'claude/x' branch";
        throw error;
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    const snapshot = takeSnapshot({ execFileImpl });
    expect(snapshot.get(`2364@${'e'.repeat(40)}`)?.state).toBe('pending');
  });
});

describe('parseArgs', () => {
  it('既定は 90 秒 poll の exit-on-transition', () => {
    expect(parseArgs([])).toEqual({
      mode: 'exit-on-transition',
      intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    });
    expect(DEFAULT_INTERVAL_SECONDS).toBe(90);
  });

  it('--follow / --once / --interval-seconds を解釈する', () => {
    expect(parseArgs(['--follow']).mode).toBe('follow');
    expect(parseArgs(['--once']).mode).toBe('once');
    expect(parseArgs(['--interval-seconds', '120']).intervalSeconds).toBe(120);
  });

  it('未知の引数・不正な interval は例外に倒す（意図と違う watch を張らない）', () => {
    expect(() => parseArgs(['--intervall', '30'])).toThrow(/未知の引数/);
    expect(() => parseArgs(['--interval-seconds', '5'])).toThrow(/15 以上/);
    expect(() => parseArgs(['--interval-seconds', 'abc'])).toThrow(/15 以上/);
  });
});
