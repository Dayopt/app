import { getAllTags } from '@/features/tags';
import { apiError, apiSuccess, ErrorCode } from '@/platform/api/api-response';
import { getClientIp, tagsRateLimit } from '@/platform/security/rate-limit';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // レート制限チェック
    const ip = getClientIp(request);
    const { success } = await tagsRateLimit.limit(ip);

    if (!success) {
      return apiError('Too many requests. Please try again later.', 429, {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });
    }

    const tags = await getAllTags();
    return apiSuccess(tags);
  } catch {
    return apiError('Failed to fetch tags', 500, { code: ErrorCode.INTERNAL_ERROR });
  }
}
