import 'server-only';

/**
 * 外部カレンダー provider の抽象（overview.md §7-4）。
 *
 * 目的は「Outlook（Microsoft Graph）が schema 変更ゼロで刺さる」ことの証明で、汎用の
 * sync framework や provider registry は作らない。adapter の選択は `provider` の switch で足りる。
 */

/**
 * ミラー（`external_calendar_events`）のカラムに 1:1 で対応する正規化済みイベント。
 *
 * `title` が空文字になりうる。Google の `summary` は optional だが、ミラーの
 * `external_calendar_events_active_shape` CHECK が非 cancelled 行に NOT NULL を要求するため、
 * 無題イベントは空文字で保存する。表示用の「(タイトルなし)」は UI 層の i18n の仕事で、
 * ミラーにプレースホルダ文言を焼き込まない。
 */
export type NormalizedExternalEvent = {
  providerEventId: string;
  title: string;
  description: string | null;
  /** ISO 8601（UTC 正規化済み）。ミラーの CHECK により必ず `endAt > startAt`。 */
  startAt: string;
  endAt: string;
};

/** full sync で取得する時間範囲。増分 sync では使わない（provider が併用を許さない）。 */
export type SyncWindow = {
  timeMin: string;
  timeMax: string;
};

/**
 * 1 カレンダー分の同期結果。
 *
 * overview.md §7-4 の signature から 2 フィールド拡張している。`events` だけでは
 * 「provider 側で消えた」と「こちらの都合で取り込まない」を区別できず、sync-service からは
 * どちらも「返ってこなかった」に見えてしまうため。
 *
 * - `cancelledEventIds`: provider 側で削除・キャンセルされた。増分 sync でのみ届く
 * - `skippedEventIds`: 終日イベントなど、こちらが取り込み対象外にしたもの（§6-3）。
 *   timed → 終日に変更されたイベントの古い行を掃除するのにこれが要る
 *
 * どちらも「既にミラーにある行だけ」を cancelled 化するのに使う。未知の id で行を作らない。
 */
export type SyncCalendarResult = {
  events: NormalizedExternalEvent[];
  cancelledEventIds: string[];
  skippedEventIds: string[];
  /** 次回の増分 sync に使う cursor。全ページ走破に失敗した場合は null。 */
  nextCursor: string | null;
  /** cursor が失効していた（Google の 410 / Graph の delta 失効）。呼び出し側は cursor を捨てる。 */
  cursorInvalid: boolean;
  /** この呼び出しが full sync だったか。sweep を撃ってよいかの判断に使う。 */
  usedFullSync: boolean;
};

/** 接続時に provider から得る同定情報。 */
export type ProviderConnectionIdentity = {
  refreshToken: string;
  /** provider の安定 id（Google なら id_token の `sub`）。email は可変なので使わない。 */
  accountId: string;
  accountEmail: string | null;
  grantedScopes: string[];
};

/** 取り込み候補として提示するカレンダー。 */
export type ProviderCalendar = {
  id: string;
  name: string | null;
  primary: boolean;
};

/**
 * 1 回の同期 run で使い回す provider セッション。
 *
 * overview.md §7-4 は `listCalendars(refreshToken)` / `syncCalendar(refreshToken, ...)` と
 * 書いているが、そのまま実装すると呼び出しのたびに refresh token → access token の交換が
 * 走り、カレンダー N 個の接続で N+1 回の token リクエストになる。§5-3 が言う「同期実行の
 * たびに mint する」は run 単位の話なので、run の先頭で 1 回だけ mint して使い回す。
 */
export type ProviderSession = {
  accessToken: string;
  /**
   * provider が refresh token を rotation した場合のみ非 null。
   *
   * 呼び出し側はこれを暗号化して保存し直す義務がある。黙って捨てると、provider が
   * rotation を始めた瞬間に全接続が静かに死ぬ。
   */
  rotatedRefreshToken: string | null;
};

/**
 * provider 由来の失敗の分類。
 *
 * HTTP status だけでは足りない。とくに 403 は「レート制限（一時）」と「権限剥奪・共有解除
 * （恒久）」の両方で返るので、恒久エラーを backoff に流すと再認証バナーもカレンダー選択解除の
 * 導線も出ないまま無言で同期が止まる。
 */
export type CalendarProviderErrorKind =
  /** cursor 失効。想定内なので alert しない。full sync へ落とす */
  | 'cursor_invalid'
  /** 認可が死んだ。connection を `reauth_required` にする */
  | 'reauth_required'
  /** レート制限。backoff して次回に送る */
  | 'rate_limited'
  /** カレンダーが消えた・共有が外れた */
  | 'not_found'
  /** 権限不足。リトライしても回復しない */
  | 'forbidden'
  /** provider 側の一時障害・ネットワーク断 */
  | 'transient'
  /** こちらの実装バグを含む、回復しない失敗 */
  | 'permanent';

export class CalendarProviderError extends Error {
  constructor(
    message: string,
    readonly kind: CalendarProviderErrorKind,
    /** provider が返した reason 文字列。monitoring 用に握り潰さない。 */
    readonly providerReason?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'CalendarProviderError';
  }
}

export interface CalendarProviderAdapter {
  /** `calendar_connections.provider` に入る値。 */
  readonly provider: string;

  /** OAuth の code を接続情報に交換する。 */
  exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<ProviderConnectionIdentity>;

  /** run の先頭で 1 回だけ呼ぶ。 */
  startSession(refreshToken: string): Promise<ProviderSession>;

  listCalendars(session: ProviderSession): Promise<ProviderCalendar[]>;

  syncCalendar(
    session: ProviderSession,
    params: {
      calendarId: string;
      /** null なら full sync。 */
      cursor: string | null;
      window: SyncWindow;
    },
  ): Promise<SyncCalendarResult>;

  /** best-effort（§8-1）。失効が確定したら true。 */
  revoke(refreshToken: string): Promise<boolean>;
}
