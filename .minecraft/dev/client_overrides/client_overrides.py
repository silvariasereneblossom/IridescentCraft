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

It reads the jars of the PrismLauncher instance (--mods) and first checks them against the client index of this
tree (distribution/client/mods/.index plus the custom jars there): a jar that differs stops it, because the output
would then describe other jars than the ones the pack ships. Run it after a launch has synced the instance, and
after every mod update (dev/mods/intake.py update). Only .minecraft/kubejs/assets is written; sync-distros.ps1 -Fix
mirrors it.
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

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.normpath(os.path.join(HERE, "..", ".."))
KJS_ASSETS = os.path.join(MC, "kubejs", "assets")
CLIENT = os.path.join(MC, "distribution", "client")
APPDATA = os.environ.get("APPDATA", "")
PRISM = os.path.join(APPDATA, "PrismLauncher")
DEFAULT_MODS = os.path.join(PRISM, "instances", "IridescentCraft", ".minecraft", "mods")
DEFAULT_ASSETS = os.path.join(PRISM, "assets")
ASSET_INDEX = "5"  # the 1.20.1 asset index

TATOS_PNG = "assets/theabyss/textures/item/netherite_helmet_-_copy.png"
TATOS_JAR = re.compile(r"^TATOS .*\.jar$")
LEAVES_JSON = "assets/fallingleaves/atlases/leaves.json"
LEAVES_JAR = re.compile(r"^fallingleaves-.*\.jar$")
LEAVES_UPSTREAM = {"type": "directory", "source": "particle", "prefix": ""}
LEAVES_OVERRIDE = {"sources": [{"type": "filter", "pattern": {"namespace": "^(?!fallingleaves$).*$"}}]}

# the fields vanilla 1.20.1 reads (SoundEventRegistrationSerializer); nothing else is restated
EVENT_KEYS = ("replace", "subtitle", "sounds")
SOUND_KEYS = ("name", "volume", "pitch", "weight", "stream", "attenuation_distance", "preload", "type")


class Pack:
    """One entry of the client resource stack: a jar, a nested jar, a zip or the vanilla assets."""

    def __init__(self, label, names, read):
        self.label, self.names, self.read = label, names, read


def zip_pack(label, z):
    names = set(z.namelist())
    return Pack(label, names, lambda n: z.read(n))


def vanilla_pack(assets):
    index = json.load(open(os.path.join(assets, "indexes", ASSET_INDEX + ".json"), encoding="utf-8"))
    objs = {"assets/" + k: v["hash"] for k, v in index["objects"].items() if k.startswith("minecraft/")}

    def read(n):
        h = objs[n]
        return open(os.path.join(assets, "objects", h[:2], h), "rb").read()

    return Pack("vanilla", set(objs), read)


def jload(b, where):
    try:
        return json.loads(b.decode("utf-8-sig"), strict=False)
    except ValueError as e:
        sys.exit("cannot parse %s: %s" % (where, e))


def check_jars(mods):
    """The instance jars must be the client index's jars, byte for byte."""
    want = {}
    idx = os.path.join(CLIENT, "mods", ".index")
    for f in os.listdir(idx):
        if f.endswith(".pw.toml"):
            t = open(os.path.join(idx, f), encoding="utf-8").read()
            fn = re.search(r"""^filename = ['"](.*)['"]""", t, re.M).group(1)
            want[fn] = (re.search(r"hash = '([0-9a-f]+)'", t).group(1), re.search(r"hash-format = '(\w+)'", t).group(1))
    for f in os.listdir(os.path.join(CLIENT, "mods")):
        if f.endswith(".jar"):
            want[f] = (hashlib.sha1(open(os.path.join(CLIENT, "mods", f), "rb").read()).hexdigest(), "sha1")
    have = {f for f in os.listdir(mods) if f.endswith(".jar")}
    bad = ["missing " + f for f in sorted(set(want) - have)] + ["not in the index " + f for f in sorted(have - set(want))]
    for f in sorted(set(want) & have):
        h, kind = want[f]
        if hashlib.new(kind, open(os.path.join(mods, f), "rb").read()).hexdigest() != h:
            bad.append("differs from the index " + f)
    if bad:
        sys.exit("the jars in %s are not the client index of this tree (launch once to sync, or pass --mods):\n  %s"
                 % (mods, "\n  ".join(bad)))
    return sorted(have)


def mod_packs(mods, jars):
    """Every jar and every jar-in-jar of it, each its own pack (Forge flattens mod_resources into one entry per
    mod file). Their order inside mod_resources is the mod list's; it only matters for an event that two of them
    define, and such an event is reported."""
    packs = []
    for f in jars:
        z = zipfile.ZipFile(os.path.join(mods, f))
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


def merge(packs):
    """Replay SoundManager's merge: per event, packs bottom to top; a registration with replace (or the first one)
    starts the event over and sets its subtitle, any other appends its sounds."""
    events = {}
    for p in packs:
        for n in sorted(p.names):
            m = re.match(r"assets/([^/]+)/sounds\.json$", n)
            if not m:
                continue
            for key, reg in jload(p.read(n), p.label + " " + n).items():
                ev = m.group(1) + ":" + key
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
    return out, report, notes


def text(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def current_sound_files():
    found = {}
    for ns in sorted(os.listdir(KJS_ASSETS)):
        p = os.path.join(KJS_ASSETS, ns, "sounds.json")
        if os.path.isfile(p):
            found[ns] = p
    return found


def check_tatos(mods, jars, packs):
    """The 6000 x 6000 PNG: still shipped by TATOS, still referenced by nothing, still overridden."""
    bad = []
    jar = next((f for f in jars if TATOS_JAR.match(f)), None)
    if jar is None:
        return ["tatos: no TATOS jar any more; the override %s can go" % TATOS_PNG]
    if TATOS_PNG not in zipfile.ZipFile(os.path.join(mods, jar)).namelist():
        bad.append("tatos: %s no longer ships %s; the override can go" % (jar, TATOS_PNG))
    needle = b"netherite_helmet_-_copy"
    for p in packs:
        for n in p.names:
            if n.endswith((".json", ".class", ".mcmeta", ".properties", ".toml")) and needle in p.read(n):
                bad.append("tatos: %s %s now references the texture; the transparent override would show" % (p.label, n))
    ours = os.path.join(KJS_ASSETS, *TATOS_PNG.split("/")[1:])
    if not os.path.isfile(ours):
        bad.append("tatos: the override %s is missing" % ours)
    else:
        o = open(ours, "rb").read()
        if o[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", o[16:24]) != (16, 16):
            bad.append("tatos: the override is not a 16 x 16 PNG")
    return bad


def check_leaves(mods, jars):
    """Falling Leaves' atlas file: still the directory source the filter was made for, and the override in place."""
    bad = []
    jar = next((f for f in jars if LEAVES_JAR.match(f)), None)
    if jar is None:
        return ["leaves: no Falling Leaves jar any more; the override %s can go" % LEAVES_JSON]
    z = zipfile.ZipFile(os.path.join(mods, jar))
    if LEAVES_JSON not in z.namelist():
        bad.append("leaves: %s no longer ships %s; re-read the mod before keeping the filter" % (jar, LEAVES_JSON))
    else:
        up = jload(z.read(LEAVES_JSON), jar + " " + LEAVES_JSON)
        if up.get("sources") != [LEAVES_UPSTREAM]:
            bad.append("leaves: %s %s changed (%s); re-read the mod before keeping the filter" % (jar, LEAVES_JSON, up))
    ours = os.path.join(KJS_ASSETS, *LEAVES_JSON.split("/")[1:])
    if not os.path.isfile(ours) or jload(open(ours, "rb").read(), ours) != LEAVES_OVERRIDE:
        bad.append("leaves: the override %s is missing or not the filter" % ours)
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--mods", default=DEFAULT_MODS, help="the instance's mods folder (default: %(default)s)")
    ap.add_argument("--assets", default=DEFAULT_ASSETS, help="PrismLauncher's assets folder (vanilla sounds.json)")
    ap.add_argument("--min-seconds", type=float, default=30.0)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--write", action="store_true")
    g.add_argument("--check", action="store_true")
    a = ap.parse_args()

    jars = check_jars(a.mods)
    mods = mod_packs(a.mods, jars)
    out, report, notes = build(mods + [vanilla_pack(a.assets)], paxi_packs(), a.min_seconds)

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
    bad = check_tatos(a.mods, jars, mods) + check_leaves(a.mods, jars)
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
    if a.check and bad:
        sys.exit(1)
    if not bad:
        print("OK: the sound, TATOS and Falling Leaves overrides match the jars")


if __name__ == "__main__":
    main()
