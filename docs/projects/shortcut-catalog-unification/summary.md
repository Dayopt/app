---
status: current
last_verified: 2026-08-04
code:
  - apps/product/src/lib/keyboard/shortcut-catalog.ts
  - apps/product/src/lib/keyboard/global-shortcut-catalog.ts
  - apps/product/src/features/calendar/keyboard/calendar-shortcut-catalog.ts
  - apps/product/src/components/ui/overlays/shortcut-cheat-sheet-dialog.tsx
  - apps/product/src/app/[locale]/(app)/_overlays/app-shortcut-catalog.ts
---

# shortcut-catalog-unification — 完了サマリー

キーボードショートカットの一覧を、calendar の mount 状態に依存する仕組みから app 全体のカタログへ移した。設計と選択肢の比較は [overview.md](./overview.md) を参照。

## 達成したこと

**registry とカタログを分離した。** registry は「キーとハンドラの結び付け」だけを持ち、カタログが「何が存在するか」を宣言する。以前は registry が両方を兼ねていたため、一覧に出せるのは今 mount されているショートカットだけだった。設定やタグの画面で一覧を開くと、自分自身を指す 1 行しか並ばない状態になっていた。

**どの feature からでも宣言できる器になった。** `lib/keyboard/shortcut-catalog.ts` が型と合成関数を持ち、feature 側が自分のカタログを宣言する。合成は Composition Layer（`app/[locale]/(app)/_overlays/app-shortcut-catalog.ts`）が行う。`lib/` は `features/` を import できないため、合成点をここに置くことで依存方向を保っている。

**一覧が「どこで効くか」を示すようになった。** group が `scope` を持ち、現在ページの group を先に並べ、他ページ専用の group には使える場所の但し書きを付けて淡色にする。現在ページの判定は dialog ではなく Composition Layer が行い、prop で渡す。dialog を `components/ui/overlays/` へ移した以上、そこから feature を参照すると逆流になるため。

**UI を検索付きの縦 1 列スクロールへ作り替えた。** 操作とキーの対応は `<dl>` / `<dt>` / `<dd>`、キーは `<kbd>` で表す。押して実行できない参照情報なので、cmdk の listbox 意味論（`CommandItem` 等）は採らなかった。1 操作に複数キーがある場合はバッジを横に並べる。

**表に出ていなかった `Cmd+K`（ブロック検索）を載せた。** app 全体で登録されているのに help メタデータが無く、一覧に一度も現れていなかった。

## 数字

- 登録 25 箇所から help メタデータを撤去し、19 件のカタログ宣言に集約した（重複していた `Cmd+1` と `1` などは 1 宣言・複数キーにまとまる）
- registry から 4 つの型と `getRegisteredShortcutHelpItems()` を削除した
- i18n は dialog の chrome 5 件だけを新 `shortcuts` namespace へ移し、action ラベル 19 件は calendar に残した

## 判断の記録

**i18n の移設範囲を絞った。** 当初は `calendar.shortcuts.*` を丸ごと移す想定だったが、action ラベルは実際に calendar の操作なので calendar namespace に残した。移設対象が 23 キーから 5 キーに減り、`MISSING_MESSAGE` 事故の面積が小さくなった。

**dialog の chrome を `useTranslations('shortcuts')` で引く形にした。** `scripts/check-i18n-integrity.ts` は引数付きの呼び出ししか正規表現で拾わない。引数なしのままだと `APP_NAMESPACES` への登録漏れを静的検査で検出できず、当初 plan の「grep ゲートで防ぐ」は成立しなかった。

**用済みになった `WEEKEND_TOGGLE_SHORTCUT_HELP` を除去した。** 本番から参照されておらず、ハードコードされた英語の表示情報を持っていた。test も定数が自分のリテラル値と等しいことを確認するだけで、挙動を検証していなかった。カタログが i18n 付きで置き換えた対象そのものなので、移行の完遂として消した。

## やらなかったこと

- 設定・タグ画面への新しいショートカットの割り当て。器を作るまでが本 project の範囲
- tags の `useSubmitShortcut`（Cmd+Enter）の registry 移行。registry を通らない独自実装のまま残っている
- 未使用の `lib/hooks/useDialogKeyboard.ts` の掃除
