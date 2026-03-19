// check-reminders Edge Function
// 毎分実行され、reminder_atが近いエントリをチェックして通知を生成

import { verifyCronSecret } from '../_shared/auth-guard.ts';
import { log } from '../_shared/logger.ts';
import { corsResponse, errorResponse, jsonResponse } from '../_shared/response.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type { ReminderEntry } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  // 認証チェック: CRON_SECRET で保護
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();

    // 現在時刻の1分後までにリマインダーが設定されているエントリを取得
    const now = new Date();
    const oneMinuteLater = new Date(now.getTime() + 60 * 1000);

    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, user_id, title, start_time, reminder_at, reminder_sent')
      .not('reminder_at', 'is', null)
      .eq('reminder_sent', false)
      .lte('reminder_at', oneMinuteLater.toISOString())
      .limit(500)
      .returns<ReminderEntry[]>();

    if (entriesError) {
      log('error', 'Error fetching entries', { error: entriesError.message });
      throw entriesError;
    }

    if (!entries || entries.length === 0) {
      return jsonResponse({ message: 'No reminders to send', count: 0 });
    }

    if (entries.length >= 500) {
      log('warn', 'Reminder batch limit reached — some reminders may be deferred to next run', {
        count: entries.length,
      });
    }

    // バッチで通知を作成（冪等: 同一 entry_id + type の重複は無視）
    const notificationRows = entries.map((entry) => ({
      user_id: entry.user_id,
      type: 'reminder' as const,
      entry_id: entry.id,
      is_read: false,
    }));

    const { data: notifications, error: notificationError } = await supabase
      .from('notifications')
      .upsert(notificationRows, { onConflict: 'entry_id,type', ignoreDuplicates: true })
      .select();

    if (notificationError) {
      log('error', 'Error creating notifications batch', { error: notificationError.message });
      throw notificationError;
    }

    // バッチでreminder_sentをtrueに更新
    const entryIds = entries.map((entry) => entry.id);
    const { error: updateError } = await supabase
      .from('entries')
      .update({ reminder_sent: true })
      .in('id', entryIds);

    if (updateError) {
      log('error', 'Error updating entries batch', { error: updateError.message });
      throw updateError;
    }

    return jsonResponse({
      message: 'Reminders processed successfully',
      notificationsCreated: notifications?.length ?? 0,
      entriesUpdated: entryIds.length,
      entryIds,
    });
  } catch (error) {
    log('error', 'check-reminders function failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
});
