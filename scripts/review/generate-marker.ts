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
 */

import { execFileSync } from 'node:child_process';

import { buildMarkerBody } from './generate-marker-core.ts';

interface Args {
  prNumber: number;
  agent: string;
  p1Count: number;
  p1Note?: string;
  p2Count: number;
  p2Note?: string;
  p3?: string;
  repo?: string;
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
  if (!agent) {
    throw new Error('--agent は必須です（実行した subagent 名、または docs-only）。');
  }

  const p1Count = Number(flags.get('p1') ?? '0');
  const p2Count = Number(flags.get('p2') ?? '0');

  return {
    prNumber: Number(prNumberRaw),
    agent,
    p1Count,
    p1Note: flags.get('p1-note'),
    p2Count,
    p2Note: flags.get('p2-note'),
    p3: flags.get('p3'),
    repo: flags.get('repo'),
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const headSha = fetchHeadSha(args.prNumber, args.repo);

  const body = buildMarkerBody({
    headSha,
    agent: args.agent,
    p1Count: args.p1Count,
    p1Note: args.p1Note,
    p2Count: args.p2Count,
    p2Note: args.p2Note,
    p3: args.p3,
  });

  process.stdout.write(`${body}\n`);
}

main();
