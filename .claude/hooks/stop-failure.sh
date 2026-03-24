#!/bin/bash
# StopFailure hook: APIエラーをログファイルに記録
# 出力・exitコードは無視される（ログ専用）

INPUT=$(cat)
ERROR_TYPE=$(echo "$INPUT" | jq -r '.error // "unknown"')
ERROR_DETAILS=$(echo "$INPUT" | jq -r '.error_details // ""')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

LOG_DIR="$HOME/.claude/logs"
mkdir -p "$LOG_DIR"

echo "[$TIMESTAMP] error=$ERROR_TYPE details=$ERROR_DETAILS" >> "$LOG_DIR/stop-failures.log"

exit 0
