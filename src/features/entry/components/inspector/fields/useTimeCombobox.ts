'use client';

import {
  type KeyboardEventHandler,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ─── 定数 ────────────────────────────────────────────

/** 時刻スナップの刻み幅（分）。変更はここだけでOK */
export const SNAP_MINUTES = 15;

// ─── ユーティリティ関数（純粋関数） ──────────────────

/** SNAP_MINUTES 刻みの時刻オプションを生成（00:00 ~ 23:45） */
function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += SNAP_MINUTES) {
      options.push(formatTime(hour, minute));
    }
  }
  return options;
}

/** HH:MM 形式にフォーマット */
function formatTime(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** 時刻文字列を分に変換 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

// ─── Hook ────────────────────────────────────────────

interface UseTimeComboboxOptions {
  value: string;
  onChange: (time: string) => void;
  minTime?: string | undefined;
}

export interface UseTimeComboboxReturn {
  // State
  isOpen: boolean;
  highlightedIndex: number;
  options: string[];

  // Refs
  inputRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLDivElement | null>;

  // Handlers
  handleKeyDown: KeyboardEventHandler;
  handleFocus: () => void;
  handleOptionClick: (option: string) => void;
  handleOptionHover: (index: number) => void;
  handleOpenChange: (open: boolean) => void;
}

export function useTimeCombobox({
  value,
  onChange,
  minTime,
}: UseTimeComboboxOptions): UseTimeComboboxReturn {
  // ─── State ───────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const hasScrolledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ─── Computed ────────────────────────────────
  const timeOptions = useMemo(() => generateTimeOptions(), []);

  const options = useMemo(
    () =>
      minTime
        ? timeOptions.filter((option) => timeToMinutes(option) > timeToMinutes(minTime))
        : timeOptions,
    [timeOptions, minTime],
  );

  // ─── Effects ─────────────────────────────────

  // スクロール位置管理
  useEffect(() => {
    if (isOpen && !hasScrolledRef.current) {
      requestAnimationFrame(() => {
        if (!listRef.current) return;

        if (minTime) {
          listRef.current.scrollTop = 0;
          hasScrolledRef.current = true;
          return;
        }

        let targetIndex = -1;

        if (value) {
          targetIndex = timeOptions.indexOf(value);
          if (targetIndex === -1) {
            const [hours, minutes] = value.split(':').map(Number);
            if (!isNaN(hours!) && !isNaN(minutes!)) {
              const roundedMinutes = Math.floor(minutes! / SNAP_MINUTES) * SNAP_MINUTES;
              targetIndex = timeOptions.indexOf(formatTime(hours!, roundedMinutes));
            }
          }
        } else {
          const now = new Date();
          const roundedMinutes = Math.floor(now.getMinutes() / SNAP_MINUTES) * SNAP_MINUTES;
          targetIndex = timeOptions.indexOf(formatTime(now.getHours(), roundedMinutes));
        }

        if (targetIndex !== -1) {
          const itemHeight = 32;
          const containerHeight = 200;
          listRef.current.scrollTop =
            targetIndex * itemHeight - containerHeight / 2 + itemHeight / 2;
          hasScrolledRef.current = true;
        }
      });
    }
    if (!isOpen) {
      hasScrolledRef.current = false;
    }
  }, [isOpen, value, timeOptions, minTime]);

  // ─── Handlers ────────────────────────────────

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setHighlightedIndex(-1);
  }, []);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex]!);
          setIsOpen(false);
          setHighlightedIndex(-1);
        } else if (!isOpen) {
          setIsOpen(true);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          if (value) {
            const total = timeToMinutes(value) - SNAP_MINUTES;
            const wrapped = total < 0 ? total + 24 * 60 : total;
            onChange(formatTime(Math.floor(wrapped / 60) % 24, wrapped % 60));
          }
        } else {
          setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) {
          if (value) {
            const total = timeToMinutes(value) + SNAP_MINUTES;
            const wrapped = total >= 24 * 60 ? total - 24 * 60 : total;
            onChange(formatTime(Math.floor(wrapped / 60) % 24, wrapped % 60));
          }
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else if (e.key === 'Tab') {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    },
    [highlightedIndex, options, isOpen, value, onChange],
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleOptionClick = useCallback(
    (option: string) => {
      onChange(option);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const handleOptionHover = useCallback((index: number) => {
    setHighlightedIndex(index);
  }, []);

  return {
    isOpen,
    highlightedIndex,
    options,
    inputRef,
    listRef,
    handleKeyDown,
    handleFocus,
    handleOptionClick,
    handleOptionHover,
    handleOpenChange,
  };
}
