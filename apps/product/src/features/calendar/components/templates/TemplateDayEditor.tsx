'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/shell/AppHeader';
import { Button } from '@dayopt/components';

import { MiniDayPreview } from './MiniDayPreview';
import type { TemplateBlockMock } from './types';

interface TemplateDayEditorProps {
  templateName: string;
  blocks: ReadonlyArray<TemplateBlockMock>;
  /** 上書き保存時に出す差分一行。null なら未保存（差分なし）の状態 */
  savedDiffSummary?: string | null | undefined;
  onSave?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
}

/**
 * 「型を一日として開く」編集ビュー（v1.0 §5.4）。
 *
 * ポップアップではなく、メインの表示領域そのものがその日（テンプレートの
 * 組成）の表示に置き換わる。ヘッダー右上に「上書き保存」「キャンセル」を
 * 常設し、ブロックの錨位置をずらす操作はいつもの日ビューのドラッグ操作
 * （本 component では静的表現のみ）で行う。専用エディタは作らない。
 *
 * この component は Storybook-only の骨格で、実際のドラッグ挙動・保存
 * mutation・既存 DayView / CalendarGridContent への実配線は本 issue の
 * 非 scope（後続の実装 issue）。上書き保存時の差分一行はヘッダー直下に
 * 一時的な行として表示する。実配線時は、この `AppHeader` が
 * `CalendarLayout.tsx` 側で描画中の通常ヘッダーと二重に出ないよう、
 * 1 画面 1 header の整合（通常ヘッダーの置き換え or 非表示化）を
 * 後続の実装 issue で確定する。
 */
export function TemplateDayEditor({
  templateName,
  blocks,
  savedDiffSummary = null,
  onSave,
  onCancel,
}: TemplateDayEditorProps) {
  const t = useTranslations();

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <AppHeader
        rightSlot={
          <>
            <Button variant="outline" onClick={() => onCancel?.()}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={() => onSave?.()}>{t('calendar.templates.overwriteSaveLabel')}</Button>
          </>
        }
      >
        <h2 className="text-foreground truncate text-sm font-medium">
          {t('calendar.templates.editingAsDay', { name: templateName })}
        </h2>
      </AppHeader>

      {savedDiffSummary && (
        <p className="text-muted-foreground border-border-subtle flex items-center gap-2 border-b px-4 py-2 text-xs">
          <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t('calendar.templates.diffSummaryPrefix')} {savedDiffSummary}
          </span>
        </p>
      )}

      <div className="min-h-0 flex-1 p-4">
        <MiniDayPreview blocks={blocks} />
      </div>
    </div>
  );
}
