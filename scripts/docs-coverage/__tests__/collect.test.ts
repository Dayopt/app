import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCoverage, collectDocs, collectLpClaims, collectSpecs } from '../collect.ts';

const temporaryDirectories: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dayopt-docs-coverage-'));
  temporaryDirectories.push(root);
  return root;
}

function createFile(root: string, path: string, content: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('collectSpecs', () => {
  it('public_docsとlpを読み、未記入のspecをregistered=falseにする', () => {
    const root = createRoot();
    createFile(
      root,
      'review.md',
      `---
status: current
public_docs:
  - review
lp:
  - 'Core Review metrics'
---
`,
    );
    createFile(root, 'auth.md', `---\nstatus: current\n---\n`);
    createFile(root, 'contact.md', `---\nstatus: current\npublic_docs: []\nlp: []\n---\n`);

    const specs = collectSpecs(root);

    expect(specs.map((spec) => spec.name)).toEqual(['auth', 'contact', 'review']);
    expect(specs.find((spec) => spec.name === 'review')).toMatchObject({
      publicDocs: ['review'],
      lp: ['Core Review metrics'],
      registered: true,
    });
    // 未記入は「公開docs不要」と区別する
    expect(specs.find((spec) => spec.name === 'auth')?.registered).toBe(false);
    expect(specs.find((spec) => spec.name === 'contact')).toMatchObject({
      publicDocs: [],
      registered: true,
    });
  });
});

describe('collectDocs', () => {
  it('slugをファイル名から導出し、placeholderをdraftと区別する', () => {
    const root = createRoot();
    createFile(root, 'en/features/plans.mdx', `---\ntitle: 'Plans'\n---\n`);
    createFile(root, 'en/features/review.mdx', `---\ndraft: true\nplaceholder: true\n---\n`);
    createFile(root, 'en/features/records.mdx', `---\ndraft: true\n---\n`);
    createFile(root, 'ja/getting-started/index.mdx', `---\ntitle: 'はじめに'\n---\n`);

    const docs = collectDocs(root);

    expect(docs.find((doc) => doc.slug === 'plans')?.state).toBe('published');
    expect(docs.find((doc) => doc.slug === 'review')?.state).toBe('placeholder');
    expect(docs.find((doc) => doc.slug === 'records')?.state).toBe('draft');
    // index.mdx はカテゴリ名が slug になる（apps/web/src/lib/mdx.ts と同じ規則）
    expect(docs.find((doc) => doc.locale === 'ja')?.slug).toBe('getting-started');
  });
});

describe('collectLpClaims', () => {
  it('FreeのfeaturesとProのhighlightsを集める', () => {
    const root = createRoot();
    createFile(
      root,
      'marketing.json',
      JSON.stringify({
        marketing: {
          pricing: {
            plans: {
              free: { features: ['Tags'] },
              pro: { highlights: ['Unlimited tags', 'Data export'] },
            },
          },
        },
      }),
    );

    expect(collectLpClaims(join(root, 'marketing.json'))).toEqual([
      'Tags',
      'Unlimited tags',
      'Data export',
    ]);
  });
});

describe('buildCoverage', () => {
  const specs = [
    { name: 'tags', publicDocs: ['tags'], lp: ['Tags'], registered: true },
    { name: 'auth', publicDocs: [], lp: [], registered: false },
  ];

  it('specのpublic_docsを軸にen/jaの状態を並べる', () => {
    const coverage = buildCoverage(
      specs,
      [
        { slug: 'tags', locale: 'en', path: 'features/tags.mdx', state: 'published' },
        { slug: 'tags', locale: 'ja', path: 'features/tags.mdx', state: 'placeholder' },
      ],
      ['Tags'],
    );

    expect(coverage.rows).toEqual([
      { spec: 'tags', slug: 'tags', states: { en: 'published', ja: 'placeholder' }, lp: ['Tags'] },
    ]);
    expect(coverage.unregisteredSpecs).toEqual(['auth']);
  });

  it('ファイルが無いlocaleをmissingにする', () => {
    const coverage = buildCoverage(
      specs,
      [{ slug: 'tags', locale: 'ja', path: 'features/tags.mdx', state: 'published' }],
      ['Tags'],
    );

    expect(coverage.rows[0]?.states).toEqual({ en: 'missing', ja: 'published' });
  });

  it('LPの約束にspecが無いものと、LPから消えたspecの記述を両方報告する', () => {
    const coverage = buildCoverage(specs, [], ['Tags', 'API and MCP access']);

    expect(coverage.unbackedLpClaims).toEqual(['API and MCP access']);
    expect(coverage.staleLpClaims).toEqual([]);

    const stale = buildCoverage(specs, [], ['API and MCP access']);
    expect(stale.staleLpClaims).toEqual([{ spec: 'tags', claim: 'Tags' }]);
  });

  it('どのspecにも紐づかない公開docsをorphanとして返す', () => {
    const coverage = buildCoverage(
      specs,
      [{ slug: 'comparison', locale: 'en', path: 'faq/comparison.mdx', state: 'published' }],
      [],
    );

    expect(coverage.orphanDocs.map((doc) => doc.slug)).toEqual(['comparison']);
  });
});
