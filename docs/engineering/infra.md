---
status: current
last_verified: 2026-07-30
---

# インフラ・環境・API/Routing 総覧

環境構成（Local / PR Preview / Production）、CI品質ゲートのロードマップ、Bot 対策（Turnstile）、API endpoints 総覧、Supabase 型自動生成、App Router routing 総覧、パフォーマンス監視の原則、開発コマンド一覧、マイグレーション/リリースチェックリスト、DB Migration Rollback 手順書。「環境・デプロイ・シークレットは?」の正。

---

## 環境構成

Dayopt の標準ルートは `local → PR Preview → production`。Vercel Preview が production Supabase DB を触らないことを最優先にする。

### 環境一覧

| 環境           | Supabase                          | Vercel                          | URL              |
| -------------- | --------------------------------- | ------------------------------- | ---------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                      | localhost:3000   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview (`product`)      | `*.vercel.app`   |
| **Production** | `dayopt` main                     | main merge で Production deploy | `app.dayopt.app` |

persistent staging は常設しない。固定 URL が必要な Stripe / OAuth callback / closed beta 検証が出た時だけ、Vercel staging と Supabase persistent branch を追加する。

### テスト自動化の現在地

| Suite                          | CI       | 現在の役割                                                               |
| ------------------------------ | -------- | ------------------------------------------------------------------------ |
| Vitest unit（product / web）   | required | ロジックとcomponentの回帰検知                                            |
| Playwright `chromium`          | required | `apps/product/src/lib/test/e2e` の全specを実行                           |
| Playwright `Mobile Chrome`     | local    | `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` を持つ環境でmobile shellを確認  |
| Storybook browser light / dark | local    | interaction / a11yの既知failureを #1499 / #1586 で解消後にCI昇格を再判断 |
| Playwright Test Agents         | opt-in   | planner / generatorだけを単一フローの計画・生成支援に使う                |

Mobile ChromeをCIで実行すると、認証必須testは環境変数不足でskipされ、残る未認証testだけがchromiumと重複する。認証fixtureまたはCI専用test userを安全に用意するまではlocal専用とする。Test Agentsのhealerは、失敗を`test.fixme()`へ変えてgreenにできるため採用しない。判断の根拠は [2026-07-13-test-automation-strategy.md](./log/2026-07-13-test-automation-strategy.md) に記録する。

### Supabase Project

| Project | Reference ID           | Region | 用途                          |
| ------- | ---------------------- | ------ | ----------------------------- |
| dayopt  | `yvglwblxrnrenfifsnje` | Tokyo  | production main + PR branches |

Supabase GitHub integration が migrations / Edge Functions / Storage buckets の deployment owner。GitHub Actions から `supabase db push` は通常実行しない。

### 環境変数の管理

#### 1Password master / replica

Secrets の正本は `docs/operations/secrets.md`。1Password は production / shared / optional staging の長寿命 secrets だけを管理する。PR Preview Branch credentials は 1Password に保存せず、Supabase / Vercel integration の ephemeral replica として扱う。

#### Vercel environment

```txt
Production → Dayopt-Production の Supabase credentials
Preview    → Supabase Vercel integration が PR Branch credentials を注入
Development/local → .op-env.local + op run
```

Preview environment に production Supabase credentials を手動設定しない。残っている場合は削除または Preview scope から外す。

#### `.op-env.local`

repository root の `.op-env.local.example` を `.op-env.local` にコピーし、`op://` 参照だけを書く。実値・dummy secret・placeholder secret は書かない。

### Local Development

```bash
supabase start
pnpm dev
```

`pnpm dev` は `op run` 経由のまま。デフォルトでは Supabase local が停止中なら自動起動し、`supabase status -o env` から URL / anon key / service role key を取得して、値を表示せずに product app へ渡す。`.env.local` の実値保存は禁止。

一時的に `.op-env.local` の Supabase refs をそのまま使う場合だけ、明示的に切り替える。

```bash
DAYOPT_SUPABASE_TARGET=op pnpm dev
```

### Migration

詳細は本ファイルの「マイグレーション & リリース チェックリスト」セクション。

- PR open: Supabase Preview Branch が作成され、migration と seed が適用される
- PR review: Vercel Preview が対応する Supabase Preview Branch を参照する
- main merge: Supabase integration が production に migration を適用する
- emergency only: 手動 `supabase db push`

### GitHub Actions Secrets

CI / E2E 用の build env は GitHub Secrets に残す。migration 用の `SUPABASE_ACCESS_TOKEN` / DB password は通常 workflow からは使わない。緊急手動 runbook 用に残す場合も、1Password master から同期し、値を出力しない。

### デプロイフロー

```txt
feature branch → PR
  ├── Supabase Preview Branch
  └── Vercel Preview (product)
        ↓
      review
        ↓
main merge
  ├── Supabase main deployment
  └── Vercel Production build（domain 未割当の candidate）
        ↓
      Production Release workflow（同一 SHA / smoke / audit）
        ↓
      promote → Production domain
```

Vercel の正規 deployment source は `Dayopt/dayopt` の GitHub 連携だけとする。
Preview は branch push / PR、Production build は `main` merge から作成する。CLI、REST API、Deploy Hook、
Marketplace integration、v0 から新規 Production deployment を作らない。

### merge と Production 公開の分離

gate が機能する前提は **Product / Web の Auto-assign Custom Production Domains が無効**であること。
これを無効化するまで main merge は従来どおり直接公開され、release workflow は素通りする。

1. Vercel Dashboard → product / web → Settings → Git
2. Auto-assign Custom Production Domains を OFF にする（web を先に、動作確認後 product）
3. 両方 OFF にしたら `.github/workflows/release.yml` の `RELEASE_EXPECT_AUTO_ASSIGN` を `'false'` にする

Production 設定の変更なので、実施はユーザーの明示承認下で行う。

無効化後は、main への merge が作るのは domain 未割当の Production build だけになり、Production domain の
切り替えは `.github/workflows/release.yml`（`Production Release`）の promote だけが行う。
workflow は次を満たした時だけ promote する。

「今どれが配信しているか」は **production domain の alias** から引く。`/v9/projects/{id}` の
`targets.production` は production target の**最新** deployment を指し、build 中でもその値になるため
使えない（merge の 8 秒後、build 完了の 60 秒前に新 deployment を指すことを実測した）。

- Product / Web の Production build が **同一 merge SHA** で両方 `READY`
- 各 candidate の unique URL への read-only smoke が成功（Deployment Protection があるため
  Protection Bypass for Automation の secret が必須）
- live な Vercel metadata に対する Production Config Audit が成功

smoke は promote 対象だけでなく **全 candidate に毎回走る**。Auto-assign が有効な段階適用中は
candidate が待機中に自動割当されて promote 対象が空になるため、promote 対象だけを smoke すると
cutover まで smoke のコードパスが一度も実行されない。全 candidate に走らせることで、毎 merge が
smoke と bypass secret の実働テストになる。**bypass secret を登録するまで release run は毎回
失敗する**（Production は Auto-assign により更新され続けるので無傷。ただし `Production Release`
status が failure になるため、その間は tag を打てない）。

promote 順は web → product に固定し、2 つ目が失敗した場合は 1 つ目を直前 deployment へ自動 rollback する。
片方だけ公開された状態は残さない。失敗時は Production domain が現行 SHA のまま維持される（fail-safe）。

対象 SHA より新しい Production deployment が既に live の場合は promote せず、`Production Release` status
を failure にする。live でない commit に tag を打てないようにするためで、run 自体も失敗として扱う。

**Vercel 側の既知バグへの対処**: promote endpoint は project 設定の `autoAssignCustomDomains` を
`true` へ戻す（[vercel/vercel#15095](https://github.com/vercel/vercel/issues/15095)、未修正）。放置すると
次の main merge が gate を通らず直接公開される。release script は promote / rollback の直前に観測した値を
そのまま復元する。無効化していれば無効のまま、段階適用中で有効なら有効のままになる。

### release workflow の信頼境界

`release.yml` は Vercel の promote / rollback 権限を持つ token を扱う。実行する script は常に
**workflow を dispatch した ref のもの**を使い、`sha` 入力は release 対象を指す data としてだけ扱う。
`actions/checkout` の `ref` に入力 SHA を渡すと、未 merge の commit が持つ script が Production 権限で
動く。この制約は `scripts/__tests__/release-workflow-contract.test.ts` が回帰から守る。

手動 dispatch の `sha` は main に merge 済みであることを compare API で確認する。ただしこれは
「merge 済みか」の確認であって、コード実行の防御ではない。

**未解決の残存リスク**: `actions: write` を持つ主体が main 以外の ref から dispatch すると、その ref の
script が Production secret 付きで動く。YAML の条件では塞げない（攻撃者の branch では条件ごと消せる）。

release job は `environment: production-release` を宣言済みなので、閉じるのに必要なのは GitHub 設定だけ。
**設定するまでこのリスクは開いたまま**である点に注意する。

1. Settings → Environments → `production-release` を開く（初回 run で自動作成される）
2. Deployment branch policy を Selected branches にし、`main` だけを許可する
3. `VERCEL_AUTOMATION_BYPASS_PRODUCT` / `VERCEL_AUTOMATION_BYPASS_WEB` だけを repository secret から
   environment secret へ移す

2 だけでも main 以外からの dispatch は job 開始前に拒否される。3 は secret の露出範囲をこの job に
限定するための追加措置で、対象は release.yml しか読まない bypass secret 2 つに限る。

**`VERCEL_TOKEN` と `VERCEL_ORG_ID` は repository secret のまま残す。** `production-config-audit.yml` の
audit job は `pull_request_target` と `push: main` で走るため `environment:` を宣言できず、repository
scope でこの 2 つを読む。environment secret へ移すと Production Config Audit が起動直後に落ちる。
このため手順 3 の目的（露出範囲の限定）は bypass secret のみの部分達成になる。

いずれも Production 経路に触る設定変更なので、実施はユーザーの明示承認下で行う。

緊急時は正常な既存 deployment の `Instant Rollback` / `Promote to Production` を使う。手順は
[runbook](../operations/runbook.md) の Playbook 2 を正とする。

Deployment Policies による強制は [判断ログ](./log/2026-07-14-vercel-github-only-deployment-policy.md) を参照する。

### トラブルシューティング

| 症状                                    | 対処                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Supabase PR check が出ない              | Supabase GitHub integration / required check 設定を確認                        |
| Vercel Preview が production DB を見る  | Vercel Preview env から production Supabase vars を削除し integration を再同期 |
| migration が Preview Branch で失敗      | Supabase deployment log を確認し、migration を修正して PR branch に push       |
| Production に反映されない               | `gh run list --workflow=release.yml` で promote が成功しているか確認           |
| Supabase 側が Production に反映されない | Supabase GitHub integration の production deployment log を確認                |

---

## CI 品質ゲート

現在有効な job と依存関係は `.github/workflows/ci.yml` を正とする。ローカルの標準入口は `pnpm check`、個別コマンドは `AGENTS.md` を参照する。

### GitHub品質サービス

GitHub Code QualityはOrganization / Repositoryの両方で無効にし、PR品質ゲートには採用しない。追加のActions利用・active committer課金を避け、保守性・信頼性の検査は既存のCI、CodeQL、自動コードレビューで担保する。

- Required checksはrepository rulesetと`.github/workflows/ci.yml`を正とし、Code Quality由来のcheckを追加しない
- セキュリティ静的解析はGitHub CodeQLを継続する
- Copilotのautomatic first reviewとCodex reviewを継続する
- カバレッジ閾値が必要になった場合はVitest / CIで直接管理する
- Code Qualityを再評価する場合は、有効化前にbilling impactと既存品質ゲートとの差分を確認する

判断と2026-07-21時点の外部設定証跡は[判断ログ](./log/2026-07-21-github-code-quality-disabled.md)に記録する。

- `Production Contract`は安全なdummy値だけを使い、Product / WebのProduction build gateがResend、Upstash、Web Turnstileを要求することを検査する
- `Production Config Audit`はtrusted base revisionのscriptだけを実行し、Vercel APIからenvのkey / target / typeだけを検査する。secret値は取得・出力せず、PR codeへVercel tokenを渡さない
- `RESEND_API_KEY`と`RESEND_WEBHOOK_SECRET`はProductionだけをtargetにし、Preview / Developmentへの設定をaudit failureにする
- workflow導入PRでは`pull_request_target`がまだbaseにないため、同じscriptをmetadata-onlyで手動実行し、merge後の初回trusted run成功後にrequired statusへ昇格する

### merge gate の required checks

main ruleset の required status checks は `ci.yml` の 4 job（`🔍 Static Checks` / `📦 Unit Tests` / `🎭 E2E Tests` / `🌐 Web Build & E2E`）に加えて次を含める。`🎭` / `🌐` は draft PR では skip される（`.claude/rules/workflow.md` §2 段階 CI）。

| context                   | 発行元            | 目的                                                       |
| ------------------------- | ----------------- | ---------------------------------------------------------- |
| `Production Config Audit` | GitHub Actions    | live な Vercel env metadata が Production 契約を満たすこと |
| `Vercel – product`        | Vercel GitHub App | Product の Preview build が成功すること                    |
| `Vercel – web`            | Vercel GitHub App | Web の Preview build が成功すること                        |

- `Vercel – product` / `Vercel – web` の区切り文字は en dash（U+2013）で、hyphen ではない
- Vercel の check context は **project 名に由来する**。project を rename すると required check が一致しなくなり、
  全 PR が merge 不能になる。rename する場合は ruleset を先に更新する
- 同じ理由で、Ignored Build Step を設定すると status 自体が付かなくなる。設定しない
- `Production Release` は merge 後の証跡であり、required check にはしない
- **Storybook browser suite（`pnpm test-storybook` / `test-storybook:dark`）は CI に載っていない。**
  `@dayopt/product` の vitest project（`--project storybook` / `storybook-dark`）として実体はあるが、
  `ci.yml` にも `pnpm check` にも入っていないため、required check 以前に**そもそも実行されていない**。
  除外の理由だった「light / dark とも既知 failure がある」は解消済みで、#1499 / #1586 は両方 closed、
  2026-07-30 のローカル実測では light / dark とも 136 tests 全 pass（42 files pass / 33 skip）。
  CI へ載せるかは job 数 = 課金分の判断（`.claude/rules/workflow.md` §PR 粒度）なので、別途決める
- **`pull_request_target` の job でも check run は PR の `statusCheckRollup` に出る。**
  2026-07-30 に PR #1760 で実測: `production-config-audit.yml`（`pull_request_target`）の job が
  `Audit Vercel metadata (trusted)` という CheckRun として出ている。したがって trusted base 実行の
  workflow でも、gate のために commit status を自分で publish する必要は無い。
  `Production Config Audit` という StatusContext が別に存在するのは、job 名から独立した固定 context を
  ruleset の required 指定に使うため
- **外部モデルの自動 diff レビュー（ai-review / Gemini）は 2026-08-03 に撤去した。** レビューは
  Codex レビューと Claude の内部レビュー（`.claude/rules/ai-behavior.md` §Read-only delegation の
  `risk-reviewer` / `behavior-verifier` / `architecture-guard`）に一本化する。判定基準だった
  不変条件カタログは [invariants.md](./invariants.md) に残っている
- `ci.yml` は docs / rules のみの変更では `paths-ignore` で skip され、4 job の status 自体が付かない。private + Free plan では GitHub 側の required check 強制が効かず、マージ可否は `scripts/git/finish-branch.sh` が全 check を見て判定する（失敗 0 件・実行中 0 件・成功 1 件以上）。ruleset の required 指定を強制できる plan へ移行する場合は、skip される job の扱いを先に設計する
- **判定は `statusCheckRollup` を畳んでから行う。** rollup は同名 check を畳まないため
  （`gh pr checks` は畳む）、同一 head SHA で 2 回 run が走ると古い run の failure / cancelled が
  残り続け、再実行で解決してもマージ不能になる。畳む単位は `gh pr checks` に合わせて
  **型 + workflow 名 + check 名**（name だけで畳むと別 workflow の同名 job の failure が隠れる）。
  代表の選び方は「最新を採る」ではなく、次の優先順で決める:
  1. **実行中が 1 つでもあれば実行中**（queued な run は `startedAt` を持たないことがあり、
     単純な最新判定では実行中を見落として素通りする）
  2. **判定を持つ entry**（`success` / `failure` / `cancelled` / `timed_out`）のうち `startedAt` 最大。
     `skipped` / `neutral` / `stale` は失敗にも成功にも数えないため、これが代表になると同名の
     古い failure が消える。**古い `failure` は新しい `skipped` より優先される**
  3. どれも判定を持たなければ `startedAt` 最大

  名前を特定できない entry は畳まず全件残す。契約は
  `scripts/__tests__/finish-branch.test.ts` が固定する（#1768）

- **audit contract 変更 PR の guard failure は trusted dispatch で解除する。**
  `production-config-audit.yml` は audit contract 保護対象（`scripts/production-config-audit.mjs` /
  各 `production-build-gate.mjs` / workflow 自身）を変更する PR で、`pull_request_target` の check run
  `Audit Vercel metadata (trusted)` を設計として必ず failure にする（PR code に contract 変更を
  自己検証させないため）。解除は **push ごとに** `gh workflow run production-config-audit.yml --ref <branch>`
  の trusted dispatch を実行する。成功すると commit status `Production Config Audit` が head SHA へ
  success で発行される。workflow_dispatch run の check run は PR の `statusCheckRollup` に紐づかないため
  畳み込みでは解消できず、`finish-branch.sh` は **status `Production Config Audit` が success の時に限り**
  guard check run の failure を失敗数から除外する（照合は 型 + workflow 名 + check 名 / context の完全一致のみ）。
  fail-closed: audit が本当に落ちた PR も dispatch 未実行の contract 変更 PR も status は failure のまま
  免除は発動せず、status は SHA ごとの発行なので新しい push で自動的にリセットされる。免除対象は
  guard の `conclusion: failure` だけで、`cancelled` / `timed_out`（監査が完走していない状態）は
  従来どおり停止する。**dispatch は branch 側の workflow 定義と audit script に `VERCEL_TOKEN` を
  渡して実行される**ため、contract 変更 PR の diff をレビューした後に、ユーザーの明示指示で実行する。
  契約は同じく `scripts/__tests__/finish-branch.test.ts` が固定する

段階的導入案と当時の計測値は履歴であり、現行構成として複製しない。経緯は [ADR-016](./log/2026-03-19-ci-quality-gates-roadmap.md) に残す。

---

## Bot 対策（Cloudflare Turnstile）

Dayopt は bot 対策として **Cloudflare Turnstile** を使う。reCAPTCHA v3 + v2 fallback から 2026-04 に乗り換え、マーケティングサイトとアプリの両方で同じ仕組みに統一した。

### 適用範囲

| 画面                | repo | 対象フロー             | 検証主体                       |
| ------------------- | ---- | ---------------------- | ------------------------------ |
| `/contact` フォーム | web  | Resendメール配送前     | 自前 siteverify POST           |
| `/signup` フォーム  | app  | `supabase.auth.signUp` | Supabase Auth (Bot Protection) |

widget は 1 つ（`Dayopt-Shared/turnstile`）で **1 widget 複数 hostname**（`dayopt.app` / `localhost` / `*.vercel.app`）をカバーする。環境別に site-key を分けない。

### 実装レイヤー

#### app repo

```
src/lib/turnstile/
├── config.ts       # SITE_KEY + isTurnstileEnabled()
├── Turnstile.tsx   # <Turnstile> widget ラッパ
└── index.ts        # barrel
```

- `SignupForm.tsx` が `<Turnstile onSuccess={setToken}>` で token を state に保持
- `useAuthStore.signUp(email, password, { captchaToken })` で Supabase へ渡す
- Supabase が secret 検証する（app は secret を持たない）

#### web repo

```
src/lib/turnstile/
├── config.ts       # SITE_KEY + VERIFY_URL
├── verify.ts       # verifyTurnstile(token, ip)
├── Turnstile.tsx   # <Turnstile> widget ラッパ
└── index.ts        # barrel
```

- `contact-form.tsx` で widget を表示、token を state に保持
- `/api/contact/route.ts` が CSRF → content type / body / schema → IP rate limit → honeypot → **`verifyTurnstile`** → 全体rate limitの順に検証
- Turnstile 失敗時は 403 `BOT_DETECTED` を返す

### Secret 管理

Secrets 運用の正本は `docs/operations/secrets.md`。1Password が master で、Supabase Dashboard の Turnstile secret は replica として手動同期する。

#### 1Password vault

```
Dayopt-Shared/turnstile
├── NEXT_PUBLIC_TURNSTILE_SITE_KEY
└── TURNSTILE_SECRET_KEY
```

#### env 参照

- **app** — `.op-env.local`:
  ```
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=op://Dayopt-Shared/turnstile/NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ```
  （app は secret を持たない）
- **web** — `.op-env.local`:
  ```
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=op://Dayopt-Shared/turnstile/NEXT_PUBLIC_TURNSTILE_SITE_KEY
  TURNSTILE_SECRET_KEY=op://Dayopt-Shared/turnstile/TURNSTILE_SECRET_KEY
  ```
- **Supabase Auth** — Dashboard → Authentication → Bot & Abuse Protection → Turnstile
  - `TURNSTILE_SECRET_KEY` を 1Password master から手動同期する
  - app の signup flow はこの dashboard 設定に依存する

### 検証フロー

#### web contact form

```
user submit
  → [client] Turnstile widget で token 取得
  → [client] POST /api/contact { ..., turnstileToken }
  → [server] CSRF 検証
  → [server] content type / 16 KiB body / strict schema
  → [server] IP rate limit
  → [server] honeypot (website field)
  → [server] verifyTurnstile(token, ip) ─ siteverify POST
      ├ success: true  → 全体rate limit → Resendメール配送
      └ success: false → 403 BOT_DETECTED
```

#### app signup

```
user submit
  → [client] Turnstile widget で token 取得
  → [client] supabase.auth.signUp({ options: { captchaToken } })
  → [Supabase] Turnstile secret で検証（dashboard 設定）
      ├ success: true  → user 作成
      └ success: false → AuthError
```

### 運用

#### Rotation

1. Cloudflare dashboard で widget の site/secret を regenerate
2. 1Password `Dayopt-Shared/turnstile` の fields を更新
3. Supabase Auth dashboard の secret key を差し替え
4. アプリ再デプロイは**不要**（op 経由で次回起動時に新値が注入される）

#### 開発時フォールバック

Cloudflare 公式の dev 用テストキーを使う場合でも、repo docs や `.op-env.local.example` には literal 値を書かない。必要な値は Cloudflare docs で確認し、一時作業後は `.op-env.local` を `op://` 参照へ戻す。

### 移行経緯

#### 旧実装（〜 2026-04）

- `src/lib/recaptcha/`（config / verify / hooks / RecaptchaScript）
- `/api/auth` route に v3 score 検証コード
- `RECAPTCHA_SECRET_KEY_V3` / `V2`、`NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V3` / `V2`

#### 課題

- auth route の v3 検証は **dead code**（caller が `recaptchaToken` を送っていなかった）
- Google トラッキング依存、v2 challenge の UX 摩擦
- スコア閾値（MODERATE=0.5）の運用判断が難しい

#### 置換後（2026-04〜）

- `src/lib/recaptcha/` 削除
- Supabase Auth 公式の `options.captchaToken` 連携に切替 → dead code 解消
- score 判定不要（Turnstile は success boolean のみ）
- reCAPTCHA 4 env key 削除、Turnstile 1 env key（app）/ 2 env key（web）に簡素化

### 関連ファイル

- `src/lib/turnstile/`（app / web 両方）
- `src/features/auth/components/SignupForm.tsx`（app）
- `src/features/auth/stores/useAuthStore.ts`（app、`captchaToken` option 追加）
- `src/app/api/auth/route.ts`（app、reCAPTCHA 分岐削除）
- `src/app/[locale]/(auth)/client-layout.tsx`（app、`RecaptchaScript` 削除）
- `src/app/[locale]/(marketing)/contact/contact-form.tsx`（web）
- `src/app/api/contact/route.ts`（web、`verifyTurnstile` 挿入）
- `src/platform/config/env.ts`（web、env 追加）
- `src/env.ts`（app、env 置換）
- `.op-env.local.example`（app / web 両方の参照例）
- `Dayopt-Shared/turnstile` item（1Password）

### 今後の拡張余地

- **app の API route 化**: 現状 signup は client-side Supabase 直呼び。将来 server-side で追加の anti-abuse（IP 評価、メールドメイン検査など）を挟むなら `/api/auth/signup` route に統一する。route 側の Turnstile 検証は既に schema 上で受け付け可能な形に残してある
- **Turnstile analytics 活用**: Cloudflare dashboard の challenge 通過率 / 失敗率を週次で確認する運用を確立する
- **ログイン flow への適用**: ブルートフォース対策として login にも Turnstile を追加する余地あり（現状は rate limit のみ）

---

## API Endpoints Overview

Product / Webの`src/app/api/**`配下にある主要REST / Webhook endpoint総覧。tRPC procedureは`/api/trpc/[procedure-path]`に集約され、procedure単位の仕様は各featureの`server/router.ts`を参照すること。

策定日: 2026-04-26、最終照合: 2026-07-21

### 一覧

| App     | Path                       | Method               | 認証                     | Rate Limit                                                        | Runtime                  | 副作用 / 説明                                                                                                  |
| ------- | -------------------------- | -------------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Product | `/api/health`              | GET                  | なし                     | なし                                                              | nodejs                   | DB / Upstash Redisの疎通をcheckし`healthy / degraded / unhealthy`を返す。Productionは`{ status }`だけを公開    |
| Product | `/api/csp-report`          | POST                 | なし                     | IP 20/分 + 全体120/分                                             | nodejs                   | Product originの16 KiB以下のCSP reportだけを検証し、URL queryを除去してSentryへ送信                            |
| Product | `/api/trpc/[trpc]`         | GET / POST           | procedure依存            | procedure依存                                                     | nodejs                   | tRPC procedureのルーティング本体。Contactは認証済み`contact.submit`を使う                                      |
| Product | `/api/beacon/entry-save`   | POST                 | Supabase Auth (Cookie)   | なし                                                              | nodejs                   | `navigator.sendBeacon()`経由のentry緊急保存                                                                    |
| Product | `/api/auth`                | GET / POST           | mixed                    | signin IP+email 各5/15分、signup IP 5/15分、reset IP+email 各3/時 | nodejs                   | Supabase認証管理。通常UIは現在Supabase Authを直接利用                                                          |
| Product | `/api/v1/calendar/[token]` | GET                  | token (URL)              | `icalFeedRateLimit`                                               | nodejs                   | Service Roleで対象userのplansをiCalendar形式へ変換                                                             |
| Product | `/api/webhooks/resend`     | POST                 | Product Resend signature | Redis processing lease                                            | nodejs (maxDuration 30s) | Product contact failureをPIIなしでSentryへ通知し、既存transactional mailのbounce / complaint suppressionも維持 |
| Product | `/api/webhooks/stripe`     | POST                 | Stripe signature         | なし                                                              | nodejs (maxDuration 30s) | subscription stateを反映しtransactional emailを送る                                                            |
| Web     | `/api/compass-docs`        | GET                  | なし                     | なし                                                              | nodejs (maxDuration 30s) | Compass内の公開ドキュメントを検索                                                                              |
| Web     | `/api/contact`             | POST                 | CSRF + Turnstile         | IP + Web全体                                                      | nodejs (maxDuration 30s) | 16 KiB以下のstrict inputをProduction限定でResendへ配送。成功形式は`{ success: true }`                          |
| Web     | `/api/csp-report`          | POST                 | なし                     | IP + Web全体                                                      | nodejs (maxDuration 30s) | Web originのCSP reportを検証・正規化してSentryへ送信                                                           |
| Web     | `/api/search`              | GET                  | なし                     | IP                                                                | nodejs (maxDuration 30s) | build済み検索indexをlocale別に検索                                                                             |
| Web     | `/api/og`                  | GET                  | なし                     | なし                                                              | edge (maxDuration 25s)   | SNS向けOG画像を動的生成                                                                                        |
| Web     | `/api/v1/system/*`         | GET / POST / OPTIONS | なし                     | なし                                                              | nodejs (maxDuration 5s)  | 廃止済みsystem APIを常に404にするretirement boundary                                                           |
| Web     | `/api/webhooks/resend`     | POST                 | Web Resend signature     | Redis processing lease                                            | nodejs (maxDuration 15s) | Web contact failureだけをsource tagで所有判定し、PIIなしでSentryへ通知                                         |

### 共通方針

- **Runtime**: Product endpoint と Web の通常routeは`nodejs`。Web `/api/og`だけは画像生成用の`edge` runtime
- **Timeout**: Web API route 7件は各routeの静的`maxDuration`を正本とし、`vercel.json`のfunctions globは使わない。Default Function TimeoutのDashboard値はdeploy前後に運用確認する
- **エラーログ**: `@/lib/logger` で構造化ログ。webhook / 認証のうち予期しない障害だけをSentryへ一度送信し、認証失敗などの想定内レスポンスはIssue化しない
- **入力バリデーション**: Zod (`@/lib/zod`) を全ハンドラで使用
- **Supabase アクセス**: Productの一般endpointは`@/lib/supabase/server`の`createClient`（Cookieベース、RLS適用）。DB書込が必要なProduct webhookとiCal feedだけ`createServiceRoleClient`を使う。Web contact webhookはDBへ書かない
- **REST 維持の理由**: tRPC を主軸としつつ、以下は REST のままにする:
  - `/api/health`: 単純な GET、外部監視ツール対応
  - `/api/csp-report`: ブラウザが直接 POST する CSP report-uri
  - `/api/beacon/entry-save`: `navigator.sendBeacon()` は tRPC client を使えない
  - `/api/auth`: Supabase Auth と密接、Cookie 設定の都合
  - `/api/v1/calendar/[token]`: 外部カレンダーアプリが直接 GET、tRPC 形式不可
  - Web `/api/contact`: 未認証のmarketing siteから送る公開formであり、CSRF / Turnstile / body上限をroute境界で扱う
  - `/api/webhooks/*`: 外部サービスが直接 POST、レスポンス形式が tRPC と合わない

### 変更ガイドライン

- 新規 endpoint を追加する前に、tRPC procedure で済まないか検討する（`features/*/server/router.ts`）
- REST 維持の理由に該当しない場合は tRPC を採用
- 認証必須の endpoint は Supabase server client + Cookie で `getUser()` 検証、または webhook signature 検証
- 公開requestのrate limit identifierは保存前に不可逆化する。Contact / Auth / CSPはbackend unavailable時にfail-closed、既存tRPC / iCalは定義済みfallbackを維持する
- AuthのIP identifierはVercelが上書きする`X-Real-IP`だけを検証し、`X-Forwarded-For`を解析しない。欠落・不正値は共有`ip:unknown`、signin / resetはIP-firstで独立した正規化email bucketも確認する。この前提はVercel単独topologyに依存する
- 副作用はloggerで技術状態だけを追跡し、問い合わせ本文・氏名・email・raw webhook bodyを記録しない

### 関連ドキュメント

- tRPC procedure 設計: `.claude/skills/trpc-router-creating/SKILL.md`（`trpc-router-creating` skill）
- Supabase Branching 運用: `.claude/skills/supabase/SKILL.md`（`supabase` skill）
- 問い合わせメール運用: `docs/operations/contact-email.md`

---

## Supabase 型自動生成

Supabase CLIを使用して、データベーススキーマからTypeScript型定義を自動生成する。

### コマンド

| コマンド                            | ソース          | 用途                                      |
| ----------------------------------- | --------------- | ----------------------------------------- |
| `npm run types:generate`            | production main | `types:generate:production` の互換 alias  |
| `npm run types:generate:production` | production main | production main から生成                  |
| `npm run types:generate:local`      | Local DB        | ローカルから生成（`supabase start` 必要） |

PR Preview Branch の schema は Supabase integration check で検証する。型生成は production main か local のどちらかを明示して行う。

全コマンドとも `apps/product/src/lib/database/generated/database.types.ts` に出力。

### 使用タイミング

#### 必須

- データベーススキーマを変更した後
- 新しいテーブルを追加した後
- カラムの型を変更した後

#### 推奨

- 定期的（週1回程度）
- 本番環境のスキーマと同期を確認する

### ワークフロー

```bash
# 1. マイグレーション作成
npm run migration:create add_new_table
# マイグレーションファイルを編集

# 2. ローカルで適用確認
npm run db:reset

# 3. 型を再生成
npm run types:generate:local

# 4. 型チェック
npm run typecheck

# 5. コミット
git add apps/product/src/lib/database/generated/database.types.ts
git commit -m "chore(types): supabase型定義を更新"
```

### カスタム型

`apps/product/src/lib/database/generated/database.types.ts` は自動生成ファイル。**直接編集禁止**。

カスタム型が必要な場合は別ファイルに定義:

```typescript
// apps/product/src/lib/database/types.ts
import type { Database } from './generated/database.types';

export type PlanRow = Database['public']['Tables']['plans']['Row'];
export type TagRow = Database['public']['Tables']['tags']['Row'];
```

### トラブルシューティング

| エラー                 | 対処                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `project_id not found` | Supabase プロジェクトの存在を確認                                                            |
| `connection refused`   | ローカル: `supabase start` を実行 / リモート: ネットワーク確認                               |
| 生成された型がおかしい | production main か local のどちらから生成したか確認。local は `supabase db reset` でリセット |

---

## App Routes Overview

`src/app/[locale]/**` 配下の Next.js App Router routing を総覧。Route Group / Composition Layer / 認証境界の関係を一望できるようまとめる。`/api/**` は上記「API Endpoints Overview」を参照。

策定日: 2026-04-26（最終更新: 2026-05-12 に onboarding route group 削除を反映）
スコープ: `src/app/**` 配下の Next.js App Router 全 route。`/api/**` は除外。`(public)` Route Group は現時点で存在しない。

### Route Group 構造

```
src/app/
├── layout.tsx                  ← ルート layout（HTML / theme / font / globals.css）
├── error.tsx, global-error.tsx ← root-level error boundaries
├── not-found.tsx               ← root-level 404
├── sitemap.ts                  ← 多言語 sitemap（app 側の最小公開 URL のみ）
├── opengraph-image.tsx         ← OG image generator (edge runtime)
├── maintenance/route.ts        ← /maintenance（locale プレフィックスなし、Provider バイパス）
├── offline/page.tsx            ← /offline（PWA フォールバック）
├── api/                        ← REST / Webhook（API Endpoints Overview 参照）
└── [locale]/
    ├── layout.tsx              ← locale-scoped HTML lang / dir / metadata
    ├── page.tsx                ← / → /{locale}/week へ redirect
    ├── error.tsx               ← locale-scoped error boundary
    ├── (app)/                  ← 認証必須グループ
    │   ├── layout.tsx          ← IntlProvider + Providers + BaseLayout
    │   ├── error.tsx, not-found.tsx
    │   ├── (workspace)/        ← day / week / [nday]（Review / Diffはquery panel）
    │   ├── settings/
    │   ├── playground/
    │   ├── _providers/         ← Providers ツリー
    │   ├── _shell/             ← Shell layout components
    │   └── _overlays/          ← グローバルダイアログ群
    ├── (auth)/                 ← 認証フロー（login / signup / reset / mfa-verify）
    │   ├── layout.tsx          ← IntlProvider (auth namespace) + AuthClientLayout
    │   ├── loading.tsx
    │   └── auth/{login,signup,password,reset-password,mfa-verify}/page.tsx
    ├── playground/             ← dev playground（locale 直下）
    └── test-email/             ← email template preview
```

### (app) Group: 認証必須ページ

すべて `Supabase Auth` のセッションが前提。`(app)/layout.tsx` で `Providers`（tRPC / TanStack Query / Auth Store / Calendar Settings / Theme）を注入し、`BaseLayout` で sidebar + header を提供する。

#### Layout 系

| Path                  | Type           | 責務                                                                                                                           |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `(app)/layout.tsx`    | layout         | IntlProvider（app namespace のみ）+ Providers + BaseLayout + GlobalOverlays。`metadata.robots: noindex` で認証ページを検索除外 |
| `(app)/error.tsx`     | error boundary | (app) Group 内のページエラーを BaseLayout 内側で表示。i18n 対応、Sentry にも記録                                               |
| `(app)/not-found.tsx` | not-found      | (app) Group 内の 404。BaseLayout 内側で表示し、ナビ崩れを防ぐ                                                                  |

#### (workspace) — メインモード

| Path                                        | Type           | 責務 / 主な合成元                                                                                                    |
| ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `(workspace)/day/page.tsx`                  | page (server)  | `prefetchCalendarData` → `HydrationBoundary` → `CalendarViewClient`（day view）。`generateMetadata` で i18n タイトル |
| `(workspace)/week/page.tsx`                 | page (server)  | week view。同上の prefetch + Suspense streaming                                                                      |
| `(workspace)/[nday]/page.tsx`               | page (server)  | 多日数 view（2day〜9day）。`[nday]` で動的セグメント                                                                 |
| `(workspace)/{day,week,[nday]}/loading.tsx` | loading        | 共通 `CalendarSkeleton` を表示                                                                                       |
| `(workspace)/{day,week,[nday]}/error.tsx`   | error boundary | calendar segment 専用エラー                                                                                          |
| `(workspace)/_composition/`                 | —              | `CalendarViewClient` ほか、各 view の合成 layer                                                                      |
| `(workspace)/_server/`                      | —              | `prefetchCalendarData` / `parseDateParam` / `CalendarSkeleton` 等の server-only ヘルパ                               |

#### settings

| Path                           | Type            | 責務                                                                                |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| `settings/page.tsx`            | page (client)   | settings 一覧。client component、`useAuthStore` + `SETTINGS_CATEGORIES` で nav 表示 |
| `settings/layout.tsx`          | layout (client) | settings 用の slot 構造                                                             |
| `settings/[category]/page.tsx` | page (client)   | カテゴリ別 settings（`SettingsContent` を render）                                  |

#### playground

| Path                           | Type | 責務                                                                      |
| ------------------------------ | ---- | ------------------------------------------------------------------------- |
| `playground/dnd-tags/page.tsx` | page | dnd-kit 検証用の dev playground（production では `noindex` 継承で隠れる） |

### composition layer の使い方

各 mode の `_composition/` には「ページから見た合成 hub」を集める:

- 入力: `params` / `searchParams` / `prefetched data`
- 合成対象: feature barrel (`@/features/calendar`, `@/features/review`, `@/features/timeblock` 等)
- 出力: 1 つの client component ツリー

`page.tsx` 自体は薄く保つ（prefetch + Suspense + 合成 component の呼出）。view の差し替えやデータ取得方式の変更は composition layer 内で完結させる。詳細は `.claude/rules/feature-boundaries.md` の Composition Layer / Composition Hub を参照。

### providers / shell / overlays

| Path                                 | 責務                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `(app)/_providers/Providers.tsx`     | tRPC / TanStack Query / Auth Store / Calendar Settings / Theme などのデータ層 |
| `(app)/_shell/base-layout.tsx`       | sidebar + header + main の UI shell                                           |
| `(app)/_overlays/GlobalOverlays.tsx` | ContactDialog / SettingsDialog / TimeblockInspector / Toasterを集約マウント   |

### Auth 境界の確認

- `(app)` 配下の page で auth check は **proxy（`src/proxy.ts`）に一元化されている**（未認証で protected path → `/auth/login?redirect=`、MFA 未検証なら `/auth/mfa-verify`）。page / layout 単位の auth ガードは持たない
- ページ単体での auth ガードは不要。新規 page を追加するときは `(app)` 配下に置けば自動的に認証必須となる
- 認証スキップしたい page は `(auth)/` に置く（下記参照）

### (auth) Group: 認証フロー

未認証ユーザー向けの login / signup / reset 系ページ。`AuthClientLayout` で軽量な `PublicProviders`（Theme + Tooltip のみ）を注入し、`AuthLayout` で UI を組み立てる。tRPC / TanStack Query などのデータ層は持たない（Supabase Auth Client SDK を直接利用）。

認証済みユーザーが `(auth)` 配下へ来た場合は proxy が `/week` へ流すが、**セッションを持ったまま踏むのが正常系のパスは除外する**（`isAuthPathAllowedWhileAuthenticated`、`src/lib/auth/domain/access-policy.ts`）。対象は `/auth/mfa-verify`（aal2 への昇格）、`/auth/confirm`（メール内リンクの `token_hash` 検証。ログイン中のメールアドレス変更が通る）、`/auth/callback`（OAuth の code 交換）、`/auth/reset-password`（confirm でセッション確立後に着地）。

#### Layout 系

| Path                 | Type            | 責務                                                                                                       |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `(auth)/layout.tsx`  | layout (server) | IntlProvider（`common` / `auth` / `error` namespace のみ）+ `AuthClientLayout`。`metadata.robots: noindex` |
| `(auth)/loading.tsx` | loading         | 認証フロー共通のローディング表示                                                                           |

#### Pages

| Path                                  | Type          | 責務                                                                                                                            |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `(auth)/auth/page.tsx`                | page (server) | `/auth` ルートへの直接アクセス時の入口（リダイレクト or 案内）                                                                  |
| `(auth)/auth/login/page.tsx`          | page (server) | `LoginForm` を中央配置で render                                                                                                 |
| `(auth)/auth/signup/page.tsx`         | page (server) | `SignupForm`                                                                                                                    |
| `(auth)/auth/password/page.tsx`       | page (server) | `PasswordResetForm`（リセットメール送信）                                                                                       |
| `(auth)/auth/reset-password/page.tsx` | page (server) | `ResetPasswordForm`（リセットリンク経由の新パスワード設定）                                                                     |
| `(auth)/auth/mfa-verify/page.tsx`     | page (server) | MFA TOTP コード検証                                                                                                             |
| `(auth)/auth/mfa-verify/layout.tsx`   | layout        | MFA 専用 wrapper                                                                                                                |
| `(auth)/auth/confirm/route.ts`        | route handler | 認証メール内リンクの着地点。`token_hash` + `type` を `verifyOtp` し `next` へ redirect（signup / recovery / email_change 共通） |
| `(auth)/auth/callback/route.ts`       | route handler | OAuth の `code` をセッションへ交換                                                                                              |

### [locale] 直下

locale ルーティングの境界。HTML lang / dir、metadata、redirect を担う。

| Path                                       | Type            | 責務                                                                                          |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| `[locale]/layout.tsx`                      | layout (server) | `<html lang dir>` の確定、`generateMetadata` で多言語 OG / canonical、未対応 locale を 404 に |
| `[locale]/page.tsx`                        | page (server)   | `/{locale}` → `/{locale}/week` redirect。`force-dynamic`                                      |
| `[locale]/error.tsx`                       | error boundary  | locale 全体のエラー（IntlProvider 未マウントケース含む）                                      |
| `[locale]/playground/dnd-multi-container/` | dev             | dnd-kit Multiple Containers の検証用                                                          |
| `[locale]/test-email/`                     | dev             | email template の preview ページ                                                              |

### ルート直下（src/app/）

locale プレフィックスを持たない routing と Next.js metadata route 群。

| Path                   | Type                | 責務                                                                                                                 |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `layout.tsx`           | root layout         | HTML 骨格 / theme provider / font / `globals.css` の読み込み。**この layout は触らない** が原則（影響範囲が全 page） |
| `error.tsx`            | root error boundary | App router の最上位エラー                                                                                            |
| `global-error.tsx`     | global error        | layout も含めた致命エラー時の最終手段（`<html>` から自前で組む）                                                     |
| `not-found.tsx`        | root 404            | 全 path 共通の 404                                                                                                   |
| `sitemap.ts`           | metadata route      | 多言語 sitemap。app 側は SaaS のため公開 URL 最小（マーケは web/ 側）                                                |
| `opengraph-image.tsx`  | metadata route      | edge runtime で動的 OG 画像生成。`@/lib/og-colors` で色固定                                                          |
| `maintenance/route.ts` | route handler       | `/maintenance`。Route Handler で raw HTML を返し、Provider ツリーをバイパスして CSP を回避                           |
| `offline/page.tsx`     | page (client)       | PWA オフラインフォールバック。`navigator.language` で ja/en を切替                                                   |

### 認証境界の全体像

```
未認証 → (auth)            : login / signup / reset / mfa
認証済み → (app)
locale 不正 / path 不在    → [locale]/error.tsx, not-found.tsx, root not-found.tsx
致命エラー                 → global-error.tsx
オフライン (PWA)           → /offline
メンテナンス時             → /maintenance
```

### 関連ドキュメント

- Feature 境界: `.claude/rules/feature-boundaries.md`

---

## パフォーマンス監視の原則

> **平均は見ない。p95だけを見る。**

### なぜp95か

- ユーザー体験は「一部の遅い人」で評価される
- BtoCでは「たまに遅い」が致命傷
- 平均値は問題を隠す

| 指標    | 役割                       |
| ------- | -------------------------- |
| **p95** | 体感品質・改善対象         |
| **p99** | 障害・事故の早期検知       |
| 平均    | 参考値（判断には使わない） |

### 速度指標

#### フロント（最優先）

ユーザーが「遅い」と感じる正体。

| 指標    | 意味                         | 基準（p95） |
| ------- | ---------------------------- | ----------- |
| **LCP** | 画面が表示されたと感じるまで | ≤ 2.5s      |
| **INP** | 操作に反応するまで           | ≤ 200ms     |
| **CLS** | レイアウトのズレ             | < 0.1       |

#### API

| 指標        | 基準（p95）  |
| ----------- | ------------ |
| API latency | ≤ 300ms      |
| 初期表示API | 最優先で監視 |

#### DB

| 指標           | 基準（p95） |
| -------------- | ----------- |
| クエリ実行時間 | ≤ 100ms     |

### 安定性指標

安定性 = 「失敗しても安心できること」

| 指標               | 基準          |
| ------------------ | ------------- |
| 主要導線エラー率   | < 0.1%        |
| タイムアウト率     | p95/p99で監視 |
| 同一エラーの再発率 | 月次チェック  |

**注意**: 全体エラー率ではなく、ログイン後・保存・課金など"致命導線"だけを見る。

### 最小SLO（目標値）

| 項目                     | 目標              |
| ------------------------ | ----------------- |
| ログイン後トップ LCP p95 | ≤ 3.0s            |
| 主要API latency p95      | ≤ 300ms           |
| 主要導線エラー率         | < 0.1%（増加NG）  |
| p95悪化時                | **改善Issue必須** |

### 行動ルール

数字は「合否」ではなく「行動トリガー」。

| 状況      | アクション             |
| --------- | ---------------------- |
| p95が悪化 | 改善Issueを必ず1つ作る |
| p95が良化 | 正解パターンとして記録 |

#### やってはいけないこと

- 数字だけ下げて満足
- 体感が変わらない最適化
- 最大値（p100）を追いかける

### React最適化クイックリファレンス

| パターン      | 使うとき             |
| ------------- | -------------------- |
| `useMemo`     | 高コストな計算       |
| `useCallback` | 子に渡すコールバック |
| `React.memo`  | 重いコンポーネント   |

**最適化が不要なケース**:

- 単純なコンポーネント（メモ化のオーバーヘッドの方が大きい）
- propsが毎回変わる場合
- 再レンダリングが問題になっていない場合

監視・計測の運用は `docs/operations/monitoring.md` を参照。

Next.js のビルド時最適化（PPR、prefetch、bundle 最適化等）は [`conventions-frontend.md`](./conventions-frontend.md) の「Next.js パフォーマンス最適化」セクションを参照。

---

## 開発コマンド一覧

Dayoptプロジェクトで使用可能な全npmコマンドのリファレンス。

### 基本開発コマンド（頻出）

```bash
pnpm dev                    # 1Password 経由で開発サーバー起動
npm run typecheck           # 型チェック
npm run lint                # コード品質チェック
npm run lint:boundaries     # feature境界チェック
npm run test:run            # ユニットテスト実行
npm run check               # typecheck + lint + test:run（一括）
```

> **Secrets**: 実値は `.env.local` に置かず、1Password master と `.op-env.local` の `op://` 参照を `pnpm dev` で注入する。`pnpm dev` は通常 Supabase local を参照する。素の起動が必要な一時作業だけ `pnpm dev:raw`、`.op-env.local` の Supabase refs をそのまま使う時だけ `DAYOPT_SUPABASE_TARGET=op pnpm dev` を使う。詳細は `docs/operations/secrets.md`。
> 開発サーバー（`pnpm dev`, `npm run storybook`）の起動・停止はユーザー責務。

### 全コマンド一覧

#### 開発サーバー

```bash
pnpm dev                    # .op-env.local + op run 経由で next dev
pnpm dev:raw                # 素の next dev（一時作業用）
npm run storybook           # Storybook（ポート6006）
```

#### ビルド

```bash
npm run build               # next build
npm run build-storybook     # Storybook ビルド
npm run bundle:analyze      # バンドル解析付きビルド
```

#### コード品質

```bash
npm run lint                # ESLint（--max-warnings 0）
npm run lint:fix            # ESLint 自動修正
npm run lint:boundaries     # feature間の直接importを検出
npm run lint:boundaries:update  # 許可リスト更新
npm run lint:tokens         # Tailwindセマンティックトークンチェック
npm run typecheck           # tsc --noEmit
npm run format              # Prettier フォーマット
npm run format:check        # Prettier チェックのみ
```

#### テスト

```bash
npm run test                # Vitest（watchモード）
npm run test:run            # Vitest（1回実行）
npm run test:unit           # ユニットテスト
npm run test:watch          # ウォッチモード
npm run test:ui             # Vitest UI
npm run test:coverage       # カバレッジ付き実行
npm run test:coverage:summary  # カバレッジサマリー表示
npm run test:diff-coverage  # 差分カバレッジ
npm run test-storybook      # Storybook テスト
npm run test:integration    # 統合テスト
npm run test:e2e            # Playwright E2Eテスト
npm run test:e2e:smoke      # E2Eスモークテスト
npm run test:e2e:critical   # E2Eクリティカルパス
npm run test:e2e:ui         # Playwright UIモード
npm run test:e2e:headed     # ブラウザ表示付きE2E
```

#### Supabase / DB

```bash
npm run db:reset            # ローカルDB リセット
npm run db:reset-linked:unsafe # 手動リンク先をリセット（緊急時のみ）
npm run db:seed             # 開発データ投入
npm run db:fresh            # リセット + シード
npm run migration:create    # マイグレーション作成
npm run migration:list      # マイグレーション一覧
npm run migration:status    # DB差分確認
npm run types:generate          # Supabase production main から apps/product/src/lib/database に型生成
npm run types:generate:production # production main から apps/product/src/lib/database に型生成
npm run types:generate:local    # ローカルから apps/product/src/lib/database に型生成
```

#### 環境変数

```bash
pnpm env:check           # secret 値を表示せず env の存在確認
pnpm secrets:check       # tracked files と untracked .env* の literal secret 検出
pnpm 1password:check     # 1Password schema の vault/item/field 存在確認
pnpm vercel:env          # Vercel 環境変数一覧
pnpm vercel:env:pull:unsafe  # apps/product/.env.local に一時同期
```

#### i18n

```bash
npm run i18n:check          # 翻訳キーの整合性チェック
npm run i18n:unused         # 未使用の翻訳キーを検出
```

#### セキュリティ・ライセンス

```bash
npm run license:check       # ライセンスチェック
npm run license:audit       # ライセンスサマリー
npm run license:report      # ライセンスCSVレポート
npm run security:audit      # npm audit（production）
npm run security:check      # npm audit（moderate以上）
npm run security:full       # audit + typecheck + lint
npm run security:audit:actions  # GitHub Actions監査
```

#### パフォーマンス

```bash
npm run size                # バンドルサイズチェック
npm run size:why            # バンドルサイズ分析
npm run perf:lighthouse     # Lighthouse CI
npm run deps:circular       # 循環依存検出
npm run deps:outdated       # 古いパッケージ一覧
```

#### ドキュメント

```bash
npm run docs:check          # コード-ドキュメント整合性
npm run docs:validate       # リンク + ルール検証
```

#### Sentry

```bash
pnpm --filter @dayopt/product exec vitest --project unit run src/app/api/csp-report/__tests__/route.test.ts
pnpm --filter @dayopt/product exec vitest --project unit run src/lib/sentry/__tests__/scrub-pii.test.ts
```

runtimeとsource map uploadはVercel Productionだけで有効にする。CI / Preview buildではSentry credentialsを渡さない。Production smokeは恒久scriptにせず、対象projectと一時endpointの撤去条件を決めてから実施する。

#### Git ログ

```bash
npm run log:feat            # feat: コミットのみ表示
npm run log:fix             # fix: コミットのみ表示
npm run log:type            # 型別コミット一覧（最新20件）
```

### pre-commit フック（自動実行）

コミット時に以下が自動で実行される:

1. **lint-staged**: ステージされた `.ts/.tsx` に prettier + eslint
2. **typecheck**: `.ts/.tsx` ファイルが含まれる場合のみ `tsc --noEmit`
3. **license:check**: `package.json` 変更時のみライセンスチェック

---

## マイグレーション & リリース チェックリスト

### 運用モデル

Dayopt の標準ルートは `local → PR Preview → production`。

- **Supabase project**: `dayopt`
- **Project ref**: `yvglwblxrnrenfifsnje`
- **Local**: `supabase start` と `pnpm dev` (`op run`) を使う
- **PR Preview**: PR ごとの Supabase Preview Branch と Vercel Preview を使う
- **Production**: `main` merge 後だけ Supabase main と Vercel Production に反映する

| 環境           | Supabase                          | Vercel                         | 用途                         |
| -------------- | --------------------------------- | ------------------------------ | ---------------------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                     | 手元の開発                   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview URL (`product`) | migration / 機能の本番前検証 |
| **Production** | `dayopt` main                     | Production deployment          | 実ユーザー                   |

persistent staging は標準ルートでは使わない。固定 URL が必要な Stripe / OAuth / closed beta 検証が発生した時だけ、Vercel staging と Supabase persistent branch を追加する。

### Integration Setup

Supabase Dashboard で `dayopt` project に GitHub integration を接続する。

- Repository: `Dayopt/dayopt`
- Working directory: `.`
- Production branch: `main`
- Automatic branching: enabled
- Deploy to production: enabled
- Preview Branch seed: `supabase/seed.sql`

Supabase Vercel integration は `product` Vercel project のみに接続する。`web` は今回の Supabase Preview Branch 切替対象外。

GitHub branch protection では Supabase integration の required check を有効化する。これにより、Preview Branch への migration 適用が失敗した PR は merge できない。

### リリースフロー全体像

```txt
feature branch → PR open
                  ├── Supabase: Preview Branch 作成 + migration 適用 + seed
                  └── Vercel: product Preview が Preview Branch env を参照

PR review → checks pass → main merge
                  ├── Supabase: main/production に migration 適用
                  └── Vercel: product Production deploy
```

Vercel Preview は production Supabase DB を参照しない。PR close / merge 後の Preview Branch は Supabase 側で削除または停止される。

### マイグレーション手順

#### 1. 作成

```bash
npm run migration:create <migration_name>
# supabase/migrations/YYYYMMDDHHMMSS_<migration_name>.sql を編集
```

#### 2. ローカル検証

```bash
supabase start
npm run db:reset
npm run db:seed
pnpm dev
```

#### 3. PR Preview 検証

PR を作成すると Supabase GitHub integration が Preview Branch を作成し、`supabase/migrations/**` を適用する。Vercel integration が `product` の Preview deployment に対応する Supabase env vars を注入する。

確認すること:

- Supabase PR check が green
- Vercel Preview が production DB ではなく Preview Branch を参照している
- migration に依存する機能が Preview URL で動く
- seed data だけで動作確認でき、本番データを必要としない

#### 4. Production 適用

`main` merge 後、Supabase GitHub integration が production に migration を適用する。GitHub Actions から `supabase db push` は実行しない。

### Emergency Runbook

通常運用では手動 `supabase db push` を使わない。Supabase integration 障害などで緊急対応が必要な場合だけ、Production の 1Password secret を使い、作業ログに理由を残して実行する。

`main` branch が `MIGRATIONS_FAILED` を示している場合は、先に失敗状態が production migration path の実体か、Preview Branch 側の古い状態かを確認する。production schema に未適用 migration があるまま launch-blocker の security migration を merge すると、Git 上では修正済みでも本番 DB へ反映されない。

確認すること:

- Supabase dashboard の production deployment / branch log に失敗した migration 名と SQL error が残っている
- production DB の `supabase_migrations.schema_migrations` 最新 version が repo の `supabase/migrations/` と一致している
- 不一致がある場合、未適用 migration を列挙して作業ログに残している
- 手動適用が必要な場合、`--dry-run` で適用対象 migration を確認し、対象 SQL の destructive change / backfill / lock risk と backup / PITR の状態を確認している

```bash
supabase link --project-ref yvglwblxrnrenfifsnje
supabase db push --dry-run
supabase db push
```

手動適用後は migration history を再確認し、Supabase branch status が解消されたか、または production path に影響しない非 authoritative な preview 状態だったことを作業ログに残す。

### マイグレーション統合時の注意

- [ ] RLS が有効で、`auth.uid() = user_id` の境界が維持されている
- [ ] 新規 table / view / RPC は `GRANT` を明示し、`RLS + policy + GRANT` を 1 セットでレビューしている
- [ ] `authenticated` への Data API 権限は必要最小限にしている
- [ ] `anon` への権限付与は公開読み取りなど明示理由がある場合だけに限定している
- [ ] service-role 専用 table / RPC は browser client から使えないことを RLS / GRANT の両方で確認している
- [ ] Realtime が必要な table だけ `supabase_realtime` publication に入っている
- [ ] `IF NOT EXISTS` / `IF EXISTS` で冪等化している
- [ ] ローカルで `db:reset` が通る
- [ ] `pnpm rls:snapshot` を再生成し、RLS / GRANT / Realtime publication の差分を確認している
- [ ] Supabase Preview Branch check が green
- [ ] Production 適用前に Vercel Preview で主要導線を確認した

### GRANT / Realtime 監査

Supabase Data API / GraphQL API から新規 `public` object を使う時は、RLS だけでなく
`GRANT` が必要になる。migration review では以下を確認する。

- table: user data は `authenticated` に必要な `SELECT` / `INSERT` / `UPDATE` / `DELETE` だけを付与する
- view: `security_invoker = true` を使い、必要な role に `SELECT` を明示する
- RPC: app-facing 関数は `authenticated`、service-role 専用関数は `service_role` / platform role に限定する
- public read が必要な object 以外は `anon` に付与しない
- `CREATE OR REPLACE FUNCTION` は既存権限を保持しうるため、意図する `GRANT` / `REVOKE` を migration 内に明示する

権限と Realtime publication は snapshot に含める。migration 変更後は local DB に適用してから再生成する。

```bash
pnpm rls:snapshot
pnpm rls:snapshot:check
```

Realtime publication の手動確認 SQL:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;
```

2026-07-08 時点の期待値は production / local ともに空。アプリコード側にも `postgres_changes`
購読はない。Realtime を再導入する時は、購読する table、必要な RLS policy、publication 追加理由を
同じ PR に残す。

### スキーマ変更を含むリリースの順序

| 変更種別         | 順序の原則                                   |
| ---------------- | -------------------------------------------- |
| 新カラム追加     | 先に DB、後にアプリ（デフォルト値必須）      |
| カラム削除       | 先にアプリ（参照除去）、後に DB              |
| 型変更           | 2 段階（新カラム追加 → backfill → 旧削除）   |
| NOT NULL 追加    | 先に backfill で全行埋める → 制約追加        |
| RLS ポリシー変更 | 新ポリシー追加 → アプリ更新 → 旧ポリシー削除 |

### 関連

- skill: `.agents/skills/supabase/SKILL.md`
- secrets: `docs/operations/secrets.md`

---

## DB Migration Rollback 手順書

本番デプロイ事故時の逆マイグレーションSQL集。Supabaseはネイティブのrollback機構を持たないため、**逆SQLを新しいマイグレーションとして適用する**方式で対応する。

> **対象**: `supabase/migrations/` 配下の全17マイグレーション（baseline除く）

### 緊急対応フローチャート

```
1. 障害検知
   ↓
2. メンテナンスモード有効化
   NEXT_PUBLIC_MAINTENANCE_MODE=true を Vercel で設定
   ↓
3. 影響範囲特定
   どのマイグレーションが原因か特定する
   ↓
4. バックアップ取得
   該当テーブルの事前バックアップSQLを実行（下記参照）
   ↓
5. pg_cron ジョブ停止（Vault/Edge Function関連の場合）
   SELECT cron.unschedule('ジョブ名');
   ↓
6. ロールバックSQL実行
   Supabase Dashboard > SQL Editor で実行
   ※ 依存関係に注意: 新しいものから逆順に適用
   ↓
7. マイグレーション履歴更新
   DELETE FROM supabase_migrations.schema_migrations
   WHERE version = 'ロールバックしたバージョン';
   ↓
8. アプリ動作確認
   Staging で確認後、メンテナンスモード解除
```

### カテゴリ別ロールバック方針

| 操作                        | ロールバック方法              | データ損失   |
| --------------------------- | ----------------------------- | ------------ |
| CREATE TABLE                | DROP TABLE                    | あり         |
| ALTER TABLE ADD COLUMN      | ALTER TABLE DROP COLUMN       | あり         |
| CREATE INDEX                | DROP INDEX                    | なし         |
| CREATE EXTENSION            | DROP EXTENSION                | なし（通常） |
| CREATE FUNCTION             | DROP FUNCTION                 | なし         |
| CREATE OR REPLACE FUNCTION  | 旧版で CREATE OR REPLACE      | なし         |
| DROP POLICY + CREATE POLICY | 旧ポリシーで DROP + CREATE    | なし         |
| GRANT/REVOKE                | 逆の REVOKE/GRANT             | なし         |
| ALTER TABLE ADD CONSTRAINT  | ALTER TABLE DROP CONSTRAINT   | なし         |
| Data migration (UPDATE)     | **不可逆** — バックアップ必須 | —            |

### 各マイグレーションの逆SQL

> **注意（2026-07-13）**: 以下の `entries` を対象にした逆SQLは当時の履歴であり、Step 9b で `entries` を削除した現在の schema には直接適用しない。Step 9b より前へ戻す必要がある場合は、個別の逆SQLではなく backup / PITR と time-model migration の再適用で復旧する。

#### 1. `20260317022728_fix_security_definer_idor.sql`

| 項目       | 値                                                     |
| ---------- | ------------------------------------------------------ |
| 内容       | SECURITY DEFINER関数にauth.uid()チェック追加（13関数） |
| リスク     | LOW                                                    |
| データ損失 | なし                                                   |

> **ロールバック非推奨**: セキュリティ修正。ロールバックするとIDOR脆弱性が復活する。

逆SQL: `00000000000000_baseline.sql` から元の関数定義を取り出し `CREATE OR REPLACE` で上書き。auth.uid()チェックを含まない版に戻す。

#### 2. `20260317040426_add_entry_time_overlap_constraint.sql`

| 項目       | 値                             |
| ---------- | ------------------------------ |
| 内容       | btree_gist拡張 + EXCLUSION制約 |
| リスク     | LOW                            |
| データ損失 | なし                           |

```sql
-- ロールバック
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_no_time_overlap;
-- btree_gist は他で使用していなければ削除可:
-- DROP EXTENSION IF EXISTS btree_gist;
```

#### 3. `20260317040428_add_reminder_idempotency.sql`

| 項目       | 値                               |
| ---------- | -------------------------------- |
| 内容       | notifications UNIQUEインデックス |
| リスク     | LOW                              |
| データ損失 | なし                             |

```sql
DROP INDEX IF EXISTS public.idx_notifications_entry_type_unique;
```

#### 4. `20260317100000_add_ical_feed_token.sql`

| 項目       | 値                                      |
| ---------- | --------------------------------------- |
| 内容       | user_settings に ical_feed_token カラム |
| リスク     | MEDIUM                                  |
| データ損失 | あり（iCalフィードURL無効化）           |

```sql
-- 事前バックアップ
CREATE TABLE _backup_user_settings_ical AS
SELECT user_id, ical_feed_token FROM user_settings
WHERE ical_feed_token IS NOT NULL;

-- ロールバック
DROP INDEX IF EXISTS idx_user_settings_ical_feed_token;
ALTER TABLE user_settings DROP COLUMN IF EXISTS ical_feed_token;
```

復旧: ユーザーが設定画面からトークンを再生成する必要あり。

#### 5. `20260317120000_add_stripe_billing_columns.sql`

| 項目       | 値                                                                   |
| ---------- | -------------------------------------------------------------------- |
| 内容       | profiles に stripe_customer_id, subscription_status, subscription_id |
| リスク     | **HIGH**                                                             |
| データ損失 | あり（課金データ消失）                                               |

```sql
-- 事前バックアップ（必須）
CREATE TABLE _backup_profiles_billing AS
SELECT id, stripe_customer_id, subscription_status, subscription_id
FROM profiles
WHERE stripe_customer_id IS NOT NULL;

-- ロールバック
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_subscription_status;
DROP INDEX IF EXISTS idx_profiles_stripe_customer_id;
ALTER TABLE profiles
  DROP COLUMN IF EXISTS subscription_id,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS stripe_customer_id;
```

復旧: `_backup_profiles_billing` からカラム再追加 + INSERT で復元。

#### 6. `20260318083030_optimize_tag_sort_and_rls.sql`

| 項目       | 値                                        |
| ---------- | ----------------------------------------- |
| 内容       | increment_tag_sort_orders関数 + RLS最適化 |
| リスク     | LOW                                       |
| データ損失 | なし                                      |

```sql
DROP FUNCTION IF EXISTS public.increment_tag_sort_orders(UUID);

-- reflections RLS（bare auth.uid() 版に戻す）
DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
CREATE POLICY "Users can view own reflections" ON public.reflections
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own reflections" ON public.reflections;
CREATE POLICY "Users can create own reflections" ON public.reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own reflections" ON public.reflections;
CREATE POLICY "Users can update own reflections" ON public.reflections
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own reflections" ON public.reflections;
CREATE POLICY "Users can delete own reflections" ON public.reflections
  FOR DELETE USING (auth.uid() = user_id);

-- notification_preferences INSERT
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
```

#### 8. `20260318090000_create_get_time_by_tag_function.sql`

| 項目       | 値                  |
| ---------- | ------------------- |
| 内容       | get_time_by_tag関数 |
| リスク     | LOW                 |
| データ損失 | なし                |

```sql
DROP FUNCTION IF EXISTS public.get_time_by_tag(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
```

#### 9. `20260318091249_create_email_suppressions.sql`

| 項目       | 値                          |
| ---------- | --------------------------- |
| 内容       | email_suppressions テーブル |
| リスク     | MEDIUM                      |
| データ損失 | あり（バウンス記録消失）    |

```sql
-- 事前バックアップ
CREATE TABLE _backup_email_suppressions AS SELECT * FROM email_suppressions;

-- ロールバック
DROP TABLE IF EXISTS public.email_suppressions CASCADE;
```

#### 10. `20260318120000_create_stats_kpi_functions.sql`

| 項目       | 値                                       |
| ---------- | ---------------------------------------- |
| 内容       | KPI関数7つ                               |
| リスク     | LOW                                      |
| データ損失 | なし                                     |
| 依存       | **先に #11, #12 をロールバックすること** |

```sql
DROP FUNCTION IF EXISTS public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_estimation_accuracy(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_context_switches(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_blank_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_energy_map(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_cumulative_time(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_fulfillment(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
```

#### 11. `20260318130000_fix_stats_context_switches_and_energy_map.sql`

| 項目       | 値                                                  |
| ---------- | --------------------------------------------------- |
| 内容       | KPI関数のauth.uid()チェック + TZ対応 + REVOKE/GRANT |
| リスク     | LOW                                                 |
| データ損失 | なし                                                |

> **ロールバック非推奨**: auth.uid()チェック（セキュリティ修正）を含む。

逆SQL: `20260318120000` の関数定義で `CREATE OR REPLACE`（auth.uid()チェックなし版）+ PUBLIC への GRANT 復元。

```sql
-- REVOKE authenticated + GRANT PUBLIC に戻す（セキュリティ低下）
REVOKE ALL ON FUNCTION public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO PUBLIC;
-- 他6関数も同様...

-- + 20260318120000 の関数定義で CREATE OR REPLACE（auth.uid()チェックなし）

-- 旧 get_energy_map(UUID, DATE, DATE) overload を復元する場合:
-- 20260317022728 の get_energy_map 定義を参照
```

#### 12. `20260318140000_create_stats_kpi_summary.sql`

| 項目       | 値                            |
| ---------- | ----------------------------- |
| 内容       | get_stats_kpi_summary統合関数 |
| リスク     | LOW                           |
| データ損失 | なし                          |

```sql
REVOKE ALL ON FUNCTION public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
```

#### 13. `20260318150000_add_entries_soft_delete.sql`

| 項目       | 値                                            |
| ---------- | --------------------------------------------- |
| 内容       | entries に deleted_at カラム + SELECT RLS更新 |
| リスク     | **HIGH**                                      |
| データ損失 | あり（ソフトデリート区別が消失）              |
| 依存       | **先に #17 をロールバックすること**           |

```sql
-- 事前バックアップ（必須）
CREATE TABLE _backup_entries_soft_deleted AS
SELECT id, user_id, title, deleted_at FROM entries WHERE deleted_at IS NOT NULL;

-- ロールバック
DROP POLICY "Users can view own plans" ON public.entries;
CREATE POLICY "Users can view own plans" ON public.entries
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP INDEX IF EXISTS idx_entries_deleted_at;
ALTER TABLE public.entries DROP COLUMN IF EXISTS deleted_at;
```

復旧: ロールバック後、ソフトデリート済みデータはHARD DELETEされた状態になる。`_backup_entries_soft_deleted` から復元するには、deleted_at カラムを再追加して UPDATE する。

#### 14. `20260319000000_enable_vault.sql`

| 項目       | 値                                |
| ---------- | --------------------------------- |
| 内容       | supabase_vault拡張                |
| リスク     | **HIGH**                          |
| データ損失 | あり（Vault内シークレット全消失） |

> **ロールバック非推奨**: pg_cronジョブ、Edge Function呼び出しが全て停止する。

```sql
-- CASCADE: 依存する関数 (get_vault_secret, vault_secret_exists, invoke_edge_function) も削除される
DROP EXTENSION IF EXISTS supabase_vault CASCADE;
```

#### 15. `20260319000001_vault_helper_functions.sql`

| 項目       | 値                                    |
| ---------- | ------------------------------------- |
| 内容       | get_vault_secret, vault_secret_exists |
| リスク     | MEDIUM                                |
| データ損失 | なし                                  |
| 依存       | **先に #16 をロールバックすること**   |

```sql
DROP FUNCTION IF EXISTS public.vault_secret_exists(TEXT);
DROP FUNCTION IF EXISTS public.get_vault_secret(TEXT);
```

#### 16. `20260319000003_vault_invoke_edge_function.sql`

| 項目       | 値                       |
| ---------- | ------------------------ |
| 内容       | invoke_edge_function関数 |
| リスク     | MEDIUM                   |
| データ損失 | なし                     |

```sql
-- 事前: cronジョブを確認・停止
-- SELECT * FROM cron.job WHERE command LIKE '%invoke_edge_function%';
-- SELECT cron.unschedule('check-reminders');

DROP FUNCTION IF EXISTS public.invoke_edge_function(TEXT, JSONB);
```

#### 17. `20260319083000_rls_audit_fixes.sql`

| 項目       | 値                                               |
| ---------- | ------------------------------------------------ |
| 内容       | storage UPDATEポリシー + soft-deleteフィルタ追加 |
| リスク     | LOW                                              |
| データ損失 | なし                                             |

```sql
-- storage ポリシー削除
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;

-- entry_tags SELECT（soft-deleteフィルタなし版に戻す）
DROP POLICY IF EXISTS "Users can view own plan_tags" ON public.entry_tags;
CREATE POLICY "Users can view own plan_tags" ON public.entry_tags
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

```

#### 18. `20260319090000_create_stripe_webhook_events.sql`

| 項目       | 値                             |
| ---------- | ------------------------------ |
| 内容       | stripe_webhook_events テーブル |
| リスク     | LOW                            |
| データ損失 | あり（冪等性ログ消失、実害低） |

```sql
DROP TABLE IF EXISTS public.stripe_webhook_events CASCADE;
```

### ロールバック依存関係

逆順で適用すること。特に重要な依存チェーン:

```
#17 → #13 (soft_delete)     ← #17が13のdeleted_atカラムに依存
#16 → #15 → #14 (vault)     ← invoke_edge_function → helpers → extension
#12 → #11 → #10 (stats)     ← summary → fix → kpi_functions
```

**安全なロールバック順序**（最新から）:

```
18 → 17 → 16 → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1
```

### 共通チェックリスト

#### ロールバック前

- [ ] メンテナンスモード有効化（`NEXT_PUBLIC_MAINTENANCE_MODE=true`）
- [ ] 該当テーブルのバックアップSQL実行
- [ ] pg_cronジョブ停止（Vault関連の場合）
- [ ] Stripeの受信Webhook一時停止（課金関連の場合）
- [ ] 影響を受けるtRPCルーターの確認

#### ロールバック後

- [ ] `supabase_migrations.schema_migrations` から該当レコード削除
- [ ] Staging環境で動作確認
- [ ] メンテナンスモード解除
- [ ] アプリの主要機能（ログイン、予定/記録の作成、カレンダー表示）の手動確認

#### マイグレーション履歴の更新

```sql
-- ロールバックしたマイグレーションを履歴から削除
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260319090000';  -- 該当バージョンに置き換え
```

### リスクサマリー

| リスク     | マイグレーション                                                                   |
| ---------- | ---------------------------------------------------------------------------------- |
| **HIGH**   | #5 (stripe billing), #13 (soft delete), #14 (vault)                                |
| **MEDIUM** | #4 (ical token), #9 (email suppressions), #15 (vault helpers), #16 (edge function) |
| **LOW**    | #1-3, #6, #8, #10-12, #17-18                                                       |
| **非推奨** | #1 (IDOR fix), #11 (auth.uid() check), #14 (vault extension)                       |
