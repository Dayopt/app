'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MiniDayPreview } from './MiniDayPreview';
import type { TemplateBlockMock } from './types';

interface TemplateDayEditorProps {
  templateName: string;
  blocks: ReadonlyArray<TemplateBlockMock>;
  /** 上書き保存時に出す差分一行。null なら未保存（差分なし）の状態 */
  savedDiffSummary?: string | null | undefined;
}

/**
 * 「型を一日として開く」編集ビュー（v1.0 §5.4）。
 *
 * 専用エディタは持たない——いつもの日ビュー操作で編集し、上書き保存時に
 * 差分一行だけを見せる。この component は Storybook-only の骨格で、
 * 実際の日ビュー編集操作（ブロック移動・追加・削除）は既存の DayView /
 * CalendarGridContent が担うため、ここでは「型を開いた時の見出し」と
 * 「保存後の差分一行」の見た目だけを確認する（実際の編集操作の配線は
 * 後続の実装 issue）。
 */
export function TemplateDayEditor({
  templateName,
  blocks,
  savedDiffSummary = null,
}: TemplateDayEditorProps) {
  const t = useTranslations();

  return (
    <div className="border-border-subtle bg-card flex w-72 flex-col gap-3 rounded-lg border p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-sm font-medium">
          {t('calendar.templates.editingAsDay', { name: templateName })}
        </h2>
      </div>

      <div className="h-64">
        <MiniDayPreview blocks={blocks} />
      </div>

      {savedDiffSummary && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t('calendar.templates.diffSummaryPrefix')} {savedDiffSummary}
          </span>
        </p>
      )}
    </div>
  );
}
