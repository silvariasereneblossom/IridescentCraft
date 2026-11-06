#!/usr/bin/env bash
# IridescentCraft Server Start Script (Linux)
# Forge 1.20.1-47.4.6 with 420+ mods
#
# Requirements:
#   - Java 17 (e.g., Adoptium/Temurin JDK 17)
#   - RAM: the server holds about 5-6 GB at idle, more with players. Its
#     heap may grow to 10 GB (-Xmx10G), about 11-12 GB for the whole
#     server. Less RAM to spare: lower -Xmx below (README.md,
#     "Adjusting RAM").
#
# Usage: ./start.sh

set -e

# Check Java version
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found. Please install Java 17 (Adoptium/Temurin recommended)."
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VER" != "17" ]; then
    echo "WARNING: Java $JAVA_VER detected. Java 17 is required for Forge 1.20.1."
    echo "Attempting to start anyway..."
fi

# JVM flags: the pack launcher's own (AIKAR_FLAGS in
# iridescent-launcher/icraft-core/src/config.rs; keep this list,
# iridescentserver.bat / .sh and user_jvm_args.txt in step with it). Heap as
# measured in November 2026: about 2 GB live after a load, and the server held
# a 4 GB heap through a chunk pregeneration, about 5.3 GB of RAM in all.
#   -Xms4G: the floor. A 2 GB start is outgrown at boot and ended HIGHER.
#   -Xmx10G: room for players and spikes, taken only when needed. Lower it
#     on a machine with less RAM (6G is the lowest tested); keep -Xms4G.
#   No AlwaysPreTouch: it made all of -Xms resident from the first second.
#   Min/MaxHeapFreeRatio 10/30: the heap can shrink back after a busy
#     spell (at G1's next marking cycle).
#   HeapDumpOnOutOfMemoryError: the dump is java_pid<pid>.hprof in the server
#     folder (iridescentserver.sh puts it in crash-reports/heapdumps/).
# No -Xlog GC log here: on Java 17 a log file in a folder that does not exist
# stops the JVM from starting.
JVM_ARGS=(
    -noverify
    -Xmx10G
    -Xms4G
    -XX:MinHeapFreeRatio=10
    -XX:MaxHeapFreeRatio=30
    -XX:+UseG1GC
    -XX:+ParallelRefProcEnabled
    -XX:MaxGCPauseMillis=200
    -XX:+UnlockExperimentalVMOptions
    -XX:+DisableExplicitGC
    -XX:G1NewSizePercent=30
    -XX:G1MaxNewSizePercent=40
    -XX:G1HeapRegionSize=8M
    -XX:G1ReservePercent=20
    -XX:G1HeapWastePercent=5
    -XX:G1MixedGCCountTarget=4
    -XX:InitiatingHeapOccupancyPercent=15
    -XX:G1MixedGCLiveThresholdPercent=90
    -XX:G1RSetUpdatingPauseTimePercent=5
    -XX:SurvivorRatio=32
    -XX:+PerfDisableSharedMem
    -XX:MaxTenuringThreshold=1
    -Dusing.aikars.flags=https://mcflags.emc.gs
    -Daikars.new.flags=true
    -XX:+HeapDumpOnOutOfMemoryError
)

echo "=========================================="
echo "  IridescentCraft Server"
echo "  Forge 1.20.1-47.4.6"
echo "  Heap: 4-10 GB"
echo "=========================================="
echo ""

# Run the Forge server
java "${JVM_ARGS[@]}" @libraries/net/minecraftforge/forge/1.20.1-47.4.6/unix_args.txt nogui "$@"
