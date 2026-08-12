---
status: current
last_verified: 2026-08-12
code: apps/product/src/features/external-calendar/schemas/google.ts
---

# Google OAuth sensitive scope 審査

Google Calendar 連携が使う sensitive scope の審査を出すための提出パッケージ。申請文・デモ動画の台本・提出前チェックリストをここに置く。

**一回性の作業ではないので repo に残す。** scope を増やす・OAuth client を作り直す・アプリの説明を変える、のいずれでも再審査になる。その時にゼロから書き直さずに済むよう、Google に何をどう説明したかを本ファイルで保持する。

GCP project 側の設定手順（API 有効化・scope 登録・client 作成・secret 投入）は [issue #1702 の手順書 v2](https://github.com/Dayopt/dayopt/issues/1702#issuecomment-5248264728) が正本。本ファイルは重複させず、審査に固有の部分だけを扱う。

## 要件の確認日と一次情報

2026-08-12 に以下を一次情報として確認した。Google はこの領域の要件と Console の UI をよく変えるので、**提出の直前に必ず読み直す**。本ファイルの記述と食い違ったら一次情報が正。

- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) — 提出手順とデモ動画の要件
- [Verification requirements](https://support.google.com/cloud/answer/13464321) — homepage / privacy policy / ドメイン検証の要件
- [Manage app data access](https://support.google.com/cloud/answer/15549135) — Console 上の scope 申告と justification の入力
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) — Limited Use。**sensitive scope にも適用される**（restricted 専用ではない）

審査期間は "can take up to 10 days to complete"（sensitive scope の場合）。restricted scope ではないので、第三者機関のセキュリティ評価（CASA）は不要。

## 現状と、提出前に閉じるべきもの

| 審査要件                                                                          | 現状                                                                              | 判定                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------- |
| App name / developer contact                                                      | GCP Console に登録済み                                                            | ✅                  |
| Homepage が検証済みドメイン上にあり機能を説明している                             | `https://dayopt.app`（200 を確認）                                                | ✅                  |
| プライバシーポリシーが homepage と同一ドメインにある                              | `https://dayopt.app/legal/privacy`（200 を確認）                                  | ✅                  |
| プライバシーポリシーが **Google user data の扱いを開示**し Limited Use に準拠する | 記述が無い                                                                        | ❌ **ブロッカー 1** |
| 同意画面に scope が登録済み                                                       | `openid` / `email` / `calendar.readonly` を登録済み（#1702 手順書 v2 ステップ 2） | ✅                  |
| Authorized domains が Search Console で検証済み                                   | 外形から確認できない                                                              | ❓ **要確認**       |
| デモ動画が **scope を使う app の機能**を見せる                                    | 見せられる画面が存在しない                                                        | ❌ **ブロッカー 2** |
| 要求する scope が最小である                                                       | より狭い組み合わせが存在する                                                      | ⚠️ **要判断**       |

### ブロッカー 1: プライバシーポリシーに Google user data の記述が無い

Google は privacy policy に対して "Disclose the manner in which your application accesses, uses, stores, or shares Google user data" と "Must align with Google's Limited use requirements" を要求する。

現在の `apps/web/content/legal/{en,ja}/privacy.mdx` に Google が出てくるのは 2 箇所だけ。**どちらも Calendar 連携の説明になっていない。**

- `subProcessors.google` — Gmail をサポート問い合わせの受信箱として使う、という sub-processor の記載
- `legalBasis.contract` — "including account management, task storage, and calendar synchronization" という一語

取得する scope・保存するフィールド・保持期間・削除・Limited Use 準拠のいずれも書かれていない。**この状態で出すと落ちる。** 追加すべき記述の素案は §プライバシーポリシーに追加する記述 に置いた。

### ブロッカー 2: scope で取ったデータを使う画面が無い

Google はデモ動画に "The app functionalities that utilize the requested OAuth scopes" を要求し、Limited Use は "user-facing features that are **prominent in the requesting application's user interface**" を要求する。

一方 epic #1702 の DoD 6 は「Calendar 画面には何も表示されない」を**意図的に**達成した状態で、取り込んだ予定を表示する導線は現時点でゼロ。ユーザーから見える同期の証拠は Settings → Integrations の以下だけ（`apps/product/src/features/external-calendar/components/GoogleCalendarSettingsView.tsx`）。

- ステータスバッジ "Connected"
- "Last sync: {日時}"
- 手動同期後のトースト "Google Calendar synced"

取り込み件数の表示すら無い。つまり今のまま撮ると、動画は「Google にログインして同意したら、設定画面に Connected と出た」で終わり、**calendar.readonly で読んだ予定が何に使われるのかを一度も見せられない。**

**#1962（ミラーの UI 接続 / ghost 表示）を production に出してから提出する。** 審査の外部待ちを先に消化したくなるが、この状態で出して reject されると出し直しでかえって遅くなる。

### 要判断: `calendar.readonly` はこのアプリにとって最小ではない

Google は "Request only the **narrowest** scope(s) needed" と要求し、justification 欄で「なぜより狭い scope では不十分か」を問う。

Dayopt が呼ぶ Calendar API は 2 つだけで、それぞれをより狭い scope が単独でカバーする（各 API リファレンスの Authorization セクションで確認）。

| 呼んでいる API      | 用途                                   | 現在の scope        | より狭い scope                   |
| ------------------- | -------------------------------------- | ------------------- | -------------------------------- |
| `calendarList.list` | ユーザーに取り込むカレンダーを選ばせる | `calendar.readonly` | `calendar.calendarlist.readonly` |
| `events.list`       | 選択されたカレンダーの予定を読む       | `calendar.readonly` | `calendar.events.readonly`       |

つまり `calendar.calendarlist.readonly` + `calendar.events.readonly` の 2 本で用途を完全に満たし、`calendar.readonly` が追加で与える権限（ACL・設定・任意カレンダーの freebusy など）は**一つも使っていない**。

これは「落ちるかもしれない」以前に、**justification 欄に正直に書けない**ことを意味する。より狭い選択肢が実在する以上、「より狭い scope では不十分」と書けば虚偽になる。

**推奨: 提出前に narrow pair へ切り替える。** 変更は小さい:

1. `apps/product/src/features/external-calendar/schemas/google.ts` の `GOOGLE_AUTHORIZATION_SCOPES` を 2 本立てに変える
2. `hasCalendarReadonlyScope()`（`server/google-oauth.ts:372`）は現在 `calendar.readonly` の完全一致を要求する。新 scope を受け付けるよう広げる。**既存の接続済みユーザーは `calendar.readonly` で grant 済み**なので、旧 scope も引き続き通す（この検査は callback 時にしか走らないため保存済み接続は壊れないが、再接続で落ちる）
3. GCP の同意画面で 2 本を追加登録する（`calendar.readonly` は削除する）

どちらも sensitive scope なので審査が不要になるわけではない。狭くする目的は、審査を通しやすくすることと、ユーザーに渡す権限を実際の用途に合わせることの 2 つ。

**切り替えないと決めた場合**、justification は「narrower scopes are insufficient」と書かず、§申請文 の fallback を使う。reject または追加質問のリスクは上がる。

### 要確認: ドメイン検証

`dayopt.app` の Search Console 検証状態が外形から判定できなかった。

- live HTML に `google-site-verification` の meta タグが無い（`GOOGLE_SITE_VERIFICATION` env が production 未設定と思われる）
- DNS の TXT レコードに検証トークンが無い
- repo の `apps/web/public/` に検証用 HTML ファイルが無い

HTML ファイル / Google Analytics / Tag Manager など別方式で検証済みの可能性はあるので、未検証と断定はしない。**Search Console を開いて確認する**（チェックリストのステップ 1）。未検証なら scope 申請そのものが進まない。

## 申請文

Console の入力欄にそのまま貼る英語テキスト。**事実だけを書く。** 誇張や、実装していない機能の記述を混ぜない — 動画と食い違うと落ちる。

以下の英文が主張する実装の事実（呼ぶ API、保存するフィールド、±90 日、切断時の挙動、暗号化）は 2026-08-12 に `risk-reviewer` の反証レビューで実装と 1 件ずつ突き合わせた。**同期の実装を変えたらこの英文も直す。** Google に出した説明と実装が食い違うのは、審査の指摘では済まず Limited Use 違反になりうる。

### App description（何をするアプリか）

```
Dayopt is a personal daily planning app. A user plans their day as time blocks,
then records what actually happened in the same timeline, so they can see the gap
between the plan and the result.

Most users already keep their meetings and appointments in Google Calendar. The
Google Calendar integration imports those existing commitments into Dayopt as
read-only entries, so the user can plan the rest of their day around them without
retyping each one. Dayopt never writes to, modifies, or deletes anything in Google
Calendar; the integration is one-way and read-only.

The integration is optional. Dayopt is fully usable without connecting a Google
account, and the user chooses exactly which of their calendars are imported.
```

### Scope justification — `calendar.calendarlist.readonly`（narrow pair を採用する場合）

```
Dayopt calls calendarList.list to show the user the list of their calendars so
they can choose which ones to import. It is called on demand, when the user opens
the integration settings screen for a connected account and after they change
their selection, so that the list they see is current. Only the calendar
identifier, the calendar name, and the primary flag are used. The identifier and
the name are stored alongside imported events so the user can tell which calendar
an entry came from.

This is the narrowest scope that authorizes calendarList.list. Dayopt does not
create, modify, or delete calendars, and does not read calendar ACLs or settings.
```

### Scope justification — `calendar.events.readonly`（narrow pair を採用する場合）

```
Dayopt calls events.list on the calendars the user explicitly selected, to import
their existing commitments into the user's Dayopt timeline. This is the feature
users connect the integration for: it lets them plan their day around meetings they
already have, instead of retyping each meeting into Dayopt by hand.

Dayopt requests a fixed, limited window of plus or minus 90 days around the current
date, and uses incremental sync tokens afterwards so it only fetches what changed.
Timed events are imported; all-day events are skipped.

From each event, Dayopt stores only these fields:
  - the event ID (to match the same event across syncs)
  - the title
  - the description
  - the start and end times
  - the Google-assigned identifier and the name of the calendar the event came
    from, so the user can tell which calendar an entry belongs to. Note that for
    a user's own calendar this identifier is typically their own email address,
    and for a calendar another person shared with them it may be that person's
    email address.

Dayopt does not request a partial response, so the events.list reply it receives
is the standard Event resource. Every field Dayopt does not need is discarded at
the parsing boundary: attendees, guest email addresses, locations, conferencing
links, attachments, and organizers are never used, never stored, and never
written to logs.

This is the narrowest scope that authorizes events.list. Dayopt does not create,
modify, or delete events, and does not access free/busy information for calendars
the user has not selected.
```

### Scope justification — `calendar.readonly`（narrow pair へ切り替えない場合の fallback）

より狭い scope が存在する以上、「不十分だ」とは書かない。**採用する場合はこの弱さを承知の上で出す**（§要判断 参照）。

```
Dayopt uses this scope for exactly two API calls:

  - calendarList.list, called on demand when the user opens the integration
    settings screen for a connected account and after they change their
    selection, so the user can choose which of their calendars to import and
    always sees a current list.
  - events.list, called on the calendars the user explicitly selected, to import
    their existing commitments into the user's Dayopt timeline.

Dayopt requests a fixed window of plus or minus 90 days around the current date,
and uses incremental sync tokens afterwards. Timed events are imported; all-day
events are skipped.

From each event, Dayopt stores only the event ID, the title, the description, the
start and end times, and the Google-assigned identifier and name of the calendar
the event came from. Note that a calendar identifier is typically an email address:
the user's own for their own calendar, and the sharing person's for a calendar
shared with them. Dayopt does not request a partial response, so the events.list
reply it receives is the standard Event resource; every field it does not need is
discarded at the parsing boundary. Attendees, guest email addresses, locations,
conferencing links, attachments, and organizers are never used, never stored, and
never written to logs.

Dayopt never writes to Google Calendar. It does not create, modify, or delete
calendars or events.
```

### Scope justification — `openid` / `email`

sensitive ではないので justification 欄が出ないことがある。求められた場合はこれを使う。

```
openid is required because Google only returns an ID token for OpenID Connect
authentication requests. Dayopt uses the stable "sub" identifier from that ID token
to tell which Google account a connection belongs to, and to detect when a user
reconnects with a different account than the one originally connected.

email is used for two things. It is displayed in the app's integration settings
screen so that a user with more than one connected account can tell them apart.
It is also passed back to Google as the login_hint when the user reconnects an
account whose access has expired, so the consent screen suggests the same account
they connected originally. Dayopt does not rely on the email address for identity;
the account match is verified against the "sub" identifier described above.
```

### Data handling summary（別途聞かれた場合）

```
Refresh tokens are encrypted with AES-256-GCM at the application layer before being
stored. Access tokens are never persisted: one is obtained whenever Dayopt needs to
call Google on the user's behalf — when the account is first connected, when the
user's calendar list is loaded, and on each sync run — and is held in memory only
for the duration of that operation.

Dayopt also stores the email address and the stable account identifier ("sub") of
the connected Google account, so that it can show the user which account is
connected and confirm that a reconnection is for the same account. Both are deleted
when the user disconnects the account or deletes their Dayopt account.

Imported events are stored per user. Google user data is not sold, is not used for
advertising, and is not used to train any AI or machine learning model. It is not
transferred to third parties, with two exceptions:

  - the infrastructure providers that host the application, documented in the
    privacy policy;
  - applications that the user has themselves explicitly authorized to read their
    Dayopt entries through Dayopt's own API. This transfer happens only at the
    user's direction, only to a client the user approved, and only for entries the
    user has incorporated into their own timeline. The user can revoke that
    authorization at any time.

When a user disconnects, Dayopt asks Google to revoke the refresh token on a
best-effort basis; if Google cannot be reached, Dayopt records the failure and
still completes the disconnect rather than leaving the user connected. It then
deletes the previously imported events, except for entries the user has already
incorporated into their own records, which remain as part of the user's own
history, and deletes the stored credentials. Deleting the Dayopt account removes
all of it.
```

**この段落は 2 箇所で実装に合わせてある。書き換えるときに戻さない。**

- **revoke は best-effort。** `revokeRefreshToken()`（`server/google-oauth.ts:299-322`）はネットワーク失敗や想定外のエラーで `false` を返し、`disconnect()`（`server/connection-service.ts:596-633`）はそれでも切断を続行する（`reportUnrevokedGrant` で Sentry に送る）。「revokes」と断定形で書くと、実際には失敗しうる動作を保証したことになる。アプリ内の確認ダイアログも "Dayopt will **try to** revoke Google access" と書いてある
- **削除されるのは参照されていないミラー行だけ。** ユーザーが自分の Plan / Record に紐づけた予定は履歴として残る（`connection_id` が NULL になる）。実際の順序は revoke → 未参照イベントの削除 → 接続行（= 認証情報）の削除

## デモ動画の台本

撮影は User。**動画は audit の対象で、審査官は同意画面のアドレスバーまで見る。** 撮り直しは審査 1 ラウンド分の待ち時間になるので、撮影条件を先に揃える。

### 撮影条件

| 条件         | 内容                                                                                                         | 理由                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 言語         | **UI を英語にする**（`https://app.dayopt.app/en/...`）                                                       | Google が "in English" を明示要求                                                                                                                                |
| アドレスバー | ブラウザのアドレスバーを**常に画面内に入れる**                                                               | 同意画面 URL に含まれる client ID を審査官が確認する                                                                                                             |
| アカウント   | 実際の Google アカウント。撮影で選ぶカレンダーに、**現在日時の前後 90 日以内の時刻指定の予定**が数件あること | 取り込み範囲が ±90 日で、終日予定は除外される。祝日・誕生日のような終日予定や範囲外の予定しか無いと、Apply も同期も成功するのにシーン 9 で何も出ず撮り直しになる |
| 環境         | production（`https://app.dayopt.app`）                                                                       | 審査対象の client ID で動く必要がある。Preview は OAuth 無効                                                                                                     |
| 事前状態     | 対象アカウントを**一度 disconnect しておく**                                                                 | 接続フローを頭から見せるため                                                                                                                                     |
| 公開設定     | YouTube に**限定公開（unlisted）**でアップロード                                                             | Google の要求。非公開だと審査官が見られない                                                                                                                      |
| 音声         | 不要。字幕・キャプションがあると親切                                                                         | 要求はされていない                                                                                                                                               |

### シーン構成

| #   | 画面                                            | 見せること                                                                                                                      | 尺        |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | `https://dayopt.app`                            | homepage。アプリが何をするものか分かる状態                                                                                      | 5 秒      |
| 2   | `https://app.dayopt.app/en/week` にログイン済み | 週表示。ここが「予定を計画する場所」だと分かる                                                                                  | 10 秒     |
| 3   | Settings → **Integrations**                     | "Google Calendar" カード。説明文 "Choose which Google calendars to import into Dayopt." と **"Connect Google account"** ボタン  | 10 秒     |
| 4   | ボタンをクリック → Google の画面へ遷移          | **アドレスバーを映したまま**。`accounts.google.com` の URL に client ID が入っているのが読める状態で一拍止める                  | 8 秒      |
| 5   | Google アカウント選択 → 同意画面                | **アプリ名 "Dayopt" が表示されていること**と、要求している scope が全部読めること。スクロールして全 scope を映す                | 15 秒     |
| 6   | 「続行」→ Dayopt へ戻る                         | callback 後に "Google account connected" のトーストが出る                                                                       | 5 秒      |
| 7   | Integrations の Google Calendar カード          | **"Calendars to import"** のチェックボックス一覧。実際のカレンダー名が出ている。1〜2 個チェックして **"Apply"**                 | 15 秒     |
| 8   | 同カード                                        | ステータス **"Connected"** と **"Last sync: {日時}"** が更新される。**"Sync now"** を押して "Google Calendar synced" のトースト | 10 秒     |
| 9   | **週表示に戻る**                                | **取り込んだ Google の予定が、ユーザーの計画と並んで表示されている**。ステップ 7 で選んだカレンダーの予定だと分かる             | **20 秒** |
| 10  | 週表示                                          | その予定を避けて自分のブロックを置く。scope で取ったデータが何の役に立つかを見せる                                              | 15 秒     |
| 11  | Integrations → **"Disconnect"**                 | 確認ダイアログ "Disconnect this Google account?" と説明文。実行して "Google account disconnected"                               | 10 秒     |
| 12  | 週表示                                          | 取り込まれていた予定が消えている（ユーザー自身のブロックは残る）                                                                | 8 秒      |

合計 2 分強。

**ステップ 9・10・12 が動画の中核で、ブロッカー 2 が閉じていないと撮れない。** #1962 が production に出るまで、この 3 つは存在しない画面になる。ステップ 8 までで終わる動画は「同意は取ったが何にも使っていない」ように見えるため、提出しない。

### 撮り終えたら

- 通しで一度見て、**同意画面のアプリ名が "Dayopt" になっているか**を確認する（GCP のアプリ名を後から変えると再撮影）
- 個人情報が映り込んでいないか確認する。実カレンダーの予定タイトルは映る前提だが、見られて困るものが入っていないかは撮影者にしか判断できない
- YouTube に限定公開でアップし、URL を控える

## 提出前チェックリスト

User が GCP Console / Search Console で操作する項目。**上から順に実行する**（依存関係がある）。

### ステップ 1 — ドメイン検証を確認する

1. https://search.google.com/search-console を開く
2. プロパティ一覧に **`dayopt.app`** があり、検証済みになっているか確認する
3. 無ければ追加して検証する。**GCP project のオーナーまたは編集者である Google アカウントで行う**（別アカウントで検証しても審査に使えない）
4. ドメインプロパティ（DNS TXT）で検証すると `app.dayopt.app` も含めて一度で済む。DNS は Cloudflare

### ステップ 2 — 同意画面の登録内容を確認する

`https://console.cloud.google.com/auth/branding?project=dayopt-503623`

1. **アプリ名**が `Dayopt` になっている（動画に映る名前と完全一致させる）
2. **ユーザーサポートメール**が現行の連絡先になっている
3. **アプリのロゴ**が登録されている。未登録なら `apps/product/public/icons/icon-512.png` を使う。Google が公開している要件は **正方形・120×120px 推奨・1MB 以下・JPG / PNG / BMP** で、この画像は 512×512 の PNG（48KB）なので満たす。**ブランドを一意に識別できること**も要件なので、汎用アイコンや他社ロゴに似たものは使わない。透過の可否は公開ドキュメントに記載が無いため、Console のアップロード時の検証に従う（弾かれたら不透明な背景を敷いた版を作る）
4. **アプリケーションのホームページ** = `https://dayopt.app`
5. **プライバシーポリシー** = `https://dayopt.app/legal/privacy`
6. **利用規約** = `https://dayopt.app/legal/terms`
7. **承認済みドメイン**に `dayopt.app` が入っている
8. **デベロッパーの連絡先情報**が現行のメールアドレス

ロゴを新規登録・変更すると自動レビューが入り、**7 日以内に公開しないと再検証**になる。ロゴの差し替えは提出直前にまとめて行う。

### ステップ 3 — scope の登録を確認する

`https://console.cloud.google.com/auth/scopes?project=dayopt-503623`

- narrow pair へ切り替えた場合: `openid` / `email` / `calendar.calendarlist.readonly` / `calendar.events.readonly` の 4 本。**`calendar.readonly` は削除する**
- 切り替えない場合: `openid` / `email` / `calendar.readonly` の 3 本

**アプリ側が要求する scope と完全に一致させる**（`GOOGLE_AUTHORIZATION_SCOPES`）。ここに登録されていない scope を要求すると同意画面でエラーになり、逆に余分に登録すると審査官に「使っていない scope を要求している」と見なされる。

### ステップ 4 — 前提が全部閉じているか確認する

- [ ] プライバシーポリシーに Google Calendar の節が公開済み（ブロッカー 1）。`https://dayopt.app/legal/privacy` を実際に開いて目視する
- [ ] #1962 が production に出ていて、週表示に取り込んだ予定が出る（ブロッカー 2）
- [ ] デモ動画を撮影して YouTube に限定公開で上げた
- [ ] 動画の中の同意画面に出るアプリ名が、ステップ 2 のアプリ名と一致している

### ステップ 5 — 審査を申請する

`https://console.cloud.google.com/auth/verification?project=dayopt-503623`

1. 「確認を準備」/「Prepare for verification」から申請フォームを開く
2. 各 sensitive scope に §申請文 の justification を貼る
3. デモ動画の YouTube URL を貼る
4. 内容を読み返してから送信する

送信後、**同じ project の scope を変更しない**。変更すると審査がやり直しになる。

### ステップ 6 — 提出したことを記録する

#1963 に提出日・提出した scope・動画 URL をコメントする。Google からの指摘も同じ issue に集約する。

## 審査中・審査後

- **審査期間は最大 10 日**。Google からの連絡は同意画面に登録した「デベロッパーの連絡先情報」宛に来る。**このメールを見落とすと審査が止まる**ので、提出したら受信箱を見ておく
- 追加質問が来ることがある（用途の再説明、動画の撮り直し、プライバシーポリシーの文言修正）。#1963 で対応する
- 通過したら、同意画面から「未確認のアプリ」警告が消え、100 ユーザーの上限が外れる。**実際に接続して同意画面を見て確認する**（Console のステータス表示だけを根拠にしない）
- 通過後に scope を増やす・アプリ名やロゴを変える・OAuth client を作り直すと再審査になる。その時は本ファイルを更新して使い回す

## プライバシーポリシーに追加する記述

ブロッカー 1 を閉じるための素案。**本ファイルでは修正しない**（#1963 の scope 外）。別 issue で `apps/web` に反映する。

反映先は 3 箇所。既存の `aiFeatures` 節がそのまま先行事例になる。

1. `apps/web/src/app/[locale]/(marketing)/legal/_components/legal-standard-document.tsx` の節レジストリに `googleCalendar` を追加する
2. `apps/web/content/legal/en/privacy.mdx` に英語の節を追加する
3. `apps/web/content/legal/ja/privacy.mdx` に日本語の節を追加する

英語の素案（実装の事実に合わせてある。実装が変わったら文も直す）:

> **Google Calendar Integration**
>
> If you choose to connect a Google account, Dayopt reads your calendars so that
> you can plan your day around the commitments you already have. This is optional
> and one-way: Dayopt never creates, modifies, or deletes anything in your Google
> Calendar.
>
> - **What we access**: the email address and account identifier of the Google
>   account you connect, the list of your calendars, so you can choose which ones
>   to import, and the events on the calendars you select.
> - **The connected account**: we store the account's email address and its stable
>   Google account identifier. We show you the email address so you can tell your
>   connected accounts apart, and we use it to suggest the right account if you
>   ever need to reconnect. We use the account identifier to confirm that a
>   reconnection is for the same account you connected originally. Both are deleted
>   when you disconnect the account.
> - **What we store**: for each imported event, only its identifier, title,
>   description, and start and end times, together with the identifier and name of
>   the calendar it came from. For a calendar someone shared with you, that
>   calendar identifier may be the sharing account's email address. Google's reply
>   contains more than this, but we discard everything else as we read it:
>   attendees, guest email addresses, locations, conferencing links, and
>   attachments are never used, never stored, and never written to our logs.
> - **How much we read**: a window of 90 days before and after the current date.
>   All-day events are not imported.
> - **How we use it**: only to show you those events inside your own Dayopt
>   timeline. Imported events are visible only to you, and we never share them with
>   anyone else unless you ask us to. The one case where you can ask us to is
>   Dayopt's own API: if you connect another application and grant it permission to
>   read your Dayopt entries, that application will receive the entries you have
>   built from your calendar. That only happens for applications you have
>   authorized yourself, and you can revoke the permission at any time.
> - **How it is protected**: the credentials that let Dayopt read your calendar are
>   encrypted before they are stored.
> - **How to stop it**: disconnect the account at any time from Settings. Dayopt
>   asks Google to revoke its access, deletes the stored credentials, and deletes
>   the imported events. Entries you have already incorporated into your own
>   records remain as part of your own history. You can also revoke Dayopt's access
>   directly from your Google account's security settings at any time.
>
> Dayopt's use of information received from Google APIs adheres to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements. We do not sell this data, do not use it
> for advertising, and do not use it to train AI or machine learning models.

最後の Limited Use への明示的な言及は Google が要求する定型。**この一文を落とさない。**

日本語版は同じ内容を `docs/business/content/writing-style.md` の文体で書く。法務文書なので、他の節の語彙・敬体に合わせる。
