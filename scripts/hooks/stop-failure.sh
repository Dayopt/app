#!/bin/bash
# Stop hook: 作業完了通知 + エラー時はログ記録
# 音の使い分け: 正常完了=Hero（達成感）、エラー=Submarine（警告）

INPUT=$(cat)
ERROR_TYPE=$(echo "$INPUT" | jq -r '.error // ""')
ERROR_DETAILS=$(echo "$INPUT" | jq -r '.error_details // ""')

if [ -n "$ERROR_TYPE" ] && [ "$ERROR_TYPE" != "null" ] && [ "$ERROR_TYPE" != "" ]; then
  # エラー時: ログ記録 + Submarine音
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  LOG_DIR="$HOME/.claude/logs"
  mkdir -p "$LOG_DIR"
  echo "[$TIMESTAMP] error=$ERROR_TYPE details=$ERROR_DETAILS" >> "$LOG_DIR/stop-failures.log"
  osascript -e 'display notification "エラーが発生しました" with title "Claude Code" sound name "Submarine"'
else
  # 正常完了: Hero音
  osascript -e 'display notification "作業が完了しました" with title "Claude Code" sound name "Hero"'
fi

exit 0
