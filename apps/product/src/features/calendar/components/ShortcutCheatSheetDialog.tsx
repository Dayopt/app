'use client';

import { useMemo } from 'react';

import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@dayopt/components';
import { useTranslations } from 'next-intl';

import { formatShortcutKey, type ShortcutPlatform } from '@/lib/keyboard/shortcut-key-label';
import {
  getRegisteredShortcutHelpItems,
  type ShortcutHelpGroup,
  type ShortcutHelpItem,
} from '@/lib/keyboard/shortcut-registry';

const GROUPS: ShortcutHelpGroup[] = ['general', 'navigation', 'views', 'blocks'];
const GROUP_COLUMNS: readonly (readonly ShortcutHelpGroup[])[] = [
  ['general', 'views'],
  ['navigation', 'blocks'],
];

const GROUP_LABEL_KEYS = {
  general: 'calendar.shortcuts.groups.general',
  navigation: 'calendar.shortcuts.groups.navigation',
  views: 'calendar.shortcuts.groups.views',
  blocks: 'calendar.shortcuts.groups.blocks',
} as const satisfies Record<ShortcutHelpGroup, string>;

interface ShortcutCheatSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts?: readonly ShortcutHelpItem[];
  platform?: ShortcutPlatform;
}

function detectShortcutPlatform(): ShortcutPlatform {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'other';
}

/** Calendarで現在有効なキーボードショートカットを表示する。 */
export function ShortcutCheatSheetDialog({
  open,
  onOpenChange,
  shortcuts,
  platform,
}: ShortcutCheatSheetDialogProps) {
  const t = useTranslations();
  const hasMounted = useHasMounted();
  const resolvedPlatform = platform ?? (hasMounted ? detectShortcutPlatform() : 'other');
  const items = shortcuts ?? getRegisteredShortcutHelpItems();
  const groupedItems = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        items: items.filter((item) => item.group === group),
      })).filter((section) => section.items.length > 0),
    [items],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} responsive="dialog" modal={false}>
      <DialogContent size="xl" className="max-h-160 overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>{t('calendar.shortcuts.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          {GROUP_COLUMNS.map((columnGroups) => (
            <div key={columnGroups.join('-')} className="space-y-6">
              {groupedItems
                .filter((section) => columnGroups.includes(section.group))
                .map((section) => (
                  <section key={section.group} className="space-y-1">
                    <h3 className="text-muted-foreground px-2 text-xs font-medium">
                      {t(GROUP_LABEL_KEYS[section.group])}
                    </h3>
                    <div>
                      {section.items.map((item) => {
                        const keyLabels = [
                          ...new Set(
                            item.keys.map((key) => formatShortcutKey(key, resolvedPlatform)),
                          ),
                        ];
                        return (
                          <div
                            key={item.labelKey}
                            className="flex min-h-10 items-center justify-between gap-4 px-2 py-2 text-sm"
                          >
                            <span>{t(item.labelKey)}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              {keyLabels.map((keyLabel) => (
                                <kbd
                                  key={keyLabel}
                                  className="border-border bg-surface-container text-muted-foreground min-w-8 rounded-lg border px-2 py-1 text-center font-mono text-xs"
                                >
                                  {keyLabel}
                                </kbd>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
