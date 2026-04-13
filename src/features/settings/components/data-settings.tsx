'use client';

import { useCallback, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import {
  AlertTriangle,
  Check,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Key,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { Input } from '@/lib/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/components/ui/select';
import { api } from '@/lib/trpc';

import { LabeledRow } from '@/lib/components/common/LabeledRow';
import { SectionCard } from '@/lib/components/common/SectionCard';
import { InfoBox } from './InfoBox';

type ExportFormat = 'json' | 'csv';
type ExportRange = 'all' | 'custom';

const CSV_COLUMNS = [
  'id',
  'title',
  'description',
  'origin',
  'start_time',
  'end_time',
  'actual_start_time',
  'actual_end_time',
  'duration_minutes',
  'fulfillment_score',
  'created_at',
] as const;

/**
 * entriesをCSV文字列に変換
 * RFC 4180準拠: ダブルクォートでフィールドをエスケープ
 */
function entriesToCsv(entries: Record<string, unknown>[]): string {
  const escapeCsvField = (value: unknown): string => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = CSV_COLUMNS.join(',');
  const rows = entries.map((entry) =>
    CSV_COLUMNS.map((col) => escapeCsvField(entry[col])).join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * データ管理設定コンポーネント
 *
 * エクスポート、バックアップ復元、MCP/API、データ削除
 */
export function DataSettings() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <ExportSection />
      <RestoreSection />
      <McpApiSection />
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

        exportData.data.entries = exportData.data.entries.filter((entry) => {
          const entryDate = new Date(entry.start_time ?? entry.created_at ?? '');
          return entryDate >= start && entryDate <= end;
        });
      }

      let blob: Blob;
      let mimeType: string;

      if (format === 'csv') {
        const csvContent = entriesToCsv(exportData.data.entries);
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
        <Button
          variant="ghost"
          className="mt-4"
          disabled
          onClick={() => fileInputRef.current?.click()}
        >
          {t('selectFile')}
        </Button>
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

function McpApiSection() {
  const t = useTranslations('settings.dataControls.mcp');
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);

  // Pro判定: billing overview の subscription status から判定
  const billingOverview = api.billing.getOverview.useQuery(undefined, { retry: false });
  const subStatus = billingOverview.data?.billingInfo.subscriptionStatus;
  const isPro = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due';
  // TODO: Replace with actual API key from backend
  const apiKey: string | null = null;

  const mcpServerUrl = 'https://mcp.dayopt.com/v1/sse';

  const handleCopy = useCallback(
    (text: string, type: 'url' | 'key') => {
      navigator.clipboard.writeText(text);
      setCopied(type);
      toast.success(t('copied'));
      setTimeout(() => setCopied(null), 2000);
    },
    [t],
  );

  if (!isPro) {
    return (
      <SectionCard title={t('title')}>
        <p className="text-muted-foreground mb-4 text-base md:text-sm">{t('description')}</p>
        <InfoBox>
          <div className="flex items-center gap-2">
            <Crown className="text-muted-foreground h-5 w-5 shrink-0" />
            <p className="text-foreground flex-1 text-base md:text-sm">{t('proRequired')}</p>
            <Button variant="outline" size="sm" disabled>
              {t('upgrade')}
            </Button>
          </div>
        </InfoBox>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-2 text-base md:text-sm">{t('description')}</p>
      {/* Server URL */}
      <LabeledRow label={t('serverUrl')}>
        <div className="flex items-center gap-2">
          <code className="text-muted-foreground font-mono text-sm">{mcpServerUrl}</code>
          <CopyButton
            copied={copied === 'url'}
            onClick={() => handleCopy(mcpServerUrl, 'url')}
            label="Copy URL"
          />
        </div>
      </LabeledRow>
      {/* API Key */}
      <LabeledRow label={t('apiKey')}>
        {apiKey ? (
          <div className="flex items-center gap-2">
            <code className="text-muted-foreground font-mono text-sm">{apiKey}</code>
            <CopyButton
              copied={copied === 'key'}
              onClick={() => handleCopy(apiKey, 'key')}
              label="Copy API key"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={t('regenerateKey')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm">
            <Key className="mr-2 h-4 w-4" />
            {t('generateKey')}
          </Button>
        )}
      </LabeledRow>

      {/* Connection guide */}
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

type DeletionTarget = 'blocks' | 'all' | null;

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

  const handleConfirm = useCallback(async () => {
    if (!isConfirmed) return;
    if (target === 'blocks') {
      await deleteBlocksMutation.mutateAsync({ confirmText: 'DELETE' });
    } else if (target === 'all') {
      await deleteAllDataMutation.mutateAsync({ confirmText: 'DELETE' });
    }
  }, [target, isConfirmed, deleteBlocksMutation, deleteAllDataMutation]);

  const handleClose = useCallback(() => {
    setTarget(null);
    setConfirmInput('');
  }, []);

  return (
    <SectionCard title={t('title')}>
      <LabeledRow label={t('deleteBlocks')} description={t('deleteBlocksDesc')}>
        <Button variant="outline" size="sm" onClick={() => setTarget('blocks')}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('deleteBlocks')}
        </Button>
      </LabeledRow>
      <LabeledRow label={t('deleteAllData')} description={t('deleteAllDataDesc')}>
        <Button variant="outline" size="sm" onClick={() => setTarget('all')}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('deleteAllData')}
        </Button>
      </LabeledRow>

      <ConfirmDialog
        open={target !== null}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={t('confirmTitle')}
        description={target === 'blocks' ? t('confirmDeleteBlocks') : t('confirmDeleteAll')}
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
