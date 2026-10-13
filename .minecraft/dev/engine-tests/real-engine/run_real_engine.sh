#!/usr/bin/env bash
# =============================================================================
# run_real_engine.sh -- ONE offline boot of a real Forge 1.20.1 dedicated server
# with the pack's own KubeJS + Rhino + Architectury jars and the probe scripts of
# this folder. Loopback only, online-mode=false, fresh world, about 30 seconds.
# Never touches the live server or a repository. Called by `run.py real-engine`
# (through WSL on the dev PC); the kubejs server log it leaves in <out dir> is
# what run.py parses.
#
#   run_real_engine.sh <probe dir> <out dir> <mods dir> <forge server dir> <port> <jar>...
#
#   probe dir         this folder (the .js files) plus the generated class list
#   out dir           receives kubejs-server.log, latest.log, jars.sha256
#   mods dir          where the three jars are (the PrismLauncher instance's mods)
#   forge server dir  a Forge server install: `java -jar forge-1.20.1-<v>-installer.jar
#                     --installServer` in an empty folder (needs its libraries/)
#   jar...            file names of the jars to load, verified by run.py beforehand
# =============================================================================
set -u
PROBE="$1"; OUT="$2"; MODS="$3"; SERVER="$4"; PORT="$5"; shift 5
SERVER="${SERVER/#\~/$HOME}"
RUN="$HOME/icraft-engine-tests/run"

ARGS="$(ls "$SERVER"/libraries/net/minecraftforge/forge/*/unix_args.txt 2>/dev/null | head -1)"
[ -n "$ARGS" ] || { echo "REAL-ENGINE ERROR: no Forge server install at $SERVER (libraries/net/minecraftforge/forge/<version>/unix_args.txt)"; exit 5; }
FORGE="$(basename "$(dirname "$ARGS")")"
command -v java >/dev/null 2>&1 || { echo "REAL-ENGINE ERROR: no java on PATH in this shell"; exit 5; }

rm -rf "$RUN"; mkdir -p "$RUN/mods" "$RUN/kubejs/server_scripts" "$OUT"
cd "$RUN" || exit 5
ln -s "$SERVER/libraries" libraries
for j in "$@"; do cp "$MODS/$j" mods/ || { echo "REAL-ENGINE ERROR: missing jar $MODS/$j"; exit 5; }; done
( cd mods && sha256sum *.jar ) > "$OUT/jars.sha256"
cp "$PROBE"/*.js kubejs/server_scripts/
# what the JsonIO facts read, and the startup-side probe (both optional: an older probe folder has neither)
[ -f "$PROBE/jsonio_probe.json" ] && cp "$PROBE/jsonio_probe.json" kubejs/icraft_engine_probe.json
if ls "$PROBE"/startup/*.js >/dev/null 2>&1; then mkdir -p kubejs/startup_scripts && cp "$PROBE"/startup/*.js kubejs/startup_scripts/; fi
echo "eula=true" > eula.txt
cat > server.properties <<EOF
online-mode=false
server-ip=127.0.0.1
server-port=$PORT
level-seed=20261012
view-distance=4
simulation-distance=4
spawn-protection=0
sync-chunk-writes=false
max-tick-time=-1
enable-rcon=false
enable-query=false
motd=engine-tests probe
EOF
{ echo "-Xmx3G"; echo "-Xms1G"; } > user_jvm_args.txt

mkfifo console.fifo
exec 3<>console.fifo
java @user_jvm_args.txt "@libraries/net/minecraftforge/forge/$FORGE/unix_args.txt" nogui <&3 > console.log 2>&1 &
PID=$!
for i in $(seq 1 300); do
  grep -q 'Done (' logs/latest.log 2>/dev/null && break
  kill -0 "$PID" 2>/dev/null || { echo "REAL-ENGINE ERROR: the JVM exited during boot"; tail -40 console.log; exit 3; }
  sleep 1
done
grep -q 'Done (' logs/latest.log 2>/dev/null || { echo "REAL-ENGINE ERROR: no 'Done' after 300 s"; tail -40 console.log; kill "$PID"; exit 4; }
for i in $(seq 1 60); do grep -q 'engine-probe\] END' logs/kubejs/server.log 2>/dev/null && break; sleep 1; done
echo "stop" >&3
for i in $(seq 1 60); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
kill -0 "$PID" 2>/dev/null && { echo "did not stop in 60 s; killing"; kill -9 "$PID"; }
wait "$PID" 2>/dev/null; CODE=$?
cp logs/kubejs/server.log "$OUT/kubejs-server.log"
cp logs/latest.log "$OUT/latest.log"
echo "forge=$FORGE"
echo "java=$(java -version 2>&1 | head -1)"
echo "booted=$(grep -m1 'Done (' logs/latest.log | sed 's/^.*: //')"
echo "jvm_exit=$CODE"
echo "crash_reports=$(ls crash-reports 2>/dev/null | wc -l)"
echo "script_errors=$(grep -c ' \[ERROR\] ' logs/kubejs/server.log)"
grep -q 'engine-probe\] END' logs/kubejs/server.log || { echo "REAL-ENGINE ERROR: the probe did not reach END"; grep -E '\[(ERROR|WARN)\]' logs/kubejs/server.log | head -20; exit 6; }
exit 0
