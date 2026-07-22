import { describe, expect, it } from 'vitest';

import {
  parseFrontMatter,
  REQUIRED_LEGAL_DOCUMENTS,
  validateFrontMatter,
  validateLegalBody,
} from './scripts/validate-content.js';
import { LEGAL_DOCUMENT_SLUGS } from './src/app/[locale]/(marketing)/legal/_lib/legal-content.ts';

describe('legal content validation', () => {
  it('runtime loader と同じ5文書を必須にする', () => {
    expect(REQUIRED_LEGAL_DOCUMENTS).toEqual(
      [...LEGAL_DOCUMENT_SLUGS].sort().map((slug) => `${slug}.mdx`),
    );
  });

  it('frontmatter を3 fieldへ限定する', () => {
    expect(
      validateFrontMatter(
        {
          title: 'Privacy',
          description: 'Description',
          lastUpdated: 'Last Updated',
          draft: false,
        },
        'legal',
        false,
      ).errors,
    ).toEqual(["Unexpected legal frontmatter field: 'draft'"]);
  });

  it('legal の draft field を warning へ降格しない', () => {
    const result = validateFrontMatter(
      {
        title: 'Privacy',
        description: 'Description',
        lastUpdated: 'Last Updated',
        draft: true,
      },
      'legal',
      true,
    );

    expect(result.errors).toEqual(["Unexpected legal frontmatter field: 'draft'"]);
    expect(result.warnings).toEqual([]);
  });

  it('nested な余分な legal frontmatter field も検出する', () => {
    const { data } = parseFrontMatter(`---
title: Privacy
description: Description
lastUpdated: Last Updated
unexpected:
  value: true
---

Body
`);

    expect(validateFrontMatter(data, 'legal', false).errors).toEqual([
      "Unexpected legal frontmatter field: 'unexpected'",
    ]);
  });

  it('frontmatter後の空本文を拒否する', () => {
    const { body } = parseFrontMatter(`---
title: Privacy
description: Description
lastUpdated: Last Updated
---
`);

    expect(validateLegalBody(body)).toEqual(['Legal document content must not be empty']);
  });
});

describe('blog/releases tags validation', () => {
  const baseBlogFm = {
    title: 'Post',
    description: 'Description',
    publishedAt: '2026-01-01',
    category: 'guide',
    author: 'Dayopt Team',
  };

  it('tags 未指定は必須フィールド欠落として報告する', () => {
    const result = validateFrontMatter({ ...baseBlogFm }, 'blog', false);
    expect(result.errors).toContain("Missing required field: 'tags'");
  });

  it('tags: [] も必須フィールド欠落として報告する（空配列のすり抜けを防ぐ）', () => {
    const result = validateFrontMatter({ ...baseBlogFm, tags: [] }, 'blog', false);
    expect(result.errors).toContain("Missing required field: 'tags'");
  });

  it('tags が1-2件だと Too few tags を報告する', () => {
    const result = validateFrontMatter({ ...baseBlogFm, tags: ['solo'] }, 'blog', false);
    expect(result.errors).toContain('Too few tags (min: 3, found: 1)');
  });

  it('tags が3-6件なら tags関連のエラーは出さない', () => {
    const result = validateFrontMatter(
      { ...baseBlogFm, tags: ['a', 'b', 'c'] },
      'blog',
      false,
    );
    expect(result.errors.filter((e) => e.includes('tags'))).toEqual([]);
  });

  it('tags が7件超だと Too many tags を報告する', () => {
    const result = validateFrontMatter(
      { ...baseBlogFm, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
      'blog',
      false,
    );
    expect(result.errors).toContain('Too many tags (max: 6, found: 7)');
  });

  it('draft: true では tags 欠落は warning に降格する', () => {
    const result = validateFrontMatter({ ...baseBlogFm }, 'blog', true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("Missing required field: 'tags'");
  });

  it('releases でも tags: [] を必須フィールド欠落として報告する', () => {
    const result = validateFrontMatter(
      {
        version: 'v1.0.0',
        date: '2026-01-01',
        title: 'Release',
        description: 'Description',
        tags: [],
        breaking: false,
        featured: false,
      },
      'releases',
      false,
    );
    expect(result.errors).toContain("Missing required field: 'tags'");
  });
});

describe('parseFrontMatter のインライン配列構文', () => {
  function releaseMdx(tagsLine) {
    return `---
version: 'v1.0.0'
date: '2026-01-01'
title: 'Release'
description: 'Description'
${tagsLine}
breaking: false
featured: false
---

Body
`;
  }

  it("tags: ['a', 'b'] を実際の配列としてパースする（文字列のまま残るとArray.isArrayの判定が壊れる）", () => {
    const { data } = parseFrontMatter(releaseMdx("tags: ['improvements', 'bug-fixes']"));
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toEqual(['improvements', 'bug-fixes']);
  });

  it('tags: [] を空配列としてパースする', () => {
    const { data } = parseFrontMatter(releaseMdx('tags: []'));
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toEqual([]);
  });

  it('インライン tags: [] は parseFrontMatter を通しても必須フィールド欠落として報告される', () => {
    const { data } = parseFrontMatter(releaseMdx('tags: []'));
    const result = validateFrontMatter(data, 'releases', false);
    expect(result.errors).toContain("Missing required field: 'tags'");
  });

  it('releases では1件でも Too few tags にならない（固定5分類のうち該当分だけでよい）', () => {
    const { data } = parseFrontMatter(releaseMdx("tags: ['bug-fixes']"));
    const result = validateFrontMatter(data, 'releases', false);
    expect(result.errors.filter((e) => e.includes('tags'))).toEqual([]);
  });

  it('releases では2件でも Too few tags にならない（docs-writingテンプレートの実例と同じ件数）', () => {
    const { data } = parseFrontMatter(releaseMdx("tags: ['new-features', 'improvements']"));
    const result = validateFrontMatter(data, 'releases', false);
    expect(result.errors.filter((e) => e.includes('tags'))).toEqual([]);
  });

  it('インライン tags が3件なら parseFrontMatter を通しても tags関連のエラーは出ない', () => {
    const { data } = parseFrontMatter(releaseMdx("tags: ['a', 'b', 'c']"));
    const result = validateFrontMatter(data, 'releases', false);
    expect(result.errors.filter((e) => e.includes('tags'))).toEqual([]);
  });

  it('blog では releases と異なり1件だと Too few tags になる（3-6個ルールは blog 限定）', () => {
    const result = validateFrontMatter(
      {
        title: 'Post',
        description: 'Description',
        publishedAt: '2026-01-01',
        category: 'guide',
        author: 'Dayopt Team',
        tags: ['solo'],
      },
      'blog',
      false,
    );
    expect(result.errors).toContain('Too few tags (min: 3, found: 1)');
  });
});

describe('parseFrontMatter の行末インラインコメント', () => {
  function releaseMdx(tagsLine) {
    return `---
version: 'v1.0.0'
date: '2026-01-01'
title: 'Release'
description: 'Description'
${tagsLine}
breaking: false
featured: false
---

Body
`;
  }

  it('tags: [] # comment はコメント混じりの文字列ではなく空配列としてパースする', () => {
    const { data } = parseFrontMatter(releaseMdx('tags: [] # intentionally empty'));
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toEqual([]);
  });

  it('行末コメント付きの tags: [] は必須フィールド欠落として報告される', () => {
    const { data } = parseFrontMatter(releaseMdx('tags: [] # intentionally empty'));
    const result = validateFrontMatter(data, 'releases', false);
    expect(result.errors).toContain("Missing required field: 'tags'");
  });

  it('行末コメント付きのインライン配列は要素を保ったままパースする', () => {
    const { data } = parseFrontMatter(releaseMdx("tags: ['a', 'b', 'c'] # three tags"));
    expect(data.tags).toEqual(['a', 'b', 'c']);
  });

  it('クォート内の # はコメントとして切り落とさない', () => {
    const { data } = parseFrontMatter(
      `---
version: 'v1.0.0'
date: '2026-01-01'
title: 'Bug #123 fix'
description: 'Description'
tags: ['a', 'b', 'c']
breaking: false
featured: false
---

Body
`,
    );
    expect(data.title).toBe('Bug #123 fix');
  });

  it('複数行配列の要素につく行末コメントも除去する', () => {
    const { data } = parseFrontMatter(
      `---
version: 'v1.0.0'
date: '2026-01-01'
title: 'Release'
description: 'Description'
tags:
  - a # primary
  - b
  - c
breaking: false
featured: false
---

Body
`,
    );
    expect(data.tags).toEqual(['a', 'b', 'c']);
  });
});
