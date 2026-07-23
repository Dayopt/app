import { FEED_RESPONSE_HEADERS, generateBlogFeed } from '@web/features/blog/lib/feed';

export const revalidate = 3600;

export async function GET() {
  const xml = await generateBlogFeed('ja');

  return new Response(xml, { headers: FEED_RESPONSE_HEADERS });
}
