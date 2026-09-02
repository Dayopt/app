import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * close 済み issue に残留する `status:*` ラベルを剥がす（#2440）。
 *
 * 背景: `status:*` は「着手可否」を表す状態ラベル（`docs/operations/github-labels.md`）
 * だが、close 時に自動で剥がれる配線が無かったため 487 件が closed 側に残留し
 * （2026-08-27 実測）、状態ラベルの意味と矛盾していた。close イベントで
 * `status:*` prefix のラベルだけを機械的に剥がす。
 *
 * **`judgment:diverged` は対象外**（`dispatch` skill（旧 orchestration.md、#2479 で再編） §判断ジャーナル）。
 * 判断ジャーナルは close 済み issue にラベルを残したまま月次で sweep する設計の
 * ため、誤って剥がすとジャーナルの母集団が消える不可逆に近い事故になる。
 * `selectStatusLabelsToStrip` は `status:` prefix への完全一致だけで判定する
 * ため、`judgment:` prefix は構造的に一致しない（denylist ではなく allowlist
 * 方式にしているのはこのため）。
 *
 * 設計原則は scripts/lib/gh.mjs / codex-input.mjs と同型: 動的な値は execFile の argv
 * 要素としてのみ渡し、shell を経由しない。REPO / GH_MAX_BUFFER_BYTES は layering
 * を濁らせないため同型のまま複製する（codex-input.mjs 冒頭コメント参照）。
 */

const REPO = 'Dayopt/dayopt';
const GH_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/** @param {string[]} args @param {{ execFileImpl?: ExecFileImpl }} [opts] */
export function runGh(args, { execFileImpl = execFileSync } = {}) {
  return execFileImpl('gh', args, { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES });
}

/** @param {string[]} args @param {{ execFileImpl?: ExecFileImpl }} [opts] */
export function runGhJson(args, opts = {}) {
  return JSON.parse(runGh(args, opts));
}

/**
 * `docs/operations/github-labels.md`（2026-08-27 時点）の既知 `status:*` 一覧。
 * bulk 検索（`collectBulkTargets`）の起点としてのみ使う。close イベント側の
 * 剥がし判定（`selectStatusLabelsToStrip`）は prefix 一致のためこの一覧には
 * 依存しない — 将来ラベルが増えても close イベント側は自動で追従する。
 */
export const KNOWN_STATUS_LABELS = [
  'status:ready',
  'status:in-progress',
  'status:review',
  'status:blocked',
  'status:watching',
];

/**
 * 剥がし対象のラベル名を選ぶ。`status:` prefix への完全一致のみを対象にする
 * （allowlist 方式）。`judgment:diverged` 等の他 prefix には構造的に一致しない。
 * @param {string[] | undefined} labelNames
 * @returns {string[]}
 */
export function selectStatusLabelsToStrip(labelNames) {
  return (labelNames ?? []).filter(
    (name) => typeof name === 'string' && name.startsWith('status:'),
  );
}

/**
 * 1 件の issue から `status:*` ラベルを剥がす。剥がした（または対象が無かった）
 * ラベル名の配列を返す。
 * @param {number} issueNumber
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function stripStatusLabelsForIssue(issueNumber, { execFileImpl } = {}) {
  const issue = runGhJson(
    ['issue', 'view', String(issueNumber), '--repo', REPO, '--json', 'labels'],
    { execFileImpl },
  );
  const labelNames = (issue.labels ?? []).map((label) => label.name);
  const toStrip = selectStatusLabelsToStrip(labelNames);
  for (const label of toStrip) {
    runGh(['issue', 'edit', String(issueNumber), '--repo', REPO, '--remove-label', label], {
      execFileImpl,
    });
  }
  return toStrip;
}

/**
 * 指定した status ラベルを持つ closed issue の番号一覧を取得する。
 * @param {string} label
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 * @returns {number[]}
 */
// 2026-08-27実測（#2440）の単一ラベル最大値は status:ready の 260 件。
// 将来の増加余地を見て一段大きい値にしておく（`gh issue list` の --limit は
// 明示しないと既定 30 件に絞られ、無音で取りこぼす）。
const BULK_SEARCH_LIMIT = 2000;

export function findClosedIssuesWithStatusLabel(label, { execFileImpl } = {}) {
  const result = runGhJson(
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'closed',
      '--label',
      label,
      '--json',
      'number',
      '--limit',
      String(BULK_SEARCH_LIMIT),
    ],
    { execFileImpl },
  );
  return result.map((entry) => entry.number);
}

/**
 * `KNOWN_STATUS_LABELS` の各ラベルについて closed issue を検索し、重複除去
 * して昇順に並べた対象番号一覧を返す（bulk 清掃の対象決定）。
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 * @returns {number[]}
 */
export function collectBulkTargets({ execFileImpl } = {}) {
  const numbers = new Set();
  for (const label of KNOWN_STATUS_LABELS) {
    for (const number of findClosedIssuesWithStatusLabel(label, { execFileImpl })) {
      numbers.add(number);
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

/**
 * bulk 実行の既定の時間予算（秒）。`nightly.yml` の `timeout-minutes: 10` に対して
 * 2 分の余白を残す。余白が要るのは、予算は「次の 1 件を始めてよいか」の判定にしか
 * 使えないため — 予算ちょうどにすると最後の 1 件の処理中に job timeout の SIGKILL が
 * 来て、打ち切り報告そのものが出力されずに終わる（#2506 が塞ぐ元の症状と同じ）。
 */
export const DEFAULT_BULK_BUDGET_SECONDS = 480;

/**
 * 対象 issue を時間予算内で順に処理する。予算を使い切ったら**次の 1 件を始めずに**
 * 打ち切り、どこまで進んだかを返す。
 *
 * 打ち切りを例外にしないのは、進捗が出ている以上これは失敗ではなく「1 晩で終わら
 * なかった」だけだから（backstop sweep は翌晩に続きを拾える）。ただし黙って終わる
 * と #2506 の元の症状に戻るため、呼び出し側が `remaining > 0` を必ず可視化する。
 *
 * @param {{
 *   targets: number[],
 *   budgetSeconds?: number,
 *   nowImpl?: () => number,
 *   stripImpl?: (issueNumber: number) => string[],
 *   logImpl?: (message: string) => void,
 * }} opts
 * @returns {{ processed: number, remaining: number, lastProcessed: number | undefined }}
 */
export function runBulkStrip({
  targets,
  budgetSeconds = DEFAULT_BULK_BUDGET_SECONDS,
  nowImpl = Date.now,
  stripImpl = stripStatusLabelsForIssue,
  logImpl = console.log,
}) {
  const startedAt = nowImpl();
  const budgetMs = budgetSeconds * 1000;
  let processed = 0;
  /** @type {number | undefined} */
  let lastProcessed;

  for (const issueNumber of targets) {
    if (nowImpl() - startedAt >= budgetMs) break;
    const stripped = stripImpl(issueNumber);
    processed += 1;
    lastProcessed = issueNumber;
    logImpl(
      `[${processed}/${targets.length}] #${issueNumber}: ${
        stripped.length > 0 ? stripped.join(', ') : '対象なし'
      }`,
    );
  }

  return { processed, remaining: targets.length - processed, lastProcessed };
}

/**
 * 打ち切り時の報告を組み立てる。再開コマンドをそのまま貼れる形で含める
 * （`--resume-from` は `n > resumeFrom` の filter なので、最後に処理した番号を
 * そのまま渡せば続きから再開する）。
 * @param {{ processed: number, remaining: number, lastProcessed: number | undefined }} result
 * @returns {string}
 */
export function formatBulkInterruption({ processed, remaining, lastProcessed }) {
  const resumeCommand =
    lastProcessed === undefined
      ? 'node scripts/ci/strip-status-labels.mjs bulk --execute'
      : `node scripts/ci/strip-status-labels.mjs bulk --execute --resume-from ${lastProcessed}`;
  const progress =
    processed === 0
      ? '時間予算内に 1 件も処理できませんでした（1 件あたりの所要時間が予算を超えている可能性があります）。'
      : `時間予算に達したため ${processed} 件で打ち切りました。`;
  return `${progress} 残り ${remaining} 件。続きは次回の sweep が拾いますが、今すぐ流し切る場合:\n\n    ${resumeCommand}\n`;
}

if (isDirectExecution(import.meta.url)) {
  const [subcommand, ...rest] = process.argv.slice(2);
  try {
    if (subcommand === 'on-close') {
      const issueNumber = Number(rest[0]);
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        throw new Error(`issue番号が不正です: ${rest[0]}`);
      }
      const stripped = stripStatusLabelsForIssue(issueNumber);
      if (stripped.length === 0) {
        console.log(`#${issueNumber}: status:* ラベルなし（対象なし）`);
      } else {
        console.log(`#${issueNumber}: ${stripped.join(', ')} を剥がしました`);
      }
    } else if (subcommand === 'bulk') {
      const dryRun = !rest.includes('--execute');
      const resumeFromArgIndex = rest.indexOf('--resume-from');
      const resumeFrom = resumeFromArgIndex >= 0 ? Number(rest[resumeFromArgIndex + 1]) : undefined;
      if (resumeFromArgIndex >= 0 && !Number.isInteger(resumeFrom)) {
        throw new Error(`--resume-from の値が不正です: ${rest[resumeFromArgIndex + 1]}`);
      }

      const budgetArgIndex = rest.indexOf('--budget-seconds');
      const budgetSeconds =
        budgetArgIndex >= 0 ? Number(rest[budgetArgIndex + 1]) : DEFAULT_BULK_BUDGET_SECONDS;
      if (budgetArgIndex >= 0 && (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0)) {
        throw new Error(`--budget-seconds の値が不正です: ${rest[budgetArgIndex + 1]}`);
      }

      console.log(`対象を検索中（${KNOWN_STATUS_LABELS.join(', ')} を持つ closed issue）...`);
      const targets = collectBulkTargets();
      const scoped = resumeFrom ? targets.filter((n) => n > resumeFrom) : targets;
      console.log(
        `対象: ${targets.length} 件${resumeFrom ? `（#${resumeFrom} 以前を除いた残り ${scoped.length} 件から再開）` : ''}`,
      );

      if (dryRun) {
        console.log('--dry-run（既定）: 実際の剥がしは行いません。対象番号一覧:');
        console.log(scoped.join(', ') || '（対象なし）');
        console.log(
          `dry-run 結果: ${scoped.length} 件が対象。実行するには --execute を付けてください。`,
        );
      } else {
        const result = runBulkStrip({ targets: scoped, budgetSeconds });
        if (result.remaining === 0) {
          console.log(`完了: ${result.processed} 件処理しました。`);
        } else {
          // 打ち切りは失敗ではない（進捗は出ている）ので exit 0 のままにするが、
          // 黙って終わると #2506 の元の症状に戻る。annotation と Step Summary の
          // 両方へ残件と再開コマンドを出す。
          const report = formatBulkInterruption(result);
          console.log(report);
          console.log(
            `::warning::status ラベル sweep を打ち切りました（残り ${result.remaining} 件）`,
          );
          const summaryPath = process.env.GITHUB_STEP_SUMMARY;
          if (summaryPath) {
            appendFileSync(summaryPath, `## status ラベル batch sweep\n\n${report}\n`);
          }
        }
      }
    } else {
      console.error(
        'Usage: node scripts/ci/strip-status-labels.mjs <on-close <issue番号> | bulk [--execute] [--resume-from <issue番号>] [--budget-seconds <秒>]>',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'strip-status-labels failed');
    process.exitCode = 1;
  }
}
