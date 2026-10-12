#!/usr/bin/env python3
"""mod_index_test.py -- does the gate catch what it exists to catch?

Copies the index, the generated scripts and the generator to a temporary folder, breaks
the copy in one way at a time and runs `mod_index.py check` on it. Each case is a
failure this pack has already had, or the gate's own contract:

  a mod added to the root index only          (2026-06-01: three boss mods absent in game)
  a side label changed in the server index    (2026-06-02: a client renderer on the server)
  a metafile removed from one distro only     (a removed jar that stays on clients)
  two metafiles for one jar                   (2026-06-24: packwiz-installer refused the pair)
  side = '' / no hash / not TOML              (2026-06-24: the 138 metafiles it stopped on)
  a hand-edited skip list or client_only_mods.txt
  a skip pattern that hides a server mod

Nothing in the real tree is touched. Usage: python .minecraft/dev/mods/mod_index_test.py
Exit 0 when every case behaves, 1 otherwise. Python 3.11+.
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(MC)

COPY = [
    ".minecraft/mods/.index",
    ".minecraft/server_distribution/mods/.index",
    ".minecraft/distribution/client/mods/.index",
    ".minecraft/dev/mods/mod_index.py",
    ".minecraft/dev/mods/mod_index.policy.json",
    ".minecraft/server_distribution/client_only_mods.txt",
    ".minecraft/server_distribution/server_install.ps1",
    ".minecraft/server_distribution/server_install.sh",
    ".minecraft/server_distribution/update_mods.ps1",
    ".minecraft/server_distribution/update_mods.sh",
    ".minecraft/server_distribution/iridescentserver.sh",
    ".minecraft/server_distribution/strip_client_mods.bat",
    ".minecraft/server_distribution/strip_client_mods.sh",
    ".minecraft/server_distribution/IridescentCraft Dedicated Server/update_mods.ps1",
    "iridescent-launcher/icraft-core/src/packwiz.rs",
]

ROOT = ".minecraft/mods/.index/"
SERVER = ".minecraft/server_distribution/mods/.index/"
CLIENT = ".minecraft/distribution/client/mods/.index/"

NEW_MOD = """filename = 'gate-test-mod-1.0.0.jar'
name = 'Gate Test Mod'
side = 'both'

[download]
hash = '%s'
hash-format = 'sha1'
mode = 'url'
url = 'https://example.invalid/gate-test-mod-1.0.0.jar'
""" % ("0" * 40)


class Sandbox:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="mod-index-test-")
        for rel in COPY:
            src = os.path.join(REPO, *rel.split("/"))
            dst = os.path.join(self.dir, *rel.split("/"))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.isdir(src):
                shutil.copytree(src, dst)
            else:
                shutil.copyfile(src, dst)
        self.pristine = self.snapshot()

    def snapshot(self):
        snap = {}
        for base, _dirs, files in os.walk(self.dir):
            for fn in files:
                full = os.path.join(base, fn)
                with open(full, "rb") as f:
                    snap[full] = f.read()
        return snap

    def restore(self):
        """Put the copy back as it was first made: one copy serves every case."""
        now = self.snapshot()
        for full in now:
            if full not in self.pristine:
                os.remove(full)
        for full, data in self.pristine.items():
            if now.get(full) != data:
                with open(full, "wb") as f:
                    f.write(data)

    def path(self, rel):
        return os.path.join(self.dir, *rel.split("/"))

    def read(self, rel):
        with open(self.path(rel), "rb") as f:
            return f.read().decode("utf-8")

    def write(self, rel, text):
        with open(self.path(rel), "wb") as f:
            f.write(text.encode("utf-8"))

    def edit(self, rel, old, new):
        text = self.read(rel)
        if old not in text:
            raise AssertionError("fixture drift: %r not in %s" % (old, rel))
        self.write(rel, text.replace(old, new, 1))

    def run(self, cmd):
        r = subprocess.run([sys.executable, "-I", self.path(".minecraft/dev/mods/mod_index.py"), cmd],
                           capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def first_meta(sb, rel_dir, want_side):
    """A metafile of the source with the wanted side, picked by name order."""
    d = sb.path(ROOT)
    for fn in sorted(os.listdir(d)):
        if fn.endswith(".pw.toml") and ("side = '%s'" % want_side) in sb.read(ROOT + fn) and os.path.exists(sb.path(rel_dir + fn)):
            return fn
    raise AssertionError("no %s metafile to test with" % want_side)


# (name, mutation, text the report must contain)
def cases():
    def root_only(sb):
        sb.write(ROOT + "gate-test-mod.pw.toml", NEW_MOD)

    def server_side_flip(sb):
        fn = first_meta(sb, SERVER, "both")
        sb.edit(SERVER + fn, "side = 'both'", "side = 'client'")

    def client_side_flip(sb):
        fn = first_meta(sb, CLIENT, "both")
        sb.edit(CLIENT + fn, "side = 'both'", "side = 'server'")

    def removed_from_root_only(sb):
        os.remove(sb.path(ROOT + first_meta(sb, SERVER, "both")))

    def removed_from_server_only(sb):
        os.remove(sb.path(SERVER + first_meta(sb, SERVER, "both")))

    def client_mod_in_server_index(sb):
        fn = first_meta(sb, CLIENT, "client")
        shutil.copyfile(sb.path(ROOT + fn), sb.path(SERVER + fn))

    def duplicate_jar(sb):
        fn = first_meta(sb, SERVER, "both")
        sb.write(ROOT + "zz-gate-test-duplicate.pw.toml", sb.read(ROOT + fn))

    def empty_side(sb):
        fn = first_meta(sb, SERVER, "both")
        sb.edit(ROOT + fn, "side = 'both'", "side = ''")

    def no_hash(sb):
        fn = first_meta(sb, SERVER, "both")
        text = sb.read(ROOT + fn)
        sb.write(ROOT + fn, "\n".join(l for l in text.split("\n") if not l.startswith("hash = ")))

    def not_toml(sb):
        fn = first_meta(sb, SERVER, "both")
        text = sb.read(ROOT + fn).split("\n")
        text[1] = "name = 'It's broken'"
        sb.write(ROOT + fn, "\n".join(text))

    def hand_edited_skip_list(sb):
        sb.edit(".minecraft/server_distribution/strip_client_mods.sh", 'delete_mod "*embeddium*"', 'delete_mod "*embeddium*"\ndelete_mod "*handmade*"')

    def hand_edited_client_only_txt(sb):
        sb.write(".minecraft/server_distribution/client_only_mods.txt", sb.read(".minecraft/server_distribution/client_only_mods.txt") + "handmade.jar\n")

    def pattern_hides_server_mod(sb):
        # a mod the server installs, named so that a policy pattern matches it
        sb.write(ROOT + "gate-test-mod.pw.toml", NEW_MOD.replace("gate-test-mod-1.0.0.jar", "embeddium-compat-1.0.0.jar"))

    def compiled_pattern_not_in_policy(sb):
        sb.edit("iridescent-launcher/icraft-core/src/packwiz.rs", '"embeddium", "oculus",', '"embeddium", "oculus", "onlyinthelauncher",')

    def overlay_missing(sb):
        os.remove(sb.path(CLIENT + "fancymenu.pw.toml"))

    return [
        ("a mod added to the root index only", root_only, "STALE  missing"),
        ("a side label changed in the server index only", server_side_flip, "STALE  differs   " + SERVER.replace(".minecraft/", "")),
        ("a side label changed in the client distro index only", client_side_flip, "STALE  differs   " + CLIENT.replace(".minecraft/", "")),
        ("a metafile removed from the root index only", removed_from_root_only, "STALE  unexpected"),
        ("a metafile removed from the server index only", removed_from_server_only, "STALE  missing"),
        ("a client-only mod copied into the server index", client_mod_in_server_index, "STALE  unexpected"),
        ("two metafiles for one jar", duplicate_jar, "duplicate metafiles for"),
        ("side = ''", empty_side, "side = ''"),
        ("a metafile without a hash", no_hash, "has no hash"),
        ("a metafile that is not TOML", not_toml, "does not parse as TOML"),
        ("a hand-edited skip list in a script", hand_edited_skip_list, "STALE  differs   server_distribution/strip_client_mods.sh"),
        ("a hand-edited client_only_mods.txt", hand_edited_client_only_txt, "STALE  differs   server_distribution/client_only_mods.txt"),
        ("a skip pattern that hides a mod the server installs", pattern_hides_server_mod, "the server would silently not get it"),
        ("a compiled launcher pattern the policy does not list", compiled_pattern_not_in_policy, "compiled FORCE_SKIP_PATTERNS has 'onlyinthelauncher'"),
        ("a client_distro_only metafile that is gone", overlay_missing, "is not in distribution/client/mods/.index"),
    ]


def main():
    failed = 0
    sb = Sandbox()
    try:
        rc, out = sb.run("check")
        ok = rc == 0
        print("%s  the untouched copy passes" % ("PASS" if ok else "FAIL"))
        if not ok:
            print(out)
            failed += 1

        for name, mutate, expect in cases():
            sb.restore()
            mutate(sb)
            rc, out = sb.run("check")
            ok = rc == 1 and expect in out
            print("%s  refused: %s" % ("PASS" if ok else "FAIL", name))
            if not ok:
                failed += 1
                print("      exit %d, wanted 1 and a line containing %r; got:" % (rc, expect))
                print("      " + "\n      ".join(out.strip().split("\n")[:12]))

        # the repair path: a new both-sided mod in the source, then `generate`, then `check`
        sb.restore()
        sb.write(ROOT + "gate-test-mod.pw.toml", NEW_MOD)
        rc1, _ = sb.run("generate")
        rc2, out = sb.run("check")
        in_server = os.path.exists(sb.path(SERVER + "gate-test-mod.pw.toml"))
        in_client = os.path.exists(sb.path(CLIENT + "gate-test-mod.pw.toml"))
        ok = rc1 == 0 and rc2 == 0 and in_server and in_client
        print("%s  generate repairs it: a new `both` mod reaches both distro indexes and check passes" % ("PASS" if ok else "FAIL"))
        failed += 0 if ok else 1

        # ... and a client-only one stays out of the server index and gets a skip pattern
        sb.edit(ROOT + "gate-test-mod.pw.toml", "side = 'both'", "side = 'client'")
        rc1, _ = sb.run("generate")
        rc2, _ = sb.run("check")
        gone = not os.path.exists(sb.path(SERVER + "gate-test-mod.pw.toml"))
        listed = "gate-test-mod-1.0.0.jar" in sb.read(".minecraft/server_distribution/client_only_mods.txt")
        pattern = 'delete_mod "*gate-test-mod-*"' in sb.read(".minecraft/server_distribution/strip_client_mods.sh")
        ok = rc1 == 0 and rc2 == 0 and gone and listed and pattern
        print("%s  relabelled `client`: gone from the server index, in client_only_mods.txt, in the strip lists" % ("PASS" if ok else "FAIL"))
        failed += 0 if ok else 1
    finally:
        sb.close()

    print("")
    print("mod_index_test: %s" % ("all cases behave" if not failed else "%d case(s) FAILED" % failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
