import { getAllBlogPostMetas } from '@/features/blog';
import { siteConfig } from '@/platform/seo/metadata';

export const revalidate = 3600;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const posts = await getAllBlogPostMetas('en');
  const baseUrl = siteConfig.url;

  const items = posts
    .sort(
      (a, b) =>
        new Date(b.frontMatter.publishedAt).getTime() -
        new Date(a.frontMatter.publishedAt).getTime(),
    )
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.frontMatter.title)}</title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <description>${escapeXml(post.excerpt)}</description>
      <pubDate>${new Date(post.frontMatter.publishedAt).toUTCString()}</pubDate>
      <author>${escapeXml(post.frontMatter.author)}</author>${
        post.frontMatter.tags.length > 0
          ? post.frontMatter.tags
              .map((tag) => `\n      <category>${escapeXml(tag)}</category>`)
              .join('')
          : ''
      }
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.name)} Blog</title>
    <link>${baseUrl}/blog</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
