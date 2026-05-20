/**
 * Entries Service Module
 *
 * エントリ操作のサービス層エクスポート。実体（class / 型）は
 * entry-service.ts と types.ts で deep import される前提で、ここでは
 * router で使う createEntryService factory のみを公開する。
 */

export { createEntryService } from './entry-service';
