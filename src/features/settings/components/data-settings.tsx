'use client';

import { useCallback, useRef, useState } from 'react';

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
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/platform/trpc';

import { InfoBox } from '@/components/common/InfoBox';
import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

type ExportFormat = 'json' | 'csv';
type ExportRange = 'all' | 'custom';

/**
 * データ管理設定コンポーネント
 *
 * エクスポート、バックアップ復元、MCP/API、データ削除
 */
export function DataSettings() {
  return (
    <div className="space-y-8">
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

      // TODO: CSV format + date range filtering
      const jsonString = JSON.stringify(result.data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dayopt-export-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(t('exportSuccess'));
    } catch {
      toast.error(t('exportFailed'));
    }
  }, [exportDataQuery, format, t]);

  const isExporting = exportDataQuery.isLoading || exportDataQuery.isFetching;

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-2 text-sm">{t('description')}</p>

      <div className="space-y-0">
        <LabeledRow label={t('format')}>
          <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
            <SelectTrigger variant="ghost">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">{t('formatJson')}</SelectItem>
              <SelectItem value="csv" disabled>
                {t('formatCsv')} ({t('csvComingSoon')})
              </SelectItem>
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
      </div>
    </SectionCard>
  );
}

// ─── Restore ─────────────────────────────────────────

function RestoreSection() {
  const t = useTranslations('settings.dataControls.restore');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <SectionCard title={t('title')}>
      <p className="text-muted-foreground mb-4 text-sm">{t('description')}</p>

      <div className="border-border flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8">
        <Upload className="text-muted-foreground mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">{t('dropzone')}</p>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" disabled />
        <Button
          variant="ghost"
          className="mt-4"
          disabled
          onClick={() => fileInputRef.current?.click()}
        >
          {t('selectFile')}
        </Button>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <AlertTriangle className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
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

  // TODO: Replace with actual Pro plan check
  const isPro = false;
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
        <p className="text-muted-foreground mb-4 text-sm">{t('description')}</p>
        <InfoBox>
          <div className="flex items-center gap-3">
            <Crown className="text-muted-foreground h-5 w-5 shrink-0" />
            <p className="text-foreground flex-1 text-sm">{t('proRequired')}</p>
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
      <p className="text-muted-foreground mb-2 text-sm">{t('description')}</p>

      <div className="space-y-0">
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
      </div>

      {/* Connection guide */}
      <InfoBox className="mt-4 p-3">
        <p className="text-muted-foreground text-sm">
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

function DeletionSection() {
  const t = useTranslations('settings.dataControls.deletion');

  // TODO: tRPC 実装後に確認ダイアログ付きの削除フローを有効化
  return (
    <SectionCard title={t('title')}>
      <div className="space-y-0">
        <LabeledRow label={t('deleteBlocks')} description={t('deleteBlocksDesc')}>
          <Button variant="outline" size="sm" disabled>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('deleteBlocks')}
          </Button>
        </LabeledRow>

        <LabeledRow label={t('deleteAllData')} description={t('deleteAllDataDesc')}>
          <Button variant="outline" size="sm" disabled>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('deleteAllData')}
          </Button>
        </LabeledRow>
      </div>
    </SectionCard>
  );
}
