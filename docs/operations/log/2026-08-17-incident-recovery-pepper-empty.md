---
status: frozen
date: 2026-08-17
last_verified: 2026-08-17
issue: 2115
---

# Production RECOVERY_CODE_PEPPER の空文字放置

2026-08-17、#2082（1Password vault 再編の再トリアージ）の運転中に、production の `RECOVERY_CODE_PEPPER` が**空文字**であることを検出した。`apps/product/src/lib/auth/recovery-codes.ts` は pepper が falsy なら throw する設計のため、recovery code の生成・検証は検出時点まで production で機能死していた。recovery code 機能が未使用だったため実害は顕在化しなかった。

---

## 起きた事実

- 手作業レーン（Sonnet + User）が 1Password `human/app` の `RECOVERY_CODE_PEPPER` field を実測したところ、値の長さが 23（`safe-dummy-` 相当の prefix 21 文字 + 空文字）で、空と判定された。
- 指揮台が独立 3 手段で再検証した（2026-08-16T23:55:55Z、#2082 コメント参照）:
  1. **build gate**: `apps/product/production-build-gate.mjs` の `REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV`（production 必須リスト）に `RECOVERY_CODE_PEPPER` が入っておらず、空値でも production build が素通りする構造だった。Preview 側の必須リストには元から入っていた（production だけの片手落ち）。
  2. **runtime**: Vercel runtime errors 7 日分・Sentry 90 日検索のいずれにも pepper 由来の throw が無く、recovery code 機能は production で未使用と判定した。
  3. **metadata**: 当該 env は 2026-07-08 に production / preview へ**同時更新**されていた（値は非取得。存在確認のみ）。
- `apps/product/src/env.ts` の Zod schema には `NODE_ENV === 'production' && !data.RECOVERY_CODE_PEPPER` を拒否する refine が既に存在した。ただしこの検証は `env` Proxy の**初回プロパティアクセス時にのみ**評価される遅延実行で、recovery code 機能が呼ばれない限り発火しない。build gate（deploy 前）と違い、未使用パスに依存した検知だった。
- 旧 pepper の値は 1Password のどこにも保存されていなかった（本作業の出発点）。仮に既存の recovery code が DB に保存されていても、旧 pepper が失われているため復元不能と判定した。

## 影響範囲

- 検出時点までの機能死の期間は 2026-07-08（env が空文字へ更新されたと推定される時点）から 2026-08-17（検出）まで、約 40 日間。
- recovery code 機能はこの期間、生成・検証のいずれも `RecoveryCodePepperMissingError` 相当の throw で失敗していたはずだが、Sentry / runtime error のいずれにも記録が無いことから、この期間中に実際に使われたリクエストは無かったと判定した。
- 既存ユーザーが発行済みの recovery code がもし存在していても、この期間以降は検証不能だった。ただし旧 pepper 自体が回収不能なため、空文字を修正しても既存 recovery code は復元されない。

## 対応

- **新 pepper の生成・設定**（#2082、User 裁可済み）: 1Password `human/app` の `RECOVERY_CODE_PEPPER` field に generator で新値を生成し、Vercel Production replica へ設定した。値は AI を経由しない。
- **build gate への追加**（本 PR、#2115）: `RECOVERY_CODE_PEPPER` を `REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV` へ追加し、以後 production build が空値を通さないようにした。空文字・欠落のどちらも `production-build-gate.test.mjs` で固定した。
- **7-08 更新の原因調査**: 下記「原因調査」を参照。
- **class としての機械検出**: #2104 で env の placeholder / 空値が健全判定をすり抜ける class 全般への対応を別途進める。本件はその実例として #2104 へ申し送った。

## 原因調査（2026-07-08 更新の推定原因）

`docs/operations/log/2026-07-08-vercel-predeploy-security-audit.md`（[PR #1548](https://github.com/Dayopt/dayopt/pull/1548)）の監査作業で、「Vercel CLI API で production / preview の server-only secret 12 件を `sensitive` に更新した」という手動操作が記録されている。この操作は:

- 日付が一致する（2026-07-08）。
- production と preview の**両方**を対象にした一括操作で、今回検出した「production/preview 同時更新」という Vercel env metadata の実測（timestamp のみ、値は非取得）と整合する。
- script としてリポジトリにコミットされておらず、手動の Vercel CLI/API 呼び出しとして記録されている（PR #1548 の diff は docs のみで、操作用 script を含まない）。
- Vercel の env API は `encrypted` type の値を GET で返さない（`type` / `target` のみ）。type を `sensitive` へ変更する PATCH 操作を「値を読んで書き戻す」形で自動化していた場合、GET が値を返さないことに気づかず空値で PATCH した可能性がある。

**結論: 確度の高い推定であり、確定ではない。** 当時の具体的なコマンド・script が repo に残っていないため、実際の呼び出し内容までは特定できなかった。1Password 側にも当時の値は保存されていないため、これ以上の遡及調査はできない。

### 再発防止への反映

同型の操作リスク（値を読めない env の type/target を書き換える一括操作で、意図せず値を空上書きする）は、今後同種の一括操作を行う際の一般的な注意点として認識する。個々の script 化はしない — 手動の Vercel CLI/API 操作は頻度が低く、専用の safety net を維持するコストに見合わない。次に同様の一括操作を行う際は、対象 env が `sensitive` / `encrypted` のいずれであっても値を読めないことを前提に、**type/target の変更と値の再設定は必ず分離する**（値を触らない操作であることを確認してから実行する）。

## #1924（Turnstile）との同型性

[#1924](https://github.com/Dayopt/dayopt/issues/1924) は `NEXT_PUBLIC_TURNSTILE_SITE_KEY` の欠落が build gate をすり抜け、`|| ''` フォールバックで production build 自体は通ったが captcha widget が描画されず login/signup/password reset が全滅した事故。本件と共通するのは:

- **値の欠落・空文字が build gate の必須リストに入っておらず、デプロイ前に止まらなかった**点。
- **実際にエンドユーザー影響が出るまで、または偶然の監査で気づくまで検知手段が無かった**点（Turnstile は全ユーザー影響で即座に顕在化したが、recovery code は機能自体が未使用だったため約 40 日間気づかれなかった）。

差分は、Turnstile は「フォールバック値で build は通るが機能が壊れる」型、recovery code は「throw する設計のため機能は正しく壊れるが、その機能が呼ばれるまで誰も気づかない」型である点。後者は #2104 が扱う「env 値の健全性チェックが健全判定をすり抜ける class」により近い。

## 関連

- GitHub Issue #2115, #2104, #2082, #1924
- `apps/product/production-build-gate.mjs`
- `apps/product/src/env.ts`
- `apps/product/src/lib/auth/recovery-codes.ts`
- `docs/operations/log/2026-07-08-vercel-predeploy-security-audit.md`
