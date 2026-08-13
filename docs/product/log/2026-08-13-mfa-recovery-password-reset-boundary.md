---
status: frozen
date: 2026-08-13
---

# password-reset flow から `user.verifyRecoveryCode`（リカバリーコードでMFAを恒久解除する経路）を呼べるようにした

## 背景・当時の前提

MFA(TOTP) を有効化しているアカウントは、GoTrue の仕様上パスワードリセットが常に失敗する（`insufficient_aal`、config で回避不可能、#1928 で確定）。唯一の既存回復手段はサポートへの問い合わせだった（#2013）。

`user.verifyRecoveryCode`（`apps/product/src/features/auth/server/recovery-service.ts`）は既にログインフロー（`/auth/mfa-verify`）で稼働しており、リカバリーコード検証成功時に verified TOTP factor を admin 権限で削除する（MFA の恒久無効化）。この契約は `docs/product/specs/auth.md` の tRPC API auth policy 節に既に明文化済みだった。

## 決定と理由

password-reset flow（`ResetPasswordForm.tsx`）からも同じ `user.verifyRecoveryCode` を呼べるようにし、TOTP step-up（`mfa.challenge`+`mfa.verify` によるセッションの aal2 昇格）と並ぶ自己復旧手段として追加する。

**重要な訂正**: 当初「login 経路と同一の保証境界に統一するだけ」と整理しかけたが、これは不正確だった。login 経路でこの機構に到達するには**パスワードを知っている**ことが前提（通常ログイン → MFA チェックで詰まる → リカバリーコード）。password-reset 経路は**メールボックスを制御しているだけ**で到達できる。つまり本決定は、MFA 保護アカウントへ到達可能な攻撃者集合を「パスワード保有者」から「メールボックス制御者」へ広げる、という product 境界の明示的な拡大である。

この拡大を、パスワードリセットの第一要素（メール到達）が持つ責務の一部として明示的に引き受ける。理由:

- 対象の攻撃者はメールボックスを制御しているため、reset-password 自体（メール到達だけで新パスワードを設定できる）が既に同水準の権限移譲を行っている。リカバリーコードでMFAを外す経路を追加しても、質的に新しい攻撃面ではなく、既存の reset-password の権限移譲に一段乗るだけ
- 通知（後述）と rate limit（`user.verifyRecoveryCode` は `protectedProcedure` の user rate limit を通る）により、悪用の検知・減速手段は用意する

## 却下した選択肢と、なぜ捨てたか

- **TOTP step-up のみ許可し、リカバリーコードはMFAを外さない**: リカバリーコード保有者が TOTP デバイスを完全に失っている場合（最も典型的な「詰まった」ケース）に自己復旧できず、issue の目的（自己復旧手段ゼロの解消）を半分しか達成しない。加えて「リカバリーコードで aal2 昇格だけする」設計は既存 `verifyRecoveryCode` の副作用（factor 削除）と別の新規サーバーコードを要し、既存の login 経路の契約と重複した2つ目の実装を持つことになる
- **リカバリーコード経路をこのPRでは実装しない（TOTP step-upのみ出す）**: 自己復旧手段ゼロという issue の core motivation を半分しか解決しない。TOTP デバイスを完全に失ったユーザーには依然として自己復旧手段が無い

## 影響・やること

- `ResetPasswordForm.tsx` が `vanillaTrpc.user.verifyRecoveryCode` を呼ぶ（サーバー変更なし、既存 procedure の再利用）
- リカバリーコード経路の成功後は、共有の汎用成功画面ではなく「二段階認証は無効化されました」の専用警告を明示表示する（`auth.resetPasswordForm.mfaDisabledWarning`）
- MFA 無効化のメール通知は本 PR の scope 外とし、[#2033](https://github.com/Dayopt/dayopt/issues/2033) へ先送りした。ただし条件を明記済み: (1) 送信はサーバー側（`recovery-service.ts`）に置く、(2) login/reset 両経路をカバーする。この2条件を満たさない実装は本決定が引き受けたリスクを埋め合わせない
- `docs/product/specs/auth.md` の該当記述を password-reset flow からも到達可能である旨へ更新した
- 依存する GoTrue の挙動（factor 削除後、昇格していない旧 aal1 トークンのままでも `updateUser` が成功する = GoTrue がリクエスト時に DB の factor 状態を都度 re-check する）は実装依存で、GoTrue のバージョンアップで変わりうる。ローカル Docker で実地検証済み（2026-08-13）だが、契約として固定されているわけではないため、GoTrue バージョン更新時は再検証対象とする
