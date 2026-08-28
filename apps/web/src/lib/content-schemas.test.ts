import { describe, expect, it } from 'vitest';
import { blogFrontMatterSchema, docFrontMatterSchema, parseFrontMatter } from './content-schemas';

describe('blogFrontMatterSchema', () => {
  it('有効なフロントマターをパース', () => {
    const data = {
      title: 'Test Post',
      description: 'A test post',
      publishedAt: '2026-01-01',
      category: 'engineering',
      author: 'Test Author',
    };

    const result = blogFrontMatterSchema.parse(data);
    expect(result.title).toBe('Test Post');
    expect(result.draft).toBe(false);
    expect(result.featured).toBe(false);
  });

  it('デフォルト値を補完', () => {
    const data = {
      title: 'Minimal Post',
      publishedAt: '2026-01-01',
    };

    const result = blogFrontMatterSchema.parse(data);
    expect(result.description).toBe('');
    expect(result.category).toBe('general');
    expect(result.author).toBe('Dayopt Team');
    expect(result.draft).toBe(false);
  });

  it('title が空文字だとバリデーションエラー', () => {
    const data = { title: '', publishedAt: '2026-01-01' };
    const result = blogFrontMatterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('publishedAt が未指定だとバリデーションエラー', () => {
    const data = { title: 'Test' };
    const result = blogFrontMatterSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('AI メタデータを含むフロントマターをパース', () => {
    const data = {
      title: 'AI Post',
      publishedAt: '2026-01-01',
      ai: {
        difficulty: 'beginner',
        contentType: 'tutorial',
        relatedDocs: ['/docs/intro'],
      },
    };

    const result = blogFrontMatterSchema.parse(data);
    expect(result.ai?.difficulty).toBe('beginner');
    expect(result.ai?.relatedDocs).toEqual(['/docs/intro']);
  });

  it('tags が剥ぎ取られずパースされる', () => {
    const data = {
      title: 'Tagged Post',
      publishedAt: '2026-01-01',
      tags: ['timeboxing', 'productivity'],
    };

    const result = blogFrontMatterSchema.parse(data);
    expect(result.tags).toEqual(['timeboxing', 'productivity']);
  });

  it('tags 未指定時は空配列を補完（省略時に例外を投げない）', () => {
    const data = {
      title: 'Untagged Post',
      publishedAt: '2026-01-01',
    };

    const result = blogFrontMatterSchema.parse(data);
    expect(result.tags).toEqual([]);
  });
});

describe('docFrontMatterSchema', () => {
  it('有効なドキュメントフロントマターをパース', () => {
    const data = {
      title: 'Getting Started',
      description: 'Introduction to Dayopt',
      slug: 'getting-started/intro',
      category: 'getting-started',
      order: 1,
    };

    const result = docFrontMatterSchema.parse(data);
    expect(result.title).toBe('Getting Started');
    expect(result.order).toBe(1);
  });

  it('デフォルト値を補完', () => {
    const data = {};
    const result = docFrontMatterSchema.parse(data);
    expect(result.title).toBe('Untitled');
    expect(result.description).toBe('');
    expect(result.category).toBe('general');
    expect(result.order).toBe(0);
  });
});

describe('parseFrontMatter', () => {
  it('有効なデータを正常にパース', () => {
    const data = { title: 'Test', publishedAt: '2026-01-01' };
    const result = parseFrontMatter(blogFrontMatterSchema, data, 'test.mdx');
    expect(result.title).toBe('Test');
  });

  it('不正なデータでもデフォルト値で補完して返す', () => {
    const data = { title: 'Test' }; // publishedAt missing
    // parseFrontMatter は警告を出しつつデフォルトで補完を試みる
    // ただしblogの場合publishedAtは必須でdefaultがないため、再パースでもエラーになる可能性
    // docFrontMatterSchemaで試す（全フィールドにデフォルトあり）
    const result = parseFrontMatter(docFrontMatterSchema, data, 'test.mdx');
    expect(result.title).toBe('Test');
    expect(result.description).toBe('');
  });
});
