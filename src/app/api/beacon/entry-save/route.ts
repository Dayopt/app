/**
 * Beacon API: エントリ保存
 *
 * ブラウザ閉じ時に navigator.sendBeacon() から呼ばれる緊急保存用エンドポイント。
 * tRPC mutation はブラウザ閉じ時に使えないため、REST API で受ける。
 *
 * @see src/features/entry/components/inspector/hooks/useDebouncedSave.ts
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { EntryService } from '@/features/entry/server/entry-service';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

/** beacon で更新可能なフィールド（updateEntrySchema と同等） */
const ALLOWED_FIELDS = new Set([
  'title',
  'description',
  'origin',
  'start_time',
  'end_time',
  'duration_minutes',
  'actual_start_time',
  'actual_end_time',
  'fulfillment_score',
  'reminder_minutes',
]);

const beaconPayloadSchema = z.object({
  id: z.string().uuid(),
  data: z
    .record(z.union([z.string(), z.number(), z.null()]))
    .transform((obj) =>
      Object.fromEntries(Object.entries(obj).filter(([key]) => ALLOWED_FIELDS.has(key))),
    ),
});

/**
 * POST /api/beacon/entry-save
 *
 * sendBeacon はレスポンスを読めないため、エラーハンドリングは最小限。
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = beaconPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { id, data } = parsed.data;

    // Cookie ベース認証
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = new EntryService(supabase);
    await service.update({
      userId: user.id,
      entryId: id,
      input: data,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error('[beacon/entry-save] Failed to save entry:', error);
    Sentry.captureException(error, {
      tags: { source: 'beacon_entry_save' },
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
