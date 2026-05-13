#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT/.runtime"
PIDFILE="$RUNTIME_DIR/public-demo-bot.pid"
LOGFILE="$RUNTIME_DIR/public-demo-bot.log"
CMD=(node --import tsx src/bot/run-telegram-bot.ts)

if [[ -z "${TURING_TELEGRAM_BOT_TOKEN:-}" && -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
fi

mkdir -p "$RUNTIME_DIR"
cd "$ROOT"

is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  [[ -f "$PIDFILE" ]] && cat "$PIDFILE" || true
}

start() {
  if [[ -z "${TURING_TELEGRAM_BOT_TOKEN:-}" && -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
    echo "Missing TURING_TELEGRAM_BOT_TOKEN. Create a fresh BotFather bot for Turing MindGames and add its token to .env." >&2
    return 1
  fi

  local pid
  pid="$(read_pid)"
  if is_running "$pid"; then
    echo "ALREADY_RUNNING:$pid"
    return 0
  fi

  if [[ -n "$pid" ]]; then
    rm -f "$PIDFILE"
  fi

  nohup "${CMD[@]}" >> "$LOGFILE" 2>&1 < /dev/null &
  pid=$!
  echo "$pid" > "$PIDFILE"
  sleep 2

  if is_running "$pid"; then
    echo "STARTED:$pid"
  else
    echo "FAILED_TO_START:$pid"
    tail -n 40 "$LOGFILE" || true
    return 1
  fi
}

stop() {
  local pid
  pid="$(read_pid)"
  if ! is_running "$pid"; then
    echo "NOT_RUNNING"
    rm -f "$PIDFILE"
    return 0
  fi

  kill -TERM "$pid"
  for _ in {1..20}; do
    if ! is_running "$pid"; then
      rm -f "$PIDFILE"
      echo "STOPPED"
      return 0
    fi
    sleep 1
  done

  echo "FORCE_KILL:$pid"
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PIDFILE"
}

status() {
  local pid
  pid="$(read_pid)"
  if is_running "$pid"; then
    echo "RUNNING:$pid"
    ps -fp "$pid" || true
  else
    echo "STOPPED"
    [[ -n "$pid" ]] && echo "STALE_PIDFILE:$pid"
    return 0
  fi
}

logs() {
  tail -n 80 "$LOGFILE" || true
}

restart() {
  stop || true
  start
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
