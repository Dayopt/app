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
