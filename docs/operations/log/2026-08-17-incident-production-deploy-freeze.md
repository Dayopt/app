---
status: frozen
date: 2026-08-17
last_verified: 2026-08-17
issue: 2121
---

# production デプロイが 2026-08-14 から全滅（bundle budget 超過）

2026-08-17、検証レーンの発見 + 指揮台の独立確認により、production target のデプロイが **2026-08-14 05:57（`c70f2c6f5`、PR #2095 merge）以降すべて ERROR** になっていたことを検出した。稼働中の production は `2f08c91`（PR #2035、2026-08-13 merge）のビルドのまま約 3〜4 日・数十 PR 分停滞していた。

---

## 起きた事実

- Vercel の production デプロイ履歴を API で射影したところ、`c70f2c6f5` 以降 `main` への merge ごとに production target の deploy が ERROR で終わっていた（`b560f84d6` まで 8 連続 ERROR を実測）。
- ビルド失敗の直接原因: `vercel.json` の `buildCommand`（`pnpm build && pnpm verify:bundle`）内の `check-bundle-budget.ts --fail` が、`/[locale]/auth/reset-password` の First Load JS gzip **476.5 KB** が予算 **460 KB**（`AUTH_ROUTES_WARN_KB`）を超過したため exit 1 していた（`dpl_6ZP3T5X2iwsBNpKoaAGpB1XzAoHZ` のビルドログで実測）。
- **検知が 3 日遅れた構造**: PR の「Vercel – product」check は preview デプロイであり budget check 自体は走るが preview 失敗は production 状態を意味しない / `Production Config Audit` は env metadata のみを検査し deploy 成否は見ない / UptimeRobot は稼働中の旧デプロイ（`2f08c91`、healthy）を見ているため異常を検出しない。**production deploy failure そのものを検知する経路が repo 内に存在しなかった。**

## 原因調査

- `/[locale]/auth/reset-password` は 2026-08-13 の PR（`b38027732`、MFA (TOTP/リカバリーコード) の step-up 検証を reset-password フローに追加）で `ResetPasswordForm.tsx` が +229 行、`MFAVerifyForm` を新規に static import するようになった。この時点で当該ルートは 460 KB 予算に接近した。
- ローカル build（クリーン、Node 26.5.0、`.op-env.agent` 経由の env）では `HEAD`（`b560f84d6`）で reset-password は **409.8 KB**（予算内）だった。一方 Vercel の実ビルドでは同じ commit 系列で **476.5 KB** — 全 19 route で一律 +66〜68 KB gzip、ローカルより重い。
- **確定原因**: `vercel env ls` で Vercel project の env scope を確認したところ、`NEXT_PUBLIC_SENTRY_DSN` は **Production にのみ**設定され、Preview には存在しない（意図的スコープ、Sentry へ preview のノイズを送らない設計）。`apps/product/instrumentation-client.ts` は `if (SENTRY_DSN && IS_SENTRY_PRODUCTION) { ... Sentry.init(...) ... }` で Sentry 初期化全体をこの env 値でガードしているため、preview build では `SENTRY_DSN` が `undefined` に inline され、Next.js のビルド時最適化でこのブロックごと dead-code-eliminate される。production build だけ `browserTracingIntegration` を含む Sentry client SDK の実体が bundle に含まれ、その分（実測 +66〜68 KB gzip、全 route 共通）重くなる。この差は**意図した設計の副作用**であり、regression ではない。
- 結果として、preview（PR の「Vercel – product」check）と production は**同じ `pnpm build && pnpm verify:bundle` を実行しているにもかかわらず**、preview は Sentry 分だけ軽く budget check を通過し、production だけ超過する非対称が生まれていた。「PR の Vercel check が green」は production での通過を保証しない。ローカル build も preview と同じ理由（`NEXT_PUBLIC_SENTRY_DSN` 未設定）で軽い側の数値が出ており、開発者が手元で budget check を走らせても同じ非対称を踏む。

## 対応

1. **`MFAVerifyForm` の遅延ロード**（[ResetPasswordForm.tsx](../../../apps/product/src/features/auth/components/ResetPasswordForm.tsx)）: MFA step-up は MFA 有効アカウントの自己復旧経路でのみ表示される条件付き UI のため、`next/dynamic`（`ssr: false`）へ切り替え、初回 First Load JS から分離した。ローカル計測では reset-password が 409.8 → 409.1 KB とわずかな削減（-0.7 KB）に留まり、単独での予算超過解消には至らなかった。Vercel 実測での削減幅は本 PR の deploy 結果で初めて確認できる。
2. **budget の一時引き上げ**（[check-bundle-budget.ts](../../../scripts/check-bundle-budget.ts)）: `AUTH_ROUTES_WARN_KB` を 460 → 500 KB へ引き上げ、実測 476.5 KB に対して余裕を持たせた。1 行・git revert 可逆。production 3 日凍結の継続コストが budget 規律の一時逸脱を上回ると判断した（issue #2121 で事前許容済み）。
3. **preview/production budget parity**（User 指摘、指揮台 scope 追加、2026-08-17）: 「production だけで落ちる検査は preview の意味を無くす」という指摘を受け、preview build が Sentry 分の非対称を吸収して budget check を通す構造を確認した（上記「確定原因」）。恒久対応（preview で production 相当の重さを検出できるようにする、または Sentry client init を lazy 化して全 env で軽量化する）は本 PR の速さを優先し follow-up issue（#2123）へ分割した。
4. **検知の穴**: production deploy failure を検知する経路が無い構造そのものへの対応は「設計のみ」に留め、実装は follow-up issue（#2124）へ送った（下記）。

## 検知の穴の設計（実装は #2124）

`scripts/production-config-audit.mjs` / `production-config-audit.yml` は `workflow.md` の audit contract 保護対象であり、変更すると push ごとに trusted dispatch（`gh workflow run production-config-audit.yml`）が必要になる。P1 復旧 PR の中でこれを行うと merge までの往復が増えるため、本 incident では設計のみ記録し実装は分離する。

設計案:

- 既存の日次 cron（`production-config-audit.yml`、06:00 JST）に、Vercel API で **production target の直近デプロイ一覧を取得し、最新の `main` HEAD SHA に対応する deployment が `READY` かどうか**を確認するステップを追加する
- `READY` でない場合（`ERROR` / stuck `BUILDING` 等）、既存の commit status 機構（`Production Config Audit` と同型）で failure を発行するか、別途 GitHub Issue を自動起票する
- 代替案: Vercel 側の deploy failure 通知（Vercel Dashboard の Integration / Slack 等）を有効化する方が実装コストは低いが、repo 内の監査可能性（audit contract として test で固定できる）を優先するなら上記のワークフロー拡張の方が一貫性がある

## 影響範囲

- 2026-08-14〜2026-08-17 の約 3〜4 日間、`main` へ merge された変更が production に一切反映されなかった。未反映の主な変更:
  - Google OAuth narrow pair 化（PR #2070）— 本番の同意画面が旧 `calendar.readonly` のまま
  - `RECOVERY_CODE_PEPPER` の新値設定（2026-08-17、[2026-08-17-incident-recovery-pepper-empty.md](./2026-08-17-incident-recovery-pepper-empty.md)）— 旧デプロイの env スナップショットは空文字のまま
  - build gate の pepper 必須化（PR #2119）ほか、#2076 以降 2026-08-17 時点までの全変更
- 本 PR の merge・production alias 切り替え後、上記変更が一括で反映される。

## 関連

- GitHub Issue #2121, #1963, #2115, #2123（preview/production budget parity）, #2124（deploy failure 検知）
- `apps/product/src/features/auth/components/ResetPasswordForm.tsx`
- `scripts/check-bundle-budget.ts`
- `apps/product/vercel.json`
- `docs/operations/log/2026-08-17-incident-recovery-pepper-empty.md`
