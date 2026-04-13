/**
 * History Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// --- Components ---
export { RecentBlocks } from './components/RecentBlocks';

// ここにないものはfeature内部専用
