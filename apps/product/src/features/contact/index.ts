/**
 * Contact Feature - Public API
 *
 * docs: docs/product/specs/contact.md
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Components ---
// 値 export はこの 1 つだけに保つ（1:1 facade）。GlobalOverlays が
// `import('@/features/contact')` で dynamic import しており、値 export を増やすと
// その分が contact dialog の chunk へ入る。増やす時は chunk サイズへの影響を確認するか、
// deep import へ戻す（.claude/rules/feature-boundaries.md §Composition Layer からの dynamic import 例外）。
export { ContactDialog } from './components/ContactDialog';

// ここにないものはfeature内部専用。
// 型（ContactCategory / ContactFormInput）は feature 内からのみ参照されているため
// 公開していない。cross-feature の consumer ができた時点で export を足す。
