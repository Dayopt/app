'use client';

/**
 * 時計盤ピッカー（Material Design 風）
 *
 * - 時 → 分の2ステップ選択
 * - 24時間対応（外側リング: 1-12 / 内側リング: 0,13-23）
 * - 分は 1 分粒度（角度ベース 0-59）。表示ラベルは 5 分刻み（00, 05, ..., 55）
 * - 時選択後に自動で分ステップへ遷移
 * - drag（pointermove）で連続調整可
 *
 * @see docs/design/timeline-precision-redesign/overview.md § 4 D-9
 */

import { useCallback, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { cn } from '@/lib/utils';

// ─── 定数 ────────────────────────────────────────────

const SIZE = 256;
const CENTER = SIZE / 2;
const OUTER_RADIUS = 100;
const INNER_RADIUS = 68;
const INDICATOR_R = 18;

const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const;
const INNER_HOUR_SET = new Set<number>(INNER_HOURS);
/** 視覚ガイド用の 5 分刻みラベル。実際の選択値は 1 分粒度（角度ベース） */
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

type Mode = 'hour' | 'minute';

// ─── ユーティリティ ──────────────────────────────────

function toAngleDeg(index: number, total: number): number {
  return (index * 360) / total;
}

function posOnCircle(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

// ─── Component ───────────────────────────────────────

interface ClockTimePickerProps {
  value: string; // HH:MM形式
  onChange: (time: string) => void;
  onClose: () => void;
  minTime?: string | undefined;
}

export function ClockTimePicker({ value, onChange, onClose, minTime }: ClockTimePickerProps) {
  const t = useTranslations('common');
  const clockRef = useRef<HTMLDivElement>(null);

  const [h, m] = (value || '09:00').split(':').map(Number);
  const [mode, setMode] = useState<Mode>('hour');
  const [selectedHour, setSelectedHour] = useState(h ?? 9);
  const [selectedMinute, setSelectedMinute] = useState(m ?? 0);
  const isPointerDownRef = useRef(false);

  const minMins = minTime ? timeToMinutes(minTime) : undefined;

  const isHourDisabled = useCallback(
    (hour: number) => {
      if (minMins === undefined) return false;
      // 時全体が無効 = その時の最後のスロット(:45)でも minTime 以下
      return hour * 60 + 45 <= minMins;
    },
    [minMins],
  );

  const isMinuteDisabled = useCallback(
    (minute: number) => {
      if (minMins === undefined) return false;
      return selectedHour * 60 + minute <= minMins;
    },
    [minMins, selectedHour],
  );

  // ─── タッチ / クリック処理 ───────────────────────

  const handleInteraction = useCallback(
    (e: React.MouseEvent | React.TouchEvent, options: { advanceMode?: boolean } = {}) => {
      const el = clockRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const cx = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0]!.clientY : e.clientY;
      const x = cx - rect.left - CENTER;
      const y = cy - rect.top - CENTER;
      const dist = Math.sqrt(x ** 2 + y ** 2);

      // 角度: 12時方向を0°、時計回り
      let angle = (Math.atan2(x, -y) * 180) / Math.PI;
      if (angle < 0) angle += 360;

      if (mode === 'hour') {
        const idx = Math.round(angle / 30) % 12;
        const isInner = dist < (OUTER_RADIUS + INNER_RADIUS) / 2;
        const hour = isInner ? INNER_HOURS[idx]! : OUTER_HOURS[idx]!;
        if (!isHourDisabled(hour)) {
          setSelectedHour(hour);
          if (options.advanceMode) {
            setTimeout(() => setMode('minute'), 300);
          }
        }
      } else {
        // 1 分粒度: 360° / 60 = 6° per minute
        const minute = Math.round(angle / 6) % 60;
        if (!isMinuteDisabled(minute)) {
          setSelectedMinute(minute);
        }
      }
    },
    [mode, isHourDisabled, isMinuteDisabled],
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isPointerDownRef.current = true;
      // tap で即時選択（hour mode は drag せずに tap で確定 → minute へ遷移）
      handleInteraction(e, { advanceMode: mode === 'hour' });
    },
    [handleInteraction, mode],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isPointerDownRef.current) return;
      // drag 中は mode 遷移しない（minute mode で 1 分粒度連続調整するため）
      handleInteraction(e);
    },
    [handleInteraction],
  );

  const handlePointerUp = useCallback(() => {
    isPointerDownRef.current = false;
  }, []);

  const handleSetNow = useCallback(() => {
    const now = new Date();
    setSelectedHour(now.getHours());
    setSelectedMinute(now.getMinutes());
  }, []);

  const handleConfirm = useCallback(() => {
    const hh = selectedHour.toString().padStart(2, '0');
    const mm = selectedMinute.toString().padStart(2, '0');
    onChange(`${hh}:${mm}`);
    onClose();
  }, [selectedHour, selectedMinute, onChange, onClose]);

  // ─── 針の計算 ─────────────────────────────────────

  const handAngle = mode === 'hour' ? (selectedHour % 12) * 30 : selectedMinute * 6;
  const handRadius =
    mode === 'hour'
      ? INNER_HOUR_SET.has(selectedHour)
        ? INNER_RADIUS
        : OUTER_RADIUS
      : OUTER_RADIUS;
  const handEnd = posOnCircle(handAngle, handRadius);

  return (
    <div className="flex flex-col items-center gap-6 px-4 pb-4">
      {/* 時刻表示ヘッダー */}
      <div className="flex items-baseline gap-1 text-5xl tabular-nums">
        <button
          type="button"
          onClick={() => setMode('hour')}
          className={cn(
            'rounded-lg px-2 py-1 transition-colors duration-150',
            mode === 'hour'
              ? 'bg-state-selected text-foreground font-medium'
              : 'text-muted-foreground',
          )}
        >
          {selectedHour.toString().padStart(2, '0')}
        </button>
        <span className="text-muted-foreground font-medium">:</span>
        <button
          type="button"
          onClick={() => setMode('minute')}
          className={cn(
            'rounded-lg px-2 py-1 transition-colors duration-150',
            mode === 'minute'
              ? 'bg-state-selected text-foreground font-medium'
              : 'text-muted-foreground',
          )}
        >
          {selectedMinute.toString().padStart(2, '0')}
        </button>
      </div>

      {/* 時計盤 */}
      <div
        ref={clockRef}
        className="bg-muted relative touch-none rounded-full select-none"
        style={{ width: SIZE, height: SIZE }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        role="group"
        aria-label={mode === 'hour' ? t('aria.startTime') : t('aria.endTime')}
      >
        {/* 針（中心→選択位置） */}
        <div
          className="bg-primary absolute left-1/2 origin-bottom"
          style={{
            width: 2,
            height: handRadius,
            bottom: '50%',
            transform: `translateX(-50%) rotate(${handAngle}deg)`,
            transition: 'transform 200ms, height 200ms',
          }}
        />
        {/* 中心ドット */}
        <div
          className="bg-primary absolute top-1/2 left-1/2 rounded-full"
          style={{ width: 8, height: 8, transform: 'translate(-50%, -50%)' }}
        />
        {/* 選択インジケーター */}
        <div
          className="bg-primary absolute rounded-full"
          style={{
            width: INDICATOR_R * 2,
            height: INDICATOR_R * 2,
            left: handEnd.x - INDICATOR_R,
            top: handEnd.y - INDICATOR_R,
            transition: 'left 200ms, top 200ms',
          }}
        />

        {/* 数字ラベル */}
        {mode === 'hour' ? (
          <>
            {/* 外側リング: 12, 1-11 */}
            {OUTER_HOURS.map((hour, i) => {
              const pos = posOnCircle(toAngleDeg(i, 12), OUTER_RADIUS);
              const disabled = isHourDisabled(hour);
              const selected = selectedHour === hour;
              return (
                <span
                  key={`o${hour}`}
                  className={cn(
                    'absolute flex items-center justify-center text-sm transition-colors duration-150',
                    disabled && 'opacity-30',
                    selected ? 'text-primary-foreground font-medium' : 'text-foreground',
                  )}
                  style={{
                    width: 36,
                    height: 36,
                    left: pos.x - 18,
                    top: pos.y - 18,
                  }}
                >
                  {hour}
                </span>
              );
            })}
            {/* 内側リング: 0, 13-23 */}
            {INNER_HOURS.map((hour, i) => {
              const pos = posOnCircle(toAngleDeg(i, 12), INNER_RADIUS);
              const disabled = isHourDisabled(hour);
              const selected = selectedHour === hour;
              return (
                <span
                  key={`i${hour}`}
                  className={cn(
                    'absolute flex items-center justify-center text-xs transition-colors duration-150',
                    disabled && 'opacity-30',
                    selected ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                  style={{
                    width: 36,
                    height: 36,
                    left: pos.x - 18,
                    top: pos.y - 18,
                  }}
                >
                  {hour}
                </span>
              );
            })}
          </>
        ) : (
          /* 分: 5 分刻みラベル（00, 05, 10, ..., 55）。実際の選択値は 1 分粒度 */
          MINUTE_LABELS.map((minute, i) => {
            const pos = posOnCircle(toAngleDeg(i, 12), OUTER_RADIUS);
            const disabled = isMinuteDisabled(minute);
            const selected = selectedMinute === minute;
            return (
              <span
                key={`m${minute}`}
                className={cn(
                  'absolute flex items-center justify-center text-sm transition-colors duration-150',
                  disabled && 'opacity-30',
                  selected ? 'text-primary-foreground font-medium' : 'text-foreground',
                )}
                style={{
                  width: 32,
                  height: 32,
                  left: pos.x - 16,
                  top: pos.y - 16,
                }}
              >
                {minute.toString().padStart(2, '0')}
              </span>
            );
          })
        )}
      </div>

      {/* アクションボタン */}
      <div className="flex w-full flex-col items-stretch gap-2">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleSetNow}>
            {t('actions.now')}
          </Button>
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={handleConfirm}>
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
