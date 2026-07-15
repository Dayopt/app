'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  parseTimeblockParam,
  serializeTimeblockParam,
  TIMEBLOCK_PARAM,
} from '../lib/inspector-url';
import { useTimeblockInspectorStore } from '../stores/useTimeblockInspectorStore';

/**
 * インスペクタとURLクエリパラメータを同期するフック
 *
 * - `?timeblock=plan:<uuid>` / `?timeblock=record:<uuid>` → 該当 Plan / Record でインスペクタオープン
 * - インスペクタ閉じる → パラメータ削除
 * - ブラウザの戻る/進むボタンでも動作
 * - ドラフトモード（timeblockId === null）はURL同期しない
 *
 * 注意: 無限ループを防ぐため、URL更新はインスペクタ状態変更時のみ行う
 */
export function useInspectorURLSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const isOpen = useTimeblockInspectorStore((state) => state.isOpen);
  const timeblockId = useTimeblockInspectorStore((state) => state.timeblockId);
  const timeblockKind = useTimeblockInspectorStore((state) => state.timeblockKind);
  const openInspector = useTimeblockInspectorStore((state) => state.openInspector);
  const closeInspector = useTimeblockInspectorStore((state) => state.closeInspector);

  // 前回の状態を追跡（無限ループ防止）
  const prevIsOpenRef = useRef(isOpen);
  const prevEntryIdRef = useRef(timeblockId);
  const prevEntryKindRef = useRef(timeblockKind);
  const previousURLParamRef = useRef<string | null | undefined>(undefined);

  // URLパラメータからインスペクタを開く（検索結果などのclient navigationにも追従）。
  useEffect(() => {
    if (!searchParams) return;

    const timeblockParam = searchParams.get(TIMEBLOCK_PARAM);
    if (previousURLParamRef.current === timeblockParam) return;
    previousURLParamRef.current = timeblockParam;
    if (!timeblockParam) return;

    const parsed = parseTimeblockParam(timeblockParam);
    if (!parsed) return;
    if (isOpen && parsed.timeblockId === timeblockId && parsed.kind === timeblockKind) return;

    openInspector(parsed.timeblockId, parsed.kind);
  }, [isOpen, openInspector, searchParams, timeblockId, timeblockKind]);

  // インスペクタ状態変更時: URLを更新
  useEffect(() => {
    if (!searchParams || !pathname) return;

    // 状態が実際に変更されたかチェック
    const stateChanged =
      prevIsOpenRef.current !== isOpen ||
      prevEntryIdRef.current !== timeblockId ||
      prevEntryKindRef.current !== timeblockKind;
    if (!stateChanged) return;

    // 状態を更新
    prevIsOpenRef.current = isOpen;
    prevEntryIdRef.current = timeblockId;
    prevEntryKindRef.current = timeblockKind;

    const currentUrl = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    const currentPathname = currentUrl?.pathname ?? pathname;
    const currentParams = currentUrl
      ? new URLSearchParams(currentUrl.search)
      : new URLSearchParams(searchParams.toString());
    const currentEntryParam = currentParams.get(TIMEBLOCK_PARAM);

    if (isOpen && timeblockId) {
      // 既存エントリでインスペクタが開いている場合
      // push で履歴エントリを追加 → 戻る/進むで復元可能にする
      const serialized = serializeTimeblockParam(timeblockId, timeblockKind);
      if (currentEntryParam !== serialized) {
        currentParams.set(TIMEBLOCK_PARAM, serialized);
        router.push(`${currentPathname}?${currentParams.toString()}`, { scroll: false });
      }
    } else {
      // インスペクタが閉じている、またはドラフトモード
      // replace で履歴を汚さない（閉じるたびに履歴が増えるのを防止）
      if (currentEntryParam !== null) {
        currentParams.delete(TIMEBLOCK_PARAM);
        const newUrl = currentParams.toString()
          ? `${currentPathname}?${currentParams.toString()}`
          : currentPathname;
        router.replace(newUrl, { scroll: false });
      }
    }
  }, [isOpen, timeblockId, timeblockKind, pathname, searchParams, router]);

  // popstate対応: ブラウザの戻る/進むでURLが変わった時
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const timeblockParam = params.get(TIMEBLOCK_PARAM);

      if (timeblockParam) {
        const parsed = parseTimeblockParam(timeblockParam);
        if (parsed && (parsed.timeblockId !== timeblockId || parsed.kind !== timeblockKind)) {
          openInspector(parsed.timeblockId, parsed.kind);
        }
      } else if (isOpen && timeblockId) {
        closeInspector();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [timeblockId, timeblockKind, isOpen, openInspector, closeInspector]);
}
