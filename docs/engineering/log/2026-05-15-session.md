date: 2026-05-15
commits: 16
areas: [calendar, entry, i18n, design-system]

decisions:

- 重複検出の visual を全面 destructive（`bg-destructive-tint` + `text-destructive`）に統一。赤リング (`ring-destructive ring-2`) は廃止。視認性を優先
- Modality-matched feedback を採用: 継続操作 (drag/resize) = 視覚 in-place、フォーム = inline alert + submit disabled、離散 (click/drop) = toast。NN/g / Material 3 / Apple HIG 共通の原則
- 重複時の文言を `entry.errors.timeOverlap` 1 キーに集約（ja: 「この時間帯には既に予定があります」 / en: 「This time slot is already taken」）
- 過去時間帯の preview は破線枠（unplanned 風）に切替。サーバー側 `normalizeCreateInput` が `end_time <= now` で auto-unplanned するのに preview を一致させる
- クライアント側 overlap 事前判定で `willBeUnplanned = (end_time <= now)` を見て planned / actual を切替。サーバーと同じロジックを使い planned×planned 誤検知を撲滅
- Inspector の時刻 onChange→save race を同期再評価で解消（`timeConflictError` state は 1 tick 遅れるため、save 直前で `hasTwoLayerTimeConflict` を再評価）

conventions:

- 重複検出の canonical visual: `bg-destructive-tint` + `text-destructive` + (continuous な場合) cursor not-allowed。`ring-destructive ring-2` はもう使わない
- 同じエラー概念は 1 i18n キーで表す。複数 namespace（entry / record / calendar など）への重複は historical accident として扱い、見つけ次第統合
- 新規 entry の overlap 判定はサーバーの origin 判定（`end_time <= now → unplanned`）と一致させる。client/server で異なるロジックを書かない
- DnD ghost / draft block / palette block / preview など preview 系コンポーネントは render に `Date.now()` を含むため、`react-hooks/purity` を eslint-disable で許容（transient で observable side effect なし）。useMemo の外で計算して deps に追加する
- 重複時の文言は generic で十分。「どの予定と重なるか」を具体化する enrichment は将来検討（重なる相手は視覚的に見えている）
- React の prettier + eslint --fix は未使用 import を自動削除する。「import を追加 → 後の Edit で使う」は import が消えるため、同一 Edit 内で import + usage を入れる

breaking:

- 削除した i18n キー: `entry.toast.timeOverlap` / `entry.inspector.toast.timeOverlap` / `entry.inspector.recordCreate.timeOverlap` / `record.inspector.toast.timeOverlap` / `calendar.toast.conflictDescription` / `calendar.toast.conflict` / `entry.inspector.timeConflict`
- GhostRenderer の overlap visual: `ring-destructive ring-2` → `ConflictGhost`（`bg-destructive-tint` + `text-destructive` + 文言 + 時間ラベル）に置換
- DragSelectionPreview の overlap visual: `bg-destructive` + Ban icon → `bg-destructive-tint` + `text-destructive` に置換、Ban icon 除去
- DragSelectionPreview に必須 prop `date: Date` を追加（past 判定用）。CalendarDragSelection から渡す

learned:

- NN/g / Material Design 3 / Apple HIG は共通して「feedback channel matched to interaction modality」を推奨。「全 channel を toast に統一」は anti-pattern。フォームエラーを toast で出すのも NN/g が "Form Error Anti-pattern" として批判
- Google Calendar / Apple Calendar / Outlook（個人） は overlap を許容する（hard-block しない）。Resource booking 系（Outlook 会議室 / Calendly / Acuity）が hard-block の比較対象
- prettier + eslint --fix は未使用 import を自動削除する。複数 Edit に分けて import を先に追加すると、次の Edit までに消える
- react-hooks/purity ルールは render 時の `Date.now()` を禁止。useMemo 内では使えない。useMemo の外で `const now = Date.now()` を eslint-disable で計算し、deps に追加する
- サーバー側の create 時 origin 判定は `selectedRange.end <= Date.now() → 'unplanned'` (`entry-service.ts:511`)。client 側の overlap 事前判定もこれに合わせないと planned×planned で誤検知

tried_and_failed:

- 重複 visual の最初の case「全 channel を toast に統一」案: NN/g の "Form Error Anti-pattern" 違反で却下
- 「赤リング `ring-destructive ring-2`」を全 channel に採用したが視認性が低く user fb 後に全面 destructive 化に refactor。最初から全面差し替えにすべきだった
- TagEntryCreatePopover で当初「server fallback toast」だけにした → user から「ドラッグ時と同じ重複にして」と要望 → modality 別 inline alert + submit disabled に変更
- 当初の plan で「GAFA デファクト」と framing したが、Calendar 系の GAFA は overlap を hard-block しないので比較対象として不適切。Resource booking 系の方が近い → plan の root rationale を「modality-matched feedback」に書き直し
- `Date.now()` を useMemo 内で呼んで react-hooks/purity 違反。eslint-disable + useMemo 外計算 + deps 追加に修正

files_of_note:

- src/features/calendar/interaction/GhostRenderer.tsx # ConflictGhost 内蔵、cursor not-allowed の body 切替、opacity-85 を重複時のみ外す
- src/features/calendar/components/views/shared/components/DraftEntryBlock.tsx # tag tap draft の destructive / past unplanned visual
- src/features/calendar/components/views/shared/components/InlineTagPalette/InlineTagPalette.tsx # drag-create 後の palette、事前 overlap 判定、past unplanned
- src/features/calendar/components/views/shared/components/CalendarDragSelection/DragSelectionPreview.tsx # drag-create 中の preview、past unplanned 含む
- src/features/calendar/components/tag-filter/components/TagEntryCreatePopover/TagEntryCreatePopover.tsx # form 型 overlap UI（inline alert + submit disabled）
- src/features/entry/components/inspector/hooks/useTimeFields.ts # save race fix + checkConflict callback、planned/actual すべて同期判定
- .claude/rules/design-system.md # 重複検出 canonical を全面 destructive に書き換え
- ~/.claude/plans/ui-tranquil-hellman.md # plan file（first-principles 根拠を含む）

next:

- [ ] 重複 UI の Storybook story 整備（ConflictGhost / past preview の各バリアントを Foundations 配下に）
- [ ] `entry.errors.timeOverlap` の i18n を refine（研究者ペルソナ目線でより柔らかい文言の検討）
- [ ] checkConflict 内の `queryClient.getQueriesData + isEntriesListQuery + 集約` パターンを util として切り出し（4 箇所で重複している）
- [ ] DragSelectionPreview / DraftEntryBlock / InlineTagPalette の Storybook を past variant 含めて更新
- [ ] design-system.md / copywriting.md に「modality-matched feedback」原則を Section として明文化
