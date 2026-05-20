/**
 * Keyboard Shortcut Registry
 *
 * カレンダー機能のキーボードショートカットを一元管理するレジストリ。
 * - ショートカット定義の集約（ヘルプダイアログ等で参照可能）
 * - 開発時のコンフリクト検出
 * - 単一のグローバルkeydownリスナーによる処理
 */

import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

/** ショートカット定義 */
export interface ShortcutDef {
  /** 正規化されたキーコンボ（例: 'D', 'Cmd+W', 'Delete', 'Shift+C'） */
  key: string;
  /** キーイベントハンドラ */
  handler: (event: KeyboardEvent) => void;
  /** 説明（デバッグ / ヘルプダイアログ用） */
  description: string;
  /** 優先度（高い方が優先。デフォルト: 0） */
  priority?: number;
}

interface RegisteredShortcut {
  def: ShortcutDef;
  id: symbol;
}

// =============================================================================
// Registry (module-level singleton)
// =============================================================================

const registry = new Map<string, RegisteredShortcut[]>();

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * キーコンボを正規化する
 * イベントのキー情報から「Cmd+Shift+C」のような正規化文字列を生成
 */
export function normalizeKeyCombo(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push('Cmd');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  if (event.altKey) {
    parts.push('Alt');
  }

  // キーの正規化
  let key = event.key;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
    case 'Delete':
    case 'Backspace':
    case 'Escape':
    case 'Enter':
    case 'Tab':
      // 特殊キーはそのまま
      break;
    default:
      // 英字は大文字化、数字はそのまま
      if (key.length === 1) {
        key = key.toUpperCase();
      }
  }

  parts.push(key);
  return parts.join('+');
}

/**
 * ショートカットを登録する
 *
 * @returns unregister関数
 */
export function registerShortcut(def: ShortcutDef): () => void {
  const id = Symbol(def.description);
  const entry: RegisteredShortcut = { def, id };

  const existing = registry.get(def.key);
  if (existing) {
    // 開発時: コンフリクト警告
    if (isDevelopment) {
      const descriptions = existing.map((e) => e.def.description);
      logger.warn(
        `[ShortcutRegistry] "${def.key}" に複数ハンドラ登録: [${descriptions.join(', ')}] ← "${def.description}"`,
      );
    }
    existing.push(entry);
    // 優先度降順でソート
    existing.sort((a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0));
  } else {
    registry.set(def.key, [entry]);
  }

  // unregister
  return () => {
    const entries = registry.get(def.key);
    if (!entries) return;
    const idx = entries.findIndex((e) => e.id === id);
    if (idx !== -1) {
      entries.splice(idx, 1);
    }
    if (entries.length === 0) {
      registry.delete(def.key);
    }
  };
}

/**
 * 複数のショートカットを一括登録する
 *
 * @returns 全ショートカットを一括解除する関数
 */
export function registerShortcuts(defs: ShortcutDef[]): () => void {
  const unregisterFns = defs.map((def) => registerShortcut(def));
  return () => {
    for (const unregister of unregisterFns) {
      unregister();
    }
  };
}

/**
 * 登録済みショートカットマップを取得する（ヘルプダイアログ等）
 */
export function getShortcutMap(): Map<
  string,
  ReadonlyArray<{ key: string; description: string; priority: number }>
> {
  const result = new Map<
    string,
    ReadonlyArray<{ key: string; description: string; priority: number }>
  >();
  for (const [key, entries] of registry) {
    result.set(
      key,
      entries.map((e) => ({
        key: e.def.key,
        description: e.def.description,
        priority: e.def.priority ?? 0,
      })),
    );
  }
  return result;
}

/**
 * 現在のactiveElementが入力フィールドかどうかを判定する
 */
function isInputFocused(): boolean {
  const { activeElement } = document;
  if (!activeElement) return false;
  return (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.getAttribute('contenteditable') === 'true' ||
    activeElement.getAttribute('role') === 'textbox'
  );
}

/**
 * グローバルkeydownイベントを処理する
 *
 * レジストリに登録されたショートカットを照合し、最も優先度の高いハンドラを実行する。
 * 入力フィールドにフォーカスがある場合はスキップ（Escapeは例外）。
 */
export function handleGlobalKeyDown(event: KeyboardEvent): void {
  const combo = normalizeKeyCombo(event);
  const entries = registry.get(combo);
  if (!entries || entries.length === 0) return;

  // Escape以外は入力フィールド内でスキップ
  if (combo !== 'Escape' && isInputFocused()) return;

  // 優先度が最も高いハンドラを実行（既にソート済み）
  const topEntry = entries[0];
  if (topEntry) {
    topEntry.def.handler(event);
  }
}
