#!/bin/bash

# PR のマージ〜掃除をワンセットで行う共通スクリプト。
# Claude / 人間が同じコマンドで実行できる。
#
#   pnpm branch:finish <PR番号> [--dry-run]
#
# 完了定義（5点すべてを満たして初めて「作業終了」）:
#   ① PR マージ済み
#   ② worktree 削除
#   ③ ローカル branch 削除
#   ④ リモート branch 消滅（fetch --prune で確認）
#   ⑤ ローカル main ref が origin/main と一致
#
# 詳細な設計と手動フォールバックは .claude/rules/workflow.md §Worktree 運用 を参照。

set -euo pipefail

DRY_RUN=false
PR_NUMBER=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h | --help)
      cat <<'EOF'
Usage: pnpm branch:finish <PR番号> [--dry-run]

PR をマージし、worktree・ローカル branch・リモート branch を掃除して main を最新化する。

  <PR番号>     掃除対象の Pull Request 番号（必須）
  --dry-run    実際には変更せず、実行予定のアクションだけ表示する
EOF
      exit 0
      ;;
    *)
      if [[ -z "$PR_NUMBER" ]]; then
        PR_NUMBER="$arg"
      else
        echo "❌ 引数が多すぎます: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

# `branch -d` の stderr を退避する一時ファイル。固定パスにすると並行実行で
# 互いに上書きし合い、共有 /tmp では symlink 差し替えの的にもなる。
BRANCH_ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/branch-finish-err.XXXXXX")"
trap 'rm -f "$BRANCH_ERR_FILE"' EXIT

error() {
  echo "❌ $1" >&2
}

info() {
  echo "ℹ️  $1" >&2
}

step() {
  echo "" >&2
  echo "▶ $1" >&2
}

# --dry-run 時はコマンドを実行せず表示だけする
run() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] $*" >&2
  else
    "$@"
  fi
}

if [[ -z "$PR_NUMBER" ]]; then
  error "PR 番号を指定してください: pnpm branch:finish <PR番号> [--dry-run]"
  exit 1
fi

if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  error "PR 番号は数値で指定してください（受け取った値: ${PR_NUMBER}）"
  exit 1
fi

for bin in git gh jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    error "$bin が見つかりません。"
    exit 1
  fi
done

# repo のルート（main checkout）を git-common-dir から解決する。
# worktree の中から実行しても main checkout を正しく指す。
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
MAIN_ROOT="$(cd "$(dirname "$GIT_COMMON_DIR")" && pwd)"

# feature worktree の中から実行された場合、後段の worktree remove が自分の cwd を
# 消して以降の git 操作が壊れる。先頭で main checkout へ移動して基準を揃える
# （bash は script の fd を開いたまま読むため、実行元 worktree の削除後も安全）。
cd "$MAIN_ROOT"

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run モード: 変更は行いません"
fi

# ── 1. PR 状態を取得 ────────────────────────────────────────────────
step "PR #$PR_NUMBER の状態を確認"

PR_JSON="$(gh pr view "$PR_NUMBER" --json state,isDraft,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,changedFiles 2>/dev/null || true)"

if [[ -z "$PR_JSON" ]]; then
  error "PR #$PR_NUMBER を取得できませんでした。番号とネットワークを確認してください。"
  exit 1
fi

PR_STATE="$(printf '%s' "$PR_JSON" | jq -r '.state')"
IS_DRAFT="$(printf '%s' "$PR_JSON" | jq -r '.isDraft // false')"
BRANCH="$(printf '%s' "$PR_JSON" | jq -r '.headRefName')"
HEAD_SHA="$(printf '%s' "$PR_JSON" | jq -r '.headRefOid // ""')"

if [[ -z "$BRANCH" || "$BRANCH" == "null" ]]; then
  error "PR #$PR_NUMBER の head branch を特定できませんでした。"
  exit 1
fi

info "branch: $BRANCH / state: $PR_STATE"

if [[ "$PR_STATE" == "CLOSED" ]]; then
  info "PR は CLOSED（未マージ）です。branch 掃除のみ続行します。"
fi

# ── 2. 未マージなら checks を確認してマージ ──────────────────────────
if [[ "$PR_STATE" == "OPEN" ]]; then
  step "PR #$PR_NUMBER をマージ"

  # `gh pr merge` はクライアント側で draft を拒否するが、REST 直叩きにはその防御が無い。
  # draft では skip される check がある（ci.yml の重量 job、production-config-audit）
  # ため、ここで明示的に止める。
  if [[ "$IS_DRAFT" == "true" ]]; then
    error "PR #$PR_NUMBER は draft です。ready にしてから再実行してください。"
    exit 1
  fi

  # head SHA は check 判定と compare gate の基準に使う。取れなければ何も判定できない。
  # 40 桁 hex であることも検証する（内製クロスレビュー gate の head: 行と正規表現で
  # 突き合わせるため、想定外の値が紛れ込むと判定そのものが壊れる）。
  if [[ -z "$HEAD_SHA" || "$HEAD_SHA" == "null" || ! "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    error "PR #$PR_NUMBER の head SHA を取得できませんでした。マージを中止します。"
    exit 1
  fi

  # ── statusCheckRollup を name / context ごとに 1 件へ畳む ──────────
  #
  # **同一 head SHA で 2 回以上 run が走ると、古い run の entry が残り続ける。**
  # `gh pr checks` は同名を畳むが `gh pr view --json statusCheckRollup` は畳まない
  # （2026-07-30 実測: PR #1765 は check-runs 18 件のうち 8 名前が重複し、
  # rollup 21 件に対して `gh pr checks` は 13 行）。畳まずに数えると、再実行で
  # 解決済みの failure / cancelled を永久に数え続けてマージ不能になる。
  # 同一 SHA で 2 回走る経路は現実にある: ラベル付与での再発火、draft → ready、
  # ready → draft → ready、手動 re-run、reopened。
  #
  # 畳み方には 2 つの非対称性を持たせる。どちらも「緩む側へ倒れない」ためのもの。
  #
  # ① **pending は「どれか 1 つでも実行中なら実行中」** として扱う。queued な run は
  #    startedAt を持たないことがあり、単純な「最新」判定では古い完了 run が勝つ
  #    （= 実行中の run を見落として素通りする fail-open）。
  # ② **完了済みの代表は「判定を持つ entry」を優先する。** `skipped` / `neutral` /
  #    `stale` は失敗にも成功にも数えないため、これが代表になると同じ名前の古い
  #    failure が消える。job-level `if:` で skip された run は同一 SHA に
  #    `conclusion: skipped` の check run を作るので、これは実在する経路
  #    （例: ci.yml の重量 job は draft PR で skip する。ready で FAILURE → draft へ戻して
  #    reopen すると skipped が後から積まれ、blocking な赤が消えてしまう）。
  #
  # 畳む単位は `gh pr checks` の dedupe に合わせ、型 + workflow 名 + check 名。
  # 名前を特定できない entry は畳まず全件残す（identity 不明を fail-closed 側へ倒す）。
  ROLLUP="$(printf '%s' "$PR_JSON" | jq -c '
    def is_pending:
      ((.status // "") | ascii_downcase
        | . == "in_progress" or . == "queued" or . == "pending" or . == "waiting" or . == "requested")
      or ((.state // "") | ascii_downcase | . == "pending" or . == "expected");
    def is_decisive:
      ((.conclusion // "") | ascii_downcase
        | . == "success" or . == "failure" or . == "cancelled" or . == "timed_out")
      or ((.state // "") | ascii_downcase | . == "success" or . == "failure" or . == "error");
    def check_name: (.name // .context // "");
    [ (.statusCheckRollup // [])
      | group_by([(.__typename // ""), (.workflowName // ""), check_name])
      | .[]
      | if (.[0] | check_name) == "" then .[]
        elif any(.[]; is_pending) then (map(select(is_pending)) | .[0])
        else ((map(select(is_decisive)) | max_by(.startedAt // "")) // max_by(.startedAt // ""))
        end
    ]')"

  if [[ -z "$ROLLUP" ]]; then
    error "check 一覧を解析できませんでした。gh pr checks $PR_NUMBER で状態を確認してください。"
    exit 1
  fi

  # 失敗している check がないか確認する（CheckRun は .conclusion、StatusContext は .state を持つ）。
  #
  # ── 唯一の免除: trusted dispatch で解除済みの audit guard ──────────
  #
  # production-config-audit.yml は audit contract 保護対象（audit script /
  # production-build-gate / workflow 自身）を変更する PR で、pull_request_target の
  # check run「Audit Vercel metadata (trusted)」を**設計として必ず failure にする**
  # （PR code に contract 変更を自己検証させないため）。解除経路は
  # `gh workflow run production-config-audit.yml --ref <branch>` の trusted dispatch で、
  # 成功すると commit status「Production Config Audit」が head SHA へ success で
  # 発行される。しかし workflow_dispatch run の check run は PR の rollup に
  # 紐づかないため、rollup には pull_request_target 側の failure だけが残り続け、
  # 畳み込みでは解消できない（別 run が rollup に存在しないので代表になれない）。
  #
  # そこで status「Production Config Audit」が success の時に限り、この 1 check の
  # failure を数えから除外する。fail-closed の根拠:
  #   (a) audit が本当に落ちた PR では status も failure になる → 免除は発動しない
  #   (b) contract 変更 PR で dispatch 未実行なら status は
  #       「trusted head audit is required」の failure のまま → 発動しない
  #   (c) status は SHA ごとに発行されるため、新しい push では guard の failure だけが
  #       付き直り、免除は自動的にリセットされる（push ごとに dispatch が要る）
  # 照合は 型 + workflow 名 + check 名 / context の**完全一致のみ**。
  # 他の check の failure はこの免除では消えない。
  #
  # 免除対象は guard の `conclusion: failure` **だけ**に絞る。設計上の意図的 failure は
  # enforce step の exit 1 が作る failure のみで、cancelled / timed_out は「監査が
  # 完走していない」状態にすぎない。これらまで免除すると、古い run の success status が
  # 残ったまま再発火 run が publish 前に cancel された時に、監査されていない commit が
  # 素通りする（fail-open）。cancelled / timed_out は従来どおり停止し、再実行を強制する。
  JQ_GATE_DEFS='
    def is_failed:
      ((.conclusion // "") | ascii_downcase | . == "failure" or . == "cancelled" or . == "timed_out")
      or ((.state // "") | ascii_downcase | . == "failure" or . == "error");
    def trusted_audit_cleared:
      any(.[];
        (.__typename // "") == "StatusContext"
        and (.context // "") == "Production Config Audit"
        and ((.state // "") | ascii_downcase) == "success");
    def is_trusted_audit_guard_failure:
      (.__typename // "") == "CheckRun"
      and (.workflowName // "") == "Production Config Audit"
      and (.name // "") == "Audit Vercel metadata (trusted)"
      and ((.conclusion // "") | ascii_downcase) == "failure";
  '

  TRUSTED_AUDIT_EXEMPTED="$(printf '%s' "$ROLLUP" | jq -r "$JQ_GATE_DEFS"'
    if trusted_audit_cleared
    then map(select(is_trusted_audit_guard_failure)) | length
    else 0 end')"

  if [[ "$TRUSTED_AUDIT_EXEMPTED" != "0" ]]; then
    info "check「Audit Vercel metadata (trusted)」の failure は trusted dispatch により解除済みです（status「Production Config Audit」= success）。失敗数から除外します。"
  fi

  FAILED_CHECKS="$(printf '%s' "$ROLLUP" | jq -r "$JQ_GATE_DEFS"'
    (if trusted_audit_cleared
     then map(select(is_failed and (is_trusted_audit_guard_failure | not)))
     else map(select(is_failed)) end)
    | length')"

  if [[ "$FAILED_CHECKS" != "0" ]]; then
    error "失敗している check が $FAILED_CHECKS 件あります。マージを中止します。"
    error "gh pr checks $PR_NUMBER で詳細を確認してください。"
    exit 1
  fi

  # branch が main の最新を含んでいるか確認する（up-to-date gate）。
  # CI は PR 側でしか走らせないため、古い main ベースのままマージすると
  # 「A・B 単体では green だが合わせると壊れる」マージ順衝突を検知できない。
  # branch protection の strict mode 相当をここで代替する。
  #
  # 比較対象は branch 名ではなく **実際にマージする SHA** に固定する。branch 名で見ると、
  # 判定とマージの間に main 取り込みが push された場合に「新しい tip は ahead」と判定して
  # 「main を含まない古い SHA」をマージしてしまい、gate だけがすり抜ける。
  BASE_STATUS="$(gh api "repos/{owner}/{repo}/compare/main...$HEAD_SHA" --jq '.status' 2>/dev/null || echo unknown)"
  if [[ "$BASE_STATUS" != "ahead" && "$BASE_STATUS" != "identical" ]]; then
    error "branch が main の最新を含んでいません（compare status: ${BASE_STATUS}）。"
    error "main を取り込んで push し、CI green を待ってから再実行してください:"
    error "  git fetch origin && git merge origin/main && git push"
    exit 1
  fi

  # 実行中・待機中の check も待つ。private repo + Free plan では GitHub 側の
  # required check 強制が効かないため、ここで止めないと CI 完了前にマージできてしまう。
  # 畳み込み側の is_pending（§ROLLUP）と同じ集合にする。片方だけ直すと
  # 「代表は pending だが件数は 0」のようなズレが出る。`expected` は
  # StatusState の「status 到着待ち」で、failure でも success でもない。
  PENDING_CHECKS="$(printf '%s' "$ROLLUP" | jq -r '
    map(select(
        ((.status // "") | ascii_downcase | . == "in_progress" or . == "queued" or . == "pending" or . == "waiting" or . == "requested")
        or ((.state // "") | ascii_downcase | . == "pending" or . == "expected")
      ))
    | length')"

  if [[ "$PENDING_CHECKS" != "0" ]]; then
    error "実行中の check が $PENDING_CHECKS 件あります。完了を待ってから再実行してください。"
    error "gh pr checks $PR_NUMBER --watch で完了を待てます。"
    exit 1
  fi

  # 検証が実際に行われたことを確認する。statusCheckRollup が空、または全ての
  # check が skipped の場合、上の failure / pending 判定はどちらも 0 件になり
  # 「CI が 1 本も走っていない PR」を green と区別できないまま素通りする。
  # private repo + Free plan では GitHub 側の required check 強制が効かないため、
  # ここが唯一の防波堤になる。
  #
  # ci.yml は docs のみの変更なら paths-ignore で skip されるので、「CI が
  # 走らない PR」自体は異常ではない。ただし Docs Guard は paths フィルタを持たず
  # 全 PR で走るため、success が 1 件も無い状態は構成の異常を意味する。
  SUCCESS_CHECKS="$(printf '%s' "$ROLLUP" | jq -r '
    map(select(
        ((.conclusion // "") | ascii_downcase | . == "success")
        or ((.state // "") | ascii_downcase | . == "success")
      ))
    | length')"

  if [[ "$SUCCESS_CHECKS" == "0" ]]; then
    error "成功した check が 1 件もありません。マージを中止します。"
    error "CI が未登録、全て skip、または check 登録前の可能性があります。"
    error "gh pr checks $PR_NUMBER で状態を確認してください。"
    exit 1
  fi

  # **product / web の build は Vercel でしか検証されない。** Actions 側の無条件
  # build は 2026-08-03 に撤去し、Next build と bundle 検査（secret 混入 /
  # JS budget / CSS budget）は `apps/product/vercel.json` の buildCommand へ移した
  # （`.claude/rules/workflow.md` §build と bundle 検査は Vercel 側で走る）。
  #
  # このため affected な project の context が **付かなかった場合**、上の「成功 1 件
  # 以上」は Static / Unit / Docs Guard だけで満たされ、build が一度も走らないまま
  # merge できてしまう（fail-open）。status が付かない経路は実在する: Vercel
  # integration の切断・障害、Ignored Build Step の設定、project rename。
  # private repo + Free plan では ruleset の required check を強制できないので、
  # 「あるはずの context が無い」ことをここで能動的に検出する。
  #
  # **どの context を「あるはず」とするかは Impact Resolver が決める**
  # （scripts/ci/impact.mjs。docs/projects/_archive/ci-monorepo-refactor/overview.md §5）。
  # PR の変更ファイルから affected な app を判定し、affected な project の context
  # だけを必須にする。unaffected な project の context 欠落は正常（Vercel の
  # Skip deployment 導入後はこれが通常状態になる）。判定に失敗した場合
  # （files API 不通 / node 不在 / 出力が解釈不能）は従来どおり両方を必須にする
  # （fail closed。Vercel の判定ではなく Dayopt 側の判定を正とする設計原則）。
  step "影響範囲を判定"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  IMPACT_RESOLVER="$SCRIPT_DIR/../ci/impact.mjs"

  IMPACT_PRODUCT="true"
  IMPACT_WEB="true"

  # **rename では移動元（previous_filename）も影響範囲に含める。** 移動先だけを見ると
  # `apps/product/foo.ts` → `docs/foo.ts` の rename が docs-only と判定され、ファイルが
  # 消えた側の app の build を検証しないまま merge できる（fail-open）。
  #
  # 行頭マーカーで「ファイル本体（F）」と「rename 元（P）」を区別する。F の件数を
  # PR の changedFiles と突き合わせ、取得漏れ（後述）を検出するために要る。
  #
  # `|| true` で握り潰さない。`gh api --paginate` はページごとに stdout へ流すため、
  # 2 ページ目以降の失敗では「部分的なファイル一覧 + 非 0 終了」になる。終了コード
  # だけ潰すと不完全な一覧が「取得成功」として通り、後半ページにだけ含まれる
  # app の context を要求しないまま merge できてしまう。
  # 失敗時は空へ明示リセットし、「取得不能 → 両方必須」の経路に合流させる。
  if ! CHANGED_FILES_RAW="$(gh api --paginate "repos/{owner}/{repo}/pulls/$PR_NUMBER/files" \
    --jq '.[] | "F\t\(.filename)", (if .previous_filename then "P\t\(.previous_filename)" else empty end)' 2>/dev/null)"; then
    CHANGED_FILES_RAW=""
  fi

  # **files endpoint は `--paginate` でも 3,000 件で打ち切られ、その状態で成功終了する。**
  # 打ち切りを「完全な一覧」と扱うと、3,000 件目以降にだけ現れる app の context を
  # 要求しないまま merge できる。PR の申告件数と取得件数の一致を要求し、ズレたら
  # fail closed に倒す（3,000 件上限に限らず、あらゆる silent truncation を捕まえる）。
  if [[ -n "$CHANGED_FILES_RAW" ]]; then
    RETRIEVED_FILE_COUNT="$(printf '%s\n' "$CHANGED_FILES_RAW" | grep -c "$(printf '^F\t')" || true)"
    PR_CHANGED_FILES="$(printf '%s' "$PR_JSON" | jq -r '.changedFiles // ""' 2>/dev/null || echo "")"
    if ! [[ "$PR_CHANGED_FILES" =~ ^[0-9]+$ ]] || [[ "$RETRIEVED_FILE_COUNT" != "$PR_CHANGED_FILES" ]]; then
      info "変更ファイル一覧が PR の申告件数と一致しません（取得 $RETRIEVED_FILE_COUNT / 申告 ${PR_CHANGED_FILES:-不明}）。truncation の可能性があるため fail closed にします。"
      CHANGED_FILES_RAW=""
    fi
  fi

  # マーカーを外して resolver へ渡す（先頭は "F<TAB>" / "P<TAB>" の 2 文字）
  CHANGED_FILES=""
  if [[ -n "$CHANGED_FILES_RAW" ]]; then
    CHANGED_FILES="$(printf '%s\n' "$CHANGED_FILES_RAW" | sed "s/^[FP]$(printf '\t')//")"
  fi
  IMPACT_JSON=""
  if [[ -n "$CHANGED_FILES" ]] && command -v node >/dev/null 2>&1; then
    IMPACT_JSON="$(printf '%s\n' "$CHANGED_FILES" | node "$IMPACT_RESOLVER" --stdin 2>/dev/null || true)"
  fi
  if [[ -n "$IMPACT_JSON" ]]; then
    IMPACT_PRODUCT="$(printf '%s' "$IMPACT_JSON" | jq -r '.product' 2>/dev/null || echo true)"
    IMPACT_WEB="$(printf '%s' "$IMPACT_JSON" | jq -r '.web' 2>/dev/null || echo true)"
  else
    info "影響判定を実行できませんでした。fail closed で両方の Vercel context を必須にします。"
  fi
  # Resolver の出力が想定外（jq のエラー文字列・null 等）なら fail closed に倒す。
  # 明示的な "false" だけが必須 context を外せる。
  if [[ "$IMPACT_PRODUCT" != "false" ]]; then IMPACT_PRODUCT="true"; fi
  if [[ "$IMPACT_WEB" != "false" ]]; then IMPACT_WEB="true"; fi

  # 区切り文字は en dash（U+2013）。hyphen ではない。
  # **存在だけでなく success を要求する。** GitHub の StatusState には `EXPECTED`
  # （status の到着待ち）があり、これは上の is_failed にも is_pending にも該当しない。
  # 「context はあるが EXPECTED のまま」を通すと、build 未完了のまま merge できる。
  REQUIRED_CONTEXTS=()
  if [[ "$IMPACT_PRODUCT" == "true" ]]; then REQUIRED_CONTEXTS+=("Vercel – product"); fi
  if [[ "$IMPACT_WEB" == "true" ]]; then REQUIRED_CONTEXTS+=("Vercel – web"); fi

  if [[ ${#REQUIRED_CONTEXTS[@]} -eq 0 ]]; then
    info "app へ影響しない変更のため Vercel context は要求しません（docs / scripts / CI 設定等）。"
  else
    info "必須 Vercel context: ${REQUIRED_CONTEXTS[*]}"
  fi

  for required in ${REQUIRED_CONTEXTS[@]+"${REQUIRED_CONTEXTS[@]}"}; do
    succeeded="$(printf '%s' "$ROLLUP" | jq -r --arg name "$required" '
      map(select(
          ((.name // .context // "")) == $name
          and (
            ((.conclusion // "") | ascii_downcase | . == "success")
            or ((.state // "") | ascii_downcase | . == "success")
          )
        ))
      | length')"
    if [[ "$succeeded" == "0" ]]; then
      present="$(printf '%s' "$ROLLUP" | jq -r --arg name "$required" '
        map(select(((.name // .context // "")) == $name)) | length')"
      if [[ "$present" == "0" ]]; then
        error "必須 check「${required}」が 1 件も見つかりません。マージを中止します。"
        error "Vercel integration の接続、Ignored Build Step の有無、project 名を確認してください。"
      else
        error "必須 check「${required}」が success ではありません。マージを中止します。"
        error "EXPECTED（status 到着待ち）のまま放置されている可能性があります。"
      fi
      error "product / web の build はこの check でしか検証されません（Actions 側の build は撤去済み）。"
      exit 1
    fi
  done

  # ── レビュー thread の解決を要求する ────────────────────────────────
  #
  # レビュー（内製クロスレビュー等）の指摘 thread が未解決のまま merge できると、指摘の
  # 黙殺が構造的に可能になる。「解決」は 3 択のいずれか: ① fix を積んで resolve、
  # ② 反論・根拠を reply して resolve、③ 別 issue へ切り出し番号を reply して
  # resolve（`.claude/rules/workflow.md` §レビュー指摘の必須解決）。
  #
  # thread の resolve 状態は GraphQL の reviewThreads にしか無い（REST には出ない）。
  # 取得に失敗した場合は「未確認のまま通す」ではなく停止に倒す（fail closed）。
  #
  # **`reviewThreads` は `pageInfo` の `hasNextPage` / `endCursor` で全ページを走査する。**
  # 旧実装は first: 100 を 1 回だけ引き、hasNextPage が true なら「全件確認できない」
  # として即停止していた。PR #1820（thread 101 件・未解決 0 件）が実際にこれで
  # 止まり、手動フォールバックを強いられた（issue #1831）。暴走防止の上限は件数
  # ではなくページ数 MAX_THREAD_PAGES に置く（first:100 × 20 = 最大 2000 件）。
  # この上限に達してもなお hasNextPage が true の場合だけ「全件確認できない」と
  # して停止する。
  step "レビュー thread の解決状態を確認"

  NAME_WITH_OWNER="$(gh api "repos/{owner}/{repo}" --jq '.full_name' 2>/dev/null || true)"

  MAX_THREAD_PAGES=20
  THREAD_FETCH_FAILED=false
  THREAD_PAGES_TRUNCATED=false
  THREAD_PAGE_JSONS=()

  if [[ "$NAME_WITH_OWNER" == */* ]]; then
    THREAD_OWNER="${NAME_WITH_OWNER%%/*}"
    THREAD_NAME="${NAME_WITH_OWNER##*/}"
    THREAD_CURSOR=""
    THREAD_PAGE=0

    while true; do
      THREAD_PAGE=$((THREAD_PAGE + 1))

      # 1 ページ目は cursor 変数を持たないクエリを使う（従来の shape を変えない）。
      # 2 ページ目以降は `after: $cursor` を持つ別クエリで続きを取る。
      if [[ -z "$THREAD_CURSOR" ]]; then
        THREAD_PAGE_JSON="$(gh api graphql \
          -f query='query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                reviewThreads(first: 100) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    isResolved
                    path
                    comments(first: 1) { nodes { author { login } } }
                  }
                }
              }
            }
          }' \
          -f owner="$THREAD_OWNER" \
          -f name="$THREAD_NAME" \
          -F number="$PR_NUMBER" 2>/dev/null || true)"
      else
        THREAD_PAGE_JSON="$(gh api graphql \
          -f query='query($owner: String!, $name: String!, $number: Int!, $cursor: String!) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                reviewThreads(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    isResolved
                    path
                    comments(first: 1) { nodes { author { login } } }
                  }
                }
              }
            }
          }' \
          -f owner="$THREAD_OWNER" \
          -f name="$THREAD_NAME" \
          -F number="$PR_NUMBER" \
          -f cursor="$THREAD_CURSOR" 2>/dev/null || true)"
      fi

      # このページの hasNextPage / endCursor だけを取り出す。reviewThreads 自体が
      # null（pullRequest が見つからない等）なら select が空を返し、fail closed に倒す。
      THREAD_PAGE_INFO="$(printf '%s' "$THREAD_PAGE_JSON" | jq -r '
        .data.repository.pullRequest.reviewThreads
        | select(. != null)
        | "\(.pageInfo.hasNextPage) \(.pageInfo.endCursor // "")"' 2>/dev/null || true)"

      if [[ -z "$THREAD_PAGE_INFO" ]]; then
        THREAD_FETCH_FAILED=true
        break
      fi

      THREAD_HAS_NEXT="${THREAD_PAGE_INFO%% *}"
      THREAD_NEXT_CURSOR="${THREAD_PAGE_INFO#* }"

      if [[ "$THREAD_HAS_NEXT" != "true" && "$THREAD_HAS_NEXT" != "false" ]]; then
        # hasNextPage が欠落した等、想定外の形。停止はするが誤診断のメッセージを出さない。
        THREAD_FETCH_FAILED=true
        break
      fi

      THREAD_PAGE_JSONS+=("$THREAD_PAGE_JSON")

      if [[ "$THREAD_HAS_NEXT" != "true" ]]; then
        break
      fi

      if [[ "$THREAD_PAGE" -ge "$MAX_THREAD_PAGES" ]]; then
        THREAD_PAGES_TRUNCATED=true
        break
      fi

      THREAD_CURSOR="$THREAD_NEXT_CURSOR"
    done
  else
    THREAD_FETCH_FAILED=true
  fi

  if [[ "$THREAD_FETCH_FAILED" == true ]]; then
    error "レビュー thread の状態を取得できませんでした。マージを中止します（fail closed）。"
    error "gh の認証とネットワークを確認して再実行してください。"
    exit 1
  fi

  if [[ "$THREAD_PAGES_TRUNCATED" == true ]]; then
    error "レビュー thread が ${MAX_THREAD_PAGES} ページ（最大 $((MAX_THREAD_PAGES * 100)) 件）を超えており全件を確認できません。マージを中止します。"
    exit 1
  fi

  # 全ページの nodes を 1 つの配列へ結合する。個々のページの失敗は上の
  # THREAD_FETCH_FAILED で既に停止しているため、ここでの失敗は
  # 「配列を組み立てられない」想定外の形が混入した場合のみで、同じく fail closed にする。
  # 配列展開は bash 3.2 + set -u の空配列 unbound 対策で ${arr[@]+...} 形にする
  # （現経路では空で到達しないが、将来の経路追加で壊れないよう既存パターンに揃える）。
  ALL_THREADS_JSON="$(printf '%s\n' ${THREAD_PAGE_JSONS[@]+"${THREAD_PAGE_JSONS[@]}"} | jq -s '
    [.[] | .data.repository.pullRequest.reviewThreads.nodes[]]' 2>/dev/null || true)"

  if [[ -z "$ALL_THREADS_JSON" ]]; then
    error "レビュー thread の状態を取得できませんでした。マージを中止します（fail closed）。"
    error "gh の認証とネットワークを確認して再実行してください。"
    exit 1
  fi

  UNRESOLVED_THREADS="$(printf '%s' "$ALL_THREADS_JSON" | jq -r '[.[] | select(.isResolved | not)] | length')"

  if [[ "$UNRESOLVED_THREADS" != "0" ]]; then
    error "未解決のレビュー thread が $UNRESOLVED_THREADS 件あります。マージを中止します。"
    printf '%s' "$ALL_THREADS_JSON" | jq -r '
      .[]
      | select(.isResolved | not)
      | "    - \(.path // "(general)")（\(.comments.nodes[0].author.login // "unknown")）"' >&2 || true
    error "解決は 3 択: fix を積む / 反論を reply / issue 化して番号を reply。いずれも thread を resolve してから再実行してください。"
    exit 1
  fi

  info "未解決のレビュー thread はありません。"

  # ── 内製クロスレビューが実際に回ったことを要求する ──────────────────────
  #
  # 上の thread gate は「**存在する** 指摘 thread が resolve 済みか」しか見ない。
  # thread が 0 件の PR は素通りするため、「レビューされて指摘ゼロだった PR」と
  # 「レビューを投げ忘れた PR」が機械には同じに見える。外部レビュー（Codex）廃止
  # （2026-08-13、`AGENTS.md` 冒頭の凍結注記）により、レビューは指揮台が発火する
  # `pr-cross-review` スキル（`.claude/skills/pr-cross-review/SKILL.md`）が担う。
  #
  # **痕跡は `[internal-review]` marker 付き comment 1 経路のみで判定する。**
  # 旧設計（Codex 応答）は「結果によって出力先が変わる第三者の挙動」に対応する
  # ため review / reviewThreads / comment の 3 経路を見ていたが、内製レビューは
  # 自分で出力先を決められるため経路分岐の理由が消える。P1/P2 指摘そのものは
  # pr-cross-review スキルが inline review comment として投稿し、上の thread gate
  # で resolve を強制される。ここで見る `[internal-review]` comment は「実施した
  # という証跡」のみを担う、二層構造の 1 層目。
  step "内製クロスレビューの痕跡を確認"

  INTERNAL_REVIEW_MARKER="[internal-review]"

  # comment は `last:` で引く。marker は merge 直前に置かれるため、古い側を切り
  # 落とす `first:` より取りこぼしにくい。100 件を超える PR では古い痕跡が窓から
  # 落ちうるので totalCount も取り、「痕跡なし」で止める時に窓の切り詰めが起きて
  # いたかを伝える。取得失敗は「未確認のまま通す」ではなく停止に倒す（fail closed）。
  REVIEW_EVIDENCE_JSON="$(gh api graphql \
    -f query='query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          comments(last: 100) { totalCount nodes { author { login } authorAssociation body } }
        }
      }
    }' \
    -f owner="$THREAD_OWNER" \
    -f name="$THREAD_NAME" \
    -F number="$PR_NUMBER" 2>/dev/null || true)"

  # marker の 5 点チェック。**この判定は意図的に厳しくする。**
  # 素朴な「body に marker を含む」だと、gate 自身が出す停止メッセージや
  # workflow.md の規約本文を PR コメントへ貼っただけで gate が黙って無効化される
  # （引用・stderr の貼り付け・この diff のレビュー依頼など、日常操作で踏む）。
  #   1. コメント**本文の先頭**が marker であること（引用行は `>` で始まるので落ちる）
  #   2. 書き手が OWNER / MEMBER / COLLABORATOR であること（bot と第三者は NONE。
  #      この repo は public なので、任意のユーザーがコメントできる）
  #   3. marker を除いた本文が空でないこと
  #   4. `head: <sha>` 行があり、値が今回の merge に使う $HEAD_SHA と完全一致する
  #      こと。早い段階で貼った marker を使い回し、その後の未レビュー push を
  #      素通りさせる抜け道を塞ぐ（$HEAD_SHA は L120 で取得し、merge 実行時にも
  #      同じ変数を使う。§マージ実行 参照）
  #   5. `agent: <値>` 行があり非空であること。値そのものは自己申告であり機械
  #      検証しない（OWNER/MEMBER/COLLABORATOR しか投稿できないことが唯一の
  #      担保。`pr-cross-review` スキル参照）
  INTERNAL_REVIEW_EVIDENCE_COUNT="$(printf '%s' "$REVIEW_EVIDENCE_JSON" | jq -r \
    --arg marker "$INTERNAL_REVIEW_MARKER" \
    --arg headSha "$HEAD_SHA" '
    .data.repository.pullRequest
    | select(. != null)
    | select(.comments != null)
    | [
        .comments.nodes[]
        | select(.authorAssociation == "OWNER"
                 or .authorAssociation == "MEMBER"
                 or .authorAssociation == "COLLABORATOR")
        | ((.body // "") | gsub("\r"; "") | sub("^[[:space:]]+"; ""))
        | select(startswith($marker))
        | select(ltrimstr($marker) | test("[^[:space:]]"))
        | select(test("(?m)^head:[ \\t]*" + $headSha + "[ \\t]*$"))
        | select(test("(?m)^agent:[ \\t]*\\S"))
      ]
    | length' 2>/dev/null || true)"

  # 窓（last: 100）より多い comments を持つ PR かどうか。停止時の説明にだけ使い、
  # 判定そのものは緩めない（切り詰めを理由に通すと fail open になる）。
  REVIEW_WINDOW_TRUNCATED="$(printf '%s' "$REVIEW_EVIDENCE_JSON" | jq -r '
    .data.repository.pullRequest
    | select(. != null)
    | ((.comments.totalCount // 0) > 100)' 2>/dev/null || true)"

  # 数値以外（取得失敗・null 混入・部分出力）は「痕跡あり」に読み替えられないよう
  # 停止に倒す。`-z` だけの判定にすると、想定外の文字列が "0 でない" として
  # 素通りしてしまう。
  if [[ ! "$INTERNAL_REVIEW_EVIDENCE_COUNT" =~ ^[0-9]+$ ]]; then
    error "内製クロスレビューの痕跡を取得できませんでした。マージを中止します（fail closed）。"
    error "gh の認証とネットワークを確認して再実行してください。"
    exit 1
  fi

  if [[ "$INTERNAL_REVIEW_EVIDENCE_COUNT" == "0" ]]; then
    error "この PR には内製クロスレビューの痕跡がありません。マージを中止します。"
    error "指揮台が pr-cross-review スキルでクロスレビューを実行し、1 行目を"
    error "「${INTERNAL_REVIEW_MARKER}」で始めるコメントを投稿してから再実行してください。"
    error "コメントには \`head: <現在の HEAD SHA>\` 行と \`agent: <実行 agent 名>\` 行が必要です。"
    error "（.claude/skills/pr-cross-review/SKILL.md、.claude/rules/workflow.md §内製クロスレビューの実施を要求する gate）"
    if [[ "$REVIEW_WINDOW_TRUNCATED" == "true" ]]; then
      error "なお、この PR は comments が 100 件を超えており、直近 100 件しか見ていません。"
      error "実際にはレビュー済みで、痕跡が窓の外に落ちている可能性があります。"
    fi
    error "push 直後で marker がまだ最新 commit を指していない場合は、delta re-review を行い"
    error "新しい HEAD SHA を指す marker を投稿し直してください（HEAD が変わると古い marker は無効になります）。"
    exit 1
  fi

  # ── marker の申告と review thread の実在を突き合わせる（二層 AND の機械強制） ──
  #
  # marker 自体は自己申告であり、`P1: 3 件` と書いて実際には review comment を
  # 1 件も投稿しないことを機械的には防げない（gate は marker の 5 点チェックしか
  # 見ないため）。marker が P1 または P2 で非ゼロ件数を申告しているのに review
  # thread が 1 件も存在しない場合は、指摘を投稿し忘れている疑いが強いため停止する。
  # thread は既に全ページ取得済み（$ALL_THREADS_JSON）なので再取得しない。
  INTERNAL_REVIEW_CLAIMS_FINDINGS="$(printf '%s' "$REVIEW_EVIDENCE_JSON" | jq -r \
    --arg marker "$INTERNAL_REVIEW_MARKER" \
    --arg headSha "$HEAD_SHA" '
    def zerolike:
      gsub("^[ \t]+|[ \t]+$"; "")
      | test("^(0|0件|0 件|なし|[Nn]one)$");
    .data.repository.pullRequest
    | select(. != null)
    | select(.comments != null)
    | [
        .comments.nodes[]
        | select(.authorAssociation == "OWNER"
                 or .authorAssociation == "MEMBER"
                 or .authorAssociation == "COLLABORATOR")
        | ((.body // "") | gsub("\r"; "") | sub("^[[:space:]]+"; ""))
        | select(startswith($marker))
        | select(ltrimstr($marker) | test("[^[:space:]]"))
        | select(test("(?m)^head:[ \\t]*" + $headSha + "[ \\t]*$"))
        | select(test("(?m)^agent:[ \\t]*\\S"))
        | ( (capture("(?m)^P1:[ \\t]*(?<v>[^\\n\\r]*)") // {v:""}).v ) as $p1
        | ( (capture("(?m)^P2:[ \\t]*(?<v>[^\\n\\r]*)") // {v:""}).v ) as $p2
        | [$p1, $p2] | any(. != "" and (zerolike | not))
      ]
    | any' 2>/dev/null || true)"

  ALL_THREADS_COUNT="$(printf '%s' "$ALL_THREADS_JSON" | jq -r 'length' 2>/dev/null || true)"
  if [[ ! "$ALL_THREADS_COUNT" =~ ^[0-9]+$ ]]; then
    ALL_THREADS_COUNT=0
  fi

  if [[ "$INTERNAL_REVIEW_CLAIMS_FINDINGS" == "true" && "$ALL_THREADS_COUNT" == "0" ]]; then
    error "marker が P1 または P2 の指摘ありと申告していますが、review thread が 1 件もありません。マージを中止します。"
    error "P1/P2 は inline review comment として投稿し review thread を生成する必要があります"
    error "（.claude/skills/pr-cross-review/SKILL.md 手順 5）。summary コメントに件数だけ書いて"
    error "review comment の投稿を忘れていないか確認してください。"
    exit 1
  fi

  info "内製クロスレビューの痕跡を確認しました。"

  # マージは REST を直叩きする。`gh pr merge` は「削除対象 branch が current」だと
  # **実行元の worktree を main へ切り替えてから** ローカル branch を削除するため、
  # 並行セッション環境では実行元の足元と main checkout を壊す（#1771 の症状①）。
  # gh api なら構造的にローカル git へ触れない。
  #
  # sha を渡して check gate 通過後の push を弾く（`gh pr merge --match-head-commit` 相当）。
  # 渡さないと、gate を見てからマージするまでの間に積まれた未検証 commit ごとマージしうる。
  # dry-run の表示と実行を同じ配列から作る。手書きで二重に持つと、実行側から
  # `sha=` が落ちても dry-run 側が残っている限り test が pass してしまう。
  MERGE_ARGS=(-X PUT "repos/{owner}/{repo}/pulls/$PR_NUMBER/merge"
    -f merge_method=merge -f "sha=$HEAD_SHA")
  DELETE_REF_ARGS=(-X DELETE "repos/{owner}/{repo}/git/refs/heads/$BRANCH")

  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] gh api ${MERGE_ARGS[*]}" >&2
    echo "   [dry-run] gh api ${DELETE_REF_ARGS[*]}" >&2
  else
    if ! gh api "${MERGE_ARGS[@]}" >/dev/null; then
      error "PR #$PR_NUMBER のマージに失敗しました。"
      error "gh pr view $PR_NUMBER で状態を確認してください（head が更新された可能性があります）。"
      exit 1
    fi
    info "マージしました。リモート branch を削除します。"
    # repo 設定は deleteBranchOnMerge: true だが、設定変更で掃除が静かに止まらないよう
    # 明示的にも削除する。既に消えていれば 422 になるので失敗は無視してよい
    # （残存した場合は step 8 が fetch --prune 後に検証する）。
    gh api "${DELETE_REF_ARGS[@]}" >/dev/null 2>&1 || true
  fi
else
  info "PR は既にクローズ済みのためマージ手順はスキップします。"
fi

# ── 3. 該当 branch の worktree を特定 ────────────────────────────────
step "worktree を特定"

# `git worktree list --porcelain` を解析し branch が一致する worktree path を得る
WORKTREE_PATH="$(git worktree list --porcelain | awk -v br="refs/heads/$BRANCH" '
  /^worktree / { path = substr($0, 10) }
  /^branch / && $2 == br { print path; exit }
')"

if [[ -n "$WORKTREE_PATH" ]]; then
  info "worktree: $WORKTREE_PATH"
else
  info "この branch に紐づく worktree はありません。"
fi

# ── 4. worktree の dirty 確認 ───────────────────────────────────────
if [[ -n "$WORKTREE_PATH" ]]; then
  step "worktree の未コミット差分を確認"

  DIRTY="$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null || true)"

  if [[ -n "$DIRTY" ]]; then
    # tracked ファイルの差分があるかを判定する。
    # gitignore された生成物（--porcelain には出ない）ではなく、
    # tracked の変更や未追跡ファイルが残っている場合はユーザー作業として扱う。
    error "worktree に未コミットの差分があります。掃除を中止します。"
    error "内容を確認してください: git -C \"$WORKTREE_PATH\" status"
    printf '%s\n' "$DIRTY" | sed 's/^/    /' >&2
    exit 1
  fi

  info "差分なし。削除して問題ありません。"
fi

# ── 5. worktree 削除 ────────────────────────────────────────────────
if [[ -n "$WORKTREE_PATH" ]]; then
  step "worktree を削除"
  # gitignore された生成物（.next/ 等）だけが残って remove が拒否される場合に備え、
  # dirty 確認（step 4）を通過している前提で --force を付ける。
  run git worktree remove --force "$WORKTREE_PATH"
fi

# 孤児化した worktree 管理情報をここで掃除する（step 6 より前に行う）。
# 次の step は worktree list から main の checkout 先を探すため、ディレクトリが
# 消えた worktree の entry が残っていると、存在しない path へ pull を試みて
# main を更新できなくなる。
run git -C "$MAIN_ROOT" worktree prune

# ── 6. main を最新化（branch 削除より先に行う） ─────────────────────
# マージは REST 経由なので、この時点ではローカル main にマージコミットが無い。
# 先に main を最新化しておくと、マージコミットの第2親 = branch 先端がローカル main
# から辿れるようになり、続く step 7 の判定が「マージ済み」を正しく返す。
#
# **checkout は使わない。** main checkout が別セッションの branch にいる場合、
# `checkout main` はそれを奪って切り替えてしまう（#1771 の症状②）。
# 代わりに main を checkout 中の worktree を探し、その場で ff pull する。
# どこも checkout していなければローカル ref だけを fast-forward する。
step "main を最新化"

# fetch も止めない。ここで落ちると worktree を消した直後の中途半端な状態で終わる。
run git -C "$MAIN_ROOT" fetch --prune origin ||
  info "origin の fetch に失敗しました（続行します）。"

# main を checkout している worktree を探す（step 3 と同じ porcelain 解析）
MAIN_WORKTREE="$(git -C "$MAIN_ROOT" worktree list --porcelain | awk '
  /^worktree / { path = substr($0, 10) }
  /^branch / && $2 == "refs/heads/main" { print path; exit }
')"

# 更新に失敗しても止めない。ここは掃除の前準備であってマージゲートではなく、
# main が古いままなら step 7 の ancestor 判定が偽になって fail-closed に停止する。
if [[ -n "$MAIN_WORKTREE" ]]; then
  info "main は $MAIN_WORKTREE が checkout 中です。その worktree で fast-forward します。"
  run git -C "$MAIN_WORKTREE" pull --ff-only origin main ||
    info "main の pull に失敗しました（続行します）。"
else
  # checkout 中の branch には fetch できないため、この分岐でのみ ref 直更新が使える。
  # force refspec（+main:main）は使わない。diverge した異常系を握り潰さないため。
  info "main はどの worktree でも checkout されていません。ローカル ref のみ更新します。"
  run git -C "$MAIN_ROOT" fetch origin main:main ||
    info "main ref の更新に失敗しました（続行します）。"
fi

# ── 7. ローカル branch を削除 ───────────────────────────────────────
step "ローカル branch を削除"

if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  # -d は merge 済みなら成功する。まずこれを試し、通常系の挙動は変えない。
  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] git -C \"$MAIN_ROOT\" branch -d ${BRANCH}（失敗時は main への到達を確認）" >&2
  elif ! git -C "$MAIN_ROOT" branch -d "$BRANCH" 2>"$BRANCH_ERR_FILE"; then
    # `branch -d` は **HEAD に対して** マージ済みかを見る。main checkout が別 branch に
    # いると、main へ完全にマージ済みの branch でも not fully merged で拒否される
    # （#1771 の症状③）。main を基準に直接判定し直す。
    #
    # ref は完全修飾する（`main` だけだと同名 tag が branch より先に解決される）。
    # ローカル main と origin/main の両方を見るのは、step 6 の main 更新が非致命だから。
    # origin/main は fetch 済みで、どちらから到達できてもマージ済みの証明になる。
    if git -C "$MAIN_ROOT" merge-base --is-ancestor "refs/heads/$BRANCH" refs/heads/main 2>/dev/null ||
      git -C "$MAIN_ROOT" merge-base --is-ancestor "refs/heads/$BRANCH" refs/remotes/origin/main 2>/dev/null; then
      # branch の全 commit が main から辿れる = 「main へ完全にマージ済み」の直接証明。
      # -d の HEAD 基準ヒューリスティックより強い条件を確認済みなので、この -D は
      # 未マージ branch の強制削除ではなく -d の偽陰性の訂正にあたる。
      info "HEAD 基準では未マージ扱いですが、main への到達を確認しました。削除します。"
      git -C "$MAIN_ROOT" branch -D "$BRANCH"
    else
      cat "$BRANCH_ERR_FILE" >&2 || true
      error "branch '$BRANCH' は main に到達しておらず削除できません。"
      error "ローカル main が origin/main より古い可能性があります。step 6 の出力を確認してください。"
      error "本当にマージ済みかを確認してから対処してください（-D 強制は避ける）。"
      exit 1
    fi
  fi
else
  info "ローカル branch '$BRANCH' は既にありません。"
fi

# ── 8. リモート branch の消滅を確認 ─────────────────────────────────
# step 6 の fetch --prune で origin/<branch> は消えているはず。
# 万一 --delete-branch が効かず残っていれば明示的に削除する。
step "リモート branch を確認"

REMOTE_BRANCH_REMAINS=false

if [[ "$DRY_RUN" == false ]]; then
  if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    info "リモートに origin/$BRANCH が残っています。削除します。"
    git -C "$MAIN_ROOT" push origin --delete "$BRANCH" ||
      error "リモート branch の削除に失敗しました。"
  fi

  # 削除コマンドの成否ではなく、実際に消えたかをリモートへ問い合わせて確認する
  # （完了定義④）。確認自体に失敗した場合は「未確認」ではなく「残存」に倒す。
  if REMOTE_HEADS="$(git -C "$MAIN_ROOT" ls-remote --heads origin "$BRANCH" 2>/dev/null)"; then
    if [[ -n "$REMOTE_HEADS" ]]; then
      REMOTE_BRANCH_REMAINS=true
    else
      info "リモート branch は消滅済みです。"
    fi
  else
    error "リモート branch の消滅を確認できませんでした。"
    REMOTE_BRANCH_REMAINS=true
  fi
fi

# ── 9. サマリー ─────────────────────────────────────────────────────
step "完了"

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run のため実際の変更は行っていません。"
else
  # 完了していない項目があるなら ✅ を出さない。この出力は AI / 人間が
  # 「作業終了」の判定に使うため、未達を伏せると積み残しがそのまま流れる。
  if [[ "$REMOTE_BRANCH_REMAINS" == true ]]; then
    error "リモート branch origin/$BRANCH が残っています（完了定義④が未達）。"
    error "手動で削除してください: git -C \"$MAIN_ROOT\" push origin --delete $BRANCH"
    exit 1
  fi

  echo "✅ PR #$PR_NUMBER を片付けました:" >&2
  echo "   - branch: ${BRANCH}（ローカル / リモートとも削除）" >&2
  [[ -n "$WORKTREE_PATH" ]] && echo "   - worktree: ${WORKTREE_PATH}（削除）" >&2

  # 完了定義⑤: ローカル main ref が origin/main と一致していること。
  # main checkout がどの branch にいるかは問わない（別セッションの作業を尊重する）。
  # ref は完全修飾する（同名 tag があると `main` は branch より先にそちらを指す）。
  LOCAL_MAIN="$(git -C "$MAIN_ROOT" rev-parse --verify --quiet refs/heads/main || echo unknown)"
  REMOTE_MAIN="$(git -C "$MAIN_ROOT" rev-parse --verify --quiet refs/remotes/origin/main || echo unknown)"
  echo "   - main HEAD: ${LOCAL_MAIN:0:7}" >&2

  if [[ "$LOCAL_MAIN" == "$REMOTE_MAIN" && "$LOCAL_MAIN" != "unknown" ]]; then
    echo "   - ローカル main は origin/main と一致しています" >&2
  else
    info "ローカル main が origin/main と一致していません（local: ${LOCAL_MAIN:0:7} / remote: ${REMOTE_MAIN:0:7}）。"
    if [[ -n "$MAIN_WORKTREE" ]]; then
      # main が checkout 中の branch には fetch できないため、pull を案内する。
      info "取り込んでください: git -C \"$MAIN_WORKTREE\" pull --ff-only origin main"
    else
      info "取り込んでください: git -C \"$MAIN_ROOT\" fetch origin main:main"
    fi
  fi
fi

echo "" >&2
echo "残っている worktree:" >&2
git -C "$MAIN_ROOT" worktree list >&2
