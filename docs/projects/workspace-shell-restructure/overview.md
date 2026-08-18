---
status: active
last_verified: 2026-08-18
code:
  - apps/product/src/app/[locale]/(app)
  - apps/product/src/proxy.ts
  - apps/product/src/features/review
  - docs/strategy.md
  - docs/product/principles.md
---

# workspace-shell-restructure — 分析をフルページへ戻し URL を `/calendar` と `/report` に統一する

[epic #2181](https://github.com/Dayopt/dayopt/issues/2181) で User が裁可した「Notion 型 Sidebar タブ + `/calendar` / `/report` の 2 URL」を、route 契約・shell 構造・ページ構成へ落とす全体設計書。**大規模判定**（公開 URL 契約の変更を含み、blast radius が routing / shell / review / E2E / sitemap 横断、想定 Step 6）。

決定の経緯と確定仕様は epic #2181 が正本で、本書はそれを実装計画に翻訳する。進捗・残作業は epic 側に置き、本書には設計と理由だけを書く（`.claude/rules/workflow.md` §issue と docs の分担）。

**スライス凍結方式**で書く。凍結順は (1) URL / redirect（不可逆部分）→ (2) shell / Sidebar タブ構造 → (3) `/report` ページ構成。各スライスは `/plan-review` を通してから凍結する。

---

## 1. Goal

カレンダーと分析を「同一画面の主従」ではなく「Sidebar タブで切り替わる 2 つの対等な作業面」にし、その 2 面をそれぞれ `/calendar` と `/report` という単一の正規 URL で表す。

## 2. Minimum Viable Approach

骨格は 4 手。ここに含まれないものは §11 で明示的に却下する。

1. **URL 契約を確定し、redirect と view の読み書きを同時に直す** — `/calendar` と `/report` を新設し、旧 URL（`/week` `/day` `/[nday]` と `?panel=`）から redirect する。**`CalendarNavigationContext` の view 読み書きも同じ手に含める**（redirect だけでは動かない。§4-2-b）
2. **shell にタブを戻す** — Sidebar 上部のタブが Sidebar 本体とメイン領域を同時に切り替える。pathname から現在タブを導く dispatcher を再実装する（旧 `8c9e497b4` の Option Y の型。§5）
3. **`/report` に中身を移す** — `CalendarReviewRail` の review / diff の内容をフルページ構成へ移植し、そこで初めて `/report` の期間パラメータを凍結する
4. **周辺資産を追従させる** — robots / E2E / アプリ内リンク / メールテンプレート

**この project はデータ層に一切触れない。** migration も RPC もない。不可逆性は「公開 URL の契約」1 点に集中しており、それを §4 で閉じる（ただし完全にゼロにはならない。§4-7）。

## 3. 反転の正当化 — 明文化された原則と衝突している

**この project は、repo に明文化された 2 つの記述と正面から衝突する。** 忖度を避けるため先に書く。

| 出典                                                   | 現行の記述                                                                                                 | 本 project との関係                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `docs/strategy.md` §4 原則 10                          | 「ズレは部屋ではなく、瞬間に置く。**レビュー専用ページ・独立した分析画面を作らない**」                     | **正面から反転**                                 |
| `docs/product/principles.md` L35                       | 「分析の置き場は右サイドパネル。**独立したレビューページ・統計ページは作らない**」                         | **正面から反転**                                 |
| `docs/projects/tag-model-replacement/overview.md` §6-4 | 「置き場所は右サイドパネルのまま」「**専用ページを作らない**。セグメントの CRUD も右パネル内で完結させる」 | **正面から反転**（本日凍結・merge 済みの設計書） |

epic #2181 は 2026-05-01 / 2026-06-25 の panel 化コミットを一次資料として提示し、User はその上で反転を裁可した。しかし **epic 本文が挙げた根拠は「実装コミット」であって、上表の 3 つの明文化された原則には言及していない**。したがって本設計は、裁可の射程を次のように解釈する。

- **User が裁可したのは「分析の置き場」の反転**であり、原則 10 が守ろうとした**目的**（分析が目的化して Toggl / RescueTime のレポート領土に入ることを防ぐ）の放棄ではない
- したがって本 project は**原則 10 を削除せず、目的を保ったまま手段を書き換える**。改訂案は §3-2

### 3-1. 前提の何が変わったか

原則 10 が書かれた時点と本日で、事実が 1 つ変わっている。#2162 の 3 構造モデルで**セグメント（保存された分析クエリ）**が導入され、分析が「軽い横目」から「問いを持って見る場所」へ性格を変えた。

- 横目で見るもの（今日のズレ、今週の差分）は**依然としてカレンダー上と脇のパネルに置くべき**で、これは変わらない
- 問いを持って見るもの（「集中系は何時間か」「このカテゴリーの見積もり精度は 4 週前と比べてどうか」）は、カレンダーの脇の細い帯では読めない

原則 10 の「分散して現れる」は前者には今も正しい。反転が必要なのは後者だけである。

### 3-2. 原則の改訂案（本 project の scope に含める）

原則 10 を削除せず、**分析を「行き先」にしないための歯止めを、置き場所の規定から中身の規定へ移す**。

> **改訂案（原則 10）**: ズレは部屋ではなく、瞬間に置く。今日のズレはカレンダーの上と脇のパネルに分散して現れ、そこから消さない。`/report` は「問いを持って見に行く場所」として存在してよいが、**レポートビルダーにはしない** — 期間指定の複雑なフィルタ・カスタムレポート・保存フィルタの入れ子・グルーピングの自由化は足さない（Toggl / RescueTime の領土）。

#### 3-2-a. 引き継ぐ歯止め（`tag-model-replacement` §6-4 からの明示継承）

§6-4 は歯止めを 4 点並べていた。本 project はそのうち「専用ページを作らない」1 点だけを外す。**残りは 1 つも緩めず、`/report` の設計へそのまま持ち込む。** 歯止めを 1 つ外すなら残りを緩めない、という形で釣り合いを取る。

| §6-4 の歯止め                                                | 本 project での扱い | どこで効かせるか                                                                                         |
| ------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------- |
| 専用ページを作らない                                         | **外す**            | この project の目的そのもの                                                                              |
| **期間はページが今見ている期間に従う**（持たせない）         | **継承**            | §6-3 — `range` は `day` \| `week` の 2 値だけ。任意期間・`from`/`to`・月次を URL にも UI にも置かない    |
| **指標は固定**（セグメント側で選ばせない）                   | **継承**            | §6-1 — セクションの並びを固定リストで持ち、条件分岐で生やせないようにする                                |
| **グルーピング・並べ替え・保存フィルタの入れ子を持たせない** | **継承**            | §5-5 — セグメントの並び替え・フォルダ分け・共有を v1 に入れない（§11 で明示的に却下）                    |
| セグメントに保存させるのはアクティビティの集合だけ           | **継承**（不変）    | #2162 の schema 側の制約（`segment_activities` はアクティビティのみを束ねる）。本 project は何も足さない |

**継承を明示する理由**: 歯止めが「置き場所は右パネル」に紐づいて書かれていたため、置き場所を変えると**歯止めごと失効したように読める**。実際には 4 点のうち 3 点は置き場所と独立した制約で、`/report` でもそのまま成立する。ここで書き写しておかないと、次に `/report` を触る人が「§6-4 は右パネル前提の文書だから今は関係ない」と読む。

**この改訂は User 承認済み**（2026-08-18、指揮台経由で伝達）。原則の書き換えは価値判断なのでレーン単独では決めず、指揮台へ上げて裁可を得た。実改訂は §9 Step 7 として独立させる（設計書の凍結と docs の書き換えを同じ PR に混ぜない）。

**`docs/strategy.md` §4 原則 10 と `docs/product/principles.md:35` は必ず同時に直す。** `principles.md` は strategy.md 優先を宣言しているため、**片方だけ直すと後続レビューが未改訂の側を根拠に本 project を差し戻せる**。Step 7 の完了条件に両方を含める（指摘: レーン G、2026-08-18）。

**原則 10 は削除ではなく更新。** 「レビュー専用ページを作らない」という手段は変わるが、それが守っていた理由（分析が目的化して Toggl / RescueTime のレポート領土に入るのを防ぐ）は残す。理由ごと消すと、次に「カスタムレポートを足そう」という提案が来た時に押し返す根拠が無くなる。

---

### 3-3. 右サイドパネルは残さず廃止する（User 直接指示）

2026-08-18、設計中に User から直接届いた指示: 「**サイドパネルを消すのが正解。**」

これで `/report` と右パネルの並存という選択肢が消え、設計が 1 本に定まる。帰結:

- `?panel=review` / `?panel=diff` は `/report` へ**移設**であって併存ではない。`CalendarPanelKind`（`apps/product/src/features/calendar/hooks/navigation/CalendarNavigationContext.tsx:25`）は型ごと廃止する
- `docs/product/principles.md` の「右サイドパネル」節（現状 2 タブ構成の記述、L50-70）と「ズレの 3 点分散」表の 2 行目（L45）は、`/report` を指す記述へ書き換える。**「3 点分散」の枠組み自体は残す** — ①カレンダー上の 2 レーン と ③作成時のフィードフォワード は無傷で、②の置き場所だけが右パネルから `/report` へ移る
- `docs/product/principles.md` の未決事項「タブ分割か、1 スクロールか」（L68 / L91）は、パネルの狭さを前提にした論点だった。フルページでは前提が変わるので、この未決はスライス 3 で決着させる

### 3-4. epic #2181 の一次資料リストに事実誤りがある（実測訂正）

epic 本文が実装 commit として挙げた **`a2c962f5e`（route group）と `0c89531e3`（pathname dispatch）は、この repo に object として存在しない**（`git cat-file -t` が `Not a valid object name`）。

両 SHA は squash merge された PR #1061 のコミット **`8c9e497b4`**（`refactor: sidebar 3-mode 構造 + routing unification + AI mode + entry create popover (#1061)`、2026-04-25）の**コミットメッセージ本文に言及として残っているだけ**で、元 branch は squash merge 後に削除され、object 自体は GC 済み。

**したがって旧実装を読む正しい入口は `8c9e497b4` の統合 diff。** 本書 §6 の引用はすべてそこから取った。`52ef53d77` / `2b225e9a4` は実在する（確認済み）。

原因は squash merge（`.claude/rules/workflow.md` §マージ方式 が merge commit へ統一する前の時代の PR）。squash は「PR の全コミットを 1 個に潰す」ため、メッセージ本文に残った個別 SHA は merge 後には辿れない。**今後 epic や設計書に一次資料の SHA を書く時は、書く前に `git cat-file -t` で存在を確かめる。**

---

## 4. スライス 1 — URL 契約と redirect（凍結）

**このスライスが本 project の `[irreversible]` を全部背負う。** 他は全部コードの中の話で、外に出ているのは URL だけ。

### 4-1. 正規 URL（凍結）

| 面         | 正規 URL                                     | 凍結状態                                                         |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------- |
| カレンダー | `/{locale}/calendar?view={view}&date={date}` | **凍結**。`view` = `day` \| `week` \| `2day`…`7day`              |
| レポート   | `/{locale}/report` + パラメータ未定          | **パスだけ凍結。パラメータはスライス 3 で凍結**（理由は §4-1-b） |

- `date` は現行と同じ `YYYY-MM-DD`（`formatCalendarDateParam`、`features/calendar/lib/date-param.ts`）。**パラメータ名も形式も変えない** — 変える理由がなく、変えれば redirect の写像が 1 つ増えるだけ
- `view` を省いた `/calendar` は有効で、**`week` として扱う**。これは現行の固定挙動（`proxy.ts:284` と `[locale]/page.tsx:13` がどちらも `/week` 固定）をそのまま移したもので、新しい挙動を足さない
- **ユーザー設定の `defaultView` には従わせない**（plan-review で scope を切った）。当初は「`view` 省略時は `defaultView` に従う = `/calendar` は自分のカレンダー」と書いたが、これは**現行に無い新機能**で、しかも 2 つの負債を連れてくる: (a) 現行ルーティングは `defaultView` を一切参照しておらず、参照させると server 側 prefetch に tRPC の往復が 1 つ増える (b) 値空間が合わない — `defaultView` は `'day' | '3day' | '5day' | 'week'` の **4 値**（`features/settings/server/router.ts:31`）なのに URL の `view` は `2day`…`7day` を含む **8 値**で、`/4day` を既定表示にはできない。**別 issue に切る**

#### 4-1-b. `/report` のパラメータを今は凍結しない（plan-review で方針変更）

当初は `/report?date=…&section=review|diff` まで凍結しようとしたが、**撤回した**。plan-critic の指摘を実測で確認した結果、2 つの理由でいま凍結すると害になる。

**理由 1: `date` 単独では現行の集計期間を表現できない。** review / diff は単一日ではなく**その時の view の期間**で描画されている。`CalendarViewClient.tsx:119-132` が `composition.viewDateRange` と `showWeekends` から `calendarDiffDays` / `reviewDisplayRange` を作り、`CalendarReviewRail` へ `displayRange` として渡す。`/2day?panel=diff&date=X` を `/report?date=X` へ写すと**期間が落ちて、同じブックマークが別の集計を開く**。これは §4-2 で C 案（view を URL に出さない）を「情報を黙って捨てる静かな劣化」として落としたのと**まったく同じ欠陥**で、自分の基準を `/report` 側で破ることになる。

**理由 2: `section` は未決の構造に依存している。** `/report` がタブ構成か 1 スクロールかは §3-3 のとおりスライス 3 の論点。1 スクロールに決着するなら正しい形はクエリではなくフラグメント（`#review`）になり、凍結を撤回する羽目になる。`plan-format.md` の「将来必要かもしれないので」に該当する。

**したがってスライス 1 が凍結するのは `/report` という path だけ**とし、期間表現と `section` 相当はスライス 3 で `/report` のレイアウトと同時に凍結する。旧 `?panel=*` の写像は暫定的に `/report`（+ `date` 素通し）へ寄せ、**期間が落ちることを既知の劣化として明示する**（§4-4）。

**§3-2 の歯止め（レポートビルダー化の禁止）は URL の貧しさで担保しない。** これも方針変更で、当初は「`/report` に日付以外の絞り込みを持たせない」ことを機械的な歯止めにしようとしたが、現行機能が期間ベースである以上、それは歯止めではなく**機能欠落の固定**になる。歯止めはスライス 3 で「何を表示するか」の側に置く。

### 4-2. なぜ view をクエリにするか（3 案の比較）

| 案                                    | 例                    | 判定     |
| ------------------------------------- | --------------------- | -------- |
| A: サブパス                           | `/calendar/week`      | 不採用   |
| **B: クエリ**（採用）                 | `/calendar?view=week` | **採用** |
| C: URL に出さず設定・store だけで持つ | `/calendar`           | 不採用   |

**C を落とす理由（決定的）**: 旧 URL は view 情報を持っている。`/week` → `/calendar` の redirect は、URL に view を書ける先が無ければ**その情報を黙って捨てる**。ブックマークしていた `/2day` が既定の week で開く、という静かな劣化になる。redirect で情報を保つには受け皿が要り、その受け皿が A か B。

**A を落とす理由**: `2b225e9a4`（2026-06-25）が `calendar` namespace を明示的に廃止して `/day` `/week` `/[nday]` へ平坦化した。A はその判断を打ち消して同じ形（動的セグメント `[nday]` + 形状判定 `isCalendarViewPath`）を復活させる。epic の「URL は `/calendar` と `/report` に統一」に対しても、パスが 3 種類以上に増える A より、パスがちょうど 2 本になる B の方が字義どおり。実装上も、タブ判定が `pathname` の**完全一致 2 値**になり、旧実装が必要とした形状マッチ（`getModeFromPath` の `isCalendarViewPath` 呼び出し）が消える（§6 で再訪する）。

**B の副作用として受け入れるもの**: `?view=` と `?date=` の 2 つのクエリが常に並ぶ。URL は今より長い。ただし**ユーザー操作数は増えない**（view 切替は今も 1 クリック、`ViewSwitcherList`）。`CLAUDE.md` シンプルルール 3 は操作数の規律であって URL 長の規律ではないので、これは違反にならない。

**モバイルの week → day 自動降格**（`CalendarNavigationContext` の既存ガード）は B でもそのまま効く。`?view=week` で開いたモバイルは day を描く。現行の `/week` と同じ挙動で、変更しない。

#### 4-2-b. B を選ぶと `CalendarNavigationContext` の書き換えが必ず付いてくる（plan-review で判明）

当初の設計はここを見落としていた。**view の読み書きは今 pathname に固定されており、B はその 4 箇所すべてを触る。**

| 箇所                                                            | 現在の実装                                                                               | B での変更                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| `resolveCalendarProps`（`CalendarNavigationContext.tsx:88-91`） | `pathname.split('/')` の**最終セグメント**から view を決め、不正なら `'day'` へ fallback | `view` を search から読む               |
| `useMemo` の依存（`:129-132`）                                  | `[pathname]`                                                                             | **変えない**（下記）                    |
| popstate ハンドラ（`:272-293`）                                 | `resolveCalendarProps(window.location.pathname)` を呼ぶ                                  | 同上（search を見る）                   |
| `writeCalendarUrl`（`:175-207`）                                | `` `/${localeRef.current}/${view}?${params}` `` を `pushState` / `replaceState` で書く   | `` `/${locale}/calendar?view=…&…` `` へ |

**直さないとどうなるか（具体的な故障）**:

- `/calendar?view=week` を開いても `resolveCalendarProps` は最終セグメント `calendar` を見て `isValidViewType` に落ち、**常に `day` で描画される**
- `writeCalendarUrl` を直さないまま view を切り替えると、`pushState` が `/week?...` を書く。**`pushState` は middleware を通らない**ので redirect も走らず、アドレスバーだけ旧 URL に戻る。共有・リロードで初めて redirect が効くという分かりにくい状態になる
- 旧 route を削除した後は、その履歴エントリへ「戻る」たびに実リクエストが飛んで redirect が 1 往復入る

**したがって `CalendarNavigationContext.tsx` はスライス 1 の scope に入る**（§4-6 の一覧に追加済み）。「redirect を張るだけ」では済まない。

**`useMemo` の依存は `[pathname]` のまま変えない。view の真実源は state 側に一本化する。**

依存に search を入れられない（それが Suspense 回避の理由）ので、`initialView` は「**pathname が変わった時の初期値**」以上のものにはならない。同じ `/calendar` の中で `?view=` を書き換えても memo は再計算されず、`initialView` は古い値を返し続ける。

これは**バグではなく、そう決める**。`changeView` は今も `setViewType(view)` と `writeCalendarUrl(...)` を同時に呼んでいて、**画面に効いているのは state 側**である。`initialView` が担うのは「URL 直アクセス・ブラウザ戻る/進む・タブ遷移でページに入り直した時の初期値」だけ。

実装規律として固定する:

- `viewType` の真実源は `useState` の値。`initialView` は pathname 変化時に state を初期化するためだけに使う
- 「initialView 同期」effect（`:235-253`）は **stale な `initialView` で発火しうる**ことを前提に、pathname が変わった時だけ効くようガードする
- popstate ハンドラは `window.location`（pathname と search の両方）から読み直す。memo を経由しない

この規律を書かずに `resolveCalendarProps` を search 対応にすると、「`?view=` を変えたのに `initialView` が古い」状態で同期 effect が意図しない値で発火する余地が残る。

**`useSearchParams()` は使わない。** 同ファイルの docstring（`:118-124`）が「外部から `useSearchParams()` を渡す必要がないため、親コンポーネントの Suspense 境界を不要にする」を明示の設計根拠にしており、`base-layout-content.tsx` の警告（§5-3）もこれと対になっている。**解法は既にコードの中にある** — `resolveCalendarProps` は `date` を読むのに既に `typeof window !== 'undefined'` ガード付きの `new URLSearchParams(window.location.search)` を使っている（`:95-97`）。`view` も**同じ経路で読む**。これで Suspense 境界の設計を壊さずに B が成立する。

これは B のコストであって B を落とす理由ではない。A（サブパス）を選んでも `resolveCalendarProps` の最終セグメント判定は `/calendar/week` 用に書き換えが要り、`writeCalendarUrl` も同じだけ変わる。C（URL に出さない）だけがこの書き換えを避けられるが、C は §4-2 の理由で落としている。

### 4-3. redirect はどこに張るか — `proxy.ts`（middleware）

**`next.config.mjs` の `redirects()` は使わない。**

- 現状 `next.config.mjs` に `redirects()` は**存在しない**（あるのは multi-zones の asset `rewrites()` だけ、`apps/product/next.config.mjs:60-69`）。redirect は 1 つ残らず `proxy.ts` に集約されている。ここで 2 本目の機構を作ると、redirect を追う時に見る場所が 2 つになる
- ロケール解決が `proxy.ts` の中にある。既定ロケール（`en`）はプレフィックス無しで来るため（E2E `deep-link.spec.ts:76` が `/day?date=` を直接叩く）、`/week` と `/ja/week` と `/en/week` の 3 形を扱う必要がある。`getPathWithoutLocale`（`proxy.ts:141`）と `getLocalizedPath` が既にそこにある
- `?panel=review` → `/report` は**クエリ値による条件分岐**で、しかも view 写像より**先に**判定しなければならない（`/week?panel=review` の行き先は `/calendar?view=week` ではなく `/report`）。この順序依存はコードで書く方が `has:` 配列より読める

**挿入位置（実測で確定）**: `pathWithoutLocale` が確定する `proxy.ts:240` の直後、**パス分類（`isProtectedProductPath` 等、`:242-244`）より前**。

この位置が正しい理由は 3 つあり、いずれも「認証チェックの前」より強い:

1. **Supabase への往復を 1 回減らす。** `updateSession()`（`:254`）はこの下にある。旧 URL の redirect は認証状態を知る必要がないので、セッション取得の前に返す
2. **認証と一切干渉しない。** `?redirect=` を組む分岐（`:269-275`）はパス分類の結果を使う。その前に旧 URL を新 URL へ変えておけば、ログイン後の戻り先には自動的に**新 URL** が入る。分類の後に置くと旧 URL が戻り先として保存され、ログイン直後にもう一度 redirect が走る
3. **ループを構造で塞ぐ。** redirect 先の `/calendar` `/report` は旧パス集合に含まれないので、2 周目が原理的に起きない。`access-policy.ts:15-16` のコメントが警告する `/week` 無限ループ（`#2144`、`proxy.ts:295-297` にも同じ警告）は「認証分岐どうしが互いを指す」ことで起きたもので、**認証分岐に入る前に写像を終える**この設計はその系統に入らない

### 4-4. redirect 網羅表（凍結）

`{L}` はロケールプレフィックス（`''` \| `/ja` \| `/en`）。既存クエリは素通しし、表に書いたキーだけ置換する。

| 旧 URL                                           | 新 URL                          | 備考                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{L}/week`                                       | `{L}/calendar?view=week`        |                                                                                                                                                                                       |
| `{L}/day`                                        | `{L}/calendar?view=day`         |                                                                                                                                                                                       |
| `{L}/{n}day`（`n` = 2..7）                       | `{L}/calendar?view={n}day`      | 現行 `[nday]` は `2..7` のみ有効（`page.tsx:70-72` が `notFound()`）。**範囲外は redirect せず 404 のまま**にする                                                                     |
| `{L}/{任意の上記}?panel=review\|diff\|analytics` | `{L}/report`（`date` は素通し） | **暫定写像**。旧 `panel` の値をどこへ写すかはスライス 3（`/report` のレイアウト確定）と同時に決める。§4-1-b                                                                           |
| `?reviewTagId={id}` を伴う場合                   | `/report` へ素通しで持ち越す    | パラメータ名の最終形は #2162 の語彙確定に従う。スライス 3 で確定                                                                                                                      |
| `{L}/review`                                     | **張らない**                    | `66a3ea6db` で既に削除済みの route。2026-06 時点で「ローンチ前のため互換 redirect は作らない」と判断済み（`calendar-review-panel-migration` overview §Not Doing）。今さら復活させない |

`date` は全ケースで素通し。`panel` と `view` が同時に来たら **`panel` を優先**（レポートへ行く）。

**この写像で失われるもの（既知の劣化として明示する）**:

1. **view**（`/2day?panel=review` → `/report`）。`/report` から「カレンダーへ戻る」を押すと `week` に落ちる
2. **集計期間**（§4-1-b の理由 1）。`view` が落ちる以上、その view が決めていた期間も落ちる

どちらもスライス 3 で `/report` の期間表現を凍結する時に解消する。**このスライスでは解消せず、issue に残す。** ここで無理に解こうとすると、未決のレイアウトに依存したパラメータを先に凍結することになる（§4-1-b の理由 2 と同じ罠）。

**ブラウザ履歴は汚れない**: サーバー 307 は履歴エントリを作らないので、`/week?panel=review` を開いた直後の「戻る」は 1 つ前のページへ正しく戻る。ループにもならない。

### 4-5. 恒久 redirect（308）にせず 307 のままにする

`NextResponse.redirect` の既定は **307（temporary）**。インストール済みの Next.js（`apps/product/package.json:101` = `^16.2.11`）の実装で確認した:

```js
// node_modules/next/dist/server/web/spec-extension/response.js:99
const status = typeof init === 'number' ? init : ((init == null ? void 0 : init.status) ?? 307);
```

`redirectWithCsp`（`proxy.ts:135-137`）は `NextResponse.redirect(url)` を status 無指定で呼ぶので 307 になる。**この既定を変えない。**

308 permanent はブラウザが実質無期限にキャッシュするため、写像を間違えたときの回収手段が「ユーザーにキャッシュを消してもらう」しかない。307 なら写像はいつでも変えられる。コストは古いリンク 1 回につきリクエスト 1 往復で、**単一ユーザー・課金前・全ページ noindex（`(app)/layout.tsx` の `metadata.robots` が `index: false`）**という現状では実質ゼロ。SEO 上の恒久性を主張する相手（クローラー）もいない。

**この判断が本 project の Reversibility を `[irreversible]` から `[hours]` へ落とす。** ただし**残余が 1 つある**（§4-6 の実測で判明）: 送信済みメールに `/week` が焼き付いており、回収できない。したがって **`/week` の redirect は削除できない**。307 か 308 かに関わらず、この 1 本は恒久的に維持する前提で設計する。307 を選ぶ意味は「消せる」ことではなく「**行き先を後から変えられる**」ことにある。

### 4-5-b. 単独で最も危険な項目 — `access-policy.ts` の更新漏れは認可漏れになる

**`/calendar` と `/report` を `access-policy.ts` の保護対象へ追加することは、任意の追従作業ではなく、route を作る変更と同一 commit に入れなければならない必須条件。** 漏らすと未認証で新ページが開通する。

経路を追うと分かる（`proxy.ts` の実測）:

1. `/calendar` は `isProtectedProductPath` にも `isPublicProductPath` にも該当しない状態になる
2. `:248` の早期 return（`isPublicPath && !isProtectedPath && !isAuthPath`）は `isPublicPath` が false なので**通らない**（ここで弾かれないので一見安全に見える）
3. `:269` の `if (!user && isProtectedPath)` が **`isProtectedPath` が false なので成立しない**
4. どの分岐にも当たらず素通りして、**未認証のまま `/calendar` が描画される**

`/week` は `workspaceViewPathPattern`（`access-policy.ts:17`）でこれを塞いでいる。新 path はその正規表現に当たらないので、**新 route を足した瞬間に穴が開く**。

**したがって Step 分解では「`/calendar` `/report` の route 追加」と「`access-policy.ts` の更新」を分けない。** テストで固定する（`isProtectedProductPath('/calendar')` と `('/report')` が true であること）。

**旧 `workspaceViewPathPattern` をいつ消すか**（当初「当面残す」と曖昧に書いていたのを条件で置き換える）: `isProtectedProductPath` の呼び出し元は `proxy.ts` 1 箇所だけ（実測）で、そこでは §4-3 の写像が分類より前に走る。したがって旧 path が分類に到達する経路は無い。**それでも旧 route ファイルが存在する間は残す** — 残すコストはゼロで、消し忘れより消し急ぎの方が危ない。**削除の条件は「旧 route ファイルを削除した Step と同じ PR」**。

### 4-6. 波及一覧（実測、2026-08-18）

**redirect を張るだけでは足りず、必ず一緒に直すもの**:

| 対象                                                                                                               | 現状                                                                                                                                                                                                                                           | 対応                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/product/src/lib/auth/domain/access-policy.ts:17`                                                             | `const workspaceViewPathPattern = /^\/(day\|week\|\d+day)(\/\|$)/;`                                                                                                                                                                            | `/calendar` `/report` を保護対象へ。**旧パターンは旧 route ファイルを削除する Step 6 まで残す**（§4-5-b。理由は「経路が残っているから」ではなく「残すコストがゼロで、消し急ぐ方が危ないから」）                                                                                                                        |
| `apps/product/src/proxy.ts:282-287`                                                                                | 認証済みで auth path → `getLocalizedPath('/week', currentLocale)`                                                                                                                                                                              | `/calendar` へ                                                                                                                                                                                                                                                                                                         |
| `apps/product/src/emails/{Welcome,TrialStart,ProStart,PaymentRecovered}Email.tsx`（`:43` / `:62` / `:55` / `:41`） | いずれも `<Button href={\`${appUrl}/week\`}>`。**送信済みメールは回収できない**                                                                                                                                                                | テンプレートを `/calendar` へ。**同時に `/week` の redirect を恒久維持対象として扱う**（§4-5）                                                                                                                                                                                                                         |
| `apps/product/src/app/[locale]/page.tsx:13`                                                                        | `redirect(\`/${locale}/week\`)`                                                                                                                                                                                                                | `/calendar` へ                                                                                                                                                                                                                                                                                                         |
| `apps/product/src/app/[locale]/(auth)/auth/mfa-verify/page.tsx:70,73`                                              | `router.push('/week')`                                                                                                                                                                                                                         | `/calendar` へ                                                                                                                                                                                                                                                                                                         |
| `apps/product/src/app/[locale]/(auth)/auth/session-error/page.tsx:48`                                              | `<Link href="/week">`                                                                                                                                                                                                                          | `/calendar` へ                                                                                                                                                                                                                                                                                                         |
| `apps/product/src/features/auth/components/SignupForm.tsx:133`                                                     | `router.push(\`/${locale}/week\`)`                                                                                                                                                                                                             | `/calendar` へ                                                                                                                                                                                                                                                                                                         |
| `apps/product/src/features/calendar/lib/panel-url.ts:4-15`                                                         | `buildCalendarReviewPanelPath` が `/{locale}/{viewType}?panel=review` を組む                                                                                                                                                                   | `/report` を組む関数へ置換。`viewType` 引数は不要になる                                                                                                                                                                                                                                                                |
| `apps/product/src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx:128`                                             | 上記を呼ぶ                                                                                                                                                                                                                                     | 追従                                                                                                                                                                                                                                                                                                                   |
| `apps/product/src/features/calendar/lib/route-utils.ts`（`isCalendarViewPath`）                                    | `/day` `/week` `/{n}day` の形状判定                                                                                                                                                                                                            | `/calendar` 完全一致へ縮小。呼び出し元は `desktop-layout.tsx:47`（`hasOwnHeader`）                                                                                                                                                                                                                                     |
| `apps/product/public/robots.txt`                                                                                   | Disallow は `/calendar/` `/stats/` `/settings/` `/notifications/` `/auth/` `/api/` `/_next/`（+ `/ja` `/en` 前置版 5 本）。**うち `/stats/` `/notifications/` は現行 route に存在せず、逆に `/week` `/day` `/{n}day` は 1 行も書かれていない** | `/calendar` `/report` を加え、死んだ 2 行を落とす。**既存のズレの修正も本 project で拾う**（新しく `/calendar` を作る以上、`/calendar/` の Disallow がたまたま効いてしまう状態を放置しない）。なお認証必須ページは `(app)/layout.tsx` の `metadata.robots` が `index: false` を出しているので、robots.txt は二重の保険 |
| E2E 6 ファイル                                                                                                     | 下記                                                                                                                                                                                                                                           | URL を新契約へ。**旧 URL の redirect 自体を検証する spec を 1 本足す**                                                                                                                                                                                                                                                 |

**plan-review が検出し、実測で裏を取って追加したもの**（当初の一覧から漏れていた）:

| 対象                                                                                | 現状                                                        | 対応                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apps/product/src/features/calendar/hooks/navigation/CalendarNavigationContext.tsx` | view の読み書きが pathname に固定（§4-2-b の 4 箇所）       | **スライス 1 の本体作業**。redirect だけでは動かない                                                                  |
| `apps/product/src/lib/safe-redirect.ts:19`                                          | `getSafeRedirectPath(next, fallback = '/week')`             | fallback を `/calendar` へ                                                                                            |
| `apps/product/src/features/auth/components/LoginForm.tsx:143`                       | `redirectPath !== '/week'` のリテラル比較                   | 比較対象を `/calendar` へ                                                                                             |
| `apps/product/src/app/api/integrations/google-calendar/callback/route.ts:92`        | `getSafeRedirectPath(…, '/week')`                           | `/calendar` へ                                                                                                        |
| `apps/product/src/features/calendar/lib/timeblock-search-path.ts:36`                | `` `/${locale}/day?${params}` `` を組む（検索結果への遷移） | `/calendar?view=day&…` へ                                                                                             |
| `(workspace)/{day,week,[nday]}/{loading,error}.tsx`（**計 6 ファイル**）            | view ごとに 1 組ずつ存在                                    | `/calendar` 側に 1 組へ統合                                                                                           |
| `apps/product/src/features/auth/stores/useAuthStore.ts:163`                         | `emailRedirectTo: \`${window.location.origin}/week\``       | **変更しない。** Supabase Auth の Redirect URL allowlist に登録済みの値で、変えると確認メールのリンクが落ちる（下記） |

**`emailRedirectTo` を触らない理由**（本番専用の故障点なのでローカルで再現しない）: サインアップ確認メールの着地先を変えると、Supabase Dashboard の Redirect URLs に新 path が登録されていない限り確認リンクがエラーへ落ちる。redirect 層が `/week` → `/calendar` を引き受けるので**変える必要が無い**。将来変えるなら Supabase 側の allowlist 更新を伴う独立作業として扱う（`EXPLICIT AUTHORITY`）。

**E2E の実測位置**（当初「6 ファイル」と書いたが 4 つしか挙げていなかった。実測で 7 ファイル）:

- `apps/product/src/lib/test/e2e/critical-path.spec.ts:71`（`/ja/day?date=`）、`:228`（`/ja/day?date=…&panel=review`）
- `apps/product/src/lib/test/e2e/deep-link.spec.ts:40-42`（`/ja/week?date=…&panel=review`）、`:57-59`、`:76-77`（ロケール無し `/day?date=`）
- `apps/product/src/lib/test/e2e/calendar-navigation.spec.ts:33`（`panel` を読む assert ヘルパー）、`:102,111,117,122,131`
- `apps/product/src/lib/test/e2e/review-granularity.spec.ts:29,33-36`
- `apps/product/src/lib/test/e2e/mobile-navigation.spec.ts:45`（`/ja/day?date=`）
- `apps/product/src/lib/test/e2e/plan-record-timeblock.spec.ts:59`（`/ja/day?date=`）
- `apps/product/src/lib/test/e2e/account-deletion.spec.ts:172`（`/ja/day`）

そのほか: `packages/observability` の `instrumentation.test.ts:27,33,54` が Sentry の route 名として `/[locale]/day` を固定している。route 統合でここも動く。

**変更しなくてよいことを確認したもの**（実測、無駄な追従を防ぐため明記）:

- `apps/product/src/app/sitemap.ts` — 公開ページはホームのみを列挙（`:41`）。`/week` `/day` はハードコードされていない。**変更不要**
- `apps/product/src/app/api/v1/calendar/[token]/route.ts` — ICS フィード。Web の画面 URL を含まない（grep 0 件）。**変更不要**
- `next.config.mjs` — `redirects()` を新設しない（§4-3）

**当初「外部に配ったリンクは無い」と書いたが、これは誤りだった**（plan-review で検出、2026-08-18）。`apps/product/src/emails/` を見ていなかった（`features/email` と `lib/email` と `packages/` しか grep していなかった）ため、4 通のトランザクショナルメールが `/week` を焼き付けている事実を見落としていた。上表に追加済み。**この誤りは §4-5 の結論を変える**（redirect を「消せる」から「消せない」へ）ので、消さずに経緯ごと残す。

### 4-7. このスライスの Reversibility

| 変更                                                         | 判定                        | 根拠                                                                                                  |
| ------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/calendar` `/report` の新設                                 | `[minutes]`                 | 純追加。旧 route を消さずに足せる                                                                     |
| `CalendarNavigationContext` の view 読み書き                 | `[minutes]`                 | 純粋なクライアントコード。commit 単位で revert できる                                                 |
| 旧 URL → 新 URL の写像（行き先）                             | `[hours]`                   | §4-5。307 なので行き先はいつでも変えられる                                                            |
| **`/calendar` `/report` という path と `view` パラメータ名** | **`[irreversible]` に近い** | 下記                                                                                                  |
| **旧 URL → 新 URL の redirect 層の存在**                     | **`[irreversible]`**        | 送信済みメール 4 種が `/week` を焼き付けている（§4-6）。**この層は削除できない**                      |
| 旧 route ファイルの削除                                      | `[minutes]`                 | commit 単位で revert できる。**redirect の稼働確認後に別 Step へ隔離する**。redirect 層の削除とは別物 |
| `robots.txt` の書き直し                                      | `[minutes]`                 | 静的ファイル                                                                                          |

**当初「`[irreversible]` はゼロ」と書いたが、これは事実（可逆性）と評価（実害の小ささ）を混同していた**（plan-review で指摘、実測で裏を取って訂正）。正しくはこう:

- **307 が可逆にするのは「写像の行き先」だけ。** 新しく公開する URL 契約そのもの（`/calendar` `/report` という path と `view` というパラメータ名）は、一度ブックマーク・共有されれば次の変更でまた redirect 層が要る。これは 307 でも 308 でも変わらない
- **redirect 層は恒久物になる。** 送信済みメールは回収できないので、`/week` の写像を消すことは不可逆な破壊にあたる
- したがって正しい言い方は「**不可逆な要素はあるが、単一ユーザー・課金前・全ページ noindex のため実害が小さい**」。`[irreversible]` がゼロなのではなく、`[irreversible]` の**コストが小さい**

この区別は言葉遊びではない。「ゼロ」と書くと、将来もう一度 URL を変える判断が「前回タダだったから今回もタダ」と誤って評価される。実際には redirect 層が 1 枚ずつ積み上がる。

308 へ上げる判断は引き続き scope 外（写像が正しいと実測で確認した後の独立判断）。

### 4-8. サーバー側（RSC / prefetch / metadata）は影響を受けない

3 つの `page.tsx` を 1 つに畳むので RSC 側への影響を疑ったが、**実測では失うものが無い**（plan-review で確認）。

- **静的化の可否は変わらない。** 3 つとも既に `export const dynamic = 'force-dynamic'` で、`searchParams` を読むため元から動的レンダリング。`view` を動的セグメントから searchParams へ移しても同じ
- **`prefetchCalendarData(viewType, targetDate)` は等価に動く。** `viewType` の出どころが params から searchParams に変わるだけ
- **`generateMetadata` は維持できる。** page segment は `searchParams` を受け取れるので `views.week` / `views.day` / `views.multiday` の出し分けはそのまま
- **prefetch キャッシュは劣化しない。** view 切替は現行も `router.push` ではなく `history.pushState`（`CalendarNavigationContext.tsx:328-330`）なので、**そもそも view 切替でサーバー再レンダリングは起きていない**。単一 page 化で失うものは無い

**1 つだけ移植が要る**: `[nday]/page.tsx:70-72` の `notFound()`（`2..7` 以外は 404）。動的セグメントが消えると Next.js の route マッチでは弾けないので、**`view` の値検証として page 内に残す**。これで §4-4 の「範囲外は redirect せず 404 のまま」と整合する。

### 4-9. このスライスの writer 境界

本 project は #2162 の走行波（`#2161 → E1 → H1 → F → G → H2`）と並走する。**スライス 1 の scope に入るファイルが走行中レーンと重ならないことを実測した**:

| ファイル                                                                 | 本 project   | 走行中レーン                                          |
| ------------------------------------------------------------------------ | ------------ | ----------------------------------------------------- |
| `proxy.ts` / `access-policy.ts` / `safe-redirect.ts`                     | 書く         | どのレーンも触らない                                  |
| `features/calendar/hooks/navigation/**`                                  | 書く         | PR #2179 の変更ファイル一覧に**含まれない**（実測）   |
| `features/calendar/lib/{panel-url,route-utils,timeblock-search-path}.ts` | 書く         | 同上、含まれない                                      |
| `emails/**` / `robots.txt` / E2E                                         | 書く         | どのレーンも触らない                                  |
| `features/review/**`                                                     | **触らない** | レーン G の領域。スライス 3 で扱う                    |
| `_shell/**`                                                              | **触らない** | レーン F（PR #2179）の領域。スライス 2 で扱う（§5-6） |

**スライス 1 は `_shell/` と `features/review/` に 1 行も書かない。** この 2 つに触るのはスライス 2 / 3 で、いずれも F / G の merge 後。

---

## 5. スライス 2 — shell / Sidebar タブ構造（**凍結前・改稿中**）

### 5-1. 旧構造の半分は既に生き残っている（再実装しなくてよい部分）

epic の「既知の障害 1」は「SidebarContent のモード分岐は完全撤去済み（pathname dispatch の再実装が必要）」だが、**実測すると撤去されたのは分岐だけで、分岐を可能にしていた構造はそのまま残っている。**

| 旧設計（`8c9e497b4` の Option Y）が要求した条件                     | 現状                                                                                                                                                                                                                                                                 | 判定           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Sidebar 外殻を単一箇所にマウントし、モード切替で再マウントさせない  | `desktop-layout.tsx:68-77` で `AnimatedWidthPanel` → `Sidebar` → `SidebarContent` を 1 回だけマウント                                                                                                                                                                | **既に満たす** |
| navigation state をモード横断で保持する Provider を分岐より上に置く | `base-layout-content.tsx` が `CalendarNavigationProvider` を `MobileLayout` / `DesktopLayout` の分岐より上でラップ（コメントに「ルート切替時に Provider の付け外しによるリマウントを防ぎ、Sidebar が静止したままメインコンテンツだけが変わる体験を実現する」と明記） | **既に満たす** |
| pathname から現在モードを導く dispatcher                            | 撤去済み（`SidebarContent` は Calendar の中身を直接描画）                                                                                                                                                                                                            | **要再実装**   |

**つまり作業は `SidebarContent` を dispatcher に戻す 1 点。** 旧設計が Option X / Y / Z を比較して選んだ結論（再マウント 0 回）は、3 モード構造の撤去を生き延びて構造として現存している。`/report` は追加した瞬間に `CalendarNavigationProvider` の内側に入るので、日付の選択状態はタブを往復しても保たれる。

### 5-2. dispatcher の形

```
_shell/
├── SidebarContent.tsx      — dispatcher に戻す（タブ UI + 中身の出し分け + SidebarUtilities）
├── workspace-tabs.ts       — getWorkspaceTabFromPath()（新規）
├── WorkspaceTabs.tsx       — タブ UI（新規）
├── CalendarSidebar.tsx     — 現 SidebarContent の body をそのまま移す（新規ファイル・中身は既存）
└── ReportSidebar.tsx       — 新規
```

- 型は `WorkspaceTab = 'calendar' | 'report'` の **2 値**。判定は `pathname === '/report' ? 'report' : 'calendar'` の 1 行で済む。旧 `getModeFromPath`（`_shell/navigation-paths.ts`、`66a3ea6db` で削除済み）が必要とした `isCalendarViewPath` 呼び出しと `[2-7]day` 正規表現は dispatcher から消える。これはスライス 1 で view をクエリにした設計の直接の見返り。**第 3 の値（`other`）は作らない** — `/settings` も calendar 扱いで足り（§5-4）、値を増やすと「`other` 用の Sidebar」を後から誰かが足す
- 新規ファイルは `_shell/`（Composition Layer）に置き、`features/` へ昇格させない。旧設計が `CalendarSidebar` / `StatsSidebar` を `_shell/` に置いた判断をそのまま踏襲する
- `CalendarSidebar.tsx` は**現 `SidebarContent` の body を移動するだけ**で、中身を書き換えない（§5-6 の writer 境界に直結）

### 5-3. dispatcher は `usePathname()` だけで判定する（`useSearchParams()` を使わない）

`base-layout-content.tsx` に警告コメントがある:

> ⚠ `useSearchParams()` は使用しない。Calendar panel での URL 変更（replaceState）が Suspense 境界を発火し、子ツリー全体がアンマウントされるバグを防止するため。

**タブ判定に `?view=` を混ぜてはいけない。** 混ぜると view 切替のたびに Sidebar を含む子ツリーがアンマウントされ、Option Y が守っている「再マウント 0 回」が壊れる。

これがスライス 1 の設計と噛み合う: **タブ = パス（`/calendar` \| `/report`）、view = クエリ（`?view=`）** という層の分離が、そのまま「dispatcher は pathname だけ読む」という実装規律になる。§4-2 でサブパス案（A）を落とした理由がここでもう一度効く — A ならタブ判定が `/calendar/week` の形状マッチになり、view 変更がパス変更になって毎回 route 遷移が走る。

### 5-4. タブが切り替えるもの / 切り替えないもの

| 要素                                           | タブ切替時                     | 根拠                                                                                                       |
| ---------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Sidebar 外殻（ロゴ・幅・開閉状態・`UserMenu`） | 不変                           | `desktop-layout.tsx` に単一マウント（§5-1）                                                                |
| `SidebarUtilities`（テーマ切替）               | 不変                           | dispatch の外に置く（旧実装と同じ）                                                                        |
| Sidebar の中身                                 | **切替**                       | `CalendarSidebar` ⇄ `ReportSidebar`                                                                        |
| メイン領域                                     | **切替**                       | route が変わる（`/calendar` ⇄ `/report`）                                                                  |
| 選択中の日付                                   | **不変**（時刻は正午へ正規化） | **タブ href が `date` を運ぶ**（§6-9 #1）。Provider が分岐より上なのは必要条件にすぎない。正規化は §6-10 A |
| `sidebar.open` / `sidebar.width`               | 不変                           | `useShellStore`（型 `:70,72` / 初期値 `:136-137`）                                                         |

`/settings` は `other`。デスクトップの設定は**ホームへ redirect してモーダルで出す**実装（`settings/layout.tsx` のコメント）なので、裏に見えているのはカレンダーである。したがって `other` のフォールバックは **calendar タブをアクティブにして `CalendarSidebar` を描く**（旧実装の「fallback: settings 等のモード外は CalendarSidebar」と同じ挙動で、今回は実態にも合う）。

### 5-4-b. URL の書き手をタブ対応にする（設計レーンが実測で見つけた穴）

**§5-4 の「選択中の日付はタブ切替で不変」を素直に実装すると、`/report` から弾き出される。**

`CalendarNavigationProvider` は分岐より上にあるので `/report` でも生きている（§5-1）。`ReportSidebar` の MiniCalendar（§5-5）が日付選択で呼ぶのは既存の `navigateToDate(date, true)` で、その中身はこうなっている:

```ts
// CalendarNavigationContext.tsx（navigateToDate 内、updateUrl のとき）
writeCalendarUrl(
  viewTypeRef.current,
  date,
  panelKindRef.current,
  reviewTagIdRef.current,
  'replace',
);
// → `/${localeRef.current}/${view}?${params}` を replaceState
```

**つまり `/report` でカレンダーの日付を触った瞬間、URL が `/calendar` 系へ書き換わってタブが飛ぶ。** `?view=` 対応（§4-2-b）で `writeCalendarUrl` を直すだけでは足りない — 直した後も**行き先は常にカレンダー**だからである。

**設計: URL の書き手を現在タブで分岐させる。**

| 現在タブ   | `navigateToDate` が書く URL                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `calendar` | `/{locale}/calendar?view={view}&date={date}`                                                       |
| `report`   | `/{locale}/report?date={date}&range={range}`                                                       |
| `other`    | 現行どおりカレンダーへ（`/settings` からの日付選択でカレンダーへ飛ぶのは今の挙動であり、変えない） |

タブの判定は §5-3 と同じ `usePathname()` 由来のものを使い、`useSearchParams()` は使わない。**`writeCalendarUrl` は「カレンダーの URL を書く関数」から「今いる面の URL を書く関数」へ役割が変わる**ので、名前も実態に合わせる（`writeWorkspaceUrl` 等）。

**この穴は §4-2-b の 4 箇所とは別物**なので、実装 Step の scope に個別に数える。§4-2-b は「view をどこから読むか」、こちらは「どの面の URL を書くか」で、直す動機も直し方も違う。

### 5-5. `ReportSidebar` の中身（v1）

1. **MiniCalendar** — `/report` も `?date=` を持つので、カレンダータブと同じ部品をそのまま使う。旧 `StatsSidebar` も MiniCalendar 1 個だけだった
2. **セグメント一覧**（#2162 レーン G の成果を受ける）

セグメントを Sidebar に置くのは、#2162 §6-3 が定めたセグメントの性格（「レポートではなく、**よく使う問いのショートカット**」）に最も忠実な形だから。ショートカットの集合はナビゲーションであって、ページ本体のコンテンツではない。

**#2162 との差分（要伝達・伝達済み）**: §6-4 は「セグメントの CRUD も右パネル内で完結させる」としていた。右パネルが廃止された（§3-3）ので、CRUD の置き場所は **Sidebar のコンテキストメニュー**へ移す。これはレーン F がカテゴリー / アクティビティで確立したパターン（PR #2179 の契約 4「カテゴリー一括表示は checkbox でなく context menu」、契約 5「付け替えは context menu」）と同じ操作語彙になるので、ユーザーから見た一貫性はむしろ上がる。

**v1 に入れないもの**: セグメントの並び替え、フォルダ分け、共有。§3-2 の歯止め（レポートビルダー化の禁止）に直接触れる。

### 5-6. writer 境界 — PR #2179（レーン F）との衝突（実測）

PR #2179 が触る `_shell/` の 3 ファイルの差分を実測した。**構造変更はゼロで、全部 rename**:

| ファイル                                      | #2179 の変更内容                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `_shell/SidebarContent.tsx`                   | `CalendarFilterList` → `ActivityFilterList`（import 1 行 + JSX 1 行のみ） |
| `_shell/mobile-layout.tsx`                    | `TagChipRow` → `ActivityChipRow`（import + JSX + コメント）               |
| `_shell/__tests__/app-shell-layouts.test.tsx` | mock の `TagChipRow` → `ActivityChipRow`                                  |

**結論: F が作る IA の中身（ロジック・データ契約・コンポーネント構成）は 1 行も作り替えない。**（§6-10 G で範囲を明確化した — モバイル shell の都合で `ActivityChipRow` の**配置に関する className** は触る。IA のロジックには触らない） F が作ったカテゴリー / アクティビティ IA 本体（`features/calendar/components/activity-filter/` 配下 20 ファイル超）は、`CalendarSidebar.tsx` の中に**そのまま入る**。私が足すのはその外側のタブと dispatcher だけ。

衝突は**テキスト衝突のみ**（同じ 2 行を両者が触る）で、**F を先に merge して本 project がその上に載れば消える**。F をやり直させる理由はない。

**merge 順の制約**: `#2162 の波（E1 → H1 → F → G → H2）` → 本 project の shell Step。F より先に本 project の shell を merge すると、F が `CalendarSidebar.tsx` という移動先のファイルに対して rename をやり直すことになり、F 側に余計な追従が生える。

### 5-7. モバイルのタブ切替 — `BottomTabBar` を 2 タブで復活する（**User 確定**）

**現状の実測**: モバイルに Sidebar は存在しない。`mobile-layout.tsx` は `AppHeader` + `MainContentWrapper` + チップ列（カレンダーのみの固定フッター）の 3 段だけで、Sidebar も toggle も出さない（`calendar-review-panel-migration` overview §3 の「Sidebar toggle は mobile に出さない」がそのまま生きている）。**したがって §5-2 の Sidebar タブはモバイルでは 1 ピクセルも見えない。**

**名前について**: このチップ列は **main では今も `TagChipRow`**（`mobile-layout.tsx:4,61`）で、`ActivityChipRow` への改名は**未 merge の PR #2179 が持っている**変更。本節以下は #2179 merge 後に着手する前提なので `ActivityChipRow` と書くが、**現在の main を読むと `TagChipRow` である**（plan-review が「未来の名前を現状の実測として書いている」と指摘したので明示する）。

**決定: `BottomTabBar` を「カレンダー / レポート」の 2 タブで復活させる**（2026-08-18、User 判断。指揮台経由で伝達）。

**これは設計レーンの推奨と分岐した判断で、判断ジャーナル（`judgment:diverged`）として #2181 に記録済み。** 設計レーンは「#2161 のヘッダートグルを `/report` 遷移へ転用する」案を推奨し、その不採用理由に「クイック作成の固定フッターと画面下端を奪い合う」を挙げていた。**User 判断が採用側に決まった以上、この競合は不採用理由ではなく解くべき設計課題になる。** 以下がその設計。

#### 5-7-a. 過去 2 回の削除理由は今も生きているか（検証）

`BottomTabBar` は 2 回削除されている。**復活させる前に、削除理由が今も成立するかを 1 件ずつ見る。**

| 削除                                                     | 当時の理由                                                                                              | 今も生きているか                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `cf79907eb`（モバイルフッターをタグ作成専用に整理）      | タブの行き先が実質 1 つ（カレンダー）になり、タブバーが役目を失った。フッターをクイック作成に明け渡した | **生きていない。** `/report` という第 2 の行き先が復活するので、前提が変わる                                              |
| `66a3ea6db`（`/review` ルートと旧フルページ shell 削除） | 分析がパネルへ移り、独立した行き先が消えた                                                              | **生きていない。** この project がその決定自体を反転させる                                                                |
| （両者に共通する含意）                                   | 画面下端はクイック作成のもの                                                                            | **生きている。** クイック作成（`ActivityChipRow`）は「Google Calendar / Toggl より一手少なく」の中核で、譲れない。→ 5-7-b |

**2 つの削除理由のうち 2 つは前提が消え、1 つ（画面下端の取り合い）だけが残る。** 残った 1 つを次節で潰す。

#### 5-7-b. クイック作成フッターとの共存（設計要件）

競合の実体は「画面下端の固定要素が 2 つになる」こと。`ActivityChipRow` は横スクロールするチップ列で、タップでタイムブロック作成 popover を開く。`BottomTabBar` はタブ 2 個。

**設計方針: 縦に積む。`BottomTabBar` を最下段、`ActivityChipRow` をその上。**

- **順序の根拠**: `BottomTabBar` は画面の識別（今どこにいるか）で、`ActivityChipRow` はその画面の中の操作。**より広い文脈のものを外側（下）に置く。** iOS / Android のタブバーが常に最下段にあるのと同じ理由で、ユーザーの空間記憶とも一致する
- **`ActivityChipRow` はカレンダータブでだけ出す**（現行の `isCalendarView` 分岐をそのまま維持）。`/report` では出ないので、**2 段が重なるのはカレンダータブだけ**
- **高さ予算**: 2 段合計を画面高の 20% 以内に収める。超えるならチップ列の高さを詰める（タブバーはタップ標的の下限があるので削らない）。カレンダーのタイムグリッドは `MainContentWrapper` の `pb-16` で余白を確保している実装（`mobile-layout.tsx`）なので、**この定数を 2 段分へ更新する作業が必ず要る**。忘れるとグリッド最下部がフッターに隠れる
- **誤タップ対策**: 2 つの固定要素が縦に隣接するので、境界での誤タップが起きる。(1) タブバーとチップ列の間に視覚的な区切り（境界線または背景色の差）を入れる (2) タップ標的の間に最低 8px の間隔を取る (3) **チップ列の下端とタブバーの上端を重ねない**（`ActivityChipRow` が横スクロールするため、スクロール中の指がタブに触れやすい）
- **`/report` 側の余白**: `/report` はチップ列が無いのでタブバー 1 段分だけ。`MainContentWrapper` の padding を画面ごとに出し分ける

#### 5-7-c. 復活のさせ方

- **`66a3ea6db` で削除されたファイルを復元しない。** 当時の `BottomTabBar` は 3〜4 タブ（Calendar / Stats / AI / Account）前提で、`getActiveTabFromPath` はパスの prefix マッチをしていた。新実装はタブ 2 個・パス完全一致 2 値で、§5-2 の `getWorkspaceTabFromPath` を**そのまま共用する**。復元より新規のほうが小さい
- **Account タブは作らない。** 現行モバイルは右上の `ConnectedMobileAccountButton` から設定へ入る（`mobile-layout.tsx`）。タブに足すと 3 タブになり、下端の面積がさらに減る
- 置き場所は `_shell/BottomTabBar.tsx`（旧実装と同じ位置）

**Step Count への影響なし**: モバイルのタブ切替は 1 タップのままで、§5-8 の表は変わらない。

**Reversibility は `[minutes]`**（新規コンポーネント 1 つと `mobile-layout.tsx` の変更）。ただし `pb-16` 定数の更新漏れは**目視でしか見つからない**ので、実装 Step の検証にモバイル実機描画の確認を明記する。

### 5-8. Step Count（ユーザー操作数）

`CLAUDE.md` シンプルルール 3 の検算。**この project はユーザー操作フローを変えるので必須**（`plan-format.md` §Step Count）。

| フロー                           | Google Calendar | Toggl | Dayopt（現在）             | Dayopt（この project 後）      |
| -------------------------------- | --------------- | ----- | -------------------------- | ------------------------------ |
| 今週のズレを見る（デスクトップ） | —               | 3 手¹ | 1 手（ヘッダーのトグル）   | **1 手**（Sidebar タブ）       |
| 分析を見た後カレンダーへ戻る     | —               | 2 手² | 1 手（トグルを再度押す）   | **1 手**（Sidebar タブ）       |
| view を切り替える                | 1 手            | —     | 1 手（`ViewSwitcherList`） | **1 手**（変更なし）           |
| 今週のズレを見る（モバイル）     | —               | 3 手¹ | 1 手（ヘッダーのトグル）   | **1 手**（同トグルの付け替え） |

¹ Toggl: Reports へ移動 → 期間選択 → レポート種別選択。² Toggl: Timer タブへ戻る → 日付を合わせ直す。

**手数は増えも減りもしない。** この project の狙いは手数の削減ではなく「分析に使える面積」なので、それでよい。**重要なのは増やさないこと**で、上表がそれを担保する。

特に注意した点: パネルからページへ移すと「戻る」が増えがちだが、**Sidebar タブは往復とも 1 手**なので増えない。もし `/report` へ行くのに「メニューを開く → レポート」の 2 手が要る設計にしていたらルール 3 違反になっていた。Sidebar 上部の常設タブという形（epic の確定事項）がこれを構造的に防いでいる。

---

## 6. スライス 3 — `/report` ページ構成（作成中）

> **凍結前。** §6-1 の判断だけ先に置く。データ契約（期間・集計 API の配線・`CalendarReviewRail` の去就）は実測待ちで、揃い次第このセクションを完成させて `/plan-review` にかける。

### 6-1. タブ分割ではなく 1 スクロールにする（`principles.md` の未決に決着をつける）

`docs/product/principles.md:68` / `:91` に「**タブ分割か、1 スクロールか**」が未決として残っている。**この project がその前提を変えるので、ここで決着させる。**

> **上=今日の差分、下=傾向の 1 スクロール。タブは作らない。**

未決だった理由は「開いた瞬間にズレが見える」がタブの初期表示側にしか効かないことだった。パネルの狭さの中では、2 種類の内容を同時に見せると両方が読めなくなるのでタブに分けるしかなく、その代償として片方が必ず隠れていた。**フルページでは縦に並べられるので、この二者択一が消える。** 上に置いた差分は開いた瞬間に見え、傾向はスクロール 1 回で届く。隠れるものが無くなる。

1 スクロールを選ぶ理由をもう 2 つ:

- **タブは静かに増える。** 「差分 / 振り返り」の 2 つに、#2162 が 3 軸（アクティビティ / カテゴリー / セグメント）を持ち込む。タブ構造のままだと軸の数だけタブが生えるか、タブの中にタブが入る。**セクションの縦積みなら、増える時に必ず「この画面が長くなる」という目に見えるコストが伴う** — §3-2 の歯止め（レポートビルダー化の禁止）が、レイアウトそのものによって効く
- **タブは状態を持つ。** どのタブを開いていたかを URL / store のどちらで持つかという判断が必ず生え、`?panel=` の時と同じ問題（正規化・shim・deep link）が再発する。1 スクロールならスクロール位置はブラウザに任せられ、deep link が要るならフラグメント（`#diff`）で足りる

**この決着が §4-1-b と噛み合う。** スライス 1 で `section` クエリを凍結しなかったのは「タブか 1 スクロールか未決だから」だった。1 スクロールに決めた以上、**旧 `?panel=review|diff` の写し先はクエリではなくフラグメント**（`/report#review` / `/report#diff`）になる。フラグメントはサーバーに送られないので middleware では付けられない — つまり **redirect 層は `?panel=` を単に落として `/report` へ送り、フラグメントは付けない**。旧 deep link は「レポートのどこか」ではなく「レポートの先頭」に着地する。単一ユーザー・課金前でこの劣化は許容する（§4-4 の既知の劣化に統合する）。

**セクションの並び（v1、固定）**:

1. **今日 / 今週の差分** — 開いた瞬間に見える位置。`principles.md` の「差分 = 今日の事実」
2. **予実の傾向** — Time P/L。`principles.md` の「振り返り = 期間・タグの解釈」
3. **セグメント** — 選択中セグメントの単体の数字と過去の自分との比較（#2162 §6-3 の表示規律に従い、円グラフ・積み上げ・合計 100% を使わない）

**セクションを足すには、この一覧を書き換える必要がある。** 実装上も、ページが受け取るセクションの配列をここに固定し、条件分岐で生やせないようにする。

### 6-2. Pro 境界 — v1 は `/report` 全体を無料にする（**User 裁定**）

**このスライスで最も重い発見だった。** `/report` の中身の主役は Pro プラン限定の procedure だった。

| procedure                     | 現状の認可           | 誰が使うか                                                                      |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `statistics.getTimePL`        | `protectedProcedure` | `useTimePLData` → Time P/L（予実比較）                                          |
| `statistics.getStatsPageData` | **`proProcedure`**   | `useReviewPageData` → `WeeklyReflectionPanel`（見積もりバイアス・空白率・傾向） |

`features/timeblock/server/statistics-kpi-router.ts:43-44` のコメントが従来方針を明示している — 「（`getTimePL`）は protected、Review の分析深度にあたるもの（`getEstimationAccuracy` / `getStatsPageData` 等）は pro になっている」。

**パネルだった時は、これで良かった。** 脇の帯の一部が Pro なのは自然で、無料ユーザーにもカレンダーという主画面が残る。**フルページになると意味が変わる** — Sidebar に常設タブとして「レポート」が並び、無料ユーザーがそれを押すと中身の大半が空か Pro 案内のページに着く。タブが常に見えている分、「機能の一部が有料」ではなく「押せるタブが 1 つ死んでいる」体験になる。

#### 決定（2026-08-18、User 裁定。指揮台経由）

> **v1 では `/report` に課金境界を引かない。全部無料にする。**

Free / Pro 境界は**課金を有効化するタイミングで改めて設計する**。

##### 実装方法は「ゲートを外す」ではなく「何もしない」が正しい（実測による差し戻し）

指揮台からの伝達では実装方法まで指定されていた — 「`statistics.getStatsPageData` の `proProcedure` ゲートを `protectedProcedure` へ外す」。**実測すると、この手段は裁定の意図と食い違う。**

```ts
// lib/trpc/procedures.ts:183-188
export const proProcedure = protectedProcedure.meta({ auth: 'pro' }).use(async ({ ctx, next }) => {
  // 課金 enforcement が無効（既定）の間は Pro ゲートを素通りさせ、全機能を無料提供する。
  // proProcedure 注釈は将来の課金対象マーカーとして温存する（Phase B でフラグを 'true' に）。
  if (!isBillingEnforced()) {
    return next({ ctx });
  }
```

`isBillingEnforced()` は `env.BILLING_ENFORCED === 'true'` を見るだけで（`lib/billing/enforcement.ts:19-21`）、production では未設定。**つまり `getStatsPageData` は今すでに無料で通っている。**

したがって:

- **「v1 は `/report` を全部無料にする」は、コードを 1 行も変えずに既に満たされている。** ゲートを外しても**今日の挙動は 1 ミリも変わらない**
- **ゲートを外すと失うものがある。** `enforcement.ts:16-17` が設計意図を明記している — 「Phase B（プロダクト成熟・ローンチ前）に production で `BILLING_ENFORCED='true'` を設定し、Free/Pro の棲み分けを**1 か所のフラグ反転で**復活させる」。注釈を剥がすと `getStatsPageData` だけがこの一括反転から**静かに漏れる**。課金を有効化した時、他の Pro 機能はゲートが戻るのにこの 1 本だけ無料のまま残り、しかも誰も気づかない
- **裁定のもう半分「Free / Pro 境界は課金有効化のタイミングで改めて設計する」と直接矛盾する。** 注釈を剥がす行為自体が「この 1 本は無料」という境界の先引きになる

**推奨: `proProcedure` はそのまま残す。** 裁定の意図（v1 は全部無料 / 境界は後で設計）は、既存の enforcement フラグが**そのまま**満たしている。本 project の実装 scope から認可の変更を落とす。

**差し戻しは受諾された**（2026-08-18、指揮台。「実測が正しく、実装指定が誤りだった」）。**確定: `proProcedure` 注釈は残し、本 project の実装 scope から認可の変更を落とす。** 挙動差ゼロの可逆な采配として User へ事後報告される。

**副産物**: §6-2 の当初の懸念（無料ユーザーに「押せるタブが 1 つ死んでいる」体験が出る）は、**課金を有効化するまで発生しない**。懸念が現実になるのは `BILLING_ENFORCED='true'` を立てる時で、その時点で境界を設計するという裁定は、懸念のタイミングとも噛み合っている。

**これは設計レーンの推奨（差分と Time P/L だけ無料、深い分析は Pro）とも指揮台の支持とも分岐した判断**で、判断ジャーナル（`judgment:diverged`）として #2181 に記録済み。

**この裁定を支持する根拠**（分岐した側の言い分を残すためではなく、判断の再現性のために書く）:

- **#2162 が Free / Pro 境界を「保留」にしている**（同設計書 §12-3）。片方の project だけが境界を先に引くと、後から全体設計をやり直す時に既に出荷された線引きが制約になる。**境界を引かないほうが扉が多く残る**（`decision-principles.md` 原則 4）
- **課金は production で未有効化**（Stripe env が入っていない）。いま境界を引いても検証できず、実データも取れない
- 私が推奨した「深さで線を引く」案は、**課金を有効化する時に改めて選べる**。v1 で無料にしたものを後から有料にするのは難しいが、**この時点ではまだ誰にも出荷していない**ので、その非対称性は発生していない

#### もし差し戻しが通らず「ゲートを外す」で確定したら

`proProcedure` → `protectedProcedure` は**認可境界を緩める変更**なので、`.claude/rules/ai-behavior.md` §Read-only delegation の自動委任条件（auth / billing）に該当する。その場合は**実装 PR で `risk-reviewer` の反証レビューを push 前に必ずかける**。確認する観点:

- 剥がした注釈が `BILLING_ENFORCED` の一括反転から漏れることを、`docs/product/specs/` のどこかに記録したか（漏れの本体は上記のとおり、これが最大の失点）
- `getStatsPageData` が返すデータに、Pro 限定であることを前提にした情報が混ざっていないか
- `getStatsPageData` 以外に道連れで緩む procedure が無いか

### 6-3. 期間契約 — `/report` は自前の期間を持つ必要がある（実測で判明）

**現状 `/report` に相当する期間の概念は存在しない。** review が受け取る期間は、カレンダーの view から作られている:

```ts
// CalendarViewClient.tsx:126-132
const reviewDisplayRange = useMemo(
  () => ({ ...composition.viewDateRange, showWeekends: composition.showWeekends }),
  [composition.showWeekends, composition.viewDateRange],
);
```

型は `ReviewDisplayRange`（`features/review/lib/compute-date-range.ts:8-13`）:

```ts
export interface ReviewDisplayRange {
  start: Date;
  end: Date;
  days: readonly Date[]; // ← 範囲ではなく「日の配列」
  showWeekends: boolean;
}
```

**`days` が範囲ではなく日の配列である点が効く。** 週末非表示の週は 5 要素になり、集計もその 5 日で行われる。`/report` が自前の期間を持つなら、この配列を自分で組み立てなければならない。

**粒度の型は存在するが、形骸化している**（実測）:

- `features/review/stores/useReviewFilterStore.ts:7` に `export type ReviewGranularity = 'week';` — **取りうる値が 1 つしかない**
- `compute-date-range.ts` の 3 関数（`computeStatsDateRange` / `computePreviousDateRange` / `computeMonthCount`）はいずれも granularity を `_granularity` として受け取るだけで**分岐に使っていない**。`computeMonthCount` は無条件に `return 3;`
- 実際の粒度は `useTimePLData.ts:92` が `dayCount` から導出している: `dayCount === 1 ? 'day' : dayCount === 7 ? 'week' : 'range'`

**したがって `/report` の期間契約はこう凍結する**:

```
/{locale}/report?date=YYYY-MM-DD&range=day|week
```

- `range` の値域は **v1 で `day` と `week` の 2 つだけ**。これは `useTimePLData` が既に導出している 3 値のうち実装が存在する 2 つで、`range`（任意日数）はカレンダーの multi-day view 由来の状態なので `/report` には持ち込まない
- `range` 省略時は `week`
- **`days` はサーバー / クライアントで `date` + `range` + ユーザー設定の `showWeekends` から組み立てる。** `showWeekends` は URL に置かない — これはユーザー設定であって共有したい状態ではないため。`ReviewDisplayRange` の構築関数を `features/review/lib/compute-date-range.ts` に足す
- **`month` を足さない**（§11）。足すと `computeMonthCount` の無条件 `return 3` を含む形骸化した経路を全部生かす作業が生え、しかも「期間指定の複雑なフィルタ」（§3-2 の歯止め）へ一歩踏み出す

**`ReviewGranularity` 型は `'day' | 'week'` へ広げる。** 形骸化した `_granularity` パラメータもこの機会に実際に使うか、使わないなら消す（引数だけ残すと次の人が「効く」と誤解する）。

### 6-4. `CalendarReviewRail` は廃止する

§6-1 で 1 スクロールに決めた以上、**タブ切替の薄いラッパーである `CalendarReviewRail` は役目を失う**。#2161 が「段階統合 Phase 1」として作ったもので、Phase 2 がこの project にあたる。

- `features/review/index.ts` は現在 `CalendarReviewRail` と `useReviewOpenedTracking` の **2 つしか export していない**。`CalendarReviewPanel` / `ReviewDiffPanel` / `WeeklyReflectionPanel` は feature 内部専用で、`lint:boundaries` が deep import を禁止している
- したがって `/report` ページを作る作業は、**`features/review/index.ts` の公開契約の作り替え**を伴う。`CalendarReviewRail` を落として、フルページ用のコンポーネント（例: `ReportPage` 相当）を 1 つ export する形にする
- **export を 1 つに保つ。** セクションを個別に export すると、`/report` の外からセクションを拾って別の場所に置けるようになり、§3-2 の歯止め（分析の置き場を増やさない）が緩む

### 6-5. パネルの狭さを前提にした実装の作り替え（実測一覧）

フルページ化で直す箇所。**「そのまま置けば広く見える」わけではない**ことの根拠。

| 箇所                                                             | 現状                                                          | フルページでの扱い                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `WeeklyReflectionPanel.tsx:15-16`                                | `MAX_TIME_PL_ROWS = 5` / `MAX_ESTIMATION_ROWS = 3` で切り詰め | **上限を外す**。狭さのための切り詰めで、広い画面では情報を捨てているだけ                                        |
| `CalendarReviewPanel.tsx:38` / `ReviewDiffPanel.tsx:51`          | `variant: 'rail' \| 'sheet'` の 2 値                          | `'page'` を足すのではなく、**`variant` を廃止**（§6-4 で rail が消え、sheet はモバイルのパネル = これも消える） |
| `CalendarReviewPanel.tsx:140`                                    | `isSheet ? 'max-h-[min(72dvh,560px)]' : 'min-h-0 flex-1'`     | ページ全体のスクロールに委ねる                                                                                  |
| `ReviewDiffPanel.tsx:161`                                        | `isSheet ? 'max-h-96' : 'flex-1'`（384px 頭打ち）             | 同上                                                                                                            |
| `CalendarReviewPanel.tsx:119-132` / `ReviewDiffPanel.tsx:94-114` | close ボタン                                                  | **削除**（ページには閉じるという概念が無い）                                                                    |
| `CalendarReviewRail.tsx:52`                                      | `h-full flex-col`（親の高さに完全依存）                       | ページのスクロールに委ねる                                                                                      |

**タグ絞り込み `Select`（`CalendarReviewPanel.tsx:95-118`）の去就**: 狭さのために `Select` に押し込めていた。フルページかつ #2162 でセグメントが Sidebar に出る（§5-5）ので、**この `Select` は廃止して Sidebar 側へ寄せる**。`reviewTagId` は #2162 の語彙で名前が変わるため、最終名はレーン G の確定に従う。

### 6-7. このスライスの Reversibility

| 変更                                          | 判定        | 根拠                                                                                                                                             |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 スクロール構成                              | `[minutes]` | レイアウトのみ                                                                                                                                   |
| `/report?date=&range=` の凍結                 | `[hours]`   | 公開 URL 契約だが 307 redirect で行き先を変えられる（§4-5 と同じ性質）                                                                           |
| `features/review/index.ts` の公開契約作り替え | `[minutes]` | repo 内の契約。外部に出ない                                                                                                                      |
| `ReviewGranularity` 型の拡張                  | `[minutes]` | 純追加                                                                                                                                           |
| 課金境界（§6-2）                              | —           | **v1 では何もしない**。既存の `BILLING_ENFORCED` フラグが既に全機能を無料にしている。認可の変更を scope から落としたので可逆性の議論も発生しない |

### 6-8. plan-review の HALT 判定と未解決の設計課題（2026-08-18）

スライス 2・3 に `/plan-review` をかけたところ **HALT（凍結不可）** が返った。**指摘はすべて実測で裏を取り、妥当と判断した。** 以下を埋めるまで §5・§6 は凍結しない。

| #   | 課題                                                                                                                                                                                                                | 実測での確認                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **タブを往復すると日付と view がリセットされる。** §5-4 の「日付は不変」は誤り。Provider が再マウントされないことと state が保たれることは別で、`/calendar` へ戻った時に `initialDate`（今日）が state を上書きする | `CalendarNavigationContext.tsx:257-270` の effect を確認。`isCalendarPage` が false の `/report` では発火しないが、**戻った瞬間に発火する** |
| 2   | **`/report` の loading / error を現行のまま移植すると壊れる。** `isLoading = isPending \|\| isTimePLPending` / `hasError = isError \|\| isTimePLError` の合成で、片方の失敗が画面全体を潰す                         | `CalendarReviewPanel.tsx:76-77` で合成を確認                                                                                                |
| 3   | **`days` をサーバー側で組むと production だけ 1 日ずれる。** §6-3 の「サーバー / クライアントで組み立てる」が誤り                                                                                                   | `compute-date-range.ts:164-169` の `toCalendarDateKey` がローカル TZ の getter（`getFullYear` 等）を使うことを確認。Vercel は UTC           |
| 4   | **`pb-16` は 2 段化以前に既に足りていない。** 静的クラスでは `env(safe-area-inset-bottom)` を含む高さを表現できない                                                                                                 | `TagChipRow.tsx:58` が `min-h-14` + `pt-1` + `pb-safe` + `fixed inset-x-0 bottom-0` を確認。対する余白は `pb-16`（64px）                    |
| 5   | **`weekStartsOn` が設計に一度も出てこない。** `range=week` の週境界を決める必須入力で、`showWeekends` と同じ「共有リンクで相手とずれる」性質を持つ                                                                  | `compute-date-range.ts` の関数が `weekStartsOn` を取ることを確認                                                                            |
| 6   | **差分のデータ源が `CalendarController` の内部にある。** `/report` がこれを表示する方法が未確定で、Step 4 の作業量を大きく変える                                                                                    | `CalendarController.tsx:255-311` で `computeTimeblockDayDiffs` が `allTimeblocks` + 可視性 + `showWeekends` から計算していることを確認      |
| 7   | **Step 4 にレーン G との順序制約が無い。** §6-4 / §6-5 は `features/review/` の公開契約作り替えと内部改修を要求しており、G と**構造的に競合**する（rename ではない）                                                | §9 の Step 表で「レーン G merge 後」が Step 5 にしか付いていないことを確認                                                                  |

**あわせて直した設計書自身の欠陥**:

- §11 に「`BottomTabBar` を復活させない」が残ったまま §5-7 で復活を決めており、**設計書が自己矛盾していた**（User 判断を反映した時に §11 を直し忘れた）。§11 の当該行と §10 の該当行を修正済み
- §5-4-b（`/report` の MiniCalendar が `/calendar` の URL を書いてしまう）は設計レーンが独自に見つけて先に書いていたもので、plan-review も同じ穴を独立に指摘した。**2 経路が一致したので確度が高い**

**過剰と指摘され、受け入れたもの**: `WorkspaceTab` の `'other'` は §5-4 が「calendar として扱う」と決めている以上不要（2 値へ畳む）。§6-5 の `truncate` 棚卸しは目的（面積）と無関係なので別 issue。§6-6 の spec 改名は §4-6 の E2E 書き換えに吸収する。

**次のラウンドでやること**: 上表 7 件を設計へ落とし、§5・§6 を再提出して `/plan-review` にかけ直す。

### 6-9. HALT の解消（設計の追補）

§6-8 の 7 件に答える。**ここまで書いて再度 `/plan-review` にかける。**

#### 1. タブリンクが `date` と `view` を引き継ぐ（契約）

`WorkspaceTabs` の href は固定文字列にしない。`useCalendarNavigation()` の `currentDate` / `viewType` から組む:

- カレンダータブ: `/{locale}/calendar?view={viewType}&date={currentDate}`
- レポートタブ: `/{locale}/report?date={currentDate}&range={range}`

**§5-4 の「日付は不変」の根拠を差し替える。** 「Provider が分岐より上にある」は**必要条件でしかない**。実際に state を守っているのは**タブ href が `date` を運ぶこと**で、Provider の位置はそれを可能にする土台にすぎない。`CalendarNavigationContext.tsx:257-270` の effect は `/calendar` へ戻った瞬間に URL 由来の `initialDate` で state を上書きするので、URL に `date` が乗っていなければ今日へ飛ぶ。

**test で固定する**: `/calendar?view=day&date=X` → レポートタブ → カレンダータブ の往復で `currentDate` と `viewType` が不変であること。

**`viewType` / `panelKind` / `reviewTagId` を §5-4 の表に追加する**: `viewType` は href が運ぶので不変。`panelKind` は Step 6 で廃止されるまで残るので、Step 3〜5 の期間は**タブ往復で落ちることを許容する**（中間状態で、`/report` へ移った時点で panel の概念自体が意味を失うため）。`reviewTagId` は §6-5 のとおり Sidebar 側へ移すので、この期間は同様に落ちてよい。

#### 2. セクションごとに独立した loading / error 境界を持つ

`isLoading` / `hasError` を**クエリ横断で合成しない**（`CalendarReviewPanel.tsx:76-77` の形を持ち込まない）。セクション 1（差分）・2（Time P/L）・3（セグメント）がそれぞれ自分のデータ源の状態だけを見る。

- 片方のクエリが失敗しても、他のセクションは描画され続ける
- `enabled: false` でクエリを止める場合、**`isPending` を loading 判定に使わない**（TanStack Query v5 では disabled query の `isPending` は真のままなので、永久スケルトンになる）
- 将来 `BILLING_ENFORCED` を立てた時に `FORBIDDEN` が返る経路ができるので、**その時に備えて「`error.data?.code === 'FORBIDDEN'` は案内、それ以外は `ErrorState`」の分岐を最初から入れておく**。今は発火しないが、分岐が無いと課金有効化の日に全画面エラーになる

#### 3. `days` はクライアント側でのみ組む

§6-3 の「サーバー / クライアントで組み立てる」を**「クライアントで組み立てる」に限定する**。`toCalendarDateKey`（`compute-date-range.ts:164-169`）が `getFullYear` / `getMonth` / `getDate` という**実行環境のローカル TZ 依存**の getter を使うため、Vercel（UTC）で組むと JST ユーザーの週境界が 1 日ずれる。**ローカルの Mac では再現しない production 限定の故障**になる。

サーバー prefetch が要る場合は `days`（`Date[]`）ではなく `visibleDateKeys`（文字列）を TZ 明示で作る関数を別に用意する。**本 project の v1 では `/report` の server prefetch をやらない**（§11 へ追加）ことで、この分岐自体を避ける。

#### 4. 固定バーは 1 つのコンテナに入れ、本文余白は CSS 変数で連動させる

§5-7-b の「`pb-16` を 2 段分へ更新」は**実装できない**。理由: `TagChipRow.tsx:58` は `fixed inset-x-0 bottom-0` + `min-h-14`（56px）+ `pt-1` + **`pb-safe`**（ホームインジケーター分、iPhone で約 34px）で実効 ~94px あるのに、本文側の余白は `pb-16` = 64px しかない。**2 段化以前に既に約 30px 食い込んでいる**（既存の不具合。本 project が作ったものではないが、2 段化で確実に露見する）。静的な Tailwind クラスでは `env(safe-area-inset-bottom)` を含む高さを表現できない。

**設計**: `fixed inset-x-0 bottom-0` のコンテナを 1 つだけ置き、その中に縦 flex で `ActivityChipRow` → `BottomTabBar` の順に入れる。`pb-safe` は**コンテナの最下段にだけ**付ける。本文側は固定クラスをやめ、コンテナの実測高を CSS 変数（`--bottom-bars-h`）で公開して `padding-bottom: calc(var(--bottom-bars-h) + env(safe-area-inset-bottom))` にする。

この形なら `z-index` トークンも増やさずに済む（`bottom-tab: 40` 1 つで足りる。`packages/foundations/src/tokens/z-index.css`）。`TagChipRow` の `bottom-0` を任意値（`bottom-[56px]`）でずらす案は `design-system.md` の規律に触れるので採らない。

**追加の検証項目**（実機確認が要る、実装 Step の完了条件に含める）:

- **iOS Safari のツールバー**: `base-layout-content.tsx` は `h-screen` を使っており、`100vh` は大ビューポート（ツールバー隠れ時）基準。ツールバー表示中に下段タブが到達不能にならないか。必要なら `h-dvh` へ変える
- **キーボード / bottom sheet 表示時**: `TagTimeblockCreatePopover` が開いている間は**下段バー群を隠す**（誤タップ対策の 4 点目）

#### 5. `weekStartsOn` を期間契約の入力に含める

`range=week` の週境界を決めるのに必須（`compute-date-range.ts` の関数が引数に取る）。`showWeekends` とまったく同じ「共有リンクを開いた相手と表示がずれる」性質を持つ。

**一般原則として書く**（`showWeekends` だけの個別判断にしない）: **表示設定（`showWeekends` / `weekStartsOn` / タイムゾーン）は URL に載せない。** URL が持つのは「どこを見ているか」（`date` / `range`）だけで、「どう見せるか」は各ユーザーの設定に従う。共有リンクを開いた相手が自分の設定で見るのは劣化ではなく意図した挙動。

#### 6. 差分のデータ源 — 純関数は既に切り出されている

**実測すると、作業量は懸念より小さい。** `computeTimeblockDayDiffs` は `features/calendar/lib/timeblock-day-diff.ts:113-117` の**純関数**で、`(plans, records, bounds)` を取るだけ。`CalendarController.tsx:255-311` がやっているのは `allTimeblocks` を plan / record に振り分けて可視性で絞る**前処理**で、これも純粋な変換。

**選択肢の比較**（指揮台の要請により明示）:

| 案                                                                  | 作業量                                                                                                                                        | 判定     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A: 前処理を純関数として切り出し、`/report` が独立に呼ぶ**（採用） | 中。`CalendarController.tsx:255-311` の 2 つの `useMemo` を pure 関数へ移し、両者が呼ぶ形にする                                               | **採用** |
| B: `CalendarController` から差分結果を受け取る                      | 小さく見えるが、`/report` が `CalendarController` に依存する。カレンダーが描画されていない `/report` で Controller を動かす形になり、本末転倒 | 不採用   |
| C: `/report` 専用の差分集計を新規に書く                             | 大。集計ロジックが 2 本になり、`computeTimeblockDayDiffs` の回帰テストが片方しか守らなくなる                                                  | 不採用   |

**A を採る理由**: 差分計算の本体（`computeTimeblockDayDiffs`）は**既に純関数として切り出されている**（`features/calendar/lib/timeblock-day-diff.ts:113-117`、`(plans, records, bounds)` を取るだけ）。残っているのは `allTimeblocks` を plan / record へ振り分けて可視性で絞る前処理だけで、これも純粋な変換。**つまり A は「切り出す」というより「切り出し残しを片付ける」作業**で、当初の懸念（Step 4 の作業量が大きく変わる）ほど重くない。

**設計**: 前処理を `CalendarController` から純関数として切り出し、`/report` は「期間分の timeblock を取得 → 同じ前処理 → 同じ `computeTimeblockDayDiffs`」を通す。**集計ロジックを二重に持たない。**

**feature 境界（実測で確定。architecture-guard 送りにしない）**: `calendar` と `review` は**どちらも Layer 2**（`feature-boundaries.md` の DAG）で、**同層間の参照は ESLint `error` で禁止**されている。したがって「calendar の barrel から export して review が使う」は**成立しない**。取れる形は 2 つ:

| 案                                                                              | 判定                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **A: `timeblock-day-diff.ts` と前処理を `features/timeblock`（Layer 1）へ移す** | **採用**                                                                                 |
| B: Composition Layer（`/report` の page、`app/` 配下）で合成する                | 次善。DAG の外なので合法だが、集計ロジックが page に貼り付き、単体テストが書きにくくなる |

**A を採る理由**: `computeTimeblockDayDiffs` の入力型は `TimeModelPlanDiffInput` / `TimeModelRecordDiffInput` で、**中身は plan と record、つまり timeblock のドメイン概念**である。`features/calendar` にあるのは「最初に使ったのが calendar だったから」で、置き場所としては元々ずれている。Layer 1 へ下ろせば calendar も review も barrel 経由で参照でき、`feature-boundaries.md` §Layer 1 → Layer 2 は不可 の「adapter は source 側に置く」とも一致する。

**この移動は本 project の Step 4 に含める**（`git mv` + 両 feature の import 差し替え + barrel 追加）。`architecture-guard` の反証レビューを push 前にかける（cross-feature の file move は `.claude/rules/ai-behavior.md` §Read-only delegation の自動委任条件）。

#### 7. Step 4 にレーン G の順序制約を付ける（対応済み）

§6-4 / §6-5 は `features/review/` の**公開契約の作り替えと内部 7 箇所の改修**を要求しており、レーン G が同じファイルの同じ箇所（`CalendarReviewPanel.tsx:95-118` の `Select`、`reviewTagId` の語彙）を書き換える。**PR #2179 のような rename ではなく構造的な競合**になる。§9 の Step 4 に「レーン G merge 後」を追記済み。

#### あわせて削るもの（過剰と指摘され受け入れた）

- **`WorkspaceTab` の `'other'` を廃止し、§5-2 を 2 値へ改訂した**（上流への反映漏れを再レビューで指摘されたので実行済み）。§5-4 が「`other` は calendar として扱う」と決めている以上、第 3 の値があると「`other` 用の Sidebar」を後から誰かが足す。判定は `pathname === '/report' ? 'report' : 'calendar'` の 1 行
- **§6-5 の `truncate` 棚卸し行を削除した**。幅が足りていれば無害で、フルページ化の目的（面積）と無関係。別 issue へ
- **§6-6（spec 改名）の節を削除した**。§4-6 の E2E 全面書き換えに吸収する

### 6-10. 再レビュー（2 巡目）の指摘への回答

1 巡目の解（§6-9）に対して再度 HALT が出た。**上流への反映漏れ 4 件は実行済み**（`WorkspaceTab` の 2 値化、`truncate` 行の削除、§6-6 節の削除、§11 への scope 除外追加、§4-6 と §4-5-b の理由の統一）。残る実質的な指摘に答える。

#### A. 日付の時刻成分 — 実測により無害（blocker 解除）

指摘: href に載るのは `YYYY-MM-DD` なので時刻成分が落ち、戻った時に `initialDate.getTime() !== currentDate.getTime()` が成立して `:257-270` の effect が発火する。

**実測すると `parseCalendarDateParam`（`features/calendar/lib/date-param.ts`）は正午を返す**:

```ts
// 正午で保持し、DST境界やUTC変換で日付が前後しにくい基準値にする。
const parsed = new Date(year, monthIndex, day, 12, 0, 0, 0);
```

したがって:

- **URL 経由で入った日付は今も必ず正午**。`?date=` を読んだ時点で正規化されているので、タブ往復しても `getTime()` は一致し、effect は発火しない
- 非正午になりうるのは `initialDate` の fallback（`new Date()` = 実際の現在時刻）だけ。**この 1 回だけ正午へ正規化される**が、日付は変わらないのでユーザーには見えない
- **これは本 project が作る挙動ではなく、`?date=` を持つ現行 URL の既存挙動**。`/week?date=X` を開いた時点で既に正午になっている

**結論: blocker ではない。** ただし「日付は不変」という §5-4 の表現は厳密には「**日付は不変、時刻成分は正午へ正規化される**」なので、そう書き直す。往復 test の assert も `getTime()` の一致ではなく**日付（`getDateKey`）の一致**で書く（時刻で assert すると初回の正規化で落ちる）。

#### B. `/report` 滞在中の `initialDateRef` と popstate

指摘 2 件に答える。

- **`initialDateRef` の空転**: `:258-259` の `initialDateRef.current = initialDate` は `isCalendarPage` に関係なく毎回走る。`/report` では `initialDate` が `new Date()`（毎レンダー新しい値）なので ref が更新され続ける。**害は無い** — ref は「前回の initialDate」との比較にしか使われず、比較の後段が `isCalendarPage` でガードされている。ただし**紛らわしいので、`/report` でも `resolveCalendarProps` が安定した値を返すようにする**: `isCalendarPage: false` の分岐（`:81-87`）で `initialDate` を `new Date()` ではなく **`currentDateRef` の現在値**にする。これで ref の空転自体が消える
- **popstate の早期 return**: `:275` の `if (!resolved.isCalendarPage) return;` により、`/report` で日付を変えた後の「戻る」が state に反映されない。**`/report` も扱うようにハンドラを直す** — `resolveCalendarProps` が `/report` を認識し、`date` を読んで `currentDate` を復元する。`isCalendarPage` という 2 値の判定を `workspaceTab`（`'calendar' | 'report'` + それ以外）へ広げるのが素直で、§5-2 の dispatcher と同じ判定を共有できる

**この 2 点で `CalendarNavigationContext` の改修範囲が確定する**（§4-2-b の 4 箇所 + §5-4-b の URL writer + ここの 2 箇所 = 計 7 箇所）。Step 1 の scope に反映する。

#### C. `/report` の差分はタグ可視性フィルタに従わない（契約として決める）

指摘: `CalendarController` の前処理は `useCalendarFilterStore` の可視性（`visibleTagIds` / `showUntagged`）に依存しており、`/report` にはそのフィルタ UI が無い。**ユーザーから見て不可視な状態が集計結果を変える。**

**決定: `/report` の集計は可視性フィルタに従わない。全アクティビティを対象にする。**

理由は #2162 §3 の不変条件（Σカテゴリー + 未分類 = 全ブロック時間）。**サイドバーのチェックを外しただけで合計が変わるなら、それは分析ではなく表示の副作用**で、「集計の足し算が合う軸」という 3 構造モデルの前提そのものを壊す。カレンダー上の差分表示（`CalendarController` 側）は「今見えているものの差分」なので可視性に従ってよいが、**`/report` は「事実の集計」なので従わない**。

**実装への含意**: 前処理を純関数化する時、可視性フィルタは**引数として外から渡す形**にし、カレンダーは `isEntryVisible` を渡し、`/report` は「全部可視」を渡す。フィルタ判定を関数の中に閉じ込めない。

#### D. `/report` のデータ取得経路

**`features/review` から `features/calendar` は barrel 込みで機械的に禁止**（`apps/product/eslint.config.mjs:337-348` の `no-restricted-imports`、「同層 feature の import 禁止」）。実測で確認した。したがって `/report` が `useCalendarData`（calendar barrel）を直接呼ぶ形は**成立しない**。

**決定: `/report` のページ（`app/[locale]/(app)/(workspace)/report/`）= Composition Layer が timeblock を取得し、`features/review` のコンポーネントへ props で渡す。**

- Composition Layer は DAG の外なので、timeblock の取得元（`features/timeblock` の barrel）を直接叩ける
- `features/review` 側は「期間分の plan / record を受け取って描く」だけになり、データ取得の責務を持たない。これは現行の `CalendarReviewRail` が `diff` を props で受けている形（`CalendarViewClient.tsx:205`）と**同じ構図**なので、新しいパターンを持ち込まない
- §6-9 #6 の A 案（`timeblock-day-diff.ts` を Layer 1 へ移す）と噛み合う。移した後は Composition Layer が timeblock barrel から集計関数を取れる

**キャッシュ**: カレンダーと `/report` が同じ期間を見ている時にクエリを共有できるかは、tRPC の query key が一致するかで決まる。**v1 では共有を前提にしない**（別々に取得してよい）。単一ユーザー規模で問題にならず、共有を狙うと期間表現の統一という別の設計が要る。

#### E. `CalendarPanelKind` 廃止と「恒久 shim」コメントの衝突（判断を明記）

`CalendarNavigationContext.tsx:60-61` は `analytics` → `review` の読み替えを「**恒久 shim（削除不可 — 外部共有 URL の後方互換のため）**」と書き、テストで固定している。§3-3 はこの型ごと廃止すると決めている。**衝突を明示的に解く。**

**判断: 廃止してよい。** shim が守っている契約（`?panel=analytics` の外部共有リンクが動くこと）は、**§4-4 の redirect 層が引き継ぐ**（`?panel=analytics` → `/report`）。コメントが「削除不可」と書いているのは「**この shim を消すと後方互換が失われる**」という意味であって、「後方互換を別の層で担保しても消してはいけない」ではない。守るべきは shim ではなく契約。

**実行時の条件**: shim を消す Step（Step 6）で、**redirect 層が `?panel=analytics` を処理していることを E2E で確認してから**消す。固定テスト（`CalendarNavigationContext.test.tsx`）は削除ではなく、**redirect の E2E へ移す**（契約を守るテストを消さない）。

#### F. モバイル固定バーの実装可能性（3 点に答える）

- **測定主体**: `ResizeObserver` で測って `style` 属性に書くのは `CLAUDE.md` の規律に触れる。**測らない設計にする** — コンテナの高さを 2 段分のセマンティックな固定値（`min-h-14` × 2 相当）でトークン化し、本文余白も同じトークンで書く。動的測定を導入しない
- **SSR 初期値**: 上記により CSS 変数の未定義問題が消える。固定値なので初回描画から正しい
- **`TagChipRow` がタグ 0 件で `null` を返す**（`:49`）ため、バーの有無が非同期データに依存する。**コンテナは常にマウントし、中身が空でも高さを保つ**か、**空の時はコンテナごと畳んで余白トークンを切り替える**かの二択。**前者を採る**（レイアウトシフトが起きない方を選ぶ。空のチップ列 1 行分の余白は許容する）

**この形なら `--bottom-bars-h` は不要**で、§6-9 #4 の CSS 変数案は取り下げる。指摘のとおり、変数案は測定主体・SSR 初期値・非同期のバー有無という 3 つの穴を同時に開けていた。

#### G. `features/calendar` の component を `_shell` 都合で書き換える件（writer 境界）

`TagChipRow` は自分で `fixed inset-x-0 bottom-0 pb-safe z-bottom-tab` を持っている（`:58`）。F の設計はこれを `_shell` 側のコンテナへ移すので、**`features/calendar` の component を触る**。§5-6 の「F の成果は 1 行も作り替えない」宣言と抵触する。

**訂正**: §5-6 の宣言は「**カテゴリー / アクティビティ IA の中身**を作り替えない」の意味に限定する。`TagChipRow`（→ `ActivityChipRow`）の**配置に関する className** はモバイル shell の都合なので、本 project が触る。**F が作る IA のロジック・データ契約には触れない。** この区別を §5-6 に明記する。

## 9. Step 分解と Reversibility Table

各 Step = 1 レーン = 1 branch = 1 PR（`.claude/rules/workflow.md` §PR 粒度・判定 3 問）。issue は指揮台が凍結後に起票する。**Step 3 以降はスライス 3 の凍結後に確定する**（現時点では骨格のみ）。

| #   | Step                                                                                                                                       | Reversibility | 備考                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **URL 契約の新設** — `/calendar` route 追加 + `access-policy.ts` の保護対象追加 + `CalendarNavigationContext` の view 読み書きを search へ | `[minutes]`   | **`access-policy.ts` を必ず同梱**（§4-5-b。分けると未認証で開通する）。旧 route は残したまま                     |
| 2   | **redirect と参照の切替** — `proxy.ts` の写像 + アプリ内リンク 8 箇所 + メールテンプレート 4 通 + `robots.txt` + E2E                       | `[hours]`     | 写像の行き先は 307 なので変えられるが、**redirect 層そのものは以後恒久物**（§4-5）                               |
| 3   | **shell のタブ化** — `SidebarContent` の dispatcher 化 + `CalendarSidebar` 抽出 + `WorkspaceTabs`                                          | `[minutes]`   | **レーン F（PR #2179）merge 後**（§5-6）。`/report` はまだ空でよい                                               |
| 4   | **`/report` ページ本体** — review / diff の中身の移植 + 期間パラメータの凍結                                                               | 未確定        | スライス 3 で確定                                                                                                |
| 5   | **セグメント表示の接続** — レーン G の集計 API を `/report` と `ReportSidebar` へ配線                                                      | 未確定        | **レーン G merge 後**。スライス 3 で確定                                                                         |
| 6   | **旧 route と旧 panel の削除** — `(workspace)/{day,week,[nday]}/**`、`CalendarPanelKind`、パネル関連コード                                 | `[minutes]`   | **redirect の稼働を実測してから。** `workspaceViewPathPattern` の削除もここ（§4-5-b）。**redirect 層は消さない** |
| 7   | **docs の追従** — `strategy.md` 原則 10 改訂、`principles.md` の右パネル節と 3 点分散表、`specs/review.md`                                 | `[minutes]`   | **User 承認済み**（§3-2）。設計書の凍結とは別 PR にする                                                          |

**`[irreversible]` は 1 つも無いが、`[irreversible]` に近いものが 2 つある**（§4-7）。Step 2 が作る redirect 層と、Step 1 が公開する URL 契約そのもの。

### Step 1 と Step 2 を分ける理由

1 つにすると、`/calendar` が動くことを確認する前に旧 URL の入口を全部塞ぐことになる。分ければ Step 1 merge 後に**旧 URL と新 URL が両方動く窓**ができ、そこで新ページの実挙動を確かめてから切り替えられる。`workflow.md` §分割してよい理由 の「独立して検証したい変更」に当たる。

窓の間の劣化: 無し（旧 URL は今までどおり動く）。**Step 1 だけが production に乗った状態は安全**で、この窓は好きなだけ開けておける。

### Step 6 を最後に隔離する理由

`workflow.md` §分割してよい理由 の「code removal の隔離」。加えて、**redirect が実際に効いていることを production で確認してからでないと旧 route を消せない**（消した後に写像の穴が見つかると 404 になる）。

**Step 6 で消すのは旧 route ファイルであって redirect 層ではない。** 送信済みメール 4 通が `/week` を指しているため、redirect 層は残す（§4-5）。この 2 つを混同すると壊れる。

## 10. Existing Code to Reuse

新規実装ではなく既存を使うもの。**「再利用できるのに新規で書く」を避けるための一覧**（`plan-format.md`）。

| 用途                           | 再利用するもの                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sidebar 外殻・セクション見出し | `components/shell/sidebar/{Sidebar,SidebarSection}.tsx`（変更なしで使える）                        |
| Sidebar の中身（カレンダー側） | 現 `SidebarContent` の body をそのまま `CalendarSidebar.tsx` へ移すだけ                            |
| 日付の同期                     | `CalendarNavigationProvider`（既に layout 分岐より上。§5-1）                                       |
| 日付パラメータの読み書き       | `formatCalendarDateParam` / `parseCalendarDateParam`（`features/calendar/lib/date-param.ts`）      |
| SSR 安全な search 読み取り     | `resolveCalendarProps` の `typeof window !== 'undefined'` ガード付き `URLSearchParams`（`:95-97`） |
| redirect + CSP                 | `redirectWithCsp`（`proxy.ts:135-137`）                                                            |
| ロケール付きパス生成           | `getLocalizedPath` / `getPathWithoutLocale`（`proxy.ts:141`）                                      |
| 安全な redirect 先の検証       | `getSafeRedirectPath`（`lib/safe-redirect.ts`。fallback 値だけ変える）                             |
| review / diff の中身           | `CalendarReviewPanel` / `ReviewDiffPanel`（スライス 3 で扱う）                                     |
| 集計                           | `features/timeblock` の `domain/estimation-accuracy.ts` と `server/statistics-*`（#2162 §6-2）     |
| 前期間（prevDateRange）の算出  | `computeCalendarDisplayDateRanges`（`compute-date-range.ts:33-68`）。新規実装は要らない            |

## 11. What I'm Not Doing

やらないことと理由。**書く行為そのものが scope creep の自己検出**（`plan-format.md`）。

- **`/report` をレポートビルダーにしない** — 期間指定の複雑なフィルタ、カスタム指標、保存フィルタの入れ子、グルーピングの自由化。§3-2 の歯止めの本体
- **`defaultView` へのルーティング追従を足さない** — 現行に無い新機能で、tRPC の往復が増え、値空間も合わない（§4-1）。別 issue へ
- **`emailRedirectTo` を変えない** — Supabase の Redirect URL allowlist に依存する本番専用の故障点。redirect 層に任せれば足りる（§4-6）
- **308 permanent へ上げない** — 写像が正しいと実測で確認した後の独立判断（§4-5）
- **`{L}/review` の redirect を復活させない** — 2026-06 に「ローンチ前のため互換 redirect は作らない」と判断済みの route（§4-4）
- **セグメントの並び替え・フォルダ分け・共有を作らない** — §3-2 の歯止めに直接触れる（§5-5）
- **「ついでに」データ層を触らない** — この project に migration も RPC 変更も無い。#2162 の波と混ぜない
- **`_shell/` と `features/review/` の作り替えをスライス 1 でやらない** — レーン F / G の writer 境界（§4-9）
- **`/report` の server prefetch をやらない** — `days` の構築が TZ 依存になるのを避けるため（§6-9 #3）。v1 はクライアント取得だけにする
- **`robots.txt` の刷新をこの project の外へ広げない** — `/calendar` `/report` の追加と、それに伴って死んでいる 2 行の除去まで。robots 全体の設計見直しは別問題

## 12. sub-issue 分解案（起票は指揮台）

§9 の Step をそのまま issue にする。**1 Step = 1 issue = 1 レーン = 1 branch = 1 PR。** 依存の向きが merge 順になる。

| Step | issue タイトル案                                                                  | 依存                  | 受け入れ条件の核                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `feat(routing): /calendar route を新設し view をクエリで受ける`                   | なし                  | `access-policy.ts` の更新を**同梱**し、`isProtectedProductPath('/calendar')` が true であることを test で固定。旧 route は残す                                         |
| 2    | `refactor(routing): 旧 URL から /calendar /report へ redirect し参照を切り替える` | Step 1                | 旧 URL 5 形すべての写像を E2E で検証。メールテンプレート 4 通も同一 PR                                                                                                 |
| 3    | `refactor(shell): Sidebar をタブ構造へ戻し SidebarContent を dispatcher にする`   | Step 1 / **PR #2179** | タブ往復で Sidebar が再マウントされず日付が保たれることを test で固定。`BottomTabBar` 復活とフッター共存もここ                                                         |
| 4    | `feat(review): /report をフルページ 1 スクロール構成で実装する`                   | Step 3 / **レーン G** | `features/review` の公開契約を 1 export へ。期間は `?date=&range=` から `ReviewDisplayRange` を構築。**認可は変更しない**（§6-2。既存の enforcement フラグで既に無料） |
| 5    | `feat(review): セグメントを ReportSidebar と /report へ配線する`                  | Step 4 / **レーン G** | #2162 §6-3 の表示規律（`total` / `share` を返さない、円グラフ・積み上げを使わない）を維持                                                                              |
| 6    | `refactor(routing): 旧 route と右サイドパネルの残骸を削除する`                    | Step 2 / Step 4       | **redirect 層は消さない。** `workspaceViewPathPattern` の削除もここ                                                                                                    |
| 7    | `docs(product): 原則 10 の歯止めを置き場所から中身へ移す`                         | なし（並行可）        | `strategy.md` §4-10 と `principles.md:35` を**同時に**直す。`specs/review.md` も追従                                                                                   |

**Step 7 は他と並行してよい**（docs のみで、コードに依存しない）。ただし **§4-10 と `principles.md:35` を分けない** — 片方だけ直すと後続レビューが未改訂の側を根拠に差し戻せる。

**ラベル案**: 全件 `type:feature` または `type:refactor` + `area:calendar`。Step 7 のみ `area:docs`。milestone は epic #2181 と同じ。

**別 issue へ切るもの**（この project の scope 外・§11 と対応）:

- `/calendar` の `view` 省略時に `defaultView` へ追従する（`defaultView` の値空間拡張を含む）
- 旧 URL redirect の 308 昇格（写像が正しいと実測で確認した後）
- `getStatsPageData` と `getTimePL` の重複統合（#2161 が Phase 2 送りにしたもの）
