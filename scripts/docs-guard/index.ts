#!/usr/bin/env node
/**
 * docs-guard（orchestrator）
 *
 * docs/ の機械的ガードを4 checker で実行する。
 *  - link-check          : 相対リンク切れ
 *  - frontmatter-check   : ストック対象への status / last_verified 必須
 *  - naming-check        : kebab-case 命名規約
 *  - append-only-guard   : decisions/notes/journal/sessions の書き換え禁止
 *
 * Usage:
 *   tsx scripts/docs-guard/index.ts
 *
 * ローカルでは `pnpm docs:check` からも同じスクリプトが実行される。
 */

import { reportAppendOnlyGuard, runAppendOnlyGuard } from './checks/append-only-guard.ts';
import { reportFrontmatterCheck, runFrontmatterCheck } from './checks/frontmatter-check.ts';
import { reportLinkCheck, runLinkCheck } from './checks/link-check.ts';
import { reportNamingCheck, runNamingCheck } from './checks/naming-check.ts';
import { colors } from './config.ts';

async function main(): Promise<void> {
  console.log(`${colors.cyan}docs-guard${colors.reset}`);
  console.log('===========\n');

  const linkViolations = await runLinkCheck();
  const linkOk = reportLinkCheck(linkViolations);

  const frontmatterViolations = await runFrontmatterCheck();
  const frontmatterOk = reportFrontmatterCheck(frontmatterViolations);

  const namingViolations = await runNamingCheck();
  const namingOk = reportNamingCheck(namingViolations);

  const appendOnlyViolations = runAppendOnlyGuard();
  const appendOnlyOk = reportAppendOnlyGuard(appendOnlyViolations);

  console.log('\n' + '='.repeat(60));

  const ok = linkOk && frontmatterOk && namingOk && appendOnlyOk;

  if (ok) {
    console.log(`${colors.green}✅ docs-guard: 全チェック pass${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ docs-guard: 違反あり${colors.reset}`);
    process.exit(1);
  }
}

main().catch((error: Error) => {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  process.exit(1);
});
