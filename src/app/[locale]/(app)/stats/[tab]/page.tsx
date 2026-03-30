import { redirect } from 'next/navigation';

/**
 * 後方互換リダイレクト: /stats/[tab] → /stats?tab=[tab]
 *
 * 旧URLパターンからクエリパラメータベースの新URLへ転送。
 */
const StatsTabRedirect = async ({ params }: { params: Promise<{ tab: string }> }) => {
  const { tab } = await params;
  redirect(`/stats?tab=${tab}`);
};

export default StatsTabRedirect;
