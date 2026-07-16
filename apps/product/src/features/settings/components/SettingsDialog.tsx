'use client';

import { useTranslations } from 'next-intl';

import { XIcon } from 'lucide-react';

import { useShellStore } from '@/lib/stores/useShellStore';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@dayopt/components';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { SettingsContent } from './SettingsContent';
import { SettingsSidebar } from './SettingsSidebar';

/**
 * 設定ダイアログ（PC用）
 *
 * ShellStore で開閉・カテゴリを管理。
 * URL は変更しない。サイドバーのカテゴリ切替も store 経由。
 */
export function SettingsDialog() {
  const t = useTranslations();
  const activeSheet = useShellStore((s) => s.activeSheet);
  const isOpen = activeSheet?.type === 'settings';
  const category = activeSheet?.type === 'settings' ? activeSheet.category : 'profile';
  const close = useShellStore((s) => s.closeSheet);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit
        className="flex h-[85vh] max-h-200 max-w-4xl gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>{t('settings.dialog.title')}</DialogTitle>
        </VisuallyHidden>
        <SettingsSidebar className="border-border w-60 shrink-0 border-r" />
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <SettingsContent category={category} />
        </div>
        <DialogClose className="text-muted-foreground hover:text-foreground hover:bg-state-hover active:bg-state-hover focus-visible:ring-ring absolute top-2 right-2 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-hidden md:size-8 md:min-h-0 md:min-w-0">
          <XIcon className="size-4" />
          <span className="sr-only">{t('common.actions.close')}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
