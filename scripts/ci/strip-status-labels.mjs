import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * close 済み issue に残留する `status:*` ラベルを剥がす（#2440）。
 *
 * 背景: `status:*` は「着手可否」を表す状態ラベル（`docs/operations/github-labels.md`）
 * だが、close 時に自動で剥がれる配線が無かったため 487 件が closed 側に残留し
 * （2026-08-27 実測）、状態ラベルの意味と矛盾していた。close イベントで
 * `status:*` prefix のラベルだけを機械的に剥がす。
 *
 * **`judgment:diverged` は対象外**（.claude/rules/orchestration.md §判断ジャーナル）。
 * 判断ジャーナルは close 済み issue にラベルを残したまま月次で sweep する設計の
 * ため、誤って剥がすとジャーナルの母集団が消える不可逆に近い事故になる。
 * `selectStatusLabelsToStrip` は `status:` prefix への完全一致だけで判定する
 * ため、`judgment:` prefix は構造的に一致しない（denylist ではなく allowlist
 * 方式にしているのはこのため）。
 *
 * 設計原則は night-watch / codex-input.mjs と同型: 動的な値は execFile の argv
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
        let done = 0;
        for (const issueNumber of scoped) {
          const stripped = stripStatusLabelsForIssue(issueNumber);
          done += 1;
          console.log(
            `[${done}/${scoped.length}] #${issueNumber}: ${
              stripped.length > 0 ? stripped.join(', ') : '対象なし'
            }`,
          );
        }
        console.log(`完了: ${done} 件処理しました。`);
      }
    } else {
      console.error(
        'Usage: node scripts/ci/strip-status-labels.mjs <on-close <issue番号> | bulk [--execute] [--resume-from <issue番号>]>',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'strip-status-labels failed');
    process.exitCode = 1;
  }
}
