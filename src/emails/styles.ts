/**
 * Shared Email Styles
 * 全メールテンプレートで使用する共通スタイル定義
 *
 * メールクライアントは CSS変数(var(--xxx)) や OKLCH をサポートしないため、
 * src/lib/styles/tokens/colors.css のセマンティックトークンを hex に変換して定義。
 *
 * トークンマッピング (tokens/colors.css :root → hex):
 *   --background    oklch(0.99 0 0)             → #fafafa
 *   --foreground    oklch(0.25 0 0)             → #1c1c1c
 *   --container     oklch(0.93 0 0)             → #e5e5e5
 *   --primary       oklch(0.45 0.14 259.8145)   → #2b4acb
 *   --primary-fg    oklch(1 0 0)                → #ffffff
 *   --muted-fg      oklch(0.35 0.02 264.54)     → #464655
 *   --border        oklch(0.75 0.01 264.54)     → #b3b3ba
 *   --destructive   oklch(0.52 0.22 25.33)      → #c90018
 *   --success       oklch(0.47 0.17 149.2)      → #007218
 *   --warning       oklch(0.48 0.16 68.04)      → #954400
 *   --info          oklch(0.48 0.17 250)        → #005db8
 */

import type { CSSProperties } from 'react';

/**
 * カラートークン（tokens/colors.css セマンティックトークン準拠）
 *
 * メールはライトモード固定。ダークモード値は不要。
 */
export const colors = {
  /** --background: ページ背景 */
  background: '#fafafa',
  /** --foreground: 通常テキスト */
  foreground: '#1c1c1c',
  /** --container: セクション背景 */
  container: '#e5e5e5',
  /** --card: カード背景（メールではコンテナ白背景に対応） */
  card: '#ffffff',
  /** --primary: 主要アクション */
  primary: '#2b4acb',
  /** --primary-foreground: Primary上のテキスト */
  primaryForeground: '#ffffff',
  /** --muted-foreground: 補助テキスト */
  mutedForeground: '#464655',
  /** --border: ボーダー */
  border: '#b3b3ba',
  /** --destructive: エラー・削除 */
  destructive: '#c90018',
  /** --success: 成功・完了 */
  success: '#007218',
  /** --warning: 警告・注意 */
  warning: '#954400',
  /** --info: 情報・ヒント */
  info: '#005db8',
} as const;

export const fontFamily =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif';

// Layout
export const main: CSSProperties = {
  backgroundColor: colors.background,
  fontFamily,
};

export const container: CSSProperties = {
  backgroundColor: colors.card,
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '580px',
};

export const section: CSSProperties = {
  padding: '0 48px',
};

// Typography
export const heading: CSSProperties = {
  fontSize: '28px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: colors.foreground,
  margin: '0 0 24px',
};

export const paragraph: CSSProperties = {
  fontSize: '16px',
  lineHeight: '1.5',
  color: colors.foreground,
  margin: '0 0 16px',
};

export const smallText: CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: colors.mutedForeground,
};

// Interactive
export const button: CSSProperties = {
  backgroundColor: colors.primary,
  borderRadius: '8px',
  color: colors.primaryForeground,
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'block',
  padding: '12px 24px',
  margin: '24px 0',
};

export const link: CSSProperties = {
  color: colors.primary,
  textDecoration: 'underline',
};

// Sections
export const footer: CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: colors.mutedForeground,
  marginTop: '32px',
  borderTop: `1px solid ${colors.border}`,
  paddingTop: '24px',
};

export const divider: CSSProperties = {
  borderTop: `1px solid ${colors.border}`,
  margin: '24px 0',
};

export const infoBox: CSSProperties = {
  backgroundColor: colors.background,
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '24px 0',
};

export const infoBoxLabel: CSSProperties = {
  fontSize: '12px',
  fontWeight: '600',
  color: colors.mutedForeground,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '0 0 4px',
};

export const infoBoxValue: CSSProperties = {
  fontSize: '18px',
  fontWeight: '600',
  color: colors.foreground,
  margin: '0',
};
