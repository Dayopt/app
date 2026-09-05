'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button, Input } from '@dayopt/components';

interface SaveAsTemplateHeaderProps {
  onSave: (name: string) => void;
  onCancel: () => void;
  /** 保存 mutation 実行中。二重送信を止める */
  isSaving?: boolean | undefined;
}

/**
 * 「この並びを型として保存」中のヘッダー中身（v1.0 §5.4）。
 *
 * ポップアップを開かず、ヘッダーが名前入力（左）＋保存 / キャンセル（右）へ入れ替わる。
 * メインはそのまま保存対象の日の盤面を表示し続ける——保存されるのはその日の盤面そのもの、
 * という関係を UI 上でも一致させるため、この component は `AppHeader` の中身だけを描く
 * （`AppHeader` 自体は `CalendarLayout` が 1 画面 1 つだけ描く。二重ヘッダーを作らない）。
 */
export function SaveAsTemplateHeader({ onSave, onCancel, isSaving }: SaveAsTemplateHeaderProps) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const handleSave = () => {
    if (!trimmed || isSaving) return;
    onSave(trimmed);
  };

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('calendar.templates.saveNamePlaceholder')}
        aria-label={t('calendar.templates.saveNamePlaceholder')}
        autoFocus
        className="w-48"
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleSave();
          if (event.key === 'Escape') onCancel();
        }}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('common.actions.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={trimmed.length === 0 || isSaving === true}>
          {t('common.actions.save')}
        </Button>
      </div>
    </div>
  );
}
