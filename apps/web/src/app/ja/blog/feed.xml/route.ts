import { FEED_RESPONSE_HEADERS, generateBlogFeed } from '@web/features/blog/lib/feed';

export const revalidate = 3600;
/** generateBlogFeed はローカル content の読み込みのみで外部 I/O 無し。revalidate cache 前提。 */
export const maxDuration = 30;

export async function GET() {
  const xml = await generateBlogFeed('ja');

  return new Response(xml, { headers: FEED_RESPONSE_HEADERS });
}
