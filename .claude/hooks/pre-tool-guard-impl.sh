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
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
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

# --- Write/Edit: 保護ファイルへの書き込みブロック ---
if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; then
  # .env ファイルへの書き込みは全面禁止（.env.example は 2026-08-14 に廃止。
  # 変数一覧の正本は scripts/env/schema.ts）
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
      WRITTEN=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')
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
  # main checkout では両者が同じ .git を指す。linked worktree では
  # --absolute-git-dir が <main>/.git/worktrees/<name> になる。
  # --git-common-dir は main checkout だと相対（.git）で返るので絶対化して比べる。
  # 「指揮台だと言い切れた時だけ 1」。判定できない場合（git が無い / repo 外 /
  # 解決失敗）はブロックへ倒す。
  guard_is_main_checkout=0
  guard_git_dir=$(git rev-parse --absolute-git-dir 2> /dev/null || true)
  guard_common_dir=$(git rev-parse --git-common-dir 2> /dev/null || true)
  # 空のまま cd に渡さないこと。`cd ""` は bash では成功してカレントに留まるため、
  # 両方が同じ cwd に解決されて「一致＝指揮台」と誤判定する（実測で踏んだ）。
  if [ -n "$guard_git_dir" ] && [ -n "$guard_common_dir" ]; then
    case "$guard_common_dir" in
      /*) ;;
      *) guard_common_dir="$PWD/$guard_common_dir" ;;
    esac
    guard_git_dir=$(cd "$guard_git_dir" 2> /dev/null && pwd -P)
    guard_common_dir=$(cd "$guard_common_dir" 2> /dev/null && pwd -P)
    if [ -n "$guard_git_dir" ] && [ "$guard_git_dir" = "$guard_common_dir" ]; then
      guard_is_main_checkout=1
    fi
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
  # **完全一致**にし、動的引数が要る gh コマンドだけ
  # night_watch_flags_only で「許可した -- flag 以外は一切許さない」
  # positive allowlist にする。read-only git（status/log/diff/show）は
  # checklist が実際には使わないため allowlist から撤去した（未使用の
  # 攻撃面を patch でなく削除で閉じる）。
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

    # $1 = 許可コマンドの後続部分（先頭の空白は呼び出し側で除去済み）
    # $2 = 許可 flag を空白区切りで並べた文字列（例: "--title --body --label"）
    #
    # トークンごとに判定する: `-` で始まるトークンは許可 flag と完全一致
    # しない限り拒否（短縮 flag `-X` / `-f` は許可リストに入れられないので
    # 一律拒否になる）。`-` で始まらないトークンは位置引数・flag の値として
    # 無条件に許可する。`--body="値"` のような `=` 結合形は対応しない
    # （許可形は空白区切りのみに絞る。等号形を通すと `--body=safe--output=x`
    # のような 1 token に紛れ込ませる迂回を許可 flag の完全一致だけで
    # 弾けなくなる）。
    night_watch_flags_only() {
      local rest="$1" allowed="$2" tok
      local -a tokens allowed_arr
      read -ra tokens <<<"$rest"
      read -ra allowed_arr <<<"$allowed"
      for tok in "${tokens[@]}"; do
        case "$tok" in
          -*)
            local ok=0 a
            for a in "${allowed_arr[@]}"; do
              [ "$tok" = "$a" ] && ok=1 && break
            done
            [ "$ok" -eq 1 ] || return 1
            ;;
        esac
      done
      return 0
    }

    night_watch_allowed=0
    case "$COMMAND" in
      "pnpm docs:check" | "pnpm docs:coverage" | "pnpm quality:deadcode:ci")
        # 引数不要な checklist コマンド。完全一致のみ許可（引数が付いた
        # 時点で許可外の呼び出しとして拒否する）。
        night_watch_allowed=1
        ;;
      "gh api repos/Dayopt/dayopt/dependabot/alerts?state=open --jq 'length'" \
        | "gh api repos/Dayopt/dayopt --jq .permissions")
        # checklist.md / SKILL.md step 0 が指定する固定コマンドのみ完全一致で許可。
        # 空白区切りの表記ゆれ（'--jq=...' 等）には対応しない。
        night_watch_allowed=1
        ;;
      "echo \$DAYOPT_NIGHT_WATCH")
        night_watch_allowed=1
        ;;
      "gh issue create "*)
        night_watch_flags_only "${COMMAND#"gh issue create "}" "--title --body --label --repo" \
          && night_watch_allowed=1
        ;;
      "gh issue comment "*)
        night_watch_flags_only "${COMMAND#"gh issue comment "}" "--body --repo" \
          && night_watch_allowed=1
        ;;
      "gh issue list"*)
        night_watch_flags_only "${COMMAND#"gh issue list"}" "--repo --state --search --label" \
          && night_watch_allowed=1
        ;;
      "gh issue view "*)
        night_watch_flags_only "${COMMAND#"gh issue view "}" "--repo --json" \
          && night_watch_allowed=1
        ;;
      "gh search issues "*)
        night_watch_flags_only "${COMMAND#"gh search issues "}" "--repo --state --search" \
          && night_watch_allowed=1
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
        echo "BLOCKED: op item get で --reveal / --format=json（または OP_FORMAT=json）を使うと concealed field の実値が出力されます（--format=json は --reveal の有無に関わらず値を含む仕様です）。既定の human-readable 形式・--reveal なしで存在確認してください。値そのものが必要な操作は既存の scripts/admin-*.sh 経由で行ってください（agent が直接値を reveal する経路には使えません）" >&2
        exit 2
      fi
    fi
  done

  # (b) supabase branches get: credentialを含むJSONを返す仕様（08-11 incident）。
  # 状態確認にはmetadataのみを返すbranches listを使う（#1920の学び）。
  BRANCHES_GET_RE='branches[[:space:]]+get([[:space:]]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$BRANCHES_GET_RE"; then
      echo "BLOCKED: supabase branches get は credential（SERVICE_ROLE_KEY 等）を含む JSON を返す仕様です（2026-08-11 incident）。状態確認には metadata のみを返す branches list を使ってください" >&2
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
  VERCEL_INVOKE_RE='(^|[[:space:];&|])vercel([[:space:]]|$)'
  VERCEL_AUTH_FLAG_RE='(^|[[:space:];&|])(--token|-t)([[:space:]=]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$VERCEL_INVOKE_RE" && echo "$scanned" | grep -qE "$VERCEL_AUTH_FLAG_RE"; then
      echo "BLOCKED: vercel CLI に --token / -t を渡すのは禁止です（CLI が再実行・pagination 案内へ値を echo する場合があり、2026-07-22 に実際に露出しました）。VERCEL_TOKEN は環境変数として渡してください（docs/operations/secrets.md 既述）" >&2
      exit 2
    fi
  done

  # (d) Supabase Management API の secret 保持エンドポイント（config/* と
  # branches*）への直接アクセス。jq projection の有無を問わず無条件で block
  # する（denylist keyword / 部分一致 keyword フィルタが2回とも漏れた
  # 08-11 incident 2件）。安全な代替は scripts/supabase-mgmt-safe-get.mjs に
  # 一本化する。invoke 判定は (c) と同じ理由で空白境界のみを要求する
  # （`op run -- curl ...` のような形を anchor の穴にしない）。
  CURL_INVOKE_RE='(^|[[:space:];&|])(curl|wget)([[:space:]]|$)'
  # projects/{ref}/config・projects/{ref}/branches（一覧）・branches/{id}
  # （個別、08-11 incident 2 で実際に叩かれた形）の3形をすべて拾う。
  SUPABASE_MGMT_DANGER_ENDPOINT_RE='api\.supabase\.com/v1/(projects/[^[:space:]"'"'"']*/(config|branches)|branches)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$CURL_INVOKE_RE" && echo "$scanned" | grep -qE "$SUPABASE_MGMT_DANGER_ENDPOINT_RE"; then
      echo "BLOCKED: Supabase Management API の config / branches endpoint への直接アクセスは禁止です（secret 系フィールドが同梱される仕様で、jq 射影を挟んでも 2026-08-11 に 2 回漏れました）。node scripts/supabase-mgmt-safe-get.mjs auth-config <field...> を使ってください" >&2
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
  OP_READ_RE='(^|[[:space:];&|])op[[:space:]]+read([[:space:]]|$)'
  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    if echo "$scanned" | grep -qE "$OP_READ_RE"; then
      echo "BLOCKED: op read op://... は --reveal 相当の masking を持たず、常に実値を stdout へ出します（例外なく block）。接続確認は op item get <item> --fields <field> （既定の human-readable 形式・--reveal なしなら masked 出力）で代替してください。値そのものが必要な操作は op run 経由で行ってください（stdout へ出さずに process へ渡せます）" >&2
      exit 2
    fi
  done
fi

exit 0
