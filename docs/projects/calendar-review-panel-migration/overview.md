# calendar-review-panel-migration: Calendar 内 Review Panel 移行設計

> **策定日**: 2026-06-22
> **ステータス**: 実装中
> **スコープ**: `/review` 独立ページの廃止、Calendar panel への Review / 差分 / analytics 統合、Sidebar / mobile navigation の単一化
> **前提**: ローンチ前のため `/review` 互換 redirect は作らない

## 1. Context

Dayopt の主体験は Calendar 上で予定を置き、記録し、予定と実績の差分を見て次の計画へ戻すことにある。Review を独立ページに置くと、ユーザーは作業面から離れて「分析ページ」へ移動することになる。これは Google Calendar / Toggl と同等の装飾のない基本体験、かつ「寡黙な研究者」のトーンには重い。

本 project では Review を独立目的地ではなく、Calendar の contextual panel として扱う。Desktop は右 panel、mobile は bottom sheet に統一し、Calendar を見ている状態のまま Review / 差分 / analytics を確認できるようにする。

## 2. Target URL / State

Calendar の search params を正規状態とする。panel は単一 slot で、同時に開けるのは 1 種類だけ。

| 用途        | 正規 URL                                                            |
| ----------- | ------------------------------------------------------------------- |
| 週次 Review | `/ja/calendar/week?date=YYYY-MM-DD&panel=review`                    |
| タグ Review | `/ja/calendar/week?date=YYYY-MM-DD&panel=review&reviewTagId=TAG_ID` |
| 日次差分    | `/ja/calendar/day?date=YYYY-MM-DD&panel=diff`                       |
| Analytics   | `/ja/calendar/{view}?date=YYYY-MM-DD&panel=analytics`               |

実装ルール:

- `CalendarPanelKind = 'review' | 'diff' | 'analytics' | null` を導入する。
- 既存の `compare=1` は廃止する。
- `reviewTagId` は Calendar tag filter と混ぜない。Review panel 内の選択状態として扱う。
- `panel=diff` は day view でのみ有効。day 以外では panel を閉じる。
- URL と state を同期し、戻る/進む/リロードで復元する。

## 3. Shell / Navigation

表示画面は Calendar 1 つになるため、Sidebar と mobile navigation も Calendar 基準に統一する。

### Desktop Sidebar

- `CalendarSidebar` / `ReviewSidebar` の mode 分岐を削除する。
- `SidebarContent` が MiniCalendar、ViewSwitcherList、CalendarFilterList、SidebarUtilities を直接描画する。
- `SidebarPageNav` / `PageNav` / `Sidebar` の `pageNav` slot を削除する。
- コードコメントや Storybook docs から「Calendar 用 Sidebar / Review 用 Sidebar」という表現を消す。

### Mobile

- BottomTabBar は Calendar / Account の 2 タブにする。
- Review タブは削除する。
- `ReviewTagChipRow` は削除する。
- Calendar の `TagChipRow` は entry create 用に一本化する。
- Review は Calendar header の panel action から開く。

## 4. Review Panel

`features/review` は削除しない。集計ロジック、domain、hooks、Time P/L derivation は残し、full page 前提の shell だけを外す。

Panel v1 の構成:

1. Review header: 週次対象期間、close action、必要なら tag selector
2. Overall summary: 記録時間、計画達成率、トップタグ
3. Time P/L compact: planned / actual / diff とタグ別差分
4. Tag detail compact: `reviewTagId` がある場合に選択タグの要約を表示

full page 専用の `ReviewLayout`、`/review` route、`/review/tags/[tagId]` route は削除する。

## 5. Step Plan

| Step | 内容                                        | 主な検証                                                |
| ---- | ------------------------------------------- | ------------------------------------------------------- |
| 1    | docs 追加                                   | review                                                  |
| 2    | Sidebar / BottomTab / PageNav cleanup       | typecheck、shell tests                                  |
| 3    | Calendar panel URL state 導入               | navigation context tests                                |
| 4    | diff / analytics を panel slot に統合       | calendar tests                                          |
| 5    | Review panel を Calendar composition に接続 | review panel tests                                      |
| 6    | `/review` route と古い導線を削除            | rg `/review`、typecheck                                 |
| 7    | i18n / Storybook / docs 更新                | lint:i18n、Storybook story tests                        |
| 8    | 全体検証                                    | typecheck、lint、lint:boundaries、build、targeted tests |

## 6. Not Doing

- `/review` 互換 redirect は作らない。
- DB / Supabase migration は行わない。
- 新しい top-level feature は作らない。
- Review 集計ロジックは作り直さない。
- Calendar hub の分解はこの project に混ぜない。
- 将来の Pro 境界や高度 analytics 再設計は扱わない。
