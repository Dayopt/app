'use client';

import { useEffect } from 'react';

/**
 * 開発環境専用のアクセシビリティチェッカー
 *
 * @axe-core/react を使用して、開発中にリアルタイムで
 * アクセシビリティ問題をコンソールに表示
 *
 * @description
 * - 開発環境 (NODE_ENV === 'development') でのみ動作
 * - ページ読み込み後500ms待機してからチェック開始
 * - 問題が見つかった場合、コンソールに警告を表示
 *
 * @example
 * // providers.tsx で使用
 * <AxeAccessibilityChecker />
 *
 * @see https://github.com/dequelabs/axe-core-npm/tree/develop/packages/react
 */
export function AxeAccessibilityChecker() {
  useEffect(() => {
    // 開発環境のみで実行
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // クライアントサイドのみで実行
    if (typeof window === 'undefined') {
      return;
    }

    // 動的インポートでaxe-coreを読み込み（本番ビルドには含まれない）
    const initAxe = async () => {
      try {
        const axe = await import('@axe-core/react');
        const React = await import('react');
        const ReactDOM = await import('react-dom');

        // 500ms待機してDOMが安定してからチェック
        setTimeout(() => {
          // axe-core実行（1秒間隔でチェック）
          axe.default(React.default, ReactDOM.default, 1000);
        }, 500);
      } catch (error) {
        // axe-coreが読み込めない場合は静かに失敗
        console.warn('[a11y] axe-core not available:', error);
      }
    };

    initAxe();
  }, []);

  // 何もレンダリングしない
  return null;
}
