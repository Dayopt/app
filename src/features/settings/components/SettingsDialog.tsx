'use client';

import { useTranslations } from 'next-intl';

import { XIcon } from 'lucide-react';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { SettingsContent } from './SettingsContent';
import { SettingsSidebar } from './SettingsSidebar';

/**
 * 設定ダイアログ（PC用）
 *
 * Zustand store で開閉・カテゴリを管理。
 * URL は変更しない。サイドバーのカテゴリ切替も store 経由。
 */
export function SettingsDialog() {
  const t = useTranslations();
  const isOpen = useSettingsStore((s) => s.isOpen);
  const category = useSettingsStore((s) => s.category);
  const close = useSettingsStore((s) => s.close);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="flex h-[85vh] max-h-[800px] max-w-4xl gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>{t('settings.dialog.title')}</DialogTitle>
        </VisuallyHidden>
        <SettingsSidebar className="border-border w-60 shrink-0 border-r" />
        <div className="bg-background flex h-full min-w-0 flex-1 flex-col">
          <SettingsContent category={category} />
        </div>
        <DialogClose className="text-muted-foreground hover:text-foreground hover:bg-state-hover active:bg-state-hover focus-visible:ring-ring absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-hidden">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
