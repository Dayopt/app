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
| `useMemo` の依存（`:129-132`）                                  | `[pathname]`                                                                             | 依存の見直し                            |
| popstate ハンドラ（`:272-293`）                                 | `resolveCalendarProps(window.location.pathname)` を呼ぶ                                  | 同上（search を見る）                   |
| `writeCalendarUrl`（`:175-207`）                                | `` `/${localeRef.current}/${view}?${params}` `` を `pushState` / `replaceState` で書く   | `` `/${locale}/calendar?view=…&…` `` へ |

**直さないとどうなるか（具体的な故障）**:

- `/calendar?view=week` を開いても `resolveCalendarProps` は最終セグメント `calendar` を見て `isValidViewType` に落ち、**常に `day` で描画される**
- `writeCalendarUrl` を直さないまま view を切り替えると、`pushState` が `/week?...` を書く。**`pushState` は middleware を通らない**ので redirect も走らず、アドレスバーだけ旧 URL に戻る。共有・リロードで初めて redirect が効くという分かりにくい状態になる
- 旧 route を削除した後は、その履歴エントリへ「戻る」たびに実リクエストが飛んで redirect が 1 往復入る

**したがって `CalendarNavigationContext.tsx` はスライス 1 の scope に入る**（§4-6 の一覧に追加済み）。「redirect を張るだけ」では済まない。

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
| `apps/product/src/lib/auth/domain/access-policy.ts:17`                                                             | `const workspaceViewPathPattern = /^\/(day\|week\|\d+day)(\/\|$)/;`                                                                                                                                                                            | `/calendar` `/report` を保護対象へ。**旧パターンも当面残す**（redirect 前に認証判定が走る経路があるため。消すと旧 URL が未認証で redirect を試みる）                                                                                                                                                                   |
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

## 5. スライス 2 — shell / Sidebar タブ構造（凍結）

### 5-1. 旧構造の半分は既に生き残っている（再実装しなくてよい部分）

epic の「既知の障害 1」は「SidebarContent のモード分岐は完全撤去済み（pathname dispatch の再実装が必要）」だが、**実測すると撤去されたのは分岐だけで、分岐を可能にしていた構造はそのまま残っている。**

| 旧設計（`8c9e497b4` の Option Y）が要求した条件                     | 現状                                                                                                                                                                                                                                                                 | 判定           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Sidebar 外殻を単一箇所にマウントし、モード切替で再マウントさせない  | `desktop-layout.tsx:71-79` で `AnimatedWidthPanel` → `Sidebar` → `SidebarContent` を 1 回だけマウント                                                                                                                                                                | **既に満たす** |
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

- 型は `WorkspaceTab = 'calendar' | 'report' | 'other'`。旧 `getModeFromPath`（`_shell/navigation-paths.ts`、`66a3ea6db` で削除済み）の再来だが、**パスが完全一致 2 値になるので形状判定が要らない**。旧実装が必要とした `isCalendarViewPath(pathWithoutLocale)` 呼び出しと `[2-7]day` 正規表現が dispatcher から消える。これはスライス 1 で view をクエリにした設計の直接の見返り
- 新規ファイルは `_shell/`（Composition Layer）に置き、`features/` へ昇格させない。旧設計が `CalendarSidebar` / `StatsSidebar` を `_shell/` に置いた判断をそのまま踏襲する
- `CalendarSidebar.tsx` は**現 `SidebarContent` の body を移動するだけ**で、中身を書き換えない（§5-6 の writer 境界に直結）

### 5-3. dispatcher は `usePathname()` だけで判定する（`useSearchParams()` を使わない）

`base-layout-content.tsx` に警告コメントがある:

> ⚠ `useSearchParams()` は使用しない。Calendar panel での URL 変更（replaceState）が Suspense 境界を発火し、子ツリー全体がアンマウントされるバグを防止するため。

**タブ判定に `?view=` を混ぜてはいけない。** 混ぜると view 切替のたびに Sidebar を含む子ツリーがアンマウントされ、Option Y が守っている「再マウント 0 回」が壊れる。

これがスライス 1 の設計と噛み合う: **タブ = パス（`/calendar` \| `/report`）、view = クエリ（`?view=`）** という層の分離が、そのまま「dispatcher は pathname だけ読む」という実装規律になる。§4-2 でサブパス案（A）を落とした理由がここでもう一度効く — A ならタブ判定が `/calendar/week` の形状マッチになり、view 変更がパス変更になって毎回 route 遷移が走る。

### 5-4. タブが切り替えるもの / 切り替えないもの

| 要素                                           | タブ切替時 | 根拠                                              |
| ---------------------------------------------- | ---------- | ------------------------------------------------- |
| Sidebar 外殻（ロゴ・幅・開閉状態・`UserMenu`） | 不変       | `desktop-layout.tsx` に単一マウント（§5-1）       |
| `SidebarUtilities`（テーマ切替）               | 不変       | dispatch の外に置く（旧実装と同じ）               |
| Sidebar の中身                                 | **切替**   | `CalendarSidebar` ⇄ `ReportSidebar`               |
| メイン領域                                     | **切替**   | route が変わる（`/calendar` ⇄ `/report`）         |
| 選択中の日付                                   | 不変       | `CalendarNavigationProvider` が分岐より上（§5-1） |
| `sidebar.open` / `sidebar.width`               | 不変       | `useShellStore`（`useShellStore.ts:76,139`）      |

`/settings` は `other`。デスクトップの設定は**ホームへ redirect してモーダルで出す**実装（`settings/layout.tsx` のコメント）なので、裏に見えているのはカレンダーである。したがって `other` のフォールバックは **calendar タブをアクティブにして `CalendarSidebar` を描く**（旧実装の「fallback: settings 等のモード外は CalendarSidebar」と同じ挙動で、今回は実態にも合う）。

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

**結論: F の成果は 1 行も作り替えない。** F が作ったカテゴリー / アクティビティ IA 本体（`features/calendar/components/activity-filter/` 配下 20 ファイル超）は、`CalendarSidebar.tsx` の中に**そのまま入る**。私が足すのはその外側のタブと dispatcher だけ。

衝突は**テキスト衝突のみ**（同じ 2 行を両者が触る）で、**F を先に merge して本 project がその上に載れば消える**。F をやり直させる理由はない。

**merge 順の制約**: `#2162 の波（E1 → H1 → F → G → H2）` → 本 project の shell Step。F より先に本 project の shell を merge すると、F が `CalendarSidebar.tsx` という移動先のファイルに対して rename をやり直すことになり、F 側に余計な追従が生える。

### 5-7. モバイルのタブ切替 — `BottomTabBar` を 2 タブで復活する（**User 確定**）

**現状の実測**: モバイルに Sidebar は存在しない。`mobile-layout.tsx` は `AppHeader` + `MainContentWrapper` + `ActivityChipRow`（カレンダーのみの固定フッター）の 3 段だけで、Sidebar も toggle も出さない（`calendar-review-panel-migration` overview §3 の「Sidebar toggle は mobile に出さない」がそのまま生きている）。**したがって §5-2 の Sidebar タブはモバイルでは 1 ピクセルも見えない。**

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

### 6-2. `/report` は Pro 境界を丸ごと抱える（実測で判明・**要 User 裁可**）

**このスライスで最も重い発見。** `/report` の中身の主役は Pro プラン限定の procedure である。

| procedure                     | 認可                 | 誰が使うか                                                                      |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `statistics.getTimePL`        | `protectedProcedure` | `useTimePLData` → Time P/L（予実比較）                                          |
| `statistics.getStatsPageData` | **`proProcedure`**   | `useReviewPageData` → `WeeklyReflectionPanel`（見積もりバイアス・空白率・傾向） |

`features/timeblock/server/statistics-kpi-router.ts:43-44` のコメントが方針を明示している — 「（`getTimePL`）は protected、Review の分析深度にあたるもの（`getEstimationAccuracy` / `getStatsPageData` 等）は pro になっている」。

**パネルだった時は、これで良かった。** 脇の帯の一部が Pro だと分かるのは自然な体験で、無料ユーザーにもカレンダーという主画面が残る。**フルページになると意味が変わる** — Sidebar に常設タブとして「レポート」が並び、無料ユーザーがそれを押すと**中身の大半が空か Pro 案内のページ**に着く。タブが常に見えている分、これは「機能の一部が有料」ではなく「押せるタブが 1 つ死んでいる」体験になる。

**選択肢（推奨は 1）**:

1. **`/report` の第 1 セクション（差分）と第 2 セクション（Time P/L）は無料で出し、第 3 セクション以降と `getStatsPageData` 由来の深い分析だけ Pro にする** — 1 スクロール構成（§6-1）なら、上から読んでいって途中で Pro 境界に当たる形になり、「タブが死んでいる」ではなく「続きがある」になる。差分は `protectedProcedure` 経路（クライアント計算 + `getTimePL`）で賄えるので実装上も成立する
2. `/report` 全体を Pro にし、無料ユーザーには Sidebar タブ自体を出さない — 体験は一貫するが、無料ユーザーが分析の価値を知る機会がゼロになる
3. 現状の境界のまま（`getStatsPageData` だけ Pro）でフルページ化し、Pro 境界の再設計は別 project

**推奨は 1。** `strategy.md` §4-6「進捗は報酬ではなく証拠で見せる」に沿えば、**証拠の最小単位（今日のズレ）は無料で見られるべき**で、Pro が売るのは「深さ」（期間をまたぐ傾向、見積もり精度の推移）である。この線引きは 1 と一致する。

**注意**: 課金は production でまだ有効化されていない（Stripe env が入っていない）ため、**この判断は今すぐ壊れるものではない**。しかし境界の設計を先送りすると、課金を入れた瞬間に「タブが死ぬ」体験が出荷される。**設計としてここで決め、実装は Step で分けてよい。**

これは価値判断なので指揮台経由で User へ上げる。裁可が出るまで §6-3 以降は「セクション 1・2 は無料」を仮置きで書く。

### 6-3. 期間契約 — `/report` は自前の期間を持つ必要がある（実測で判明）

**現状 `/report` に相当する期間の概念は存在しない。** review が受け取る期間は、カレンダーの view から作られている:

```ts
// CalendarViewClient.tsx:126-132
const reviewDisplayRange = useMemo(
  () => ({ ...composition.viewDateRange, showWeekends: composition.showWeekends }),
  [composition.showWeekends, composition.viewDateRange],
);
```

型は `ReviewDisplayRange`（`features/review/lib/compute-date-range.ts:9-14`）:

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

| 箇所                                                                                                                   | 現状                                                          | フルページでの扱い                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `WeeklyReflectionPanel.tsx:15-16`                                                                                      | `MAX_TIME_PL_ROWS = 5` / `MAX_ESTIMATION_ROWS = 3` で切り詰め | **上限を外す**。狭さのための切り詰めで、広い画面では情報を捨てているだけ                                        |
| `CalendarReviewPanel.tsx:38` / `ReviewDiffPanel.tsx:51`                                                                | `variant: 'rail' \| 'sheet'` の 2 値                          | `'page'` を足すのではなく、**`variant` を廃止**（§6-4 で rail が消え、sheet はモバイルのパネル = これも消える） |
| `CalendarReviewPanel.tsx:140`                                                                                          | `isSheet ? 'max-h-[min(72dvh,560px)]' : 'min-h-0 flex-1'`     | ページ全体のスクロールに委ねる                                                                                  |
| `ReviewDiffPanel.tsx:161`                                                                                              | `isSheet ? 'max-h-96' : 'flex-1'`（384px 頭打ち）             | 同上                                                                                                            |
| `CalendarReviewPanel.tsx:101-104,114,160` / `ReviewDiffPanel.tsx:95,183-185` / `WeeklyReflectionPanel.tsx:214,290-295` | `truncate` を多用                                             | 幅が取れるので大半は不要。**残すのは本当に長くなりうる名前だけ**                                                |
| `CalendarReviewPanel.tsx:119-132` / `ReviewDiffPanel.tsx:94-114`                                                       | close ボタン                                                  | **削除**（ページには閉じるという概念が無い）                                                                    |
| `CalendarReviewRail.tsx:52`                                                                                            | `h-full flex-col`（親の高さに完全依存）                       | ページのスクロールに委ねる                                                                                      |

**タグ絞り込み `Select`（`CalendarReviewPanel.tsx:95-118`）の去就**: 狭さのために `Select` に押し込めていた。フルページかつ #2162 でセグメントが Sidebar に出る（§5-5）ので、**この `Select` は廃止して Sidebar 側へ寄せる**。`reviewTagId` は #2162 の語彙で名前が変わるため、最終名はレーン G の確定に従う。

### 6-6. 誤解を招く既存テスト名（ついでに直す）

`apps/product/src/lib/test/e2e/review-granularity.spec.ts` は**名前に反して粒度を検証していない**（実測）。中身は `/ja/week?date=…&panel=review` の deep link からパネルが復元されることの smoke test 1 件だけで、`test.skip` が 2 つ掛かっている（認証情報が無ければ丸ごと skip、モバイルも対象外）。

§4-6 で E2E を書き換える時に、**実態に合った名前へ改名する**（deep link の smoke test なので `deep-link.spec.ts` へ統合するのが素直）。名前と中身が乖離したテストは「粒度は検証済み」という誤った安心を与える。

### 6-7. このスライスの Reversibility

| 変更                                          | 判定        | 根拠                                                                   |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| 1 スクロール構成                              | `[minutes]` | レイアウトのみ                                                         |
| `/report?date=&range=` の凍結                 | `[hours]`   | 公開 URL 契約だが 307 redirect で行き先を変えられる（§4-5 と同じ性質） |
| `features/review/index.ts` の公開契約作り替え | `[minutes]` | repo 内の契約。外部に出ない                                            |
| `ReviewGranularity` 型の拡張                  | `[minutes]` | 純追加                                                                 |
| Pro 境界の線引き（§6-2）                      | `[hours]`   | 課金未有効化のため今は挙動に出ない。有効化後に変えると**顧客に見える** |

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
| モバイルの `/report` 入口      | #2161 が作ったヘッダーのトグル（付け替えるだけ。§5-7）                                             |

## 11. What I'm Not Doing

やらないことと理由。**書く行為そのものが scope creep の自己検出**（`plan-format.md`）。

- **`/report` をレポートビルダーにしない** — 期間指定の複雑なフィルタ、カスタム指標、保存フィルタの入れ子、グルーピングの自由化。§3-2 の歯止めの本体
- **`defaultView` へのルーティング追従を足さない** — 現行に無い新機能で、tRPC の往復が増え、値空間も合わない（§4-1）。別 issue へ
- **`emailRedirectTo` を変えない** — Supabase の Redirect URL allowlist に依存する本番専用の故障点。redirect 層に任せれば足りる（§4-6）
- **308 permanent へ上げない** — 写像が正しいと実測で確認した後の独立判断（§4-5）
- **`{L}/review` の redirect を復活させない** — 2026-06 に「ローンチ前のため互換 redirect は作らない」と判断済みの route（§4-4）
- **`BottomTabBar` を復活させない** — 2 度削除された資産で、クイック作成の固定フッターと画面下端を奪い合う（§5-7）
- **セグメントの並び替え・フォルダ分け・共有を作らない** — §3-2 の歯止めに直接触れる（§5-5）
- **「ついでに」データ層を触らない** — この project に migration も RPC 変更も無い。#2162 の波と混ぜない
- **`_shell/` と `features/review/` の作り替えをスライス 1 でやらない** — レーン F / G の writer 境界（§4-9）
- **`robots.txt` の刷新をこの project の外へ広げない** — `/calendar` `/report` の追加と、それに伴って死んでいる 2 行の除去まで。robots 全体の設計見直しは別問題
