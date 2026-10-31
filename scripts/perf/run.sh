#!/bin/sh
# The whole check: the switch test, with a 5 s sample of the window's main
# thread taken 8 s in. Process: Herdr (the app) or herdr-app (a source build).
#
#   scripts/perf/run.sh <label> <process> <space-id-a> <space-id-b>
set -e
here=$(cd "$(dirname "$0")" && pwd); out=${TMPDIR:-/tmp}/ship-it-perf; mkdir -p "$out"
pid=$(pgrep -x "$2" | head -1); [ -n "$pid" ] || { echo "no $2 process"; exit 1; }
python3 "$here/switch-test.py" "$1" "$3" "$4" &
sleep 8; /usr/bin/sample "$pid" 5 -f "$out/$1.sample" >/dev/null 2>&1
wait
python3 "$here/maintenance-share.py" "$out/$1.sample"
echo "sample: $out/$1.sample"
