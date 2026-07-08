---
status: frozen
last_verified: 2026-07-08
code: docs/operations/secrets.md
---

# docs/operations/secrets.md 実秘密値監査

Issue #1450 のフォローアップとして、`docs/operations/secrets.md` に実秘密値が含まれていないことを確認した。

## 結果

- `docs/operations/secrets.md` には秘密値の実体、prefix/suffix、hash、長さを特定できる値は含まれていない。
- 記載されているのは env 名、1Password item / field 名、`op://` 参照の扱い、存在確認手順だけ。
- `pnpm secrets:check` は初回実行時、`scripts/generate-rls-snapshot.ts` の local Supabase 既定接続先例に反応した。これは本番 secret ではないが、secret scanner の基準に合わせてパスワード入り URL リテラルを除去した。

## 判断

`docs/operations/secrets.md` は「どこで・どう管理しているか」の手順だけを保持している状態であり、Issue #1450 の監査対象としては問題なし。
