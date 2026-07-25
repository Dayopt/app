import { z } from 'zod';

/**
 * Google Calendar API v3 のレスポンス schema。
 *
 * `google.ts` は OAuth / OpenID Connect の関心事で、こちらは Calendar API の関心事。
 * 同じ Google でも失効条件もエラー shape も別物なので分けている。
 *
 * 外部から来る値なので、repo の外部入力 parse の idiom（`api/csp-report/route.ts`）に倣って
 * 全 string に `.max()` を置く。googleapis SDK は入れず素の fetch + zod（overview.md §5-2）。
 */

/** 説明欄は HTML を含みうるので広めに取る。これを超えるものは取り込みを諦めて skip する。 */
const MAX_DESCRIPTION_LENGTH = 32_768;
/** provider の opaque token 類（syncToken / pageToken）。 */
const MAX_TOKEN_LENGTH = 4096;

/**
 * refresh grant のレスポンス。
 *
 * **`googleTokenResponseSchema` を流用してはいけない。** あちらは `id_token` を必須にしているが、
 * refresh grant のレスポンスに `id_token` は入らない（Google が返すのは初回の code 交換時と、
 * openid scope 付きの一部ケースのみ）。流用すると全 refresh が parse に失敗する。
 *
 * `refresh_token` も optional。Google は通常 rotation しないが、返ってきた場合は保存し直す。
 *
 * @see https://developers.google.com/identity/protocols/oauth2/web-server
 */
export const googleRefreshTokenResponseSchema = z.object({
  access_token: z.string().min(1).max(MAX_TOKEN_LENGTH),
  refresh_token: z.string().min(1).max(MAX_TOKEN_LENGTH).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().max(MAX_TOKEN_LENGTH).optional(),
  token_type: z.string().max(64).optional(),
});

export type GoogleRefreshTokenResponse = z.infer<typeof googleRefreshTokenResponseSchema>;

/**
 * Google API の旧式エラー body。
 *
 * `error.errors[0].reason` が無いと 403 の「レート制限」と「権限不足」を区別できない。
 * ただし shape 変化に耐えるため errors[] 自体を optional にし、判定は HTTP status を
 * 第一条件、reason を第二条件にする。
 *
 * @see https://developers.google.com/workspace/calendar/api/guides/errors
 */
export const googleApiErrorSchema = z.object({
  error: z.object({
    code: z.number().int().optional(),
    message: z.string().max(2048).optional(),
    errors: z
      .array(
        z.object({
          domain: z.string().max(128).optional(),
          reason: z.string().max(128).optional(),
        }),
      )
      .optional(),
  }),
});

/**
 * イベントの開始・終了時刻。
 *
 * `date` と `dateTime` は排他で、`date`（`yyyy-mm-dd`）があれば終日イベント。
 * 終日の `end.date` は exclusive（翌日）だが、MVP では終日を取り込まない（§6-3）ので
 * その変換は書かない。
 */
const googleEventDateTimeSchema = z.object({
  date: z.string().max(32).optional(),
  dateTime: z.string().max(64).optional(),
  timeZone: z.string().max(128).optional(),
});

/**
 * events.list の item。
 *
 * **`id` 以外はすべて optional にする。** incremental sync が返す cancelled item は
 * 「`id` のみ populated が保証」で、recurring の cancelled exception でも
 * `id` / `recurringEventId` / `originalStartTime` しか保証されない。`summary` / `start` /
 * `end` / `updated` を必須にすると incremental が必ず parse に失敗する。
 *
 * `status` は API 上 optional（既定 `confirmed`）なので default を置く。cancelled 判定は
 * この値だけが根拠になる。
 *
 * @see https://developers.google.com/workspace/calendar/api/v3/reference/events
 */
export const googleEventSchema = z.object({
  id: z.string().min(1).max(1024),
  status: z.string().max(64).default('confirmed'),
  summary: z.string().max(1024).optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  start: googleEventDateTimeSchema.optional(),
  end: googleEventDateTimeSchema.optional(),
});

export type GoogleEvent = z.infer<typeof googleEventSchema>;

/**
 * events.list のレスポンス封筒。
 *
 * `items` は `unknown[]` として受け、1 件ずつ `googleEventSchema` で parse する。
 * 想定外の 1 件でページ全体を落とすと、そのカレンダーが永久に同期できなくなる。
 *
 * `nextPageToken` と `nextSyncToken` は排他で、`nextSyncToken` は最終ページにしか来ない。
 */
export const googleEventsListResponseSchema = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().max(MAX_TOKEN_LENGTH).optional(),
  nextSyncToken: z.string().max(MAX_TOKEN_LENGTH).optional(),
});

/** calendarList.list の item。取り込み対象の選択肢を出すために id と表示名だけ要る。 */
export const googleCalendarListEntrySchema = z.object({
  id: z.string().min(1).max(1024),
  summary: z.string().max(1024).optional(),
  summaryOverride: z.string().max(1024).optional(),
  primary: z.boolean().optional(),
});

export const googleCalendarListResponseSchema = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().max(MAX_TOKEN_LENGTH).optional(),
});
