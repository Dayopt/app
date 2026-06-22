'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useEntryInspectorStore } from '../stores/useEntryInspectorStore';

const ENTRY_PARAM = 'entry';

/**
 * インスペクタとURLクエリパラメータを同期するフック
 *
 * - `?entry=<uuid>` → 該当エントリでインスペクタオープン
 * - インスペクタ閉じる → パラメータ削除
 * - ブラウザの戻る/進むボタンでも動作
 * - ドラフトモード（entryId === null）はURL同期しない
 *
 * 注意: 無限ループを防ぐため、URL更新はインスペクタ状態変更時のみ行う
 */
export function useInspectorURLSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const isOpen = useEntryInspectorStore((state) => state.isOpen);
  const entryId = useEntryInspectorStore((state) => state.entryId);
  const openInspector = useEntryInspectorStore((state) => state.openInspector);
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);

  // 前回の状態を追跡（無限ループ防止）
  const prevIsOpenRef = useRef(isOpen);
  const prevEntryIdRef = useRef(entryId);
  const isUpdatingFromURLRef = useRef(false);

  // 初回マウント時のみ: URLパラメータからインスペクタを開く
  useEffect(() => {
    if (!searchParams) return;

    const entryParam = searchParams.get(ENTRY_PARAM);

    if (entryParam) {
      isUpdatingFromURLRef.current = true;
      openInspector(entryParam);
      setTimeout(() => {
        isUpdatingFromURLRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回マウント時のみ URL から復元する意図的な mount-only effect
  }, []);

  // インスペクタ状態変更時: URLを更新
  useEffect(() => {
    if (!searchParams || !pathname) return;

    // URLからの更新中は何もしない（無限ループ防止）
    if (isUpdatingFromURLRef.current) return;

    // 状態が実際に変更されたかチェック
    const stateChanged = prevIsOpenRef.current !== isOpen || prevEntryIdRef.current !== entryId;
    if (!stateChanged) return;

    // 状態を更新
    prevIsOpenRef.current = isOpen;
    prevEntryIdRef.current = entryId;

    const currentUrl = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    const currentPathname = currentUrl?.pathname ?? pathname;
    const currentParams = currentUrl
      ? new URLSearchParams(currentUrl.search)
      : new URLSearchParams(searchParams.toString());
    const currentEntryParam = currentParams.get(ENTRY_PARAM);

    if (isOpen && entryId) {
      // 既存エントリでインスペクタが開いている場合
      // push で履歴エントリを追加 → 戻る/進むで復元可能にする
      if (currentEntryParam !== entryId) {
        currentParams.set(ENTRY_PARAM, entryId);
        router.push(`${currentPathname}?${currentParams.toString()}`, { scroll: false });
      }
    } else {
      // インスペクタが閉じている、またはドラフトモード
      // replace で履歴を汚さない（閉じるたびに履歴が増えるのを防止）
      if (currentEntryParam !== null) {
        currentParams.delete(ENTRY_PARAM);
        const newUrl = currentParams.toString()
          ? `${currentPathname}?${currentParams.toString()}`
          : currentPathname;
        router.replace(newUrl, { scroll: false });
      }
    }
  }, [isOpen, entryId, pathname, searchParams, router]);

  // popstate対応: ブラウザの戻る/進むでURLが変わった時
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const entryParam = params.get(ENTRY_PARAM);

      isUpdatingFromURLRef.current = true;

      if (entryParam && entryParam !== entryId) {
        openInspector(entryParam);
      } else if (!entryParam && isOpen && entryId) {
        closeInspector();
      }

      setTimeout(() => {
        isUpdatingFromURLRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [entryId, isOpen, openInspector, closeInspector]);
}
