'use client';

import { memo, useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { Download, FileJson, History, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/platform/trpc';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

/** データエクスポート設定コンポーネント。JSONダウンロード・自動バックアップのUI */
export const DataExportSettings = memo(function DataExportSettings() {
  const t = useTranslations();
  const [autoBackup, setAutoBackup] = useState(true);

  const exportDataQuery = api.user.exportData.useQuery(undefined, {
    enabled: false, // 手動で実行
  });

  const handleExport = useCallback(async () => {
    try {
      const result = await exportDataQuery.refetch();

      if (!result.data) {
        throw new Error('Export failed');
      }

      // JSONデータをダウンロード
      const jsonString = JSON.stringify(result.data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dayopt-data-export-${result.data.userId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(t('settings.account.dataExport.success'));
    } catch {
      toast.error(t('settings.account.dataExport.error'));
    }
  }, [exportDataQuery, t]);

  const handleAutoBackupChange = useCallback((checked: boolean) => {
    setAutoBackup(checked);
  }, []);

  return (
    <div className="space-y-8">
      {/* データエクスポート */}
      <SectionCard title={t('settings.dataControls.export.title')}>
        <div className="space-y-4">
          {/* エクスポート対象の説明 */}
          <div className="bg-card border-border-subtle rounded-lg border p-4 shadow-sm">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-normal">
              <FileJson className="h-4 w-4" />
              {t('settings.dataControls.export.includedDataTitle')}
            </h4>
            <ul className="text-muted-foreground grid list-inside list-disc grid-cols-2 gap-1 text-sm">
              <li>{t('settings.dataControls.export.profileInfo')}</li>
              <li>{t('settings.dataControls.export.tasksEvents')}</li>
              <li>{t('settings.dataControls.export.tagSettings')}</li>
              <li>{t('settings.dataControls.export.calendarSettings')}</li>
              <li>{t('settings.dataControls.export.notificationSettings')}</li>
              <li>{t('settings.dataControls.export.otherSettings')}</li>
            </ul>
          </div>

          {/* エクスポートボタン */}
          <Button
            onClick={handleExport}
            disabled={exportDataQuery.isLoading || exportDataQuery.isFetching}
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            {exportDataQuery.isLoading || exportDataQuery.isFetching
              ? t('settings.dataControls.export.exporting')
              : t('settings.dataControls.export.exportButton')}
          </Button>
        </div>
      </SectionCard>

      {/* データインポート */}
      <SectionCard title={t('settings.dataControls.import.title')}>
        <div className="space-y-4">
          <div className="border-border flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8">
            <Upload className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">
              {t('settings.dataControls.import.dropzone')}
            </p>
            <Button variant="ghost" className="mt-4" disabled>
              {t('settings.dataControls.import.selectFile')}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('settings.dataControls.import.comingSoon')}
          </p>
        </div>
      </SectionCard>

      {/* 自動バックアップ */}
      <SectionCard title={t('settings.dataControls.backup.title')}>
        <LabeledRow label={t('settings.dataControls.backup.enableLabel')}>
          <Switch checked={autoBackup} onCheckedChange={handleAutoBackupChange} disabled />
        </LabeledRow>
        {autoBackup && (
          <div className="bg-card border-border-subtle mt-4 rounded-lg border p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="text-muted-foreground h-4 w-4" />
              <span className="text-sm">{t('settings.dataControls.backup.lastBackup')}</span>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
});
