import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseFrontmatter,
  validateDocumentMetadata,
  validateExistingLogSupersededBy,
} from '../checks/frontmatter-check.ts';

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

  it('正常系: codeのarrayにある実在pathをすべて検証する', () => {
    const root = createRoot();
    createFile(root, 'apps/product/index.ts');
    createFile(root, 'packages/domain/index.ts');

    const reasons = validateDocumentMetadata({
      content: `---
status: current
last_verified: 2026-07-14
code:
  - apps/product
  - packages/domain
---
`,
      relativePath: 'docs/engineering/architecture.md',
      root,
      today: '2026-07-14',
    });

    expect(reasons).toEqual([]);
  });

  it('エラー系: codeのarrayに含まれる不在pathを報告する', () => {
    const root = createRoot();
    createFile(root, 'apps/product/index.ts');

    const reasons = validateDocumentMetadata({
      content: `---
status: current
last_verified: 2026-07-14
code:
  - apps/product
  - packages/missing
---
`,
      relativePath: 'docs/engineering/architecture.md',
      root,
      today: '2026-07-14',
    });

    expect(reasons).toEqual(['codeのpathが存在しない: packages/missing']);
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

  it('境界: docsルート直下に昇格したstock file（docs/strategy.md）にもstock契約を適用する', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: current
last_verified: 2026-07-14
---
`,
      relativePath: 'docs/strategy.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([]);
  });

  it('境界: docsルート直下のstock fileもmetadata欠落を報告する', () => {
    const reasons = validateDocumentMetadata({
      content: '# Strategy\n',
      relativePath: 'docs/strategy.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([
      'frontmatterがない',
      'frontmatterにstatusがない',
      'frontmatterにlast_verifiedがない',
    ]);
  });

  it('エラー系: stockの実在しないカレンダー日付を拒否する', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: current
last_verified: 2026-02-30
---
`,
      relativePath: 'docs/engineering/architecture.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual(['last_verifiedが有効な過去日付ではない: 2026-02-30']);
  });

  it('境界: 配置とstatusの対応を強制する（doneは_archive限定、_archiveはdone限定）', () => {
    const root = createRoot();
    createFile(root, 'apps/product/index.ts');
    createFile(root, 'docs/projects/example/summary.md');
    const done = `---
status: done
last_verified: 2026-07-14
code: apps/product
---
`;
    expect(
      validateDocumentMetadata({
        content: done,
        relativePath: 'docs/projects/example/overview.md',
        root,
        today: '2026-07-14',
      }),
    ).toContain('done Projectは docs/projects/_archive/ へ移す（workflow.md §完了後）');

    const active = done.replace('status: done', 'status: active');
    expect(
      validateDocumentMetadata({
        content: active,
        relativePath: 'docs/projects/_archive/example/overview.md',
        root,
        today: '2026-07-14',
      }),
    ).toContain('_archive/ 配下のProjectはstatus: doneに限る: active');
  });

  it('境界: _archive/ 配下の done Projectにも同じcontractを適用する', () => {
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
      relativePath: 'docs/projects/_archive/example/overview.md',
      root,
      today: '2026-07-14',
    } as const;

    expect(validateDocumentMetadata(options)).toContain('done Projectにsummary.mdがない');

    createFile(root, 'docs/projects/_archive/example/summary.md');
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

  it('エラー系: 新規logの日付なしaliasを拒否する', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
---
`,
      relativePath: 'docs/engineering/log/latest.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual(['新規logのfilenameはYYYY-MM-DD-slug.mdにする']);
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

  it('エラー系: superseded_byのarray指定を拒否する', () => {
    const root = createRoot();
    createFile(root, 'docs/product/log/2026-08-01-new.md');

    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
superseded_by:
  - docs/product/log/2026-08-01-new.md
---
`,
      relativePath: 'docs/product/log/2026-07-14-old.md',
      root,
      today: '2026-08-01',
    });

    expect(reasons).toEqual(['superseded_byはscalarのrepo-relative pathで指定する']);
  });

  it('正常系: 部分訂正keyが実在するrepo-relative pathなら受理する（#1939）', () => {
    const root = createRoot();
    createFile(root, 'docs/engineering/log/2026-08-11-fix.md');

    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
partially_superseded_2026_08_11_codeql-status: docs/engineering/log/2026-08-11-fix.md
---
`,
      relativePath: 'docs/product/log/2026-07-14-old.md',
      root,
      today: '2026-08-11',
    });

    expect(reasons).toEqual([]);
  });

  it('エラー系: 部分訂正keyが指す先が存在しなければ拒否する（#1939）', () => {
    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
partially_superseded_2026_08_11_codeql-status: docs/engineering/log/2026-08-11-missing.md
---
`,
      relativePath: 'docs/product/log/2026-07-14-old.md',
      root: createRoot(),
      today: '2026-08-11',
    });

    expect(reasons).toEqual([
      'partially_superseded_2026_08_11_codeql-statusのpathが存在しない: docs/engineering/log/2026-08-11-missing.md',
    ]);
  });

  it('エラー系: 部分訂正keyが実在するがlogではないfileを指す場合は拒否する（Codexレビュー指摘）', () => {
    const root = createRoot();
    createFile(root, 'docs/engineering/architecture.md');

    const reasons = validateDocumentMetadata({
      content: `---
status: frozen
date: 2026-07-14
partially_superseded_2026_08_11_codeql-status: docs/engineering/architecture.md
---
`,
      relativePath: 'docs/product/log/2026-07-14-old.md',
      root,
      today: '2026-08-11',
    });

    expect(reasons).toEqual([
      'partially_superseded_2026_08_11_codeql-statusはdocs/<domain>/log/配下の訂正logを指す（実在するだけでは不十分）: docs/engineering/architecture.md',
    ]);
  });

  it('境界: secrets.mdはstock契約の検証対象にする', () => {
    const reasons = validateDocumentMetadata({
      content: '# Secrets\n',
      relativePath: 'docs/operations/secrets.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([
      'frontmatterがない',
      'frontmatterにstatusがない',
      'frontmatterにlast_verifiedがない',
    ]);
  });

  it('境界: RLS snapshotと似たpathはgenerated例外にしない', () => {
    const reasons = validateDocumentMetadata({
      content: '# snapshot\n',
      relativePath: 'docs/engineering/data/db/rls-snapshot-copy.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([
      'frontmatterがない',
      'frontmatterにstatusがない',
      'frontmatterにlast_verifiedがない',
    ]);
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

describe('validateExistingLogSupersededBy', () => {
  it('正常系: 既存logに追記した実在pathを受理する', () => {
    const root = createRoot();
    createFile(root, 'docs/product/log/2026-08-01-new.md');

    const reasons = validateExistingLogSupersededBy(
      `superseded_by: docs/product/log/2026-08-01-new.md\n`,
      root,
    );

    expect(reasons).toEqual([]);
  });

  it('エラー系: 既存logに追記した不在pathを拒否する', () => {
    const reasons = validateExistingLogSupersededBy(
      `superseded_by: docs/product/log/2026-08-01-missing.md\n`,
      createRoot(),
    );

    expect(reasons).toEqual([
      'superseded_byのpathが存在しない: docs/product/log/2026-08-01-missing.md',
    ]);
  });

  it('境界: legacyのstatus追記だけならsuperseded_by検証を要求しない', () => {
    expect(validateExistingLogSupersededBy('status: superseded\n', createRoot())).toEqual([]);
  });

  it('正常系: 既存logに追記した部分訂正keyの実在pathを受理する（#1939）', () => {
    const root = createRoot();
    createFile(root, 'docs/engineering/log/2026-08-11-fix.md');

    const reasons = validateExistingLogSupersededBy(
      `partially_superseded_2026_08_11_codeql-status: docs/engineering/log/2026-08-11-fix.md\n`,
      root,
    );

    expect(reasons).toEqual([]);
  });

  it('エラー系: 既存logに追記した部分訂正keyの不在pathを拒否する（#1939）', () => {
    const reasons = validateExistingLogSupersededBy(
      `partially_superseded_2026_08_11_codeql-status: docs/engineering/log/2026-08-11-missing.md\n`,
      createRoot(),
    );

    expect(reasons).toEqual([
      'partially_superseded_2026_08_11_codeql-statusのpathが存在しない: docs/engineering/log/2026-08-11-missing.md',
    ]);
  });
});

describe('product specのレジストリ形式', () => {
  function validateSpec(frontmatter: string): string[] {
    return validateDocumentMetadata({
      content: `---\nstatus: current\nlast_verified: 2026-07-14\n${frontmatter}---\n`,
      relativePath: 'docs/product/specs/review.md',
      root: createRoot(),
      today: '2026-07-14',
    });
  }

  it('正常系: slugのlistと空配列を受理する', () => {
    expect(validateSpec("public_docs:\n  - review\nlp:\n  - 'Core Review metrics'\n")).toEqual([]);
    expect(validateSpec('public_docs: []\nlp: []\n')).toEqual([]);
  });

  it('エラー系: public_docsにpathや拡張子を書いたら拒否する', () => {
    expect(
      validateSpec('public_docs:\n  - apps/web/content/docs/en/features/review.mdx\n'),
    ).toEqual([
      'public_docsはkebab-caseのslugで書く（pathや拡張子は書かない）: apps/web/content/docs/en/features/review.mdx',
    ]);
  });

  it('エラー系: scalarで書いたら配列を要求する', () => {
    expect(validateSpec('public_docs: review\n')).toEqual([
      'public_docsは配列で書く（公開docsが無い場合は空配列）',
    ]);
  });

  it('境界: spec以外のstockには適用しない', () => {
    const reasons = validateDocumentMetadata({
      content: `---\nstatus: current\nlast_verified: 2026-07-14\npublic_docs: review\n---\n`,
      relativePath: 'docs/product/principles.md',
      root: createRoot(),
      today: '2026-07-14',
    });

    expect(reasons).toEqual([]);
  });
});
