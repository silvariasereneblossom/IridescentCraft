#!/usr/bin/env python3
"""
Biome feature-order cycle detector.

Loads every biome JSON known to this pack (vanilla MC 1.20.1 + BiomesOPlenty +
our iridescent-biomes-mod resources) and checks each of the 11 GenerationStep
indices for cyclic ordering constraints.

A cycle means two or more biomes declare contradicting relative orders for a
shared pair of features. Minecraft's FeatureSorter crashes the server on world
load when this happens, so we want to catch it at build time before the jar
ships.

Usage:
    python3 tools/check_feature_cycles.py

Exits 0 on success, 1 on any cycle found with a detailed report.

Caches downloaded jars in tools/.cache/ so re-runs are fast (no network after
the first run).
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools" / ".cache"
CACHE.mkdir(exist_ok=True)
OUR_BIOMES_DIR = ROOT / "src/main/resources/data/icraft/worldgen/biome"

# Pinned versions matching pack's current deps. Bump when you update MC or BoP.
MC_VERSION = "1.20.1"
MC_BUNDLER_URL = "https://piston-data.mojang.com/v1/objects/84194a2f286ef7c14ed7ce0090dba59902951553/server.jar"
BOP_VERSION = "1.20.1-19.0.0.96"
BOP_URL = "https://cdn.modrinth.com/data/HXF82T3G/versions/jxUqRzSD/BiomesOPlenty-forge-1.20.1-19.0.0.96.jar"

VANILLA_JAR = CACHE / f"vanilla-server-{MC_VERSION}.jar"
BOP_JAR = CACHE / f"bop-{BOP_VERSION}.jar"
VANILLA_BIOMES = CACHE / "biomes-vanilla"
BOP_BIOMES = CACHE / "biomes-bop"


def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    print(f"  [cycle-check] downloading {url} -> {dest.name} ...", flush=True)
    urllib.request.urlretrieve(url, dest)


def extract_vanilla_biomes() -> None:
    """The MC server jar is a bundler — inner server-X.Y.Z.jar holds the data."""
    if VANILLA_BIOMES.exists() and any(VANILLA_BIOMES.glob("*.json")):
        return
    fetch(MC_BUNDLER_URL, VANILLA_JAR)
    inner = CACHE / f"server-inner-{MC_VERSION}.jar"
    if not inner.exists():
        subprocess.run(
            ["unzip", "-p", str(VANILLA_JAR), f"META-INF/versions/{MC_VERSION}/server-{MC_VERSION}.jar"],
            stdout=inner.open("wb"), check=True,
        )
    VANILLA_BIOMES.mkdir(exist_ok=True)
    # Strip the leading path so JSONs land directly in VANILLA_BIOMES/
    subprocess.run(
        ["unzip", "-o", "-q", "-j", str(inner), "data/minecraft/worldgen/biome/*.json",
         "-d", str(VANILLA_BIOMES)],
        check=True,
    )


def extract_bop_biomes() -> None:
    if BOP_BIOMES.exists() and any(BOP_BIOMES.glob("*.json")):
        return
    fetch(BOP_URL, BOP_JAR)
    BOP_BIOMES.mkdir(exist_ok=True)
    subprocess.run(
        ["unzip", "-o", "-q", "-j", str(BOP_JAR), "data/biomesoplenty/worldgen/biome/*.json",
         "-d", str(BOP_BIOMES)],
        check=True,
    )


def load_biomes() -> dict[str, list[list[str]]]:
    biomes: dict[str, list[list[str]]] = {}
    for p in sorted(VANILLA_BIOMES.glob("*.json")):
        with p.open() as f:
            biomes["minecraft:" + p.stem] = json.load(f).get("features", [])
    for p in sorted(BOP_BIOMES.glob("*.json")):
        with p.open() as f:
            biomes["biomesoplenty:" + p.stem] = json.load(f).get("features", [])
    for p in sorted(OUR_BIOMES_DIR.glob("*.json")):
        with p.open() as f:
            biomes["icraft:" + p.stem] = json.load(f).get("features", [])
    return biomes


def find_step_cycles(biomes: dict[str, list[list[str]]], step_idx: int):
    """
    Returns (cycles, adj) where cycles is a list of (a, b, c, src_ab, src_bc, src_ca)
    for every 3-node cycle in step_idx's ordering graph. adj[a][b] is the set of
    biomes that contributed the a→b edge.
    """
    adj: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for bname, feats in biomes.items():
        if step_idx >= len(feats):
            continue
        step = feats[step_idx]
        for i, a in enumerate(step):
            for b in step[i + 1:]:
                adj[a][b].add(bname)

    cycles = []
    # 2-cycles (direct contradictions) first — these are the actual root bugs
    seen_pairs = set()
    for a, succs in adj.items():
        for b in succs:
            if b in adj and a in adj[b]:
                pair = tuple(sorted([a, b]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                cycles.append(("2-cycle", a, b, None, adj[a][b], adj[b][a], None))

    # 3-cycles only if no 2-cycle exists (every 3-cycle will be transitive shadow
    # of the 2-cycle, so reporting 2-cycles first keeps the output focused).
    if not cycles:
        for a in adj:
            for b in adj[a]:
                if b not in adj:
                    continue
                for c in adj[b]:
                    if c not in adj:
                        continue
                    if a in adj[c]:
                        cycles.append(("3-cycle", a, b, c, adj[a][b], adj[b][c], adj[c][a]))
    return cycles


def format_sources(srcs):
    srcs = sorted(srcs)
    if len(srcs) <= 3:
        return ", ".join(srcs)
    return ", ".join(srcs[:3]) + f" (+{len(srcs) - 3} more)"


def main() -> int:
    print("[cycle-check] extracting reference biome JSONs ...", flush=True)
    extract_vanilla_biomes()
    extract_bop_biomes()
    biomes = load_biomes()
    print(f"[cycle-check] loaded {len(biomes)} biomes", flush=True)

    total = 0
    for step in range(11):
        cycles = find_step_cycles(biomes, step)
        if cycles:
            print(f"\n[cycle-check] STEP {step}: {len(cycles)} cycles")
            for c in cycles[:5]:
                kind = c[0]
                if kind == "2-cycle":
                    _, a, b, _, s_ab, s_ba, _ = c
                    print(f"  contradiction:")
                    print(f"    {a} -> {b}    (from: {format_sources(s_ab)})")
                    print(f"    {b} -> {a}    (from: {format_sources(s_ba)})")
                else:
                    _, a, b, c_, s_ab, s_bc, s_ca = c
                    print(f"  3-cycle:")
                    print(f"    {a} -> {b}    (from: {format_sources(s_ab)})")
                    print(f"    {b} -> {c_}   (from: {format_sources(s_bc)})")
                    print(f"    {c_} -> {a}    (from: {format_sources(s_ca)})")
            if len(cycles) > 5:
                print(f"  ... {len(cycles) - 5} more")
            total += len(cycles)

    if total:
        print(f"\n[cycle-check] FAILED: {total} cycles across 11 steps — server will crash on world load")
        print("[cycle-check] Fix: reorder the offending features in our biome JSONs to match")
        print("[cycle-check] the vanilla/BoP biomes' relative order for shared feature pairs.")
        return 1
    print("[cycle-check] PASS: all 11 steps cycle-free across", len(biomes), "biomes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
