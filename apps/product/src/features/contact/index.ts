/**
 * Contact Feature - Public API
 *
 * docs: docs/product/specs/contact.md
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Components ---
export { ContactDialog } from './components/ContactDialog';

// --- Types ---
export type { ContactCategory, ContactFormInput } from './types';

// ここにないものはfeature内部専用
