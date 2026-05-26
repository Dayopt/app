/**
 * 設定カテゴリの識別子（5カテゴリ）
 *
 * lib/stores/useShellStore および lib/components/shell から参照されるため lib/types に配置。
 * lib/ → features/* の import は DAG 違反になるため features/settings への移動は不可。
 * features/settings からは features/settings/types/index.ts 経由で re-export している。
 */
export type SettingsCategory = 'profile' | 'display' | 'data' | 'billing' | 'account';
