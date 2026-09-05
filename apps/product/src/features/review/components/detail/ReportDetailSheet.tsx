'use client';

import { useTranslations } from 'next-intl';

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@dayopt/components';

import { ReportDetailBody } from './ReportDetailBody';

import type { ReportDetailBodyProps } from './ReportDetailBody';

type ReportDetailSheetProps = Omit<ReportDetailBodyProps, 'showTrend'> & {
  open: boolean;
};

/**
 * アクティビティ詳細のボトムシート（モバイルの器）。
 *
 * 中身はデスクトップのパネルと同じ `ReportDetailBody`。**週別の推移だけ出さない**
 * （狭い面で 6 本の棒は読めない。仕様 §8）。出さないぶんは取得側でも
 * `includeTrend: false` にして、運ばない。
 *
 * shell の DOM slot は使わない。モバイルの shell は 4 カラム目を持たないので、
 * `Drawer` が自前で器になる。
 */
export function ReportDetailSheet({ open, onClose, ...body }: ReportDetailSheetProps) {
  const t = useTranslations('report.detail');

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent data-report-sheet="detail">
        {/* Drawer は見出しと説明を要求する（読み上げのため）。見た目のヘッダーは本文が持つ */}
        <DrawerTitle className="sr-only">{t('ariaLabel')}</DrawerTitle>
        <DrawerDescription className="sr-only">{t('ariaLabel')}</DrawerDescription>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <ReportDetailBody {...body} onClose={onClose} showTrend={false} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
