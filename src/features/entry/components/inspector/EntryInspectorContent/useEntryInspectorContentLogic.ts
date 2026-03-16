'use client';

/**
 * EntryInspectorContent のロジックを管理するカスタムフック
 *
 * @deprecated useEntryForm に移行済み。このファイルは後方互換のためのラッパー。
 * Phase 3 でコンポーネント側が useEntryForm を直接使用するようになったら削除。
 */

import { useEntryForm } from '../hooks/useEntryForm';

export function useEntryInspectorContentLogic() {
  return useEntryForm();
}
