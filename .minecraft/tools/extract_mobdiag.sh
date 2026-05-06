#!/usr/bin/env bash
# Extract [MOBDIAG-...] lines from kubejs server log into a dedicated
# mobdiag.log file.
#
# Usage:
#   extract_mobdiag.sh                 # client-side (.minecraft/logs/kubejs/)
#   extract_mobdiag.sh --server        # server distro
#   extract_mobdiag.sh --tester USER   # TesterLogs/<USER>/kubejs/
#
# Output: writes mobdiag.log next to the source server.log, plus a copy
# under .minecraft/logs/mobdiag.log for easy access.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC=".minecraft/logs/kubejs/server.log"
case "${1:-}" in
  --server)
    SRC=".minecraft/server_distribution/logs/kubejs/server.log"
    [ ! -f "$SRC" ] && SRC=".minecraft/server_distribution/TesterLogs/Server Logs/kubejs-server.log"
    ;;
  --tester)
    user="${2:-silvieserene}"
    SRC=".minecraft/TesterLogs/${user}/kubejs/server.log"
    ;;
  '') ;;
  *) echo "Unknown arg: $1"; exit 2 ;;
esac

if [ ! -f "$SRC" ]; then
  echo "[extract_mobdiag] source not found: $SRC"
  exit 1
fi

OUT="$(dirname "$SRC")/mobdiag.log"
COPY=".minecraft/logs/mobdiag.log"

grep -E '\[MOBDIAG' "$SRC" > "$OUT" || {
  echo "[extract_mobdiag] no [MOBDIAG] lines in $SRC"
  echo "  (script either hasn't fired yet, or no anomalous mobs encountered)"
  : > "$OUT"
}
mkdir -p "$(dirname "$COPY")"
cp "$OUT" "$COPY"

LINES=$(wc -l < "$OUT")
echo "[extract_mobdiag] wrote $LINES lines"
echo "  primary: $OUT"
echo "  copy:    $COPY"
