'use client';

import { useState } from 'react';

import { LayoutTemplate } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
 * （空フォルダ病の予防）。実際の呼び出し位置（日ビューのどのメニューから
 * 開くか）は後続の実装 issue で確定する。ここでは「生きた日の組成を渡すと、
 * 名前を付けて保存できる」という入口そのものの見た目だけを確認する。
 */
export function SaveAsTemplateEntry({ dayBlocks, onSave, onCancel }: SaveAsTemplateEntryProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');

  if (!isOpen) {
    return (
      <Button variant="ghost" className="justify-start gap-2" onClick={() => setIsOpen(true)}>
        <LayoutTemplate className="size-4" />
        {t('calendar.templates.saveEntryLabel')}
      </Button>
    );
  }

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave?.(trimmed);
    setIsOpen(false);
    setName('');
  };

  return (
    <div className="border-border-subtle bg-card flex w-64 flex-col gap-3 rounded-lg border p-3 shadow-sm">
      <div className="h-40">
        <MiniDayPreview blocks={dayBlocks} />
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('calendar.templates.saveNamePlaceholder')}
        aria-label={t('calendar.templates.saveNamePlaceholder')}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') {
            setIsOpen(false);
            onCancel?.();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setIsOpen(false);
            onCancel?.();
          }}
        >
          {t('common.actions.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={name.trim().length === 0}>
          {t('common.actions.save')}
        </Button>
      </div>
    </div>
  );
}
