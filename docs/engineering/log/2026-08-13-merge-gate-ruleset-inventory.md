---
status: frozen
date: 2026-08-13
---

# merge gate の GitHub ruleset 移行棚卸し（設定変更はしない）

## 背景・当時の前提

[#1948](https://github.com/Dayopt/dayopt/issues/1948)。`branch:finish`（`scripts/git/finish-branch.sh`）が担っている merge gate のうち、GitHub ruleset の required status check へ移せるものがあるかを棚卸しする。issue が立った時点の前提は「private repo + Free plan では required check を強制できない」だったが、[2026-08-11 の visibility 決定](./2026-08-11-codeql-disabled-and-visibility-decision.md)で **private 化は保留し public を維持する**と決まっており、前提が変わっている。

本 issue はレーン ops2（#2048 束）へ「調査のみ・成果物は決定ログ・設定変更はしない」の scope で dispatch された。ruleset の変更（`gh api -X PUT rulesets/...` 等）は本ログでは行っていない。

## 現状の実測

```bash
gh api repos/Dayopt/dayopt --jq '{private, visibility, allow_squash_merge, allow_rebase_merge, allow_merge_commit}'
# => {"private":false,"visibility":"public","allow_squash_merge":false,"allow_rebase_merge":false,"allow_merge_commit":true}

gh api repos/Dayopt/dayopt/rulesets/6790553
```

ruleset `Branch name pattern: main`（id 6790553、`refs/heads/main` 対象、enforcement: active）の内容:

- `pull_request` rule: `required_review_thread_resolution: true`、`required_approving_review_count: 0`、`allowed_merge_methods: [merge, squash, rebase]`（**squash/rebase はリポジトリ設定側で無効化済みのため実質 merge commit のみに絞られている**。ruleset 側の許可は repo 設定より強い制約にならない）
- `required_status_checks` rule（`strict_required_status_checks_policy: true` = up-to-date 要求）: `🔍 Static Checks` / `📦 Unit Tests` / `🎭 E2E Tests` / `🌐 Web Build & E2E` / `Production Config Audit` / `Vercel – product` / `Vercel – web` / `🛡️ docs & secrets guard` の 8 件

## 決定と理由

**現状維持。branch:finish の custom judgment（内製クロスレビュー痕跡 gate）を ruleset の required status check へ移すことはしない。**

### 1. 「gh pr merge / GitHub merge ボタンは gate を素通りする」という前提は、一部の gate には当てはまらない

GitHub の branch protection（ruleset）は、**merge を実行する経路（UI ボタン / `gh pr merge` / raw REST `PUT .../merge`）によらず、サーバー側で一律に enforcement される。** `branch:finish` 自身も REST 直叩き（`gh api -X PUT .../merge`）でマージしており、この呼び出し自体も ruleset の対象になる。したがって:

- **review thread の必須解決**（`.claude/rules/workflow.md` §レビュー指摘の必須解決）は、ruleset の `required_review_thread_resolution: true` で**既に native に enforcement されている**。`branch:finish` の `UNRESOLVED_THREADS` チェックは、native gate と同じ結論を早期に・日本語の説明付きで返す冗長なチェックであり、native の代替ではなく先出しの重複である
- **up-to-date（main 追従）** も `strict_required_status_checks_policy: true` で native に enforcement されている
- **CI green（Static Checks / Unit Tests / E2E / Vercel build / Production Config Audit / docs guard）** も required status checks で native に enforcement されている

`.claude/rules/workflow.md` の「この gate は `branch:finish` 経由でしか効かない」という一文（§内製クロスレビューの実施を要求する gate）は、**内製クロスレビュー痕跡（`[internal-review]` marker）gate 1 点だけを指しており、この記述は正確だった**（thread 解決や CI green を指した記述ではない）。誤解の余地があるとすれば「branch:finish の gate はどれも同じ強度で GitHub 標準機能をすり抜けられる」という読み方だが、実測するとそうではない。

### 2. 唯一 native に表現できないのは内製クロスレビュー痕跡（`[internal-review]` marker）gate

marker の 5 点判定（本文先頭一致・authorAssociation・非空・head SHA 一致・agent 非空）は、**PR コメントの内容を解釈した自己申告の判定**であり、GitHub の required status check（commit status / check-run）としてネイティブに表現されている概念ではない。native 化するには:

- `issue_comment`（created）イベントで起動する Actions workflow を新設し、コメント本文を同じロジックで判定し、対象 PR の**現在の head SHA** に対して check-run または commit status を発行する
- その context を ruleset の `required_status_checks` に追加する
- `branch:finish` 側の判定ロジック（bash/jq）と新 workflow 側のロジックを同期させる（共通化しないと二重管理になる。issue の「やること 3」が懸念していたのはこの点）

これは実装可能だが、次の理由で今回は見送る:

- **設計思想の逆転**（[2026-08-13 の Merge Queue 見送り決定](./2026-08-13-github-merge-queue-investigation.md) §決定と理由 2 と同型の論点）。現行 gate は「script が GitHub の状態を読んでから判断する」設計で、これを native required check にすると「check が publish されたら GitHub が自動で扱う」設計に変わる。comment 編集・削除、head SHA 更新のタイミング（push とほぼ同時に marker が古くなる race）など、`branch:finish` が都度クエリすることで吸収していた揺れを、check-run の発行・失効タイミングとして作り直す必要があり、複雑さに見合う実利が薄い
- **実際のバイパス経路の露出が小さい。** 現行の運用は `.claude/rules/orchestration.md` が定める指揮台モデルで、merge は指揮台が `branch:finish` を通してのみ実行する運用規約になっている。GitHub UI から人が直接 merge ボタンを押す経路は、今のところ想定されていない（solo owner + AI 運用）。バイパスの実害が実際に発生してから native 化を検討しても遅くない
- **Actions 課金の制約は、今回の議論では barrier にならない。** public repo の GitHub-hosted runner は無料枠が実質的に無制限（private repo だけが月 2,000 分の制約を受ける）。`.claude/rules/workflow.md` §Actions 経済の規律 の「2026-09 の private 化で無料枠が月 2,000 分になる」という前提は、2026-08-11 の public 維持決定で**既に成立しなくなっている**（下記「発見した副産物」参照）。つまり「Actions 課金が惜しいから native 化を避ける」という理由は成立しない。見送りの理由は課金ではなく、上記の設計思想・実利の 2 点

### 3. script 側とネイティブ側の二重管理は、現状すでに「重複だが害のない」形になっている

issue の「やること 3」（二重管理にならない形を決める）への回答: **新たに何かを移行しないため、二重管理は増えない。** 既存の重複（thread 解決・up-to-date・CI green を script 側でも再チェックしている点）は、native gate と結論が食い違うリスクを生まない設計になっている——`branch:finish` は REST 直叩きで merge を試みるため、script 側の判定が仮に緩んでいても native ruleset が最終防波堤として同じ基準で弾く。script 側のチェックは「早期に・日本語の理由付きで」失敗を返すためのユーザー体験改善であり、保証の二重発行ではない。

## 却下した選択肢と、なぜ捨てたか

- **内製クロスレビュー痕跡 gate を Actions workflow + required status check として native 化する** — 却下（§決定と理由 2）。技術的には可能だが、設計思想の逆転と実装・維持コストに見合う実害が今のところ無い
- **review thread 解決 / up-to-date / CI green の script 側チェックを削除し native ruleset だけに委ねる** — 却下。script 側のチェックは native の代替ではなく「早期に分かりやすい理由で止める」ためのものであり、削除すると `branch:finish` の失敗時メッセージが GitHub の生の API エラーに劣化する。実害は無いので残す判断に理由がある

## 発見した副産物（本 issue の scope 外、別途対応が必要）

`.claude/rules/workflow.md` §Actions 経済の規律 冒頭（L276）と §なぜ 2 段階か 内（L339）が、**2026-08-11 に撤回された「2026-09 private 化」を現在も有効な前提として書いている**（実際は [2026-08-11 の決定](./2026-08-11-codeql-disabled-and-visibility-decision.md)で public 維持・private 化は無期限保留に決定済み）。この 2 箇所が定める運用規律（push 回数の一元化・round 単位の束ね）自体は public のままでも Actions 実行回数を抑える一般的な理由（CI run 自体の待ち時間・concurrency cancel の手戻りなど）で引き続き妥当だが、**「私 repo化で無料枠が 2,000 分になる」という根拠の記述は事実と異なる。**

本 issue の dispatch scope（「調査のみ・設定変更はしない」）には rules 文書の修正も含めていないため、本ログでは修正せず、発見事項として記録するに留める。指揮台が別途 issue化 または本束の follow-up として扱うかを判断する。

## 影響・やること

- ruleset / repo 設定への変更は無し（本調査は read-only）
- `.claude/rules/workflow.md` §内製クロスレビューの実施を要求する gate の「この gate は `branch:finish` 経由でしか効かない」という記述は、内製クロスレビュー痕跡 gate に限定した記述として正確なので修正不要
- 上記「発見した副産物」（private 化前提の stale 記述）は別途 issue 化を検討する
- 将来、内製クロスレビュー痕跡 gate のバイパスが実際に発生した場合、または repo に外部 collaborator が増えて GitHub UI からの直接 merge が現実的な経路になった場合は、本ログを起点に native 化（Actions workflow + required status check）を再検討する

## 参考

- `gh api repos/Dayopt/dayopt` / `gh api repos/Dayopt/dayopt/rulesets/6790553`（2026-08-13 実測、本ログの前提データ）
- [2026-08-13 GitHub Merge Queue 導入見送りログ](./2026-08-13-github-merge-queue-investigation.md)（同日の隣接調査。Merge Queue というマージ実行の自動化そのものを見送った決定で、本ログの required status check 単体の話とは別軸だが、§設計思想の逆転の論点を共有する）
- [2026-08-13 内製クロスレビュー標準化ログ](./2026-08-13-internal-review-standardization.md)（内製クロスレビュー痕跡 gate の設計背景）
- [2026-08-11 CodeQL 無効化・private 化保留決定ログ](./2026-08-11-codeql-disabled-and-visibility-decision.md)（本調査の前提を変えた決定）
