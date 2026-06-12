/**
 * 設定用タイムゾーンユーティリティ
 *
 * 共通のタイムゾーン関数は @/lib/date から再エクスポート。
 * このファイルは設定固有の機能（日本語ラベル、DateFormatType依存）を提供。
 */

// ========================================
// 設定固有の機能
// ========================================

/** 日本語ラベル付きタイムゾーン情報（設定UI用） */
interface TimezoneInfoJa {
  value: string;
  label: string;
  offset: number;
}

/**
 * タイムゾーンリストの取得（日本語ラベル付き）
 *
 * 設定UIで使用するための日本語ラベル付きリスト。
 * 英語版は `getCommonTimezones` from '@/lib/date' を使用。
 */
export function getTimeZones(): TimezoneInfoJa[] {
  const timezones: TimezoneInfoJa[] = [
    { value: 'Pacific/Honolulu', label: 'ホノルル (GMT-10)', offset: -10 },
    { value: 'America/Anchorage', label: 'アンカレッジ (GMT-9)', offset: -9 },
    { value: 'America/Los_Angeles', label: 'ロサンゼルス (GMT-8)', offset: -8 },
    { value: 'America/Denver', label: 'デンバー (GMT-7)', offset: -7 },
    { value: 'America/Chicago', label: 'シカゴ (GMT-6)', offset: -6 },
    { value: 'America/New_York', label: 'ニューヨーク (GMT-5)', offset: -5 },
    { value: 'America/Sao_Paulo', label: 'サンパウロ (GMT-3)', offset: -3 },
    { value: 'Europe/London', label: 'ロンドン (GMT+0)', offset: 0 },
    { value: 'Europe/Paris', label: 'パリ (GMT+1)', offset: 1 },
    { value: 'Europe/Moscow', label: 'モスクワ (GMT+3)', offset: 3 },
    { value: 'Asia/Dubai', label: 'ドバイ (GMT+4)', offset: 4 },
    { value: 'Asia/Kolkata', label: 'コルカタ (GMT+5:30)', offset: 5.5 },
    { value: 'Asia/Singapore', label: 'シンガポール (GMT+8)', offset: 8 },
    { value: 'Asia/Shanghai', label: '上海 (GMT+8)', offset: 8 },
    { value: 'Asia/Tokyo', label: '東京 (GMT+9)', offset: 9 },
    { value: 'Australia/Sydney', label: 'シドニー (GMT+10)', offset: 10 },
    { value: 'Pacific/Auckland', label: 'オークランド (GMT+12)', offset: 12 },
  ];

  return timezones.sort((a, b) => a.offset - b.offset);
}
