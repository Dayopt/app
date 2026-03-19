'use client';

import * as Portal from '@radix-ui/react-portal';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSubmitShortcut } from '@/hooks/useSubmitShortcut';

import { configToRRule, ruleToConfig } from '../../lib/rrule';
import type { RecurrenceConfig } from '../../types/entry';

interface RecurrenceDialogProps {
  value: string | null; // RRULE文字列
  onChange: (rrule: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  placement?: 'bottom' | 'right' | 'left'; // ポップアップの表示位置
}

/**
 * カスタム繰り返し設定ダイアログ（Portal版）
 *
 * **機能**:
 * - 頻度選択（毎日・毎週・毎月）
 * - 間隔設定（1-365）
 * - 曜日選択（週次のみ）
 * - 日付選択（月次のみ）
 * - 終了条件（無期限・日付指定・回数指定）
 *
 * **データ形式**:
 * - RRULE文字列（RFC 5545準拠）
 * - 例: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=10"
 */
export function RecurrenceDialog({
  value,
  onChange,
  open,
  onOpenChange,
  triggerRef,
  placement = 'bottom',
}: RecurrenceDialogProps) {
  const t = useTranslations();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const { formatDate: formatDateWithSettings } = useDateFormat();

  const [config, setConfig] = useState<RecurrenceConfig>(() => {
    if (value) {
      try {
        return ruleToConfig(value);
      } catch {
        // パースエラー時はデフォルト値
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        return {
          frequency: 'daily',
          interval: 1,
          endType: 'never',
          endDate: format(oneMonthLater, 'yyyy-MM-dd'),
        };
      }
    }
    // デフォルトで1ヶ月後を設定
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    return {
      frequency: 'daily',
      interval: 1,
      endType: 'never',
      endDate: format(oneMonthLater, 'yyyy-MM-dd'),
    };
  });

  // 位置を動的に計算（useEffect内でref参照）
  useEffect(() => {
    if (!open) return;

    const dialogWidth = 400; // w-[25rem]
    const dialogHeight = 500; // 推定高さ

    // triggerRefがない場合は画面中央に表示
    if (!triggerRef?.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ビューポート寸法に基づく位置計算は不可避
      setPosition({
        top: Math.max(16, (window.innerHeight - dialogHeight) / 2),
        left: Math.max(16, (window.innerWidth - dialogWidth) / 2),
      });
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();

    // viewport相対で計算（scrollY/Xは使わない - fixedポジショニングのため）
    if (placement === 'right') {
      setPosition({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - dialogHeight - 8)),
        left: Math.min(rect.right + 4, window.innerWidth - dialogWidth - 8),
      });
    } else if (placement === 'left') {
      setPosition({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - dialogHeight - 8)),
        left: Math.max(8, rect.left - dialogWidth - 4),
      });
    } else {
      // bottom (default)
      // 画面下にはみ出す場合は上に表示
      const spaceBelow = window.innerHeight - rect.bottom;

      if (spaceBelow < dialogHeight && rect.top > spaceBelow) {
        // 上に表示
        setPosition({
          top: Math.max(8, rect.top - dialogHeight - 4),
          left: Math.max(8, Math.min(rect.left, window.innerWidth - dialogWidth - 8)),
        });
      } else {
        // 下に表示
        setPosition({
          top: Math.min(rect.bottom + 4, window.innerHeight - dialogHeight - 8),
          left: Math.max(8, Math.min(rect.left, window.innerWidth - dialogWidth - 8)),
        });
      }
    }
  }, [open, triggerRef, placement]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = triggerRef?.current && triggerRef.current.contains(target);
      const clickedDialog = dialogRef.current && dialogRef.current.contains(target);

      // Portal要素（Selectのドロップダウン、Calendarなど）をクリックした場合は閉じない
      const isPortalElement =
        (target as Element).closest('[role="listbox"]') || // Select dropdown
        (target as Element).closest('[role="dialog"]') || // Dialog
        (target as Element).closest('.react-datepicker'); // Calendar (if any)

      if (!clickedTrigger && !clickedDialog && !isPortalElement) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [open, onOpenChange, triggerRef]);

  // Cmd+Enter / Ctrl+Enter で適用
  useSubmitShortcut({
    enabled: open,
    isLoading: false,
    onSubmit: () => handleSave(),
  });

  const handleSave = () => {
    const rrule = configToRRule(config);
    onChange(rrule);
    onOpenChange(false);
  };

  // 曜日トグル
  const toggleWeekday = (index: number) => {
    const current = config.byWeekday || [];
    const updated = current.includes(index)
      ? current.filter((d) => d !== index)
      : [...current, index].sort();
    setConfig({ ...config, byWeekday: updated });
  };

  if (!open) return null;

  return (
    <Portal.Root>
      <div
        ref={dialogRef}
        className="bg-card border-border z-overlay-popover surface-raised fixed w-[25rem] overflow-hidden rounded-2xl border"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {/* ヘッダー */}
        <div className="px-6 py-4">
          <h3 className="text-foreground text-base font-bold">
            {t('common.recurrence.dialog.title')}
          </h3>
        </div>

        {/* コンテンツ */}
        <div className="space-y-6 px-6 pb-4">
          {/* 1. 間隔 */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-normal">
              {t('common.recurrence.dialog.interval')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                enterKeyHint="done"
                min="1"
                max="365"
                value={config.interval}
                onChange={(e) => setConfig({ ...config, interval: Number(e.target.value) || 1 })}
                className="border-border bg-secondary h-8 w-16 rounded-lg border text-center"
              />
              <Select
                value={config.frequency}
                onValueChange={(value) =>
                  setConfig({
                    ...config,
                    frequency: value as 'daily' | 'weekly' | 'monthly' | 'yearly',
                    // 頻度変更時にリセット
                    byWeekday: value === 'weekly' ? (config.byWeekday ?? undefined) : undefined,
                    byMonthDay: value === 'monthly' ? (config.byMonthDay ?? 1) : undefined,
                  })
                }
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-overlay-popover">
                  <SelectItem value="daily">{t('common.recurrence.dialog.perDay')}</SelectItem>
                  <SelectItem value="weekly">{t('common.recurrence.dialog.perWeek')}</SelectItem>
                  <SelectItem value="monthly">{t('common.recurrence.dialog.perMonth')}</SelectItem>
                  <SelectItem value="yearly">{t('common.recurrence.dialog.perYear')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2. パターン（週次・月次のみ） */}
          {config.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-normal">
                {t('common.recurrence.dialog.pattern')}
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((weekdayIdx) => {
                  const day = t(`recurrence.dialog.weekdaysShort.${String(weekdayIdx)}`);
                  return (
                    <Button
                      key={weekdayIdx}
                      variant={config.byWeekday?.includes(weekdayIdx) ? 'primary' : 'outline'}
                      size="sm"
                      className="h-10 w-10 rounded-full p-0 text-sm"
                      onClick={() => toggleWeekday(weekdayIdx)}
                      type="button"
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {config.frequency === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-normal">
                {t('common.recurrence.dialog.pattern')}
              </Label>
              <Select
                value={
                  config.bySetPos !== undefined && config.byWeekday?.[0] !== undefined
                    ? `setpos-${config.bySetPos}-${config.byWeekday[0]}`
                    : `monthday-${config.byMonthDay || 1}`
                }
                onValueChange={(value) => {
                  if (value.startsWith('setpos-')) {
                    const [, setPos, weekday] = value.split('-');
                    setConfig({
                      ...config,
                      byMonthDay: undefined,
                      bySetPos: Number(setPos!),
                      byWeekday: [Number(weekday!)],
                    });
                  } else {
                    const monthDay = Number(value.split('-')[1]!);
                    setConfig({
                      ...config,
                      byMonthDay: monthDay,
                      bySetPos: undefined,
                      byWeekday: undefined,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-overlay-popover">
                  {(() => {
                    // 現在の日付から候補を生成
                    const today = new Date();
                    const day = today.getDate();
                    const weekday = today.getDay();
                    const weekdayName = t(`recurrence.dialog.weekdaysShort.${String(weekday)}`);

                    // その日が第何週か計算
                    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const weekOfMonth = Math.ceil((day + firstDayOfMonth.getDay()) / 7);

                    // 最終週かどうか判定
                    const lastDayOfMonth = new Date(
                      today.getFullYear(),
                      today.getMonth() + 1,
                      0,
                    ).getDate();
                    const isLastWeek = day + 7 > lastDayOfMonth;

                    const options = [
                      // 選択肢1: 毎月 X 日
                      <SelectItem key={`monthday-${day}`} value={`monthday-${day}`}>
                        {t('common.recurrence.dialog.everyMonth', { day })}
                      </SelectItem>,
                      // 選択肢2: 毎月 第 N X曜日
                      <SelectItem
                        key={`setpos-${weekOfMonth}-${weekday}`}
                        value={`setpos-${weekOfMonth}-${weekday}`}
                      >
                        {t('common.recurrence.dialog.everyNthWeekday', {
                          nth: weekOfMonth,
                          weekday: weekdayName,
                        })}
                      </SelectItem>,
                    ];

                    // 最終週の場合は「最終X曜日」も追加
                    if (isLastWeek) {
                      options.push(
                        <SelectItem key={`setpos--1-${weekday}`} value={`setpos--1-${weekday}`}>
                          {t('common.recurrence.dialog.everyLastWeekday', { weekday: weekdayName })}
                        </SelectItem>,
                      );
                    }

                    return options;
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 3. 期間 */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-normal">
              {t('common.recurrence.dialog.period')}
            </Label>
            <RadioGroup
              value={config.endType}
              onValueChange={(value) =>
                setConfig({ ...config, endType: value as 'never' | 'until' | 'count' })
              }
              className="space-y-2"
            >
              {/* 1. 終了日未定 */}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="never" id="end-never" />
                <Label
                  htmlFor="end-never"
                  className="text-foreground cursor-pointer text-sm font-normal"
                >
                  {t('common.recurrence.dialog.endNever')}
                </Label>
              </div>

              {/* 2. 終了日指定 */}
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="until"
                  id="end-until"
                  onClick={() => {
                    setConfig({ ...config, endType: 'until' });
                    setShowCalendar(true);
                  }}
                />
                <Label
                  htmlFor="end-until"
                  className="text-foreground cursor-pointer text-sm font-normal"
                  onClick={() => {
                    setConfig({ ...config, endType: 'until' });
                    setShowCalendar(true);
                  }}
                >
                  {t('common.recurrence.dialog.endUntil')}
                </Label>
                <span className="text-foreground text-sm">
                  {config.endDate ? formatDateWithSettings(new Date(config.endDate)) : ''}
                </span>
              </div>

              {/* カレンダー表示 */}
              {showCalendar && config.endType === 'until' && (
                <div className="mt-2 ml-6">
                  <MiniCalendar
                    selectedDate={config.endDate ? new Date(config.endDate) : undefined}
                    onDateSelect={(date) => {
                      if (date) {
                        setConfig({ ...config, endDate: format(date, 'yyyy-MM-dd') });
                        setShowCalendar(false);
                      }
                    }}
                    className="border-border rounded-lg border"
                  />
                </div>
              )}

              {/* 3. 回数指定 */}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="count" id="end-count" />
                <Input
                  type="number"
                  inputMode="numeric"
                  enterKeyHint="done"
                  min="1"
                  max="50"
                  value={config.count || 4}
                  onChange={(e) =>
                    setConfig({ ...config, count: Number(e.target.value) || 4, endType: 'count' })
                  }
                  disabled={config.endType !== 'count'}
                  className="border-border bg-secondary h-8 w-20 rounded-lg border text-center disabled:opacity-50"
                />
                <span className="text-foreground text-sm">
                  {t('common.recurrence.dialog.endCount')}
                </span>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* フッター */}
        <ActionFooter className="border-border border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSave} type="button">
            {t('common.apply')}
          </Button>
        </ActionFooter>
      </div>
    </Portal.Root>
  );
}
