'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import { toast } from '@/lib/toast';
import { api, type AppRouter } from '@/lib/trpc';

import { McpConnectionRowView, McpConnectionsSettingsView } from './McpConnectionsSettingsView';

// router の戻り値から推論する。手書きの型 + `as` cast にすると、server 側の shape が
// 変わっても型エラーにならず UI が黙って古い前提のまま動く。
type McpConnectionSummary = inferRouterOutputs<AppRouter>['mcpConnections']['list'][number];

export function McpConnectionsSettings() {
  const t = useTranslations('settings.integrations.mcpConnections');
  const utils = api.useUtils();
  const connections = api.mcpConnections.list.useQuery(undefined, {
    retry: false,
    refetchOnMount: 'always',
  });

  const rows = connections.data ?? [];

  // dialog と mutation は行数分ではなく 1 つだけ mount する（#1909: N 行 = N ConfirmDialog +
  // N useMutation の解消）。「どの connection を対象にしているか」(revokeTarget) と「dialog が
  // 開いているか」(revokeOpen) は別 state に分ける。
  //
  // revokeTarget は close 時（cancel・success のどちらでも）に意図的に null へ戻さない。
  // ConfirmDialog の AlertDialogContent は Radix Presence の仕組みで、open が false になった
  // 瞬間ではなく data-[state=closed] の exit animation（fade-out + zoom-out、
  // packages/components/src/overlays/alert-dialog.tsx）が終わるまでマウントされ続ける。
  // close と同時に revokeTarget も消すと、そのフェードアウトの間タイトル/説明が空の
  // client 名（「」）で再描画されてしまう。revokeTarget は「次にどの行を開くか」で
  // 上書きされるだけにし、表示中の対象名はフェードアウトが終わるまで正しい値を保つ。
  const [revokeTarget, setRevokeTarget] = useState<McpConnectionSummary | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const revoke = api.mcpConnections.revoke.useMutation({
    retry: false,
    onMutate: async () => {
      // 破壊操作は楽観的に消さない。進行中の一覧 fetch だけ止め、settled 後に server を正とする。
      await utils.mcpConnections.list.cancel();
    },
    onSuccess: () => {
      setRevokeOpen(false);
      toast.success(t('revokeSuccess'));
    },
    onError: () => toast.error(t('revokeFailed')),
    onSettled: async () => {
      await utils.mcpConnections.list.invalidate();
    },
  });

  const revokeTargetLabel = revokeTarget ? clientLabelFor(t, revokeTarget.client_id) : '';

  return (
    <>
      <McpConnectionsSettingsView
        loading={connections.isLoading}
        error={connections.isError}
        hasConnections={rows.length > 0}
        onRetry={() => void connections.refetch()}
      >
        {rows.map((connection) => (
          <McpConnectionRow
            key={connection.id}
            connection={connection}
            revoking={revoke.isPending && revokeTarget?.id === connection.id}
            onRevoke={() => {
              setRevokeTarget(connection);
              setRevokeOpen(true);
            }}
          />
        ))}
      </McpConnectionsSettingsView>
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={async () => {
          if (!revokeTarget) return;
          await revoke.mutateAsync({ connectionId: revokeTarget.id }).catch(() => undefined);
        }}
        title={t('revokeDialog.title', { client: revokeTargetLabel })}
        description={t('revokeDialog.description', { client: revokeTargetLabel })}
        confirmLabel={t('revoke')}
        loadingLabel={t('revoking')}
        variant="destructive"
      />
    </>
  );
}

function McpConnectionRow({
  connection,
  revoking,
  onRevoke,
}: {
  connection: McpConnectionSummary;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('settings.integrations.mcpConnections');
  const clientLabel = clientLabelFor(t, connection.client_id);

  return (
    <McpConnectionRowView
      clientLabel={clientLabel}
      scopes={connection.scopes.map((scope) => scopeLabelFor(t, scope))}
      connectedAtLabel={formatConnectionDate(connection.authorized_at, locale)}
      lastUsedAtLabel={
        connection.last_used_at
          ? formatConnectionDate(connection.last_used_at, locale)
          : t('neverUsed')
      }
      revoking={revoking}
      onRevoke={onRevoke}
    />
  );
}

/** DB CHECK 制約上は 4 値のみだが型は `string`（生成型が narrow しない）。未知値は unknown 扱い。 */
function clientLabelFor(t: ReturnType<typeof useTranslations>, clientId: string): string {
  switch (clientId) {
    case 'claude-ai':
      return t('clients.claudeAi');
    case 'chatgpt':
      return t('clients.chatgpt');
    case 'cursor':
      return t('clients.cursor');
    default:
      return t('clients.unknown');
  }
}

/**
 * scope 文字列を利用者向けの説明へ変換する。未知の scope は生値のまま出す
 * （将来 scope が増えた時に、翻訳漏れで情報が消えるより生値が見える方が安全）。
 */
function scopeLabelFor(t: ReturnType<typeof useTranslations>, scope: string): string {
  switch (scope) {
    case 'read:entries':
      return t('scopes.readEntries');
    case 'read:tags':
      return t('scopes.readTags');
    case 'read:constraints':
      return t('scopes.readConstraints');
    case 'read:stats':
      return t('scopes.readStats');
    case 'write:plans':
      return t('scopes.writePlans');
    case 'delete:plans':
      return t('scopes.deletePlans');
    case 'write:records':
      return t('scopes.writeRecords');
    case 'delete:records':
      return t('scopes.deleteRecords');
    default:
      return scope;
  }
}

function formatConnectionDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
