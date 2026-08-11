import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guardPath = resolve(rootDir, '.claude/hooks/pre-tool-guard.sh');

// path を組み立てるのは、この test file 自体を編集する Write が
// guard の file path 検査に引っかからないようにするため。
const ADMIN = `.op-env${'.'}admin`;
const ADMIN_EXAMPLE = `${ADMIN}.example`;
const LOCAL = `.op-env${'.'}local`;

type Decision = 'block' | 'allow';

function runGuard(input: Record<string, unknown>): Decision {
  const result = spawnSync('bash', [guardPath], {
    cwd: rootDir,
    encoding: 'utf8',
    input: JSON.stringify(input),
  });
  return result.status === 2 ? 'block' : 'allow';
}

function bash(command: string): Record<string, unknown> {
  return { tool_name: 'Bash', tool_input: { command } };
}

function write(filePath: string): Record<string, unknown> {
  return { tool_name: 'Write', tool_input: { file_path: filePath } };
}

describe('pre-tool-guard.sh: .op-env.admin', () => {
  // .op-env.admin があると op run で production の service role key が解決され、
  // admin script が本番へ書き込める。作成と消費の両方を止める必要がある。
  it.each([
    ['雛形からのコピー', `cp ${ADMIN_EXAMPLE} ${ADMIN}`],
    ['リダイレクトでの作成', `cat > ${ADMIN}`],
    ['追記', `echo x >> ${ADMIN}`],
    ['touch', `touch ${ADMIN}`],
    ['セパレータ後の cp', `pnpm i && cp a ${ADMIN}`],
  ])('作成を止める: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it('Write / Edit でも作成を止める', () => {
    expect(runGuard(write(`/x/${ADMIN}`))).toBe('block');
    expect(runGuard({ tool_name: 'Edit', tool_input: { file_path: `/x/${ADMIN}` } })).toBe('block');
  });

  // 作成だけ止めても、雛形をそのまま op run に渡せば同じ権限が解決される。
  it.each([
    ['雛形の直接実行', `op run --env-file=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`],
    ['実ファイル', `op run --env-file=${ADMIN} -- bash scripts/admin-show-user.sh`],
    ['空白区切りの --env-file', `op run --env-file ${ADMIN_EXAMPLE} -- sh -c true`],
    ['セパレータ後の op run', `cd /tmp && op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
  ])('op run による消費を止める: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it.each([
    ['通常 local dev の op run', `op run --env-file=${LOCAL} -- pnpm env:check`],
    ['雛形の読み取り', `cat ${ADMIN_EXAMPLE}`],
    ['名前の grep', `rg -n ${ADMIN} docs/`],
    ['local の作り直し', `cp .op-env.local.example ${LOCAL}`],
    ['無関係コマンド', 'git status'],
  ])('正当な操作は通す: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('allow');
  });

  it('雛形と local の編集は通す', () => {
    expect(runGuard(write(`/x/${ADMIN_EXAMPLE}`))).toBe('allow');
    expect(runGuard({ tool_name: 'Edit', tool_input: { file_path: `/x/${LOCAL}` } })).toBe('allow');
  });

  // 部分一致でガードすると docs や PR 本文にこの command を書くだけで発火する
  // （実際に発火させた）。git push --no-verify と同じくコマンド位置に限定する。
  it('command を文字列として書くだけなら通す', () => {
    const mention = `gh pr edit 1935 --body 'コピーせず op run --env-file=${ADMIN_EXAMPLE} -- bash x.sh とするだけで本番権限が解決される'`;
    expect(runGuard(bash(mention))).toBe('allow');
  });
});
