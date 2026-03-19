/**
 * 設定カテゴリの識別子（7カテゴリ）
 *
 * 複数featureから参照されるため @/types に配置
 */
export type SettingsCategory =
  | 'profile'
  | 'display'
  | 'notifications'
  | 'data'
  | 'billing'
  | 'account';
