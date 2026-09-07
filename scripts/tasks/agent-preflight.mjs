import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function collectPreflight(cwd = process.cwd()) {
  const root = git(['rev-parse', '--show-toplevel'], cwd);
  if (!root) throw new Error('Git worktree を確認できません');
  const hooksPath = git(['config', '--get', 'core.hooksPath'], root);
  const hooksRoot = hooksPath ? resolve(root, hooksPath) : null;
  const hooks = Object.fromEntries(
    ['pre-commit', 'pre-push'].map((name) => [
      name,
      Boolean(
        hooksRoot && existsSync(join(hooksRoot, name)) && existsSync(join(root, '.husky', name)),
      ),
    ]),
  );
  const cli = Object.fromEntries(
    ['gh', 'codex', 'op', 'supabase', 'gitleaks', 'vercel'].map((name) => {
      try {
        execFileSync('which', [name], { stdio: 'ignore' });
        return [name, true];
      } catch {
        return [name, false];
      }
    }),
  );
  const skills = existsSync(join(root, '.agents/skills/routing/SKILL.md'));
  return {
    cwd,
    root,
    branch: git(['branch', '--show-current'], root) || 'detached',
    changes: git(['status', '--short'], root),
    node: process.version,
    expectedNode: readFileSync(join(root, '.nvmrc'), 'utf8').trim(),
    dependencies: existsSync(join(root, 'node_modules/.pnpm')),
    hooksPath,
    hooks,
    cli,
    skills,
    // Presence is not proof of runtime activation or trust.
    codexHooks: existsSync(join(root, '.codex/hooks.json'))
      ? 'configured; runtime activation unverified'
      : 'missing',
  };
}

export function renderPreflight(state) {
  const lines = [
    '## Project State',
    `**Root**: ${state.root}`,
    `**Cwd**: ${state.cwd}`,
    `**Branch**: ${state.branch}`,
    `**Changes**: ${state.changes === null ? '未取得' : state.changes || 'clean'}`,
    '### Environment',
    `**node**: ${state.node} (.nvmrc: ${state.expectedNode}) | **deps**: ${state.dependencies ? 'ok' : 'missing (pnpm install --frozen-lockfile)'}`,
    `**cli**: ${Object.entries(state.cli)
      .map(([name, present]) => `${name}:${present ? 'yes' : 'no'}`)
      .join(' ')}`,
    `**Git hooks**: ${Object.entries(state.hooks)
      .map(([name, active]) => `${name}:${active ? 'configured' : 'missing'}`)
      .join(' ')} (${state.hooksPath ?? '未設定'})`,
    `**Shared skills**: ${state.skills ? 'present; session discovery unverified' : 'missing'}`,
    `**Codex hooks**: ${state.codexHooks}`,
  ];
  if (!state.cli.gh)
    lines.push(
      '- gh なし: ctx / trace / branch:finish の GitHub 情報は未取得。利用可能な接続で確認する',
    );
  if (!state.dependencies || Object.values(state.hooks).some((ready) => !ready)) {
    lines.push('- commit / push 前に依存と Git hooks を準備してください');
  }
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--json'))
      throw new Error('Usage: pnpm agent:preflight [--json]');
    const state = collectPreflight();
    console.log(args.includes('--json') ? JSON.stringify(state, null, 2) : renderPreflight(state));
    if (!state.dependencies || Object.values(state.hooks).some((ready) => !ready) || !state.skills)
      process.exitCode = 1;
  } catch (error) {
    console.error(`未取得: ${error.message}`);
    process.exitCode = 1;
  }
}
