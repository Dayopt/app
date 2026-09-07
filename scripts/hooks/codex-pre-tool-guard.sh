#!/bin/bash
# Loader failures (including a missing Node binary) must block before the tool runs.
if ! command -v node >/dev/null 2>&1; then
  echo 'BLOCKED: node が無いため Codex guard を実行できません' >&2
  exit 2
fi
node "$(dirname "$0")/codex-pre-tool-guard.mjs"
status=$?
if [ "$status" -ne 0 ]; then
  exit 2
fi
