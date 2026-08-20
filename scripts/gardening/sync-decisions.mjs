#!/usr/bin/env node
// docs/decisions.md（append-only 決定ログ）を `judgment:diverged` ラベルの現状から
// 再同期する。
//
//   node scripts/gardening/sync-decisions.mjs [--dry-run] [--repo <owner/repo>]
//
// 月次 gardening の「判断ジャーナル集計」ステップで、`judgment:diverged` ラベルを
// 解除する**前に**実行する（.claude/skills/gardening/SKILL.md 自動パート 手順2）。
// ラベル解除後に実行すると、その月に解決済みになった分岐が
// `gh search issues --label judgment:diverged` の対象から外れ、append-only の
// 唯一の全履歴（docs/decisions.md）に永久に載らなくなる。
//
// 正本は GitHub issue + open PR のまま。docs/decisions.md は「生成された履歴」
// であり、第二の正本ではない（旧 STATE.md §5 と同じ位置づけ。
// docs/engineering/log/2026-08-01-issue-state-labels-epics.md の教訓）。
//
// 既存行の削除・変更は `pnpm docs:check`（decisions-append-only ガード）が
// 機械的に拒否するため、この script は新規行の追記のみ行う。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO = 'Dayopt/dayopt';

const DECISIONS_PATH = fileURLToPath(new URL('../../docs/decisions.md', import.meta.url));

/**
 * 制御文字を取り除く。`\x` エスケープや埋め込みリテラルではなく charCode 比較で
 * 判定する（ソース中に生の制御バイトを置かない）。
 */
function stripControlChars(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

/**
 * markdown list item として安全な 1 行文字列へ正規化する。
 * 対象は GitHub の issue/PR title（誰でも書ける観測コンテンツ）なので、
 * この script 自身の構文を壊せないようにする。
 */
export function sanitizeCell(raw, maxLength = 70) {
  const text = String(raw ?? '');
  let cleaned = text
    .replace(/\r\n?|\n/g, ' ') // 改行 → list を壊すので潰す
    .replace(/\|/g, '｜') // markdown table と衝突する pipe を全角へ退避
    .replace(/<!--/g, '‹!--') // マーカー構文の偽装を無害化
    .replace(/-->/g, '--›');
  cleaned = stripControlChars(cleaned).trim();
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength - 1)}…`;
  }
  return cleaned || '(no title)';
}

/**
 * docs/decisions.md を append-only でマージする。既存行は一切変更・削除しない
 * （`judgment:diverged` ラベルは月次 gardening で解決後に外れるため、
 * ラベル解除より前にこの script を実行する運用で全履歴を担保する）。
 */
export function mergeDecisionsMd(existingContent, decisionEntries) {
  const header =
    '# 決定ログ（append-only）\n\n判断が分かれた記録の全履歴。日次盤面 issue §5 はここへのリンクのみを持つ（旧 STATE.md §5 の直近 5 件表示は廃止）。手で行を消さない（`judgment:diverged` ラベルが gardening で外れても、ここの行は残す）。既存行の削除・変更は `pnpm docs:check`（decisions-append-only ガード）が機械的に拒否する。\n\n';
  const body = existingContent && existingContent.trim() ? existingContent : header;
  const existingNumbers = new Set([...body.matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1])));
  const toAppend = decisionEntries
    .filter((entry) => !existingNumbers.has(entry.number))
    .sort((a, b) => String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? '')));
  if (!toAppend.length) {
    return body.endsWith('\n') ? body : `${body}\n`;
  }
  const newLines = toAppend.map((entry) => {
    const date = String(entry.updatedAt ?? '').slice(0, 10) || 'unknown';
    return `- ${date}: ${sanitizeCell(entry.title, 90)} (#${entry.number}) ${entry.url}`;
  });
  const trimmedBody = body.endsWith('\n') ? body : `${body}\n`;
  return `${trimmedBody}${newLines.join('\n')}\n`;
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function fetchDecisionEntries(repo = DEFAULT_REPO) {
  return JSON.parse(
    gh([
      'search',
      'issues',
      '--repo',
      repo,
      '--label',
      'judgment:diverged',
      '--include-prs',
      '--limit',
      '200',
      '--json',
      'number,title,url,updatedAt,state',
    ]),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : DEFAULT_REPO;

  const decisionEntries = fetchDecisionEntries(repo);
  const existingDecisions = existsSync(DECISIONS_PATH) ? readFileSync(DECISIONS_PATH, 'utf8') : '';
  const newDecisions = mergeDecisionsMd(existingDecisions, decisionEntries);

  if (dryRun) {
    console.log('=== docs/decisions.md (dry-run) ===\n' + newDecisions);
    return;
  }

  writeFileSync(DECISIONS_PATH, newDecisions);
  console.log('docs/decisions.md を再同期しました。');
  console.log('git add docs/decisions.md してコミットに含めてください。');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(`❌ docs/decisions.md の再同期に失敗しました: ${err.message}`);
    process.exit(1);
  });
}
