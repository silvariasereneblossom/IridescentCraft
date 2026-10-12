#!/usr/bin/env python
"""
audit_loot.py -- find SILENT loot failures: rules that never fire, drops with no live source,
loot in the wrong tier, adds eaten by later strips, ids that do not resolve.

There is no test server, so this checks the pack against the real jars in two halves:

  1. GROUND TRUTH (dev/loot_audit/truth.py): every loot table the installed mods + Paxi zips +
     kubejs/data ship, which structure chests roll which table (parsed from the structure NBT),
     whether that structure piece is generated and in which dimension, entity / item ids, tags.
  2. WHAT THE PACK REGISTERS (dev/loot_audit/LootHarness.java): every loot script is run on the
     game's own Rhino jar against a recording mock of LootJS 2.13.1 whose semantics are copied
     from the decompiled jar (full-match table regexes, removeLoot = one-shot removeIf in
     registration order, a condition gates only what comes AFTER it, ...).

and then joins the two. It also lists every loaded loot table the game's own parser rejects
(TABLE_REJECTED: an item or an entry / function / condition type name that is not registered), from
the jars and from the last mirrored server boot log. Run from anywhere (PowerShell or Git Bash):

    python -I .minecraft/dev/audit_loot.py                 # full report on stdout
    python -I .minecraft/dev/audit_loot.py --summary       # counts only (before/after numbers)
    python -I .minecraft/dev/audit_loot.py --section 1,3   # some sections
    python -I .minecraft/dev/audit_loot.py --json out.json # machine-readable findings

Exit code: 1 when the ENGINE section is non-empty (a script fails to load, a LootJS.modifiers
handler or one of its icraft.section blocks throws, a builder has no actions: each of these drops
modifiers in the game without a word in the loot itself) or when a finding is not listed in
dev/loot_audit/accepted.txt; 0 otherwise. The handlers run behind the pack's real event guard
(kubejs/server_scripts/00_icraft_guard.js), so a throw is reported as GUARD_FAILED.

Needs: Python 3.10+, a JDK (javac/java on PATH), and the PrismLauncher instance (the only place the
third-party jars exist). First run scans ~460 jars (minutes); later runs use the per-jar cache in
dev/loot_audit/.cache/ (git-ignored).

accepted.txt: one finding key per line (`<CODE> <key>  # why`), for findings that are known and are a
design decision or deliberate. The report still prints them, marked [accepted]. Keys carry no line
numbers. A line that starts with `~` is an fnmatch pattern (`~ADD_EATEN loot/a.js <- loot/b.js *`).
Print the keys of everything not yet accepted with --keys.
"""
import argparse
import collections
import fnmatch
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from server_logs import find_server_logs  # noqa: E402  (the server's logs left this repo on 2026-10-11)

AUDIT = os.path.join(HERE, "loot_audit")
CACHE = os.path.join(AUDIT, ".cache")
DEFAULT_REPO = os.path.dirname(HERE)
DEFAULT_MODS = os.path.join(os.environ.get("APPDATA", ""), "PrismLauncher", "instances", "IridescentCraft",
                            ".minecraft", "mods")

# LootContextParamSet -> LootContextType (LootJS LootContextParamSetsMapping). A table's context type
# is decided by the CALLER's param set; these path rules are how vanilla/Forge callers map.
TYPE_BY_DECLARED = {
    "minecraft:chest": "CHEST", "minecraft:entity": "ENTITY", "minecraft:block": "BLOCK",
    "minecraft:fishing": "FISHING", "minecraft:gift": "GIFT", "minecraft:barter": "PIGLIN_BARTER",
    "minecraft:advancement_reward": "ADVANCEMENT_REWARD", "minecraft:advancement_entity": "ADVANCEMENT_ENTITY",
    "minecraft:archaeology": "UNKNOWN",
}


def eprint(*a):
    print(*a, file=sys.stderr)


# --------------------------------------------------------------------------------------------
# helpers over the truth JSON (shapes are normalised here so the rest does not care)
# --------------------------------------------------------------------------------------------
def id_evidence(section):
    """items / entities section -> {id: [evidence...]}"""
    out = {}
    if isinstance(section, dict):
        for k, v in section.items():
            if isinstance(v, dict):
                v = v.get("evidence", list(v.keys()))
            out[k] = list(v) if isinstance(v, (list, tuple, set)) else [str(v)]
    else:
        for e in section or []:
            if isinstance(e, str):
                out[e] = []
            elif isinstance(e, dict):
                out[e.get("id")] = list(e.get("evidence", []))
            elif isinstance(e, (list, tuple)) and e:
                out[e[0]] = list(e[1]) if len(e) > 1 and isinstance(e[1], (list, tuple)) else []
    return out


def tag_members(section):
    """item_tags section -> ({tag: set(members)} for tags with a member list, {tag: count})"""
    members, counts = {}, {}
    for tag, v in (section or {}).items():
        if isinstance(v, int):
            counts[tag] = v
        elif isinstance(v, list):
            members[tag] = set(v)
            counts[tag] = len(v)
        elif isinstance(v, dict):
            m = v.get("members")
            counts[tag] = v.get("count", len(m) if m is not None else 0)
            if m is not None:
                members[tag] = set(m)
    return members, counts


def ntfs_key(rel):
    # Files.walk on NTFS: depth-first, each directory in name order with upper-cased comparison
    return tuple(part.upper() for part in rel.split("/"))


def script_priority(path):
    """KubeJS ScriptFileInfo.preload: ANY `//` line matching the property pattern counts, anywhere."""
    prio, props = 0, {}
    pat = re.compile(r"^(\w+)\s*[:=]?\s*(-?\w+)$")
    try:
        for line in open(path, encoding="utf-8", errors="replace"):
            t = line.strip()
            if t.startswith("//"):
                m = pat.search(t[2:].strip())
                if m:
                    props.setdefault(m.group(1), []).append(m.group(2))
    except OSError:
        return 0, {}
    if "priority" in props:
        try:
            prio = int(props["priority"][-1])
        except ValueError:
            prio = None   # Integer.parseInt throws -> the game fails to pre-load the file
    return prio, props


class Truth:
    def __init__(self, data):
        self.d = data
        self.tables = data.get("loot_tables", {})
        self.roots = data.get("table_roots", {})
        self.structures = data.get("structures", {})
        self.reach = data.get("template_reach", {})
        self.worldgen = data.get("worldgen_structures", {})
        self.items = id_evidence(data.get("items"))
        self.entities = id_evidence(data.get("entities"))
        self.mods = data.get("mods", {})
        self.tag_members, self.tag_counts = tag_members(data.get("item_tags"))
        for tag, mem in (data.get("item_tag_members") or {}).items():
            self.tag_members[tag] = set(mem)
            self.tag_counts.setdefault(tag, len(mem))
        self.dimensions = set(data.get("dimensions") or {})
        self.all_table_ids = set(self.tables) | set(self.roots)

    # Vanilla tables that vanilla code never rolls as a root: FishingHook rolls
    # minecraft:gameplay/fishing and reaches these three only through `loot_table` entries.
    VANILLA_NESTED_ONLY = {"minecraft:gameplay/fishing/fish", "minecraft:gameplay/fishing/junk",
                           "minecraft:gameplay/fishing/treasure"}

    def table_class(self, tid):
        """How is the table rolled AS A ROOT (Forge runs loot modifiers for the root table only):
        strong  = a generated structure's chest NBT, an entity/block default, vanilla code, a processor,
                  an advancement reward or a function names it
        code    = the id (or its path) is a string constant in a mod class: probably assigned from code
        json    = only another data file names it (boss config, a loot-modifier that injects it, ...)
        unreachable = only chests in structure pieces nothing generates
        nested  = only a `loot_table` entry inside another table
        orphan  = no evidence at all (mods that build the id from parts in code land here too)
        missing = no installed pack ships it"""
        if tid not in self.tables:
            return "missing"
        ev = (self.roots.get(tid) or {}).get("rolled_by", [])
        kinds = collections.Counter()
        for e in ev:
            k = e.get("kind")
            if k == "structure_nbt" and e.get("template_reachable") is False:
                k = "structure_nbt_unreachable"
            if k == "block_default":
                # `<ns>:blocks/<x>` is a block's own drop table only if a block <ns>:<x> exists; the
                # scanner labels by path, so ask the item list (blocks without an item are missed)
                ns, path = tid.split(":", 1)
                if (ns + ":" + path[len("blocks/"):]) not in self.items and ns != "minecraft":
                    continue
            kinds[k] += 1
        if tid in self.VANILLA_NESTED_ONLY:
            return "nested"
        strong = {"structure_nbt", "structure_entity", "processor", "vanilla_builtin", "entity_default",
                  "block_default", "advancement_reward", "function"}
        if any(k in strong for k in kinds):
            return "strong"
        if kinds.get("class_const") or kinds.get("class_const_path"):
            return "code"
        if kinds.get("other_json"):
            return "json"
        if kinds.get("structure_nbt_unreachable"):
            return "unreachable"
        if kinds.get("nested_in"):
            return "nested"
        return "orphan"

    LIVE = ("strong", "code", "json")

    VANILLA_NETHER = ("bastion_bridge", "bastion_hoglin_stable", "bastion_other", "bastion_treasure", "nether_bridge")

    def table_dims(self, tid):
        """Dimensions the table is rolled in, as far as the jars show (None = unknown)."""
        dims = set()
        for e in (self.roots.get(tid) or {}).get("rolled_by", []):
            if e.get("kind") == "structure_nbt" and e.get("template_reachable") is not False:
                dims.update(e.get("dimensions") or [])
        if tid.startswith("minecraft:chests/"):
            leaf = tid.split("/", 1)[1]
            if leaf in self.VANILLA_NETHER:
                dims.add("minecraft:the_nether")
            elif leaf == "end_city_treasure":
                dims.add("minecraft:the_end")
            elif leaf == "ruined_portal":
                dims.update(("minecraft:overworld", "minecraft:the_nether"))
            else:
                dims.add("minecraft:overworld")
        return dims or None

    def table_ctx_type(self, tid):
        t = self.tables.get(tid, {})
        path = tid.split(":", 1)[1]
        if path.startswith("chests/") or "/chests/" in path:
            return "CHEST"
        if path.startswith("entities/"):
            return "ENTITY"
        if path.startswith("blocks/"):
            return "BLOCK"
        # The context is the CALLER's parameter set, not the table's path or declared type. A container
        # placed by a structure template (RandomizableContainerBlockEntity) and a suspicious block
        # (BrushableBlockEntity, also when a structure processor assigns its table) both unpack with
        # LootContextParamSets.CHEST (f_81411_, bytecode-checked 2026-10-11) -- so archaeology IS in
        # the CHEST context and the pack's LootType.CHEST rules do reach it.
        if path.startswith("archaeology/") or path.startswith("archeology/"):
            return "CHEST"
        ev = (self.roots.get(tid) or {}).get("rolled_by", [])
        if any(e.get("kind") == "processor" or (e.get("kind") == "structure_nbt" and e.get("template_reachable"))
               for e in ev):
            return "CHEST"
        return TYPE_BY_DECLARED.get(t.get("type") or "", "UNKNOWN")

    def why(self, tid, limit=3):
        ev = (self.roots.get(tid) or {}).get("rolled_by", [])
        parts = []
        for e in ev[:limit]:
            s = e.get("kind", "?")
            if e.get("detail"):
                s += " " + str(e["detail"])
            if e.get("kind") == "structure_nbt":
                if e.get("template_reachable") is False:
                    s += " (piece not generated)"
                elif e.get("dimensions"):
                    s += " [" + ",".join(e["dimensions"]) + "]"
            parts.append(s)
        if len(ev) > limit:
            parts.append("+%d more" % (len(ev) - limit))
        return "; ".join(parts) if parts else "no evidence that anything rolls it"


# --------------------------------------------------------------------------------------------
# pack facts read straight from the repo
# --------------------------------------------------------------------------------------------
def dimension_tiers(repo):
    """The stage gate is the authority for which tier a dimension belongs to."""
    tiers = {"minecraft:overworld": 1}
    p = os.path.join(repo, "kubejs", "server_scripts", "gates", "astages_restrictions.js")
    try:
        src = open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return tiers
    for m in re.finditer(r"stageDimension\(\s*'tier_(\d)'\s*,\s*'([a-z0-9_:/.-]+)'", src):
        tiers[m.group(2)] = int(m.group(1))
    return tiers


def scan_dimensions_and_glms(mods_dir, repo):
    """Dimension ids + global-loot-modifier files from jars / Paxi / kubejs data (cached by listing)."""
    jars = sorted(glob.glob(os.path.join(mods_dir, "*.jar")))
    zips = sorted(glob.glob(os.path.join(repo, "config", "paxi", "datapacks", "*.zip")))
    sig = hashlib.sha1("|".join("%s:%d:%d" % (os.path.basename(j), os.path.getsize(j), int(os.path.getmtime(j)))
                                for j in jars + zips).encode()).hexdigest()
    cache = os.path.join(CACHE, "dims_glms.json")
    if os.path.exists(cache):
        try:
            c = json.load(open(cache, encoding="utf-8"))
            if c.get("sig") == sig:
                return c
        except (OSError, ValueError):
            pass
    dims = {"minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"}
    glm_files = {}       # id -> [pack...]
    glm_lists = {}       # pack -> {"replace": bool, "entries": [...]}
    dim_re = re.compile(r"^data/([^/]+)/dimension/(.+)\.json$")
    glm_re = re.compile(r"^data/([^/]+)/loot_modifiers/(.+)\.json$")

    def visit(names_reader, pack):
        for name, read in names_reader:
            m = dim_re.match(name)
            if m:
                dims.add(m.group(1) + ":" + m.group(2))
                continue
            m = glm_re.match(name)
            if m:
                gid = m.group(1) + ":" + m.group(2)
                if gid == "forge:global_loot_modifiers":
                    try:
                        glm_lists[pack] = json.loads(read().decode("utf-8", "replace"))
                    except ValueError as e:
                        glm_lists[pack] = {"error": str(e)}
                else:
                    glm_files.setdefault(gid, []).append(pack)

    def zip_entries(zf):
        for n in zf.namelist():
            yield n, (lambda n=n: zf.read(n))

    def walk_zip(path, pack, depth=0):
        try:
            with zipfile.ZipFile(path) as zf:
                visit(zip_entries(zf), pack)
                if depth < 2:
                    for n in zf.namelist():
                        if n.endswith(".jar") and (n.startswith("META-INF/jarjar/") or n.startswith("META-INF/jars/")):
                            import io
                            try:
                                with zipfile.ZipFile(io.BytesIO(zf.read(n))) as inner:
                                    visit(zip_entries(inner), pack + "!" + os.path.basename(n))
                            except zipfile.BadZipFile:
                                pass
        except (zipfile.BadZipFile, OSError):
            pass

    for j in jars:
        walk_zip(j, "mod:" + os.path.basename(j))
    for z in zips:
        walk_zip(z, "paxi:" + os.path.basename(z), depth=9)
    kroot = os.path.join(repo, "kubejs", "data")
    entries = []
    for dp, _, fns in os.walk(kroot):
        for fn in fns:
            full = os.path.join(dp, fn)
            rel = "data/" + os.path.relpath(full, kroot).replace(os.sep, "/")
            entries.append((rel, (lambda full=full: open(full, "rb").read())))
    visit(entries, "kubejs_data")
    out = {"sig": sig, "dimensions": sorted(dims), "glm_files": glm_files, "glm_lists": glm_lists}
    os.makedirs(CACHE, exist_ok=True)
    json.dump(out, open(cache, "w", encoding="utf-8"))
    return out


# --------------------------------------------------------------------------------------------
# running the two halves
# --------------------------------------------------------------------------------------------
def run_truth(args):
    out = os.path.join(CACHE, "truth.json")
    if args.skip_truth and os.path.exists(out):
        return json.load(open(out, encoding="utf-8"))
    cmd = [sys.executable, "-I", os.path.join(AUDIT, "truth.py"), "--mods", args.mods, "--repo", args.repo, "--out", out]
    if args.no_cache:
        cmd.append("--no-cache")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out):
        eprint(r.stdout[-2000:], r.stderr[-4000:])
        sys.exit("truth.py failed")
    if args.verbose:
        eprint(r.stdout.strip())
    return json.load(open(out, encoding="utf-8"))


def find_lib(mods_dir, *parts):
    libs = os.path.normpath(os.path.join(mods_dir, "..", "..", "..", "..", "libraries"))
    hits = sorted(glob.glob(os.path.join(libs, *parts)))
    return hits[-1] if hits else None


# kubejs/server_scripts/00_icraft_guard.js: icraft.guard / icraft.section (event isolation). The real file is
# loaded and its self-test runs, so the handlers the audit fires are guarded as in game: one that throws is
# caught by the guard, and shows here as the guard's own "[icraft.guard] FAILED" line (GUARD_FAILED below).
GUARD_SCRIPT = "00_icraft_guard.js"


def choose_scripts(repo):
    """Every server script in KubeJS load order, and the subset the audit loads."""
    root = os.path.join(repo, "kubejs", "server_scripts")
    rels = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith(".js"):
                rels.append(os.path.relpath(os.path.join(dp, fn), root).replace(os.sep, "/"))
    info = {}
    for rel in rels:
        prio, props = script_priority(os.path.join(root, rel.replace("/", os.sep)))
        info[rel] = {"priority": prio, "props": props}
    ordered = sorted(rels, key=ntfs_key)
    ordered = sorted(ordered, key=lambda r: -(info[r]["priority"] or 0))   # stable
    loaded, loot_files, recipe_files = [], [], []
    for rel in ordered:
        src = open(os.path.join(root, rel.replace("/", os.sep)), encoding="utf-8", errors="replace").read()
        is_loot = rel.startswith("loot/") or re.search(r"\bLootJS\s*\.", src) is not None
        is_recipe = "ServerEvents.recipes" in src
        if rel == GUARD_SCRIPT:
            is_loot = is_recipe = False      # it names both events in its comments and registers nothing
        if is_loot:
            loot_files.append(rel)
        if is_recipe:
            recipe_files.append(rel)
        # the guard file: every registration below is `X.y(icraft.guard(...))`, so it loads too (first: its priority)
        if is_loot or is_recipe or rel == GUARD_SCRIPT:
            loaded.append(rel)
    return root, ordered, loaded, loot_files, recipe_files, info


def server_log_order(repo):
    logs, _ = find_server_logs(repo)
    if not logs:
        return None
    log = os.path.join(logs, "kubejs", "server.log")
    order = []
    try:
        for line in open(log, encoding="utf-8", errors="replace"):
            m = re.search(r"Loaded script server_scripts:(\S+) in ", line)
            if m:
                order.append(m.group(1))
    except OSError:
        return None
    return order


def boot_log_rejects(repo):
    """Loot tables the dedicated server itself dropped at its last mirrored boot: ForgeHooks logs
    `Couldn't parse element loot_tables:<id>` and the exception on the next line.
    -> (boot stamp, {table id: reason}); (None, {}) when no server log can be read (server_logs.py)."""
    logs, _ = find_server_logs(repo)
    if not logs:
        return None, collections.OrderedDict()
    log = os.path.join(logs, "latest.log")
    out, stamp, pending = collections.OrderedDict(), None, None
    try:
        with open(log, encoding="utf-8", errors="replace") as f:
            for line in f:
                if stamp is None:
                    m = re.match(r"\[(\w+ \d+:\d+)", line)
                    stamp = m.group(1) if m else "?"
                if pending:
                    out[pending] = re.sub(r"^[\w.$]+(?:Exception|Error): ", "", line.strip())
                    pending = None
                    continue
                m = re.search(r"Couldn't parse element loot_tables:(\S+)", line)
                if m:
                    pending = m.group(1)
    except OSError:
        return None, {}
    return stamp, out


def type_literals(truth, names):
    """{`ns:path`: jar name or None} for loot entry / function / condition type names of INSTALLED mods:
    the jar family of mod `ns` in which `path` (or `ns:path`) is a string constant, i.e. where the
    type can be registered from. None = no class of that mod names it. Cached per jar."""
    packs = {p["id"]: p for p in truth.d.get("packs", [])}
    cache_file = os.path.join(CACHE, "type_literals.json")
    try:
        cache = json.load(open(cache_file, encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    out, by_jar = {}, collections.defaultdict(set)
    for name in names:
        m = truth.mods.get(name.split(":", 1)[0])
        if not m:
            continue
        out[name] = None
        for pid in [m.get("jar")] + [a.get("jar") for a in m.get("also_in", [])]:
            top = ((packs.get(pid) or {}).get("path") or "").split("!", 1)[0]
            if top and os.path.isfile(top):
                by_jar[top].add(name)

    def needles(name):
        # a CONSTANT_Utf8 entry is tag 1, u2 length, bytes: this matches a whole constant, not a substring
        for s in (name.split(":", 1)[1], name):
            b = s.encode("utf-8")
            yield b"\x01" + len(b).to_bytes(2, "big") + b

    def scan(zf, want, found, depth=0):
        for n in zf.namelist():
            if n.endswith(".class"):
                b = zf.read(n)
                for name in want - found:
                    if any(x in b for x in needles(name)):
                        found.add(name)
            elif n.endswith(".jar") and n.startswith("META-INF/") and depth < 3:
                import io
                try:
                    with zipfile.ZipFile(io.BytesIO(zf.read(n))) as inner:
                        scan(inner, want, found, depth + 1)
                except zipfile.BadZipFile:
                    pass
            if len(found) == len(want):
                return

    dirty = False
    for jar, want in sorted(by_jar.items()):
        st = os.stat(jar)
        key = "%s:%d:%d" % (os.path.basename(jar), st.st_size, int(st.st_mtime))
        known = cache.setdefault(key, {})
        todo = set(n for n in want if n not in known)
        if todo:
            found = set()
            try:
                with zipfile.ZipFile(jar) as zf:
                    scan(zf, todo, found)
            except (zipfile.BadZipFile, OSError):
                continue
            for n in todo:
                known[n] = n in found
            dirty = True
        for n in want:
            if known.get(n):
                out[n] = os.path.basename(jar)
    if dirty:
        os.makedirs(CACHE, exist_ok=True)
        json.dump(cache, open(cache_file, "w", encoding="utf-8"))
    return out


def external_globals(repo, root, loaded):
    """global.X names the loaded scripts use that are defined only in scripts we do not load."""
    defined_by = collections.defaultdict(set)
    for base in ("server_scripts", "startup_scripts"):
        for f in glob.glob(os.path.join(repo, "kubejs", base, "**", "*.js"), recursive=True):
            rel = os.path.relpath(f, os.path.join(repo, "kubejs", base)).replace(os.sep, "/")
            src = open(f, encoding="utf-8", errors="replace").read()
            for m in re.finditer(r"\bglobal\.([A-Za-z_]\w*)\s*=(?!=)", src):
                defined_by[m.group(1)].add((base, rel))
    used = collections.defaultdict(list)
    for rel in loaded:
        src = open(os.path.join(root, rel.replace("/", os.sep)), encoding="utf-8", errors="replace").read()
        for i, line in enumerate(src.split("\n"), 1):
            if line.strip().startswith("//"):
                continue
            for m in re.finditer(r"\bglobal\.([A-Za-z_]\w*)", line):
                used[m.group(1)].append("%s:%d" % (rel, i))
    stubs = {}
    for name, where in used.items():
        defs = defined_by.get(name, set())
        if not defs:
            continue
        # the guard file only makes sure the namespace object `global.icraft` exists; its members are defined elsewhere
        if any(base == "server_scripts" and rel in loaded and rel != GUARD_SCRIPT for base, rel in defs):
            continue
        stubs[name] = {"defined_in": sorted("%s/%s" % d for d in defs), "used_at": where[:5]}
    return stubs


def run_harness(args, truth, repo):
    root, ordered, loaded, loot_files, recipe_files, info = choose_scripts(repo)
    os.makedirs(CACHE, exist_ok=True)
    inp = os.path.join(CACHE, "harness_in")
    os.makedirs(inp, exist_ok=True)

    def w(name, lines):
        p = os.path.join(inp, name)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")
        return p

    stubs = external_globals(repo, root, loaded)
    universe = set()
    for t in truth.tables.values():
        universe.update(t.get("items") or [])
    tag_lines = [tag + "\t" + ",".join(sorted(m)) for tag, m in sorted(truth.tag_members.items())]
    groups = ["ServerEvents", "EntityEvents", "PlayerEvents", "BlockEvents", "ItemEvents", "LevelEvents",
              "NetworkEvents", "AStageEvents", "JLForkEvents", "ForgeEvents", "MoreJSEvents", "FTBQuestsEvents",
              "CommonAddedEvents", "ArchEvents", "WorldgenEvents"]
    opaque = ["NBT", "AStages", "Text", "Items", "Component", "Utils", "Block", "Fluid", "JsonIO", "Ingredient",
              "Color", "Vec3", "BlockPos", "UUID", "Notification", "Stats", "Facing", "Direction"]
    files = [
        "--scripts-root", root,
        "--files", w("files.txt", loaded),
        "--items", w("items.txt", sorted(truth.items)),
        "--entities", w("entities.txt", sorted(truth.entities)),
        "--mods", w("mods.txt", sorted(truth.mods)),
        "--tags", w("tags.txt", tag_lines),
        "--universe", w("universe.txt", sorted(universe)),
        "--event-groups", w("groups.txt", groups),
        "--opaque", w("opaque.txt", opaque),
        "--stub-globals", w("stubs.txt", sorted(stubs)),
        "--pass-through", w("pass.txt", ["loot/0_entity_id_validator.js"]),
        "--transparent", w("transparent.txt", [GUARD_SCRIPT]),
        "--capture-events", w("capture.txt", ["ServerEvents.recipes"]),
        "--out", os.path.join(CACHE, "harness.json"),
    ]
    rhino = sorted(glob.glob(os.path.join(args.mods, "rhino-forge-*.jar")))
    if not rhino:
        sys.exit("no rhino-forge-*.jar in " + args.mods)
    gson = find_lib(args.mods, "com", "google", "code", "gson", "gson", "*", "gson-*.jar")
    lang3 = find_lib(args.mods, "org", "apache", "commons", "commons-lang3", "*", "commons-lang3-*.jar")
    if not gson or not lang3:
        sys.exit("gson / commons-lang3 not found under the PrismLauncher libraries folder (Rhino needs both)")
    classes = os.path.join(CACHE, "classes")
    src = os.path.join(AUDIT, "LootHarness.java")
    marker = os.path.join(classes, "LootHarness.class")
    if not os.path.exists(marker) or os.path.getmtime(marker) < os.path.getmtime(src):
        os.makedirs(classes, exist_ok=True)
        r = subprocess.run(["javac", "-Xlint:-unchecked", "-cp", rhino[-1], "-d", classes, src], capture_output=True, text=True)
        if r.returncode != 0:
            eprint(r.stdout[-3000:], r.stderr[-6000:])
            sys.exit("javac LootHarness.java failed")
    cp = os.pathsep.join([rhino[-1], gson, lang3, classes])
    r = subprocess.run(["java", "-cp", cp, "LootHarness"] + files, capture_output=True, text=True)
    if r.returncode != 0:
        eprint(r.stdout[-3000:], r.stderr[-6000:])
        sys.exit("LootHarness failed")
    if args.verbose:
        eprint(r.stdout.strip())
    h = json.load(open(os.path.join(CACHE, "harness.json"), encoding="utf-8"))
    h["_order_all"] = ordered
    h["_loot_files"] = loot_files
    h["_recipe_files"] = recipe_files
    h["_script_info"] = info
    h["_stubs"] = stubs
    h["_rhino"] = os.path.basename(rhino[-1])
    return h


# --------------------------------------------------------------------------------------------
# findings
# --------------------------------------------------------------------------------------------
class Findings:
    def __init__(self, accepted):
        self.rows = []
        # a line starting with "~" is an fnmatch pattern; every other line is an exact key (keys
        # contain regex text, so "*" and "[" are literal there)
        self.accepted = set(a for a in accepted if not a.startswith("~"))
        self.accepted_globs = [a[1:].strip() for a in accepted if a.startswith("~")]

    def add(self, section, code, key, where, msg, detail=None, severity="warn"):
        # keys carry NO line numbers: an accepted finding must stay accepted when lines move
        k = "%s %s" % (code, re.sub(r"(\.js):\d+", r"\1", str(key)))
        k = re.sub(r"\s+", " ", k).strip()
        acc = k in self.accepted or any(fnmatch.fnmatchcase(k, pat) for pat in self.accepted_globs)
        self.rows.append({"section": section, "code": code, "key": k, "where": where, "msg": msg,
                          "detail": detail or [], "severity": severity, "accepted": acc})


def loc(m):
    s = "%s:%s" % (m.get("file"), m.get("line"))
    if m.get("via"):
        pass
    return s


def outer_site(m):
    """Outermost frame inside the handler body: where the rule was asked for (helpers unwound)."""
    st = m.get("stack") or []
    return st[-1] if st else loc(m)


def target_text(m):
    if m["kind"] == "table":
        parts = []
        for t in m["targets"]:
            parts.extend(flat_targets(t))
        return ", ".join(("/%s/" % v if k == "regex" else v) for k, v in parts[:4]) + (" ..." if len(parts) > 4 else "")
    if m["kind"] == "type":
        return "LootType." + "+".join(str(t) for t in m["types"])
    if m["kind"] == "entity":
        return ", ".join(m["entities_raw"])
    return "block " + str(m.get("block"))


def flat_targets(t):
    if t["kind"] == "or":
        out = []
        for p in t["parts"]:
            out.extend(flat_targets(p))
        return out
    return [(t["kind"], t["value"])]


def walk_handlers(handlers, gate=None):
    """Yield (handler, dims, chance, index) with the gate built from conditions that come BEFORE it
    (CompositeLootAction.run: a failing condition stops the handlers after it, not before)."""
    dims, chance = (gate or (None, 1.0))
    for i, h in enumerate(handlers):
        if h["t"] == "cond":
            if h["name"] == "anyDimension":
                d = set(h["args"])
                dims = d if dims is None else (dims & d)
            elif h["name"] == "randomChance":
                chance *= float(h["args"][0])
            continue
        yield h, dims, chance, i
        if h["t"] == "group":
            for x in walk_handlers(h["handlers"], (dims, chance)):
                yield x


def handlers_summary(m, filters, limit=260):
    """One-line description of what a modifier does (for 'what would fixing this turn on')."""
    parts = []
    for hnd in m["handlers"]:
        if hnd["t"] == "cond":
            parts.append("if %s(%s)" % (hnd["name"], ", ".join(str(a) for a in hnd.get("args", []))))
        elif hnd["t"] in ("add", "weighted"):
            es = []
            for e in hnd["entries"]:
                c = entry_chance(e)
                es.append("%s%s" % (e.get("id") or e.get("raw"), (" %.3g%%" % (c * 100)) if c < 1 else ""))
            parts.append(("add " if hnd["t"] == "add" else "add one of ") + ", ".join(es[:6]) + (" ... (%d)" % len(es) if len(es) > 6 else ""))
        elif hnd["t"] in ("remove", "replace", "modify"):
            parts.append("%s %s" % (hnd["t"], filters[hnd["filter"]]["label"][:40]))
        else:
            parts.append(hnd["t"])
    s = "; ".join(parts)
    return s if len(s) <= limit else s[:limit] + " ..."


def read_pack_file(repo, pack, rel):
    """Bytes of `rel` (data/...) inside one of the pack's OWN sources (a Paxi zip or kubejs/data)."""
    try:
        if pack == "kubejs_data":
            p = os.path.join(repo, "kubejs", rel.replace("/", os.sep))
            return open(p, "rb").read()
        if str(pack).startswith("paxi:"):
            with zipfile.ZipFile(os.path.join(repo, "config", "paxi", "datapacks", pack[len("paxi:"):])) as zf:
                return zf.read(rel)
    except (OSError, KeyError, zipfile.BadZipFile):
        return None
    return None


def entry_chance(e):
    c = 1.0
    for cond in e.get("conditions", []):
        if cond.get("name") == "randomChance":
            c *= float(cond["args"][0])
    return c


def build(truth, h, repo, extra, accepted):
    F = Findings(accepted)
    T = truth
    mods = h["modifiers"]
    filters = {f["fid"]: f for f in h["filters"]}
    feval = {int(k): v for k, v in h["filter_eval"].items()}
    for k, v in list(feval.items()):
        if "same_as" in v:
            feval[k] = feval[int(v["same_as"])]
    tiers = dimension_tiers(repo)
    known_dims = set(extra["dimensions"]) | T.dimensions
    stats = collections.OrderedDict()

    # ---------------- [0] engine ----------------
    for e in h["script_errors"]:
        sec = 0 if e["file"] in h["_loot_files"] else 8
        F.add(sec, "SCRIPT_LOAD", e["file"], e["file"],
              "script does not load on the real Rhino + mock: " + e["error"], severity="error" if sec == 0 else "info")
    for x in h["handlers"]:
        if x["status"] == "threw":
            F.add(0, "HANDLER_THROWS", "%s:%s" % (x["file"], x["line"]), "%s:%s" % (x["file"], x["line"]),
                  "LootJS.modifiers handler throws: %s -- in game this ends the whole event: every loot script that loads "
                  "after this one registers NOTHING" % x["error"], severity="error")
        elif x["status"] == "not_run":
            F.add(0, "HANDLER_NOT_RUN", "%s:%s" % (x["file"], x["line"]), "%s:%s" % (x["file"], x["line"]),
                  "never runs (an earlier handler threw)", severity="error")
    # the guard's own report: a handler (or a section of one) that threw, or a guard that switched itself off
    guard_lines = [c for c in h["console"] if "[icraft.guard]" in c["msg"]]
    guard_armed = any("[icraft.guard] armed" in c["msg"] for c in guard_lines)
    for c in guard_lines:
        mm = re.search(r"\[icraft\.guard\] FAILED (\S+) in (\S+): (.*)", c["msg"])
        if mm:
            F.add(0, "GUARD_FAILED", "%s %s" % (mm.group(1), mm.group(2)), mm.group(1),
                  "%s throws in %s: %s -- in game the guard reports it and the rest of the event runs, but whatever this "
                  "handler / section had left to register is missing" % (mm.group(1), mm.group(2), mm.group(3)[:400]),
                  severity="error")
        elif "[icraft.guard] armed" not in c["msg"]:
            F.add(0, "GUARD_NOT_ARMED", c["msg"][:60], "%s:%s" % (c["file"], c["line"]),
                  "the event guard did not arm on the real Rhino: %s" % c["msg"][:400], severity="error")
    if GUARD_SCRIPT in h["_order_all"]:
        if not guard_armed:
            F.add(0, "GUARD_NOT_ARMED", "no armed line", GUARD_SCRIPT,
                  "%s loaded without printing its armed line: the handlers below ran unguarded" % GUARD_SCRIPT, severity="error")
        stats["event guard (%s)" % GUARD_SCRIPT] = "armed" if guard_armed else "NOT ARMED"
    for m in mods:
        if m.get("no_actions"):
            F.add(0, "NO_ACTIONS", loc(m), loc(m),
                  "modifier builder with no action (%s): LootJS throws 'No actions were added' while registering and every "
                  "modifier after it is dropped" % target_text(m), severity="error")
    dead_after = [m for m in mods if not m.get("registered")]
    if dead_after:
        F.add(0, "NOT_REGISTERED", "count", "-", "%d modifiers are never registered (after the no-action builder)" % len(dead_after),
              severity="error")
    for rel, inf in h["_script_info"].items():
        props = inf["props"]
        if inf["priority"] is None:
            F.add(0, "BAD_PRIORITY", rel, rel, "a `// priority ...` comment line is not an integer: KubeJS fails to pre-load the file",
                  severity="error")
        for bad in ("ignored", "ignore", "packmode", "requires"):
            if bad in props:
                F.add(0, "SCRIPT_PROPERTY", "%s %s" % (rel, bad), rel,
                      "a comment line parses as the KubeJS file property `%s = %s` (any `//` line of the form `word word` "
                      "is a property, anywhere in the file): the file may be skipped" % (bad, props[bad][-1]),
                      severity="error" if rel in h["_loot_files"] else "warn")
    stats["server logs read from"] = find_server_logs(repo)[1]
    log_order = server_log_order(repo)
    if log_order:
        mine = [r for r in h["_order_all"] if r in set(log_order)]
        theirs = [r for r in log_order if r in set(h["_order_all"])]
        stats["load order model == last mirrored server log"] = "yes" if mine == theirs else "NO"
        if mine != theirs:
            first = next((i for i, (a, b) in enumerate(zip(mine, theirs)) if a != b), None)
            F.add(0, "ORDER_MODEL", "mismatch", "-", "the audit's script order differs from the mirrored server log at #%s: audit=%s log=%s"
                  % (first, mine[first] if first is not None else "?", theirs[first] if first is not None else "?"), severity="error")

    # ---------------- per-modifier target resolution ----------------
    all_tables = sorted(T.all_table_ids)
    regex_cache = {}

    def match_tables(m):
        out = set()
        for t in m["targets"]:
            for kind, val in flat_targets(t):
                if kind == "id":
                    out.add(val)
                else:
                    if val not in regex_cache:
                        try:
                            rx = re.compile(val)
                            regex_cache[val] = {x for x in all_tables if rx.fullmatch(x)}
                        except re.error:
                            regex_cache[val] = None
                    if regex_cache[val]:
                        out.update(regex_cache[val])
        return out

    scope = {}
    for m in mods:
        s = {"kind": m["kind"], "tables": set(), "types": set(), "entities": set()}
        if m["kind"] == "table":
            s["tables"] = match_tables(m)
        elif m["kind"] == "type":
            s["types"] = set(t for t in m["types"] if t)
        elif m["kind"] == "entity":
            s["entities"] = set(m["entities"])
        scope[m["idx"]] = s

    # ---------------- [1] / [2] table targets ----------------
    for m in mods:
        if m["kind"] != "table":
            continue
        site = outer_site(m)
        for t in m["targets"]:
            for kind, val in flat_targets(t):
                if kind == "regex":
                    try:
                        rx = re.compile(val)
                    except re.error as e:
                        F.add(3, "REGEX_PY", val, site, "regex could not be checked by Python (%s): /%s/" % (e, val), severity="info")
                        continue
                    hits = regex_cache.get(val) or set()
                    shipped = sorted(x for x in hits if x in T.tables)
                    if not shipped:
                        loose = [x for x in all_tables if rx.search(x) and x in T.tables]
                        msg = "regex /%s/ matches NO loot table (full-match semantics)" % val
                        detail = []
                        others = [v for k2, v in sum((flat_targets(t2) for t2 in m["targets"]), []) if v != val]
                        live_others = [v for v in others if (v in T.tables) or (regex_cache.get(v))]
                        if loose:
                            msg += "; as an unanchored search it would hit %d tables" % len(loose)
                            dims = collections.Counter()
                            for x in loose:
                                for d in (T.table_dims(x) or ["dimension unknown"]):
                                    dims[d] += 1
                            detail = ["would match e.g. " + ", ".join(loose[:5]),
                                      "those tables are rolled in: " + ", ".join("%s (%d)" % kv for kv in dims.most_common(4))]
                        elif hits:
                            detail = ["only ids that are referenced but not shipped: " + ", ".join(sorted(hits)[:6])]
                        if live_others:
                            detail.append("one of %d targets of this rule; the rule still fires through the others" % (len(others) + 1))
                        else:
                            detail.append("the rule does: " + handlers_summary(m, filters))
                        F.add(1, "DEAD_REGEX", "%s /%s/" % (site, val), site, msg, detail,
                              severity="info" if live_others else "warn")
                else:
                    if val not in T.tables:
                        refs = T.why(val) if val in T.roots else "nothing references it either"
                        F.add(1, "DEAD_TABLE", "%s %s" % (site, val), site, "table %s does not exist in any installed jar / datapack" % val,
                              ["references: " + refs])
        tabs = sorted(x for x in scope[m["idx"]]["tables"] if x in T.tables)
        if not tabs:
            continue
        classes = collections.defaultdict(list)
        for x in tabs:
            classes[T.table_class(x)].append(x)
        tt = target_text(m)
        key = "%s %s" % (site, tt)
        if classes.get("strong"):
            continue
        if classes.get("code") or classes.get("json"):
            # not provable either way from the jars: a mod class (or another data file) names the table
            n = len(classes.get("code", [])) + len(classes.get("json", []))
            F.add(2, "CODE_ASSIGNED", key, site,
                  "%s: no chest NBT rolls the %d matched table(s); a mod class or data file names them, so they are "
                  "probably assigned from code (cannot be proved from the jar)" % (tt, n),
                  ["%s -- %s" % (x, T.why(x, 2)) for x in (classes.get("code", []) + classes.get("json", []))[:4]], severity="info")
        elif classes.get("nested") and not classes.get("orphan") and not classes.get("unreachable"):
            F.add(2, "NESTED_ONLY", key, site,
                  "%s: only ever rolled as a `loot_table` entry inside another table. Forge runs loot modifiers for the ROOT "
                  "table only, so this rule never fires" % tt,
                  ["%s -- %s" % (x, T.why(x)) for x in classes["nested"][:5]])
        elif classes.get("unreachable") and not classes.get("orphan"):
            F.add(2, "UNGENERATED_STRUCTURE", key, site,
                  "%s: the only chests that roll the matched table(s) are in structure pieces nothing generates" % tt,
                  ["%s -- %s" % (x, T.why(x)) for x in classes["unreachable"][:5]])
        else:
            rest = classes.get("orphan", []) + classes.get("nested", []) + classes.get("unreachable", [])
            F.add(2, "NO_ROLLER_FOUND", key, site,
                  "%s: the %d matched table(s) exist but nothing in the jars is seen rolling them as a root (a mod that "
                  "builds the table id from parts in code also lands here: check the mod)" % (tt, len(rest)),
                  ["%s -- %s" % (x, T.why(x)) for x in rest[:5]])

    # ---------------- [3] ids ----------------
    for m in mods:
        site = outer_site(m)
        if m["kind"] == "entity":
            if m.get("pig_fallback"):
                F.add(3, "ENTITY_PIG", "%s %s" % (site, ",".join(m["pig_fallback"])), site,
                      "unknown entity id %s resolves to minecraft:pig: this drop pool lands on every pig" % ", ".join(m["pig_fallback"]),
                      severity="error")
            if not m.get("via") and m["file"] != "loot/0_entity_id_validator.js":
                F.add(3, "ENTITY_UNGUARDED", "%s %s" % (site, ",".join(m["entities_raw"])), site,
                      "addEntityLootModifier called directly (not through global.icraftEntityMod): an unknown id would target pigs",
                      severity="info")
        if m["kind"] == "type":
            if None in m["types"]:
                F.add(3, "BAD_LOOT_TYPE", site, site, "a LootType argument is undefined/null: that type never matches", severity="error")
        for hnd, dims, chance, i in walk_handlers(m["handlers"]):
            pass
        for hnd in m["handlers"]:
            if hnd["t"] == "cond" and hnd["name"] == "anyDimension":
                for d in hnd["args"]:
                    if d not in known_dims:
                        F.add(3, "UNKNOWN_DIMENSION", "%s %s" % (site, d), "%s:%s" % (hnd["file"], hnd["line"]),
                              "anyDimension('%s'): no installed jar / datapack defines that dimension, so the condition is never true for it" % d)
    # entities the guard skipped (INERT builder: nothing registered) show up as console errors
    for c in h["console"]:
        if "[ENTITY-ID-VALIDATOR] SKIPPED" in c["msg"]:
            mm = re.search(r'unknown entity id "([^"]+)"', c["msg"])
            eid = mm.group(1) if mm else "?"
            F.add(3, "ENTITY_UNKNOWN", "%s:%s %s" % (c["file"], c["line"], eid), "%s:%s" % (c["file"], c["line"]),
                  "entity id %s is not a known entity type: the guard skipped this modifier, so its drops do not exist" % eid,
                  ["evidence checked: lang key / entity loot table / spawn egg in the installed jars"], severity="error")
    seen = set()
    for u in h["unresolved_items"]:
        if u.get("phase") not in ("load", "modifiers"):
            continue
        if u["file"] not in h["_loot_files"]:
            continue
        k = (u["file"], u["line"], u["id"])
        if k in seen:
            continue
        seen.add(k)
        F.add(3, "UNKNOWN_ITEM", "%s:%s %s" % k, "%s:%s" % (u["file"], u["line"]),
              "item %s is not registered by any installed mod (%s): the stack is empty and nothing drops"
              % (u["id"], u.get("note", "no item model, lang key or registry dump entry")), severity="error")
    seen = set()
    for w in h["warnings"]:
        k = (w["file"], w["line"], w["msg"])
        if k in seen or w["file"] not in h["_loot_files"]:
            continue
        seen.add(k)
        F.add(3, "LOOTJS_WARN", "%s:%s %s" % k, "%s:%s" % (w["file"], w["line"]), w["msg"], severity="error")

    used_filters = collections.defaultdict(list)
    for m in mods:
        for hnd, dims, chance, i in walk_handlers(m["handlers"]):
            if "filter" in hnd:
                used_filters[hnd["filter"]].append((m, hnd))

    def ingredient_problems(ing):
        out = []
        k = ing["kind"]
        if k == "or":
            for p in ing.get("parts", []):
                out.extend(ingredient_problems(p))
        elif k == "tag":
            tag = ing["spec"]
            if T.tag_counts.get(tag, 0) == 0:
                out.append("item tag #%s is empty or does not exist" % tag)
        elif k == "mod":
            if not any(i.startswith(ing["spec"] + ":") for i in T.items):
                out.append("@%s: no installed mod registers an item in that namespace" % ing["spec"])
        return out

    filter_problem = collections.OrderedDict()
    for fid, uses in sorted(used_filters.items()):
        f = filters[fid]
        m, hnd = uses[0]
        where = "%s:%s" % (hnd["file"], hnd["line"])
        problems = []
        if f["kind"] == "ingredient":
            problems.extend(ingredient_problems(f["ingredient"]))
        for d in f.get("dropped_list_members", []):
            problems.append("list member %s resolves to nothing and is silently ignored" % d)
        ev = feval.get(fid)
        if ev and ev.get("errors"):
            problems.append("predicate threw on %d items when evaluated on mock stacks (first: %s)" % (ev["errors"], ev["first_error"]))
        if ev is not None and f["kind"] in ("ingredient", "custom") and not ev["always"] and not ev["chance"] \
                and not ev.get("nbt_entry_hits") and not ev.get("errors") and not problems:
            problems.append("matches none of the %d registered item ids" % h["universe_size"])
        for p in problems:
            k = (where, hnd["t"], f["label"][:80], p)
            filter_problem[k] = filter_problem.get(k, 0) + len(uses)
    for (where, t, label, p), n in filter_problem.items():
        F.add(3, "FILTER", "%s %s %s" % (where, label[:40], p[:60]), where, "%s filter `%s`: %s" % (t, label, p),
              ["used by %d rule(s)" % n])

    # ---------------- adds: per-entry checks ----------------
    add_rows = []      # (m, handler_index, entry, dims, chance)
    rem_rows = []      # (m, handler_index, fid, dims, chance, handler)
    for m in mods:
        if not m.get("registered"):
            continue
        site = outer_site(m)
        first_action = None
        for hnd, dims, chance, i in walk_handlers(m["handlers"]):
            if first_action is None:
                first_action = i
            if hnd["t"] in ("add", "weighted"):
                ents = hnd["entries"]
                if hnd["t"] == "weighted":
                    real = [e for e in ents if not e.get("empty")]
                    if len(ents) == 1:
                        F.add(4, "WEIGHTED_SINGLE", "%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hnd["file"], hnd["line"]),
                              "addWeightedLoot with ONE entry (%s): it always drops; the weight is not a chance" % ents[0].get("raw"))
                    if len(real) != len(ents):
                        F.add(4, "WEIGHTED_EMPTY_ENTRY", "%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hnd["file"], hnd["line"]),
                              "weighted pool has %d empty entr%s (unknown item / air): an air entry keeps weight 1, not the weight written"
                              % (len(ents) - len(real), "y" if len(ents) - len(real) == 1 else "ies"),
                              [str(e.get("raw")) for e in ents if e.get("empty")][:6], severity="info")
                if hnd["t"] == "add" and hnd["mode"] == "ALTERNATIVES":
                    for j, e in enumerate(ents[:-1]):
                        if e.get("empty"):
                            F.add(4, "ALTERNATIVE_BLOCKED", "%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hnd["file"], hnd["line"]),
                                  "addAlternativesLoot entry %d (%s) is an empty stack: it counts as 'added' and blocks every later alternative"
                                  % (j, e.get("raw")), severity="error")
                for e in ents:
                    add_rows.append((m, i, e, dims, chance, hnd))
            elif hnd["t"] in ("remove", "replace", "modify"):
                rem_rows.append((m, i, hnd["filter"], dims, chance, hnd))
            elif hnd["t"] == "func" and hnd.get("scope") == "all_loot":
                F.add(4, "FUNCTION_ON_BUILDER", "%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hnd["file"], hnd["line"]),
                      ".%s(...) is called on the modifier, not on a LootEntry: LootJS applies it to EVERY stack of the drop" % hnd["name"])
        # a condition that sits after an action does not gate that action
        seen_action = False
        for hnd in m["handlers"]:
            if hnd["t"] != "cond":
                seen_action = True
            elif seen_action:
                F.add(4, "CONDITION_AFTER_ACTION", "%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hnd["file"], hnd["line"]),
                      ".%s(%s) comes after an action in the same chain: it does not gate the actions before it"
                      % (hnd["name"], ", ".join(str(a) for a in hnd.get("args", []))))

    # ---------------- [4] adds eaten by later strips ----------------
    match_always = {fid: set(ev.get("always", [])) for fid, ev in feval.items()}
    match_chance = {fid: set(ev.get("chance", [])) for fid, ev in feval.items()}
    ctx_cache = {}

    def ctx(tid):
        if tid not in ctx_cache:
            ctx_cache[tid] = T.table_ctx_type(tid)
        return ctx_cache[tid]

    def table_in_dims(tid, dims):
        """Is table `tid` rolled in one of `dims`?  'yes' | 'maybe' (its dimension is unknown) | None"""
        if dims is None:
            return "yes"
        td = T.table_dims(tid)
        if td is None:
            return "maybe"
        return "yes" if (td & dims) else None

    def overlap(ma, da, mr, dr):
        """Can modifier mr act on a drop that modifier ma also acted on?  -> ('yes'|'maybe'|None, note)"""
        sa, sr = scope[ma["idx"]], scope[mr["idx"]]
        ka, kr = sa["kind"], sr["kind"]
        if da is not None and dr is not None and not (da & dr):
            return None, ""
        if ka == "table" and kr == "table":
            common = sa["tables"] & sr["tables"]
            return ("yes" if common else None), "%d shared table(s)" % len(common)
        if ka == "table" and kr == "type":
            res = [(t, table_in_dims(t, dr)) for t in sa["tables"] if t in T.tables and ctx(t) in sr["types"]]
            yes = [t for t, r in res if r == "yes"]
            maybe = [t for t, r in res if r == "maybe"]
            if yes:
                return "yes", ("every matched table" if len(yes) == len(sa["tables"]) else
                               "in %d of %d tables: %s" % (len(yes), len(sa["tables"]), ", ".join(sorted(yes)[:3])))
            if maybe:
                return "maybe", "only if the table is rolled in %s (its structure is assigned from code): %s" % (
                    "/".join(sorted(dr)), ", ".join(sorted(maybe)[:3]))
            return None, ""
        if ka == "type" and kr == "table":
            res = [(t, table_in_dims(t, da)) for t in sr["tables"] if t in T.tables and ctx(t) in sa["types"]]
            yes = [t for t, r in res if r == "yes"]
            maybe = [t for t, r in res if r == "maybe"]
            if yes:
                return "yes", "only in %d table(s): %s" % (len(yes), ", ".join(sorted(yes)[:3]))
            if maybe:
                return "maybe", "only in table(s) whose dimension is unknown: %s" % ", ".join(sorted(maybe)[:3])
            return None, ""
        if ka == "type" and kr == "type":
            return ("yes" if sa["types"] & sr["types"] else None), "same loot type"
        if ka == "entity" and kr == "entity":
            return ("yes" if sa["entities"] & sr["entities"] else None), "same entity"
        if ka == "entity" and kr == "type":
            return ("yes" if "ENTITY" in sr["types"] else None), "all entity drops"
        if ka == "entity" and kr == "table":
            want = set()
            for e in sa["entities"]:
                ns, p = e.split(":", 1)
                want.add("%s:entities/%s" % (ns, p))
            return ("yes" if want & sr["tables"] else None), "the entity's own table"
        if ka == "type" and kr == "entity":
            return ("yes" if "ENTITY" in sa["types"] else None), "only for %s" % ",".join(sorted(sr["entities"]))
        return None, ""

    rem_by_item = collections.defaultdict(list)
    for row in rem_rows:
        m, i, fid, dims, chance, hnd = row
        if hnd["t"] != "remove":
            continue
        for it in match_always.get(fid, ()):
            rem_by_item[it].append((row, "always"))
        for it in match_chance.get(fid, ()):
            rem_by_item[it].append((row, "chance"))

    def strips_on_table(tid, item):
        """Pack removeLoot actions that take `item` out of table `tid`: [(where, 'always'|'chance', 'yes'|'maybe')]"""
        out = []
        ctxt = ctx(tid)
        for (row, mode) in rem_by_item.get(item, ()):
            mr, ir, fid, dr, cr, hr = row
            s = scope[mr["idx"]]
            hit = None
            if s["kind"] == "table":
                hit = "yes" if tid in s["tables"] else None
            elif s["kind"] == "type" and ctxt in s["types"]:
                hit = table_in_dims(tid, dr)
            elif s["kind"] == "entity" and ctxt == "ENTITY":
                ns, p = tid.split(":", 1)
                hit = "yes" if (ns + ":" + p[len("entities/"):]) in s["entities"] else None
            if hit and cr >= 1.0:
                out.append(("%s:%s" % (hr["file"], hr["line"]), mode, hit))
        return out

    eaten = collections.OrderedDict()
    for (m, i, e, dims, chance, hnd) in add_rows:
        if e.get("kind") != "item" or e.get("empty"):
            continue
        item = e["id"]
        for (row, mode) in rem_by_item.get(item, ()):
            mr, ir, fid, dr, cr, hr = row
            if mr["idx"] < m["idx"] or (mr["idx"] == m["idx"] and ir <= i):
                continue
            if e.get("nbt") is not None and e["eid"] not in set(feval.get(fid, {}).get("nbt_entry_hits", [])):
                continue
            ok, note = overlap(m, dims, mr, dr)
            if not ok:
                continue
            k = ("%s:%s" % (hnd["file"], hnd["line"]), "%s:%s" % (hr["file"], hr["line"]), mode, ok)
            eaten.setdefault(k, {"items": [], "notes": set()})
            eaten[k]["items"].append(item)
            eaten[k]["notes"].add(note)
    grouped = eaten
    for (addw, remw, mode, sure), g in grouped.items():
        items = sorted(set(g["items"]))
        if sure == "maybe":
            code, sev = "ADD_EATEN_IF_DIM", "info"
        elif mode == "always":
            code, sev = "ADD_EATEN", "warn"
        else:
            code, sev = "ADD_THINNED", "info"
        F.add(4, code, "%s <- %s [%d: %s]" % (addw, remw, len(items), ",".join(items[:3])), addw,
              "%d item(s) added here are %s by the later removeLoot at %s (%s)"
              % (len(items), "REMOVED again" if mode == "always" else "partly removed (chance filter)", remw,
                 "; ".join(sorted(g["notes"]))[:200]),
              [", ".join(items[:10]) + (" ..." if len(items) > 10 else "")], severity=sev)

    # ---------------- [4b] strips keyed on a loot TYPE miss tables rolled in another context ----------------
    # LootType.CHEST only matches rolls made with the CHEST param set. Loot bags, treasure bags,
    # gifts, bartering, fishing and archaeology roll with other param sets, so a "strip X from every
    # chest" rule never sees them.
    chest_stripped = collections.defaultdict(list)       # item -> [(where, dims)]
    for (mr, ir, fid, dr, cr, hr) in rem_rows:
        if hr["t"] != "remove" or cr < 1.0 or scope[mr["idx"]]["kind"] != "type" or "CHEST" not in scope[mr["idx"]]["types"]:
            continue
        for it in match_always.get(fid, ()):
            chest_stripped[it].append(("%s:%s" % (hr["file"], hr["line"]), dr))
    bypass = collections.OrderedDict()
    for tid in sorted(T.tables):
        c = ctx(tid)
        if c in ("CHEST", "ENTITY", "BLOCK") or T.table_class(tid) not in T.LIVE:
            continue
        hits = []
        for it in sorted(set(T.tables[tid].get("items") or [])):
            if it in chest_stripped and not [s for s in strips_on_table(tid, it) if s[1] == "always"]:
                hits.append(it)
        if hits:
            ns = tid.split(":", 1)[0]
            bypass.setdefault((ns, c), []).append((tid, hits))
    for (ns, c), rows in bypass.items():
        items = collections.Counter(i for _, hs in rows for i in hs)
        F.add(4, "STRIP_BYPASS", "%s %s" % (ns, c), ns + ":*",
              "%d %s table(s) rolled outside the CHEST context (type %s) still yield item(s) the pack strips from chests: %s"
              % (len(rows), ns, c, ", ".join("%s (%d)" % kv for kv in items.most_common(8))),
              ["%s -- %s" % (tid, ", ".join(hs[:6])) for tid, hs in rows[:8]], severity="info")

    # ---------------- [5] tier ----------------
    src_cache = {}

    def src_lines(rel):
        if rel not in src_cache:
            try:
                src_cache[rel] = open(os.path.join(repo, "kubejs", "server_scripts", rel.replace("/", os.sep)),
                                      encoding="utf-8", errors="replace").read().split("\n")
            except OSError:
                src_cache[rel] = []
        return src_cache[rel]

    def label_tier(m):
        """Tier the script SAYS this rule is: `tier: N` / `TN` on the call lines, else the comment block above."""
        frames = [m.get("file") + ":" + str(m.get("line"))] + list(m.get("stack") or [])
        seen_f = []
        for fr in frames:
            if fr in seen_f:
                continue
            seen_f.append(fr)
        for fr in reversed(seen_f):         # outermost call site first
            rel, _, ln = fr.rpartition(":")
            lines = src_lines(rel)
            ln = int(ln)
            if not (0 < ln <= len(lines)):
                continue
            window = " ".join(lines[max(0, ln - 1):min(len(lines), ln + 3)])
            mm = re.search(r"\btier\s*:\s*([1-4])\b", window) or re.search(r"\bT([1-4])\b", lines[ln - 1])
            if mm:
                return int(mm.group(1)), fr, lines[ln - 1].strip()[:110]
        rel, _, ln = seen_f[-1].rpartition(":")
        lines = src_lines(rel)
        j = int(ln) - 2
        steps = 0
        while j >= 0 and steps < 14:
            t = lines[j].strip()
            if not t:
                if steps > 0:
                    break
            elif t.startswith("//"):
                mm = re.search(r"\bT([1-4])\b|\btier[ _-]?([1-4])\b", t, re.I)
                if mm:
                    return int(mm.group(1) or mm.group(2)), "%s:%d" % (rel, j + 1), t[:110]
            j -= 1
            steps += 1
        return None, None, None

    def dim_tier(d):
        return tiers.get(d)

    for m in mods:
        if not m.get("registered"):
            continue
        has_add = any(hh["t"] in ("add", "weighted") for hh, _, _, _ in walk_handlers(m["handlers"]))
        if not has_add:
            continue
        lt, lwhere, ltext = label_tier(m)
        if lt is None:
            continue
        site = outer_site(m)
        if m["kind"] == "table":
            # the rule's own gate: conditions that come before its first add
            gate_dims, confined = None, False
            for hh in m["handlers"]:
                if hh["t"] != "cond":
                    break
                if hh["name"] == "anyDimension":
                    gate_dims = set(hh["args"]) if gate_dims is None else (gate_dims & set(hh["args"]))
                elif hh["name"] in ("anyStructure", "biome", "anyBiome"):
                    confined = True      # confined to a structure / biome: the table's other users do not get it
            if confined:
                continue
            by_tier = collections.defaultdict(list)
            for t in sorted(scope[m["idx"]]["tables"]):
                if t not in T.tables:
                    continue
                d = T.table_dims(t)
                if not d:
                    continue
                if gate_dims is not None:
                    d = d & gate_dims
                for dd in sorted(d):
                    dt = dim_tier(dd)
                    if dt is not None and dt != lt:
                        by_tier[(dt, dd)].append(t)
            for (dt, dd), tabs in sorted(by_tier.items()):
                F.add(5, "TIER_MISMATCH", "%s T%d->%s %s" % (site, lt, dd, tabs[0]), site,
                      "labelled T%d (%s: `%s`) but %d matched table(s) are rolled by structures in %s (tier %d)"
                      % (lt, lwhere, ltext, len(tabs), dd, dt),
                      ["%s -- %s" % (t, T.why(t, 2)) for t in tabs[:4]])
        elif m["kind"] == "type":
            for hh, dims, chance, i in walk_handlers(m["handlers"]):
                if hh["t"] in ("add", "weighted") and dims:
                    off = sorted(d for d in dims if dim_tier(d) is not None and dim_tier(d) != lt)
                    if off:
                        first = (hh["entries"][0].get("id") or hh["entries"][0].get("raw")) if hh.get("entries") else ""
                        F.add(5, "TIER_MISMATCH", "%s T%d dims %s %s" % (site, lt, ",".join(off), first), site,
                              "labelled T%d (%s: `%s`) but gated to dimension(s) the stage gate puts in another tier: %s"
                              % (lt, lwhere, ltext, ", ".join("%s=T%d" % (d, dim_tier(d)) for d in off)))
                    break

    # ---------------- [6] items whose every recipe is removed: where can they still come from? ----------------
    removed = collections.OrderedDict()     # item -> [where]
    added_out = set()

    def out_ids(o):
        """ids named by one `output` value of event.remove (string id, '3x id', {item/id}, /regex/, list)"""
        if isinstance(o, list):
            res = []
            for x in o:
                res.extend(out_ids(x))
            return res
        if isinstance(o, dict):
            o = o.get("id") or o.get("item")
        if not isinstance(o, str):
            return []
        mm = re.fullmatch(r"/(.*)/([a-z]*)", o)
        if mm:
            try:
                rx = re.compile(mm.group(1))
            except re.error:
                return []
            return sorted(i for i in T.items if rx.search(i))      # KubeJS regex ingredients use find()
        mm = re.fullmatch(r"(?:\d+x )?([a-z0-9_.-]+:[a-z0-9_./-]+)", o)
        return [mm.group(1)] if mm else []

    for c in h["recorded_calls"]:
        path = c["path"]
        a = c["args"]
        where = "%s:%s" % (c["file"], c["line"])
        if path == "event.remove" and a and isinstance(a[0], dict) and "output" in a[0] and len(a[0]) == 1:
            for o in out_ids(a[0]["output"]):
                removed.setdefault(o, []).append(where)
        elif path == "event.remove" and a and isinstance(a[0], dict) and list(a[0]) == ["id"] and isinstance(a[0]["id"], str) \
                and a[0]["id"] in T.items and not a[0]["id"].startswith("minecraft:"):
            # removal by recipe id where the id is also an item id (the mod's one recipe for it)
            removed.setdefault(a[0]["id"], []).append(where)
        elif re.fullmatch(r"event\.(shaped|shapeless|smithing|smelting|blasting|stonecutting|campfireCooking|smoking)", path) and a:
            added_out.update(out_ids(a[0]))
        elif path.startswith("event.recipes.") and a:
            added_out.update(out_ids(a[0]))
        elif path == "event.custom" and a and isinstance(a[0], dict):
            for key in ("result", "output", "results", "outputs"):
                if key in a[0]:
                    added_out.update(out_ids(a[0][key]))
    eaten_items_at = collections.defaultdict(set)
    for (addw, remw, mode, sure), g in grouped.items():
        if mode == "always" and sure == "yes":
            for it in g["items"]:
                eaten_items_at[addw].add(it)

    def modifier_live(m):
        if not m.get("registered"):
            return False
        s = scope[m["idx"]]
        if m["kind"] == "table":
            return any(T.table_class(t) in T.LIVE for t in s["tables"])
        if m["kind"] == "entity":
            return not m.get("pig_fallback")
        return True

    live_adds = collections.defaultdict(list)       # item -> [(where, target)]
    dead_adds = collections.defaultdict(list)
    for (m, i, e, dims, chance, hnd) in add_rows:
        if e.get("kind") != "item" or e.get("empty"):
            continue
        w_ = "%s:%s" % (hnd["file"], hnd["line"])
        if not modifier_live(m) or e["id"] in eaten_items_at.get(w_, ()):
            dead_adds[e["id"]].append((w_, target_text(m)))
        else:
            live_adds[e["id"]].append((w_, target_text(m)))
    base_tables = collections.defaultdict(list)
    for tid, t in T.tables.items():
        if T.table_class(tid) in T.LIVE + ("nested",):
            for it in t.get("items") or []:
                base_tables[it].append(tid)
    mentions = extra["script_mentions"]
    by_site = collections.OrderedDict()
    for item, wheres in removed.items():
        if item in added_out or item not in T.items:
            continue
        adds = live_adds.get(item, [])
        open_tables, stripped_tables = [], []
        for tid in sorted(base_tables.get(item, [])):
            ns, ipath = item.split(":", 1)
            if tid == "%s:blocks/%s" % (ns, ipath):
                continue      # a block dropping itself is not a source
            st = [s for s in strips_on_table(tid, item) if s[1] == "always" and s[2] == "yes"]
            (stripped_tables if st else open_tables).append(tid)
        if adds:
            cat = "pack_rule"
        elif open_tables:
            cat = "mod_table_only"
        else:
            cat = "none"
        site = wheres[0]
        by_site.setdefault(site, collections.OrderedDict())
        by_site[site].setdefault(cat, []).append((item, adds, open_tables, stripped_tables, dead_adds.get(item, []),
                                                  [x for x in mentions.get(item, []) if not x.startswith("recipes/")]))
    for site, cats in by_site.items():
        n_all = sum(len(v) for v in cats.values())
        for cat, rows in cats.items():
            if cat == "pack_rule":
                continue
            detail = []
            for (item, adds, open_tables, stripped_tables, dead, ment) in rows[:60]:
                bits = []
                if open_tables:
                    bits.append("still rolled by %d mod table(s) no pack strip covers: %s" % (len(open_tables), ", ".join(open_tables[:3])))
                if stripped_tables:
                    bits.append("stripped from %d mod table(s)" % len(stripped_tables))
                if dead:
                    bits.append("pack add that cannot fire: " + ", ".join("%s (%s)" % d for d in dead[:2]))
                if ment:
                    bits.append("named in " + ", ".join(ment[:4]))
                detail.append("%s -- %s" % (item, "; ".join(bits) if bits else "named nowhere else"))
            if cat == "mod_table_only":
                F.add(6, "RECIPE_REMOVED_MOD_TABLE_ONLY", "%s %s" % (site, rows[0][0]), site,
                      "%d of the %d item(s) whose recipes are removed here have no pack loot rule and come only from mod loot "
                      "tables the pack does not strip (fine if they are meant to be found; a LEAK if they are meant to be gone)"
                      % (len(rows), n_all), detail, severity="info")
            else:
                F.add(6, "RECIPE_REMOVED_NO_LOOT_SOURCE", "%s %s" % (site, rows[0][0]), site,
                      "%d of the %d item(s) whose recipes are removed here are in no live loot rule and no rolled, unstripped loot "
                      "table (fine if they are meant to be gone; UNOBTAINABLE if they are meant to drop)"
                      % (len(rows), n_all), detail, severity="warn")

    # ---------------- [7] JSON loot tables the pack ships ----------------
    pack_kinds = {p["id"]: p.get("kind") for p in T.d.get("packs", [])}

    def pk(pid):
        return pack_kinds.get(pid) or ("paxi" if str(pid).startswith("paxi:") else "kubejs_data" if pid == "kubejs_data" else "mod")

    for tid, t in sorted(T.tables.items()):
        srcs = t.get("sources") or []
        ours = [s for s in srcs if pk(s.get("pack")) in ("paxi", "kubejs_data")]
        if not ours:
            continue
        win = t.get("winner")
        if t.get("valid") is False:
            F.add(7, "JSON_INVALID", tid, str(win), "loot table %s does not parse: %s" % (tid, t.get("error")), severity="error")
            continue
        if len(ours) > 1:
            # compare what the game would parse, not bytes (CRLF / indentation differ between copies)
            parsed = []
            for s_ in ours:
                raw = read_pack_file(repo, s_.get("pack"), "data/%s/loot_tables/%s.json" % tuple(tid.split(":", 1)))
                try:
                    parsed.append(json.dumps(json.loads(raw.decode("utf-8-sig")), sort_keys=True) if raw is not None else None)
                except ValueError:
                    parsed.append(None)
            order = "sources in priority order: " + ", ".join(str(s.get("pack")) for s in srcs)
            if len(set(parsed)) > 1 or None in parsed:
                F.add(7, "JSON_SHADOWED", tid, str(win), "%s is shipped by %d pack sources with DIFFERENT content; only `%s` is "
                      "loaded (kubejs/data beats every Paxi zip)" % (tid, len(ours), win), [order])
            else:
                F.add(7, "JSON_DUPLICATE", tid, str(win), "%s is shipped %d times by the pack with identical content; only `%s` is "
                      "loaded, the other copy is dead weight that will drift" % (tid, len(ours), win), [order], severity="info")
        if pk(win) in ("paxi", "kubejs_data"):
            # (an item no installed mod has is TABLE_REJECTED below, for every pack)
            bad_refs = sorted(r for r in (t.get("table_refs") or []) if r not in T.tables)
            if bad_refs:
                F.add(7, "JSON_UNKNOWN_TABLE_REF", "%s %s" % (tid, ",".join(bad_refs)[:60]), str(win),
                      "%s (from %s) references loot table(s) that do not exist: %s" % (tid, win, ", ".join(bad_refs[:6])))
            # a tag that is defined but empty is a mod's extension hook (Dungeons Plus); only an
            # undefined tag is a mistake
            bad_tags = sorted(g for g in (t.get("tags") or []) if g not in T.tag_counts)
            if bad_tags:
                F.add(7, "JSON_UNDEFINED_TAG", "%s %s" % (tid, ",".join(bad_tags)[:60]), str(win),
                      "%s (from %s) uses item tag(s) no pack defines: %s" % (tid, win, ", ".join(bad_tags[:6])))
            if len(srcs) == len(ours) and T.table_class(tid) in ("orphan",):
                F.add(7, "JSON_NEW_TABLE_UNUSED", tid, str(win),
                      "%s exists only in the pack's own data and nothing is seen rolling it" % tid, severity="info")
    drift = T.d.get("paxi_drift") or {}
    drift = drift.get("packs", drift) if isinstance(drift, dict) else {}
    for name, dft in sorted(drift.items() if isinstance(drift, dict) else []):
        if not isinstance(dft, dict):
            continue
        lt = dft.get("loot_tables") or {}
        only_zip = lt.get("only_in_zip") or []
        only_src = lt.get("only_in_source") or []
        differ = lt.get("different") or []
        if only_zip or only_src or differ:
            F.add(7, "PAXI_DRIFT", name, "config/paxi/datapacks/%s" % name,
                  "loot tables differ between the LOADED zip and datapack_sources: %d only in zip, %d only in source, %d different "
                  "-- a rebuild from source would change live loot" % (len(only_zip), len(only_src), len(differ)),
                  [("only in zip: " + ", ".join(only_zip[:4])) if only_zip else "",
                   ("only in source: " + ", ".join(only_src[:4])) if only_src else "",
                   ("different: " + ", ".join(differ[:4])) if differ else ""])
    # global loot modifier files the pack ships
    listed = {}
    for pack, lst in extra["glm_lists"].items():
        for e in lst.get("entries", []) if isinstance(lst, dict) else []:
            listed.setdefault(e, []).append(pack)
    for gid, packs in sorted(extra["glm_files"].items()):
        ours = [p for p in packs if p.startswith("paxi:") or p == "kubejs_data"]
        if not ours:
            continue
        if gid not in listed:
            F.add(7, "GLM_NOT_LISTED", gid, ", ".join(ours),
                  "global loot modifier %s is shipped by the pack but no global_loot_modifiers.json lists it: Forge never loads it" % gid)
        elif not [p for p in packs if p.startswith("mod:")]:
            F.add(7, "GLM_PACK_ONLY", gid, ", ".join(ours), "global loot modifier %s exists only in the pack (listed by %s)"
                  % (gid, ", ".join(listed[gid])), severity="info")
    for pack, lst in sorted(extra["glm_lists"].items()):
        if isinstance(lst, dict) and lst.get("replace") and (pack.startswith("paxi:") or pack == "kubejs_data"):
            F.add(7, "GLM_LIST_REPLACE", pack, pack, "global_loot_modifiers.json has replace:true: it discards every mod's loot modifier list",
                  severity="error")

    # ---------------- [7b] alias (forwarding) tables: dev/loot_audit/alias_tables.json ----------------
    # A chest that names a table id nothing ships gets a kubejs/data table forwarding to the intended
    # one. LootJS (and Forge loot modifiers) key on the ROOT id -- the alias -- so a rule that names
    # only the target silently skips those chests.
    try:
        with open(os.path.join(repo, "dev", "loot_audit", "alias_tables.json"), encoding="utf-8") as f:
            aliases = json.load(f).get("aliases", {})
    except (OSError, ValueError) as e:
        aliases = {}
        F.add(7, "ALIAS_MAP_UNREADABLE", "alias_tables.json", "dev/loot_audit/alias_tables.json",
              "alias map not readable: %s" % e, severity="error")
    # A rule site is a file:line; a forEach over a list registers one modifier per table there, so
    # "does this rule reach the alias" is asked of the site, not of each modifier.
    site_tables = collections.OrderedDict()
    for m in mods:
        if m["kind"] == "table":
            site_tables.setdefault("%s:%s" % (m["file"], m["line"]), set()).update(scope[m["idx"]]["tables"])
    for alias, spec in sorted(aliases.items()):
        targets = spec.get("targets") or []
        a_ns, a_path = alias.split(":", 1)
        a_file = os.path.join(repo, "kubejs", "data", a_ns, "loot_tables", *(a_path + ".json").split("/"))
        if not os.path.isfile(a_file):
            F.add(7, "ALIAS_TABLE_MISSING", alias, "kubejs/data", "alias table %s is in alias_tables.json but its file does not "
                  "exist -- run dev/loot_audit/gen_alias_tables.py" % alias, severity="error")
        for tg in targets:
            if tg not in T.tables or tg in aliases:
                F.add(7, "ALIAS_TARGET_MISSING", "%s -> %s" % (alias, tg), "dev/loot_audit/alias_tables.json",
                      "alias %s forwards to %s, which %s" % (alias, tg, "is itself an alias" if tg in aliases
                                                             else "no pack ships: the chest stays empty"), severity="error")
        if alias not in T.tables:
            continue        # truth cache predates the alias file; the rule check needs it scanned
        miss = collections.OrderedDict()
        for site, st in site_tables.items():
            hit = [tg for tg in targets if tg in st]
            if hit and alias not in st:
                miss[site] = hit[0]
        for where, tg in miss.items():
            F.add(7, "ALIAS_RULE_MISS", "%s <- %s" % (alias, where.rsplit(":", 1)[0] + " " + tg), where,
                  "the rule at %s names %s but not its alias %s: chests that roll the alias do not get this rule"
                  % (where, tg, alias))

    # ---------------- [7c] loaded tables the game's parser rejects ----------------
    # Gson throws on the first name it does not know, Forge logs "Couldn't parse element loot_tables:<id>"
    # and the table is then ABSENT in game: whatever rolls it gets nothing. Checked for the loaded copy
    # of every table, whoever ships it. Two sources:
    #   jars      an `item` entry no installed mod has; an entry / function / condition type that is
    #             neither in the vanilla 1.20.1 registry nor named in a class of the installed mod it
    #             belongs to
    #   boot log  what the dedicated server said at its last mirrored boot. The only proof for an item
    #             that has a model or lang key yet is never registered (leftover assets), and for what
    #             is not modelled here (enchantment / block / potion ids, NBT strings, number providers).
    #             A logged reason the loaded copy no longer contains is stale (fixed since) and skipped.
    want_types = set()
    for t in T.tables.values():
        for names in (t.get("nonvanilla_types") or {}).values():
            want_types.update(n for n in names if n and not n.startswith("minecraft:"))
    literal = type_literals(T, want_types)

    def type_problem(name):
        if not name:
            return "has no type name"
        ns = name.split(":", 1)[0]
        if ns == "minecraft":
            return "`%s` is not a vanilla 1.20.1 name (renamed, or from a later version)" % name
        if ns not in T.mods:
            return "`%s`: the mod `%s` is not installed" % (name, ns)
        if not literal.get(name):
            return "`%s`: no class of the installed mod `%s` names it" % (name, ns)
        return None

    boot_stamp, boot_rejects = boot_log_rejects(repo)
    boot_notes = {}
    rejected = collections.OrderedDict()        # table -> [reason]
    for tid, t in sorted(T.tables.items()):
        if t.get("valid") is False:
            # the pack's own unparseable files are JSON_INVALID above
            if pk(t.get("winner")) not in ("paxi", "kubejs_data"):
                rejected[tid] = ["the file is not valid JSON: %s" % t.get("error")]
            continue
        why = ["item `%s` is in no installed mod" % i for i in (t.get("items") or []) if i not in T.items]
        for kind, names in sorted((t.get("nonvanilla_types") or {}).items()):
            why += ["%s type %s" % (kind, p) for p in map(type_problem, names) if p]
        if why:
            rejected[tid] = why
    for tid, reason in boot_rejects.items():
        t = T.tables.get(tid)
        if t is None or t.get("valid") is False:
            continue
        used = set(n for names in (t.get("nonvanilla_types") or {}).values() for n in names)
        m_item = re.search(r"Expected name to be an item, was unknown string '([^']*)'", reason)
        m_type = re.search(r"Unknown type '([^']*)'", reason)
        if m_item:
            still = m_item.group(1) in (t.get("items") or [])
        elif m_type:
            still = m_type.group(1) in used
        else:
            still = None            # a reason the audit cannot re-check against the loaded copy
        if still is False:
            continue
        note = "server boot of %s said: %s" % (boot_stamp, reason)
        if still is None and pk(t.get("winner")) in ("paxi", "kubejs_data"):
            if tid not in rejected:
                F.add(7, "TABLE_REJECTED_AT_BOOT", tid, str(t.get("winner")), "%s was rejected at the server boot of %s "
                      "(%s). The audit cannot re-check that reason and the pack ships the loaded copy, so it may be fixed "
                      "since: look at the next boot log" % (tid, boot_stamp, reason), severity="info")
            continue
        boot_notes[tid] = note
        rejected.setdefault(tid, [note])
    for tid, why in rejected.items():
        t = T.tables[tid]
        detail = ["rolled by: " + T.why(tid)]
        if tid in boot_notes and why[0] != boot_notes[tid]:
            detail.append(boot_notes[tid])
        detail += why[1:6]
        if len(why) > 6:
            detail.append("+%d more" % (len(why) - 6))
        if t.get("condition_key"):
            detail.append("has %s: if they fail the table is skipped before it is parsed" % t["condition_key"])
        F.add(7, "TABLE_REJECTED", tid, str(t.get("winner")), "%s is rejected by the game's loot parser (%s), so the table "
              "does not exist in game and whatever rolls it gets nothing" % (tid, why[0]), detail, severity="error")
    stats["tables the game rejects (jars + boot log)"] = "%d (boot log: %s)" % (
        len(rejected), "%s, %d rejected" % (boot_stamp, len(boot_rejects)) if boot_stamp else "NO SERVER LOG READ")

    # ---------------- [8] mock coverage ----------------
    for name, s in sorted(h["_stubs"].items()):
        F.add(8, "STUBBED_GLOBAL", name, s["used_at"][0], "global.%s is defined in a script the audit does not load (%s): stubbed"
              % (name, ", ".join(s["defined_in"])), severity="info")
    seen = set()
    for u in h["opaque_uses"]:
        if u["phase"] not in ("load", "modifiers") or u["file"] not in h["_loot_files"]:
            continue
        k = (u["file"], u["line"], u["name"])
        if k in seen:
            continue
        seen.add(k)
        F.add(8, "OPAQUE_CALL", "%s:%s %s" % k, "%s:%s" % (u["file"], u["line"]),
              "%s(...) ran against a stand-in during registration (the audit did not model it)" % u["name"], severity="info")
    missing_cls = extra.get("missing_classes") or {}
    for c in h["load_classes"]:
        if c["name"] in missing_cls and c["file"] in h["_loot_files"]:
            F.add(0, "LOADCLASS_MISSING", "%s:%s %s" % (c["file"], c["line"], c["name"]), "%s:%s" % (c["file"], c["line"]),
                  "Java.loadClass('%s'): no installed jar contains that class -- the script throws at this line" % c["name"],
                  severity="error")

    # ---------------- stats ----------------
    reg = [m for m in mods if m.get("registered")]
    stats["rhino"] = h["_rhino"]
    stats["loot scripts loaded"] = len(h["_loot_files"])
    stats["LootJS.modifiers handlers"] = "%d (%d ok)" % (len(h["handlers"]), sum(1 for x in h["handlers"] if x["status"] == "ok"))
    stats["modifiers registered"] = len(reg)
    for kind in ("table", "type", "entity", "block"):
        stats["  %s modifiers" % kind] = sum(1 for m in reg if m["kind"] == kind)
    stats["add entries"] = len(add_rows)
    stats["remove/replace/modify actions"] = len(rem_rows)
    live_tab = [m for m in reg if m["kind"] == "table" and any(T.table_class(t) in T.LIVE for t in scope[m["idx"]]["tables"])]
    stats["table modifiers with a live target"] = "%d of %d" % (len(live_tab), sum(1 for m in reg if m["kind"] == "table"))
    stats["loot tables known (shipped)"] = len(T.tables)
    stats["structure templates scanned"] = len(T.structures)
    stats["recipe handlers recorded"] = "%d (%d ok)" % (len(h["captured_handlers"]), sum(1 for x in h["captured_handlers"] if x["status"] == "ok"))
    stats["items with every recipe removed"] = len(removed)
    return F, stats


SECTION_TITLES = {
    0: "ENGINE: things that silently disable loot scripts",
    1: "TARGETS THAT MATCH NOTHING (table id / regex)",
    2: "TARGETS NOTHING ROLLS (table exists, no generated chest / entity / code rolls it as a root)",
    3: "IDS AND FILTERS THAT DO NOT RESOLVE",
    4: "ORDER AND SHAPE: adds eaten by later strips, misplaced conditions, one-entry pools",
    5: "TIER: the rule's label vs the tier of the dimension its table is rolled in (heuristic; review)",
    6: "DROP-ONLY ITEMS (every recipe removed) WITHOUT A LIVE LOOT SOURCE",
    7: "LOOT TABLE / LOOT MODIFIER JSON THE PACK SHIPS; EVERY LOADED TABLE THE GAME REJECTS",
    8: "AUDIT COVERAGE (where the mock, not the game, decided)",
}


def script_mentions(repo):
    """quoted id -> files that name it (server scripts as their relative path; quests / kubejs data
    with a prefix). Used only as a hint for where an item with no loot source might come from."""
    out = collections.defaultdict(list)
    rx = re.compile(r"['\"`]([a-z0-9_.-]+:[a-z0-9_./-]+)['\"`]")
    roots = [("", os.path.join(repo, "kubejs", "server_scripts"), "*.js"),
             ("startup:", os.path.join(repo, "kubejs", "startup_scripts"), "*.js"),
             ("quests:", os.path.join(repo, "config", "heracles"), "*.*"),
             ("quests:", os.path.join(repo, "config", "ftbquests"), "*.snbt"),
             ("kubejs/data:", os.path.join(repo, "kubejs", "data"), "*.json")]
    for prefix, root, pat in roots:
        if not os.path.isdir(root):
            continue
        for f in glob.glob(os.path.join(root, "**", pat), recursive=True):
            if not os.path.isfile(f) or os.path.getsize(f) > 4_000_000:
                continue
            rel = prefix + os.path.relpath(f, root).replace(os.sep, "/")
            try:
                text = open(f, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            for it in set(m.group(1) for m in rx.finditer(text)):
                out[it].append(rel)
    return out


def class_exists(mods_dir, names):
    """Which Java.loadClass targets exist in no jar (mods + the srg game jar + forge)."""
    if not names:
        return {}
    want = {n.replace(".", "/") + ".class": n for n in names}
    found = set()
    libs = os.path.normpath(os.path.join(mods_dir, "..", "..", "..", "..", "libraries"))
    jars = sorted(glob.glob(os.path.join(mods_dir, "*.jar")))
    jars += glob.glob(os.path.join(libs, "net", "minecraft", "client", "1.20.1-*", "*-srg.jar"))
    jars += glob.glob(os.path.join(libs, "net", "minecraftforge", "forge", "1.20.1-*", "*.jar"))
    jars += glob.glob(os.path.join(libs, "net", "minecraftforge", "*", "*", "*.jar"))
    for j in jars:
        if len(found) == len(want):
            break
        try:
            with zipfile.ZipFile(j) as zf:
                names_in = set(zf.namelist())
                for k in want:
                    if k in names_in:
                        found.add(k)
                for n in names_in:
                    if n.endswith(".jar") and n.startswith("META-INF/jar"):
                        import io
                        try:
                            with zipfile.ZipFile(io.BytesIO(zf.read(n))) as inner:
                                inner_names = set(inner.namelist())
                                for k in want:
                                    if k in inner_names:
                                        found.add(k)
                        except zipfile.BadZipFile:
                            pass
        except (zipfile.BadZipFile, OSError):
            pass
    return {want[k]: True for k in want if k not in found}


def main():
    ap = argparse.ArgumentParser(description="Audit the pack's loot rules against the installed jars.")
    ap.add_argument("--mods", default=DEFAULT_MODS)
    ap.add_argument("--repo", default=DEFAULT_REPO, help="the repo's .minecraft folder")
    ap.add_argument("--no-cache", action="store_true", help="rescan every jar")
    ap.add_argument("--skip-truth", action="store_true", help="reuse dev/loot_audit/.cache/truth.json as is")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--keys", action="store_true", help="print the key of every warn/error finding that is not accepted")
    ap.add_argument("--section", default="")
    ap.add_argument("--json", default="")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--max-detail", type=int, default=6)
    args = ap.parse_args()
    args.repo = os.path.abspath(args.repo)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    accepted = set()
    acc_path = os.path.join(AUDIT, "accepted.txt")
    if os.path.exists(acc_path):
        for line in open(acc_path, encoding="utf-8"):
            line = line.split("  #", 1)[0].strip()
            if line and not line.startswith("#"):
                accepted.add(line)

    truth = Truth(run_truth(args))
    h = run_harness(args, truth, args.repo)
    extra = scan_dimensions_and_glms(args.mods, args.repo)
    extra = dict(extra)
    extra["script_mentions"] = script_mentions(args.repo)
    not_mocked = sorted({c["name"] for c in h["load_classes"] if not c["mocked"]})
    extra["missing_classes"] = class_exists(args.mods, not_mocked)

    F, stats = build(truth, h, args.repo, extra, accepted)

    want = set(int(x) for x in args.section.split(",") if x.strip().isdigit()) if args.section else set(SECTION_TITLES)
    counts = collections.Counter()
    new_counts = collections.Counter()
    for r in F.rows:
        counts[(r["section"], r["code"])] += 1
        if not r["accepted"]:
            new_counts[(r["section"], r["code"])] += 1

    print("== LOOT AUDIT ==")
    for k, v in stats.items():
        print("  %-48s %s" % (k, v))
    print()
    print("  findings by code (total / not accepted):")
    for (sec, code), n in sorted(counts.items()):
        print("    [%d] %-28s %4d / %d" % (sec, code, n, new_counts[(sec, code)]))
    if not args.summary:
        for sec in sorted(SECTION_TITLES):
            if sec not in want:
                continue
            rows = [r for r in F.rows if r["section"] == sec]
            print()
            print("[%d] %s  (%d)" % (sec, SECTION_TITLES[sec], len(rows)))
            for r in rows:
                tag = " [accepted]" if r["accepted"] else ""
                print("  - %s %s%s" % (r["code"], r["where"], tag))
                print("      %s" % r["msg"])
                for d in [d for d in r["detail"] if d][:args.max_detail]:
                    print("      . %s" % d)
    if args.json:
        json.dump({"stats": stats, "findings": F.rows}, open(args.json, "w", encoding="utf-8"), indent=1)
    if args.keys:
        print()
        print("keys not in accepted.txt (warn / error):")
        seen_k = set()
        for r in F.rows:
            if not r["accepted"] and r["severity"] in ("error", "warn") and r["section"] != 8 and r["key"] not in seen_k:
                seen_k.add(r["key"])
                print(r["key"])
    engine = [r for r in F.rows if r["section"] == 0 and r["severity"] == "error"]
    fresh = [r for r in F.rows if not r["accepted"] and r["severity"] in ("error", "warn") and r["section"] != 8]
    # accepted.txt lines that no finding uses any more: the finding was fixed, delete the line
    keys_now = set(r["key"] for r in F.rows)
    stale = sorted(a for a in accepted
                   if (a.startswith("~") and not any(fnmatch.fnmatchcase(k, a[1:].strip()) for k in keys_now))
                   or (not a.startswith("~") and a not in keys_now))
    if stale:
        print()
        print("accepted.txt lines that match no finding (stale -- delete them):")
        for a in stale:
            print("  " + a)
    print()
    print("[loot-audit] engine=%d findings=%d not_accepted=%d" % (len(engine), len(F.rows), len(fresh)))
    sys.exit(1 if engine or fresh else 0)


if __name__ == "__main__":
    main()
