#!/usr/bin/env python
"""
run.py -- the one runner of the standing engine test suite (.minecraft/dev/engine-tests).

Every suite runs the pack's real scripts on the PRODUCTION script engine (the rhino-forge jar the
game loads), over mocks that a checker holds to the real classes. README.md in this folder says how
to add a test. Run from anywhere:

    python .minecraft/dev/engine-tests/run.py                  # every suite
    python .minecraft/dev/engine-tests/run.py fast             # the pre-push subset
    python .minecraft/dev/engine-tests/run.py ci               # what needs no mod jars (GitHub Action)
    python .minecraft/dev/engine-tests/run.py suite NAME ...   # some suites, full output
    python .minecraft/dev/engine-tests/run.py list
    python .minecraft/dev/engine-tests/run.py snapshot record [NAME ...]   # before a refactor
    python .minecraft/dev/engine-tests/run.py snapshot check  [NAME ...]   # after: any difference fails
    python .minecraft/dev/engine-tests/run.py real-engine [check|record]   # boot a real Forge server (WSL)

One line per suite, exit code 1 when any suite fails, 2 when the runner itself could not run
(no JDK, a jar missing or with the wrong hash).

Where the jars come from: the instance `mods` folder (--mods, or $ICRAFT_INSTANCE_MODS, default the
PrismLauncher instance). File names and hashes are read from the packwiz metafiles in
.minecraft/mods/.index, and a jar whose hash differs is refused. Rhino also needs gson and
commons-lang3: taken from the launcher's `libraries` folder (--libs / $ICRAFT_LIBRARIES), by pinned
sha256. With --fetch-dir DIR a jar that is not on this machine is downloaded there from the URL in
its metafile (gson / commons-lang3: Maven Central) and verified the same way.

JDK: --jdk / $ICRAFT_JDK / $JAVA_HOME / the usual install folders / PATH; 17 or newer, compiled
with --release 17.
"""
import argparse
import datetime
import difflib
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import tomllib
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEV = os.path.dirname(HERE)
MC = os.path.dirname(DEV)                       # the repo's .minecraft
OUT = os.path.join(HERE, ".out")                # build products, git-ignored
GOLDEN = os.path.join(HERE, "golden")           # local snapshots, git-ignored
TRUTH = os.path.join(HERE, "truth")
DEFAULT_MODS = os.path.join(os.environ.get("APPDATA", ""), "PrismLauncher", "instances", "IridescentCraft",
                            ".minecraft", "mods")
# Maven Central artifacts Rhino needs at run time (initStandardObjects dies without them)
LIBS = {
    "gson": ("com/google/code/gson/gson/2.10/gson-2.10.jar",
             "0cdd163ce3598a20fc04eee71b140b24f6f2a3b35f0a499dbbdd9852e83fbfaf"),
    "lang3": ("org/apache/commons/commons-lang3/3.12.0/commons-lang3-3.12.0.jar",
              "d919d904486c037f8d193412da0c92e22a9fa24230b9d67a57855c5c31c7e94e"),
}
ENGINE_JARS = ["kubejs", "rhino", "architectury-api"]   # packwiz metafile names; the real-engine boot loads these


# the file the JsonIO engine facts read: on the real server as kubejs/icraft_engine_probe.json, in the harness under the same name
JSONIO_PROBE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "real-engine", "fixtures", "jsonio_probe.json")


class RunnerError(Exception):
    """The runner could not do its job (exit 2), as opposed to a suite failing (exit 1)."""


def eprint(*a):
    print(*a, file=sys.stderr)


def digest(path, algo):
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "IridescentCraft-engine-tests"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest + ".part", "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(dest + ".part", dest)


# --------------------------------------------------------------------------------------------
# jars
# --------------------------------------------------------------------------------------------
def metafile(name, pack):
    p = os.path.join(pack, "mods", ".index", name + ".pw.toml")
    if not os.path.isfile(p):
        raise RunnerError("no packwiz metafile %s" % p)
    with open(p, "rb") as f:
        t = tomllib.load(f)
    d = t.get("download", {})
    return {"name": name, "filename": t["filename"], "hash": d.get("hash", ""), "algo": d.get("hash-format", ""),
            "url": d.get("url", "")}


class Jars:
    def __init__(self, args):
        self.pack = args.pack
        self.mods = args.mods
        self.libs = args.libs or os.path.normpath(os.path.join(self.mods, "..", "..", "..", "..", "libraries"))
        self.fetch_dir = args.fetch_dir
        self._seen = {}

    def mod(self, name):
        """Path of the jar a packwiz metafile names, hash-verified."""
        if name in self._seen:
            return self._seen[name]
        m = metafile(name, self.pack)
        path = os.path.join(self.mods, m["filename"])
        if not os.path.isfile(path) and self.fetch_dir:
            path = os.path.join(self.fetch_dir, m["filename"])
            if not os.path.isfile(path):
                if not m["url"]:
                    raise RunnerError("%s is not on this machine and its metafile has no download url" % m["filename"])
                fetch(m["url"], path)
        if not os.path.isfile(path):
            raise RunnerError("%s not found in %s (the pack index names it: is the instance out of date? "
                              "pass --mods, or --fetch-dir to download it)" % (m["filename"], self.mods))
        if m["algo"] not in ("sha512", "sha256", "sha1"):
            raise RunnerError("%s: metafile hash format %r is not one this runner can verify" % (m["filename"], m["algo"]))
        got = digest(path, m["algo"])
        if got != m["hash"]:
            raise RunnerError("%s: %s is %s..., the pack index says %s... -- not the jar the pack ships"
                              % (path, m["algo"], got[:16], m["hash"][:16]))
        self._seen[name] = path
        return path

    def lib(self, key):
        if key in self._seen:
            return self._seen[key]
        rel, want = LIBS[key]
        cands = [os.path.join(self.libs, *rel.split("/"))]
        if self.fetch_dir:
            cands.append(os.path.join(self.fetch_dir, os.path.basename(rel)))
        path = next((c for c in cands if os.path.isfile(c)), None)
        if path is None and self.fetch_dir:
            path = cands[-1]
            fetch("https://repo1.maven.org/maven2/" + rel, path)
        if path is None:
            raise RunnerError("%s not found under %s (pass --libs, or --fetch-dir to download it)"
                              % (os.path.basename(rel), self.libs))
        got = digest(path, "sha256")
        if got != want:
            raise RunnerError("%s: sha256 %s..., expected %s..." % (path, got[:16], want[:16]))
        self._seen[key] = path
        return path

    def rhino_cp(self):
        return [self.mod("rhino"), self.lib("gson"), self.lib("lang3")]


# --------------------------------------------------------------------------------------------
# JDK
# --------------------------------------------------------------------------------------------
def find_jdk(explicit):
    exe = ".exe" if os.name == "nt" else ""
    homes = []
    for h in (explicit, os.environ.get("ICRAFT_JDK"), os.environ.get("JAVA_HOME")):
        if h:
            homes.append(h)
    if os.name == "nt":
        for pat in (r"C:\Program Files\Java\jdk-17*", r"C:\Program Files\Eclipse Adoptium\jdk-17*",
                    r"C:\Program Files\Microsoft\jdk-17*", r"C:\Program Files\Zulu\zulu-17*",
                    r"C:\Program Files\Eclipse Adoptium\jdk-*", r"C:\Program Files\Java\jdk-*"):
            homes.extend(sorted(glob.glob(pat), reverse=True))
    else:
        homes.extend(sorted(glob.glob("/usr/lib/jvm/*17*"), reverse=True))
    javac_on_path = shutil.which("javac")
    if javac_on_path:
        homes.append(os.path.dirname(os.path.dirname(os.path.realpath(javac_on_path))))
    tried = []
    best = None
    for h in homes:
        javac = os.path.join(h, "bin", "javac" + exe)
        java = os.path.join(h, "bin", "java" + exe)
        if not (os.path.isfile(javac) and os.path.isfile(java)):
            continue
        try:
            v = subprocess.run([javac, "-version"], capture_output=True, text=True, timeout=60)
        except OSError:
            continue
        m = re.search(r"javac (\d+)", v.stdout + v.stderr)
        major = int(m.group(1)) if m else 0
        tried.append("%s (javac %s)" % (h, major))
        if major == 17:
            return {"home": h, "javac": javac, "java": java, "major": major}
        if major > 17 and best is None:
            best = {"home": h, "javac": javac, "java": java, "major": major}
    if best:
        return best
    raise RunnerError("no JDK 17 or newer found (tried: %s). Pass --jdk <JDK home> or set ICRAFT_JDK."
                      % ("; ".join(tried) or "nothing"))


def compile_java(jdk, sources, cp, outdir, key_extra=""):
    """javac into outdir when a source (or the class path) changed since the last build."""
    h = hashlib.sha256()
    for s in sorted(sources):
        h.update(s.encode())
        with open(s, "rb") as f:
            h.update(f.read())
    h.update(("|".join(cp) + "|" + str(jdk["major"]) + "|" + key_extra).encode())
    key = h.hexdigest()
    keyfile = os.path.join(outdir, ".build-key")
    if os.path.isfile(keyfile) and open(keyfile).read().strip() == key:
        return
    shutil.rmtree(outdir, ignore_errors=True)
    os.makedirs(outdir)
    cmd = [jdk["javac"], "-nowarn", "-Xlint:-unchecked", "-encoding", "UTF-8", "--release", "17",
           "-cp", os.pathsep.join(cp), "-d", outdir] + sources
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RunnerError("javac failed:\n" + (r.stdout + r.stderr)[-6000:])
    with open(keyfile, "w") as f:
        f.write(key)


# --------------------------------------------------------------------------------------------
# suites
# --------------------------------------------------------------------------------------------
def load_suites():
    with open(os.path.join(HERE, "suites.json"), encoding="utf-8") as f:
        return json.load(f)["suites"]


def js_path(p):
    """A path that can sit inside a generated .js string: forward slashes, drive letter kept."""
    return os.path.abspath(p).replace("\\", "/")


class Ctx:
    def __init__(self, args):
        self.args = args
        self.pack = args.pack
        self.jars = Jars(args)
        self._jdk = None
        self._built = False

    @property
    def jdk(self):
        if self._jdk is None:
            self._jdk = find_jdk(self.args.jdk)
        return self._jdk

    def harness_cp(self):
        cp = self.jars.rhino_cp()
        classes = os.path.join(OUT, "classes")
        if not self._built:
            srcs = sorted(glob.glob(os.path.join(HERE, "harness", "**", "*.java"), recursive=True))
            compile_java(self.jdk, srcs, cp, classes)
            self._built = True
        return [classes] + cp

    def resolve(self, entry):
        """'server:x.js' -> the pack's kubejs/server_scripts/x.js; anything else is relative to this folder."""
        for kind in ("server", "startup", "client"):
            if entry.startswith(kind + ":"):
                return os.path.join(self.pack, "kubejs", kind + "_scripts", *entry[len(kind) + 1:].split("/"))
        return os.path.join(HERE, *entry.split("/"))

    def truth_file(self):
        return os.path.join(TRUTH, "engine-members.json")


def expand(ctx, suite, snap):
    """The H command line of a harness suite: files per scope, generated files under .out/gen."""
    gen = os.path.join(OUT, "gen", suite["name"])
    shutil.rmtree(gen, ignore_errors=True)
    os.makedirs(gen)
    n = [0]

    def write(text, label):
        n[0] += 1
        p = os.path.join(gen, "%02d_%s.js" % (n[0], label))
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        return p

    def patched(spec):
        src = ctx.resolve(spec["patch"])
        with open(src, encoding="utf-8") as f:
            text = f.read()
        if text.count(spec["find"]) != 1:
            raise RunnerError("suite %s: %r occurs %d times in %s (the patch needs exactly one)"
                              % (suite["name"], spec["find"], text.count(spec["find"]), spec["patch"]))
        p = os.path.join(gen, os.path.basename(src))
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text.replace(spec["find"], spec["replace"]))
        return p

    def one(entry):
        if isinstance(entry, str):
            p = ctx.resolve(entry)
            if not os.path.isfile(p):
                raise RunnerError("suite %s: %s does not exist (%s). A script was moved or renamed: fix the "
                                  "suite's load list in suites.json." % (suite["name"], entry, p))
            return p
        if "patch" in entry:
            return patched(entry)
        raise RunnerError("suite %s: cannot use %r here" % (suite["name"], entry))

    # --pack-root: where a script's JsonIO.readString('kubejs/...') finds its file (the pack under test);
    # --probe-json: the one file the JsonIO engine facts read (real-engine/fixtures)
    argv = ["--truth", ctx.truth_file(), "--facts", os.path.join(TRUTH, "engine-facts.txt"),
            "--pack-root", ctx.pack, "--probe-json", JSONIO_PROBE]
    if snap:
        argv += ["--snap", snap]
    for i, scope in enumerate(suite["scopes"]):
        if i:
            argv.append("--")
        for entry in scope:
            if isinstance(entry, dict) and "load" in entry:
                # through T_loadAll: a script that fails to load is recorded, and the tests assert on it
                paths = [js_path(one(e)) for e in entry["load"]]
                argv.append(write("T_loadAll(%s)\n" % json.dumps(paths), "load"))
            elif isinstance(entry, dict) and "gen" in entry:
                if entry["gen"] not in GENERATED:
                    raise RunnerError("suite %s: no generator %r" % (suite["name"], entry["gen"]))
                argv.append(write(GENERATED[entry["gen"]](ctx), "gen"))
            elif isinstance(entry, dict) and "js" in entry:
                text = re.sub(r"\$\{([^}]+)\}", lambda m: js_path(one(m.group(1))), entry["js"])
                argv.append(write(text + "\n", "inline"))
            else:
                argv.append(one(entry))
    return argv


def rosters_module():
    """dev/rosters/rosters.py: the registries of the pack as data (the one statement of what a system gets)"""
    d = os.path.join(DEV, "rosters")
    if d not in sys.path:
        sys.path.insert(0, d)
    import rosters
    return rosters


def gen_registry_expect(ctx):
    """`var T_REG = {...}`: what rosters.py says every system gets from the registry files of the pack under test."""
    rosters = rosters_module()
    try:
        reg = rosters.load(ctx.pack)
    except rosters.RegistryError as e:
        raise RunnerError("the registries of %s cannot be read: %s" % (ctx.pack, e))

    def cells(entries, systems, cell):
        return dict((s, [[i, cell(e, s)] for i, e in entries.items() if cell(e, s) is not None]) for s in systems)

    boss_ids = list(reg.bosses)
    dim_ids = list(reg.dims)
    a_boss = [i for i in boss_ids if rosters.boss_cell(reg.bosses[i], "isBoss") and reg.bosses[i].get("flags") and "tier" in reg.bosses[i]]
    doc = {
        "readerPath": js_path(ctx.resolve("server:0_lib_registry.js")),
        "bootLine": rosters.boot_line(reg),
        "bossSystems": list(rosters.BOSS_SYSTEMS), "dimSystems": list(rosters.DIM_SYSTEMS),
        "bossIds": boss_ids, "dimIds": dim_ids,
        "bossCells": cells(reg.bosses, rosters.BOSS_SYSTEMS, rosters.boss_cell),
        "dimCells": cells(reg.dims, rosters.DIM_SYSTEMS, rosters.dim_cell),
        "bossTier": dict((i, reg.bosses[i].get("tier", 0)) for i in boss_ids),
        "bossKind": dict((i, reg.bosses[i].get("kind")) for i in boss_ids),
        "dimTier": dict((i, reg.dims[i].get("tier", 0)) for i in dim_ids),
        "arenas": [[k, v] for k, v in reg.arenas().items()],
        "perKill": reg.switch_on("perKill"),
        # second ids (`sameAs`): [id, the boss it is], and for each boss that has one [boss id, its entity ids]
        "aliases": [[a, t] for a, t in reg.aliases.items()],
        "entityIds": [[t, reg.entity_ids(t)] for t in sorted(set(reg.aliases.values()))],
        "aBoss": a_boss[0] if a_boss else "", "aDim": dim_ids[1] if len(dim_ids) > 1 else "",
    }
    return "var T_REG = " + json.dumps(doc, ensure_ascii=False) + "\n"


GENERATED = {"registry-expect": gen_registry_expect}


def run_rosters(ctx, suite, snap=None):
    """dev/rosters/validate.py: the registry files against the game's real registries, and their own consistency."""
    cmd = [sys.executable, "-I", "-B", os.path.join(DEV, "rosters", "validate.py"), "--pack", ctx.pack]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    last = [l for l in out.strip().splitlines() if l.startswith("[rosters] ")]
    note = last[-1][len("[rosters] "):].strip() if last else "no [rosters] line (exit %d)" % r.returncode
    return r.returncode == 0, note, out


def run_overloads(ctx, suite, snap=None):
    """overload_calls.py: no script calls a Java method with a value that fits two of its overloads (the call throws)."""
    cmd = [sys.executable, "-I", "-B", os.path.join(HERE, "overload_calls.py")]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    last = [l for l in out.strip().splitlines() if l.startswith("[overload-calls] ")]
    note = last[-1][len("[overload-calls] "):].strip() if last else "no [overload-calls] line (exit %d)" % r.returncode
    return r.returncode == 0, note, out


def run_liveness(ctx, suite, snap=None):
    """dev/loud/gen_liveness.js --check: the committed liveness manifest and the game's expected list are what
    the scripts register, name and report today."""
    node = shutil.which("node")
    if node is None:
        raise RunnerError("node is not on PATH (the liveness generator needs it, like the script lints)")
    cmd = [node, "--expose-internals", os.path.join(DEV, "loud", "gen_liveness.js"), "--check", "--pack", ctx.pack]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    if r.returncode == 2:
        raise RunnerError(out.strip() or "gen_liveness.js could not run")
    last = [l for l in out.strip().splitlines() if l.startswith("[gen-liveness] ")]
    note = last[0][len("[gen-liveness] "):].strip() if last else "no [gen-liveness] line (exit %d)" % r.returncode
    if len(note) > 150:
        note = note[:147] + "..."
    return r.returncode == 0, note, out


def run_node(ctx, suite, snap=None):
    """A dev tool written for node, run as its own suite: `script` (below .minecraft/dev) with `args`, and
    `--pack <the pack under test>` when the suite says "pack": true. Exit 0 passes, 2 means it could not run.
    The note is the tool's last line that starts with `tag` (or with RESULT:)."""
    node = shutil.which("node")
    if node is None:
        raise RunnerError("node is not on PATH (the catalogue tools need it, like the script lints)")
    cmd = [node, "--expose-internals", os.path.join(DEV, *suite["script"].split("/"))] + list(suite.get("args", []))
    if suite.get("pack"):
        cmd += ["--pack", ctx.pack]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    if r.returncode == 2:
        raise RunnerError(out.strip() or "%s could not run" % suite["script"])
    tag = suite.get("tag", "RESULT:")
    last = [l for l in out.strip().splitlines() if l.startswith(tag)]
    note = last[-1][len(tag):].strip() if last else "no `%s` line (exit %d)" % (tag, r.returncode)
    if len(note) > 150:
        note = note[:147] + "..."
    return r.returncode == 0, note, out


RESULT_RE = re.compile(r"^RESULT: (\d+) passed, (\d+) failed(.*)$", re.M)


def run_harness(ctx, suite, snap=None):
    cp = ctx.harness_cp()
    cmd = [ctx.jdk["java"], "-Dfile.encoding=UTF-8", "-cp", os.pathsep.join(cp), "H"] + expand(ctx, suite, snap)
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    m = None
    for m in RESULT_RE.finditer(out):
        pass
    if m is None:
        return False, "no RESULT line (exit %d)" % r.returncode, out
    passed, failed, rest = int(m.group(1)), int(m.group(2)), m.group(3)
    extra = [(int(a), b) for a, b in re.findall(r"(\d+) ([a-z][a-z -]*[a-z])", rest)]
    bad = [("%d %s" % e) for e in extra if e[0]]
    want = suite.get("expect")
    ok = r.returncode == 0 and failed == 0 and not bad
    note = "%d checks" % passed
    if failed:
        note += ", %d FAILED" % failed
    if bad:
        note += ", " + ", ".join(bad)
    if r.returncode != 0 and failed == 0 and not bad:
        note += ", exit %d" % r.returncode
    if ok and want is not None and passed != want:
        ok = False
        note += " (expected %d: a check was added or stopped running; update `expect` in suites.json " \
                "only if that is intended)" % want
    return ok, note, out


def run_members(ctx, suite, snap=None):
    cp = ctx.harness_cp()
    extra = os.path.join(OUT, "jar-members.json")
    jar_members(ctx, extra)
    cmd = [ctx.jdk["java"], "-Dfile.encoding=UTF-8", "-cp", os.pathsep.join(cp), "MemberCheck",
           ctx.truth_file(), extra, os.path.join(HERE, "harness", "mock-map.json")]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    m = re.search(r"^RESULT: (.*)$", out, re.M)
    ok, note = r.returncode == 0, (m.group(1) if m else "no RESULT line (exit %d)" % r.returncode)
    # The checker's own test: harness/mk/Bad.java holds deliberately dishonest mocks (the mock that hid
    # inv.size, an un-renamed getGameTime, a Vec3 with plain fields, ...). Each must be reported.
    selfmap = os.path.join(HERE, "harness", "selftest-map.json")
    with open(selfmap, encoding="utf-8") as f:
        want = sorted(json.load(f)["expect"])
    r2 = subprocess.run(cmd[:-1] + [selfmap], capture_output=True, text=True, encoding="utf-8", errors="replace")
    got = sorted(re.findall(r"^  FAIL  ([^:]+): ", r2.stdout, re.M))
    if r2.returncode != 1 or got != want:
        ok = False
        note += "; SELF-TEST FAILED: the checker missed a planted defect"
        sep = chr(10) + "  "
        out += chr(10).join(["", "self-test (harness/mk/Bad.java): expected exactly these to be reported:", "  " + sep.join(want),
                             "reported:", "  " + sep.join(got), r2.stdout[-1500:] + r2.stderr[-1500:]])
    else:
        note += "; self-test: %d planted defects all caught" % len(want)
    return ok, note, out


def jar_members(ctx, dest):
    """Public members of the MOD classes a mock stands in for, read from the jar with javap.

    These classes are not in the bare real-engine boot (truth/engine-members.json), so this is the
    weaker check: the jar's own declared names (a mod's own members are not remapped), with bean
    names derived the way Rhino derives them. Superclasses are followed inside the jar, then in the
    engine tables. A jar that is not on this machine leaves its classes unverified, and MemberCheck
    says so.
    """
    with open(os.path.join(HERE, "harness", "mock-map.json"), encoding="utf-8") as f:
        mm = json.load(f)
    with open(ctx.truth_file(), encoding="utf-8") as f:
        engine = json.load(f)["classes"]
    javap = os.path.join(ctx.jdk["home"], "bin", "javap" + (".exe" if os.name == "nt" else ""))
    # javap costs seconds; its answer changes only with the jars, the map or the engine tables
    stamp = [digest(os.path.join(HERE, "harness", "mock-map.json"), "sha256"), digest(ctx.truth_file(), "sha256")]
    for pattern in sorted(set(spec["jar"] for spec in mm["mocks"].values() if "jar" in spec)):
        for folder in (ctx.jars.mods, os.path.join(ctx.pack, "mods")):
            for hit in sorted(glob.glob(os.path.join(folder, pattern))):
                st = os.stat(hit)
                stamp.append("%s|%d|%d" % (hit, st.st_size, st.st_mtime_ns))
    stamp = hashlib.sha256("|".join(stamp).encode()).hexdigest()
    if os.path.isfile(dest):
        try:
            with open(dest, encoding="utf-8") as f:
                if json.load(f).get("stamp") == stamp:
                    return
        except ValueError:
            pass
    result = {"stamp": stamp, "classes": {}, "missing": {}}

    def nogen(s):
        prev = None
        while prev != s:
            prev, s = s, re.sub(r"<[^<>]*>", "", s)
        return s

    def read(jar, cls):
        r = subprocess.run([javap, "-public", "-cp", jar, cls], capture_output=True, text=True)
        if r.returncode != 0:
            return None
        methods, fields, supers = [], [], []
        simple = cls.split(".")[-1]
        for line in r.stdout.splitlines():
            line = nogen(line.strip().rstrip(";"))
            if not line or line.startswith("Compiled from") or line == "}":
                continue
            if line.endswith("{"):
                m = re.search(r" extends ([\w.$, ]+?)(?: implements| \{)", line)
                if m:
                    supers += [x.strip() for x in m.group(1).split(",")]
                m = re.search(r" implements ([\w.$, ]+?) \{", line)
                if m:
                    supers += [x.strip() for x in m.group(1).split(",")]
                continue
            static = " static " in (" " + line.split("(")[0] + " ")
            if "(" in line:
                head, _, tail = line.partition("(")
                name = head.split(" ")[-1]
                if "." in name or name == simple:
                    continue                    # a constructor
                params = [p for p in tail.rsplit(")", 1)[0].split(",") if p.strip()]
                methods.append((static, name, [p.strip().split(".")[-1] for p in params]))
            else:
                fields.append((static, line.split(" ")[-1]))
        return methods, fields, supers

    for mock, spec in sorted(mm["mocks"].items()):
        if "jar" not in spec:
            continue
        jar = None
        for folder in (ctx.jars.mods, os.path.join(ctx.pack, "mods")):
            hits = sorted(glob.glob(os.path.join(folder, spec["jar"])))
            if hits:
                jar = hits[-1]
                break
        for real in spec["real"]:
            if real in engine or real in result["classes"]:
                continue
            if jar is None:
                result["missing"][real] = "no jar matching %s in the instance or the repo" % spec["jar"]
                continue
            methods, fields, inherited = [], [], []
            queue, done = [real], set()
            while queue:
                c = queue.pop(0)
                if c in done or c == "java.lang.Object":
                    continue
                done.add(c)
                got = read(jar, c)
                if got is None:
                    if c == real:
                        break
                    if c in engine:         # e.g. a Forge event class: its members as the engine has them
                        inherited.append(engine[c])
                    continue
                methods += got[0]
                fields += got[1]
                queue += got[2]
            if real not in done or (not methods and not fields and not inherited):
                result["missing"][real] = "javap could not read it from %s" % os.path.basename(jar)
                continue
            ids, sids = set(), set()
            for static, name in fields:
                (sids if static else ids).add(name)
            for static, name, params in methods:
                (sids if static else ids).add(name)
            for static, name, params in methods:       # bean names, by Rhino's rule
                # (this Rhino build makes a bean name from ANY get* / is* / set* method, whatever its arguments:
                # the engine tables list `stackInSlot` for getStackInSlot(int))
                bm = re.match(r"^(get|is|set)(.+)$", name)
                if not bm:
                    continue
                comp = bm.group(2)
                if not comp[0].isupper():
                    continue
                if len(comp) == 1 or not comp[1].isupper():
                    comp = comp[0].lower() + comp[1:]
                (sids if static else ids).add(comp)
            entry = {"ids": sorted(ids), "sids": sorted(sids),
                     "methods": sorted(set(("!" if s else "") + "%s(%s)" % (n, ",".join(p)) for s, n, p in methods)),
                     "fields": sorted(set(("!" if s else "") + n for s, n in fields))}
            for e in inherited:
                for k in entry:
                    entry[k] = sorted(set(entry[k]) | set(e[k].split()))
            result["classes"][real] = {k: " ".join(v) for k, v in entry.items()}
            result["classes"][real]["via"] = "javap " + os.path.basename(jar)
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(result, f, indent=1, sort_keys=True)


def run_parse(ctx, suite, snap=None):
    rhino = ctx.jars.mod("rhino")
    classes = os.path.join(OUT, "parse-classes")
    compile_java(ctx.jdk, [os.path.join(DEV, "rhino_parse", "ParseAll.java")], [rhino], classes)
    dirs = [os.path.join(ctx.pack, "kubejs", k + "_scripts") for k in ("server", "startup", "client")]
    r = subprocess.run([ctx.jdk["java"], "-Dfile.encoding=UTF-8", "-cp", os.pathsep.join([rhino, classes]), "ParseAll"] + dirs,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = r.stdout + r.stderr
    last = [l for l in out.strip().splitlines() if l.strip()]
    return r.returncode == 0, (last[-1].strip() if last else "no output"), out


def run_loot(ctx, suite, snap=None):
    # audit_loot.py compiles and runs LootHarness with the javac / java on PATH and keeps its own class cache,
    # so it gets the PATH as it is; only when no JDK is on PATH at all does it get the one this runner found.
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    if not shutil.which("javac"):
        env["PATH"] = os.path.join(ctx.jdk["home"], "bin") + os.pathsep + env.get("PATH", "")
    cmd = [sys.executable, "-I", "-B", os.path.join(DEV, "audit_loot.py"), "--summary", "--mods", ctx.jars.mods, "--repo", ctx.pack]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    out = r.stdout + r.stderr
    m = re.search(r"^\[loot-audit\] (.*)$", out, re.M)
    hm = re.search(r"LootJS\.modifiers handlers\s+(.*)$", out, re.M)
    mm = re.search(r"modifiers registered\s+(\d+)", out)
    note = (m.group(1) if m else "no [loot-audit] line (exit %d)" % r.returncode)
    if hm and mm:
        note = "%s handlers, %s modifiers; %s" % (hm.group(1).strip(), mm.group(1), note)
    if snap and r.returncode in (0, 1):
        loot_snapshot(snap)
    return r.returncode == 0, note, out


def loot_snapshot(dest):
    """What the loot scripts registered, in order, without line numbers (so that moving code keeps it equal)."""
    with open(os.path.join(DEV, "loot_audit", ".cache", "harness.json"), encoding="utf-8") as f:
        h = json.load(f)

    def canon(o):
        if isinstance(o, dict):
            return {k: canon(v) for k, v in sorted(o.items()) if k != "line"}
        if isinstance(o, list):
            return [canon(v) for v in o]
        if isinstance(o, str):
            return re.sub(r"(\.js):\d+", r"\1", o)
        return o

    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        f.write("# loot harness: handlers, modifiers, filters and recorded recipe calls, in registration order\n")
        for key in ("files", "handlers", "modifiers", "filters", "captured_handlers", "recorded_calls", "other_events", "console"):
            for row in h.get(key) or []:
                f.write("%s %s\n" % (key, json.dumps(canon(row), sort_keys=True, ensure_ascii=True)))
        for key in ("script_errors", "event_aborted_at_handler", "no_actions_at_modifier", "filter_eval", "globals"):
            f.write("%s %s\n" % (key, json.dumps(canon(h.get(key)), sort_keys=True, ensure_ascii=True)))


def run_known_false(ctx, suite, snap=None):
    """truth/known-false.json against what was recorded from the real engine: a listed name the engine HAS is a failure."""
    with open(ctx.truth_file(), encoding="utf-8") as f:
        truth = json.load(f)
    with open(os.path.join(TRUTH, "known-false.json"), encoding="utf-8") as f:
        kf = json.load(f)
    facts = {}
    with open(os.path.join(TRUTH, "engine-facts.txt"), encoding="utf-8") as f:
        for line in f:
            if " :: " in line and not line.startswith("#"):
                k, _, v = line.rstrip("\n").partition(" :: ")
                facts[k] = v
    out, bad, verified, readonly = [], 0, 0, 0
    for e in kf["entries"]:
        label = ("%s.%s" % (e["type"].split(".")[-1], e["member"])) if "type" in e else e["member"]
        if e["status"] != "verified-on-engine":
            readonly += 1
            out.append("  read-only  %-46s %s" % (label, e["instead"]))
            continue
        kind = e["is"]
        if kind == "fact":
            got = facts.get(e["fact"])
            good = got == e["answer"]
            why = "the engine answered %r to %r (the list says %r)" % (got, e["fact"], e["answer"])
        else:
            c = truth["classes"].get(e["type"])
            if c is None:
                bad += 1
                out.append("  FAIL       %-46s %s is not in truth/engine-members.json (add it to truth/classes.txt)" % (label, e["type"]))
                continue
            ids = set(c["ids"].split()) | set(c["sids"].split())
            sigs = [m.lstrip("!") for m in c["methods"].split()]
            methods = set(s.split("(")[0] for s in sigs)
            arities = set(0 if s.endswith("()") else s.count(",") + 1 for s in sigs if s.split("(")[0] == e["member"])
            if kind == "absent":
                good, why = e["member"] not in ids, "the engine HAS it now"
            elif kind == "function":        # there, but as a method: a bare read is a function
                good, why = e["member"] in methods, "it is not a method on the engine (any more)"
            elif kind == "property":        # there, but not callable
                good, why = e["member"] in ids and e["member"] not in methods, "it is not a plain property on the engine (any more)"
            elif kind == "no-overload":
                good, why = e["member"] in methods and e["args"] not in arities, \
                    "the engine has overloads with %s arguments" % sorted(arities)
            elif kind == "no-signature":
                good, why = e["member"] in methods and e["signature"] not in sigs, "the engine HAS %s now" % e["signature"]
            else:
                good, why = False, "unknown `is` value %r" % kind
            lacking = [x for x in e.get("real", []) if x not in ids]
            if good and lacking:
                good, why = False, "the replacement %s is not on the engine" % ", ".join(lacking)
        if good:
            verified += 1
            out.append("  ok         %-46s %s" % (label, e["instead"]))
        else:
            bad += 1
            out.append("  FAIL       %-46s %s" % (label, why))
    note = "%d names verified against the engine's tables, %d read-only" % (verified, readonly)
    if bad:
        note += ", %d WRONG" % bad
    return bad == 0, note, "\n".join(out) + "\n"


def run_truth_fresh(ctx, suite, snap=None):
    """The member tables were recorded from exactly the engine jars the pack index names today."""
    with open(ctx.truth_file(), encoding="utf-8") as f:
        rec = json.load(f)["recorded"]
    out, bad = [], 0
    for name in ENGINE_JARS:
        m = metafile(name, ctx.pack)
        was = rec["jars"].get(name, {})
        same = was.get("filename") == m["filename"] and was.get("hash") == m["hash"]
        out.append("  %-18s %s %s" % (name, m["filename"], "same as recorded" if same else
                                      "CHANGED (recorded: %s)" % was.get("filename")))
        bad += 0 if same else 1
    facts = os.path.join(TRUTH, "engine-facts.txt")
    if not os.path.isfile(facts):
        bad += 1
        out.append("  truth/engine-facts.txt is missing")
    note = "recorded %s on Forge %s" % (rec["date"], rec["forge"])
    if bad:
        note = "STALE: an engine jar changed since the tables were recorded -- run `run.py real-engine record` " \
               "(a real server boot) and review the diff"
    return bad == 0, note, "\n".join(out) + "\n"


def run_guard(ctx, suite, snap=None):
    """kubejs/*_scripts/00_icraft_guard.js on KubeJS's real handler chain (guard/GuardChain.java).

    Not the mk.* harness: this one has the KubeJS and Architectury jars on its class path, so EventJS.cancel()
    throws the real EventExit and EventHandlerContainer.handle() is the loop the game runs. Three runs: the
    guard as shipped, the guard without the class its rethrow needs (it must switch itself off and say so),
    and the guard with its PASS_THROUGH switch set."""
    scripts = [os.path.join(ctx.pack, "kubejs", k + "_scripts", "00_icraft_guard.js") for k in ("server", "startup", "client")]
    out = []
    bad = 0
    missing = [p for p in scripts if not os.path.isfile(p)]
    if missing:
        return False, "the guard file is missing: " + ", ".join(os.path.relpath(p, ctx.pack) for p in missing), ""
    digests = {digest(p, "sha256") for p in scripts}
    if len(digests) != 1:
        bad += 1
        out.append("  FAIL  the server / startup / client copies of 00_icraft_guard.js differ: it is ONE file in three places")
    else:
        out.append("  ok    the server / startup / client copies of 00_icraft_guard.js are one file")
    cp = ctx.jars.rhino_cp() + [ctx.jars.mod("kubejs"), ctx.jars.mod("architectury-api")]
    classes = os.path.join(OUT, "guard-classes")
    compile_java(ctx.jdk, [os.path.join(HERE, "guard", "GuardChain.java")], cp, classes)
    runs = [("as shipped", [], "cases.js"),
            ("without java.util.Optional", ["--deny", "java.util.Optional"], "cases_off.js"),
            ("PASS_THROUGH set", ["--pass-through"], "cases_off.js")]
    passed = 1 - bad
    for label, flags, cases in runs:
        cmd = [ctx.jdk["java"], "-Dfile.encoding=UTF-8", "-cp", os.pathsep.join([classes] + cp), "GuardChain"] + flags + \
              [scripts[0], os.path.join(HERE, "guard", cases)]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        text = r.stdout + r.stderr
        out.append("-- the guard " + label)
        out.append(text.rstrip())
        m = re.search(r"RESULT: (\d+) passed, (\d+) failed", text)
        if m is None:
            bad += 1
            out.append("  FAIL  no RESULT line (exit %d)" % r.returncode)
            continue
        passed += int(m.group(1))
        bad += int(m.group(2))
        if r.returncode != 0 and int(m.group(2)) == 0:
            bad += 1
            out.append("  FAIL  exit %d with no failed check" % r.returncode)
    note = "%d checks" % passed
    if bad:
        note += ", %d FAILED" % bad
    ok = bad == 0
    want = suite.get("expect")
    if ok and want is not None and passed != want:
        ok = False
        note += " (expected %d: a check was added or stopped running; update `expect` in suites.json " \
                "only if that is intended)" % want
    if snap is not None:
        for line in "\n".join(out).splitlines():
            if line.startswith("  ok") or line.startswith("  FAIL") or line.startswith("--"):
                snap.write(line.rstrip() + "\n")
    return ok, note, "\n".join(out) + "\n"


KINDS = {"harness": run_harness, "members": run_members, "parse": run_parse, "loot": run_loot,
         "known-false": run_known_false, "truth-fresh": run_truth_fresh, "guard": run_guard, "rosters": run_rosters,
         "liveness": run_liveness, "overloads": run_overloads, "node": run_node}


def run_suites(ctx, suites, verbose):
    failed = 0
    t_all = time.time()
    for s in suites:
        t0 = time.time()
        try:
            ok, note, out = KINDS[s["kind"]](ctx, s)
        except RunnerError as e:
            ok, note, out = None, "COULD NOT RUN: %s" % e, ""
        dt = time.time() - t0
        tag = "PASS" if ok else ("FAIL" if ok is False else "ERROR")
        pending = s.get("pending")
        if pending and ok is False:
            # a test written before its fix landed: reported on every run, never counted as a failure
            print("%-5s %-20s %6.1f s  %s -- EXPECTED TO FAIL: %s" % ("PEND", s["name"], dt, note, pending))
            sys.stdout.flush()
            continue
        if pending and ok:
            note += " -- it passes now: delete the `pending` line of this suite in suites.json"
        print("%-5s %-20s %6.1f s  %s" % (tag, s["name"], dt, note))
        if (not ok or verbose) and out.strip():
            lines = out.rstrip().splitlines()
            shown = lines if verbose else [l for l in lines if re.search(r"FAIL|THREW|UNCAUGHT|!!|Exception|Error|WRONG|CHANGED", l)][-60:] or lines[-40:]
            for l in shown:
                print("      " + l)
        if not ok:
            failed += 1
        sys.stdout.flush()
    print("%d suite(s), %d failed, %.1f s" % (len(suites), failed, time.time() - t_all))
    return failed


# --------------------------------------------------------------------------------------------
# golden snapshots
# --------------------------------------------------------------------------------------------
def snapshot(ctx, mode, names):
    suites = [s for s in load_suites() if s.get("snapshot")]
    if names:
        known = {s["name"] for s in suites}
        for n in names:
            if n not in known:
                raise RunnerError("no snapshot-capable suite named %r (have: %s)" % (n, ", ".join(sorted(known))))
        suites = [s for s in suites if s["name"] in names]
    os.makedirs(GOLDEN, exist_ok=True)
    failed = 0
    for s in suites:
        golden = os.path.join(GOLDEN, s["name"] + ".txt")
        fresh = os.path.join(OUT, "snap-" + s["name"] + ".txt")
        os.makedirs(OUT, exist_ok=True)
        if os.path.exists(fresh):
            os.remove(fresh)
        t0 = time.time()
        try:
            ok, note, out = KINDS[s["kind"]](ctx, s, snap=fresh)
        except RunnerError as e:
            print("ERROR %-20s COULD NOT RUN: %s" % (s["name"], e))
            failed += 1
            continue
        if not os.path.isfile(fresh):
            print("ERROR %-20s the suite wrote no snapshot (%s)" % (s["name"], note))
            failed += 1
            continue
        with open(fresh, encoding="utf-8") as f:
            new = f.read().splitlines()
        if mode == "record":
            shutil.copyfile(fresh, golden)
            print("RECORDED %-20s %5d lines, sha256 %s  (suite: %s%s)" % (
                s["name"], len(new), digest(golden, "sha256")[:12], note, "" if ok else "; THE SUITE ITSELF FAILED"))
            continue
        if not os.path.isfile(golden):
            print("ERROR %-20s no snapshot recorded yet: run `run.py snapshot record %s` on the tree to compare against"
                  % (s["name"], s["name"]))
            failed += 1
            continue
        with open(golden, encoding="utf-8") as f:
            old = f.read().splitlines()
        if old == new:
            print("SAME  %-20s %5d lines identical  %5.1f s" % (s["name"], len(new), time.time() - t0))
        else:
            failed += 1
            diff = list(difflib.unified_diff(old, new, "recorded", "now", lineterm="", n=1))
            print("DIFF  %-20s %d changed lines (recorded %d, now %d)" % (
                s["name"], sum(1 for d in diff if d[:1] in "+-" and d[:3] not in ("+++", "---")), len(old), len(new)))
            for d in diff[:80]:
                print("      " + d[:400])
            if len(diff) > 80:
                print("      ... %d more diff lines; full files: %s and %s" % (len(diff) - 80, golden, fresh))
    return failed


# --------------------------------------------------------------------------------------------
# the real engine
# --------------------------------------------------------------------------------------------
def wsl_path(p):
    p = os.path.abspath(p)
    if os.name != "nt":
        return p
    return "/mnt/" + p[0].lower() + p[2:].replace("\\", "/")


def real_engine(ctx, mode, forge_server, port):
    """Boot a real Forge server with the pack's KubeJS / Rhino / Architectury jars and read the engine itself."""
    jars = [ctx.jars.mod(n) for n in ENGINE_JARS]       # hash-verified against the pack index
    work = os.path.join(OUT, "real-engine")
    shutil.rmtree(work, ignore_errors=True)
    probe = os.path.join(work, "probe")
    os.makedirs(probe)
    for f in glob.glob(os.path.join(HERE, "real-engine", "*.js")):
        shutil.copy(f, probe)
    shutil.copy(JSONIO_PROBE, os.path.join(probe, "jsonio_probe.json"))
    os.makedirs(os.path.join(probe, "startup"))
    for f in glob.glob(os.path.join(HERE, "real-engine", "startup", "*.js")):
        shutil.copy(f, os.path.join(probe, "startup"))
    with open(os.path.join(TRUTH, "classes.txt"), encoding="utf-8") as f:
        classes = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    with open(os.path.join(probe, "0_engine_probe_classes.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("var ENGINE_PROBE_CLASSES = %s\n" % json.dumps(classes))
    sh = os.path.join(HERE, "real-engine", "run_real_engine.sh")
    argv = [wsl_path(probe), wsl_path(os.path.join(work, "out")), wsl_path(os.path.dirname(jars[0])), forge_server, str(port)]
    argv += [os.path.basename(j) for j in jars]
    if os.name == "nt":
        quoted = " ".join("'%s'" % a for a in [wsl_path(sh)] + argv)
        cmd = ["wsl", "-e", "bash", "-lc", "bash " + quoted]
    else:
        cmd = ["bash", sh] + argv
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    info = dict(l.split("=", 1) for l in r.stdout.splitlines() if re.match(r"^[a-z_]+=", l))
    if r.returncode != 0:
        raise RunnerError("the real-engine boot failed (exit %d):\n%s" % (r.returncode, (r.stdout + r.stderr)[-3000:]))
    print("booted a real Forge %s server: %s; %s; JVM exit %s, %s crash reports, %s script errors; %.0f s"
          % (info.get("forge"), info.get("booted"), info.get("java"), info.get("jvm_exit"), info.get("crash_reports"),
             info.get("script_errors"), time.time() - t0))
    if info.get("jvm_exit") != "0" or info.get("crash_reports") != "0" or info.get("script_errors") != "0":
        raise RunnerError("the boot was not clean; see %s" % os.path.join(work, "out"))

    facts, events, bindings, xcheck, missing = [], {}, {}, {}, []
    tables = {}
    with open(os.path.join(work, "out", "kubejs-server.log"), encoding="utf-8", errors="replace") as f:
        for line in f:
            i = line.find("[engine-probe] ")
            if i < 0:
                continue
            body = line[i + len("[engine-probe] "):].rstrip("\r\n")
            kind, _, rest = body.partition(" ")
            if kind == "FACT":
                facts.append(rest)
            elif kind == "EVENT":
                name, _, cls = rest.partition(" ")
                events[name] = cls
            elif kind == "BINDING":
                name, _, desc = rest.partition(" ")
                m = re.search(r"\[JavaClass ([\w.$]+)\]", desc)
                bindings[name] = m.group(1) if m else re.sub(r"@#$", "", desc)
            elif kind == "CLASS":
                tables[rest] = {"ids": [], "sids": [], "methods": [], "fields": []}
            elif kind in ("IDS", "SIDS", "METHODS", "FIELDS"):
                parts = rest.split(" ")
                tables[parts[0]][kind.lower()].extend(parts[1:])
            elif kind == "XCHECK":
                name, _, res = rest.partition(" ")
                xcheck[name] = res
            elif kind in ("MISSING", "ERROR"):
                missing.append(body)
    problems = list(missing)
    problems += ["XCHECK %s %s" % (k, v) for k, v in xcheck.items() if not v.startswith("same")]
    problems += ["EVENT %s %s" % (k, v) for k, v in events.items() if v.startswith("ERROR") or v == "?"]
    problems += ["FACT threw: %s" % x for x in facts if " :: THROWS " in x]
    if not xcheck:
        problems.append("no XCHECK lines: the probe did not compare its tables with a real instance")
    if problems:
        for p in problems:
            print("  PROBE PROBLEM: " + p[:300])
        raise RunnerError("the probe reported %d problem(s); nothing was compared or recorded" % len(problems))

    members = {
        "about": "Script-visible members of real classes, read on a real Forge server through the engine's own "
                 "JavaMembers and name remapper (see real-engine/zz_engine_probe.js). `!` marks a static. "
                 "Regenerate: python .minecraft/dev/engine-tests/run.py real-engine record",
        "recorded": {
            "date": datetime.date.today().isoformat(),
            "forge": info.get("forge"),
            "java": info.get("java"),
            "jars": {n: {"filename": metafile(n, ctx.pack)["filename"], "hash": metafile(n, ctx.pack)["hash"]} for n in ENGINE_JARS},
            "xcheck": "for %s the table equals what a script enumerates on a real instance" % ", ".join(
                "%s (%s names)" % (k.split(".")[-1], v.split(" ")[1]) for k, v in sorted(xcheck.items())),
        },
        "events": dict(sorted(events.items())),
        "bindings": dict(sorted(bindings.items())),
        "classes": {k: {kk: " ".join(vv) for kk, vv in v.items()} for k, v in sorted(tables.items())},
    }
    new_members = json.dumps(members, indent=1, sort_keys=False) + "\n"
    new_facts = "# Answers of the REAL engine to real-engine/0_engine_facts.js (label :: answer). Do not edit:\n" \
                "# regenerate with `python .minecraft/dev/engine-tests/run.py real-engine record`.\n" + "\n".join(facts) + "\n"
    mpath, fpath = os.path.join(TRUTH, "engine-members.json"), os.path.join(TRUTH, "engine-facts.txt")
    print("  %d facts, %d events, %d bindings, %d classes (%d member names)" % (
        len(facts), len(events), len(bindings), len(tables), sum(len(t["ids"]) + len(t["sids"]) for t in tables.values())))
    if mode == "record":
        for p, text in ((mpath, new_members), (fpath, new_facts)):
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
        print("RECORDED truth/engine-members.json and truth/engine-facts.txt -- review `git diff` before committing")
        return 0
    failed = 0
    for p, text, what in ((fpath, new_facts, "facts"), (mpath, new_members, "member tables")):
        old = open(p, encoding="utf-8").read() if os.path.isfile(p) else ""
        strip = lambda s: [l for l in s.splitlines() if '"date"' not in l]      # noqa: E731
        if strip(old) == strip(text):
            print("SAME  the engine's %s equal the recorded ones" % what)
        else:
            failed += 1
            diff = list(difflib.unified_diff(strip(old), strip(text), "recorded", "engine now", lineterm="", n=0))
            print("DIFF  the engine's %s differ from the recorded ones:" % what)
            for d in diff[:60]:
                print("      " + d[:300])
    return failed


# --------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="IridescentCraft engine test suite", usage=__doc__)
    ap.add_argument("command", nargs="?", default="all")
    ap.add_argument("rest", nargs="*")
    ap.add_argument("--mods", default=os.environ.get("ICRAFT_INSTANCE_MODS") or DEFAULT_MODS, help="instance mods folder")
    ap.add_argument("--libs", default=os.environ.get("ICRAFT_LIBRARIES") or "", help="launcher libraries folder")
    ap.add_argument("--jdk", default="", help="JDK home (17+)")
    ap.add_argument("--pack", default=MC, help="the .minecraft folder whose scripts are tested (default: this repo's)")
    ap.add_argument("--fetch-dir", default="", help="download jars that are not on this machine into this folder")
    ap.add_argument("--forge-server", default=os.environ.get("ICRAFT_FORGE_SERVER") or "~/icraft-backstop/server",
                    help="real-engine: a Forge server install (inside WSL on Windows)")
    ap.add_argument("--port", type=int, default=25593, help="real-engine: loopback port")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    args.pack = os.path.abspath(args.pack)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    ctx = Ctx(args)
    suites = load_suites()
    try:
        if args.command == "list":
            for s in suites:
                flags = ",".join(f for f in ("fast", "ci", "snapshot") if s.get(f))
                print("%-20s %-12s %-18s %s" % (s["name"], s["kind"], flags, s["about"]))
            return 0
        if args.command == "snapshot":
            if not args.rest or args.rest[0] not in ("record", "check"):
                raise RunnerError("usage: run.py snapshot record|check [suite ...]")
            return 1 if snapshot(ctx, args.rest[0], args.rest[1:]) else 0
        if args.command == "real-engine":
            mode = args.rest[0] if args.rest else "check"
            if mode not in ("check", "record"):
                raise RunnerError("usage: run.py real-engine [check|record]")
            return 1 if real_engine(ctx, mode, args.forge_server, args.port) else 0
        if args.command == "suite":
            by = {s["name"]: s for s in suites}
            for n in args.rest:
                if n not in by:
                    raise RunnerError("no suite named %r (run.py list)" % n)
            chosen, verbose = [by[n] for n in args.rest], True
        elif args.command in ("all", "fast", "ci"):
            chosen = [s for s in suites if args.command == "all" or s.get(args.command)]
            verbose = args.verbose
        else:
            raise RunnerError("unknown command %r (all, fast, ci, suite, list, snapshot, real-engine)" % args.command)
        return 1 if run_suites(ctx, chosen, verbose) else 0
    except RunnerError as e:
        eprint("[engine-tests] " + str(e))
        return 2


if __name__ == "__main__":
    sys.exit(main())
