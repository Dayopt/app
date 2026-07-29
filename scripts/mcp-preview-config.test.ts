import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const configPath = resolve(import.meta.dirname, '../supabase/config.toml');
const previewProjectRef = 'yvimluegqlcppejgribx';
const previewOrigin = 'https://product-git-codex-mcp-plan-track-learn-dayopt.vercel.app';

function readSection(name: string): string {
  const config = readFileSync(configPath, 'utf8');
  const marker = `[${name}]`;
  const start = config.indexOf(marker);

  if (start === -1) {
    throw new Error(`${marker} が config.toml に宣言されていません`);
  }

  const rest = config.slice(start + marker.length);
  const nextSectionOffset = rest.search(/^\[/m);
  const block =
    nextSectionOffset === -1
      ? config.slice(start)
      : config.slice(start, start + marker.length + nextSectionOffset);

  return block
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

describe('PR #1760 Supabase Preview設定', () => {
  it('一時Preview Branchのproject refへ固定する', () => {
    const block = readSection('remotes.mcp_pr_1760');
    expect(block).toContain(`project_id = "${previewProjectRef}"`);
  });

  it('今後のseedを無効にする', () => {
    const block = readSection('remotes.mcp_pr_1760.db.seed');
    expect(block).toMatch(/enabled\s*=\s*false/);
    expect(block).toMatch(/sql_paths\s*=\s*\[\]/);
  });

  it('public signupをemailを含めて無効にする', () => {
    const authBlock = readSection('remotes.mcp_pr_1760.auth');
    const emailBlock = readSection('remotes.mcp_pr_1760.auth.email');

    expect(authBlock).toContain(`site_url = "${previewOrigin}"`);
    expect(authBlock).toContain(`"${previewOrigin}"`);
    expect(authBlock).toMatch(/enable_signup\s*=\s*false/);
    expect(emailBlock).toMatch(/enable_signup\s*=\s*false/);
  });
});
