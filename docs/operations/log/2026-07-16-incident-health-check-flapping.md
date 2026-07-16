---
status: frozen
date: 2026-07-16
last_verified: 2026-07-16
issue: 1630
code: apps/product/src/app/api/health
---

# Production health check の status flapping

2026-07-16、Issue #1625 の不可逆なcolumn dropに先立つproduction確認で、同一deploymentの`/api/health`が`healthy`、`degraded`、`unhealthy`の間を変動した。単発の`healthy`を根拠にIssue #1630を一度closeしたが、複数回確認のAcceptance Criteriaを満たしていなかったためreopenした。

## 起きた事実

- 5回の逐次確認では`200 / degraded`が継続し、Vercel runtime logに`503`が1回あった。
- 後続の20並列確認は`healthy` 14回、`degraded` 5回、`unhealthy` 1回だった。
- 同一deploymentでSupabase projectは`ACTIVE_HEALTHY`、production DBへのread-only queryは成功した。
- Vercel runtime logに対象時刻のDB、Redis、application errorは確認されなかった。
- health routeはproductionでcheck詳細を返さず、DB/Redisの失敗も個別に記録していなかった。
- secret値、接続URL、ユーザーデータ値は取得・記録していない。

## 原因候補

- health routeはV8の`heapUsed / heapTotal`を使用率として扱い、80%超を`degraded`、95%超を`unhealthy`にしていた。
- `heapTotal`はprocessの固定memory上限ではなくV8が現在確保しているheapであり、serverless invocation間のreadiness判定には適さない。
- 観測時点ではどのcheckがstatusを変えたかを示すlogがないため、memory判定を確定原因とはせず最有力候補として扱う。
- DB checkも存在しない`ping` RPCを呼び、任意の`PGRST*` errorを疎通成功としていたため、実際のDB failureを隠す可能性があった。

## 修正方針

- memory比率をreadinessとdiagnostic responseから除外する。
- DB checkを`public.profiles`への副作用のない`SELECT id LIMIT 1`へ変更し、query成功だけを`ok`とする。
- productionのresponse contractは`{ status }`のまま維持する。
- 非healthy時はoverall、DB/Redis status、response timeだけをlogへ記録し、error object、message、env、secret、取得行は記録しない。

## 未完のproduction gate

- 修正後deploymentへ20回の逐次確認と20並列確認を行い、全件`200 / healthy`であることを確認する。
- 同期間の`/api/health` 503と新規runtime error/fatal logが0件であることを確認する。
- gate達成まではIssue #1630をcloseせず、Issue #1625を`status:blocked`のまま維持する。

## 関連

- GitHub Issue #1630
- GitHub Issue #1625
- GitHub Issue #1602
- [Node.js process memory usage](https://nodejs.org/api/process.html#processmemoryusage)
- [Node.js V8 heap statistics](https://nodejs.org/api/v8.html#v8getheapstatistics)
