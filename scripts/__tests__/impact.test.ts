import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- .mjs に型定義は無いが、contract test は実装そのものを読む
import { formatSummary, readWorkspaceGraph, resolveImpact } from '../ci/impact.mjs';

/**
 * Impact Resolver は merge gate / release / CI が共有する影響判定の正本。
 * 判定を誤ると「必要な検証を skip してマージする」方向に倒れるため、
 * 変更ファイル fixture のテーブルで期待値を固定する。
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type Impact = {
  product: boolean;
  web: boolean;
  integration: boolean;
  productJourney: boolean;
  webPreviewSmoke: boolean;
  docsOnly: boolean;
  unknown: string[];
};

/** 期待値を書きやすくする省略形。省略キーは false 扱い。 */
function expectImpact(files: string[], expected: Partial<Impact>) {
  const impact = resolveImpact(files) as Impact;
  const full: Omit<Impact, 'unknown'> = {
    product: false,
    web: false,
    integration: false,
    productJourney: false,
    webPreviewSmoke: false,
    docsOnly: false,
    ...expected,
  };
  expect({
    product: impact.product,
    web: impact.web,
    integration: impact.integration,
    productJourney: impact.productJourney,
    webPreviewSmoke: impact.webPreviewSmoke,
    docsOnly: impact.docsOnly,
  }).toEqual(full);
  return impact;
}

describe('workspace 依存グラフ', () => {
  it('product は全 package、web は domain 以外に依存する（現在の manifest の固定）', () => {
    // このテストが落ちたら manifest が変わったということ。期待値を現実に合わせて
    // 更新すればよい（resolver 側は自動追従している）。
    const graph = readWorkspaceGraph() as Map<string, Set<string>>;
    expect(graph.get('packages/domain')).toEqual(new Set(['product']));
    expect(graph.get('packages/config')).toEqual(new Set(['product', 'web']));
    expect(graph.get('packages/i18n')).toEqual(new Set(['product', 'web']));
    expect(graph.get('packages/components')).toEqual(new Set(['product', 'web']));
  });
});

describe('docs のみの変更', () => {
  it.each([
    [['docs/business/strategy.md']],
    [['AGENTS.md', 'CLAUDE.md', 'README.md']],
    [['.claude/rules/workflow.md', '.codex/rules/README.md', '.agents/skills/dispatch/SKILL.md']],
    [['docs/projects/ci-monorepo-refactor/overview.md', 'docs/README.md']],
  ])('%j は docsOnly=true で app build を要求しない', (files) => {
    expectImpact(files, { docsOnly: true });
  });

  it('rls-snapshot.md は docsOnly でも integration を要求する', () => {
    // integration.yml の paths に含まれる docs ファイル。docsOnly の shortcut で
    // integration まで消してはいけない。
    expectImpact(['docs/engineering/data/db/rls-snapshot.md'], {
      docsOnly: true,
      integration: true,
    });
  });
});

describe('app とその依存', () => {
  it('apps/product のみ → product 側だけ', () => {
    expectImpact(['apps/product/src/components/Button.tsx'], {
      product: true,
      productJourney: true,
    });
  });

  it('apps/product の server 境界 → integration も要求する', () => {
    expectImpact(['apps/product/src/features/tags/server/router.ts'], {
      product: true,
      productJourney: true,
      integration: true,
    });
  });

  it('apps/web のみ → web 側だけ', () => {
    expectImpact(['apps/web/src/app/page.tsx', 'apps/web/content/blog/en/hello.mdx'], {
      web: true,
      webPreviewSmoke: true,
    });
  });

  it('packages/domain → product のみ（web は依存しない）', () => {
    expectImpact(['packages/domain/src/plan.ts'], {
      product: true,
      productJourney: true,
      integration: true, // packages/domain/** は integration.yml の paths に含まれる
    });
  });

  it('共通 package（config）→ 両方', () => {
    expectImpact(['packages/config/src/env.ts'], {
      product: true,
      web: true,
      productJourney: true,
      webPreviewSmoke: true,
    });
  });

  it('supabase/migrations → product + integration', () => {
    expectImpact(['supabase/migrations/20260804000000_add_table.sql'], {
      product: true,
      productJourney: true,
      integration: true,
    });
  });

  it('root の build 入力（pnpm-lock.yaml）→ 両方 + integration', () => {
    expectImpact(['pnpm-lock.yaml'], {
      product: true,
      web: true,
      productJourney: true,
      webPreviewSmoke: true,
      integration: true, // integration.yml の paths に含まれる
    });
  });

  it('docs と product の混在は docsOnly=false', () => {
    expectImpact(['docs/README.md', 'apps/product/src/app/layout.tsx'], {
      product: true,
      productJourney: true,
    });
  });
});

describe('中立 path（app 成果物に影響しない）', () => {
  it.each([
    [['scripts/git/finish-branch.sh', 'scripts/__tests__/finish-branch.test.ts']],
    [['.claude/hooks/pre-tool-guard.sh', '.claude/settings.json']],
    [['.github/workflows/ci.yml']],
    [['.husky/pre-push', '.vscode/settings.json']],
    [['apps/storybook/.storybook/main.ts']],
    [['eslint.config.mjs', '.prettierrc', 'vitest.scripts.config.ts']],
  ])('%j は app build を要求しない', (files) => {
    expectImpact(files, {});
  });

  it('.github の integration 対象（setup action）は integration を要求する', () => {
    expectImpact(['.github/actions/setup/action.yml'], { integration: true });
  });
});

describe('fail closed', () => {
  it('未知の root ファイルは全 affected に倒す', () => {
    const impact = expectImpact(['mystery.config.xyz'], {
      product: true,
      web: true,
      integration: true,
      productJourney: true,
      webPreviewSmoke: true,
    });
    expect(impact.unknown).toEqual(['mystery.config.xyz']);
  });

  it('未知の packages ディレクトリも全 affected に倒す', () => {
    // manifest の無い package（作りかけ・rename 直後）を「影響なし」と
    // 誤判定しないこと。
    expectImpact(['packages/brand-new/src/index.ts'], {
      product: true,
      web: true,
      integration: true,
      productJourney: true,
      webPreviewSmoke: true,
    });
  });

  it('docs と未知の混在を docsOnly と誤判定しない', () => {
    expectImpact(['docs/README.md', 'mystery.config.xyz'], {
      product: true,
      web: true,
      integration: true,
      productJourney: true,
      webPreviewSmoke: true,
    });
  });

  it('空の変更一覧は判定不能として全 affected に倒す', () => {
    // 「影響なし」と「ファイル一覧を取得できなかった」を区別できないため、
    // 空入力を green に流さない。
    expectImpact([], {
      product: true,
      web: true,
      integration: true,
      productJourney: true,
      webPreviewSmoke: true,
    });
  });
});

describe('CLI', () => {
  it('--stdin で newline 区切りの一覧を受け、JSON を返す', () => {
    const result = spawnSync('node', [join(rootDir, 'scripts/ci/impact.mjs'), '--stdin'], {
      input: 'apps/product/src/foo.ts\ndocs/README.md\n',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const impact = JSON.parse(result.stdout) as Impact;
    expect(impact.product).toBe(true);
    expect(impact.web).toBe(false);
    expect(impact.docsOnly).toBe(false);
  });

  it('--summary は Markdown を返し、未知 path の警告を含む', () => {
    const result = spawnSync(
      'node',
      [join(rootDir, 'scripts/ci/impact.mjs'), '--stdin', '--summary'],
      {
        input: 'mystery.config.xyz\n',
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('## Impact Resolver');
    expect(result.stdout).toContain('未知の path');
  });
});

describe('formatSummary', () => {
  it('全キーを表に含める', () => {
    const summary = formatSummary(resolveImpact(['apps/product/src/foo.ts'])) as string;
    for (const key of [
      'product',
      'web',
      'integration',
      'productJourney',
      'webPreviewSmoke',
      'docsOnly',
    ]) {
      expect(summary).toContain(key);
    }
  });
});
