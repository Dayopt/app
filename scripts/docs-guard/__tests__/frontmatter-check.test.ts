import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseFrontmatter, validateDocumentMetadata } from '../checks/frontmatter-check.ts';

const temporaryDirectories: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dayopt-docs-metadata-'));
  temporaryDirectories.push(root);
  return root;
}

function createFile(root: string, path: string, content = ''): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('parseFrontmatter', () => {
  it('scalarとlistを解析する', () => {
    const parsed = parseFrontmatter(`---
status: current
code:
  - apps/product
  - packages/domain
---
`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.fields.get('status')).toBe('current');
    expect(parsed.fields.get('code')).toEqual(['apps/product', 'packages/domain']);
  });
});

describe('validateDocumentMetadata', () => {
  it('正常系: stockのmetadataと実在code pathを受理する', () => {
    const root = createRoot();
    createFile(root, 'apps/product/index.ts');

    const reasons = validateDocumentMetadata({
      content: `---
status: current
last_verified: 2026-07-14
code: apps/product
---
`,
      relativePath: 'docs/product/specs/calendar.md',
      root,
      today: '2026-07-14',
    });

    expect(reasons).toEqual([]);
  });

  it('エラー系: stockの不正status・未来日・不在pathを報告する', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: active
last_verified: 2026-07-15
code: apps/missing
---
`,
      relativePath: 'docs/engineering/architecture.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([
      'stockのstatusが不正: active',
      'last_verifiedが有効な過去日付ではない: 2026-07-15',
      'codeのpathが存在しない: apps/missing',
    ]);
  });

  it('境界: done Projectにはsummary.mdを要求する', () => {
    const root = createRoot();
    createFile(root, 'apps/product/index.ts');
    const content = `---
status: done
last_verified: 2026-07-14
code: apps/product
---
`;
    const options = {
      content,
      relativePath: 'docs/projects/example/overview.md',
      root,
      today: '2026-07-14',
    } as const;

    expect(validateDocumentMetadata(options)).toContain('done Projectにsummary.mdがない');

    createFile(root, 'docs/projects/example/summary.md');
    expect(validateDocumentMetadata(options)).toEqual([]);
  });

  it('エラー系: 新規logはfrozenとfilenameに一致するdateを要求する', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: current
date: 2026-07-13
---
`,
      relativePath: 'docs/product/log/2026-07-14-example.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([
      '新規logのstatusはfrozenにする',
      'dateがfilenameと一致しない: 2026-07-13 != 2026-07-14',
    ]);
  });

  it('正常系: superseded_byが実在するrepo-relative pathなら受理する', () => {
    const root = createRoot();
    createFile(root, 'docs/product/log/2026-08-01-new.md');

    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
superseded_by: docs/product/log/2026-08-01-new.md
---
`,
      relativePath: 'docs/product/log/2026-07-14-old.md',
      root,
      today: '2026-08-01',
    });

    expect(reasons).toEqual([]);
  });

  it('generated snapshotは生成情報だけを検証する', () => {
    const reasons = validateDocumentMetadata({
      content: '# snapshot',
      relativePath: 'docs/engineering/data/db/rls-snapshot.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual(['generated snapshotに生成元・command・手編集禁止の表示がない']);
  });
});
