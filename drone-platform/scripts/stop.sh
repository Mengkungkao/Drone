#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; current="$ROOT/.state/current_run"
[[ -f "$current" ]] || { echo 'No managed run active'; exit 0; }
run=$(cat "$current"); pids="$run/pids"
if [[ -f "$pids" ]]; then
  tac "$pids" | while read -r name pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    if kill -0 "$pid" 2>/dev/null; then echo "Stopping $name ($pid)"; kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; fi
  done
  for _ in {1..10}; do awk '{print $2}' "$pids" | while read -r p; do kill -0 "$p" 2>/dev/null && exit 1 || :; done && break; sleep 1; done
  tac "$pids" | while read -r name pid; do kill -0 "$pid" 2>/dev/null && { echo "Force stopping $name ($pid)"; kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; } || :; done
fi
rm -f "$current"; echo "Stopped managed run $run"
