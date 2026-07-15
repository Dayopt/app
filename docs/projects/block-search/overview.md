---
status: active
last_verified: 2026-07-15
code:
  - apps/product/src/components/shell/sidebar
  - apps/product/src/features/calendar
  - apps/product/src/features/timeblock
  - apps/product/src/lib/stores/useShellStore.ts
---

# block-search — 過去のブロックを確認・再利用する

Calendarを主役のまま保ち、必要なときだけ全期間のPlan / Recordを探して開くか、既存の貼り付け操作へ渡せる小さな検索導線を追加する。

## Goal

- 覚えているタイトル・メモ・tag名から、削除されていないPlan / Recordへ到達できる
- 検索結果から内容確認または複製用のコピーを選べる
- 低頻度機能としてdesktop / mobile双方の通常操作を圧迫しない

## Minimum Viable Approach

1. 既存のPlan / Record list検索をtag名にも拡張し、空欄では取得せず、全期間から開始日時の新しい順に20件を表示する
2. shellの非永続overlayとしてresponsiveな検索dialogを置き、Sidebar、展開したmobile mini calendar、`Cmd/Ctrl+K`から同じ操作で開く
3. 結果の選択は対象日のCalendarとInspectorを開き、別のコピー操作は現在日を維持して既存clipboardへ内容だけを渡す
4. 日本語・英語、keyboard / IME、loading / empty / error / retry、mobile touch targetを既存patternに揃える
5. service、pure logic、component、Storybook、E2Eで検索・移動・コピーの契約を検証する

## Acceptance Criteria

- タイトル・メモ・tag名の部分一致でPlan / Recordを検索でき、skip済みPlanを含み、削除済みデータと別ユーザーのデータを返さない
- 結果はPlan / Recordの別と日時を示し、内部IDを表示しない
- desktop trigger、mobile trigger、`Cmd/Ctrl+K`が同じdialogを開き、入力・IME・他overlayの操作と競合しない
- 結果を開くと対象日とInspectorへ移動し、コピーでは現在日を変えない
- コピー内容に`id`と`plan_id`を含めず、貼り付け時の既存保存先ルールを変えない
- 空欄、loading、0件、20件超、片方の取得失敗を含む状態が定義され、検索語を履歴・log・analyticsへ保存しない
- focused test、Storybook AllPatterns、i18n / copy check、repo必須check、`pnpm docs:check`が通る

## Reversibility Table

| 変更                | 永続data / APIへの影響           | 戻し方                           |
| ------------------- | -------------------------------- | -------------------------------- |
| triggerと検索dialog | なし                             | shell variantとUI wiringをrevert |
| list検索のtag名対応 | request / response shape変更なし | 検索条件をタイトル・メモへ戻す   |
| clipboard変換の共有 | なし                             | 呼び出し元へ戻す                 |

## Existing Code to Reuse

- `CommandDialog`、`useShellStore.activeSheet`、`GlobalOverlays`
- `plans.list`、`records.list`の認証・検索・soft delete契約
- Calendar navigationとInspectorのURL契約
- `useTimeblockClipboardStore`と既存のtimezone / date formatter

## What I'm Not Doing

- 独立した検索page、新しいtop-level feature、Provider、依存関係、DB migration
- command、task、設定、自然言語を含む全体検索
- 検索履歴、保存検索、詳細filter、pagination
- 検索結果からの即時作成、Plan / Record間の関係作成

## Related Documents

- [フィードバックと決定](../../product/log/2026-07-15-feedback-block-search.md)
- [Calendar仕様](../../product/specs/calendar.md)
- [Plan / Record仕様](../../product/specs/plan-record.md)
