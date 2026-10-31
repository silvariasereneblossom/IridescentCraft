#!/usr/bin/env python3
"""client_overrides_test.py -- does client_overrides.py check what it says, and does its gate refuse what it exists
to refuse?

Builds a small pack in a temporary folder: a copy of the tool, a client index of four jars built here (TATOS with a
long unstreamed track and the big texture, Falling Leaves with its atlas file, a music mod with a long track, a mod
with nothing an override needs), one of the pack's own jars, a vanilla asset index and the two hand-written
overrides. Then:

  the check     --write writes the sounds.json files and the stamp; --check and --current pass on it; the stamp
                says which jars an override depends on
  an update     of the music mod that adds a track to its restated event: --current refuses it, --check fails and
                says to run --write, --write and --current pass again and the override lists the new track
  the others    an update of a jar nothing depends on (--current refuses, --check passes and writes the stamp); a
                removal of it (passes) and of the music mod (refused); an override edited by hand or added; the own
                jar rebuilt with other code (passes) and with a sound (refused); a model that starts using the TATOS
                texture and a Falling Leaves update that changed its atlas (--check fails and names the file to
                re-read); a jar of the index not on this PC and a missing stamp (exit 2); CRLF line ends (passes)

Nothing in the real tree is touched. Usage: python .minecraft/dev/client_overrides/client_overrides_test.py
Exit 0 when every case behaves, 1 otherwise. Python 3.8+.
"""
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = ".minecraft/distribution/client/mods/.index/"
OWN = ".minecraft/distribution/client/mods/"
ASSETS = ".minecraft/kubejs/assets/"
STAMP = ".minecraft/dev/client_overrides/checked.json"
TATOS_PNG = "assets/theabyss/textures/item/netherite_helmet_-_copy.png"
LEAVES_JSON = "assets/fallingleaves/atlases/leaves.json"
LEAVES_UPSTREAM = {"sources": [{"type": "directory", "source": "particle", "prefix": ""}]}
LEAVES_OVERRIDE = {"sources": [{"type": "filter", "pattern": {"namespace": "^(?!fallingleaves$).*$"}}]}


def ogg(seconds):
    """The two places client_overrides.py reads a length from: the vorbis header's sample rate and the last page's
    granule position."""
    return (b"OggS\x00\x02" + struct.pack("<q", 0) + b"\x01vorbis" + struct.pack("<I", 0) + b"\x02" + struct.pack("<I", 44100)
            + b"\x00" * 32 + b"OggS\x00\x04" + struct.pack("<q", int(44100 * seconds)))


def png(w, h):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x06\x00\x00\x00"


def build_jar(path, files):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(files):
            data = files[name]
            zf.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), data if isinstance(data, bytes) else data.encode("utf-8"))


def sounds(events):
    return json.dumps(events, indent=1)


class Pack:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="client-overrides-test-")
        self.jars = self.path("jars")
        os.makedirs(self.path(".minecraft/dev/client_overrides"))
        shutil.copy2(os.path.join(HERE, "client_overrides.py"), self.path(".minecraft/dev/client_overrides/client_overrides.py"))
        # vanilla: one short event, its file in the objects store
        vs = sounds({"ambient.cave": {"sounds": ["ambient/cave/cave1"]}}).encode("utf-8")
        h = hashlib.sha1(vs).hexdigest()
        self.write("prism/assets/objects/%s/%s" % (h[:2], h), vs)
        self.write("prism/assets/indexes/5.json", json.dumps({"objects": {"minecraft/sounds.json": {"hash": h, "size": len(vs)}}}))
        self.write(".minecraft/distribution/client/config/paxi/resourcepack_load_order.json", json.dumps({"loadOrder": []}))
        os.makedirs(self.path(".minecraft/distribution/client/config/paxi/resourcepacks"))
        self.jar("TATOS 1.0.5_beta.jar", {
            "assets/theabyss/sounds.json": sounds({"dream": {"subtitle": "theabyss.dream", "sounds": ["theabyss:dream"]},
                                                   "click": {"sounds": ["theabyss:click"]}}),
            "assets/theabyss/sounds/dream.ogg": ogg(120), "assets/theabyss/sounds/click.ogg": ogg(1),
            TATOS_PNG: png(6000, 6000)})
        self.jar("fallingleaves-1.20.1-2.1.2.jar", {LEAVES_JSON: json.dumps(LEAVES_UPSTREAM)})
        self.jar("music-1.0.jar", {"assets/music/sounds.json": sounds({"boss": {"sounds": [{"name": "music:boss1", "volume": 0.8}]}}),
                                   "assets/music/sounds/boss1.ogg": ogg(200)})
        self.jar("quiet-1.0.jar", {"META-INF/mods.toml": "modId=\"quiet\"\n", "assets/quiet/lang/en_us.json": "{}"})
        build_jar(self.path(OWN + "own_mod-1.0.0.jar"), {"com/x/A.class": b"\xca\xfe\xba\xbe 1"})
        self.write(ASSETS + TATOS_PNG[len("assets/"):], png(16, 16))
        self.write(ASSETS + LEAVES_JSON[len("assets/"):], json.dumps(LEAVES_OVERRIDE))

    def path(self, rel):
        return os.path.join(self.dir, *rel.split("/"))

    def write(self, rel, data):
        os.makedirs(os.path.dirname(self.path(rel)), exist_ok=True)
        with open(self.path(rel), "wb") as f:
            f.write(data if isinstance(data, bytes) else data.encode("utf-8"))

    def read(self, rel):
        with open(self.path(rel), "rb") as f:
            return f.read()

    def jar(self, name, files, slug=None):
        """A third-party jar into the jar folder, and its metafile into the client index (sha1, as CurseForge's are)."""
        path = os.path.join(self.jars, name)
        build_jar(path, files)
        slug = slug or name.split("-")[0].split(" ")[0].lower()
        self.write(INDEX + slug + ".pw.toml", "filename = '%s'\nname = '%s'\nside = 'both'\n\n[download]\nhash = '%s'\n"
                   "hash-format = 'sha1'\nmode = 'metadata:curseforge'\n" % (name, slug, hashlib.sha1(open(path, "rb").read()).hexdigest()))

    def tool(self, *args, mods=None):
        cmd = [sys.executable, "-I", self.path(".minecraft/dev/client_overrides/client_overrides.py")] + list(args)
        if "--current" not in args:
            cmd += ["--mods", mods or self.jars, "--assets", self.path("prism/assets")]
        r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        return r.returncode, r.stdout + r.stderr

    def stamp(self):
        return json.loads(self.read(STAMP).decode("utf-8"))

    def copy(self):
        other = Pack.__new__(Pack)
        other.dir = tempfile.mkdtemp(prefix="client-overrides-test-")
        shutil.rmtree(other.dir)
        shutil.copytree(self.dir, other.dir)
        other.jars = other.path("jars")
        return other

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, ok))
    print("  %s  %s%s" % ("ok  " if ok else "FAIL", name, "" if ok else "\n        " + detail.strip().replace("\n", "\n        ")[-1800:]))


def main():
    base = Pack()
    try:
        print("the check, --write and the stamp")
        rc, out = base.tool("--check")
        check("a pack whose overrides were never generated fails --check and says to run --write",
              rc == 1 and "FAIL sounds: kubejs/assets/theabyss/sounds.json does not match" in out and "--write" in out
              and not os.path.exists(base.path(STAMP)), out)
        rc, out = base.tool("--write")
        check("--write writes the two sounds.json files and the stamp", rc == 0 and "stamp written" in out
              and os.path.exists(base.path(ASSETS + "music/sounds.json")) and os.path.exists(base.path(STAMP)), out)
        music = json.loads(base.read(ASSETS + "music/sounds.json").decode("utf-8"))
        check("the restated event is replaced and streamed, its other fields kept",
              music == {"boss": {"replace": True, "sounds": [{"name": "music:boss1", "volume": 0.8, "stream": True}]}}, json.dumps(music))
        abyss = json.loads(base.read(ASSETS + "theabyss/sounds.json").decode("utf-8"))
        check("a short event is not restated; the subtitle of a long one is", list(abyss) == ["dream"]
              and abyss["dream"].get("subtitle") == "theabyss.dream", json.dumps(abyss))
        rc, out = base.tool("--check")
        check("--check passes on what --write wrote, and leaves the stamp as it is", rc == 0 and "stamp current" in out, out)
        rc, out = base.tool("--current")
        check("--current passes", rc == 0 and "OK - the 5 client jars and 4 override files" in out, out)
        jars = base.stamp()["jars"]
        check("the stamp: what each jar is depended on for",
              jars["TATOS 1.0.5_beta.jar"].get("touches") == ["sounds", "sound files", "tatos"]
              and jars["fallingleaves-1.20.1-2.1.2.jar"].get("touches") == ["leaves"]
              and jars["music-1.0.jar"].get("touches") == ["sounds", "sound files"]
              and "touches" not in jars["quiet-1.0.jar"] and jars["own_mod-1.0.0.jar"] == {"hash": "own:none"}, json.dumps(jars, indent=1))

        print("an update that adds a track to a restated event")
        p = base.copy()
        try:
            os.remove(os.path.join(p.jars, "music-1.0.jar"))
            p.jar("music-1.1.jar", {"assets/music/sounds.json": sounds({"boss": {"sounds": [{"name": "music:boss1", "volume": 0.8}, "music:boss2"]}}),
                                    "assets/music/sounds/boss1.ogg": ogg(200), "assets/music/sounds/boss2.ogg": ogg(10)}, slug="music")
            rc, out = p.tool("--current")
            check("--current refuses the updated jar and says what to run", rc == 1
                  and "STALE   music-1.1.jar: in the client index, not in the stamp" in out and "client_overrides.py --check" in out, out)
            rc, out = p.tool("--check")
            check("--check fails on the override that would hide the new track, and says --write",
                  rc == 1 and "FAIL sounds: kubejs/assets/music/sounds.json does not match the jars" in out
                  and "sounds  python -I .minecraft/dev/client_overrides/client_overrides.py --write --mods" in out, out)
            rc, out = p.tool("--write")
            music = json.loads(p.read(ASSETS + "music/sounds.json").decode("utf-8"))
            check("--write restates the event with both tracks, both streamed", rc == 0 and [s["name"] if isinstance(s, dict) else s for s in music["boss"]["sounds"]]
                  == ["music:boss1", "music:boss2"] and all(s.get("stream") for s in music["boss"]["sounds"]), json.dumps(music))
            rc, out = p.tool("--current")
            check("--current passes after --write", rc == 0, out)
        finally:
            p.close()

        print("the other stale states")
        p = base.copy()
        try:
            os.remove(os.path.join(p.jars, "quiet-1.0.jar"))
            p.jar("quiet-1.1.jar", {"META-INF/mods.toml": "modId=\"quiet\"\n"}, slug="quiet")
            rc, out = p.tool("--current")
            check("an update of a jar nothing depends on is refused: nobody knows that before the check", rc == 1 and "quiet-1.1.jar" in out, out)
            rc, out = p.tool("--check")
            check("--check passes on it and writes the stamp", rc == 0 and "stamp written" in out, out)
            rc, out = p.tool("--current")
            check("--current passes after that check", rc == 0, out)
            os.remove(p.path(INDEX + "quiet.pw.toml"))
            rc, out = p.tool("--current")
            check("a jar no override depends on can leave the index without a new check",
                  rc == 0 and "1 jar(s) of the stamp left the index, none of them touched an override" in out, out)
            os.remove(p.path(INDEX + "music.pw.toml"))
            rc, out = p.tool("--current")
            check("a jar an override depends on cannot", rc == 1
                  and "STALE   music-1.0.jar: left the client index; the overrides depend on it (sounds, sound files)" in out, out)
        finally:
            p.close()

        def case(name, expect, mutate, args=("--current",), code=1):
            q = base.copy()
            try:
                mutate(q)
                rc, out = q.tool(*args)
                check(name, rc == code and all(e in out for e in ([expect] if isinstance(expect, str) else expect)),
                      "exit %s, expected %r in:\n%s" % (rc, expect, out))
            finally:
                q.close()

        case("a jar re-released under the same name (the index records another hash) is refused",
             "STALE   quiet-1.0.jar: the index records another file than the one the overrides were checked with",
             lambda q: q.jar("quiet-1.0.jar", {"META-INF/mods.toml": "modId=\"quiet\"\nversion=\"1.0-fix\"\n"}))
        case("an override edited by hand is refused", "STALE   .minecraft/kubejs/assets/music/sounds.json: not the file the check passed",
             lambda q: q.write(ASSETS + "music/sounds.json", q.read(ASSETS + "music/sounds.json").replace(b"0.8", b"0.5")))
        case("a sounds.json added by hand is refused", "STALE   .minecraft/kubejs/assets/extra/sounds.json: in the tree, not in the stamp",
             lambda q: q.write(ASSETS + "extra/sounds.json", "{}"))
        case("the TATOS stand-in replaced is refused", "netherite_helmet_-_copy.png: not the file the check passed",
             lambda q: q.write(ASSETS + TATOS_PNG[len("assets/"):], png(32, 32)))
        case("an override with CRLF line ends is the same file", "OK -",
             lambda q: q.write(ASSETS + "music/sounds.json", q.read(ASSETS + "music/sounds.json").replace(b"\n", b"\r\n")), code=0)
        case("one of the pack's own jars rebuilt with other code only passes", "OK -",
             lambda q: build_jar(q.path(OWN + "own_mod-1.0.0.jar"), {"com/x/A.class": b"\xca\xfe\xba\xbe 2", "com/x/B.class": b"\xca\xfe"}), code=0)
        case("one of the pack's own jars rebuilt with a sound is refused",
             "STALE   own_mod-1.0.0.jar: one of the pack's own jars, rebuilt with other sounds.json",
             lambda q: build_jar(q.path(OWN + "own_mod-1.0.0.jar"), {"com/x/A.class": b"\xca\xfe\xba\xbe 1",
                                                                     "assets/own/sounds.json": sounds({"theme": {"sounds": ["own:theme"]}}),
                                                                     "assets/own/sounds/theme.ogg": ogg(90)}))
        case("one of the pack's own jars added is refused", "STALE   own_new-1.0.jar: in the client index, not in the stamp",
             lambda q: build_jar(q.path(OWN + "own_new-1.0.jar"), {"com/x/C.class": b"\xca\xfe"}))
        case("a model that starts using the TATOS texture fails --check and names the file and what to re-read",
             ["FAIL tatos: models-1.0.jar assets/models/models/item/helm.json now references the texture", "tatos   re-read TATOS"],
             lambda q: q.jar("models-1.0.jar", {"assets/models/models/item/helm.json":
                                                json.dumps({"textures": {"layer0": "theabyss:item/netherite_helmet_-_copy"}})}),
             args=("--check",))
        case("a Falling Leaves update that changed its atlas fails --check and says what to re-read",
             ["FAIL leaves: fallingleaves-1.20.1-2.2.0.jar %s changed" % LEAVES_JSON, "leaves  re-read Falling Leaves"],
             lambda q: (os.remove(os.path.join(q.jars, "fallingleaves-1.20.1-2.1.2.jar")),
                        q.jar("fallingleaves-1.20.1-2.2.0.jar", {LEAVES_JSON: json.dumps({"sources": [{"type": "single", "resource": "fallingleaves:leaf"}]})}, slug="fallingleaves")),
             args=("--check",))
        case("a jar of the index that is not on this PC stops the check (exit 2) and says where it looked",
             ["CANNOT", "not on this PC with the hash the index records", "music-1.0.jar"],
             lambda q: os.remove(os.path.join(q.jars, "music-1.0.jar")), args=("--check",), code=2)
        case("a jar of the same name with another hash is not taken", ["CANNOT", "music-1.0.jar"],
             lambda q: build_jar(os.path.join(q.jars, "music-1.0.jar"), {"x": "y"}), args=("--check",), code=2)
        case("no stamp: --current cannot run (exit 2) and says what writes one", ["CANNOT", "no stamp", "--check"],
             lambda q: os.remove(q.path(STAMP)), code=2)
        for label, jar, slug, ours in (("TATOS", "TATOS 1.0.5_beta.jar", "tatos", TATOS_PNG),
                                       ("Falling Leaves", "fallingleaves-1.20.1-2.1.2.jar", "fallingleaves", LEAVES_JSON)):
            q = base.copy()
            try:
                os.remove(q.path(INDEX + slug + ".pw.toml"))
                rc, out = q.tool("--write")
                check("%s removed: --check says its override can go, and fails while it is there" % label,
                      rc == 1 and ("no %s jar any more; the override %s can go" % (label, ours)) in out, out)
                os.remove(q.path(ASSETS + ours[len("assets/"):]))
                rc, out = q.tool("--check")
                rc2, out2 = q.tool("--current")
                check("%s removed: ... and passes, stamp written, once the override is gone too" % label,
                      rc == 0 and "stamp written" in out and rc2 == 0, out + out2)
            finally:
                q.close()

        q = base.copy()
        try:
            q.write(ASSETS + "music/sounds.json", "{}")
            rc, out = q.tool("--check")
            check("a failing --check leaves the stamp as it was", rc == 1 and q.read(STAMP) == base.read(STAMP), out)
        finally:
            q.close()
    finally:
        base.close()
    bad = [n for n, ok in RESULTS if not ok]
    print("")
    print("client_overrides_test: %d checks, %d failed" % (len(RESULTS), len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
