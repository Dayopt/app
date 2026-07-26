'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import {
  canUseEntitlement,
  entitlementKeys,
  getPlanIdForSubscriptionStatus,
} from '@dayopt/billing';
import { Button as SharedButton } from '@dayopt/components';
import {
  AlertTriangle,
  Check,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Trash2,
  Unplug,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import { api } from '@/lib/trpc';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@dayopt/components';

import { LabeledRow } from '@/components/ui/display/LabeledRow';
import { SectionCard } from '@/components/ui/display/SectionCard';
import { InfoBox } from './InfoBox';

type ExportFormat = 'json' | 'csv';
type ExportRange = 'all' | 'custom';

const CSV_COLUMNS = [
  'kind',
  'id',
  'title',
  'note',
  'tag_id',
  'plan_id',
  'start_at',
  'end_at',
  'source',
  'skipped_at',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

/**
 * plans / recordsをCSV文字列に変換
 * RFC 4180準拠: ダブルクォートでフィールドをエスケープ
 */
function timeblockRowsToCsv(rows: Record<string, unknown>[]): string {
  const escapeCsvField = (value: unknown): string => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = CSV_COLUMNS.join(',');
  const csvRows = rows.map((row) => CSV_COLUMNS.map((col) => escapeCsvField(row[col])).join(','));
  return [header, ...csvRows].join('\n');
}

/**
 * データ管理設定コンポーネント
 *
 * エクスポート、バックアップ復元、MCP/API、データ削除
 */
export function DataSettings({ mcpServerUrl = null }: { mcpServerUrl?: string | null }) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <ExportSection />
      <RestoreSection />
      <McpApiSection mcpServerUrl={mcpServerUrl} />
      <DeletionSection />
    </div>
  );
}

// ─── Export ───────────────────────────────────────────

function ExportSection() {
  const t = useTranslations('settings.dataControls.export');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [range, setRange] = useState<ExportRange>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const exportDataQuery = api.user.exportData.useQuery(undefined, {
    enabled: false,
  });

  const handleExport = useCallback(async () => {
    try {
      const result = await exportDataQuery.refetch();
      if (!result.data) throw new Error('Export failed');

      const exportData = result.data;

      // 日付範囲フィルタリング
      if (range === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        exportData.data.plans = exportData.data.plans.filter((plan) => {
          const planDate = new Date(plan.start_at);
          return planDate >= start && planDate <= end;
        });
        exportData.data.records = exportData.data.records.filter((record) => {
          const recordDate = new Date(record.start_at);
          return recordDate >= start && recordDate <= end;
        });
      }

      let blob: Blob;
      let mimeType: string;

      if (format === 'csv') {
        const csvRows = [
          ...exportData.data.plans.map((plan) => ({ ...plan, kind: 'plan' })),
          ...exportData.data.records.map((record) => ({ ...record, kind: 'record' })),
        ];
        const csvContent = timeblockRowsToCsv(csvRows);
        blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        mimeType = 'csv';
      } else {
        const jsonString = JSON.stringify(exportData, null, 2);
        blob = new Blob([jsonString], { type: 'application/json' });
        mimeType = 'json';
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dayopt-export-${Date.now()}.${mimeType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(t('exportSuccess'));
    } catch {
      toast.error(t('exportFailed'));
    }
  }, [exportDataQuery, format, range, startDate, endDate, t]);

  const isExporting = exportDataQuery.isLoading || exportDataQuery.isFetching;

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-2 text-base md:text-sm">{t('description')}</p>
      <LabeledRow label={t('format')}>
        <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <SelectTrigger variant="ghost">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">{t('formatJson')}</SelectItem>
            <SelectItem value="csv">{t('formatCsv')}</SelectItem>
          </SelectContent>
        </Select>
      </LabeledRow>
      <LabeledRow label={t('range')}>
        <Select value={range} onValueChange={(v) => setRange(v as ExportRange)}>
          <SelectTrigger variant="ghost">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rangeAll')}</SelectItem>
            <SelectItem value="custom">{t('rangeCustom')}</SelectItem>
          </SelectContent>
        </Select>
      </LabeledRow>
      {range === 'custom' && (
        <LabeledRow label={t('startDate')}>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-32 sm:w-36"
              aria-label={t('startDate')}
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-32 sm:w-36"
              aria-label={t('endDate')}
            />
          </div>
        </LabeledRow>
      )}
      <LabeledRow label={t('exportButton')}>
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? t('exporting') : t('exportButton')}
        </Button>
      </LabeledRow>
    </SectionCard>
  );
}

// ─── Restore ─────────────────────────────────────────

function RestoreSection() {
  const t = useTranslations('settings.dataControls.restore');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-4 text-base md:text-sm">{t('description')}</p>

      <div className="border-border flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8">
        <Upload className="text-muted-foreground mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-base md:text-sm">{t('dropzone')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          disabled
          aria-hidden="true"
        />
        <SharedButton
          variant="ghost"
          className="mt-4"
          disabled
          onClick={() => fileInputRef.current?.click()}
        >
          {t('selectFile')}
        </SharedButton>
      </div>

      <div className="mt-4 flex items-start gap-2">
        <AlertTriangle className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
        <p className="text-muted-foreground text-xs">{t('warning')}</p>
      </div>

      <p className="text-muted-foreground mt-2 text-xs italic">{t('comingSoon')}</p>
    </SectionCard>
  );
}

// ─── MCP / API ───────────────────────────────────────

const MCP_CLIENT_NAMES: Readonly<Record<string, string>> = {
  'claude-ai': 'Claude',
  chatgpt: 'ChatGPT',
  cursor: 'Cursor',
};

const OAUTH_SCOPE_LABEL_KEYS = {
  'read:entries': 'scope.readEntries',
  'read:tags': 'scope.readTags',
  'read:constraints': 'scope.readConstraints',
  'read:stats': 'scope.readStats',
  'write:plans': 'scope.writePlans',
  'delete:plans': 'scope.deletePlans',
  'write:records': 'scope.writeRecords',
  'delete:records': 'scope.deleteRecords',
} as const;

interface PendingConnectionRevoke {
  id: string;
  clientName: string;
}

export function McpApiSection({ mcpServerUrl }: { mcpServerUrl: string | null }) {
  const t = useTranslations('settings.dataControls.mcp');
  const [copied, setCopied] = useState<'url' | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<PendingConnectionRevoke | null>(null);
  const utils = api.useUtils();

  // Pro判定: billing overview の subscription status から判定
  const billingOverview = api.billing.getOverview.useQuery(undefined, { retry: false });
  const connections = api.user.listOAuthConnections.useQuery();
  const revokeConnection = api.user.revokeOAuthConnection.useMutation({
    onSuccess: async () => {
      await utils.user.listOAuthConnections.invalidate();
      toast.success(t('disconnectSuccess'));
      setPendingRevoke(null);
    },
    onError: () => {
      toast.error(t('disconnectFailed'));
    },
  });
  const subStatus = billingOverview.data?.billingInfo.subscriptionStatus;
  const currentPlan = getPlanIdForSubscriptionStatus(subStatus);
  const canAccessPro = canUseEntitlement(currentPlan, entitlementKeys.proAccess);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  const handleCopy = useCallback(
    (text: string, type: 'url') => {
      navigator.clipboard.writeText(text);
      setCopied(type);
      toast.success(t('copied'));
      setTimeout(() => setCopied(null), 2000);
    },
    [t],
  );

  const handleDisconnect = useCallback(async () => {
    if (!pendingRevoke) return;
    await revokeConnection.mutateAsync({ connectionId: pendingRevoke.id });
  }, [pendingRevoke, revokeConnection]);

  const scopeLabel = (scope: string) => {
    const key = OAUTH_SCOPE_LABEL_KEYS[scope as keyof typeof OAUTH_SCOPE_LABEL_KEYS];
    return key ? t(key) : scope;
  };

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-2 text-base md:text-sm">{t('description')}</p>

      <div className="border-border mt-5 border-t pt-5">
        <h3 className="text-foreground text-sm font-medium">{t('connectedApps')}</h3>
        {connections.isLoading ? (
          <p className="text-muted-foreground mt-3 text-sm" role="status">
            {t('loadingConnections')}
          </p>
        ) : connections.isError ? (
          <div className="mt-3 flex items-center justify-between gap-3" role="alert">
            <p className="text-muted-foreground text-sm">{t('loadConnectionsFailed')}</p>
            <Button variant="outline" size="sm" onClick={() => connections.refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : connections.data?.length ? (
          <ul className="mt-3 space-y-3">
            {connections.data.map((connection) => {
              const clientName = MCP_CLIENT_NAMES[connection.clientId] ?? connection.clientId;
              return (
                <li
                  key={connection.id}
                  className="border-border flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <p className="text-foreground text-sm font-medium">{clientName}</p>
                    <div>
                      <p className="text-muted-foreground text-xs">{t('grantedAccess')}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {connection.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs"
                          >
                            {scopeLabel(scope)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-muted-foreground space-y-0.5 text-xs">
                      <p>
                        {t('authorizedOn', {
                          date: dateFormatter.format(new Date(connection.authorizedAt)),
                        })}
                      </p>
                      <p>
                        {connection.lastUsedAt
                          ? t('lastUsed', {
                              date: dateFormatter.format(new Date(connection.lastUsedAt)),
                            })
                          : t('lastUsedNever')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revokeConnection.isPending}
                    onClick={() => setPendingRevoke({ id: connection.id, clientName })}
                  >
                    <Unplug className="mr-2 h-4 w-4" />
                    {t('disconnect')}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">{t('noConnections')}</p>
        )}
      </div>

      {(mcpServerUrl || !canAccessPro) && (
        <div className="border-border mt-5 border-t pt-5">
          {canAccessPro && mcpServerUrl ? (
            <>
              <LabeledRow label={t('serverUrl')}>
                <div className="flex items-center gap-2">
                  <code className="text-muted-foreground font-mono text-sm">{mcpServerUrl}</code>
                  <CopyButton
                    copied={copied === 'url'}
                    onClick={() => handleCopy(mcpServerUrl, 'url')}
                    label={t('copyUrl')}
                  />
                </div>
              </LabeledRow>
              <InfoBox className="mt-4 p-4">
                <p className="text-muted-foreground text-base md:text-sm">
                  {t('connectionGuide')}
                  <a
                    href="#"
                    className="text-muted-foreground hover:text-foreground ml-1 inline-flex items-center gap-1 underline transition-colors"
                  >
                    {t('viewDocs')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </InfoBox>
            </>
          ) : (
            <InfoBox>
              <div className="flex items-center gap-2">
                <Crown className="text-muted-foreground h-5 w-5 shrink-0" />
                <p className="text-foreground flex-1 text-base md:text-sm">{t('proRequired')}</p>
                <Button variant="outline" size="sm" disabled>
                  {t('upgrade')}
                </Button>
              </div>
            </InfoBox>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        onConfirm={handleDisconnect}
        title={t('disconnectTitle')}
        description={t('disconnectDescription', {
          clientName: pendingRevoke?.clientName ?? '',
        })}
        variant="destructive"
        icon={Unplug}
        confirmLabel={t('disconnect')}
        loadingLabel={t('disconnecting')}
      />
    </SectionCard>
  );
}

function CopyButton({
  copied,
  onClick,
  label,
}: {
  copied: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClick} aria-label={label}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

// ─── Deletion ────────────────────────────────────────

type DeletionTarget =
  { kind: 'blocks' } | { expectedGeneration: number; kind: 'all'; operationId: string } | null;

function DeletionSection() {
  const t = useTranslations('settings.dataControls.deletion');
  const [target, setTarget] = useState<DeletionTarget>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const keyword = t('confirmKeyword');
  const isConfirmed = confirmInput === keyword;

  const deleteBlocksMutation = api.user.deleteBlocks.useMutation({
    onSuccess: (data) => {
      toast.success(t('deleteBlocks') + ` (${data.deletedCount})`);
      setTarget(null);
      setConfirmInput('');
    },
    onError: () => {
      toast.error(t('deleteBlocks'));
    },
  });

  const deleteAllDataMutation = api.user.deleteAllData.useMutation({
    onSuccess: () => {
      toast.success(t('deleteAllData'));
      setTarget(null);
      setConfirmInput('');
    },
    onError: () => {
      toast.error(t('deleteAllData'));
    },
  });

  const prepareDeleteAllDataMutation = api.user.prepareDeleteAllData.useMutation({
    onError: () => {
      toast.error(t('deleteAllData'));
    },
  });

  const handleOpenDeleteAll = useCallback(async () => {
    try {
      const preflight = await prepareDeleteAllDataMutation.mutateAsync();
      setTarget({
        expectedGeneration: preflight.expectedGeneration,
        kind: 'all',
        operationId: preflight.operationId,
      });
    } catch {
      // Mutation-level and global handlers own the user-visible error and telemetry.
    }
  }, [prepareDeleteAllDataMutation]);

  const handleConfirm = useCallback(async () => {
    if (!isConfirmed) return;
    if (target?.kind === 'blocks') {
      await deleteBlocksMutation.mutateAsync({ confirmText: 'DELETE' });
    } else if (target?.kind === 'all') {
      await deleteAllDataMutation.mutateAsync({
        confirmText: 'DELETE',
        expectedGeneration: target.expectedGeneration,
        operationId: target.operationId,
      });
    }
  }, [target, isConfirmed, deleteBlocksMutation, deleteAllDataMutation]);

  const handleClose = useCallback(() => {
    setTarget(null);
    setConfirmInput('');
  }, []);

  return (
    <SectionCard title={t('title')}>
      <LabeledRow label={t('deleteBlocks')} description={t('deleteBlocksDesc')}>
        <Button variant="outline" size="sm" onClick={() => setTarget({ kind: 'blocks' })}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('deleteBlocks')}
        </Button>
      </LabeledRow>
      <LabeledRow label={t('deleteAllData')} description={t('deleteAllDataDesc')}>
        <Button
          variant="outline"
          size="sm"
          disabled={prepareDeleteAllDataMutation.isPending}
          onClick={() => void handleOpenDeleteAll()}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('deleteAllData')}
        </Button>
      </LabeledRow>

      <ConfirmDialog
        open={target !== null}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={t('confirmTitle')}
        description={target?.kind === 'blocks' ? t('confirmDeleteBlocks') : t('confirmDeleteAll')}
        variant="destructive"
        confirmDisabled={!isConfirmed}
        loadingLabel={t('deleting')}
      >
        <div className="space-y-2">
          <p className="text-muted-foreground text-base md:text-sm">
            {t('typeToConfirm', { keyword })}
          </p>
          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={keyword}
            aria-label={t('typeToConfirm', { keyword })}
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </SectionCard>
  );
}
