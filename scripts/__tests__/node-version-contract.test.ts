import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type PackageContract = {
  engines?: { node?: string };
  devDependencies?: { '@types/node'?: string };
};

const repoRoot = process.cwd();

function readPackageContract(path: string): PackageContract {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as PackageContract;
}

describe('Node.js version contract', () => {
  const runtimeMajor = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim();

  it('aligns deploy-root engines with .nvmrc', () => {
    for (const path of ['package.json', 'apps/web/package.json']) {
      expect(readPackageContract(path).engines?.node, path).toBe(`${runtimeMajor}.x`);
    }
  });

  it('aligns Node.js type definitions with the runtime major', () => {
    for (const path of ['package.json', 'apps/product/package.json', 'apps/web/package.json']) {
      expect(readPackageContract(path).devDependencies?.['@types/node'], path).toMatch(
        new RegExp(`^\\^${runtimeMajor}\\.`),
      );
    }
  });

  it('uses .nvmrc as the GitHub Actions source', () => {
    const setupAction = readFileSync(resolve(repoRoot, '.github/actions/setup/action.yml'), 'utf8');

    expect(setupAction).toContain("default: '.nvmrc'");
    expect(setupAction).toContain('node-version-file: ${{ inputs.node-version-file }}');

    // #2483（CI ファイル統合 Phase 1）: docs-guard.yml / integration.yml は
    // 削除され、setup action を使う workflow は 4 本（ci.yml / nightly.yml /
    // promote.yml / production-config-audit.yml）になった。対象は
    // `.github/actions/setup/action.yml` を使う workflow 全件（`grep -l
    // "setup/action" .github/workflows/*.yml` で実測確認）。
    for (const path of [
      '.github/workflows/ci.yml',
      '.github/workflows/nightly.yml',
      '.github/workflows/promote.yml',
      '.github/workflows/production-config-audit.yml',
    ]) {
      const workflow = readFileSync(resolve(repoRoot, path), 'utf8');
      expect(workflow, path).not.toContain('NODE_VERSION');
    }
  });
});
