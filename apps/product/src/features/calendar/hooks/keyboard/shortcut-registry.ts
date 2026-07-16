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

export type ShortcutHelpGroup = 'general' | 'navigation' | 'views' | 'blocks';

export type ShortcutHelpLabelKey =
  | 'calendar.shortcuts.actions.open'
  | 'calendar.shortcuts.actions.previousPeriod'
  | 'calendar.shortcuts.actions.nextPeriod'
  | 'calendar.shortcuts.actions.today'
  | 'calendar.shortcuts.actions.dayView'
  | 'calendar.shortcuts.actions.twoDayView'
  | 'calendar.shortcuts.actions.threeDayView'
  | 'calendar.shortcuts.actions.fourDayView'
  | 'calendar.shortcuts.actions.fiveDayView'
  | 'calendar.shortcuts.actions.sixDayView'
  | 'calendar.shortcuts.actions.sevenDayView'
  | 'calendar.shortcuts.actions.toggleWeekends'
  | 'calendar.shortcuts.actions.createBlock'
  | 'calendar.shortcuts.actions.createBlockNow'
  | 'calendar.shortcuts.actions.copyBlock'
  | 'calendar.shortcuts.actions.pasteBlock'
  | 'calendar.shortcuts.actions.deleteBlock'
  | 'calendar.shortcuts.actions.closeInspector';

export interface ShortcutHelpMetadata {
  group: ShortcutHelpGroup;
  labelKey: ShortcutHelpLabelKey;
  order: number;
  displayKey?: string;
}

export interface ShortcutHelpItem {
  group: ShortcutHelpGroup;
  labelKey: ShortcutHelpLabelKey;
  order: number;
  keys: string[];
}

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
  /** チートシートへ表示する場合のmetadata */
  help?: ShortcutHelpMetadata;
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
function normalizeKeyCombo(event: KeyboardEvent): string {
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

/** 現在有効な最優先handlerから、チートシート表示項目を組み立てる。 */
export function getRegisteredShortcutHelpItems(): ShortcutHelpItem[] {
  const items = new Map<string, ShortcutHelpItem>();

  for (const [registeredKey, entries] of registry) {
    const help = entries[0]?.def.help;
    if (!help) continue;

    const itemKey = `${help.group}:${help.labelKey}`;
    const displayKey = help.displayKey ?? registeredKey;
    const existing = items.get(itemKey);
    if (existing) {
      if (!existing.keys.includes(displayKey)) existing.keys.push(displayKey);
      continue;
    }

    items.set(itemKey, {
      group: help.group,
      labelKey: help.labelKey,
      order: help.order,
      keys: [displayKey],
    });
  }

  return [...items.values()].sort((a, b) => a.order - b.order);
}

const EDITABLE_SELECTOR = 'input, textarea, select, [role="textbox"], [role="combobox"]';
const OVERLAY_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"]';

/** グローバルショートカットを受け取った要素を解決する。 */
function getEventElement(event: KeyboardEvent): Element | null {
  if (event.target instanceof Element) return event.target;
  return document.activeElement instanceof Element ? document.activeElement : null;
}

/** 入力・選択操作を行う要素かどうかを判定する。 */
function isEditableElement(element: Element): boolean {
  if (element.closest(EDITABLE_SELECTOR)) return true;

  const contentEditable = element.closest('[contenteditable]');
  return contentEditable !== null && contentEditable.getAttribute('contenteditable') !== 'false';
}

/** dialog/menu/listbox が所有するキー操作かどうかを判定する。 */
function isInsideOverlay(element: Element): boolean {
  return element.closest(OVERLAY_SELECTOR) !== null;
}

/**
 * グローバルkeydownイベントを処理する
 *
 * レジストリに登録されたショートカットを照合し、最も優先度の高いハンドラを実行する。
 * 入力フィールドやoverlay内のキー操作、および既に処理済みのイベントはスキップする。
 * ただし未処理のEscapeはInspectorなどのglobal closeへ渡す。
 */
export function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;

  const combo = normalizeKeyCombo(event);
  const eventElement = getEventElement(event);
  if (
    combo !== 'Escape' &&
    eventElement &&
    (isEditableElement(eventElement) || isInsideOverlay(eventElement))
  ) {
    return;
  }

  const entries = registry.get(combo);
  if (!entries || entries.length === 0) return;

  // 優先度が最も高いハンドラを実行（既にソート済み）
  const topEntry = entries[0];
  if (topEntry) {
    topEntry.def.handler(event);
  }
}
