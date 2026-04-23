#!/usr/bin/env python3
"""
Biome feature-order cycle detector.

Loads every biome JSON known to this pack (vanilla MC 1.20.1 + BiomesOPlenty +
our iridescent-biomes-mod resources + a shortlist of other biome-shipping mods
resolved from ../../.minecraft/mods/.index/*.pw.toml) and checks each of the 11
GenerationStep indices for cyclic ordering constraints.

A cycle means two or more biomes declare contradicting relative orders for a
shared pair of features. Minecraft's FeatureSorter crashes the server on world
load when this happens, so we want to catch it at build time before the jar
ships.

COVERAGE: vanilla + BoP + every mod named in MODDED_SHORTLIST below. The
shortlist is the set of mods known to register biomes (aether family, ad-astra,
the-abyss, undergarden, deeperdarker, quark, structory, terramity, etc.). Add
to the list when a new biome-shipping mod joins the pack.

SAFE PATTERN: match a vanilla biome's step 9 verbatim. Vanilla doesn't crash,
and any mod biome consistent with vanilla is consistent with us. If you want
custom vegetation, layer it in via Forge biome modifiers (data/forge/
biome_modifier/) which don't touch FeatureSorter.

Usage:
    python3 tools/check_feature_cycles.py

Exits 0 on success, 1 on any cycle found with a detailed report.

Caches downloaded jars in tools/.cache/ so re-runs are fast (no network after
the first run).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools" / ".cache"
CACHE.mkdir(exist_ok=True)
OUR_BIOMES_DIR = ROOT / "src/main/resources/data/icraft/worldgen/biome"
PACK_INDEX = ROOT.parent / ".minecraft" / "mods" / ".index"

# Pinned versions matching pack's current deps. Bump when you update MC or BoP.
MC_VERSION = "1.20.1"
MC_BUNDLER_URL = "https://piston-data.mojang.com/v1/objects/84194a2f286ef7c14ed7ce0090dba59902951553/server.jar"
BOP_VERSION = "1.20.1-19.0.0.96"
BOP_URL = "https://cdn.modrinth.com/data/HXF82T3G/versions/jxUqRzSD/BiomesOPlenty-forge-1.20.1-19.0.0.96.jar"

VANILLA_JAR = CACHE / f"vanilla-server-{MC_VERSION}.jar"
BOP_JAR = CACHE / f"bop-{BOP_VERSION}.jar"
VANILLA_BIOMES = CACHE / "biomes-vanilla"
BOP_BIOMES = CACHE / "biomes-bop"
MODDED_CACHE = CACHE / "modded"
MODDED_BIOMES = CACHE / "biomes-modded"

# Mods known to register biomes. Entries must match the packwiz toml stem in
# .minecraft/mods/.index/. If a mod is missing, the audit skips it with a note.
MODDED_SHORTLIST = [
    "aether",
    "deep-aether",
    "ad-astra",
    "ad-astra-more-structures",
    "the-abyss-chapter-ii",
    "the-undergarden",
    "deeperdarker",
    "quark",
    "structory",
    "structory-towers",
    "terramity",
    "savage-and-ravage",
    "bygone-nether",
    "blueprint",
    "twilight-aether",
    "dungeons-plus",
    "rftools-dimensions",
    "naturalist",
    "tectonic",
    "the-twilight-forest",
    "blue-skies",
    "supplementaries",
]

# Namespaces whose biomes live in their own dimensions (separate chunk generator)
# and therefore never share a FeatureSorter graph with overworld biomes. Biomes
# from these namespaces still get loaded but are EXCLUDED from the cycle audit
# to avoid false positives. Vanilla nether/end biomes are also excluded by the
# per-biome classifier below.
NON_OVERWORLD_NAMESPACES = {
    "twilightforest",       # Twilight Forest dimension
    "aether",               # Aether dimension
    "aether_redux",
    "deep_aether",          # subdimensions inside Aether
    "blue_skies",            # Everbright + Everdawn
    "the_abyss",             # The Abyss dimension(s)
    "undergarden",           # Undergarden dimension
    "deeperdarker",          # Otherside dimension
    "ad_astra",              # planets
    "bygonenether",          # nether-only
    "twilightaether",
}

# Specific minecraft:* biomes that live in non-overworld chunk generators.
NON_OVERWORLD_VANILLA = {
    "minecraft:nether_wastes", "minecraft:soul_sand_valley", "minecraft:crimson_forest",
    "minecraft:warped_forest", "minecraft:basalt_deltas",
    "minecraft:the_end", "minecraft:end_highlands", "minecraft:end_midlands",
    "minecraft:end_barrens", "minecraft:small_end_islands", "minecraft:the_void",
}


def is_overworld(biome_id: str) -> bool:
    ns = biome_id.split(":", 1)[0]
    if ns in NON_OVERWORLD_NAMESPACES:
        return False
    if biome_id in NON_OVERWORLD_VANILLA:
        return False
    return True


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


_quote_re = re.compile(r"""^(\w[\w-]*)\s*=\s*['"](.+?)['"]\s*$""")
_num_re = re.compile(r"""^(\w[\w-]*)\s*=\s*(\d+)\s*$""")


def parse_toml(path: Path) -> dict:
    """
    Minimal extractor for the fields we care about in packwiz .pw.toml files:
    filename, mode, url, file-id, project-id. Section-agnostic.
    """
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        m = _quote_re.match(line)
        if m:
            out[m.group(1)] = m.group(2)
            continue
        m = _num_re.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def resolve_mod_url(stem: str) -> tuple[str, str] | None:
    """
    Given a toml stem like "aether", return (filename, download_url) or None
    if the toml is missing or lacks a resolvable URL. Mirrors the URL shaping
    done by .minecraft/download_mods.ps1 for curseforge-metadata entries.
    """
    toml = PACK_INDEX / f"{stem}.pw.toml"
    if not toml.exists():
        return None
    data = parse_toml(toml)
    filename = data.get("filename")
    if not filename:
        return None
    mode = data.get("mode", "url")
    url = data.get("url", "")
    if mode == "url" and url:
        return filename, url
    if mode == "metadata:curseforge":
        fid = data.get("file-id", "")
        if not fid:
            return None
        p1 = fid[:4]
        p2 = fid[4:].lstrip("0") or "0"
        # filename may contain spaces or other chars urllib rejects as control
        enc = urllib.parse.quote(filename)
        return filename, f"https://edge.forgecdn.net/files/{p1}/{p2}/{enc}"
    return None


def extract_modded_biomes() -> dict[str, Path]:
    """
    For each entry in MODDED_SHORTLIST: download the jar into tools/.cache/modded/,
    scan for data/*/worldgen/biome/*.json members, and dump each namespace's
    biomes into tools/.cache/biomes-modded/<namespace>/. Returns a dict mapping
    namespace -> biomes dir for namespaces that actually shipped biomes.
    """
    MODDED_CACHE.mkdir(exist_ok=True)
    MODDED_BIOMES.mkdir(exist_ok=True)

    import zipfile

    ns_dirs: dict[str, Path] = {}
    missing: list[str] = []
    no_biomes: list[str] = []

    for stem in MODDED_SHORTLIST:
        resolved = resolve_mod_url(stem)
        if not resolved:
            missing.append(stem)
            continue
        filename, url = resolved
        jar_path = MODDED_CACHE / filename
        try:
            fetch(url, jar_path)
        except Exception as e:
            print(f"  [cycle-check]   skip {stem}: download failed ({e})", flush=True)
            continue

        found_any = False
        try:
            with zipfile.ZipFile(jar_path) as zf:
                for name in zf.namelist():
                    # e.g. "data/undergarden/worldgen/biome/dense_forest.json"
                    m = re.match(r"^data/([a-z0-9_\-.]+)/worldgen/biome/([A-Za-z0-9_\-./]+)\.json$", name)
                    if not m:
                        continue
                    ns = m.group(1)
                    if ns in ("minecraft", "biomesoplenty", "icraft", "forge"):
                        continue
                    basename = Path(m.group(2)).name
                    out_dir = MODDED_BIOMES / ns
                    out_dir.mkdir(exist_ok=True)
                    out_path = out_dir / f"{basename}.json"
                    if not out_path.exists():
                        with zf.open(name) as src, out_path.open("wb") as dst:
                            dst.write(src.read())
                    ns_dirs[ns] = out_dir
                    found_any = True
        except zipfile.BadZipFile:
            print(f"  [cycle-check]   skip {stem}: not a valid zip", flush=True)
            continue

        if not found_any:
            no_biomes.append(stem)

    if missing:
        print(f"  [cycle-check] missing tomls: {', '.join(missing)}", flush=True)
    if no_biomes:
        print(f"  [cycle-check] no biome JSONs in: {', '.join(no_biomes)}", flush=True)
    return ns_dirs


def load_biomes() -> dict[str, list[list[str]]]:
    biomes: dict[str, list[list[str]]] = {}
    for p in sorted(VANILLA_BIOMES.glob("*.json")):
        with p.open() as f:
            biomes["minecraft:" + p.stem] = json.load(f).get("features", [])
    for p in sorted(BOP_BIOMES.glob("*.json")):
        with p.open() as f:
            biomes["biomesoplenty:" + p.stem] = json.load(f).get("features", [])
    for ns_dir in sorted(MODDED_BIOMES.glob("*/")):
        ns = ns_dir.name
        for p in sorted(ns_dir.glob("*.json")):
            with p.open() as f:
                biomes[f"{ns}:{p.stem}"] = json.load(f).get("features", [])
    for p in sorted(OUR_BIOMES_DIR.glob("*.json")):
        with p.open() as f:
            biomes["icraft:" + p.stem] = json.load(f).get("features", [])
    return biomes


def find_step_cycles(biomes: dict[str, list[list[str]]], step_idx: int):
    """
    Build the ordering graph and detect *any* cycle length. Matches vanilla
    FeatureSorter: each biome's consecutive pairs (a, b) at this step
    contribute an a->b edge. Earlier versions of this detector only caught
    2-cycles and 3-cycles and missed longer ones.

    Returns a list of tuples:
      ("2-cycle", a, b, None, adj[a][b], adj[b][a], None)
      ("ncycle", path_list, None, None, edge_sources, None, None)
    """
    adj: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for bname, feats in biomes.items():
        if not is_overworld(bname):
            continue
        if step_idx >= len(feats):
            continue
        step = feats[step_idx]
        # Vanilla FeatureSorter only adds edges between *consecutive* features,
        # not all-pairs within a step. Match that precisely.
        for i in range(len(step) - 1):
            adj[step[i]][step[i + 1]].add(bname)

    cycles = []

    # Direct 2-cycles first — clearest report.
    seen_pairs = set()
    for a, succs in list(adj.items()):
        for b in succs:
            if b in adj and a in adj[b]:
                pair = tuple(sorted([a, b]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                cycles.append(("2-cycle", a, b, None, adj[a][b], adj[b][a], None))

    if cycles:
        return cycles

    # General cycle detection: DFS with recursion stack. Record each unique
    # cycle once (shortest-first, canonicalized by rotation to lowest label).
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {}
    parent: dict[str, str] = {}
    found: list[list[str]] = []

    def dfs(u: str):
        color[u] = GRAY
        for v in adj.get(u, ()):
            if color.get(v, WHITE) == GRAY:
                # Reconstruct cycle u..v in reverse using parent[]
                cyc = [v]
                x = u
                while x != v and x is not None:
                    cyc.append(x)
                    x = parent.get(x)
                cyc.reverse()
                found.append(cyc)
            elif color.get(v, WHITE) == WHITE:
                parent[v] = u
                dfs(v)
        color[u] = BLACK

    # Python's default recursion cap would trip on long chains of 500+ features.
    sys.setrecursionlimit(20000)
    for node in list(adj.keys()):
        if color.get(node, WHITE) == WHITE:
            dfs(node)

    # Deduplicate by canonical rotation
    seen: set[tuple] = set()
    for cyc in found:
        if len(cyc) < 2:
            continue
        mn = min(range(len(cyc)), key=lambda i: cyc[i])
        canon = tuple(cyc[mn:] + cyc[:mn])
        if canon in seen:
            continue
        seen.add(canon)
        # Collect biomes that contributed each edge of the cycle.
        edge_sources: set[str] = set()
        for i in range(len(canon)):
            a = canon[i]
            b = canon[(i + 1) % len(canon)]
            edge_sources |= adj.get(a, {}).get(b, set())
        cycles.append(("ncycle", list(canon), None, None, edge_sources, None, None))

    return cycles


def format_sources(srcs):
    srcs = sorted(srcs)
    if len(srcs) <= 4:
        return ", ".join(srcs)
    return ", ".join(srcs[:4]) + f" (+{len(srcs) - 4} more)"


def main() -> int:
    print("[cycle-check] extracting reference biome JSONs ...", flush=True)
    extract_vanilla_biomes()
    extract_bop_biomes()
    ns_dirs = extract_modded_biomes()
    if ns_dirs:
        print(f"[cycle-check] pulled biomes from {len(ns_dirs)} modded namespaces: "
              f"{', '.join(sorted(ns_dirs))}", flush=True)
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
                    _, path, _, _, srcs, _, _ = c
                    print(f"  {len(path)}-cycle:")
                    for i in range(len(path)):
                        a = path[i]
                        b = path[(i + 1) % len(path)]
                        print(f"    {a} -> {b}")
                    print(f"    involved biomes: {format_sources(srcs)}")
            if len(cycles) > 5:
                print(f"  ... {len(cycles) - 5} more")
            total += len(cycles)

    if total:
        print(f"\n[cycle-check] FAILED: {total} cycles across 11 steps — server will crash on world load")
        print("[cycle-check] Fix: reorder the offending features in our biome JSONs to match")
        print("[cycle-check] the vanilla/BoP/modded biomes' relative order for shared feature pairs.")
        return 1
    print(f"[cycle-check] PASS: all 11 steps cycle-free across {len(biomes)} biomes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
