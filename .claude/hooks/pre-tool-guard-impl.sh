#!/bin/bash
# PreToolUse hook の実ロジック（exit 2 = block）。呼び出し元は薄い loader
# （.claude/hooks/pre-tool-guard.sh、#1961）で、settings.json はそちらを登録する。
# Write/Edit → ファイルパスチェック
# Bash → コマンド内容チェック
#
# この script 自体に構文エラーがあると bash -n が失敗を検出し、loader が
# fail closed へ倒す（復旧のためこのファイルへの Write/Edit だけは例外的に通す。
# 詳細は loader 側のコメント）。変更したら必ず
# `bash -n .claude/hooks/pre-tool-guard-impl.sh` を通すこと。
# scripts/__tests__/pre-tool-guard.test.ts がこれを test として固定している。

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
# NotebookEdit は file_path ではなく notebook_path を使う。file_path が空なら
# notebook_path にフォールバックする（Codex 実測指摘、P1: settings.json の
# PreToolUse matcher に MultiEdit/NotebookEdit が無く、本 hook がそもそも
# 発火していなかった。matcher 側は別途追加済み。ここでは MultiEdit/
# NotebookEdit を対象に含めて判定する）。
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# op run が解決してよい 1Password vault。human（本番キー・login・recovery）と
# ci（CI 用 token）の credential を解決する参照が local dev 用の env-file へ
# 混ざるのを止める。禁止側を数え上げるのではなく許可側を固定するのは、vault が
# 増えた時に穴が開かないようにするため。信頼境界軸の 3 vault 再編（#2086、
# 2026-08-14）で allowlist は agent 1 つに縮んだ。
ALLOWED_VAULT_PATTERN='^op://(agent)$'

# 渡されたテキストに含まれる op:// 参照のうち、allowlist 外の vault を返す。
# vault 名に空白が入る場合は途中で切れるが、切れた形も allowlist に一致しないので
# 落ちる（fail closed）。
disallowed_vault_refs() {
  printf '%s' "$1" \
    | grep -oE 'op://[A-Za-z0-9_.-]+' \
    | sort -u \
    | grep -vE "$ALLOWED_VAULT_PATTERN" || true
}

# このセッションが今立っている working tree の root（GUARD_CURRENT_ROOT）、
# 自分が main checkout かどうか（GUARD_IS_MAIN_CHECKOUT）、家系の**他の**
# worktree の root 一覧（GUARD_OTHER_ROOTS、改行区切り）を返す
# （2026-08-24, #2359）。
#
# 家系の把握は `git worktree list --porcelain` を正とする。dirname(git-common-dir)
# から「家系 root」を 1 つ算出する設計は、worktree が main の配下に nested
# されている（このリポジトリの `.claude/worktrees/<name>` 慣習）前提が
# 崩れる——git worktree は物理的にどこに置いても機能するため、sibling 配置
# （テスト fixture で実際に踏んだ）では nested 前提の prefix 比較が全て
# 素通りしていた。`git worktree list` は物理配置に依存せず家系を正しく
# 列挙する（既存コメントが述べる「path の慣習では見ない」原則をここでも守る）。
#
# main checkout 判定は `--absolute-git-dir` と `--git-common-dir` の比較
# （linked worktree では前者が `<main>/.git/worktrees/<name>` になり食い違う）。
# 空のまま cd に渡すと `cd ""` が成功してカレントに留まり誤判定する実測済みの
# 罠があるため（#1961 由来のコメント参照）、各段階で空チェックしてから cd する。
# 解決できた時だけ 0 を返す。
guard_resolve_roots() {
  GUARD_CURRENT_ROOT=""
  GUARD_IS_MAIN_CHECKOUT=0
  GUARD_OTHER_ROOTS=""
  local toplevel git_dir common_dir line wt_path
  toplevel=$(git rev-parse --show-toplevel 2> /dev/null || true)
  git_dir=$(git rev-parse --absolute-git-dir 2> /dev/null || true)
  common_dir=$(git rev-parse --git-common-dir 2> /dev/null || true)
  if [ -z "$toplevel" ] || [ -z "$git_dir" ] || [ -z "$common_dir" ]; then
    return 1
  fi
  toplevel=$(cd "$toplevel" 2> /dev/null && pwd -P)
  git_dir=$(cd "$git_dir" 2> /dev/null && pwd -P)
  case "$common_dir" in
    /*) ;;
    *) common_dir="$PWD/$common_dir" ;;
  esac
  common_dir=$(cd "$common_dir" 2> /dev/null && pwd -P)
  if [ -z "$toplevel" ] || [ -z "$git_dir" ] || [ -z "$common_dir" ]; then
    return 1
  fi
  GUARD_CURRENT_ROOT="$toplevel"
  if [ "$git_dir" = "$common_dir" ]; then
    GUARD_IS_MAIN_CHECKOUT=1
  fi

  while IFS= read -r line; do
    case "$line" in
      "worktree "*)
        wt_path=${line#worktree }
        wt_path=$(cd "$wt_path" 2> /dev/null && pwd -P)
        [ -n "$wt_path" ] || continue
        [ "$wt_path" = "$GUARD_CURRENT_ROOT" ] && continue
        GUARD_OTHER_ROOTS="$GUARD_OTHER_ROOTS$wt_path
"
        ;;
    esac
  done < <(git worktree list --porcelain 2> /dev/null || true)

  return 0
}

# 引数の絶対パスが「どの worktree root に属するか」を longest-prefix-match
# で判定する（2026-08-24、merge 前クロスレビュー risk-reviewer 指摘: 単純に
# 「CURRENT_ROOT の配下なら自分」を先に見る設計は、このリポジトリの実配置
# （worktree が main の配下に nested される `.claude/worktrees/<name>` 慣習）
# で壊れる——main checkout（CURRENT_ROOT = 家系の親）から見ると、他レーンの
# パスも `$GUARD_CURRENT_ROOT/*` に該当してしまい、より深い一致である他
# worktree root を見る前に「自分の配下、許可」へ倒れて素通りしていた。
# sibling 配置の fixture では検出できず、nested 配置の実測で発覚した）。
#
# 戻り値: 0 = 自分の CURRENT_ROOT に属する（またはどの worktree root にも
# 属さない = scratchpad 等 family 外）。1 = 自分以外の worktree root に属する。
guard_path_belongs_to_current_root() {
  local target="$1"
  local best_len=-1 best_is_current=1
  case "$target" in
    "$GUARD_CURRENT_ROOT"/* | "$GUARD_CURRENT_ROOT")
      best_len=${#GUARD_CURRENT_ROOT}
      best_is_current=1
      ;;
  esac
  local other_root
  while IFS= read -r other_root; do
    [ -n "$other_root" ] || continue
    case "$target" in
      "$other_root"/* | "$other_root")
        if [ ${#other_root} -gt "$best_len" ]; then
          best_len=${#other_root}
          best_is_current=0
        fi
        ;;
    esac
  done <<< "$GUARD_OTHER_ROOTS"
  [ "$best_len" -lt 0 ] && return 0 # どの worktree root にも属さない
  [ "$best_is_current" = "1" ]
}

# --- Write/Edit/MultiEdit/NotebookEdit: 保護ファイルへの書き込みブロック ---
if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "MultiEdit" ] || [ "$TOOL_NAME" = "NotebookEdit" ]; then
  # --- worktree 外ファイル編集ガード（2026-08-24, #2359）---
  # レーンは自分の worktree 外を書き換えない（.claude/rules/ai-behavior.md
  # §Writer ownership）。scratchpad・memory 等 repo 外は対象外（許可）。
  #
  # Write/Edit tool は絶対パスを要求する仕様だが、guard としてそれを信頼せず
  # 正規化する（`..` を含む形や相対パスでのすり抜けを防ぐ、push 前反証レビュー
  # 相当の指摘）。正規化できない場合は block（fail-open にしない）。
  # fail-open にするのは git 自体が家系 root を解決できない時だけ
  # （Write/Edit は高頻度操作のため、git state の些細な乱れで全 Write/Edit が
  # 止まるのを避ける。spawn_task の fail-closed とは非対称——あちらは低頻度・
  # 高価値ターゲットで再試行コストが低い）。
  if [ -n "$FILE_PATH" ]; then
    case "$FILE_PATH" in
      /*) ;;
      *)
        echo "BLOCKED: file_path が絶対パスではありません: $FILE_PATH" >&2
        exit 2
        ;;
    esac
    # ".." path component は理由を問わず block する（symlink 解決に頼らず、
    # 存在しないディレクトリでも traversal による worktree 脱出を閉じるため。
    # Write/Edit tool が正当な理由で ".." を使う必要は無い）。
    case "$FILE_PATH" in
      *"/../"* | *"/..")
        echo "BLOCKED: file_path に .. が含まれています（traversal は許可しません）: $FILE_PATH" >&2
        exit 2
        ;;
    esac
    # 親ディレクトリが存在すれば pwd -P で symlink まで含めて正規化する。
    # まだ存在しない（新規サブディレクトリの作成）場合は正規化をスキップし
    # FILE_PATH をそのまま使う——上で ".." は既に排除済みなので安全。
    # 既知の境界（merge 前クロスレビュー P3、記録のみで対処しない）: `pwd -P`
    # はディレクトリ symlink しか解決しない。自 worktree 内に他 worktree の
    # ファイルを指す symlink（basename 側）を事前に作っておけば、その
    # symlink への Write は境界を越えて書ける。この経路は敵対的な自己攻撃
    # にしか使えず（他人が事前に自分の worktree に symlink を仕込むことは
    # できない）、Writer ownership guard が防ぐ「事故」の脅威モデルの外。
    guard_dir_part=$(dirname "$FILE_PATH")
    guard_base_part=$(basename "$FILE_PATH")
    guard_resolved_dir=$(cd "$guard_dir_part" 2> /dev/null && pwd -P)
    if [ -n "$guard_resolved_dir" ]; then
      GUARD_NORMALIZED_FILE_PATH="$guard_resolved_dir/$guard_base_part"
    else
      GUARD_NORMALIZED_FILE_PATH="$FILE_PATH"
    fi

    if guard_resolve_roots; then
      # longest-prefix-match で「このパスは実際にどの worktree に属するか」
      # を判定する（指揮台が他レーンへ書き込む場合も、レーンが他レーンへ
      # 書き込む場合も、同じ判定で一律に閉じる。物理配置に依存しない）。
      if ! guard_path_belongs_to_current_root "$GUARD_NORMALIZED_FILE_PATH"; then
        echo "BLOCKED: 自分の worktree（$GUARD_CURRENT_ROOT）の外を編集しようとしています: $GUARD_NORMALIZED_FILE_PATH（.claude/rules/ai-behavior.md §Writer ownership、.claude/rules/workflow.md §main checkout の役割）" >&2
        exit 2
      fi
    fi
  fi

  # night-watch（DAYOPT_NIGHT_WATCH=1）は書き込み系 tool を無条件で禁止する。
  #
  # 層2（RemoteTrigger の session_context.allowed_tools から Write/Edit/
  # MultiEdit/NotebookEdit を除外する設定）が唯一の防御だと、その設定が漏れた
  # 場合に agent が scripts/ci/night-watch/*.mjs（下の Bash 節が prefix 一致で
  # 信頼している node script）や本 hook 自体を書き換えてから、その信頼された
  # コマンド名で実行するだけで任意コード実行 / guard 自体の無効化に到達できる
  # （push 前反証レビュー risk-reviewer 指摘、medium）。SKILL.md が明言する
  # 「夜は書かない。アプリコード・docs は変更しない」を、path で数え上げる
  # denylist ではなく class ごと閉じる形（書き込み系 tool を丸ごと拒否）で
  # 機械強制する。**MultiEdit / NotebookEdit も対象に含める**（Codex 実測
  # 指摘、P1: `.claude/settings.json` の PreToolUse matcher にこの 2 tool が
  # 元々登録されておらず、本 hook 自体が発火していなかった。matcher は
  # 別途追加済みで、ここは判定側の対応）。env var が無いセッション
  # （通常の全レーン）には一切影響しない。
  if [ "${DAYOPT_NIGHT_WATCH:-}" = "1" ]; then
    echo "BLOCKED: night-watch モードでは Write/Edit/MultiEdit/NotebookEdit は一切実行できません（読み取り専用の観測・GitHub issue への書き込みのみが許可されています。.claude/skills/night-watch/SKILL.md §権限の構造的強制 参照）" >&2
    exit 2
  fi

  # .env ファイルへの書き込みは全面禁止（.env.example は 2026-08-14 に廃止。
  # 変数一覧の正本は scripts/tasks/env/schema.ts）
  case "$FILE_PATH" in
    *.env | *.env.* | *.envrc)
      echo "BLOCKED: .env系ファイルへの書き込みは禁止です" >&2
      exit 2
      ;;
  esac

  # .op-env.human / .op-env.human.example は human vault（旧 Dayopt-Production）の service role
  # key を op run で解決する参照 path のみを持ち、実秘密は含まない（#1993）。
  # 読み書き・作成は解禁し、境界は「消費」だけに絞る。消費ブロックは下の Bash
  # 側（--env-file が .op-env.human 系を指す実行）が担う。ここで Write/Edit を
  # 止めても、agent が中身を書けるだけで production へ到達するわけではない。

  # local dev 用の env-file へ production vault の参照が混ざるのを発生源で止める。
  # 消費側の allowlist は「どのファイルか」しか見ないため、許可 path の中身を
  # 書き換えるだけで production credential に到達できる。到達自体は下の Bash 側でも
  # 落とすが、そちらは agent が op run を直接打つ場面でしか発火しない
  # （pnpm typecheck:op などは npm script の内側で op run するので hook から見えない）。
  # 書き足しそのものをここで止める。
  # .op-env.human.example は設計上 op://human/... を持つので対象外。
  # 旧名（.op-env.local 系）も検査対象に残す: User のローカルに手動移行まで
  # 旧名ファイルが残り、消費は allowlist で落ちるが「許可外 vault を書き込む」
  # 発生源だけが検査の空白になるため（#2086 反証レビュー）
  case "$FILE_PATH" in
    *.op-env.agent | *.op-env.agent.example | *.op-env.local | *.op-env.local.example)
      # Write は content、Edit は new_string、MultiEdit は edits[].new_string、
      # NotebookEdit は new_source に書き込み内容が入る。MultiEdit/NotebookEdit
      # を matcher/判定に含めた時点（本ファイル冒頭の TOOL_NAME 拡張）で、この
      # 抽出も揃えないと「未検査で通る」新しい経路になる（push 前反証レビュー
      # risk-reviewer 指摘、medium）。
      WRITTEN=$(echo "$INPUT" | jq -r '
        [.tool_input.content?, .tool_input.new_string?, .tool_input.new_source?, (.tool_input.edits[]?.new_string?)]
        | map(select(type == "string"))
        | join("\n")
      ')
      bad_vaults=$(disallowed_vault_refs "$WRITTEN")
      if [ -n "$bad_vaults" ]; then
        echo "BLOCKED: local dev 用の env-file に許可外 vault の op:// 参照は書けません（検出: $(echo "$bad_vaults" | tr '\n' ' ')）。このファイルは op run に渡せるので、production を参照する行を足すと production credential が解決されます。管理者運用の参照は .op-env.human.example 側に置いてください" >&2
        exit 2
      fi
      ;;
  esac

  # 既存マイグレーションファイルの変更（新規作成は許可）
  if echo "$FILE_PATH" | grep -q "supabase/migrations/"; then
    if [ -f "$FILE_PATH" ]; then
      echo "BLOCKED: 既存マイグレーションファイルの変更は禁止です。新しいマイグレーションを作成してください" >&2
      exit 2
    fi
  fi
fi

# 渡された文字列が「1 つのことしかしないコマンド」かを判定する。
#
# guard が「この文字列はこう動く」と読めるのは、コマンドが 1 つで、実行前に別の
# ものが差し込まれない時だけ。危険な差し込み方を数え上げると尽きないので
# （実測で python3 / node / `>|` / `;` 後続 / プロセス置換がそれぞれ列挙をすり
# 抜けた）、**shell の文法上「複数のことが起きる」印**を列挙する。こちらは
# 書き手やコマンド名と違って有限で閉じている:
#   区切り            ; & | 改行
#   コマンド置換      $( ) と backtick
#   プロセス置換      <( ) と >( )
#   実行への横流し    eval
# リダイレクト（> >> <）は別のコマンドを走らせないので許す。
is_single_simple_command() {
  local s="$1" bt='`'
  case "$s" in
    *";"* | *"&"* | *"|"* | *'$('* | *"$bt"* | *'<('* | *'>('* | *"eval"*) return 1 ;;
  esac
  [[ "$s" == *$'\n'* ]] && return 1
  return 0
}

# --- MCP: レーンからのチップ起票をブロック ---
# チップ起票（spawn_task）は指揮台セッションの専権。レーン（worktree の作業
# セッション）が直接 User へチップを出すと、triage の判断が User へ飛んでしまう。
# レーンは「issue 化 + 指揮台へ send_message」に一本化する
# （.claude/rules/orchestration.md §盤面の正本は issue + open PR、§レーンの連絡規律）。
#
# 判定は「指揮台にいる」ことの allowlist。`.claude/worktrees/` 配下かどうかという
# path の慣習では見ない — 慣習の外に置かれた worktree が main checkout と区別
# できず素通りするため。git の linked worktree かどうかで見る。
#
# 見ているのは **worktree の構造** であって branch ではない。主 clone で feature
# branch を直接 checkout していても「指揮台」と判定する。これは意図的で、
# その状態は `.claude/rules/workflow.md` §main checkout の役割 が既に禁じている
# 別の規律違反であり、このガードの担当範囲ではない。
if [ "$TOOL_NAME" = "mcp__ccd_session__spawn_task" ]; then
  # 「指揮台だと言い切れた時だけ 1」。判定できない場合（git が無い / repo 外 /
  # 解決失敗）はブロックへ倒す。判定ロジックは guard_resolve_roots() を
  # worktree 境界 guard と共用する（2026-08-24, #2359 で関数抽出）。
  guard_is_main_checkout=0
  if guard_resolve_roots && [ "$GUARD_IS_MAIN_CHECKOUT" = "1" ]; then
    guard_is_main_checkout=1
  fi
  if [ "$guard_is_main_checkout" -ne 1 ]; then
    echo "BLOCKED: チップ起票（spawn_task）は指揮台セッションの専権です。レーンで別件を見つけたら、(1) dispatch skill の規約に沿って issue を起票し、(2) 指揮台へ send_message で連絡してください。User へ直接チップを出すと triage の判断が User に飛びます（.claude/rules/orchestration.md §レーンの連絡規律）" >&2
    exit 2
  fi
fi

# heredoc 本文の除外は入れない（#1944 は未解決のまま。判断の記録）。
#
# 「heredoc の本文はデータだから危険コマンド検査から外す」は正しい直感だが、
# **どの行が本当に heredoc を開いていて、本文がどこへ行くのかは、shell の
# 引用状態とコマンド位置を解釈しないと決まらない。** 正規表現では決まらない。
# 実装を試み、外部レビュー 3 巡で次の 4 通りの取りこぼしが実測で見つかった。
# いずれも **変更前はブロックできていた形が通るようになる** 方向:
#
#   cat <<EOF | bash                       pipe の先で本文が実行される
#   cat <<EOF > /tmp/x.sh; bash /tmp/x.sh  同じ行の後続コマンドが実行する
#   eval "$(cat <<EOF" / bash <(cat <<EOF  置換の中身が実行される
#   bash -s git <<EOF                      consumer 名が引数で、実際は bash が実行
#   echo "x cat <<EOF" / # cat <<EOF       引用符やコメントの中の << を誤認
#
# 直すたびに次の形が出るのは、判定に必要な情報（引用状態・コマンド位置）が
# 文字列の見た目に無いため。**この class は regex では閉じられない。**
#
# 一方で #1944 が直したかったのは P3 の誤検知で、実害は「コミットメッセージの
# 文面を少し変えれば通る」程度。force-push / reset ガードは agent 自身の逸脱を
# 止めるためのもの（`CLAUDE.md` 由来の禁止）なので、**ブロック側の後退と
# P3 の煩わしさなら、煩わしさを取る。** 誤検知は受け入れて docs に書く。
#
# 実装するなら hook が構造化された入力（argv や AST）を受け取れる層が要る。
# 詳細は #1944 のコメント。

# 許可する env-file の path。選択肢で列挙する（optional group で組み立てると
# 区切りの / が任意になり、..op-env.agent のような別名まで通る）。
ALLOWED_ENV_FILE_RE='(\.op-env\.agent|\./\.op-env\.agent|\.\./\.\./\.op-env\.agent)'
CONFORMING_MENTION_RE="-env-file[=[:space:]]+${ALLOWED_ENV_FILE_RE}[[:space:];&|]"

# --env-file の言及がすべて許可形かを判定する。
#
# 「flag に一致したら後続 token を照合する」2 段構えだと、トリガーの正規表現に
# 一致しない書き方（--env-file"=..." のように = の前へ quote を刺す形）が照合に
# すら入らず素通りする。regex で shell の引数解釈は再現できないので、変形を
# 個別に数え上げるのをやめ、**許可形以外の言及をすべて落とす**。
#
# 判定は出現数と適合数の一致で行う。-env-file が 1 回でも現れたら、その出現が
# すべて「-env-file + =/空白 + 許可 literal + 区切り」でなければ落ちる。
env_file_mentions_conform() {
  # 末尾に区切りを足して、行末の言及も同じ形で扱う
  local s="$1 "
  local total conforming
  total=$(printf '%s' "$s" | grep -o -- '-env-file' | wc -l | tr -d ' ')
  [ "$total" -eq 0 ] && return 0
  conforming=$(printf '%s' "$s" | grep -oE -- "$CONFORMING_MENTION_RE" | wc -l | tr -d ' ')
  [ "$total" -eq "$conforming" ]
}

# 許可形を通った env-file の path を取り出す（中身の検査に使う）
conforming_env_file_paths() {
  printf '%s' "$1 " \
    | grep -oE -- "$CONFORMING_MENTION_RE" \
    | sed -E 's/^-env-file[=[:space:]]+//; s/[[:space:];&|]$//' \
    | sort -u
}

# --- Bash: 危険コマンドのブロック ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # night-watch（.claude/skills/night-watch/SKILL.md）: DAYOPT_NIGHT_WATCH=1 の
  # 時だけ有効になる allowlist。denylist ではなく allowlist にするのは、迂回形の
  # 数え上げが尽きないため（.claude/rules/workflow.md §同型指摘の打ち切り
  # 「denylist をやめて allowlist にする」）。env var が無いセッション（通常の
  # 全レーン）には一切影響しない。
  #
  # 「literal prefix + 末尾ワイルドカード」は配下バイナリの書込フラグ
  # （`git diff --output=<path>`、`pnpm quality:deadcode:ci --fix` 等）を
  # そのまま継承する穴だった（2026-08-19、内製クロスレビュー risk-reviewer /
  # behavior-verifier が実測確認）。修正方針は点の追加（危険フラグの denylist）
  # ではなく class を閉じる: 引数を必要としないチェックリストコマンドは
  # **完全一致**にし、read-only git（status/log/diff/show）は checklist が
  # 実際には使わないため allowlist から撤去した（未使用の攻撃面を patch でなく
  # 削除で閉じる）。
  #
  # 動的な値（issue タイトル・本文・検索クエリ・close 対象の判定）が要る gh
  # 呼び出しは、shell の flag allowlist（旧 night_watch_flags_only）で守るのを
  # やめ、`scripts/ci/night-watch/*.mjs` の wrapper へ寄せた（#2291 v2、PR #2309
  # 未解決 thread #5 の P1 是正）。旧方式は quote/backslash を削るだけの
  # 二重検査だったため、shell 展開（ANSI-C escape `$'…'`、変数展開 `${IFS}`
  # 等）が生む未許可 flag を再現できず、2026-08-21 に critical な回避が実測
  # された。wrapper 方式では、動的な値は Bash tool の command 文字列から
  # `execFileSync` の argv 要素として node script 内部の gh 呼び出しへ**直接**
  # 渡る（間に shell を経由しないため、値の中身がどんな文字列でも gh の flag
  # として再解釈されない）。guard 側の役割は「本当にこの固定 script を単純呼び
  # 出ししているか」（is_single_simple_command + no-redirect）だけに縮小され、
  # shell 展開を検査で追いかける必要が無くなる。値の形（数字のみ / 既知の URL
  # 形式のみ 等）の検証は各 wrapper 内部が担う（scripts/ci/night-watch/*.test.ts
  # 参照）。
  if [ "${DAYOPT_NIGHT_WATCH:-}" = "1" ]; then
    # redirect はファイル書き込み手段になるため無条件で拒否（read-only 原則）。
    case "$COMMAND" in
      *'>'* | *'<'*)
        echo "BLOCKED: night-watch モードでは redirect (> / <) を含むコマンドは実行できません" >&2
        exit 2
        ;;
    esac

    if ! is_single_simple_command "$COMMAND"; then
      echo "BLOCKED: night-watch モードでは単一の単純コマンドのみ実行できます（区切り・置換・eval不可）" >&2
      exit 2
    fi

    night_watch_allowed=0
    case "$COMMAND" in
      "pnpm docs:check" | "pnpm docs:coverage" | "pnpm quality:deadcode:ci")
        # 引数不要な checklist コマンド。完全一致のみ許可（引数が付いた
        # 時点で許可外の呼び出しとして拒否する）。
        night_watch_allowed=1
        ;;
      "gh api repos/Dayopt/dayopt/dependabot/alerts?state=open --jq 'length'" \
        | "gh api repos/Dayopt/dayopt --jq .permissions" \
        | "node scripts/ci/night-watch/check-workflow-job.mjs heavy-red" \
        | "node scripts/ci/night-watch/check-workflow-job.mjs integration-red" \
        | 'SENTRY_AUTH_TOKEN="op://agent/sentry-cli-readonly/credential" op run -- sentry issue list dayopt --query "is:unresolved age:-24h"' \
        | 'sentry issue list dayopt --query "is:unresolved age:-24h"')
        # checklist.md / SKILL.md §自動パート Step 0（自己検証）・Step 2（観測。
        # heavy-red / integration-red / sentry-new を含む）が指定する固定
        # コマンドのみ完全一致で許可。空白区切りの表記ゆれ（'--jq=...' 等）には
        # 対応しない。night-watch v2（#2291）で heavy-post-merge 赤確認・Sentry
        # スキャンの 2 本を追加し、#2333 で integration 赤確認を追加した。
        #
        # heavy-red / integration-red は #2483（CI ファイル統合 Phase 1）で
        # `gh run list --workflow=heavy-post-merge.yml` 等の**単一コマンド**
        # から `scripts/ci/night-watch/check-workflow-job.mjs`（個別 wrapper）
        # 経由へ変わった。heavy-e2e / heavy-web / integration が nightly.yml
        # 内の job になり、job 名で判定するには「run 一覧取得 → run ごとに
        # job 一覧取得」という多段処理が要る（`checkWorkflowJobRun`、
        # run-all.mjs）ため、単一の単純コマンドでは表現できない
        # （is_single_simple_command の制約）。他の Step と同じ「個別 wrapper
        # を allowlist する」設計に揃えた。
        #
        # sentry-new に 2 形態あるのは、Cloud Environment（night-watch の実行
        # 先）に 1Password が無いため（#2334 コメント）。Cloud Environment には
        # `SENTRY_AUTH_TOKEN` が env として直接注入されるので `op run --` は
        # 不要かつ実行不可能。夜勤 Routine（自動運行）は env 直読みの形
        # （`sentry issue list ...`）を使い、`op run --` を挟む形は指揮台が
        # 手動代行する時（1Password が使えるローカル環境）専用に残す。
        night_watch_allowed=1
        ;;
      "echo \$DAYOPT_NIGHT_WATCH")
        night_watch_allowed=1
        ;;
      "node scripts/ci/night-watch/board-issue.mjs sync" | "node scripts/ci/night-watch/dod-candidate.mjs select")
        # Step 1（盤面起票・前日盤面 close）・Step 4（DoD候補検索・コメント）の
        # wrapper。動的引数を一切取らない完全一致コマンドで、値の組み立ては
        # script 内部（JST 日付計算・gh issue list の結果からの前日 issue
        # 選定）が担う。close 対象を Claude が argv で指定する余地が無いため、
        # 旧 thread #1（P1: close 対象を前日の盤面 issue に限定する）を構造的に
        # 満たす。
        night_watch_allowed=1
        ;;
      "node scripts/ci/night-watch/alert-issue.mjs report "*)
        # Step 3（nightwatch(check-id) issue の起票・追記）の wrapper。動的な
        # check-id・実測値が要るため完全一致にはできないが、値は script 内部で
        # execFile の argv 要素として gh へ渡り、shell を経由しないため、この
        # 節で flag 単位の検査を重ねる必要が無い（値の形の検証は wrapper 内部の
        # 責務。scripts/ci/night-watch/alert-issue.mjs 参照）。ここで守るのは
        # 「本当に node scripts/ci/night-watch/alert-issue.mjs report <...> の
        # 単純呼び出しか」だけで、is_single_simple_command と redirect 拒否
        # （本 if ブロック冒頭）が既にそれを保証している。
        night_watch_allowed=1
        ;;
      "node scripts/ci/night-watch/run-log.mjs env-failure no-var" \
        | "node scripts/ci/night-watch/run-log.mjs env-failure write-token")
        # Step 0（自己検証の環境故障報告）の wrapper。固定 2 文言のみ完全一致で
        # 許可する（scripts/ci/night-watch/run-log.mjs の ENV_FAILURE_MESSAGES）。
        night_watch_allowed=1
        ;;
      "node scripts/ci/night-watch/run-log.mjs report "* | "node scripts/ci/night-watch/run-log.mjs board-note "*)
        # Step 5（運行記録: 常設運行記録 issue へのコメント + 当日盤面 issue への
        # 1 行コメント）の wrapper。push 前反証レビュー（risk-reviewer、high）で
        # 発見: board/alert/dod の 3 wrapper 化で `gh issue comment` の直接
        # allowlist を全面撤去した際、Step 5 の運行記録コメントがどの wrapper
        # にも属さず、night-watch の唯一の故障検出チャネル
        # （docs/operations/night-watch.md §故障検出手順）が毎晩無音で block
        # されていた。alert-issue.mjs と同じ理由（値は execFile の argv 要素と
        # して gh へ渡り shell を経由しない）で flag 単位の検査は不要。運行記録
        # issue の宛先番号は wrapper 内部が docs/operations/night-watch.md から
        # 解決し、呼び出し元は argv で指定できない（board-issue.mjs の close 対象
        # と同じ設計）。
        night_watch_allowed=1
        ;;
      "node scripts/ci/night-watch/run-log.mjs recent-pending "*)
        # Step 2（heavy-red/integration-red の pending escalation 判定、#2350
        # クロスレビュー指摘 P2-1）の read-only wrapper。常設運行記録 issue の
        # 直近コメントを読むだけで書き込みは行わない。値（check-id）は他
        # wrapper と同じく execFile の argv 要素として gh へ渡り shell を経由
        # しないため、flag 単位の検査は不要。
        night_watch_allowed=1
        ;;
    esac

    if [ "$night_watch_allowed" -ne 1 ]; then
      echo "BLOCKED: night-watch モードで許可されていないコマンドです（許可形は .claude/skills/night-watch/SKILL.md §権限の構造的強制 参照）: $COMMAND" >&2
      exit 2
    fi
  fi

  # git push --force (--force-with-lease は許可)
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force[^-]|git\s+push\s+.*--force$'; then
    echo "BLOCKED: git push --force は禁止です。--force-with-lease を使ってください（この文字列に言及しただけでも落ちます。commit message や PR 本文に書く時は文面を変えるか、Write / Edit で file に書いてから -F / --body-file で渡してください）" >&2
    exit 2
  fi

  # git reset --hard
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    echo "BLOCKED: git reset --hard は危険です。確認してください（この文字列に言及しただけでも落ちます。文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
    exit 2
  fi

  # push 前の pause point は .husky/pre-push が担う（git レベルなので
  # Claude / 人間 / wrapper script のすべてに効く）。ここでは
  # その hook を外して push する抜け道だけを塞ぐ。人間が意識的に使うのは
  # 「理由付き override」として許容するが、agent は使わない。
  # コマンド位置（先頭 or セパレータ直後）に限定する。部分一致だと
  # grep / echo で言及しただけで発火してしまう。
  # 行頭 ^ は heredoc 本文の行頭にも一致するため、コミットメッセージにこの
  # 文字列を書いただけでも落ちる（#1944 の誤検知。上のコメントの判断により
  # 受け入れる。文面を変えるか、Write / Edit で file に書いてから渡す）。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+push[^;&|]*--no-verify'; then
    echo "BLOCKED: git push --no-verify は禁止です。pre-push の pause point に答えてから push してください（heredoc の本文など、この文字列に言及しただけでも落ちます。文面を変えるか、Write / Edit で file に書いてから -F / --body-file で渡してください）" >&2
    exit 2
  fi

  # git commit --no-verify（pre-commit の gitleaks スキャンを迂回する経路。
  # 2026-08-24, #2359 で pre-commit に実質的なセキュリティ境界が乗ったため、
  # commit 側の迂回路も塞ぐ）。長形式 `--no-verify` のみを対象にする —
  # 短縮形 `-n` は `tail -n` / `grep -n` / `sort -n` 等で日常的に出現し、
  # コミットメッセージ本文（`[^;&|]*` の走査範囲に丸ごと入る）でも高頻度に
  # 誤検知するため、push 前反証レビュー相当の指摘を受けて対象外にした
  # （--no-verify の既存トレードオフとは非対称——あちらは 11 文字の literal で
  # 実質レアケース）。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+commit[^;&|]*--no-verify'; then
    echo "BLOCKED: git commit --no-verify は禁止です。pre-commit の gitleaks スキャンを迂回するため（heredoc の本文など、この文字列に言及しただけでも落ちます。文面を変えるか、Write / Edit で file に書いてから -F / --body-file で渡してください）" >&2
    exit 2
  fi

  # 以降の env-file 系検査は行継続を畳んだ文字列で行う。bash は実行前に
  # `\` + 改行を除去するため、複数行に整形しただけで行単位の grep は
  # 分断されて検出できない（敵対的な回避ではなく通常の整形で起きる）。
  # 残る改行は空白へ寄せる。過剰に一致する方向なので安全側。
  # 上の force-push / reset ガードには適用しない（あちらは行頭 `^` を
  # 前提にしており、畳むと検出が弱くなる）。
  COMMAND_JOINED=${COMMAND//\\$'\n'/}
  COMMAND_JOINED=${COMMAND_JOINED//$'\n'/ }

  # quote と backslash を除いた写し。shell はこれらを引数から取り除くため、
  # flag 名の内側へ quote を刺す形（--env-f"ile"=...）は生の文字列に -env-file が
  # 現れず、この写しでしか捕まらない。両方の写しで検査してどちらかが落ちたら
  # 落とすので、判定は生の文字列だけを見る時より狭くならない。
  # ANSI-C / locale 形式の quote（$'…' / $"…"）も shell が引数から取り除く。
  # 導入の $ を落としてから通常の quote 除去に合流させる。これが無いと
  # --env-fi$'le'=… が生の写しにも除去後の写しにも -env-file として現れない。
  guard_sq="'"
  guard_dq='"'
  COMMAND_UNQUOTED=${COMMAND_JOINED//\$$guard_sq/$guard_sq}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\$$guard_dq/$guard_dq}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\"/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\'/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\\/}

  # --- rm -r 系: worktree 外を指しうる対象を伴う呼び出しを block
  #     （2026-08-24, #2359）---
  #
  # 「危険なシェイプの列挙」（他 worktree 名を数え上げる等）にはしない
  # （.claude/rules/workflow.md §同型指摘の打ち切り「denylist をやめて
  # allowlist にする」、push 前反証レビュー相当の指摘: `rm -rf $VAR` /
  # `rm -rf ~/...` / `rm -rf ../lane-b` が列挙をすり抜ける）。
  # worktree 内で完結する日常的なキャッシュ削除（`rm -rf node_modules` /
  # `.next` 等、docs/engineering/diagnostics.md §3 が推奨する操作）は通す。
  #
  # 判定は 2 段: (1) recursive フラグ付き rm の呼び出しがあるか
  # (2) 対象が危険かどうか。`~`・`$`（変数展開）・`..` traversal は対象を
  # 実行時まで確定できないため無条件 block する。**絶対パス引数**は
  # 2026-08-24 に 2 段の是正を経た:
  #   - merge 前クロスレビュー P2: block メッセージは「相対パスのみ許可」と
  #     宣言していたのに実装は絶対パスを見ておらず、他 worktree を直接指す
  #     絶対パスが素通りしていた（メッセージと契約の食い違い）
  #   - 直後の risk-reviewer 指摘: 単純に「絶対パスは全部 block」にすると
  #     scratchpad 掃除（`/private/tmp/.../scratchpad/...` への rm、repo 外）
  #     まで壊れる。**絶対パス token は guard_resolve_roots の家系 root と
  #     突合し、自分以外の worktree root に属する時だけ block する**
  #     （family 外の絶対パス＝scratchpad 等は許可）。
  # **判定は rm を含む segment（; & | 改行で区切った 1 文）に限定する**——
  # コマンド全体を見ると、`rm -rf .next && echo "done: $?"` のように rm と
  # 無関係な `$` が同じ Bash 呼び出しの別 segment に現れただけで誤 block する
  # （DoD 動作確認中の自己検証で実際に踏んだ）。segment 単位にすることで、
  # rm の実引数と無関係な部分を判定から除く。
  RM_RECURSIVE_RE='(^|[[:space:]])(/[^[:space:]]*/)?rm[[:space:]].*(-[a-zA-Z]*[rR][a-zA-Z]*([[:space:]]|$)|--recursive([[:space:]=]|$))'
  RM_ESCAPE_TARGET_RE='(^|[[:space:]/])(~|\$)|(^|[[:space:]/])\.\.([[:space:]/]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    while IFS= read -r rm_segment; do
      [ -n "$rm_segment" ] || continue
      if echo "$rm_segment" | grep -qE "$RM_RECURSIVE_RE"; then
        if echo "$rm_segment" | grep -qE "$RM_ESCAPE_TARGET_RE"; then
          echo "BLOCKED: rm -r 系が worktree 外を指しうる対象（\`~\`・変数展開・\`..\` traversal）を伴っています。worktree 内の相対パス（node_modules・.next 等のキャッシュ削除）のみ許可します: $COMMAND" >&2
          exit 2
        fi
        # 絶対パス token（空白 + `/` 開始）を抽出し、家系の他 worktree root に
        # 属するものだけを block する。抽出した token には rm 自体の binary
        # path 前置（`/bin/rm` 等）も混ざりうるが、家系に属さないので害はない。
        #
        # token は pwd -P で正規化してから突合する（存在すれば）。macOS では
        # /tmp・/var が /private 配下への symlink のため、正規化せずに文字列
        # 比較すると GUARD_CURRENT_ROOT/GUARD_OTHER_ROOTS（pwd -P 済み）と
        # 食い違い、実際は他 worktree を指す token が「一致しない＝family 外」
        # と誤判定されて素通りする（自己検証で実際に踏んだ）。
        if guard_resolve_roots; then
          while IFS= read -r abs_token; do
            [ -n "$abs_token" ] || continue
            guard_resolved_abs_token=$(cd "$abs_token" 2> /dev/null && pwd -P)
            [ -n "$guard_resolved_abs_token" ] || guard_resolved_abs_token="$abs_token"
            if ! guard_path_belongs_to_current_root "$guard_resolved_abs_token"; then
              echo "BLOCKED: rm -r 系が自分の worktree（$GUARD_CURRENT_ROOT）以外の worktree（$guard_resolved_abs_token）を指しています。worktree 内の相対パスまたは family 外（scratchpad 等）の絶対パスのみ許可します: $COMMAND" >&2
              exit 2
            fi
          done < <(printf '%s\n' "$rm_segment" | grep -oE '(^|[[:space:]])/[^[:space:]]*' | sed -E 's/^[[:space:]]+//')
        else
          # git 自体が家系 root を解決できない場合は fail-open にしない。
          # rm は Write/Edit と異なり高頻度操作ではないため、判定不能なら
          # 安全側（block）に倒す。
          if echo "$rm_segment" | grep -qE '(^|[[:space:]])/'; then
            echo "BLOCKED: rm -r 系が絶対パス対象を伴っていますが、家系 root を解決できませんでした（fail closed）: $COMMAND" >&2
            exit 2
          fi
        fi
      fi
    done < <(printf '%s\n' "$scanned" | tr ';&|' '\n')
  done

  # --- supabase db reset の生呼び出し block（2026-08-24, #2359）---
  #
  # ローカル Supabase は複数 worktree セッションが共有する単一インスタンス
  # （memory: ローカルSupabaseは共有状態で巻き戻る）。reset は他レーンの
  # 進行中データも巻き戻すため、CLAUDE.md Commands に明記された既定コマンド
  # `pnpm db:reset` / `pnpm db:fresh`（内部で同じ reset を呼ぶが、User が既に
  # sanction した文書化済みコマンド）は対象外にし、**生の CLI 呼び出し**だけを
  # 狙う（`.op-env.human` 境界と同型: ラップされた安全な入口は許可、生の
  # 危険プリミティブは block）。
  # npx 経由に加え、同じ粒度の兄弟（pnpm exec / pnpm dlx）も塞ぐ
  # （2026-08-24、merge 前クロスレビュー P3 指摘: npx を列挙した以上、
  # 同型の実行ラッパーだけ抜けているのは片手落ち）。
  SUPABASE_DB_RESET_RE='(^|[;&|]|&&|\|\|)[[:space:]]*(npx[[:space:]]+|pnpm[[:space:]]+(exec|dlx)[[:space:]]+)?supabase[[:space:]]+db[[:space:]]+reset'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$SUPABASE_DB_RESET_RE"; then
      echo "BLOCKED: supabase db reset の直接呼び出しは禁止です。ローカル Supabase は複数レーンが共有する単一インスタンスで、reset は他レーンの進行中データも巻き戻します。既定コマンド pnpm db:reset / pnpm db:fresh を使うか、他レーンへの影響が無いことを確認してから指揮台へ相談してください（この文字列に言及しただけでも落ちます）" >&2
      exit 2
    fi
  done

  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    # 雛形の直接実行。.op-env.human.example は op://human/... の参照を
    # そのまま持つため、コピーせず op run に食わせるだけで同じ本番権限が解決される。
    # .op-env.human 自体も消費すれば同じ権限が解決される（#1993: 作成・書き込みは
    # 解禁したが消費は引き続き禁止。読み書きできることと消費できることは別）。
    #
    # コマンド名ではなく「危険な引数」で判定する。op がコマンド位置に来る形だけを
    # 見ると env / command / 絶対パス / sh -c ... と迂回形をいくらでも作れるため、
    # 位置に依存せず --env-file が admin を指すこと自体を落とす。
    # 下の allowlist でも落ちるが、admin を名指しした時はこちらの具体的な理由を返す。
    if echo "$scanned" | grep -qE '\-\-env-file[=[:space:]]+[^[:space:];&|]*\.op-env\.human'; then
      echo "BLOCKED: .op-env.human / .op-env.human.example を op run に渡すのは User の明示操作に限ります（production の service role key が解決され、admin script が本番へ書き込めるため。読み書きは #1993 で解禁済みだが消費は引き続き禁止）" >&2
      exit 2
    fi

    # 許可形以外の --env-file 言及をすべて落とす。
    #
    # 保証境界: op run へ渡す flag と path を quote / backslash escape / 行継続 /
    # 区切りの省略で書き換える形はこれで閉じる。閉じないのは、実行時に文字列を
    # 組み立てる形（変数展開・eval・base64・wrapper script・--env-$X）。そこは
    # hook ではなく CLAUDE.md の EXPLICIT AUTHORITY と 1Password の承認が担う。
    #
    # 代償として、flag のあとに何か語や引用符が続く文字列は散文でも落ちる
    # （rg -- '--env-file' のような自己検索を含む）。「閉じ引用符なら除外する」類の
    # 例外は置かない — 同型の例外（path らしくない token は無視する）が過去 2 回
    # 穴になっている。名前で検索する時は leading dash を外す
    # （rg env-file .claude/hooks/ は通る）。
    if ! env_file_mentions_conform "$scanned"; then
      echo "BLOCKED: op run --env-file に渡してよいのは通常の local dev の env-file だけです（許可形以外の言及を検出）。別名や別ディレクトリへ複製した env-file 経由で production credential を解決する迂回を塞ぐためで、必要なら User に実行を依頼してください。名前を検索したいだけなら leading dash を外してください（例: rg env-file .claude/hooks/）" >&2
      exit 2
    fi
  done

  # env-file を消費するコマンドは、**単一の単純コマンド**であることを要求する。
  #
  # hook は Bash 呼び出しごとに実行前 1 回しか発火しないので、下の中身検査は
  # コマンド実行前のファイルを読む。同じコマンドの中で先に書き換えられると、
  # 検査した中身と実際に解決される中身が別物になる
  # （echo '…' >> <env-file> && op run --env-file=<env-file> -- … ）。
  #
  # 書き込み手段を列挙する方式では閉じない。python3 / node / perl / awk の
  # ファイル書き込み、`>|` のような別形のリダイレクト、コマンド置換の中に隠す形と
  # 際限がなく、実測でも python3 / node / `>|` が列挙をすり抜けた。**書き手を
  # 数え上げるのをやめ、「別のことが起きる余地」自体を落とす**（判定は
  # is_single_simple_command）。
  #
  # 言及の有無は生の写しと quote を除いた写しの両方で見る。片方だけだと
  # --env-f"ile"=... のように flag 名の内側へ quote を刺した形が
  # 「言及なし」と判定され、この制約も下の中身検査も素通りする。
  #
  # 判定は生の $COMMAND と quote を除いた写しの両方で行う。区切りは引用符の中に
  # あっても文字としては残るので生の写しで足りるが、`e''val` のように quote で
  # 語を分断する形は除いた写しでしか見えない。
  #
  # 副作用として、cd で移動してから消費する形も落ちる。中身検査は hook の cwd から
  # path を解決するので、これが通ると検査対象と実際のファイルがずれていた。
  #
  # 代償: op run の行に他のコマンドを繋げられない（リダイレクトでのログ取りを含む）。
  # 分けて実行すれば通る。
  if printf '%s' "$COMMAND_JOINED" | grep -q -- '-env-file' \
    || printf '%s' "$COMMAND_UNQUOTED" | grep -q -- '-env-file'; then
    if ! is_single_simple_command "$COMMAND" || ! is_single_simple_command "$COMMAND_UNQUOTED"; then
      echo "BLOCKED: env-file を op run へ渡すコマンドは、単一の単純コマンドにしてください（区切り ; & | 改行、コマンド置換 \$( )、プロセス置換 <( )、eval は不可）。同じコマンドの中で env-file を書き換えられると、guard が検査した中身と実際に解決される中身が別物になるためです。書き込みや cd は別のコマンドに分けてください" >&2
      exit 2
    fi
  fi

  # 許可形を通った env-file の中身を検査する。path の allowlist は「どのファイルか」
  # しか見ないので、許可 path の中身へ production 参照を書き足せば通ってしまう。
  # ファイルが無い場合は解決される参照が無いので通す。
  #
  # 閉じない境界: path は hook の cwd から解決する。コマンド自身が cwd を変える形
  # （cd /tmp && op run --env-file=<同名ファイル> -- ...）では別のファイルが解決される。
  # 実行時に path を組み立てる形と同じ class なので hook では追わない。
  while IFS= read -r env_file_path; do
    [ -n "$env_file_path" ] || continue
    [ -f "$env_file_path" ] || continue
    bad_vaults=$(disallowed_vault_refs "$(cat "$env_file_path")")
    if [ -n "$bad_vaults" ]; then
      echo "BLOCKED: $env_file_path が許可外 vault の op:// 参照を持っています（検出: $(echo "$bad_vaults" | tr '\n' ' ')）。op run に渡すと production credential が解決されます。管理者運用は .op-env.human 側の経路と User の明示操作で行ってください" >&2
      exit 2
    fi
  done < <(
    {
      conforming_env_file_paths "$COMMAND_JOINED"
      # quote を除いた写しからも拾う。--env-f"ile"=... は生の写しに現れない。
      conforming_env_file_paths "$COMMAND_UNQUOTED"
    } | sort -u
  )

  # --- #2293: agent-ops secret 露出の出力段 redaction ---
  #
  # 過去4件の露出incident（07-22 Vercel CLI token / 08-11×2 Supabase credential /
  # 08-11 Turnstile secret via Management API）はいずれも「生表示commandを
  # denylist keywordや部分一致フィルタで塞ごうとして漏れた」class。本節は
  # denylistの穴埋めではなく、危険なcommand shapeそのものをPreToolUseで
  # blockし、field allowlist projectionを持つ安全な代替へ一本化する。
  #
  # jq projectionの形が正しいか（allowlist射影かdenylist射影か）はregexで
  # 検証しない。shell展開回避（$'\xNN' / ${IFS} / base64等）でop-env.humanの
  # 境界と同じ壁に当たるため。「raw commandそのものを無条件block」に倒し、
  # jqを挟んでも通さない（secrets.mdの既存curl+jq例は本PRでwrapper呼び出しへ
  # 置換する）。

  # (a) op item get: --reveal または --format=json（OP_FORMAT=json含む）は
  # concealed fieldの実値を出力する。1Password CLI実測: --format=jsonは
  # --revealの有無に関わらず値を.valueへ含める（--revealはhuman-readable
  # テキスト出力のmaskingにのみ効く仕様）。既定形式・--revealなしはmasked表示
  # のまま出るため許可する（orchestration.md §手作業コンシェルジュレーンの
  # 「item UUID/名前の照合のみで行い、生JSONを表示しない」idiomを機械強制する
  # 形になる）。
  ITEM_GET_RE='item[[:space:]]+get([[:space:]]|$)'
  REVEAL_FLAG_RE='(^|[[:space:];&|])--reveal([[:space:];&|]|$)'
  JSON_FORMAT_RE='(--format[=[:space:]]+json|OP_FORMAT=json)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$ITEM_GET_RE"; then
      if echo "$scanned" | grep -qE "$REVEAL_FLAG_RE" || echo "$scanned" | grep -qE "$JSON_FORMAT_RE"; then
        echo "BLOCKED: op item get で --reveal / --format=json（または OP_FORMAT=json）を使うと concealed field の実値が出力されます（--format=json は --reveal の有無に関わらず値を含む仕様です）。既定の human-readable 形式・--reveal なしで存在確認してください。値そのものが必要な操作は既存の scripts/admin-*.sh 経由で行ってください（agent が直接値を reveal する経路には使えません。この文字列に言及しただけでも落ちます。docs や commit message に書く時は文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
        exit 2
      fi
    fi
  done

  # (b) supabase branches get: credentialを含むJSONを返す仕様（08-11 incident）。
  # 状態確認にはmetadataのみを返すbranches listを使う（#1920の学び）。
  BRANCHES_GET_RE='branches[[:space:]]+get([[:space:]]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$BRANCHES_GET_RE"; then
      echo "BLOCKED: supabase branches get は credential（SERVICE_ROLE_KEY 等）を含む JSON を返す仕様です（2026-08-11 incident）。状態確認には metadata のみを返す branches list を使ってください（この文字列に言及しただけでも落ちます。docs や commit message に書く時は文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
      exit 2
    fi
  done

  # (c) vercel --token / -t: 長寿命tokenをCLI引数へ渡すと、CLIの再実行・
  # pagination案内へ値がechoされる場合がある（2026-07-22 incident）。
  #
  # invoke 判定はコマンド先頭・shell separator 直後だけでなく、単純な空白の
  # 前後でも一致させる（push前反証レビューで発見: `op run -- vercel ...` の
  # ように `--` の後ろに空白 1 つで置かれる形は、separator 限定の anchor だと
  # 素通りした。これは本ファイル §env-file の言及がすべて許可形かを判定する
  # が既に採用している「コマンド名ではなく引数で判定する（位置に依存しない）」
  # 原則から外れていた誤り。空白境界だけを要求する形へ揃える）。
  #
  # 境界集合に `/` も含める（merge 前クロスレビューで発見: `/opt/homebrew/bin/vercel`
  # のような絶対パス起動は、直前の文字が `/` で `[[:space:];&|]` のどれにも
  # 一致せず素通りしていた。push前反証で直した「op run -- vercel（空白区切り）」
  # と同じ「位置に依存しない」原則の取りこぼしで、path 区切りも境界として扱う）。
  VERCEL_INVOKE_RE='(^|[[:space:];&|/])vercel([[:space:]]|$)'
  VERCEL_AUTH_FLAG_RE='(^|[[:space:];&|])(--token|-t)([[:space:]=]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$VERCEL_INVOKE_RE" && echo "$scanned" | grep -qE "$VERCEL_AUTH_FLAG_RE"; then
      echo "BLOCKED: vercel CLI に --token / -t を渡すのは禁止です（CLI が再実行・pagination 案内へ値を echo する場合があり、2026-07-22 に実際に露出しました）。VERCEL_TOKEN は環境変数として渡してください（docs/operations/secrets.md 既述。この文字列に言及しただけでも落ちます。docs や commit message に書く時は文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
      exit 2
    fi
  done

  # (d) Supabase Management API の secret 保持エンドポイント（config/* と
  # branches*）への直接アクセス。jq projection の有無を問わず無条件で block
  # する（denylist keyword / 部分一致 keyword フィルタが2回とも漏れた
  # 08-11 incident 2件）。安全な代替は scripts/agent/supabase-mgmt-safe-get.mjs に
  # 一本化する。
  #
  # invoke 側（curl|wget の言及）は要求しない（merge前クロスレビューで発見:
  # `curl` / `wget` 限定は `node -e "fetch(...)"` や `python3 -c "urllib..."`
  # のような別 HTTP client で丸ごと迂回できた。この repo は scripts/*.mjs を
  # 書くのが日常 idiom で、agent が同型 one-liner を書く動機は自然にある。
  # 08-11 の denylist keyword 漏れと同じ「点を塞ぐ」形だった）。**endpoint
  # 文字列（host + path）の言及だけで無条件 block する。** どんな実行手段
  # （curl / wget / node fetch / python / httpie / ブラウザ拡張の内部実装等）
  # で叩かれるかを問わない。secret 保持エンドポイントへの言及自体が危険信号
  # であり、絞り込みを増やすほど新しい client 名を数え上げる負債になる。
  # projects/{ref}/config・projects/{ref}/branches（一覧）・branches/{id}
  # （個別、08-11 incident 2 で実際に叩かれた形）の3形をすべて拾う。
  SUPABASE_MGMT_DANGER_ENDPOINT_RE='api\.supabase\.com/v1/(projects/[^[:space:]"'"'"']*/(config|branches)|branches)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$SUPABASE_MGMT_DANGER_ENDPOINT_RE"; then
      echo "BLOCKED: Supabase Management API の config / branches endpoint への言及は禁止です（secret 系フィールドが同梱される仕様で、jq 射影を挟んでも 2026-08-11 に 2 回漏れました。curl 限定だと別 HTTP client で迂回できるため、実行手段を問わず endpoint への言及自体を block します）。node scripts/agent/supabase-mgmt-safe-get.mjs auth-config <field...> を使ってください（この文字列に言及しただけでも落ちます。docs や commit message に書く時は文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
      exit 2
    fi
  done

  # (e) op read: --reveal相当のmaskingを持たず、常に実値をstdoutへ出す。
  #
  # 当初は `>/dev/null` への破棄 redirect があれば通す設計だったが、push前
  # 反証レビューで2つの穴が見つかった: ① `2>/dev/null`（stderrの破棄）が
  # 文字列として `>/dev/null` を含むため誤って許可側に倒れ、stdout の実値は
  # そのまま出力される ② `op read A && op read B >/dev/null` のように複数
  # 出現する場合、コマンド全体に1回でも `/dev/null` があれば全体を許可して
  # しまい、redirect の無い A 側が漏れる。どちらも「redirect の形」を後から
  # 数え上げる設計の限界（.op-env.human 境界と同型の壁）。
  #
  # 例外を作らず無条件で block する。接続確認は既定形式の
  # `op item get <item> --fields <field>`（(a) により masked 出力が保証され
  # ている）で代替できるため、`op read` を agent が直接叩く必要自体が無い。
  #
  # 境界集合に `/` を含める理由は (c) と同じ（`/usr/local/bin/op read ...`
  # のような絶対パス起動を anchor の穴にしない）。
  OP_READ_RE='(^|[[:space:];&|/])op[[:space:]]+read([[:space:]]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$OP_READ_RE"; then
      echo "BLOCKED: op read op://... は --reveal 相当の masking を持たず、常に実値を stdout へ出します（例外なく block）。接続確認は op item get <itemName> --vault <vault> --fields <field> （既定の human-readable 形式・--reveal なしなら masked 出力）で代替してください。値そのものが必要な操作は op run 経由で行ってください（stdout へ出さずに process へ渡せます。この文字列に言及しただけでも落ちます。docs や commit message に書く時は文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
      exit 2
    fi
  done
fi

exit 0
