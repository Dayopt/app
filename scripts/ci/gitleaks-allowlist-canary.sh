#!/bin/bash

# .gitleaks.toml（repo root）は default ruleset に加えて Dayopt 固有の
# allowlist を追加する。custom config を読めた場合、gitleaks は有効 rule
# 0 本・findings 0 でも exit 0 を返せてしまう — [extend].useDefault の
# 欠落・typo・allowlist の過度な広さが将来混入すると「secret を検出でき
# ないまま green」になり、それに気づく手段が無い（fail-open）。
#
# #2379 のレビューで指摘された 3 ケースを固定する
# （「scratchpad で作った検証は repo の test に落とす」の適用）。gitleaks 本体・.gitleaks.toml のどちらの
# 回帰も検出できるよう、ここでは実際の gitleaks バイナリを --no-git で
# 直接呼ぶ（git 履歴は不要 — allowlist のマッチングは commit に依存しない）。
#
# fixture の secret 様の値は、この script 自身の行が本物の gitleaks の
# 対象にならないよう、プレフィックスと本体を別の変数に分けてから連結する
# （1 行に連続した secret 形の literal を置かない。変数名にも
# access/api/auth/key/credential/creds/passwd/secret/token を含めない）。

set -euo pipefail

if ! command -v gitleaks > /dev/null 2>&1; then
  echo "✗ gitleaks が見つかりません。canary を実行できません。" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG_PATH="$REPO_ROOT/.gitleaks.toml"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "✗ $CONFIG_PATH が見つかりません。" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

FAILED=0

# Case 1（ブロック側）: allowlist に登録されていない secret 様の値は検出される
FIXTURE1_PREFIX='sk_live_'
FIXTURE1_BODY='51H8x9KZvQwErTyUiOpAsDfGhJkLzXcVbNm1234567890AbCdEfGhIj'
FIXTURE1_VALUE="${FIXTURE1_PREFIX}${FIXTURE1_BODY}"
mkdir -p "$TMPDIR/case1"
cat > "$TMPDIR/case1/unregistered.ts" <<EOF
export const value1 = '${FIXTURE1_VALUE}';
EOF
if gitleaks detect --no-git --source "$TMPDIR/case1" --config "$CONFIG_PATH" --redact --exit-code 1; then
  echo "✗ canary 失敗（Case 1: ブロック側）: 未登録の secret 様値が検出されなかった。ruleset が無効化されているか allowlist が過度に広い疑いがある。" >&2
  FAILED=1
else
  echo "✓ canary Case 1（ブロック側）: 未登録の secret 様値を正しく検出した"
fi

# Case 2（通過側）: allowlist 済みの既知値（reCAPTCHA 公式テストキー）は抑止される
mkdir -p "$TMPDIR/case2"
cat > "$TMPDIR/case2/known-safe.md" <<'EOF'
NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V3=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
EOF
if gitleaks detect --no-git --source "$TMPDIR/case2" --config "$CONFIG_PATH" --redact --exit-code 1; then
  echo "✓ canary Case 2（通過側）: allowlist 済みの既知値を正しく抑止した"
else
  echo "✗ canary 失敗（Case 2: 通過側）: allowlist 済みの既知値（reCAPTCHA 公式テストキー）が抑止されなかった。regexes / targetRules / regexTarget の設定崩れの疑いがある。" >&2
  FAILED=1
fi

# Case 3（AND 条件）: allowlist path と一致していても、値パターンが不一致なら検出される
# （path 単独免除に劣化していないことの実証。useCalendarKeyboard.ts の
# allowlist が condition = "AND" を使う理由そのもの。fixture の形（key: '...'）
# は generic-api-key ルールを確実に発火させるため実測して確定した）
FIXTURE3_A='zQ9wErTyUiOpAsDfGhJkLzXcVbNm12345'
FIXTURE3_B='67890abcdef'
FIXTURE3_VALUE="${FIXTURE3_A}${FIXTURE3_B}"
mkdir -p "$TMPDIR/case3/apps/product/src/features/calendar/hooks/keyboard"
cat > "$TMPDIR/case3/apps/product/src/features/calendar/hooks/keyboard/useCalendarKeyboard.ts" <<EOF
const shortcuts = [
  {
    key: '${FIXTURE3_VALUE}',
    description: 'not a real shortcut',
  },
];
EOF
if gitleaks detect --no-git --source "$TMPDIR/case3" --config "$CONFIG_PATH" --redact --exit-code 1; then
  echo "✗ canary 失敗（Case 3: AND 条件）: allowlist path 内の非対象値が検出されなかった。condition = \"AND\" が効いておらず path 単独免除になっている疑いがある。" >&2
  FAILED=1
else
  echo "✓ canary Case 3（AND 条件）: allowlist path 内でも値パターン不一致なら正しく検出した"
fi

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi

echo "✓ gitleaks allowlist canary: 3 ケースとも期待どおり"
