---
status: frozen
date: 2026-08-20
---

# User フィードバック: dogfooding 第 2 弾（ショートカットダイアログ・Sidebar タブ・カレンダー 2 列固定）

PR #2243 merge 後の実機 dogfooding で 3 件。原文のまま記録する。

---

## 原文

> まずキーボードショートカットの作りは直ってない。クリックしてもすぐ消えちゃう。

> Sidebarのタブも作りが違う。2列なのはいいけど、ちゃんとタブになってないとだめかな。claudeのSidebarと同じ仕様ってこと。

> タブ部分だけど、右側の幅をもう少し広く取っていいかな。なんか狭い気がする。左右同じ余白でいい。

> uiフィードバックの方に追加で、見出しのところのテキストとarrowのところ、ここは両方がホバーで囲われてほしい。arrowだけじゃなくて

> あとカレンダーが未だに二列になってる。うまく調整して。

## 文脈

2026-08-20、指揮台への口頭フィードバックとして受領。

- **ショートカットダイアログ**: #2153 で入れた `setTimeout(0)` 遅延（UserMenu.tsx の onSelect）が実機の Radix 競合を解消しておらず、クリック直後にダイアログが閉じる挙動が再発。#2243 のクロスレビューで「test がこの race を再現しておらず回帰を検出できない」と P3 指摘済みだった
- **Sidebar タブ**: #2233-1 で segmented control 化した WorkspaceTabs（カレンダー / レポート の 2 つ並び）が「タブらしくない」という指摘。Claude（claude.ai / desktop）の Sidebar タブと同じ仕様が要望。追加で、タブ領域の右側の幅が狭く左右均等の余白が欲しいという指摘、および見出し（SidebarSection を想定）のテキストと展開 arrow を 1 つの hover 領域として囲ってほしい（現状は arrow のみが hover 対象。#2233-5 の hover 分離の調整）という指摘が届いた
- **カレンダー 2 列固定**: Plan/Record レーンの常時 2 列固定分割について、open 討議 #2160 で「調整する」方向は確定済みだが具体的な目標形は未確定だったところに再度の指摘

## 解釈

- ショートカット: setTimeout 遅延ではなく Radix の `onCloseAutoFocus` 制御へ切り替える必要がある。今回は race を固定する test も必須
- Sidebar タブ: 実装前に Claude Sidebar の仕様を観察・要件化し、User 確認を経てから作り直す。右幅を広げ左右均等余白にする。見出しのテキスト+arrow を単一 hover 領域にする（対象が Sidebar の見出しで合っているかは観察・要件化で確認する）
- カレンダー 2 列固定: 設計オプションを複数提示し、User 確認を経てから実装する（実装前の確認が必須）

## 対応

- [#2248](https://github.com/Dayopt/dayopt/issues/2248) — ショートカットダイアログの再修正（`onCloseAutoFocus` への切替 + race 固定 test）
- [#2249](https://github.com/Dayopt/dayopt/issues/2249) — WorkspaceTabs を Claude Sidebar 仕様へ作り直し（右幅拡大・左右均等余白を含む）
- [#2250](https://github.com/Dayopt/dayopt/issues/2250) — Plan/Record 常時 2 列固定分割の見直し（設計オプション提示 → User 確認 → 実装）
- 3 issue を束ねて 1 branch・1 PR（レーン F、`claude/ui-feedback-round2-2250`）で対応
