#!/usr/bin/env node

/**
 * heavy-red / integration-red の単体観測を 1 コマンドで完結させる wrapper（#2483）。
 *
 * `checkWorkflowJobRun`（run-all.mjs）は nightly.yml 内の job 名で red/green を
 * 判定する多段処理（`gh run list` → run ごとに `gh api .../jobs`）のため、
 * 「単一の単純コマンド」しか許可しない層3 guard（`scripts/hooks/pre-tool-guard-impl.sh`
 * の `DAYOPT_NIGHT_WATCH=1` allowlist）ではパイプラインを直接許可できない。
 * 他の Step（alert-issue.mjs）と同じ「個別 wrapper を 1 本の固定コマンドとして
 * allowlist する」設計に合わせ、この wrapper 自体を allowlist 対象にする
 * （board-issue.mjs / dod-candidate.mjs / run-log.mjs は同じ設計だった旧
 * wrapper だが #2525 で廃止済み）。
 *
 * 使い方（手動代行時、`.claude/skills/night-watch/SKILL.md` §手動代行 Step 2）:
 *   node scripts/ci/night-watch/check-workflow-job.mjs heavy-red
 *   node scripts/ci/night-watch/check-workflow-job.mjs integration-red
 *
 * 自動パート（GitHub Actions cron、`run-all.mjs` の直接実行）はこの wrapper を
 * 経由しない（`runNightWatch` から `checkWorkflowJobRun` を直接呼ぶ）。
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  checkWorkflowJobRun,
  NIGHTLY_HEAVY_JOB_NAMES,
  NIGHTLY_INTEGRATION_JOB_NAME,
} from './run-all.mjs';

const CHECK_JOB_NAMES = {
  'heavy-red': NIGHTLY_HEAVY_JOB_NAMES,
  'integration-red': [NIGHTLY_INTEGRATION_JOB_NAME],
};

/**
 * @param {string} checkId
 * @param {{ execFileImpl?: Parameters<typeof checkWorkflowJobRun>[1]['execFileImpl'] }} [opts]
 *   test 用の DI（実 gh を呼ばずに写像だけを検証する。scripts/ci/night-watch/*.mjs の
 *   他 wrapper と同じ規約）。CLI 実行時は渡さず、既定（execFileSync）を使う。
 */
export function runCheckWorkflowJob(checkId, { execFileImpl } = {}) {
  const jobNames = CHECK_JOB_NAMES[checkId];
  if (!jobNames) {
    throw new Error(`未知の checkId です: ${checkId}（heavy-red | integration-red のみ対応）`);
  }
  return checkWorkflowJobRun(jobNames, { execFileImpl });
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  const checkId = process.argv[2];
  try {
    const outcome = runCheckWorkflowJob(checkId);
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status === 'fetch-failed') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
