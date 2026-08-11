import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// security guard の test は、正常系の確認ではなく **敵対的な試行を先に列挙する**。
// 「許可すべき形が通る / 明らかに違う形が落ちる」だけを書くと、境界の 1 文字ずらし・
// 区切りの省略・類似名が抜ける。実際 2026-08-11 に guard の正規表現へ 2 回続けて
// 穴が空き（basename 判定、optional group による区切りの任意化）、どちらもこの
// file の test では捕まらず外部レビューが見つけた。判定を足す時は、
// まず「どう書けば通ってしまうか」を数え上げてから allow 側を書く。
//
// guard 実装側の対の教訓は「許可形を省略記法で組み立てず選択肢で列挙する」
// （.claude/hooks/pre-tool-guard.sh のコメント参照）。
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
  // コマンド名ではなく --env-file の指す先で判定するので、op をどう起動しても落ちる。
  it.each([
    ['雛形の直接実行', `op run --env-file=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`],
    ['実ファイル', `op run --env-file=${ADMIN} -- bash scripts/admin-show-user.sh`],
    ['空白区切りの --env-file', `op run --env-file ${ADMIN_EXAMPLE} -- sh -c true`],
    ['セパレータ後の op run', `cd /tmp && op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['env 経由', `env op run --env-file=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`],
    ['command 経由', `command op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['絶対パス', `/opt/homebrew/bin/op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['sh -c でくるむ', `sh -c "op run --env-file=${ADMIN_EXAMPLE} -- sh -c true"`],
    ['環境変数代入を前置', `FOO=1 op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['xargs 経由', `echo x | xargs -I{} op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
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

  // 引数で判定する代償として、この flag と path を並べた文字列を Bash 引数へ
  // 含めるだけでも落ちる。docs に書く時は Write/Edit で file に書いてから渡す。
  // 迂回形を数え上げる方式では env / command / 絶対パス / sh -c と際限がないため、
  // 誤検知を受け入れて class ごと閉じる方を選んでいる。
  it('flag と path を並べた文字列は、引用符の中でも落とす', () => {
    const mention = `gh pr edit 1935 --body 'op run --env-file=${ADMIN_EXAMPLE} -- bash x.sh で本番権限が解決される'`;
    expect(runGuard(bash(mention))).toBe('block');
  });

  // 禁止 path を数え上げる方式は、雛形を別名へ複製されると破れる
  // （cp .op-env.admin.example /tmp/foo → その別名を op run へ）。
  // path 名から中身は判別できないので allowlist にして、中身を問わず落とす。
  it.each([
    ['別名へ複製した env-file', 'op run --env-file=/tmp/foo -- bash scripts/admin-delete-user.sh'],
    ['相対の別名', 'op run --env-file=./tmp-env -- sh -c true'],
    ['変数展開', 'op run --env-file="$OP_ENV_PATH" -- sh -c true'],
    ['local の雛形', 'op run --env-file=.op-env.local.example -- sh -c true'],
    // 「path らしくない token は無視する」例外を置くと、escape を含む path が
    // 検査対象から外れて空白入りの別名で迂回できた。分類せず落とす。
    [
      '空白を escape した別名',
      'op run --env-file=/tmp/foo\\ bar -- bash scripts/admin-delete-user.sh',
    ],
    ['引用符で囲んだ別名', 'op run --env-file="/tmp/foo bar" -- sh -c true'],
    // basename で判定すると、任意ディレクトリに同名で置くだけで通ってしまう。
    // path 文字列そのものを allowlist にして塞ぐ。
    [
      '別ディレクトリの同名ファイル',
      'op run --env-file=/tmp/.op-env.local -- bash scripts/admin-delete-user.sh',
    ],
    ['home 配下の同名ファイル', 'op run --env-file=~/.op-env.local -- sh -c true'],
    ['深い相対 path の同名ファイル', 'op run --env-file=../../../tmp/.op-env.local -- sh -c true'],
    // 許可形を optional group で組み立てると区切りの / が任意になり、
    // 下のような類似名まで通る。省略記法を使わず選択肢で列挙する。
    ['区切りなしの類似名', 'op run --env-file=..op-env.local -- bash scripts/admin-delete-user.sh'],
    ['ドットを増やした類似名', 'op run --env-file=../...op-env.local -- sh -c true'],
    ['1 階層だけ上の同名ファイル', 'op run --env-file=../.op-env.local -- sh -c true'],
    // bash は実行前に `\` + 改行を除去するため、複数行に整形しただけで
    // 行単位の grep は分断される。敵対的な回避ではなく通常の整形で起きる。
    [
      '行継続で分断した flag',
      `op run --env-file\\\n=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`,
    ],
    ['行継続で分断した path', `op run --env-file=\\\n${ADMIN_EXAMPLE} -- sh -c true`],
  ])('許可外の env-file を落とす: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it('作成側も行継続で分断されない', () => {
    expect(runGuard(bash(`cp ${ADMIN_EXAMPLE}\\\n ${ADMIN}`))).toBe('block');
  });

  it.each([
    ['repo root の local', `op run --env-file=${LOCAL} -- pnpm typecheck`],
    ['明示的な ./ 付き', `op run --env-file=./${LOCAL} -- pnpm typecheck`],
    ['workspace からの相対 local', `op run --env-file=../../${LOCAL} -- pnpm typecheck`],
  ])('許可された env-file は通す: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('allow');
  });

  // 判定は fail closed。token を分類して例外を作ると、そこが穴になる
  // （escape を含む path が「path らしくない」として素通りした）。
  // 代償として散文も落ちる。docs に書く時は Write/Edit で file へ書いてから渡す。
  it('散文で flag に言及しただけでも落とす（fail closed の代償）', () => {
    const prose = 'git commit -m "--env-file に渡してよいのは通常の local だけにする"';
    expect(runGuard(bash(prose))).toBe('block');
  });

  it('flag を伴わない名前の言及は通す', () => {
    expect(
      runGuard(bash(`gh pr edit 1935 --body '${ADMIN_EXAMPLE} は production を参照する'`)),
    ).toBe('allow');
  });
});
