// daily-insights Edge Function
// 毎日実行され、当日の KPI を閾値判定してルールベース通知を生成

import { verifyCronSecret } from '../_shared/auth-guard.ts';
import { log } from '../_shared/logger.ts';
import { corsResponse, errorResponse, jsonResponse } from '../_shared/response.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import type { ActiveUser, DailySnapshot } from '../_shared/types.ts';

// =============================================================================
// 閾値定義（ruleInsights.ts の DEFAULT_THRESHOLDS に準拠）
// =============================================================================

const THRESHOLDS = {
  entryRate: { low: 0.5 },
  peakUtilization: { low: 0.3 },
  contextSwitches: { high: 8 },
  blankRate: { high: 0.6 },
  burnout: {
    totalMinutesHigh: 600, // 10時間
    fulfillmentLow: 2.0,
    consecutiveDays: 3,
  },
} as const;

// =============================================================================
// 型定義
// =============================================================================

type NotificationType = 'ai_insight' | 'energy_insight' | 'burnout_warning';

interface KpiSummary {
  cumulativeTime: { totalMinutes: number };
  avgFulfillment: { avgFulfillment: number | null; entryCount: number };
  entryRate: { totalEntries: number; plannedEntries: number; entryRate: number };
  contextSwitches: { totalSwitches: number; avgPerDay: number };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankMinutes: number;
    blankRate: number;
  };
}

interface NotificationRow {
  user_id: string;
  type: NotificationType;
  title: string;
  data: Record<string, unknown>;
}

// =============================================================================
// ルールベース判定
// =============================================================================

function evaluateThresholds(kpi: KpiSummary): NotificationRow[] {
  const notifications: Omit<NotificationRow, 'user_id'>[] = [];

  // 最低限のデータがあるか（エントリ0件なら通知しない）
  if (kpi.entryRate.totalEntries === 0) return [];

  // エントリ率が低い
  if (kpi.entryRate.entryRate < THRESHOLDS.entryRate.low) {
    notifications.push({
      type: 'ai_insight',
      title: 'エントリ率が低い傾向があります',
      data: { rule: 'entryRate_low', value: kpi.entryRate.entryRate },
    });
  }

  // コンテキストスイッチが多い
  if (kpi.contextSwitches.avgPerDay > THRESHOLDS.contextSwitches.high) {
    notifications.push({
      type: 'ai_insight',
      title: 'コンテキストスイッチが多い傾向があります',
      data: { rule: 'contextSwitches_high', value: kpi.contextSwitches.avgPerDay },
    });
  }

  // 空白率が高い
  if (kpi.blankRate.blankRate > THRESHOLDS.blankRate.high) {
    notifications.push({
      type: 'ai_insight',
      title: '空白時間が多い傾向があります',
      data: { rule: 'blankRate_high', value: kpi.blankRate.blankRate },
    });
  }

  // ピーク活用率が低い
  // peakUtilization は get_stats_kpi_summary に含まれないため、
  // get_energy_map から計算が必要。初期実装ではスキップし、後続で追加。

  return notifications as NotificationRow[];
}

// =============================================================================
// バーンアウト検出（直近N日の連続悪化）
// =============================================================================

function evaluateBurnout(snapshots: DailySnapshot[]): NotificationType | null {
  if (snapshots.length < THRESHOLDS.burnout.consecutiveDays) return null;

  const recent = snapshots.slice(-THRESHOLDS.burnout.consecutiveDays);

  // 連続で totalTime > 10h
  const allOverworked = recent.every((s) => s.total_minutes > THRESHOLDS.burnout.totalMinutesHigh);
  if (allOverworked) return 'burnout_warning';

  // 連続で fulfillment < 2.0
  const allLowFulfillment = recent.every(
    (s) => s.avg_fulfillment !== null && s.avg_fulfillment < THRESHOLDS.burnout.fulfillmentLow,
  );
  if (allLowFulfillment) return 'burnout_warning';

  return null;
}

// =============================================================================
// メイン処理
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();

    // 1. 当日エントリがあるアクティブユーザーを取得
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { data: activeUsers, error: usersError } = await supabase
      .rpc(
        'get_active_users_for_daily_insights' as never,
        {
          p_date: today,
          p_limit: 500,
        } as never,
      )
      .returns<ActiveUser[]>();

    if (usersError) {
      log('error', 'Error fetching active users', { error: usersError.message });
      throw usersError;
    }

    if (!activeUsers || activeUsers.length === 0) {
      return jsonResponse({ message: 'No active users today', count: 0 });
    }

    log('info', 'Processing daily insights', { userCount: activeUsers.length });

    let totalNotifications = 0;

    // ユーザーの通知タイプ別設定を一括取得
    const { data: allPrefs } = await supabase
      .from('notification_preferences')
      .select('user_id, enable_daily_insights, enable_energy_insights, enable_burnout_warnings')
      .in(
        'user_id',
        activeUsers.map((u) => u.user_id),
      );

    const prefsMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));

    for (const user of activeUsers) {
      try {
        // ユーザーの通知タイプ別設定を確認
        const userPrefs = prefsMap.get(user.user_id);
        const enabledTypes = {
          ai_insight: userPrefs?.enable_daily_insights ?? true,
          energy_insight: userPrefs?.enable_energy_insights ?? true,
          burnout_warning: userPrefs?.enable_burnout_warnings ?? true,
        };

        // 全タイプ無効なら KPI 集計自体をスキップ
        if (
          !enabledTypes.ai_insight &&
          !enabledTypes.energy_insight &&
          !enabledTypes.burnout_warning
        ) {
          continue;
        }

        // 2. KPI 集計
        const { data: kpiData, error: kpiError } = await supabase.rpc(
          'get_stats_kpi_summary' as never,
          {
            p_user_id: user.user_id,
            p_start_date: `${today}T00:00:00Z`,
            p_end_date: `${today}T23:59:59Z`,
            p_wake_hour: 7,
            p_sleep_hour: 23,
          } as never,
        );

        if (kpiError) {
          log('warn', 'KPI fetch failed for user', {
            userId: user.user_id,
            error: kpiError.message,
          });
          continue;
        }

        // DB RPC は planRate キーで返すため、entryRate にマッピング
        const rawKpi = kpiData as {
          cumulativeTime: KpiSummary['cumulativeTime'];
          avgFulfillment: KpiSummary['avgFulfillment'];
          planRate: { totalEntries: number; plannedEntries: number; planRate: number };
          contextSwitches: KpiSummary['contextSwitches'];
          blankRate: KpiSummary['blankRate'];
        } | null;
        if (!rawKpi) continue;

        const kpi: KpiSummary = {
          ...rawKpi,
          entryRate: {
            totalEntries: rawKpi.planRate.totalEntries,
            plannedEntries: rawKpi.planRate.plannedEntries,
            entryRate: rawKpi.planRate.planRate,
          },
        };

        // 3. 閾値判定
        const thresholdNotifications = evaluateThresholds(kpi);
        const rows: NotificationRow[] = thresholdNotifications.map((n) => ({
          ...n,
          user_id: user.user_id,
        }));

        // 4. バーンアウト判定（直近3日）
        const { data: snapshots } = await supabase.rpc(
          'get_daily_snapshots' as never,
          {
            p_user_id: user.user_id,
            p_days: THRESHOLDS.burnout.consecutiveDays,
          } as never,
        );

        if (snapshots) {
          const burnoutType = evaluateBurnout(snapshots as DailySnapshot[]);
          if (burnoutType) {
            rows.push({
              user_id: user.user_id,
              type: burnoutType,
              title: 'バーンアウトの兆候があります',
              data: { rule: 'burnout_consecutive' },
            });
          }
        }

        // 5. ユーザー設定で無効な通知タイプを除外
        const filteredRows = rows.filter((r) => enabledTypes[r.type]);

        // 6. 同日の重複チェック → INSERT
        if (filteredRows.length > 0) {
          // 今日すでに送った通知タイプを除外
          const { data: existing } = await supabase
            .from('notifications')
            .select('type')
            .eq('user_id', user.user_id)
            .gte('created_at', `${today}T00:00:00Z`)
            .in(
              'type',
              filteredRows.map((r) => r.type),
            );

          const existingTypes = new Set((existing ?? []).map((n) => n.type));
          const newRows = filteredRows.filter((r) => !existingTypes.has(r.type));

          if (newRows.length > 0) {
            const { error: insertError } = await supabase.from('notifications').insert(newRows);

            if (insertError) {
              log('warn', 'Notification insert failed', {
                userId: user.user_id,
                error: insertError.message,
              });
            } else {
              totalNotifications += newRows.length;
            }
          }
        }
      } catch (userError) {
        log('warn', 'Error processing user', {
          userId: user.user_id,
          error: userError instanceof Error ? userError.message : 'Unknown',
        });
      }
    }

    return jsonResponse({
      message: 'Daily insights processed',
      usersProcessed: activeUsers.length,
      notificationsCreated: totalNotifications,
    });
  } catch (error) {
    log('error', 'daily-insights function failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
});
