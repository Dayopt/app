'use client';

import type { ReactNode } from 'react';

import { Badge, Button, Skeleton } from '@dayopt/components';
import { Unplug } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SectionCard } from '@/components/ui/display/SectionCard';
import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ErrorState } from '@/components/ui/feedback/ErrorState';

export type McpConnectionRowViewProps = {
  clientLabel: string;
  /** 表示用に整形済みの scope 文言（生の scope 文字列ではない）。 */
  scopes: string[];
  connectedAtLabel: string;
  lastUsedAtLabel: string;
  /** この行自身が revoke 対象か。true の時だけボタンに「取り消し中」ラベルを出す。 */
  revoking: boolean;
  /**
   * ボタンをクリック不可にするか。revoking な行はもちろん、mutation / dialog を
   * 全行で共有しているため、他行が revoke 中の間もこちらを true にして再入を防ぐ。
   * revoking との違いはラベル表示の有無だけ（disabled は全行、revoking は対象行のみ）。
   */
  disabled: boolean;
  onRevoke: () => void;
};

type McpConnectionsSettingsViewProps = {
  loading: boolean;
  error: boolean;
  hasConnections: boolean;
  onRetry: () => void;
  children?: ReactNode;
};

/**
 * MCP connections（Claude / ChatGPT 等の OAuth client）一覧のセクションラッパー。
 * 行本体は `McpConnectionRowView`（children として渡す）。
 */
export function McpConnectionsSettingsView({
  loading,
  error,
  hasConnections,
  onRetry,
  children,
}: McpConnectionsSettingsViewProps) {
  const t = useTranslations('settings.integrations.mcpConnections');

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-4 text-sm">{t('description')}</p>

      {loading ? (
        <div className="space-y-3 py-4" aria-label={t('loading')}>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState title={t('loadError')} onRetry={onRetry} size="sm" />
      ) : hasConnections ? (
        <div className="divide-border divide-y">{children}</div>
      ) : (
        <EmptyState title={t('empty')} size="sm" />
      )}
    </SectionCard>
  );
}

/** 1 件の MCP connection 行。client 名 / 付与 scope / 接続日時 / 最終利用日時 / revoke 導線。 */
export function McpConnectionRowView({
  clientLabel,
  scopes,
  connectedAtLabel,
  lastUsedAtLabel,
  revoking,
  disabled,
  onRevoke,
}: McpConnectionRowViewProps) {
  const t = useTranslations('settings.integrations.mcpConnections');

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{clientLabel}</p>

        {scopes.length > 0 ? (
          <div className="mt-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t('scopesLabel')}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {scopes.map((scope) => (
                <Badge key={scope} variant="outline">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-muted-foreground mt-2 text-xs">
          {t('connectedAt', { value: connectedAtLabel })}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('lastUsedAt', { value: lastUsedAtLabel })}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        disabled={disabled}
        className="text-destructive shrink-0"
        aria-label={t('revokeAriaLabel', { client: clientLabel })}
      >
        <Unplug className="size-4" />
        {revoking ? t('revoking') : t('revoke')}
      </Button>
    </div>
  );
}
