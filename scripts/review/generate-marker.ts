#!/usr/bin/env node
/**
 * `[internal-review]` marker 生成スクリプト（#2230）
 *
 * head SHA の手書き補完（短縮 SHA からの捏造、2026-08-14 実事故）と、
 * zerolike 書式の崩れ（注釈付き `P1: なし（…）` が gate を誤通過させた
 * PR #2053 の実事故）を、生成の機械化で構造的に防ぐ。
 *
 * head SHA は本スクリプトが `gh pr view --json headRefOid` で実測する。
 * **SHA を引数で渡す口は意図的に用意しない**（手入力・捏造の経路を残さないため）。
 *
 * 出力は stdout のみ。投稿（`gh pr comment` 等）は行わない — 目視確認してから
 * 投稿する 1 拍を残すのが `.claude/skills/pr-cross-review/SKILL.md` 手順 6 の意図。
 *
 * Usage:
 *   pnpm review:marker <PR番号> --agent "risk-reviewer, behavior-verifier" \
 *     --p1 0 --p2 2 --p2-note "review comment 参照" [--p3 "型安全性の軽微な改善余地"]
 *
 *   pnpm review:marker <PR番号> --agent docs-only --p1 0 --p2 0
 *
 * reviewer を実際に起動した場合（docs-only 以外）は `--agent` の代わりに
 * `--review-result <path>` を使う。path は Workflow が返した
 * `{role, status, result}[]` をそのまま書き出した JSON ファイル（#2348）。
 * `ok`/`text-fallback` 以外の status が 1 件でもあれば marker を生成せず失敗する
 * （1 role が結果を返していないのに Main が `--agent` へ手で書いて gate を
 * 通す、という抜け道を無くすため。`--agent` との併用は不可）:
 *
 *   pnpm review:marker <PR番号> --review-result /path/to/result.json \
 *     --p1 0 --p2 2 --p2-note "review comment 参照"
 *
 * `--review-result` の各エントリの `result.coverage` が `partial`（budget 逼迫で
 * 一部の観点を打ち切った自己申告、#2417）な role が 1 件でもある場合、
 * `--partial-coverage-note` が無いと marker 生成そのものを拒否する（早期切り上げの
 * 浅いレビューが `status: 'ok'` のまま黙って gate を通過する fail-open を防ぐ）:
 *
 *   pnpm review:marker <PR番号> --review-result /path/to/result.json \
 *     --p1 0 --p2 0 --partial-coverage-note "risk-reviewer の partial 分は diff 該当箇所を Main が目視確認済み"
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  assertAgentFieldHasNoKnownReviewerRole,
  buildMarkerBody,
  deriveAgentFieldFromReviewResult,
  derivePartialCoverageRoles,
  type ReviewResultEntry,
} from './generate-marker-core.ts';

interface Args {
  prNumber: number;
  agent?: string;
  reviewResultPath?: string;
  p1Count: number;
  p1Note?: string;
  p2Count: number;
  p2Note?: string;
  p3?: string;
  repo?: string;
  partialCoverageNote?: string;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const prNumberRaw = positional[0];
  if (!prNumberRaw || !/^\d+$/.test(prNumberRaw)) {
    throw new Error(
      'PR 番号を第一引数で指定してください（例: pnpm review:marker 2230 --agent ...）。',
    );
  }

  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--${key} には値が必要です。`);
      }
      flags.set(key, value);
      i += 1;
    }
  }

  // 'sha' / 'head' 系フラグは意図的にサポートしない（実測 SHA のみを使う契約）。
  if (flags.has('sha') || flags.has('head')) {
    throw new Error(
      'head SHA は引数で受け付けません。`gh pr view` で実測した値のみを使います（SHA 捏造の再発防止）。',
    );
  }

  const agent = flags.get('agent');
  const reviewResultPath = flags.get('review-result');

  if (agent && reviewResultPath) {
    throw new Error(
      '--agent と --review-result は併用できません。どちらか一方を指定してください。',
    );
  }
  if (!agent && !reviewResultPath) {
    throw new Error(
      '--agent または --review-result のいずれかが必須です（実行した subagent 名 / docs-only、' +
        'または reviewer を起動した場合は Workflow の結果 JSON へのパス）。',
    );
  }
  if (agent) {
    assertAgentFieldHasNoKnownReviewerRole(agent);
  }

  const p1Count = Number(flags.get('p1') ?? '0');
  const p2Count = Number(flags.get('p2') ?? '0');

  return {
    prNumber: Number(prNumberRaw),
    agent,
    reviewResultPath,
    p1Count,
    p1Note: flags.get('p1-note'),
    p2Count,
    p2Note: flags.get('p2-note'),
    p3: flags.get('p3'),
    repo: flags.get('repo'),
    partialCoverageNote: flags.get('partial-coverage-note'),
  };
}

function fetchHeadSha(prNumber: number, repo: string | undefined): string {
  const args = ['pr', 'view', String(prNumber), '--json', 'headRefOid', '--jq', '.headRefOid'];
  if (repo) {
    args.push('--repo', repo);
  }
  const sha = execFileSync('gh', args, { encoding: 'utf8' }).trim();
  if (!sha) {
    throw new Error(
      `PR #${prNumber} の headRefOid を取得できませんでした（gh の認証を確認してください）。`,
    );
  }
  return sha;
}

/**
 * `--review-result` の JSON を読む。ファイルは Workflow が返した
 * `{role, status, result}[]` をそのまま書き出したもの。
 */
function readReviewResultEntries(path: string): ReviewResultEntry[] {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`--review-result のファイルを読めませんでした: ${path}（${String(err)}）`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--review-result のファイルが JSON として不正です: ${path}（${String(err)}）`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`--review-result の JSON は配列である必要があります: ${path}`);
  }

  return parsed as ReviewResultEntry[];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const headSha = fetchHeadSha(args.prNumber, args.repo);

  const entries = args.reviewResultPath ? readReviewResultEntries(args.reviewResultPath) : null;
  const agent = entries ? deriveAgentFieldFromReviewResult(entries) : (args.agent as string);
  const partialCoverageRoles = entries ? derivePartialCoverageRoles(entries) : [];

  const body = buildMarkerBody({
    headSha,
    agent,
    p1Count: args.p1Count,
    p1Note: args.p1Note,
    p2Count: args.p2Count,
    p2Note: args.p2Note,
    p3: args.p3,
    partialCoverageRoles,
    partialCoverageNote: args.partialCoverageNote,
  });

  process.stdout.write(`${body}\n`);
}

main();
