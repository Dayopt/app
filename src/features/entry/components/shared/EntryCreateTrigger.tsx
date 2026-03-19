'use client';

import { cloneElement, isValidElement, useCallback, type ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { useEntryCreate } from '../../hooks/useEntryCreate';

interface EntryCreateTriggerProps {
  triggerElement: ReactNode;
  onSuccess?: () => void;
  /** 初期日付 */
  initialDate?: Date;
}

/** 任意のトリガー要素にエントリ作成フローを付与するコンポーネント（空きスロット検索→作成→Inspectorオープン） */
export function EntryCreateTrigger({
  triggerElement,
  onSuccess,
  initialDate,
}: EntryCreateTriggerProps) {
  const t = useTranslations();
  const { create } = useEntryCreate({ onSuccess });

  const handleClick = useCallback(async () => {
    await create(initialDate);
  }, [create, initialDate]);

  // triggerElementにonClickを追加
  if (isValidElement(triggerElement)) {
    return cloneElement(triggerElement as React.ReactElement<{ onClick?: () => void }>, {
      onClick: handleClick,
    });
  }

  // フォールバック: buttonでラップ（アクセシビリティ対応）
  return (
    <button
      type="button"
      onClick={handleClick}
      className="focus-visible:outline-ring inline-flex cursor-pointer appearance-none items-center justify-center border-none bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={t('common.createNewEvent')}
    >
      {triggerElement}
    </button>
  );
}
