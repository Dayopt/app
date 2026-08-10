---
status: current
last_verified: 2026-08-03
code:
  - docs/projects/mcp-plan-track-learn/overview.md
  - docs/projects/mcp-plan-track-learn/step-6-conformance.md
  - docs/projects/mcp-plan-track-learn/step-6-client-beta.md
  - supabase/migrations
---

# Step 6 — Rollout execution checklist

## Source of truth

- 設計と完了条件: このproject directory
- 実行順、candidate manifest、Production確認: GitHub Issue [#1754](https://github.com/Dayopt/dayopt/issues/1754)
- 実clientの証跡: `docs/engineering/log/YYYY-MM-DD-mcp-beta-<client>-<run>.md`

Issue本文の割合や「次の1件」は古くなるため、実行状態は#1754の最新append-only commentを正とする。本checklistは手順と確認観点の設計を持ち、消化状況は持たない。secret、個人情報、raw requestはどの正本にも残さない。

## Candidate ledger

各候補と、それをmainへ入れたPR / merge SHAの対応。cleanup設計を読む時の参照表であり、進捗表ではない。

| Candidate | Outcome                                               | Evidence               |
| --------- | ----------------------------------------------------- | ---------------------- |
| 1         | additive DB expand、gate OFF                          | PR #1764 / `ce8c4cd7d` |
| 2         | Timeblock通常UI command compatibility                 | PR #1765 / `ee44c0fd6` |
| 3         | retention、account削除、外部依存compatibility         | PR #1766 / `ed4a61013` |
| 4         | OAuth CHECKを`NOT VALID`で追加                        | PR #1769 / `566ca7982` |
| 5         | read-only preflight後にOAuth CHECKをvalidate          | PR #1780 / `f1dc397a0` |
| 6         | Plan / Record ACLをauthenticated SELECT onlyへcutover | PR #1781 / `468cd2495` |
| 7         | MCP / OAuth appを全write gate OFFでdark release       | PR #1799 / `51bb34479` |
| 8         | 旧input、旧RPC、旧connectionのzero-use後cleanup       | —                      |

その後、PR #1801でlocal OAuth identity seed、PR #1802でSettingsと初回OAuth challengeのread scopeを調整した。

## Next sequence

各節は「何を確認して次へ進むか」の設計を持つ。どこまで消化したかは#1754へappend-onlyで記録し、ここへは書き戻さない。

### 1. Candidate 8 scopeを現在のmainから再定義する

repo 内列挙と object signature 単位の対象固定は [Candidate 8 cleanup scope](./step-6-candidate-8-cleanup.md) が成果物として持つ（2026-08-10 実施）。Production read-only 観測は未実施のまま残る。

- latest `origin/main`から専用branchを作る
- 旧ブランチのmigrationやcommitを機械的にcherry-pickしない
- repo内の旧input型、旧route、旧RPC caller、compatibility testを列挙する
- Productionをread-onlyで確認し、旧input、旧connection、旧RPC利用の観測期間と件数を記録する
- `soft_delete_plan`、`soft_delete_record`、`confirm_day_plans_to_records`のauthenticated compatibilityが本当に不要か確認する
- service-role recovery surfaceを残すか削除するかを、運用手順と一緒に明示する
- drop / revoke対象と残す対象をobject signature単位で固定する

観測窓、対象object、顧客影響が曖昧なままcleanup migrationを書かない。利用0の証拠はtargetごとに必要であり、「repo callerが0」だけでProduction traffic 0とはみなさない。

### 2. Candidate 8をephemeral Previewでrehearseする

- Productionと別refのdata-less、non-persistent Supabase branchを使う
- exact candidate SHAと期待migration terminalをmanifestへ固定する
- global gate OFF、enabled client空、runtime allowlist空を確認する
- cleanup前の旧app互換またはdrain完了条件を確認する
- cleanup後に新appのread、通常UI mutation、service-role recoveryが意図どおり動く
- authenticatedから撤去した能力が`42501`等の期待結果で拒否される
- rollbackではなくforward restoration migrationをrehearseする
- migration lock、開始・終了時刻、最大待機を記録する
- `pnpm docs:check`、DB integration、RLS snapshot、typecheck、lint、boundariesを通す

Candidate 8は破壊的変更を含む。PR merge、Production migration、Production cleanupには対象と環境を指定した明示承認が必要である。

### 3. Current candidateでprotocol verificationを戻す

protocol試験の前に、次のrepo-side blockerも閉じる。

- Settingsに認証済みuser自身のconnection一覧と個別revoke導線を追加し、別user / 別connectionを変更できないことを検証する
- client gate OFFが一時停止にすぎない現状を維持するか、対象clientの既存write connectionを同じtransactionで恒久失効するDB commandを追加するかを決める
- 一時停止を維持する場合は、gate再開前に対象connectionを個別revokeし、同じtoken familyが復活しない運用をrehearseする
- maintenance dispatcherがauthorization code、access token、refresh token、connection、mutation receiptのdue flagを完了判定へ含める
- 各due itemのbounded cleanupを実行し、期限超過をfail closedで報告する
- legacy textと`structuredContent`のuntrusted data扱いを3 clientで確認できるtest scenarioを用意する

- 現在のofficial conformance suiteとspec versionを選ぶ
- exact candidate SHAを1 commandで検証できるharnessを追加する
- repo testとofficial suiteを両方passさせる
- expected failureはID、理由、実行済みであることを記録する
- baseline外のfailure、warning、skipがない

詳細は[protocol verification](./step-6-conformance.md)に従う。

### 4. Client beta用ephemeral Previewを作る

- Candidate 8とprotocol verificationを含むexact SHAを使う
- seedとsignupを止めたdata-less branchを使う
- synthetic userを1件だけ用意し、credentialをrepoやIssueへ書かない
- stable branch alias、authorization server、resource、redirect URIを同じoriginへ揃える
- Preview専用Upstashとsecretだけを使う
- DB environment identityとSupabase project refをapp起動前に確認する
- read-only connectionでread toolだけが見える
- cached write callがgate OFFで正規データを変更しない

過去のPR #1760 Previewは準備記録であり、再利用しない。Persistent Stagingも作らない。

### 5. Three-client matrixを実行する

- ChatGPT
- Claude
- Cursor

各clientで[client beta verification](./step-6-client-beta.md)の全matrixを実行し、別々のevidence logを作る。1 clientの成功を他clientへ転用しない。

### 6. Production beta checkpoint

次を揃えてから、顧客挙動を変える承認を求める。

- Candidate 8と最新appがProductionへ反映済み
- exact Production SHAとDB migration terminalが一致する
- 今回有効にするclientのPreview evidenceがpassしている
- DB statusのOAuth / receiptを含む全retention due flagがfalseである。maintenance summaryの`complete`だけに依存しない
- account削除とconnection revokeの実環境rehearsalがpassしている
- Settingsのconnection一覧 / revokeと、client停止後の恒久失効がpassしている
- 監視、担当者、停止条件、顧客案内、再接続手順が決まっている
- global / client / runtimeの各gateを閉じる手順をrehearseしている

有効化は1 clientずつ行う。

1. durable client gateを開く
2. runtime allowlistへclientを追加する
3. global gateを開く
4. 新しいconnectionで再authorizationする
5. client matrixの代表flowを再実行する
6. 監視期間を終えてから次のclientへ進む

現在のclient gateだけでは旧connectionを失効できない。Production betaでは、対象connectionを明示revokeして同じtoken familyの失効を確認する。将来、client停止commandが恒久失効をtransaction化した場合だけ、そのcommandを正本に切り替える。

## Candidate manifest

Candidate 8と以後のrelease候補では、最低限次をIssueへappend-onlyで残す。

```yaml
candidate: '<name>'
base_main_sha: '<sha>'
candidate_head_sha: '<sha>'
expected_migration_terminal: '<timestamp-or-none>'
actual_migration_terminal: '<timestamp-or-none>'
supabase_preview_project_ref: '<non-secret-ref>'
stable_branch_alias: '<hostname>'
global_write_gate: 'off'
enabled_client_ids: []
runtime_write_allowlist: []
old_surface_usage: '<observation-window-and-aggregate>'
forward_restoration_rehearsal: pass | fail | pending
verified_at: 'YYYY-MM-DDTHH:MM:SSZ'
operator: '<name-or-handle>'
```

## Stop conditions

次のいずれかで作業を止める。

- issuer、resource、branch alias、DB identity、Supabase refが一致しない
- Production credentialまたは実ユーザーデータがPreviewへ入った
- write gate OFFでwrite toolが列挙または実行された
- 旧surfaceの利用が1件でも残る状態でCandidate 8を適用しようとしている
- mutationとreceiptの件数が一致しない
- UIとMCPの競合で重複Planまたは重複Recordが成立する
- retention期限超過backlogが残る
- Calendar、Inspector、Reviewが20秒以内に収束しない
- baseline外のprotocol failureまたはwarningがある
- client gateを閉じている間、またはconnection revoke後に新しいwriteが成立する
- gate再開で、恒久停止したはずの旧connectionがwrite能力を取り戻す
- DB statusにOAuth / receiptのdue flagがあるのにmaintenanceがcompleteを返す

## Stop and roll forward

write異常時は次の順に閉じる。

1. global gateをOFFにする
2. durable client gateをOFFにしてwrite scopeを一時除外する
3. runtime allowlistから対象clientを外す
4. 恒久停止が必要なconnectionを明示revokeし、同じtoken familyの失効を確認する

schema cleanup後の問題は、確認済みのforward restoration migrationで復旧する。削除済みconnectionを復活させず、必要なclientは再authorizationする。

Production credential混入時はPreview appとcronを隔離し、影響credentialをrotateまたはrevokeする。Production migration、release、gate変更、credential rotate / revokeは、対象と環境を指定した明示承認なしに実行しない。

## Completion

- Candidate 8がzero-use evidence付きで完了している
- 現在のcandidateでofficial conformanceを再実行できる
- ChatGPT、Claude、Cursorのevidenceが最終的にすべてpassしている
- Productionで承認したclientだけが有効である
- Plan → Track → Learn、停止、retention、削除、監視が一周している
- #1754の古い進捗文を現状へ更新し、完了証拠を添えてcloseできる
