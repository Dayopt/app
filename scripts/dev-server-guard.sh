#!/bin/bash
# ========================================
# 開発サーバー重複起動防止スクリプト
# ========================================
# 目的: RAM使用量を抑えるため、複数のNext.jsサーバーが起動しないようにする
# 使用方法: pnpm dev:raw の前に手動で実行する古い補助スクリプト

set -e

PORT="${PORT:-3000}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 色付きログ
log_info() {
  echo "ℹ️  $1"
}

log_success() {
  echo "✅ $1"
}

log_warning() {
  echo "⚠️  $1"
}

log_error() {
  echo "❌ $1"
}

# ポート使用中チェック
check_port() {
  if lsof -ti:"$PORT" > /dev/null 2>&1; then
    return 0  # ポート使用中
  else
    return 1  # ポート空き
  fi
}

# プロジェクトディレクトリのNext.jsプロセスをチェック
check_project_process() {
  ps aux | grep -v grep | grep "next dev" | grep "$PROJECT_DIR" > /dev/null 2>&1
  return $?
}

# 既存プロセスをkill
kill_existing_server() {
  log_warning "既存のNext.jsサーバーを停止中..."

  # ポートを使用しているプロセスをkill
  if lsof -ti:"$PORT" > /dev/null 2>&1; then
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  fi

  # プロジェクトディレクトリのNext.jsプロセスをkill
  pkill -f "next dev.*$PROJECT_DIR" 2>/dev/null || true

  sleep 1
  log_success "既存サーバーを停止しました"
}

# メイン処理
main() {
  log_info "開発サーバー起動前チェック (ポート: $PORT)"

  # 既存サーバーチェック
  if check_port || check_project_process; then
    log_warning "既存のサーバーが検出されました"
    read -p "既存サーバーを停止して新規起動しますか？ (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      kill_existing_server
    else
      log_error "起動をキャンセルしました"
      exit 1
    fi
  fi

  log_success "ポートは空いています"
  log_info "Next.js開発サーバーを起動中..."
  log_info "メモリ制限: 12GB (RAM: 24GB の場合、システム用に12GB確保)"

  # メモリ制限付きでNext.jsを起動
  # RAM 24GB環境: 12GB設定（システム用に12GB確保）
  pnpm dev:raw
}

main "$@"
