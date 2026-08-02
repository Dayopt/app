/**
 * Shared Email Styles
 * 全メールテンプレートで使用する共通スタイル定義
 *
 * メールクライアントは CSS変数(var(--xxx)) や OKLCH をサポートしないため、
 * packages/foundations/src/tokens/colors.css のセマンティックトークンを hex に変換して定義。
 *
 * トークンマッピング (tokens/colors.css :root → hex):
 *   --background    oklch(0.97 0.005 75)        → #f7f5f1
 *   --foreground    oklch(0.13 0 0)             → #070707
 *   --container     oklch(0.95 0.005 75)        → #f0eeeb
 *   --card          oklch(0.99 0.005 75)        → #fefbf8
 *   --primary       oklch(0.40 0.105 259.8145)  → #23467f
 *   --primary-fg    oklch(1 0 0)                → #ffffff
 *   --muted-fg      oklch(0.40 0 0)             → #484848
 *   --border        oklch(0.88 0.004 75)        → #d9d7d5
 *   --destructive   oklch(0.54 0.18 25)         → #c13234
 *   --success       oklch(0.50 0.15 150)        → #00792f
 *   --warning       oklch(0.55 0.16 70)         → #aa5b00
 *   --info          oklch(0.55 0.02 260)        → #6b727e
 *
 * この表は「トークンの現在値の換算結果」であって近似の目安ではない。
 * 値を変える時は oklch から換算し直す。過去にこの表が 1 世代前のトークンを
 * 指したまま放置されていた。
 *
 * --border はトークンが半透明（oklch(0 0 0 / 0.12)）でメールでは使えないため、
 * background 上に重ねた時の不透明相当色を置く。
 *
 * NOTE: apps/product/src/emails/styles.ts と同一の値を維持すること
 */

import type { CSSProperties } from 'react';

/**
 * カラートークン（tokens/colors.css セマンティックトークン準拠）
 *
 * メールはライトモード固定。ダークモード値は不要。
 */
export const colors = {
  /** --background: ページ背景 */
  background: '#f7f5f1',
  /** --foreground: 通常テキスト */
  foreground: '#070707',
  /** --container: セクション背景 */
  container: '#f0eeeb',
  /** --card: カード背景（メールではコンテナ面に対応） */
  card: '#fefbf8',
  /** --primary: 主要アクション */
  primary: '#23467f',
  /** --primary-foreground: Primary上のテキスト */
  primaryForeground: '#ffffff',
  /** --muted-foreground: 補助テキスト */
  mutedForeground: '#484848',
  /** --border: ボーダー（半透明トークンの不透明相当） */
  border: '#d9d7d5',
  /** --destructive: エラー・削除 */
  destructive: '#c13234',
  /** --success: 成功・完了 */
  success: '#00792f',
  /** --warning: 警告・注意 */
  warning: '#aa5b00',
  /** --info: 情報・ヒント */
  info: '#6b727e',
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
