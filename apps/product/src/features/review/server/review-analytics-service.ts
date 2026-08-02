import 'server-only';

import { trackProductEvent } from '@/lib/analytics/product-events';

export async function trackReviewOpened(userId: string): Promise<void> {
  await trackProductEvent({ eventName: 'review_opened', userId });
}
