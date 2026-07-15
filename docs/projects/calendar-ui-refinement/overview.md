---
status: active
last_verified: 2026-07-15
code:
  - apps/product/src/app/[locale]/(app)/(workspace)/_composition
  - apps/product/src/app/[locale]/(app)/_shell
  - apps/product/src/features/calendar
  - apps/product/src/features/review
  - apps/product/src/lib/stores/useShellStore.ts
---

# Calendar UI refinement

既存の静かな視覚言語と Plan / Record の二層構造を保ちながら、Calendar shell の幅協調、複数日表示の可読性、右 panel の情報階層を整え、公開中の成熟した productivity service と並べても粗さが目立たない状態にする。

## Goal

- Sidebar、Calendar、右 panel が互いの利用可能幅を尊重し、panel を開いてもユーザーの永続設定を勝手に変えない
- day / week / multi-day のどの表示でも Plan と Record の意味とタイトルを読み取れる
- 256px の標準 rail 幅で Review の主要数値と section hierarchy が無理なく走査できる
- Review / Diff panel の開閉で Calendar view を変えず、Calendar を期間と navigation の正本にする
- spacing、color、radius の追加ルールを増やさず、既存 semantic token と component pattern で改善する

## Current assessment

### 維持する強み

- surface、border、tag color、dark mode の色関係は抑制が効いており、基礎は既に高水準
- Plan を outline、Record を filled surface とする区別は、説明なしでも関係を推測しやすい
- typography、corner radius、shadow、direct manipulation は全体として一貫している
- Review を独立画面ではなく Calendar の contextual rail に置く情報設計は妥当

### 完成度を下げている箇所

1. week / multi-day だけ Plan lane が 20% まで縮み、短い title が一文字単位で省略される
2. right rail の inline / sheet 判定が rail 自身の resize 幅を見ず、空間回復のために Sidebar の永続 open 状態を書き換える
3. Review の summary が狭い rail 内で三つの bordered card に分かれ、label truncation と border の重なりが起きる
4. Review を開くと desktop では week へ強制遷移し、Calendar view を正本とする現行仕様とずれる
5. 12/24時間設定、keyboard interaction、内部 grid 線、tag 行の状態表現、Diff 色に局所的な不整合が残る

## Minimum Viable Approach

1. right rail を表示する際は、rail を差し引いた Calendar の残幅で inline / sheet を決める
2. Sidebar があれば一時的に畳んで空間を回復するが、ユーザーの `sidebar.open` preference は保持し、rail を閉じたら自動復帰する
3. Plan lane は全 Calendar view で既存の 38% contract を共有し、5-day / week では補助情報と余白を減らして title を優先する
4. Review summary は card の集合ではなく、ひとつの静かな data list にして label と値の対応を優先する
5. Storybook は実運用の 256px rail 幅を標準 fixture にし、狭幅状態を回帰確認できるようにする
6. Review / tag detail の panel navigation は現在の Calendar view を保ち、集計もその表示範囲と直前の同日数を使う
7. 時刻表示、keyboard event の所有範囲、内部線、Diff の色を既存設定と semantic token に揃える

## Acceptance Criteria

- 右 rail を開閉しても persisted `sidebar.open` は変化しない
- rail resize 後も Calendar の残幅が 768px 未満なら sheet または一時的な Sidebar 抑制へ切り替わる
- inline rail の resize 上限は、Sidebar 抑制後も Calendar 768px を維持できる幅までに制限され、幅を戻せない sheet 状態を作らない
- day / week / multi-day が同じ 38:62 の Plan / Record lane contract を使う
- 5-day / week の狭い block は title を先に残し、差分 badge や時刻 detail は広い view だけで表示する
- 256px rail の Review summary で主要 label が三分割 card によって不必要に省略されない
- day / week / multi-day で Review を開いても view route が維持される
- 週末非表示の week / multi-day でも、Calendar header・entry query・Review query が実際の先頭列から末尾列までを同じ期間として扱う
- Review の RPC input が Calendar の表示範囲と、その直前の同日数を使う
- Calendar の時間軸、選択 preview、Plan / Record card、drag 表示、Diff panel がユーザーの12/24時間設定に従う
- Calendar の scroll key は focus 中の grid だけが処理し、入力、IME、menu / dialog の操作を global shortcut が奪わない
- hour grid と day divider は重複せず、内部線には `border-border-subtle` を使う
- 非表示 tag は disabled に見せず、keyboard focus 時にも行 action が見える
- Calendar / Review の Diff panel は符号と方向を保ち、増減を success / destructive 色で判定しない
- 関連 unit test、Storybook AllPatterns、`pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries`、`pnpm docs:check` が通る

## Delivery

1. **Shell coordination** — transient Sidebar suppression と rail-aware breakpoint を実装する
2. **Calendar density** — two-lane width contract と view 別の card density を統一し、test と Storybook state を更新する
3. **Review hierarchy** — 256px rail 向け summary hierarchy と Storybook fixture を更新する
4. **Navigation trust** — Review / tag detail で Calendar view と query range を一致させる
5. **Verification** — focused test、Storybook taxonomy、repo 必須 check を実行する
6. **Final polish** — 12/24時間表示、keyboard event 境界、grid / tag density、neutral Diff を既存 contract に揃える

## Reversibility Table

| 変更                          | 永続 data / API への影響             | 戻し方                                    |
| ----------------------------- | ------------------------------------ | ----------------------------------------- |
| transient Sidebar suppression | なし。persist 対象外                 | store field と shell wiring を revert     |
| rail breakpoint               | なし。client layout のみ             | helper と threshold を revert             |
| lane width                    | なし。表示と pointer boundary のみ   | shared constant の利用を revert           |
| Review summary hierarchy      | なし。DOM / style のみ               | component と Story を revert              |
| panel navigation              | なし。既存 URL contract 内           | navigation callback を revert             |
| final polish                  | なし。表示と client interaction のみ | formatter / class / event guard を revert |

## Existing Code to Reuse

- `CalendarLayout` の `ResizeObserver`、resizable rail、`AnimatedWidthPanel`
- `useShellStore` の persisted Sidebar preference と generated selector
- `two-lane-layout.ts` の既定 38% contract と pointer boundary calculation
- `CalendarNavigationContext` の URL 同期と panel normalization
- Review の既存 formatter、semantic token、`AllPatterns` Story
- `useUserPreferences` の `timeFormat` と `formatTimeString`
- keyboard shortcut registry の中央 guard
- `border-border-subtle` と既存の focus-visible ring pattern

## What I'm Not Doing

- brand、font family、tag palette、全 component の全面 redesign
- 新しい spacing scale、radius、shadow、direct color の追加
- Review を独立 page に戻すこと、Toggl 型の分析 dashboard を増やすこと
- metric の意味、database schema、tRPC response、Plan / Record model の変更
- Inspector の12時間入力。保存契約が `HH:mm` のため、AM / PM parse と period control を別途設計する
- keyboard resize と階層 tag reorder。分単位 ARIA と collision contract を含めて別 scope で統一する
- browser / OS 標準 shortcut と競合する key mapping の再設計
- Storybook のみで使われる旧 chart / legacy component の一括整理

## Reference principles

- Linear: primary action 以外を視覚的に後退させ、separator を減らして階層を作る
- Google Calendar: density を利用環境に合わせ、Calendar の作業面積を守る
- Notion: Sidebar は折り畳み・resize 可能な user-controlled navigation として扱う
- Toggl Track: 短い Calendar block では詳細を省き、時間状態を視覚 grammar で区別する
