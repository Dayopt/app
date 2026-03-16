'use client';

import { useEffect } from 'react';

import type { AutoAdvanceStrategy, StepValidationResult, StepValidator } from '../types';

/**
 * DOM 監視による自動進行フック
 *
 * MutationObserver で addedNodes のみ監視し、
 * matchSelector にマッチする要素が追加されたら自動進行する。
 * バリデーター指定時は検証に通過した場合のみ進行。
 */
export function useAutoAdvance(
  strategy: AutoAdvanceStrategy | null | undefined,
  isActive: boolean,
  onAdvance: () => void,
  validator?: StepValidator | undefined,
  onValidationFail?: ((result: StepValidationResult) => void) | undefined,
): void {
  useEffect(() => {
    if (!isActive || !strategy) return;

    // 現在は dom-observe のみだが、将来の拡張に備えて switch で分岐
    const target = document.querySelector(strategy.targetSelector);
    if (!target) return;

    const { matchSelector } = strategy;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(matchSelector) || node.querySelector(matchSelector)) {
            // バリデーション
            if (validator) {
              const result = validator();
              if (!result.valid) {
                onValidationFail?.(result);
                return;
              }
            }
            observer.disconnect();
            onAdvance();
            return;
          }
        }
      }
    });

    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isActive, strategy, onAdvance, validator, onValidationFail]);
}
