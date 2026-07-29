---
status: current
last_verified: 2026-07-29
code:
  - apps/product/scripts/mcp-conformance.ts
  - apps/product/src/app/api/mcp
  - apps/product/src/app/api/mcp/_tools
---

# Step 6 — MCP 2026-07-28 conformance

この文書は、[#1716](https://github.com/Dayopt/dayopt/issues/1716)で固定したrepo内のprotocol確認境界を記録する。Persistent Stagingと3 clientの確認は[client beta verification](./step-6-client-beta.md)で別に扱う。

## Adopted contract

- MCP specificationはfinal releaseの[`2026-07-28`](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)を採用する。release commitは`5f5440bb26a62e2cf3440b92da5a667efa03b267`
- server runtimeは`@modelcontextprotocol/server@2.0.0`を使う
- official conformance suiteは`@modelcontextprotocol/conformance@0.2.0-alpha.10`へ固定する
- test clientとNode adapterは`@modelcontextprotocol/client@2.0.0`、`@modelcontextprotocol/node@2.0.0`へ固定する
- Product全体のZod 3は変更しない。MCP SDK境界だけ`zod-v4` aliasでZod 4.4.3を使う

旧server SDK v1.29.0は`2026-07-28`の`server/discover`をHTTP 400で拒否し、`2025-11-25`までしか提示しなかった。このため、application側のtest追加だけでは新revisionへ対応できず、server runtimeをv2へ移した。

official alpha suiteは内部で旧`@modelcontextprotocol/sdk`へ依存する。lockfileに残るv1 packageはconformance用のtransitive dev dependencyであり、Dayoptのruntime sourceとdirect dependencyからは除いた。

## Dual protocol boundary

Dayoptは移行時点のclientを切断しないため、2経路を同じtool registryから作る。

- `2026-07-28` requestはv2のstrict modern handlerで処理する
- 2025-era requestは既存互換のstateless transportで処理する
- legacy initializeと通常callは`application/json`を維持する
- modern requestはsession IDを発行しない
- OAuthで検証したuser、client、scope、connection、token、resourceだけをserver contextへ渡す
- bindingの欠落、不明client、不明scope、resource不一致はtool登録前にfail closedする

v2 handlerの既定legacy fallbackはresponseを`text/event-stream`で返す。Dayoptの既存JSON contractを維持するため、`isLegacyRequest`で分岐してlegacy transportの`enableJsonResponse`を明示した。

## Repository checks

次のcommandは外部credential、実ユーザー、DB、固定portを使わない。loopbackの一時serverと固定の偽read-only principalを使い、結果artifactはOSの一時directoryへ出して終了時に削除する。

```bash
pnpm test:mcp:conformance
```

2026-07-29の結果は次のとおり。

| Scenario           | Result                                      |
| ------------------ | ------------------------------------------- |
| `server-stateless` | 24 / 28 pass、4 expected failure、0 warning |
| `tools-list`       | 2 / 2 pass、0 failure、0 warning            |

expected failureは次の4 checkだけをexact IDで許可する。

- `server-stateless:sep-2575-server-rejects-undeclared-capability`
- `server-stateless:sep-2575-missing-capability-http-400`
- `server-stateless:sep-2575-http-server-no-independent-requests-on-stream`
- `server-stateless:sep-2575-server-no-log-without-loglevel`

official scenarioがこの4件を実行するにはsuite専用diagnostic toolが必要になる。Dayoptはtest専用toolをproduction registryへ公開しない。baselineにないfailureと、実行されてSUCCESSへ変わったbaseline IDがあればcommandを失敗させる。alpha suiteは未実行またはskipされたbaseline IDを許容するため、suite更新時は4 IDが実際にFAILUREとして出ていることを人が確認する。

route testは別に次を持つ。

- credentialとscheme別の401 / 400、`WWW-Authenticate`
- scope不足の403と一時的な認可障害の503
- header、ASCII、multibyte UTF-8の1 MiB request上限
- legacy JSON responseと18 tool
- `2026-07-28`での18 tool、read call、mutation call、domain error
- serverへ渡すuser、client、scope、connection、token binding
- modern responseがsessionlessであること

## Release boundary

`pnpm test:mcp:conformance`はalpha依存を明示したrelease precheckであり、通常の`pnpm check`へ含めない。Persistent Stagingへ出すcandidate SHAで明示的に実行し、suite version、spec version、expected failure ID、結果をevidenceへ記録する。

repo変更は未deployならrevertできる。一方、実clientが`2026-07-28`を使い始めた後のruntime downgradeは接続を壊し得る。問題時はlegacyとmodernのdual supportを維持し、write gateを閉じたままforward fixする。

この確認はPersistent Staging、実OAuth、ChatGPT / Claude / Cursor、実network、画面render、Productionを証明しない。それらが完了するまでStep 6は`pending`、write gateはOFFを維持する。
