---
status: done
last_verified: 2026-08-04
code:
  - apps/product/src/lib/keyboard/shortcut-registry.ts
  - apps/product/src/lib/keyboard/shortcut-catalog.ts
  - apps/product/src/components/ui/overlays/shortcut-cheat-sheet-dialog.tsx
  - apps/product/src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx
  - apps/product/src/lib/stores/useShellStore.ts
---

# shortcut-catalog-unification — キーボードショートカット一覧を app 全体のカタログへ統一する

キーボードショートカットの cheat sheet が、実際には calendar 機能の mount 状態に依存して不完全になる問題を解消する全体設計書。既存の registry を app 全体のカタログへ拡張し、どの feature からでもショートカットを宣言するだけで一覧に反映される器を作る。**大規模判定**（shell 層を横断する既存登録 25 箇所の移行、i18n namespace の新設、複数 feature にまたがる file 移動を含む）。実際にどのショートカットを新設・再配置するかは本 project の範囲外とする。

## 1. Goal

キーボードショートカットの cheat sheet を、今開いているページに関係なく app 全体のショートカットを常に一覧できる形にする。新しいショートカットは任意の feature から宣言するだけで一覧に反映される器を作る。どのショートカットを新設・変更するかは扱わない。

## 2. 背景と問題

- registry の実体は `apps/product/src/features/calendar/hooks/keyboard/shortcut-registry.ts` にある。JSDoc も「カレンダー機能の」ショートカットとして自称している
- しかし実際の global keydown listener は、`apps/product/src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx`（L66）が呼ぶ `useShortcutRegistry()` によって app 全体に対して 1 回だけ登録される。名前が指す範囲と実態がずれている
- cheat sheet を開く入口は 3 つあり、いずれも shell 側にある。`components/shell/sidebar/UserMenu.tsx`（L51）、`components/shell/sidebar/Sidebar.tsx` の `SidebarHelpMenu`、`Shift+?`（`useShortcutRegistry.ts` の Shift+? 登録内、L42 で `shortcutCheatSheet` を開く）
- 開閉状態は `lib/stores/useShellStore.ts`（L59）の `activeSheet: { type: 'shortcutCheatSheet' }` が持つ
- cheat sheet 本体の `features/calendar/components/ShortcutCheatSheetDialog.tsx` は `getRegisteredShortcutHelpItems()` を呼び、「今 mount されているショートカットだけ」を描画する
- calendar のショートカットは `(workspace)` route の component が mount している間だけ登録される。そのため、設定やタグのページで cheat sheet を開くと一覧が実質空になる（コード読みからの結論であり、実機では未確認）
- `Cmd+K`（ブロック検索、`useTimeblockSearchShortcut.ts`）は app 全体で登録されるが、help メタデータを持たないため一覧に出ない

## 3. Minimum Viable Approach（設計）

1. `shortcut-registry.ts` と `shortcut-key-label.ts` を `apps/product/src/lib/keyboard/` へ移す。新設ディレクトリだが、`lib/auth/` や `lib/date/` と同じ「feature 非依存の共通ロジックを lib/ に置く」慣習に沿う
2. カタログを registry から分離する。カタログは「存在するショートカット」の静的な宣言を持ち、cheat sheet はカタログを読む。`ShortcutHelpLabelKey`（18 件の閉じた union。全て `calendar.shortcuts.actions.*`）を撤廃し、任意の翻訳キーを受け付ける
3. i18n: dialog の title とグループ名の 5 件だけを新しい `shortcuts` namespace へ移す。action ラベル 18 件は calendar の操作なので `calendar` namespace に残す。`app/[locale]/(app)/layout.tsx` の `APP_NAMESPACES`（L32-45、12 要素の配列）に `shortcuts` を追加する。サーバー側は `lib/i18n/request.ts` の `discoverNamespaces` が自動検出するため追加登録は不要。dialog 内では chrome（title・group 名）用に `useTranslations('shortcuts')`、action ラベルのフルキー用に `useTranslations()` を分けて呼ぶ。理由と検出ゲートとの関係は §8 で扱う
4. `ShortcutCheatSheetDialog` を `apps/product/src/components/ui/overlays/` へ移す。`confirm-dialog.tsx` と同じ置き場になる。表示内容をカタログ全件表示に変える
5. 既存の登録 25 箇所をカタログ宣言へ移行する。ここで `Cmd+K` も一覧に載せる

## 4. 目標 UI

cheat sheet は縦 1 列のスクロールするリストにする。現在の `GROUP_COLUMNS` による 2 カラムグリッドは廃止する。

- ダイアログ上部に検索ボックスを置く（プレースホルダは「ショートカットを検索」）。入力でラベル・キーの両方を絞り込む。現時点の項目数は 18 件で、検索が効いてくるのは他 feature のショートカットを足した後になる。実装は静的カタログへのフィルタなので、不要と判断すれば安く外せる
- その下に見出し付きのセクションが縦に並び、ダイアログ内でスクロールする（セクションの構成は §5 で扱う）
- 各行は左に操作の説明、右にキーのバッジを置く。バッジは `formatShortcutKey` が返す記号表記をそのまま使う
- 1 つの操作に複数のキーがある場合はバッジを横に並べる。既存データ構造とそのまま噛み合う。`getRegisteredShortcutHelpItems` は `group:labelKey` で畳んで `keys` 配列を作るため、`Cmd+1` と `1`（ともに `dayView`）は 1 行 2 バッジになる

配置は `apps/product/src/components/ui/overlays/`（`confirm-dialog.tsx` / `destructive-form-dialog.tsx` と同じ置き場）にする。`packages/components` には置かない。同 package は `apps/product/src/features/*` を知ってはいけない制約があり、`useTranslations` の使用も 0 件の i18n 非依存 package であるため。

具体的な色・余白・角丸トークンは本書に書かない。実装時に `.claude/rules/design-system.md` のルールに従う。

## 5. グループ構造の選択肢（相談事項 → 採用: Option α）

cheat sheet 内でショートカットをどう並べるかは 3 案を比較した。

**Option α（採用）**: 既存 4 group（general / navigation / views / blocks）をそのまま section 見出しとして使う。scope（global / calendar）のための新しい見出し階層は作らない。現状の 4 group は実質 scope と一致している（`general` はどこでも使える、`navigation` / `views` / `blocks` はカレンダー画面）。この対応関係を、見出しを増やさずに次の 2 点だけへ使う。

- 並び順 — 今開いているページで有効な group を先に置く。calendar 画面なら navigation / views / blocks が先、設定・タグ画面なら general が先になる
- セクション単位の但し書き — 今開いているページで有効でない group は、見出し付近にどこで使えるかを示す短い説明を出し、淡色表示など視覚的に落とす（具体的なトークンは実装時に `.claude/rules/design-system.md` のルールに従う）

`scope` フィールドを持つだけで描画がそれを消費しない設計は採用しない。目的は「全部見える」「今ここでは効かない」「どこで効くか」の 3 つを 1 階層の見出しで成立させることにある。

`scope` は個々のショートカットではなく **group の属性**として持つ。section が group 単位で、並び順と但し書きも section 単位に効くため、entry ごとに持たせても消費されない。将来 1 つの group が複数 scope をまたぐ必要が出た時点で entry へ降ろす。

### 現在ページの scope をどう判定するか

**dialog 自身は判定しない。呼び出し側から prop で受け取る。**

判定には calendar の `isCalendarViewPath` が要るが、`components/ui/overlays/` へ移した dialog がこれを import すると `components/ → features/` の逆流になり、`.claude/rules/architecture.md` の依存方向（`features/ -> lib/` の一方向）に反する。

そこで判定は Composition Layer の責務とする。`GlobalOverlays.tsx` は既に `isCalendarViewPath` を import して Inspector の route guard に使っている（feature を跨いだ合成が許される層）。同じ値から現在の scope を求めて dialog へ渡す。これにより dialog は feature 非依存のまま、`components/` に置ける状態を保つ。

**Option β（却下）**: group を scope ベースに置き換える。既存 4 group は廃止する。

**Option γ（却下）**: 構造は変えず、非アクティブなショートカットを淡色表示するだけにする。

採用理由: 本 project の goal は「どこでも app 全体を見渡せる」ことにある。γ は一覧に載る範囲を広げるだけで、「今どこで効くか」を読者に示さない。β は既存 4 group が持つ calendar 内の整理（general / navigation / views / blocks の分類）を捨てることになるが、この分類自体は有効で捨てる理由がない。α は両方を、見出しを増やさずに維持できる。

## 6. なぜカタログを分離するか

registry からカタログを分離する動機は、抽象化を増やすことではなく重複を消すことにある。

- `dayView` の help メタデータが `apps/product/src/features/calendar/components/layout/Header/ViewSwitcher.tsx`（L129）と `apps/product/src/features/calendar/hooks/keyboard/useCalendarKeyboard.ts`（L88）の 2 箇所に、同じ `labelKey: 'calendar.shortcuts.actions.dayView'` として重複している。`Cmd+1` と `1` は同じ操作なのに、別々に登録されている
- registry は `group:labelKey` で登録を畳んでいるため、25 件の登録が cheat sheet 上では 18 件として表示される
- カタログへ寄せると、この重複が構造上消える。25 件の登録を 18 件に畳んで表示する代わりに、「そのショートカットは何か」を 1 箇所で宣言する形にする

## 7. 影響範囲

registry / key-label を import しているファイルは 13 件ある（production 7、test 5、story 1）。production の内訳。

- `apps/product/src/features/calendar/components/ShortcutCheatSheetDialog.tsx`
- `apps/product/src/features/calendar/components/layout/Header/ViewSwitcher.tsx`
- `apps/product/src/features/calendar/hooks/keyboard/` 配下の 5 ファイル（`useCalendarKeyboard.ts` / `useShortcutRegistry.ts` / `useTimeblockSearchShortcut.ts` / `useCalendarTimeblockKeyboard.ts` / `useWeekendToggleShortcut.ts`）

いずれも import path の更新（`lib/keyboard/` への移動）とカタログ宣言への書き換えの対象になる。

## 8. 検証と事故予防

i18n キーの移設は、消し漏れると `MISSING_MESSAGE` で本番のレンダリングを落とす。2026-04-22 にも同種の事故が起きている（`.claude/rules/architecture.md` の記載）。この project では次の 3 点で防ぐ。

1. dialog の chrome（title・group 名）は `useTranslations('shortcuts')` と namespace 付きで呼ぶ。`ShortcutCheatSheetDialog.tsx`（L47）は現状 `useTranslations()` を引数なしで呼んでおり、`scripts/check-i18n-integrity.ts`（L243）は `useTranslations('namespace')` という引数ありの呼び出ししか正規表現で拾えない。引数なしのままだと、`shortcuts` namespace を `APP_NAMESPACES` に登録し忘れても `pnpm lint:i18n` はそれを検出できない。namespace 付きで呼べば、この静的チェックの対象に乗る。action ラベルは `calendar` namespace のフルキー（`calendar.shortcuts.actions.*`）のままなので、こちらは引数なしの `useTranslations()` で引く
2. 既存の `apps/product/src/features/calendar/components/__tests__/ShortcutCheatSheetDialog.test.tsx` に、実 messages で描画して `MISSING_MESSAGE` が出ないことを assert する回帰テストを足す。静的チェックの穴（bare call の見落とし等）を実行時テストで二重に防ぐ
3. `APP_NAMESPACES`（`apps/product/src/app/[locale]/(app)/layout.tsx`、L32-45）への `shortcuts` 追加を実装手順として明記する。1 の namespace 付き呼び出しだけでは、ここへの追加を忘れるとメッセージが client bundle に乗らず、実行時に空表示または `MISSING_MESSAGE` になる

加えて、`handleGlobalKeyDown` は module-level の安定した参照なので `addEventListener` は呼び直しても冪等。ファイル移動や登録経路の変更で二重登録が起きる回帰リスクは低い。

## 9. Reversibility Table

| 変更                                                           | タグ      | 備考                                                                                                        |
| -------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| registry / key-label を `lib/keyboard/` へ移動                 | [minutes] | import path の一括更新を含む、純粋な file move。git revert で戻せる                                         |
| カタログを新設し `ShortcutHelpLabelKey` union を撤廃           | [minutes] | 型定義とファイル追加のみ。DB / API に影響しない                                                             |
| i18n: title / group 5 件を `shortcuts` namespace へ移動        | [minutes] | JSON と `APP_NAMESPACES` 配列の変更のみ。移設漏れの検知は §8 の namespace 付き呼び出し + 回帰テストに委ねる |
| `ShortcutCheatSheetDialog` を `components/ui/overlays/` へ移動 | [minutes] | component 移動 + import 更新                                                                                |
| 2 カラムグリッドを検索ボックス付き 1 カラムリストへ変更        | [minutes] | 同一 component 内の表示ロジック変更のみ。DB / API に影響しない                                              |
| 既存登録 25 箇所をカタログ宣言へ移行                           | [minutes] | 呼び出し側の書き換えのみ。1 箇所ずつ切り戻せる                                                              |

`[irreversible]` は本 project にゼロ。公開 URL、外部契約、データ移行のいずれも発生しない。

## 10. Existing Code to Reuse

- `apps/product/src/components/ui/overlays/confirm-dialog.tsx` — 移動先の置き場の前例
- `apps/product/src/lib/i18n/request.ts` の `discoverNamespaces` — namespace 自動検出。サーバー側の新規登録が不要な根拠
- `apps/product/src/features/calendar/hooks/keyboard/shortcut-registry.ts` の keydown 実行ロジック（`handleGlobalKeyDown` とディスパッチ）— カタログは「何が存在するか」の宣言だけを持ち、実際のキー処理は既存の registry 実行系をそのまま使う
- `apps/product/src/features/calendar/components/__tests__/ShortcutCheatSheetDialog.test.tsx` — 既存のテストに回帰 assertion を足す土台
- `apps/product/src/app/[locale]/(app)/_overlays/GlobalOverlays.tsx` の `isCalendarViewPath` 判定 — Inspector の route guard で既に使っている。同じ値から現在の scope を求めて dialog へ渡す（§5）

## 11. What I'm Not Doing（やらないこと）

- 新しいショートカットの割り当て（設定・タグ画面に何を割り当てるか）。scope 外
- tags の `useSubmitShortcut`（Cmd+Enter、registry を通らない独自実装）の移行。器ができた後の作業
- 未使用の `lib/hooks/useDialogKeyboard.ts` の掃除。別 issue
- registry の機能追加（chord、連続キー入力等）
