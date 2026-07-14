---
status: frozen
updated: 2026-07-14
---

# Product Production の Upstash 環境変数欠落検知

2026-07-13、Vercel Product / Production の runtime error 集計で Upstash Redis の環境変数欠落が検知された。翌日の確認時点では 1Password master と Vercel Production replica の双方に必要な2フィールドが存在し、最新 deployment の health check も正常だった。

---

## 起きた事実

- 2026-07-13、Issue #1602 の起票時点で `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` の未設定を示す error group が報告された。
  - issue に記録された観測値は 50 occurrences / 17 users。
  - 当時の runtime log は保持期間外になったため、2026-07-14 の調査では個別 event を再取得できなかった。
- 2026-07-14、値を表示せず metadata のみ再確認した。
  - 1Password `Dayopt-Production/upstash` に両フィールドが存在した。
  - Vercel `product` project に両変数が存在し、どちらも `production` target / `sensitive` だった。
  - 両変数の Vercel metadata は 2026-05 から存在しており、今回の確認では再登録していない。
- 最新の Production deployment は main の commit `74738cdd3` から作成され、`READY` だった。
- `https://app.dayopt.app/api/health` は `200` / `healthy` を返し、Redis の接続確認を含む health check が成功した。
- 最新 deployment の直近1時間に error / fatal log はなく、Upstash 関連 log もなかった。

## 影響範囲

- 検知時点では、Product Production の rate limit が Upstash backend を利用できず、multi-replica 環境で期待した分散 rate limit が効かなかった可能性がある。
- error group の元 event を再取得できないため、欠落が継続していた時間と、実際に fallback が選択された request 数は確定できない。
- 2026-07-14 の確認時点では、Production の Redis 接続と application health は正常で、継続影響は確認されなかった。

## 復旧確認

- 1Password master と Vercel replica の存在・scope・Sensitive 状態を確認した。
- 最新 Production deployment が正常に起動し、health endpoint から Upstash Redis へ接続できることを確認した。
- 変数の再登録や手動再デプロイは、正常な replica を上書きするリスクがあるため実施しなかった。

## 学び

- runtime error の検知だけで「現在も env が未設定」と判断せず、1Password master、Vercel env metadata、対象 deployment、health check の順に現在状態を照合する。
- incident 起票時に deployment ID と発生時刻を残す。Vercel runtime log の保持期間を過ぎると、原因 event の再検証ができない。
- secret の確認は存在・target・type だけに限定し、値は terminal、issue、PR、log に出さない。
- env が既に正しく存在し、最新 deployment も正常な場合は、再登録や不要な Production deploy を復旧手順に含めない。

## 関連

- GitHub Issue #1602
- `docs/operations/secrets.md`
- `docs/operations/security/environment-secrets.md`
- `apps/product/src/app/api/health/route.ts`
