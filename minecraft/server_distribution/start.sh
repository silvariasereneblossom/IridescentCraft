#!/usr/bin/env bash
# IridescentCraft Server Start Script (Linux)
# Forge 1.20.1-47.4.6 with 420+ mods
#
# Requirements:
#   - Java 17 (e.g., Adoptium/Temurin JDK 17)
#   - 8-12 GB RAM available for the server
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

# JVM Arguments optimized for 420+ mod modpack
# -Xmx10G: Maximum 10GB heap (adjust based on your system, minimum 8G recommended)
# -Xms8G: Start with 8GB to reduce GC pressure during startup
# G1GC: Best garbage collector for large modded servers
JVM_ARGS=(
    -Xmx10G
    -Xms8G
    -XX:+UseG1GC
    -XX:+ParallelRefProcEnabled
    -XX:MaxGCPauseMillis=200
    -XX:+UnlockExperimentalVMOptions
    -XX:+DisableExplicitGC
    -XX:+AlwaysPreTouch
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
)

echo "=========================================="
echo "  IridescentCraft Server"
echo "  Forge 1.20.1-47.4.6"
echo "  RAM: 8-10 GB allocated"
echo "=========================================="
echo ""

# Run the Forge server
java "${JVM_ARGS[@]}" @libraries/net/minecraftforge/forge/1.20.1-47.4.6/unix_args.txt nogui "$@"
