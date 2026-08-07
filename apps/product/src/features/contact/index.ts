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

// ここにないものはfeature内部専用。
// 型（ContactCategory / ContactFormInput）は feature 内からのみ参照されているため
// 公開していない。cross-feature の consumer ができた時点で export を足す。
