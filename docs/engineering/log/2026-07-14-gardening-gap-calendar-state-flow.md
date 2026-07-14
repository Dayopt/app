---
status: frozen
last_verified: 2026-07-14
---

# Calendar の状態所有を docs だけで追えなかった

## スモーク質問

「現行 Calendar の Plan / Record と UI state のデータフローを、実装を開かず docs だけで説明できるか」

## 判定

失敗。`docs/engineering/architecture.md` が Next.js 15、削除済み feature、旧 `src/shell` / `src/platform`、Plan / Record の旧属性を参照し、URL・Context・Zustand の責務境界も記載していなかった。

## 確認した事実

- Calendar は Plan と Record を別レーンで表示し、`records.plan_id` で 1 Plan : N Record を表現する。
- 日付、view range、右側の Review / Diff panel は URL と `CalendarNavigationContext` が source of truth。
- `CalendarViewClient` が `CalendarController` と右側 panel を合成する。
- サーバーデータは tRPC / TanStack Query、Zustand は一時 UI state と表示・フィルター設定を担当する。

## 修復

同日の月次ガーデニングで `docs/engineering/architecture.md` を現行 feature DAG、Next.js 16、Supabase 環境、Calendar state flow に合わせた。今後 Calendar の状態所有を変える実装では、この節を同時に更新する。
