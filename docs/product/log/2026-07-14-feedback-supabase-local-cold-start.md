---
status: frozen
date: 2026-07-14
updated: 2026-07-14
---

# Supabase local の cold start を dev launcher で扱う

`pnpm dev` 実行時に Supabase local が停止しているだけでエラー終了せず、通常の起動フロー内で復旧してほしいというフィードバック。

---

## 原文

> では削除してクリーンに。あと❌ Supabase local が起動していません。って表記が出るからこれも調整して

## 文脈

通常の local dev は Supabase local を参照するが、停止中は `scripts/dev-with-op.sh` がエラーを表示して終了し、利用者が別途 `supabase start` を実行する必要があった。

## 解釈

Supabase local の停止は異常ではなく cold start として扱い、`pnpm dev` が必要な依存サービスを起動してから product app を開始する方が基本体験に合う。

## 対応

停止を検出した場合は `supabase start` を自動実行し、起動後に URL / key を再取得する。CLI 不在や Docker 停止などで起動自体に失敗した場合だけ、復旧方法を含むエラーを表示する。
