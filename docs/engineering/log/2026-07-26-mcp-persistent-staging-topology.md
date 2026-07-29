---
status: frozen
date: 2026-07-26
superseded_by: docs/engineering/log/2026-07-29-mcp-ephemeral-preview-oauth-identity.md
---

# MCP closed betaはSupabase persistent branchとVercel Custom Environmentを使う

## 背景・当時の前提

ChatGPT、Claude、CursorのOAuth callbackとMCP resourceには、PRごとに変わらないHTTPS originが必要である。ProductionのDB、Auth、secret、token、cookieを検証に流用してはいけない。

2026-07-26時点のSupabase公式仕様では、persistent branchは個別のSupabase instanceとAPI credentialを持ち、DB schema/data、Storage object、Edge Function、Auth configurationがbranch間で分離される。default MicroのBranching Computeは1時間$0.01344で、730時間なら約$9.81/月である。Compute CreditとSpend Capの対象外であり、別Micro projectの追加費用約$10/月と価格差はほぼない。

同日時点のVercel Proでは、projectごとにCustom Environmentを1つ追加費用なしで作れる。Custom Environmentは専用env vars、branch tracking、固定domainを持ち、`VERCEL_TARGET_ENV`で`staging`を識別できる。

参考:

- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
- [Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- [Manage Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- [Vercel Environments](https://vercel.com/docs/deployments/environments)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)

## 決定と理由

- Supabaseは既存`dayopt` project配下に、data-lessのpersistent branch `staging`を作る。独立projectは作らない
- Vercelは既存`product` projectにCustom Environment `staging`を作る。独立projectは作らない
- Product authorization serverは`https://staging.dayopt.app`、MCP resourceは`https://mcp.staging.dayopt.app`へ固定する
- branch固有のSupabase credential、OAuth connection/token、cookie、secret、client registrationだけを使い、Production値へのfallbackを禁止する
- Supabase GitHub integrationをmigration deployment ownerとして維持し、現行migration chain、quiescence、逆GRANT、再cutoverを同じbranch modelでrehearseする
- Vercelのlogical environmentは`VERCEL_TARGET_ENV=staging`を正とし、Production用Sentry/Resend secretと外部送信を流用しない

persistent branchは必要な隔離と固定endpointを満たし、Dayoptの`local → PR Preview → production`運用とmigration ownerを変えない。Vercel Custom Environmentも同じ`product` project内でstaging専用設定を持てるため、別projectのProduction deploymentを誤ってProduction運用へ混ぜない。

## 却下した選択肢と、なぜ捨てたか

- Production mainをstaging Vercelから参照する — test user、token、write、migrationのblast radiusをProductionから分離できない
- PR Preview Branchを使う — inactivityやPR closeで消え、clientへ登録したissuer/resource URLを維持できない
- 独立Supabase projectを作る — 物理project境界は強いが、今回必要なAuth/DB/credential分離はpersistent branchで満たせる。別のdeployment ownerとmigration driftを増やす価値がない
- 独立Vercel projectのProduction deploymentを使う — `VERCEL_ENV=production`に依存する現行Sentry/Resend/Upstash gateと実送信をProduction扱いにし、secretとtelemetryを混ぜる
- Vercel Preview hostnameをissuer/resourceにする — hostnameとdeployment lifecycleが公開OAuth identityに向かない

## 影響・やること

- 外部resource作成前に、Supabase branch、Vercel Custom Environment、2つの固定hostを対象として明示権限を得る
- branch作成後、`[remotes.staging]`でseedを無効化し、signupを無効化し、Authのsite URLとredirectをstaging exact originへ固定する。repo内の固定password seedをPersistent Stagingへ適用しない
- staging build/readiness gateを`VERCEL_TARGET_ENV`へbindし、Production credential、Production Sentry、実メール送信を拒否する
- 1Passwordをmasterとし、VercelとSupabaseのstaging replicaだけへ値を同期する
- 全gateをOFFにしたままread-only smokeを通し、client単位で再authorizationしてから段階的に開く
- Branching Compute約$9.81/月に加え、Vercelと通常のSupabase usage超過を請求画面で監視する
