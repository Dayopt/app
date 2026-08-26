import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * `.husky/pre-push` の DO-CONFIRM スピードバンプを、tracked ファイルの差分が
 * 無い push（空コミットのみの push。着手時 Draft PR の初回 push 等）でだけ
 * 自動スキップするための判定 script（#2432）。
 *
 * `.husky/pre-push` は「main への直接 push を防ぐ唯一の機構」かつ「push 前の
 * 敵対的セルフレビューの唯一のゲート」（`.claude/rules/workflow.md`
 * §Pause point）。誤って skip 側に倒れると、本来 DO-CONFIRM が出るべき push で
 * 出なくなり、しかも「静かに通った」ため気づかれにくい。そのため本 script の
 * 判定は**あらゆる不確実性を「skip しない」（no-skip）側に倒す**設計とする
 * （plan-review 指摘、plan-critic HALT #2428/#2421/#2432 統合 review 反映）:
 *
 * - git コマンドが失敗する・想定外の出力を返す・実行に時間がかかりすぎる
 *   （タイムアウト）— いずれも「差分あり」とみなす
 * - 比較対象（remote 側の既存 sha、または新規 branch の場合の `origin/main`）
 *   が解決できない — 「差分あり」とみなす
 * - stdin が終端しない（壊れた呼び出し元・想定外の入力形）— 直接実行時の
 *   fail-safe timer が `no-skip` を出して終了する
 *
 * **判定は push対象 branch の各 ref について、range 全体の net diff ではなく
 * 個別 commit ごとの diff を見る**（plan-review 指摘）。range diff
 * （`git diff base..local`）だと、range 内で追加と削除が打ち消し合う commit
 * 列（例: 誤って追加したファイルを次の commit で削除）があった場合に net diff
 * がゼロになり、実際には tracked ファイルへの変更を含む push を誤って
 * skip してしまう。個別 commit の diff がすべて空の場合にのみ skip する。
 */

const ZERO = '0000000000000000000000000000000000000000';
const GIT_TIMEOUT_MS = 5_000;

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/**
 * git pre-push hook の stdin 形式（`<local ref> <local sha> <remote ref>
 * <remote sha>` 1行ずつ）をパースする。
 * @param {string} text
 */
export function parseRefUpdates(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/** branch 更新（削除・tag push を除く）だけを対象にする。 */
export function isBranchUpdate({ localSha, remoteRef }) {
  return localSha !== ZERO && typeof remoteRef === 'string' && remoteRef.startsWith('refs/heads/');
}

function runGit(args, execFileImpl) {
  return execFileImpl('git', args, {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

/**
 * ref 1 件について、tracked ファイルの差分が本当に無いか（=skip候補か）を
 * 判定する。true = 差分あり（skipしない）。
 * @param {{ localSha: string, remoteSha: string }} ref
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function refHasTrackedDiff({ localSha, remoteSha }, { execFileImpl = execFileSync } = {}) {
  let base = remoteSha;
  if (base === ZERO) {
    // 新規 branch の初回 push（remote に既存 ref が無い）。origin/main を
    // フォールバック base にする。解決できなければ安全側（差分あり）に倒す。
    try {
      base = runGit(['rev-parse', '--verify', 'origin/main'], execFileImpl).trim();
    } catch {
      return true;
    }
  }

  let commits;
  try {
    const out = runGit(['rev-list', `${base}..${localSha}`], execFileImpl);
    commits = out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // base が local の祖先でない等、rev-list 自体が失敗する状況。
    // 判定不能なので安全側に倒す。
    return true;
  }

  if (commits.length === 0) {
    // base と local に差が無い（通常起きない: 空コミットで push する運用でも
    // 少なくとも1件は新しい commit があるはず）。想定外のため安全側に倒す。
    return true;
  }

  for (const commit of commits) {
    try {
      // exit 0 = このcommit単体は親との間に差分が無い（空コミット）。
      runGit(['diff', '--quiet', `${commit}^`, commit, '--'], execFileImpl);
    } catch {
      // exit 1（差分あり）、root commit で `^` が存在しない、その他の git
      // エラー — いずれも区別せず「差分あり」とみなす（安全側）。
      return true;
    }
  }
  return false;
}

/**
 * push 対象の branch ref 更新すべてが tracked diff ゼロなら true（skipしてよい）。
 * branch update が1件も無ければ false（呼び出し元は元々 tag push 等でこの
 * 判定を使わない想定だが、念のため skip 側には倒さない）。
 * @param {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string }[]} refUpdates
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function shouldSkipDoConfirm(refUpdates, opts = {}) {
  const branchUpdates = refUpdates.filter(isBranchUpdate);
  if (branchUpdates.length === 0) return false;
  return branchUpdates.every((ref) => !refHasTrackedDiff(ref, opts));
}

// stdin が終端しない・処理が想定外に長引く場合の fail-safe。この時間を超えて
// 判定が終わらなければ `no-skip` を出して終了する（push を無期限にブロック
// しない。既定の DO-CONFIRM が出るだけで、動作としては本 script が存在しない
// 場合と同じに縮退する）。
const FAILSAFE_TIMEOUT_MS = 10_000;

if (isDirectExecution(import.meta.url)) {
  const failsafe = setTimeout(() => {
    console.log('no-skip');
    process.exit(0);
  }, FAILSAFE_TIMEOUT_MS);

  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('error', () => {
    clearTimeout(failsafe);
    console.log('no-skip');
  });
  process.stdin.on('end', () => {
    clearTimeout(failsafe);
    try {
      const refUpdates = parseRefUpdates(Buffer.concat(chunks).toString('utf8'));
      console.log(shouldSkipDoConfirm(refUpdates) ? 'skip' : 'no-skip');
    } catch {
      console.log('no-skip');
    }
  });
}
