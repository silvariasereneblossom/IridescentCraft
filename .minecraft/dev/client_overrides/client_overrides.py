#!/usr/bin/env python3
"""client_overrides.py -- the client asset overrides in kubejs/assets that exist only to save memory, checked
against the jars they patch (RAM audit 2026-10-30, internal repo dev/ram-audit-2026-10-30).

None of them changes what a player sees or hears. Each one is right only for the jars it was made from, so a mod
update can make one wrong without any error in game:

  sounds    kubejs/assets/<ns>/sounds.json. Every sound event that plays a file of --min-seconds or more without
            "stream": true is restated with "replace": true and "stream": true on each of its files. A sound that
            is not streamed is decoded whole on first play and kept in native memory until quit (EDF Remastered's
            End fight track alone is 262 MB). The KubeJS pack sits above the mod jars and vanilla, so its
            "replace" wins. The restated list is the merge of every pack below it, so a mod update that adds a
            sound to one of these events is hidden by the override until it is regenerated.
  tatos     kubejs/assets/theabyss/textures/item/netherite_helmet_-_copy.png, a 16 x 16 transparent PNG over
            TATOS' 6000 x 6000 one. No model uses it, but the block atlas loads every PNG under textures/item
            (about 198 MB of native memory, and it forced the atlas to 8192 x 8192).
  leaves    kubejs/assets/fallingleaves/atlases/leaves.json, a filter source. Falling Leaves registers its reload
            listener twice and each one stitches every textures/particle PNG of the pack into its own atlas;
            its leaf types use only fallingleaves sprites. The filter drops every other namespace from that atlas.

  python -I .minecraft/dev/client_overrides/client_overrides.py              report, change nothing
  python -I .minecraft/dev/client_overrides/client_overrides.py --write      (re)write the sounds.json files
  python -I .minecraft/dev/client_overrides/client_overrides.py --check      exit 1 when an override no longer
                                                                             matches the jars
  python -I .minecraft/dev/client_overrides/client_overrides.py --current    the gate: is the stamp still of
                                                                             this tree (no jar is downloaded)

It reads the jars the client index of this tree names (distribution/client/mods/.index), each from the first
--mods folder that holds it with the hash the index records (default: the PrismLauncher instance's mods folder),
and the pack's own jars from distribution/client/mods. A jar found nowhere stops it (exit 2), because the output
would then describe other jars than the ones the pack ships. dev/mods/intake.py runs --check on add, update and
remove, with the folders it took the jars from. Only .minecraft/kubejs/assets is written; sync-distros.ps1 -Fix
mirrors it.

THE STAMP. When --check or --write ends with every override matching, it writes checked.json next to this file:
the client jars it read (the hash the index records; for the pack's own jars a hash of what an override can
depend on), what in each jar the overrides depend on, and a hash of each override file. --current compares the
tree with the stamp without opening a third-party jar (the pre-push hook, block "Client asset overrides", and the
workflow client-overrides.yml; intake.py check reports the mod side of it). Exit 1 (STALE) when:
  - a jar of the client index is not in the stamp, or the index records another file for it (an add, an update);
  - a jar of the stamp left the index and the stamp says an override depends on it (a remove);
  - one of the pack's own jars ships other sounds.json, sound or atlas files than at the check (a rebuild);
  - an override file is not the one the check passed (an edit by hand, a --write the check did not follow).
A jar an override depends on ("touches" in the stamp):
  sounds        its sounds.json registers a restated event, or replaces an event ("replace": true: taking it
                away can bring back a long track it hid)
  sound files   it ships a file a restated event plays, or a sound file another pack ships too
  tatos         it is TATOS, ships the texture, or names it in a model, a class or a config
  leaves        it ships assets/fallingleaves/atlases/leaves.json
Any other client jar can be removed without a new check.
"""
import argparse
import hashlib
import io
import json
import os
import re
import struct
import sys
import zipfile
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.normpath(os.path.join(HERE, "..", ".."))
KJS_ASSETS = os.path.join(MC, "kubejs", "assets")
CLIENT = os.path.join(MC, "distribution", "client")
STAMP = os.path.join(HERE, "checked.json")
APPDATA = os.environ.get("APPDATA", "")
PRISM = os.path.join(APPDATA, "PrismLauncher")
DEFAULT_MODS = os.path.join(PRISM, "instances", "IridescentCraft", ".minecraft", "mods")
DEFAULT_ASSETS = os.path.join(PRISM, "assets")
ASSET_INDEX = "5"  # the 1.20.1 asset index
TOOL = "python -I .minecraft/dev/client_overrides/client_overrides.py"

TATOS_PNG = "assets/theabyss/textures/item/netherite_helmet_-_copy.png"
TATOS_JAR = re.compile(r"^TATOS .*\.jar$")
TATOS_NEEDLE = b"netherite_helmet_-_copy"
TATOS_TEXT = (".json", ".class", ".mcmeta", ".properties", ".toml")
LEAVES_JSON = "assets/fallingleaves/atlases/leaves.json"
LEAVES_JAR = re.compile(r"^fallingleaves-.*\.jar$")
LEAVES_UPSTREAM = {"type": "directory", "source": "particle", "prefix": ""}
LEAVES_OVERRIDE = {"sources": [{"type": "filter", "pattern": {"namespace": "^(?!fallingleaves$).*$"}}]}
SOUNDS_JSON = re.compile(r"assets/([^/]+)/sounds\.json$")

# the fields vanilla 1.20.1 reads (SoundEventRegistrationSerializer); nothing else is restated
EVENT_KEYS = ("replace", "subtitle", "sounds")
SOUND_KEYS = ("name", "volume", "pitch", "weight", "stream", "attenuation_distance", "preload", "type")


class Cannot(Exception):
    pass


class Pack:
    """One entry of the client resource stack: a jar, a nested jar, a zip or the vanilla assets."""

    def __init__(self, label, names, read):
        self.label, self.names, self.read = label, names, read


def zip_pack(label, z):
    names = set(z.namelist())
    return Pack(label, names, lambda n: z.read(n))


def vanilla_pack(assets):
    path = os.path.join(assets, "indexes", ASSET_INDEX + ".json")
    if not os.path.isfile(path):
        raise Cannot("no asset index %s: start any 1.20.1 instance once in PrismLauncher, or pass --assets" % path)
    index = json.load(open(path, encoding="utf-8"))
    objs = {"assets/" + k: v["hash"] for k, v in index["objects"].items() if k.startswith("minecraft/")}

    def read(n):
        h = objs[n]
        return open(os.path.join(assets, "objects", h[:2], h), "rb").read()

    return Pack("vanilla", set(objs), read)


def jload(b, where):
    try:
        return json.loads(b.decode("utf-8-sig"), strict=False)
    except ValueError as e:
        raise Cannot("cannot parse %s: %s" % (where, e))


def file_hash(path, kind):
    h = hashlib.new(kind)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def client_index():
    """The client jars of this tree -> {file name: {"own": bool, "hash": "<format>:<hash>", "path": own jar}}: every
    metafile of distribution/client/mods/.index, and every jar committed in distribution/client/mods (the pack's
    own jars and its patched copies, delivered by the custom-jar manifest: the committed file is what ships)."""
    want = {}
    idx = os.path.join(CLIENT, "mods", ".index")
    if not os.path.isdir(idx):
        raise Cannot("no client index %s" % idx)
    for f in sorted(os.listdir(idx)):
        if f.endswith(".pw.toml"):
            t = open(os.path.join(idx, f), encoding="utf-8").read()
            fn = re.search(r"""^filename = ['"](.*)['"]""", t, re.M)
            h = re.search(r"hash = '([0-9a-f]+)'", t)
            kind = re.search(r"hash-format = '(\w+)'", t)
            if not (fn and h and kind):
                raise Cannot("%s has no filename, hash or hash-format" % f)
            want[fn.group(1)] = {"own": False, "hash": "%s:%s" % (kind.group(1), h.group(1))}
    for f in sorted(os.listdir(os.path.join(CLIENT, "mods"))):
        if f.endswith(".jar"):
            want[f] = {"own": True, "path": os.path.join(CLIENT, "mods", f)}
    return want


def resolve_jars(index, dirs):
    """Where each jar of the client index is on this PC -> {file name: path}, in file-name order. A third-party jar
    is taken from the first folder of `dirs` that holds a file of its name with the hash the index records."""
    found, missing = OrderedDict(), []
    for f in sorted(index):
        e = index[f]
        if e["own"]:
            found[f] = e["path"]
            continue
        kind, want = e["hash"].split(":", 1)
        path = next((os.path.join(d, f) for d in dirs if os.path.isfile(os.path.join(d, f))
                     and file_hash(os.path.join(d, f), kind) == want), None)
        if path:
            found[f] = path
        else:
            missing.append(f)
    if missing:
        raise Cannot("%d jar(s) of the client index are not on this PC with the hash the index records, in %s:\n  %s\n"
                     "A launch syncs the instance's mods folder to pushed main; a jar that is not pushed yet is passed with "
                     "--mods <its folder> (give every folder, the instance's included: --mods replaces the default)"
                     % (len(missing), " ; ".join(dirs), "\n  ".join(missing[:20]) + ("\n  ..." if len(missing) > 20 else "")))
    return found


def mod_packs(paths):
    """Every jar and every jar-in-jar of it, each its own pack (Forge flattens mod_resources into one entry per
    mod file). Their order inside mod_resources is the mod list's; it only matters for an event that two of them
    define, and such an event is reported."""
    packs = []
    for f, path in paths.items():
        z = zipfile.ZipFile(path)
        packs.append(zip_pack(f, z))
        for n in z.namelist():
            if n.startswith("META-INF/jarjar/") and n.endswith(".jar"):
                packs.append(zip_pack(f + "!" + n, zipfile.ZipFile(io.BytesIO(z.read(n)))))
    return packs


def paxi_packs():
    """The Paxi resource packs, bottom to top; they sit above the KubeJS pack."""
    base = os.path.join(CLIENT, "config", "paxi")
    order = jload(open(os.path.join(base, "resourcepack_load_order.json"), "rb").read(), "the Paxi load order")
    return [zip_pack(n, zipfile.ZipFile(os.path.join(base, "resourcepacks", n))) for n in order["loadOrder"]]


def ogg_seconds(b):
    i = b.find(b"\x01vorbis")
    if i < 0:
        return None
    rate = struct.unpack("<I", b[i + 12:i + 16])[0]
    j = b.rfind(b"OggS")
    gran = struct.unpack("<q", b[j + 6:j + 14])[0]
    return gran / rate if rate > 0 and gran > 0 else None


def sound_file(name):
    ns, path = name.split(":", 1) if ":" in name else ("minecraft", name)
    return "assets/%s/sounds/%s.ogg" % (ns, path)


def as_dict(s):
    return {"name": s} if isinstance(s, str) else s


def registrations(p):
    """Every sound event registration of a pack -> [(event id, registration)]"""
    out = []
    for n in sorted(p.names):
        m = SOUNDS_JSON.match(n)
        if m:
            out += [(m.group(1) + ":" + key, reg) for key, reg in jload(p.read(n), p.label + " " + n).items()]
    return out


def merge(packs):
    """Replay SoundManager's merge: per event, packs bottom to top; a registration with replace (or the first one)
    starts the event over and sets its subtitle, any other appends its sounds."""
    events = {}
    for p in packs:
        for ev, reg in registrations(p):
            if ev not in events or reg.get("replace"):
                events[ev] = {"subtitle": reg.get("subtitle"), "sounds": [], "from": []}
            events[ev]["sounds"] += [(as_dict(s), p.label) for s in reg.get("sounds", [])]
            events[ev]["from"].append(p.label)
    return events


def build(packs_below, packs_above, min_seconds):
    stack = packs_below + packs_above
    oggs = {}

    def seconds(name):
        f = sound_file(name)
        if f not in oggs:
            top = next((p for p in reversed(stack) if f in p.names), None)
            oggs[f] = ogg_seconds(top.read(f)) if top else None
        return oggs[f]

    def long_unstreamed(sounds):
        return [(s["name"], seconds(s["name"])) for s, _ in sounds if s.get("type", "file") == "file"
                and not s.get("stream") and (seconds(s["name"]) or 0) >= min_seconds]

    below = merge(packs_below)
    picked = {ev: d for ev, d in sorted(below.items()) if long_unstreamed(d["sounds"])}
    out, notes = {}, []
    for ev, d in picked.items():
        ns, key = ev.split(":", 1)
        reg = {"replace": True}
        if d["subtitle"] is not None:
            reg["subtitle"] = d["subtitle"]
        sounds = []
        for s, _ in d["sounds"]:
            s = {k: v for k, v in s.items() if k in SOUND_KEYS}
            if s.get("type", "file") == "file":
                s["stream"] = True
            sounds.append(s)
        reg["sounds"] = sounds
        out.setdefault(ns, {})[key] = reg
        if len(d["from"]) > 1:
            notes.append("%s is defined by %s: restated as their merge, in jar-name order" % (ev, ", ".join(d["from"])))
    above = merge(packs_above)
    for ev, d in sorted(above.items()):
        left = long_unstreamed(d["sounds"])
        if ev in picked:
            notes.append("%s is also defined by %s, above the KubeJS pack: the override does not cover it"
                         % (ev, ", ".join(d["from"])))
        elif left:
            notes.append("%s (in %s, above the KubeJS pack) plays %s without streaming; KubeJS cannot override it"
                         % (ev, ", ".join(d["from"]), ", ".join("%s %.0f s" % x for x in left)))
    report = [(ev, d["from"], long_unstreamed(d["sounds"])) for ev, d in picked.items()]
    return out, report, notes, picked


def text(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def current_sound_files():
    found = {}
    for ns in sorted(os.listdir(KJS_ASSETS)):
        p = os.path.join(KJS_ASSETS, ns, "sounds.json")
        if os.path.isfile(p):
            found[ns] = p
    return found


def tatos_references(packs):
    """Every file of a pack that names the TATOS texture -> [(pack label, file)]"""
    return [(p.label, n) for p in packs for n in sorted(p.names)
            if n.endswith(TATOS_TEXT) and TATOS_NEEDLE in p.read(n)]


def check_tatos(paths, refs):
    """The 6000 x 6000 PNG: still shipped by TATOS, still referenced by nothing, still overridden."""
    bad = []
    ours = os.path.join(KJS_ASSETS, *TATOS_PNG.split("/")[1:])
    jar = next((f for f in paths if TATOS_JAR.match(f)), None)
    if jar is None:
        # gone with the mod: done once the override is gone too
        return ["tatos: no TATOS jar any more; the override %s can go" % TATOS_PNG] if os.path.isfile(ours) else []
    if TATOS_PNG not in zipfile.ZipFile(paths[jar]).namelist():
        bad.append("tatos: %s no longer ships %s; the override can go" % (jar, TATOS_PNG))
    for label, n in refs:
        bad.append("tatos: %s %s now references the texture; the transparent override would show" % (label, n))
    if not os.path.isfile(ours):
        bad.append("tatos: the override %s is missing" % ours)
    else:
        o = open(ours, "rb").read()
        if o[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", o[16:24]) != (16, 16):
            bad.append("tatos: the override is not a 16 x 16 PNG")
    return bad


def check_leaves(paths):
    """Falling Leaves' atlas file: still the directory source the filter was made for, and the override in place."""
    bad = []
    ours = os.path.join(KJS_ASSETS, *LEAVES_JSON.split("/")[1:])
    jar = next((f for f in paths if LEAVES_JAR.match(f)), None)
    if jar is None:
        return ["leaves: no Falling Leaves jar any more; the override %s can go" % LEAVES_JSON] if os.path.isfile(ours) else []
    z = zipfile.ZipFile(paths[jar])
    if LEAVES_JSON not in z.namelist():
        bad.append("leaves: %s no longer ships %s; re-read the mod before keeping the filter" % (jar, LEAVES_JSON))
    else:
        up = jload(z.read(LEAVES_JSON), jar + " " + LEAVES_JSON)
        if up.get("sources") != [LEAVES_UPSTREAM]:
            bad.append("leaves: %s %s changed (%s); re-read the mod before keeping the filter" % (jar, LEAVES_JSON, up))
    if not os.path.isfile(ours) or jload(open(ours, "rb").read(), ours) != LEAVES_OVERRIDE:
        bad.append("leaves: the override %s is missing or not the filter" % ours)
    return bad


# --------------------------------------------------------------------------- the stamp

def touches_of(packs, picked, refs):
    """What of each jar the overrides depend on -> {jar file name: [labels]} (the module docstring has the rule)"""
    out = {}

    def mark(label, what):
        jar = label.split("!", 1)[0]
        if jar != "vanilla" and what not in out.setdefault(jar, []):
            out[jar].append(what)
    played = set(sound_file(s["name"]) for d in picked.values() for s, _ in d["sounds"] if s.get("type", "file") == "file")
    shipped = {}
    for p in packs:
        for n in p.names:
            if n.endswith(".ogg"):
                shipped.setdefault(n, []).append(p.label)
    for p in packs:
        if any(ev in picked or reg.get("replace") for ev, reg in registrations(p)):
            mark(p.label, "sounds")
        if any(n in played or len(shipped[n]) > 1 for n in p.names if n.endswith(".ogg")):
            mark(p.label, "sound files")
        if TATOS_JAR.match(p.label) or TATOS_PNG in p.names:
            mark(p.label, "tatos")
        if LEAVES_JSON in p.names:
            mark(p.label, "leaves")
    for label, _ in refs:
        mark(label, "tatos")
    return out


def own_digest(path):
    """What of one of the pack's own jars an override can depend on, as one hash: its sounds.json files, its .ogg
    files, the Falling Leaves atlas file, the TATOS texture and every file that names it, nested jars included.
    'none' when it ships none of them: a rebuild that changes only code or other assets keeps the stamp current."""
    lines = []

    def walk(z, prefix):
        for n in sorted(z.namelist()):
            if n.endswith("/"):
                continue
            if n.startswith("META-INF/jarjar/") and n.endswith(".jar"):
                walk(zipfile.ZipFile(io.BytesIO(z.read(n))), prefix + n + "!")
            elif SOUNDS_JSON.match(n) or n.endswith(".ogg") or n in (LEAVES_JSON, TATOS_PNG):
                lines.append("%s%s %s" % (prefix, n, hashlib.sha1(z.read(n)).hexdigest()))
            elif n.endswith(TATOS_TEXT) and TATOS_NEEDLE in z.read(n):
                lines.append("%s%s names the TATOS texture" % (prefix, n))
    with zipfile.ZipFile(path) as z:
        walk(z, "")
    return hashlib.sha1("\n".join(lines).encode("utf-8")).hexdigest() if lines else "none"


def jar_hash(e):
    return e["hash"] if not e["own"] else "own:" + own_digest(e["path"])


def override_files():
    """Every override file in the tree -> {path under .minecraft: sha1}. JSON is hashed with LF line ends, so a
    checkout with CRLF and CI agree."""
    found = OrderedDict()
    rels = ["kubejs/assets/%s/sounds.json" % ns for ns in current_sound_files()]
    rels += ["kubejs/" + TATOS_PNG, "kubejs/" + LEAVES_JSON]
    for r in rels:
        p = os.path.join(MC, *r.split("/"))
        if os.path.isfile(p):
            b = open(p, "rb").read()
            found[r] = hashlib.sha1(b.replace(b"\r\n", b"\n") if r.endswith(".json") else b).hexdigest()
    return found


STAMP_ABOUT = [
    "Written by client_overrides.py --check or --write when every override in kubejs/assets matched the jars below.",
    "Do not edit: run the tool. --current (the pre-push hook, CI) compares the tree with this file; README.md next to it.",
    "jars: the hash the client index records (the pack's own jars: own:<hash of their sound, atlas and texture files>);",
    "touches: what of the jar an override depends on. A jar with no touches can leave the pack without a new check.",
]


def stamp_text(index, touches, min_seconds):
    lines = ["{", '  "about": %s,' % json.dumps(STAMP_ABOUT, ensure_ascii=False), '  "min_seconds": %s,' % json.dumps(min_seconds),
             '  "overrides": {']
    ov = override_files()
    lines += ['    %s: %s%s' % (json.dumps(k), json.dumps(v), "," if i < len(ov) - 1 else "") for i, (k, v) in enumerate(ov.items())]
    lines += ["  },", '  "jars": {']
    names = sorted(index, key=lambda f: (f.lower(), f))
    for i, f in enumerate(names):
        e = OrderedDict([("hash", jar_hash(index[f]))])
        if touches.get(f):
            e["touches"] = touches[f]
        lines.append("    %s: %s%s" % (json.dumps(f, ensure_ascii=False), json.dumps(e, ensure_ascii=False), "," if i < len(names) - 1 else ""))
    lines += ["  }", "}"]
    return "\n".join(lines) + "\n"


def load_stamp(path=STAMP):
    if not os.path.isfile(path):
        raise Cannot("no stamp %s: run %s --check once where the jars are" % (os.path.relpath(path, MC), TOOL))
    try:
        doc = json.load(open(path, encoding="utf-8"))
    except ValueError as e:
        raise Cannot("the stamp %s does not parse (%s): run %s --check" % (path, e, TOOL))
    if not isinstance(doc.get("jars"), dict) or not isinstance(doc.get("overrides"), dict):
        raise Cannot("the stamp %s has no jars or overrides object: run %s --check" % (path, TOOL))
    return doc


def stale_jars(stamp, index, own=True):
    """The jars of the client index that the stamp does not describe -> [(jar file name, why)], and the count of
    jars that left the index and touched no override. own=False leaves the pack's own jars out (intake's gate: those
    are released by the custom-jar-release procedure, and reading them is the slow part)."""
    jars = stamp["jars"]
    out = []
    for f in sorted(index, key=str.lower):
        e = index[f]
        was = jars.get(f)
        # own in the stamp counts too: a checkout without the committed jars (a sparse CI checkout) sees only the
        # metafile some of them have
        if not own and (e["own"] or str((was or {}).get("hash", "")).startswith("own:")):
            continue
        if was is None:
            out.append((f, "in the client index, not in the stamp: the overrides were not checked with it (an add or an update)"))
        elif e["own"]:
            if jar_hash(e) != was.get("hash"):
                out.append((f, "one of the pack's own jars, rebuilt with other sounds.json, sound, atlas or TATOS-texture files"))
        elif e["hash"] != was.get("hash"):
            out.append((f, "the index records another file than the one the overrides were checked with (an update)"))
    gone_ok = 0
    for f, was in sorted(jars.items(), key=lambda kv: kv[0].lower()):
        if f in index or (not own and str(was.get("hash", "")).startswith("own:")):
            continue
        if was.get("touches"):
            out.append((f, "left the client index; the overrides depend on it (%s)" % ", ".join(was["touches"])))
        else:
            gone_ok += 1
    return out, gone_ok


def stale_files(stamp):
    """Override files that are not the ones the check passed -> [(file, why)]"""
    want, have = stamp["overrides"], override_files()
    out = []
    for r in sorted(set(want) | set(have)):
        if r not in have:
            out.append((r, "in the stamp, no longer in the tree"))
        elif r not in want:
            out.append((r, "in the tree, not in the stamp (written by hand, or by --write without a passing check)"))
        elif want[r] != have[r]:
            out.append((r, "not the file the check passed (edited by hand, or --write without a passing check)"))
    return out


def current():
    """The gate: the tree against the stamp. -> exit code"""
    stamp = load_stamp()
    index = client_index()
    jars, gone_ok = stale_jars(stamp, index)
    files = stale_files(stamp)
    for f, why in jars:
        print("[client-overrides] FAIL   STALE   %s: %s" % (f, why))
    for r, why in files:
        print("[client-overrides] FAIL   STALE   .minecraft/%s: %s" % (r, why))
    if jars or files:
        print("")
        print("[client-overrides] FAILED: the client asset overrides were not checked against this tree (%d finding(s))."
              % (len(jars) + len(files)))
        print("[client-overrides] With the jars on this PC (a launch syncs the instance; intake.py passes the folders itself):")
        print("    %s --check      exits 1 and says what to do when an override no longer matches; writes the stamp when all do" % TOOL)
        print("    %s --write      regenerates the sounds.json files, then writes the stamp" % TOOL)
        print("[client-overrides] then powershell -File .minecraft\\dev\\sync-distros.ps1 -Fix, and commit kubejs/assets (all three trees) and")
        print("[client-overrides] .minecraft/dev/client_overrides/checked.json. README.md next to the tool.")
        return 1
    print("[client-overrides] OK - the %d client jars and %d override files are the ones the stamp was checked with%s."
          % (len(index), len(stamp["overrides"]),
             "; %d jar(s) of the stamp left the index, none of them touched an override" % gone_ok if gone_ok else ""))
    return 0


def what_to_do(bad, dirs):
    mods = "" if dirs == [DEFAULT_MODS] else " " + " ".join('--mods "%s"' % d for d in dirs)
    out = ["What to do:"]
    if any(b.startswith("sounds:") for b in bad):
        out.append("  sounds  %s --write%s" % (TOOL, mods))
        out.append("          regenerates the sounds.json files from the jars; read the diff (a new track, a new event, one that left)")
    if any(b.startswith("tatos:") for b in bad):
        out.append("  tatos   re-read TATOS and every file named above: is %s used or gone now? The override" % TATOS_PNG)
        out.append("          .minecraft/kubejs/%s is a 16 x 16 transparent PNG: delete it when a model uses the texture" % TATOS_PNG)
        out.append("          or the jar no longer ships it, keep it when neither (README.md next to this tool, the table)")
    if any(b.startswith("leaves:") for b in bad):
        out.append("  leaves  re-read Falling Leaves' %s and its reload listener; the filter" % LEAVES_JSON)
        out.append("          .minecraft/kubejs/%s assumes %s" % (LEAVES_JSON, json.dumps(LEAVES_UPSTREAM)))
    out.append("  then    %s --check%s   (it writes the stamp when every override matches)" % (TOOL, mods))
    out.append("          powershell -File .minecraft\\dev\\sync-distros.ps1 -Fix   (mirrors kubejs/assets to the two distros)")
    out.append("          and commit kubejs/assets (all three trees) and .minecraft/dev/client_overrides/checked.json with the mod change")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--mods", action="append", help="a folder that holds the client index's jars; repeat for more, "
                                                    "searched in order (default: %s)" % DEFAULT_MODS)
    ap.add_argument("--assets", default=DEFAULT_ASSETS, help="PrismLauncher's assets folder (vanilla sounds.json)")
    ap.add_argument("--min-seconds", type=float, default=30.0)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--write", action="store_true")
    g.add_argument("--check", action="store_true")
    g.add_argument("--current", action="store_true", help="the gate: the tree against the stamp, no jar opened but the pack's own")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

    try:
        if a.current:
            return current()
        dirs = [os.path.abspath(d) for d in a.mods] if a.mods else [DEFAULT_MODS]
        index = client_index()
        paths = resolve_jars(index, dirs)
        mods = mod_packs(paths)
        vanilla = vanilla_pack(a.assets)
        out, report, notes, picked = build(mods + [vanilla], paxi_packs(), a.min_seconds)

        files = {}
        for ev, src, fl in report:
            files.update(fl)
            print("%-64s %6.0f s  %s" % (ev, sum(s for _, s in fl), ", ".join(src)))
        print("%d events in %d namespaces play %d distinct files of %.0f s or more without streaming (%.0f s in all)"
              % (len(report), len(out), len(files), a.min_seconds, sum(files.values())))
        for n in notes:
            print("NOTE", n)

        have = current_sound_files()
        drift = []
        for ns in sorted(set(out) | set(have)):
            want = text(out[ns]) if ns in out else None
            got = open(have[ns], encoding="utf-8").read() if ns in have else None
            if want != got:
                drift.append(ns)
        refs = tatos_references(mods)
        bad = check_tatos(paths, refs) + check_leaves(paths)
        if a.write:
            for ns in drift:
                p = os.path.join(KJS_ASSETS, ns, "sounds.json")
                if ns in out:
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    open(p, "w", encoding="utf-8", newline="\n").write(text(out[ns]))
                    print("wrote", os.path.relpath(p, MC))
                else:
                    os.remove(p)
                    print("removed", os.path.relpath(p, MC))
            drift = []
        for ns in drift:
            bad.append("sounds: kubejs/assets/%s/sounds.json does not match the jars (run with --write)" % ns)
        for b in bad:
            print("FAIL", b)
        if bad:
            for line in what_to_do(bad, dirs):
                print(line)
            return 1 if a.check or a.write else 0
        print("OK: the sound, TATOS and Falling Leaves overrides match the jars")
        if a.check or a.write:
            new = stamp_text(index, touches_of(mods + [vanilla], picked, refs), a.min_seconds)
            old = open(STAMP, encoding="utf-8").read() if os.path.isfile(STAMP) else None
            if new != old:
                open(STAMP, "w", encoding="utf-8", newline="\n").write(new)
                print("stamp written: .minecraft/%s (%d jars; commit it with kubejs/assets)"
                      % (os.path.relpath(STAMP, MC).replace("\\", "/"), len(index)))
            else:
                print("stamp current: .minecraft/%s" % os.path.relpath(STAMP, MC).replace("\\", "/"))
        return 0
    except (Cannot, OSError, zipfile.BadZipFile) as e:
        print("[client-overrides] CANNOT: %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
