'use client';

import { useCallback, useEffect, useRef } from 'react';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useShellStore } from '@/shell/stores/useShellStore';
import type { CalendarSettings } from '@/stores/useCalendarSettingsStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import type { ShortcutDef } from '../../../hooks/keyboard/shortcut-registry';
import { registerShortcuts } from '../../../hooks/keyboard/shortcut-registry';
import type { CalendarViewType } from '../../../types/calendar.types';
import { isMultiDayView } from '../../../types/calendar.types';

/** ViewSwitcher コンポーネントのプロパティ */
interface ViewSwitcherProps {
  currentView: CalendarViewType;
  onChange: (view: CalendarViewType) => void;
  onSettingsChange?: ((settings: Partial<CalendarSettings>) => void) | undefined;
  className?: string;
}

/** ビュー選択オプションの定義 */
interface MainViewOption {
  value: CalendarViewType;
  labelKey: string;
  shortcut: string;
}

const MAIN_VIEW_OPTIONS: MainViewOption[] = [
  { value: 'day', labelKey: 'calendar.views.day', shortcut: 'D' },
  { value: 'week', labelKey: 'calendar.views.week', shortcut: 'W' },
];

const DAY_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

const DENSITY_OPTIONS = ['compact', 'default', 'spacious'] as const;

/**
 * ビュー切り替えドロップダウン（Google Calendar風サブメニュー構造）
 *
 * メニュー構造:
 * - 日 (D) / 週 (W) / アジェンダ (A)
 * - 日数 > 2日間〜9日間
 * - ビューの設定 > 週末を表示
 */
export function ViewSwitcher({
  currentView,
  onChange,
  onSettingsChange,
  className,
}: ViewSwitcherProps) {
  const t = useTranslations();
  const showWeekends = useCalendarSettingsStore((s) => s.showWeekends);
  const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);
  const hourHeightDensity = useCalendarSettingsStore((s) => s.hourHeightDensity);
  const updateSettings = useCalendarSettingsStore((s) => s.updateSettings);

  const persistSettings = useCallback(
    (settings: Partial<CalendarSettings>) => {
      updateSettings(settings);
      onSettingsChange?.(settings);
    },
    [updateSettings, onSettingsChange],
  );

  const currentLabel = isMultiDayView(currentView)
    ? t('calendar.views.multiday', { count: parseInt(currentView) })
    : t(
        MAIN_VIEW_OPTIONS.find((opt) => opt.value === currentView)?.labelKey ??
          'calendar.views.week',
      );

  const handleSelect = useCallback(
    (value: CalendarViewType) => {
      onChange(value);
    },
    [onChange],
  );

  const handleToggleWeekends = useCallback(() => {
    persistSettings({ showWeekends: !showWeekends });
  }, [showWeekends, persistSettings]);

  const handleToggleWeekNumbers = useCallback(() => {
    persistSettings({ showWeekNumbers: !showWeekNumbers });
  }, [showWeekNumbers, persistSettings]);

  // キーボードショートカット: D, W, 0-9（レジストリ経由、モバイルガードはuseShortcutRegistryで実施）
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const shortcuts: ShortcutDef[] = [
      // D → Day View
      {
        key: 'D',
        description: 'Day View に切り替え（D）',
        handler: (e) => {
          e.preventDefault();
          onChangeRef.current('day');
        },
      },
      // W → Week View
      {
        key: 'W',
        description: 'Week View に切り替え（W）',
        handler: (e) => {
          e.preventDefault();
          onChangeRef.current('week');
        },
      },
      // 1 → Day View
      {
        key: '1',
        description: 'Day View に切り替え（1）',
        handler: (e) => {
          e.preventDefault();
          onChangeRef.current('day');
        },
      },
      // 0 → Week View
      {
        key: '0',
        description: 'Week View に切り替え（0）',
        handler: (e) => {
          e.preventDefault();
          onChangeRef.current('week');
        },
      },
      // 2-9 → N-day View
      ...([2, 3, 4, 5, 6, 7, 8, 9] as const).map(
        (n): ShortcutDef => ({
          key: String(n),
          description: `${n}-Day View に切り替え`,
          handler: (e) => {
            e.preventDefault();
            onChangeRef.current(`${n}day` as CalendarViewType);
          },
        }),
      ),
    ];

    return registerShortcuts(shortcuts);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'justify-start gap-0 text-sm',
          className,
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDown className="ml-2 size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="min-w-48">
        {/* メインビュー */}
        {MAIN_VIEW_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className="flex items-center justify-between gap-2"
          >
            <span>{t(option.labelKey)}</span>
            <div className="flex items-center gap-2">
              {currentView === option.value && <Check className="text-primary size-4" />}
              {currentView !== option.value && <span className="w-4" />}
              <span className="bg-surface-container text-muted-foreground rounded-lg px-2 py-1 font-mono text-xs">
                {option.shortcut}
              </span>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* 日数サブメニュー */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>{t('calendar.views.daysSubmenu')}</span>
            {isMultiDayView(currentView) && <Check className="text-primary ml-auto size-4" />}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {DAY_COUNTS.map((count) => {
              const view = `${count}day` as CalendarViewType;
              const isActive = currentView === view;
              return (
                <DropdownMenuItem
                  key={count}
                  onClick={() => handleSelect(view)}
                  className="flex items-center justify-between gap-4"
                >
                  <span>{t('calendar.views.multiday', { count })}</span>
                  <div className="flex items-center gap-2">
                    {isActive && <Check className="text-primary size-4" />}
                    {!isActive && <span className="w-4" />}
                    <span className="bg-surface-container text-muted-foreground rounded-lg px-2 py-1 font-mono text-xs">
                      {count}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* ビューの設定サブメニュー */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>{t('calendar.views.viewSettings')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem checked={showWeekends} onCheckedChange={handleToggleWeekends}>
              {t('calendar.views.showWeekends')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showWeekNumbers}
              onCheckedChange={handleToggleWeekNumbers}
            >
              {t('calendar.views.showWeekNumbers')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('calendar.views.density')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DENSITY_OPTIONS.map((d) => (
                  <DropdownMenuCheckboxItem
                    key={d}
                    checked={hourHeightDensity === d}
                    onCheckedChange={() => persistSettings({ hourHeightDensity: d })}
                  >
                    {t(`calendar.views.density_${d}`)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => useShellStore.getState().openSettings('display')}>
              {t('calendar.views.generalSettings')}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
