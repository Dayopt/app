#!/bin/bash
# Claude adapter: cloud bootstrap is provider-specific; preflight is shared.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  echo "**remote**: yes"
else
  echo "**remote**: no"
fi

# --- cloud session: 依存 install（fail-safe。失敗しても session 開始は止めない） ---
DEPS_STATUS=""
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  INSTALL_LOG="${TMPDIR:-/tmp}/dayopt-session-start-install.log"
  INSTALL_START=$(date +%s)
  # hook 自体の timeout（settings.json の 300 秒）より先に自分で打ち切り、
  # 失敗を context に残せるようにする。timeout が無い環境ではそのまま実行する。
  if command -v timeout > /dev/null 2>&1; then
    timeout 240 pnpm install --frozen-lockfile < /dev/null > "$INSTALL_LOG" 2>&1
  else
    pnpm install --frozen-lockfile < /dev/null > "$INSTALL_LOG" 2>&1
  fi
  INSTALL_RC=$?
  INSTALL_SEC=$(( $(date +%s) - INSTALL_START ))
  if [ "$INSTALL_RC" -eq 0 ]; then
    DEPS_STATUS="installed (${INSTALL_SEC}s)"
  else
    DEPS_STATUS="install failed (exit ${INSTALL_RC}, ${INSTALL_SEC}s, log: ${INSTALL_LOG})"
  fi
fi


if [ -n "$DEPS_STATUS" ]; then
  echo "**deps**: $DEPS_STATUS"
  case "$DEPS_STATUS" in
    "install failed"*) echo "依存 install に失敗: pnpm install --frozen-lockfile を実行してください" ;;
  esac
fi
if ! command -v node >/dev/null 2>&1; then
  echo "未取得: node が無いため pnpm agent:preflight を実行できません"
  exit 0
fi
node "$(dirname "$0")/../tasks/agent-preflight.mjs"
# Preflight emits missing prerequisites; a session must still be able to repair them.
exit 0
