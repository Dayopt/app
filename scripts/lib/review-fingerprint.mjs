/**
 * Review fingerprint (#2558) - binds a cross-review to the *diff it read*
 * instead of to the commit SHA it happened to be posted against.
 *
 * ## なぜ SHA 束縛をやめるか
 *
 * 旧設計は「証跡が現 HEAD を指しているか」だけを見ていた。レビューが実際に読んだ
 * のは diff であって commit ではないため、docs だけの commit・追従 merge・
 * lint fix のような「レビュー対象を 1 行も変えない push」でも証跡が失効し、
 * `@codex review` の再依頼と CI の再実行を強いていた（PR #2554 実測: fix 6 push +
 * 追従 1 で Codex 起動 8 回 / CI 10 回）。
 *
 * 指紋は `git diff <base>...<head>`（three-dot = merge-base 基準）から作るので、
 * **追従 merge では値が変わらない**（merge-base が進んでも、レーンが加えた変更が
 * 同じなら同じ diff になる）。
 *
 * ## 何を指紋に含めるか
 *
 * `scope`:
 * - `'protected'`: 保護対象 path（`scripts/ci/protected-path-gate.mjs` の
 *   `PROTECTED_PATH_GLOBS`）に該当する file の変更行だけ。gate が保護対象 path の
 *   一致だけで必須化された PR で使う。保護対象外の変更で指紋が変わらないのは
 *   **レビュー免除ではなく、そこは CI が見るという #2489 の境界**に乗っている。
 * - `'all'`: 全 file の変更行。`review:full`（手動エスカレーション / linked issue
 *   からの継承）や判定不能で fail closed した PR で使う。「重く見る」と宣言された
 *   PR で保護対象外の変更を指紋から落とすと、その PR に限り緩和が過剰になるため。
 *
 * 各 file について、hunk header の**行番号だけ**（`@@ -1,7 +1,9 @@`）を落とす。
 * 追従 merge で merge-base が進むと、レーンの変更が同一でも行番号が動くため、
 * そこを含めると「追従で指紋が変わらない」という中核の性質が壊れる。
 *
 * **context 行（先頭空白）は落とさない。** 変更行だけを拾うと「同じ行をファイル内の
 * 別の場所へ移した diff」が同じ指紋になり、`+ return await handleToken(req)` を認可
 * チェックの後ろから前へ動かす push が「レビュー対象は変わっていない」と判定される
 * （push 前反証レビュー P1、2026-09-03 実測）。context を含めれば行の位置が指紋に
 * 効く。追従 merge で main がレーンの変更の近傍（既定 ±3 行）を触った場合だけ指紋が
 * 変わるが、それは再レビュー側（fail closed）へ倒れるだけで安全側。
 *
 * mode 変更・rename・binary の差分行も含める（内容が変わらなくてもレビュー対象の
 * 性質が変わるため）。
 *
 * ## fail closed の方向
 *
 * `diff --git` 行から path を取り出せなかった block は**保護対象として扱う**
 * （quote された path 等）。取りこぼすと「指紋が変わらない = 旧レビューが有効」へ
 * 倒れるため、判定不能は指紋が変わる側（= レビューし直す側）へ寄せる。
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { isProtectedPath } from '../ci/protected-path-gate.mjs';
import { isDirectExecution } from './is-direct-execution.mjs';

/**
 * commit status の description（140 字上限）へ載せるため、sha256 を先頭 16 桁へ
 * 詰める。16 hex = 64 bit で、1 PR の中で「別の diff が同じ値になる」確率は無視
 * できる。衝突しても効果は「レビューし直しを 1 回省く」であって gate の突破では
 * ない（内製証跡は write 権限者しか作れず、Codex 証跡は bot しか作れない）。
 */
export const FINGERPRINT_HEX_LENGTH = 16;

export const FINGERPRINT_SCOPES = ['protected', 'all'];

const FINGERPRINT_RE = new RegExp(`^[0-9a-f]{${FINGERPRINT_HEX_LENGTH}}$`);

/** 指紋の書式検証（gate 側が description から抜いた値をそのまま渡す）。 */
export function isValidFingerprint(value) {
  return typeof value === 'string' && FINGERPRINT_RE.test(value);
}

function parseDiffGitPaths(line) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!match) return null;
  return { oldPath: match[1], newPath: match[2] };
}

/**
 * unified diff を「指紋の材料」へ正規化する。
 *
 * @param {string} diffText `git diff <base>...<head>` の出力
 * @param {'protected' | 'all'} scope
 * @returns {string} 正規化済みテキスト（file 順は path でソート）
 */
export function normalizeDiffForFingerprint(diffText, scope = 'protected') {
  if (!FINGERPRINT_SCOPES.includes(scope)) {
    throw new Error(`未知の scope です: ${scope}（${FINGERPRINT_SCOPES.join(' / ')} のみ）`);
  }

  const blocks = [];
  let current = null;
  let inHunk = false;

  for (const rawLine of String(diffText ?? '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    if (line.startsWith('diff --git ')) {
      if (current) blocks.push(current);
      const paths = parseDiffGitPaths(line);
      current = {
        // path を取り出せない block は「保護対象かどうか判定できない」ので
        // 保護対象扱いにし、指紋が変わる側へ倒す。
        oldPath: paths ? paths.oldPath : line,
        newPath: paths ? paths.newPath : line,
        unparseable: !paths,
        changes: [],
      };
      inHunk = false;
      continue;
    }

    if (!current) continue;

    if (line.startsWith('@@')) {
      // hunk header は行番号を含むため落とす（追従で動く）。
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      // file header 領域。`index <sha>..<sha>` は blob sha なので落とす。
      // `--- a/x` / `+++ b/x` は path 表示の重複なので落とす（この領域では
      // 変更行と曖昧にならない）。mode / rename / similarity 行は残す。
      if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;
      if (line === '') continue;
      current.changes.push(line);
      continue;
    }

    // hunk 内。context 行は**残す**（行の位置を指紋に効かせるため。上の docblock 参照）。
    // 空行だけは落とす — unified diff の空 context 行は本来 `' '` 1 文字だが、
    // 経路によっては末尾空白が除かれて `''` になる。生成側（`gh pr diff`）と gate 側で
    // 表現が割れると指紋が一致しなくなるため、表現差の出る空行は材料から外す。
    if (line === '') continue;
    current.changes.push(line);
  }

  if (current) blocks.push(current);

  const selected = blocks.filter((block) => {
    if (scope === 'all') return true;
    if (block.unparseable) return true;
    return isProtectedPath(block.oldPath) || isProtectedPath(block.newPath);
  });

  return selected
    .map((block) => `${block.oldPath}\t${block.newPath}\n${block.changes.join('\n')}`)
    .sort()
    .join('\n\n');
}

/**
 * 正規化済み diff から指紋を作る（git を呼ばない pure な入口。test 用）。
 *
 * @param {string} diffText
 * @param {'protected' | 'all'} scope
 * @returns {string} 16 桁 hex
 */
export function fingerprintFromDiff(diffText, scope = 'protected') {
  const normalized = normalizeDiffForFingerprint(diffText, scope);
  return createHash('sha256')
    .update(`${scope}\n${normalized}`)
    .digest('hex')
    .slice(0, FINGERPRINT_HEX_LENGTH);
}

/**
 * `git diff <baseRef>...<headRef>` を実測して指紋を返す。
 *
 * @param {object} [options]
 * @param {string} [options.baseRef] 既定 `origin/main`
 * @param {string} [options.headRef] 既定 `HEAD`
 * @param {'protected' | 'all'} [options.scope] 既定 `protected`
 * @param {string} [options.cwd]
 * @returns {string} 16 桁 hex
 */
export function computeReviewFingerprint({
  baseRef = 'origin/main',
  headRef = 'HEAD',
  scope = 'protected',
  cwd = process.cwd(),
} = {}) {
  const diff = execFileSync(
    'git',
    ['diff', '--no-color', '--no-ext-diff', '--find-renames', `${baseRef}...${headRef}`],
    { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return fingerprintFromDiff(diff, scope);
}

// --- CLI -------------------------------------------------------------
//
// `scripts/tasks/finish-branch.sh`（bash）と `scripts/tasks/review-request.mjs`
// から呼ぶ。stdout は指紋 1 行のみ。失敗時は stderr へ理由を出して exit 1 にし、
// 呼び出し側（bash）が「空文字 = 判定不能 = fail closed」で扱えるようにする。
//
//   gh pr diff 123 | node scripts/lib/review-fingerprint.mjs --stdin --scope protected
//   node scripts/lib/review-fingerprint.mjs --base origin/main --head HEAD
//
// **gate は `--stdin` 経路を使う。** `finish-branch.sh` は main checkout に常駐する
// ため、ローカルの `HEAD` は対象 PR の head ではない。PR の diff（API 由来 =
// merge-base 基準）を渡す経路だけが、gate と marker 生成で同じ材料を見ることを
// 保証する。git 経路はローカル検証と test 用。

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

if (isDirectExecution(import.meta.url)) {
  const args = process.argv.slice(2);
  const readOption = (name, fallback) => {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} には値が必要です`);
    }
    return value;
  };

  try {
    const scope = readOption('--scope', 'protected');
    if (args.includes('--stdin')) {
      const diff = await readStdin();
      // 空 diff を静かに指紋化しない。取得失敗（gh の認証切れ・ネットワーク）と
      // 「本当に差分ゼロ」を区別できず、前者を「常に同じ指紋 = 旧レビューが常に
      // 有効」へ倒してしまう。呼び出し側が fail closed できるよう exit 1 にする。
      if (!diff.trim()) {
        throw new Error('stdin の diff が空です（取得失敗と差分ゼロを区別できないため停止します）');
      }
      process.stdout.write(`${fingerprintFromDiff(diff, scope)}\n`);
    } else {
      process.stdout.write(
        `${computeReviewFingerprint({
          baseRef: readOption('--base', 'origin/main'),
          headRef: readOption('--head', 'HEAD'),
          scope,
        })}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`review-fingerprint の計算に失敗しました: ${error.message}\n`);
    process.exit(1);
  }
}
