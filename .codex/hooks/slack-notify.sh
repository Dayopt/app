#!/bin/bash
# Slack通知スクリプト（HTTP hook用の代替）
# 使用方法: SLACK_WEBHOOK_URL 環境変数を設定してから使用
#
# 設定例（.claude/settings.json の hooks に追加）:
# "Stop": [
#   {
#     "hooks": [
#       {
#         "type": "http",
#         "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
#         "timeout": 10
#       }
#     ]
#   }
# ]
#
# または、このスクリプトを command hook として使用:
# "Stop": [
#   {
#     "hooks": [
#       {
#         "type": "command",
#         "command": ".claude/hooks/slack-notify.sh",
#         "async": true
#       }
#     ]
#   }
# ]

WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

if [ -z "$WEBHOOK_URL" ]; then
  exit 0
fi

INPUT=$(cat)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Slack Incoming Webhook にPOST
curl -s -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"[$TIMESTAMP] Claude Code event: $(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')\"}" \
  2>/dev/null

exit 0
