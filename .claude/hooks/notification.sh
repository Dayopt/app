#!/bin/bash
# Notification hook: 許可待ち・アイドル時にmacOSデスクトップ通知を送信

INPUT=$(cat)
TITLE=$(echo "$INPUT" | jq -r '.title // "Claude Code"')
MESSAGE=$(echo "$INPUT" | jq -r '.message // "通知があります"')

osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"Glass\""

exit 0
