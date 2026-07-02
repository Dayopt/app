# I-03: characterization tests + データモデル小確認（2026-06-12）

> **目的**: Phase 4（server-state store の TanStack Query 移行）の前に、`UserSettingsInitializer` の gate semantics と `useUserSettings` の公開挙動を「現挙動として」固定する。store 実装に依存しない契約テストなので移行後も回帰検知になる。
> **対象**: `apps/product/src/features/settings/components/UserSettingsInitializer.tsx` / `apps/product/src/features/settings/hooks/useUserSettings.ts`

## 追加したテスト

| ファイル                                      | 件数 | 固定する契約                                                                                                                                                         |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/UserSettingsInitializer.test.tsx` | 7    | gate semantics（hydrated→children / loading→null / error→alert / paused→status）+ 優先順位 + data integrity（hydration 前は children を mount しない）               |
| `hooks/useUserSettings.test.ts`               | 12   | 返り値 key 契約 / query state→flag 写像（hydrated/isPaused/error）/ apply 発火条件（isPending 中・null 時は dispatchUserSettings 非発火）/ saveSettings の楽観的更新 |

合計 19 件。store の内部状態（Zustand）ではなく **「query state → 返り値 → render の写像」** を検証しているため、Phase 4 で store を TanStack Query に置換しても同じ assertion が成立すべき（成立しなければ挙動変化＝要注意）。

### 固定した data integrity 不変条件（最重要）

`UserSettingsInitializer` のコメントに明記された境界:

> `dbSettings` が確定するまで children を render しない。timezone / weekStartsOn 等が defaults（browser timezone）のまま timezone 依存 mutation が動くと UTC 変換がズレ、誤ったタイムスタンプで server に書き込まれる data integrity 問題になる。

テストでの固定:

- component 側: hydration 完了まで children（timezone 依存 mutation を含む）が mount されない（`childMountSpy` で検証）
- hook 側: `isPending` 中および `data=null`（新規ユーザー）では `dispatchUserSettings`（timezone 込み apply）が発火しない

**Phase 4 の移行（I-13/I-14）はこの 2 テストが green のままであることを必須ゲートにする。**

## データモデル小確認（メモのみ・変更しない）

### ④ `entries.duration_minutes` の整合性不変条件の所在

- **DB 側に enforce は無い**: generated column でも trigger でも check 制約でもない。単なる stored value（migration で確認）。集計関数内では `COALESCE(duration_minutes, 0)` で null 許容に扱われる。
- **domain でソフトに fallback**: `features/entry/domain/entry-time-model.ts:41-47` の `getPlannedDurationMinutes` が「`duration_minutes` が保存済みなら優先、なければ planned range（`start_time`/`end_time` の差）から算出」。つまり **planned duration の denormalized cache であり、null なら range から再計算**。
- **actual は別**: actual 所要時間は常に `actual_start_time`/`actual_end_time` から算出（`entry-time-model.ts:92-96`）。`duration_minutes` は planned 専用。
- **結論**: 「導出可能値の実体化（L7）」は事実だが、null 許容 + fallback で integrity は破綻しない設計。**既存 issue [#1285](https://github.com/Dayopt/dayopt/issues/1285)（`planned_duration_minutes` への rename）が意味の明確化として妥当**。本リファクタの範囲外（schema 変更）。

### ⑤ `user_settings` の Json 列の Zod ランタイム検証

- **Zod 検証は無い**: `features/settings/server/router.ts` の `userSettings.get` で、`chronotype_settings`（:102）と `personalization`（:119-130）はいずれも `as { type: string }` / `as Record<string, unknown>` の **型キャストのみ**で読み出している。DB-stored Json を信頼している。
- **緩和**: `personalization` は `?? false` / `?? null` で各フィールドを defensive にデフォルトしている。`chronotype_settings` は `null` チェックのみ。
- **リスク**: Json が破損形状の場合、ランタイム検証なしで cast されるため不正値が UI まで流れうる（低頻度・自己所有データなので実害は小）。
- **結論**: 将来 issue 化候補（Json 列読み出しに Zod `safeParse` を入れる）。H7（ロジックの DB 沈降）と同根。本リファクタでは触らない（schema/挙動に踏み込むため）。

## 検証

```bash
pnpm --filter @dayopt/product exec vitest run \
  src/features/settings/components/UserSettingsInitializer.test.tsx \
  src/features/settings/hooks/useUserSettings.test.ts
# → 19 passed
```
