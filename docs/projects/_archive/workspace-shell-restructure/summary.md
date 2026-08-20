---
status: current
last_verified: 2026-08-20
code:
  - apps/product/src/app/[locale]/(app)
  - apps/product/src/proxy.ts
  - apps/product/src/features/review
  - apps/product/src/features/calendar/lib/route-utils.ts
  - apps/product/src/lib/calendar-view-tokens.ts
---

# workspace-shell-restructure 完了サマリー

[epic #2181](https://github.com/Dayopt/dayopt/issues/2181) で User が裁可した「Notion 型 Sidebar タブ + `/calendar` / `/report` の 2 URL」への反転は、2026-08-19 に epic を close して完了した。Step 6（旧 route 削除）の最後の残渣（`route-utils.ts` の旧 day/week/Nday 判定）は #2223 で 2026-08-20 に片付き、以後アプリ内部のルーティング判定は `/calendar` の完全一致のみを見る。

## 最終契約

- 公開 URL は **`/calendar`**（view はクエリで受ける）と **`/report`** の2つに統一。旧 `/day` `/week` `/[nday]` `?panel=` は `proxy.ts` の redirect が `/calendar` / `/report` へ写す
- Sidebar 上部のタブ（Notion 型）が Sidebar 本体とメイン領域を同時に切り替える。第3のタブは作らない
- `/report` はフルページ 1 スクロール構成（旧 `CalendarReviewRail` の panel 化から復帰）
- `/calendar?view=` の正規トークン（day / week / 2day〜7day）は `@/lib/calendar-view-tokens` を単一定義とし、proxy.ts（Edge runtime）・`calendar-page-params.ts`・`CalendarNavigationContext.tsx` の3箇所がそこから導出する（旧実装は3箇所に判定ロジックを複製していた）

## Sub-issue

#2190（route新設）/ #2191（redirect）/ #2192（Sidebar タブ化）/ #2193（/report フルページ化）/ #2194（セグメント配線）/ #2195（旧route・旧サイドパネル残骸削除）/ #2196（原則10の歯止め移設）/ #2223（Step 6 最終残渣の掃除）

## Follow-up

`anchorRect`（旧 FloatingPopover のアンカー位置管理、Inspector を右サイドパネル化した #2215 で不要化）や z-index token の整理は [#2242](https://github.com/Dayopt/dayopt/issues/2242) へ切り出した。`#2218`（tag系依存の残余撤去）は本 project の Step には含まれない別 chore として独立に進行中。
