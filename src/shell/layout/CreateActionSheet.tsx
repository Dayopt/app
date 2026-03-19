'use client';

import { useState } from 'react';

import { Calendar, CheckSquare } from 'lucide-react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export type CreateActionType = 'plan' | 'record';

interface CreateActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: CreateActionType) => void;
}

/**
 * FABタップ時に表示する作成アクションシート
 *
 * 選択肢:
 * - Plan: 予定を追加
 * - Record: 実績を記録
 *
 * Material Design 3のBottom Sheet / Action Sheetパターンに準拠
 */
export function CreateActionSheet({ open, onOpenChange, onSelect }: CreateActionSheetProps) {
  const t = useTranslations();

  const actions = [
    {
      id: 'plan' as const,
      label: t('common.createSheet.plan'),
      description: t('common.createSheet.planDescription'),
      icon: Calendar,
      color: 'text-primary',
      bgColor: 'bg-muted',
    },
    {
      id: 'record' as const,
      label: t('common.createSheet.record'),
      description: t('common.createSheet.recordDescription'),
      icon: CheckSquare,
      color: 'text-success',
      bgColor: 'bg-muted',
    },
  ];

  const handleSelect = (type: CreateActionType) => {
    onSelect(type);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-safe-area-inset-bottom">
        <DrawerHeader className="text-center">
          <DrawerTitle>{t('common.createSheet.title')}</DrawerTitle>
          <DrawerDescription>{t('common.createSheet.description')}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-2 px-4 pb-6">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleSelect(action.id)}
                aria-label={action.label}
                className={cn(
                  'flex items-center gap-4 rounded-2xl p-4',
                  'bg-card hover:bg-state-hover',
                  'border-border border',
                  'text-left transition-colors',
                  'active:scale-[0.98]',
                )}
              >
                <div
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full',
                    action.bgColor,
                  )}
                >
                  <Icon className={cn('size-6', action.color)} />
                </div>
                <div className="flex-1">
                  <p className="text-foreground font-normal">{action.label}</p>
                  <p className="text-muted-foreground text-sm">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * CreateActionSheetの状態管理用hook
 */
export function useCreateActionSheet() {
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return {
    isOpen,
    open,
    close,
    setIsOpen,
  };
}
