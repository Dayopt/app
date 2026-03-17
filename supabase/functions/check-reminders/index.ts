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
      .returns<ReminderEntry[]>();

    if (entriesError) {
      log('error', 'Error fetching entries', { error: entriesError.message });
      throw entriesError;
    }

    if (!entries || entries.length === 0) {
      return jsonResponse({ message: 'No reminders to send', count: 0 });
    }

    // 各エントリに対して通知を作成
    const notificationsCreated = [];
    const entriesUpdated = [];

    for (const entry of entries) {
      // 通知を作成（冪等: 同一 entry_id + type の重複は無視）
      const { data: notification, error: notificationError } = await supabase
        .from('notifications')
        .upsert(
          {
            user_id: entry.user_id,
            type: 'reminder',
            entry_id: entry.id,
            is_read: false,
          },
          { onConflict: 'entry_id,type', ignoreDuplicates: true },
        )
        .select()
        .single();

      if (notificationError) {
        log('error', 'Error creating notification', { error: notificationError.message });
        continue;
      }

      notificationsCreated.push(notification);

      // エントリのreminder_sentをtrueに更新
      const { error: updateError } = await supabase
        .from('entries')
        .update({ reminder_sent: true })
        .eq('id', entry.id);

      if (updateError) {
        log('error', 'Error updating entry', { entryId: entry.id, error: updateError.message });
        continue;
      }

      entriesUpdated.push(entry.id);
    }

    return jsonResponse({
      message: 'Reminders processed successfully',
      notificationsCreated: notificationsCreated.length,
      entriesUpdated: entriesUpdated.length,
      entryIds: entriesUpdated,
    });
  } catch (error) {
    log('error', 'check-reminders function failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
});
