'use client';

import { useState } from 'react';

import { LayoutTemplate } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/shell/AppHeader';
import { Button, Input } from '@dayopt/components';

import { MiniDayPreview } from './MiniDayPreview';
import type { TemplateBlockMock } from './types';

interface SaveAsTemplateEntryProps {
  /** 保存対象となる「生きた日」の組成（このコンポーネント自身は日を編集しない） */
  dayBlocks: ReadonlyArray<TemplateBlockMock>;
  onSave?: ((name: string) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

/**
 * 「この並びを型として保存」の入口（v1.0 §5.4）。
 *
 * 作成は常に生きた日からのみ行う。白紙から型を設計させる導線は持たない
 * （空フォルダ病の予防）。トリガーを押すとポップアップは開かず、
 * ヘッダー表示が名前入力（左）＋保存/キャンセル（右）へ入れ替わり、
 * メインはそのまま「保存対象の日の盤面」を表示し続ける——保存されるのは
 * その日の盤面そのもの、という関係を UI 上でも一致させる。
 *
 * 実際の呼び出し位置（日ビューのどのメニューから開くか）・保存 mutation は
 * 後続の実装 issue で確定する。
 */
export function SaveAsTemplateEntry({ dayBlocks, onSave, onCancel }: SaveAsTemplateEntryProps) {
  const t = useTranslations();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');

  if (!isEditing) {
    return (
      <Button variant="ghost" className="justify-start gap-2" onClick={() => setIsEditing(true)}>
        <LayoutTemplate className="size-4" />
        {t('calendar.templates.saveEntryLabel')}
      </Button>
    );
  }

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave?.(trimmed);
    setIsEditing(false);
    setName('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName('');
    onCancel?.();
  };

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <AppHeader
        leftSlot={
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('calendar.templates.saveNamePlaceholder')}
            aria-label={t('calendar.templates.saveNamePlaceholder')}
            autoFocus
            className="w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        }
        rightSlot={
          <>
            <Button variant="outline" onClick={handleCancel}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={name.trim().length === 0}>
              {t('common.actions.save')}
            </Button>
          </>
        }
      >
        {null}
      </AppHeader>

      <div className="min-h-0 flex-1 p-4">
        <MiniDayPreview blocks={dayBlocks} />
      </div>
    </div>
  );
}
