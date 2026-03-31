import { redirect } from 'next/navigation';

/**
 * /stats → /stats/review にリダイレクト
 */
const StatsIndexRedirect = () => {
  redirect('/stats/review');
};

export default StatsIndexRedirect;
