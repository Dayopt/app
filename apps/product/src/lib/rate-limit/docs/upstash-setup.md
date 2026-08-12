# Upstash Redis rate limit運用

Productの分散rate limitはUpstash Redisを使う。Productionでは必須、Preview / Developmentでは未設定を許可し、既存のインメモリfallbackで開発を継続できる。

## Production設定

1. `UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を1PasswordのProduction masterへ保存する
2. ProductのVercel Production targetだけへ同期する。Preview / Developmentへ複製しない
3. URLはHTTPS、tokenはSensitiveとして扱う
4. `pnpm env:check`で値を表示せず存在だけ確認する

ProductのProduction build gateは、どちらかの値がない場合、URLがHTTPSでない場合にdeployを停止する。runtimeのenv validationも同じ組を必須にする。

## 実装契約

- 全limiterは`apps/product/src/lib/rate-limit/upstash.ts`のfactoryから作る
- Upstash Ratelimit Analyticsは無効にし、raw IP、user ID、calendar tokenを送らない
- identifierはProduct固有namespace prefixを加えてSHA-256化してからUpstash keyへ渡す
- SDK timeoutは`success: true`を返すため、2秒で`RateLimitUnavailableError`へ変換する
- CSPはbackend unavailable時に503でfail-closedにする
- tRPCとiCalの既存インメモリfallbackは可用性方針として維持する
- 429は想定内レスポンスでありSentry Issue化しない。backend障害だけを元のError付きで一度captureする

## 現行quota

| 境界                 | quota          |
| -------------------- | -------------- |
| contact              | 5回 / 1時間    |
| protected tRPC       | 100回 / 1分    |
| timeblock作成        | 500回 / 24時間 |
| iCal feed            | 10回 / 1分     |
| CSP report（IP単位） | 20回 / 1分     |
| CSP report（全体）   | 120回 / 1分    |

## 確認

```bash
pnpm --filter @dayopt/product exec vitest --project unit run src/lib/rate-limit/__tests__/upstash.test.ts
pnpm --filter @dayopt/product exec vitest --project unit run src/app/api/csp-report/__tests__/route.test.ts
```

Upstash dashboardではrequest volume、latency、errorを確認する。keyを調査する場合もhash値だけであることを確認し、raw identifierをログ、Issue、docsへ転記しない。

## 障害時

- Production build失敗: Vercel targetと1Password masterのenv存在、URL形式を確認する
- runtime 503: Upstash status、credential失効、latencyを確認する。rate limitを無効化して回避しない
- 429急増: 攻撃・誤loop・quota不足を切り分け、Sentryのaccepted / discarded eventと合わせて確認する

関連: [Monitoring](../../../../../../docs/operations/monitoring.md)、[Runbook](../../../../../../docs/operations/runbook.md)
