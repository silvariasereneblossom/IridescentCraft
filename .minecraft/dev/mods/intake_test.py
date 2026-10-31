#!/usr/bin/env python3
"""intake_test.py -- does the intake tool do what it says, and does its gate refuse what it exists to refuse?

Copies the index, the records, the registries and the tools to a temporary folder and works on the copy:

  the gate      a clean copy passes; a mod with no record, a record made from another jar, a record no mod
                belongs to, a record that does not parse, and a new mod with an owed decision are each refused;
                the grandfathered backlog is not; a record that CLAIMS to be grandfathered is still new
  add           a small jar built here goes into the three indexes, gets a record that asks for its side, its
                dimension, its boss, its chests, its loot modifier and its boot, and the mod index gate stays green
  decide/apply  an answer is recorded; a boss answer becomes a registry entry the validator accepts; an entry the
                validator refuses leaves the registry byte for byte as it was
  update        a second build of the jar that dropped a loot table: the table is reported as vanished, the script
                that still names it is found, the new dimension is asked for
  remove        the dry run lists the references and changes nothing; --apply takes the mod out of the three
                indexes, writes the deny pattern into the two clean-up lists and deletes the record
  update+boot   with a saved boot result (made here, as boot.ps1 writes one) the sweep counts what the game stopped
                registering; an id that only left the jar's files is checked against the new boot's registries
  dependencies  a library just added to the tree (index + jar cache, not the instance) provides its mod to `add`;
                `update` refuses a new jar whose dependency nothing provides before it writes anything
  overrides     the gate refuses a client mod added, updated or removed (one the overrides depend on) since the
                client asset overrides were checked (dev/client_overrides/checked.json); `remove` re-checks only a
                jar the stamp says they depend on. The check itself needs the real jars: client_overrides_test.py

No boot is made (--no-boot) and no client override check (--no-client-check): what a real boot adds is exercised
on the rig, see README.md; the override check on its own small pack, dev/client_overrides/client_overrides_test.py.
Nothing in the real tree is touched. Usage: python .minecraft/dev/mods/intake_test.py
Exit 0 when every case behaves, 1 otherwise. Python 3.11+.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(MC)

COPY = [
    ".minecraft/mods/.index",
    ".minecraft/server_distribution/mods/.index",
    ".minecraft/distribution/client/mods/.index",
    ".minecraft/dev/mods",
    ".minecraft/dev/client_overrides",
    ".minecraft/dev/rosters",
    ".minecraft/dev/registry",
    ".minecraft/kubejs/config/icraft",
    ".minecraft/kubejs/data/icraft/tags",
    ".minecraft/kubejs/server_scripts/gates/astages_restrictions.js",
    ".minecraft/dev/gen_keybinds.ps1",
    ".minecraft/config/Crust/default_game_rules.toml",
    ".minecraft/config/apotheosis/adventure.cfg",
    ".minecraft/config/iridescent_difficulty-common.toml",
    ".minecraft/cleanup_stale_jars.ps1",
    ".minecraft/custom_jars_manifest.json",
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
    "iridescent-launcher/icraft-core/src/config.rs",
]
ROOT = ".minecraft/mods/.index/"
SERVER = ".minecraft/server_distribution/mods/.index/"
CLIENT = ".minecraft/distribution/client/mods/.index/"
RECORDS = ".minecraft/dev/mods/records/"
BUNDLE = RECORDS + "grandfathered.json"
STAMP = ".minecraft/dev/client_overrides/checked.json"
SLUG = "gate-test-mod"
MOD = "gatetest"


def build_jar(path, version, with_vault=True, with_far2=False, drop=(), lang=None, needs=()):
    """A mod jar small enough to read in one look: one item, one boss-tagged entity, one dimension, one chest
    table, one loot modifier, one config-less mods.toml. `drop`: files left out; `lang`: more language keys;
    `needs`: more mandatory dependencies."""
    files = {
        "META-INF/mods.toml": (
            'modLoader="javafml"\nloaderVersion="[47,)"\nlicense="MIT"\n'
            '[[mods]]\nmodId="%s"\nversion="%s"\ndisplayName="Gate Test Mod"\n'
            '[[dependencies.%s]]\nmodId="forge"\nmandatory=true\nversionRange="[47,)"\nordering="NONE"\nside="BOTH"\n' % (MOD, version, MOD)
            + ''.join('[[dependencies.%s]]\nmodId="%s"\nmandatory=true\nversionRange="[0,)"\nordering="NONE"\nside="BOTH"\n' % (MOD, dep) for dep in needs)),
        "assets/%s/lang/en_us.json" % MOD: json.dumps({
            "item.%s.widget" % MOD: "Widget", "entity.%s.big_boss" % MOD: "Big Boss", "key.%s.open" % MOD: "Open"}),
        "data/%s/dimension/far.json" % MOD: json.dumps({"type": "minecraft:overworld", "generator": {"type": "minecraft:flat"}}),
        "data/forge/tags/entity_types/bosses.json": json.dumps({"replace": False, "values": ["%s:big_boss" % MOD]}),
        "data/%s/recipes/widget.json" % MOD: json.dumps({"type": "minecraft:crafting_shapeless", "ingredients": [{"item": "minecraft:stick"}],
                                                        "result": {"item": "%s:widget" % MOD}}),
        "data/%s/loot_modifiers/extra.json" % MOD: json.dumps({"type": "%s:extra" % MOD, "conditions": []}),
        "data/forge/loot_modifiers/global_loot_modifiers.json": json.dumps({"replace": False, "entries": ["%s:extra" % MOD]}),
    }
    if with_vault:
        files["data/%s/loot_tables/chests/vault.json" % MOD] = json.dumps({"type": "minecraft:chest", "pools": []})
    if with_far2:
        files["data/%s/dimension/farther.json" % MOD] = json.dumps({"type": "minecraft:overworld", "generator": {"type": "minecraft:flat"}})
    if lang:
        keys = json.loads(files["assets/%s/lang/en_us.json" % MOD])
        keys.update(lang)
        files["assets/%s/lang/en_us.json" % MOD] = json.dumps(keys)
    for name in drop:
        del files[name]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(files):
            zf.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), files[name])


def build_plain_jar(path, mod, version, needs=()):
    """A mod jar with one mods.toml and nothing else: `needs` are mandatory dependencies."""
    toml = ('modLoader="javafml"\nloaderVersion="[47,)"\nlicense="MIT"\n[[mods]]\nmodId="%s"\nversion="%s"\n'
            'displayName="%s"\n' % (mod, version, mod))
    for dep in ("forge",) + tuple(needs):
        toml += ('[[dependencies.%s]]\nmodId="%s"\nmandatory=true\nversionRange="[0,)"\nordering="NONE"\nside="BOTH"\n' % (mod, dep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(zipfile.ZipInfo("META-INF/mods.toml", (2026, 1, 1, 0, 0, 0)), toml)


class Sandbox:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="mod-intake-test-")
        for rel in COPY:
            src = os.path.join(REPO, *rel.split("/"))
            dst = os.path.join(self.dir, *rel.split("/"))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.isdir(src):
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".cache", "__pycache__"))
            elif os.path.isfile(src):
                shutil.copy2(src, dst)
        self.jars = os.path.join(self.dir, "jars")
        os.makedirs(self.jars)

    def path(self, rel):
        return os.path.join(self.dir, *rel.split("/"))

    def read(self, rel):
        with open(self.path(rel), "rb") as f:
            return f.read()

    def write(self, rel, data):
        os.makedirs(os.path.dirname(self.path(rel)), exist_ok=True)
        with open(self.path(rel), "wb") as f:
            f.write(data if isinstance(data, bytes) else data.encode("utf-8"))

    def exists(self, rel):
        return os.path.exists(self.path(rel))

    def stamp(self):
        return json.loads(self.read(STAMP).decode("utf-8"))

    def client_metafiles(self):
        """slug -> the text of its metafile in the client distribution's index"""
        return dict((f[:-len(".pw.toml")], self.read(CLIENT + f).decode("utf-8"))
                    for f in sorted(os.listdir(self.path(CLIENT))) if f.endswith(".pw.toml"))

    def client_slug(self, jar):
        return [s for s, t in self.client_metafiles().items() if jar in re.findall(r"""^filename = ['"](.*)['"]""", t, re.M)][0]

    def stamp_jar(self, jar, touches=None):
        """The jar into the client-override stamp as a passing client_overrides.py --check writes it: the hash the
        client index records, and what of it the overrides depend on."""
        text = [t for t in self.client_metafiles().values() if jar in re.findall(r"""^filename = ['"](.*)['"]""", t, re.M)][0]
        doc = self.stamp()
        doc["jars"][jar] = {"hash": "%s:%s" % (re.search(r"hash-format = '(\w+)'", text).group(1),
                                               re.search(r"hash = '([0-9a-f]+)'", text).group(1))}
        if touches:
            doc["jars"][jar]["touches"] = touches
        self.write(STAMP, json.dumps(doc, indent=1))

    def tool(self, script, *args, jar_cache=None):
        env = dict(os.environ)
        env.pop("ICRAFT_BOOT_JAR_CACHE", None)
        if jar_cache:
            env["ICRAFT_BOOT_JAR_CACHE"] = jar_cache
        r = subprocess.run([sys.executable, "-I", self.path(".minecraft/dev/mods/" + script)] + list(args),
                           capture_output=True, text=True, errors="replace", env=env)
        return r.returncode, r.stdout + r.stderr

    def intake(self, *args, jar_cache=None):
        return self.tool("intake.py", *args, jar_cache=jar_cache)

    def bundle(self):
        return json.loads(self.read(BUNDLE).decode("utf-8"))

    def write_bundle(self, doc):
        self.write(BUNDLE, json.dumps(doc, indent=1) + "\n")

    def record(self, slug):
        if self.exists(RECORDS + slug + ".json"):
            return json.loads(self.read(RECORDS + slug + ".json").decode("utf-8"))
        return self.bundle()["records"][slug]

    def digest(self, rels):
        h = hashlib.sha256()
        for rel in rels:
            root = self.path(rel)
            if os.path.isfile(root):
                h.update(open(root, "rb").read())
                continue
            for dp, dn, fn in os.walk(root):
                dn.sort()
                for f in sorted(fn):
                    h.update(os.path.relpath(os.path.join(dp, f), self.dir).encode())
                    h.update(open(os.path.join(dp, f), "rb").read())
        return h.hexdigest()

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, ok))
    print("  %s  %s%s" % ("ok  " if ok else "FAIL", name, "" if ok else "\n        " + detail.strip().replace("\n", "\n        ")[-1800:]))


def first_grandfathered(sb):
    base = json.loads(sb.read(".minecraft/dev/mods/intake_baseline.json").decode("utf-8"))["grandfathered"]
    for slug in sorted(base):
        if sb.exists(ROOT + slug + ".pw.toml"):
            return slug
    raise SystemExit("the baseline names no mod of the index")


def gate_cases():
    print("the gate")
    sb = Sandbox()
    try:
        rc, out = sb.intake("check")
        check("a clean copy passes", rc == 0 and "OK -" in out, out)
        check("the grandfathered backlog is reported and is not a failure", rc == 0 and "decisions owed" in out, out)
        victim = first_grandfathered(sb)

        def case(name, expect, mutate):
            s2 = Sandbox()
            try:
                mutate(s2)
                rc2, out2 = s2.intake("check")
                check(name, rc2 == 1 and expect in out2, "exit %s, expected %r in:\n%s" % (rc2, expect, out2))
            finally:
                s2.close()

        new_meta = ("filename = 'gate-test-mod-1.0.0.jar'\nname = 'Gate Test Mod'\nside = 'both'\n\n[download]\nhash = '%s'\n"
                    "hash-format = 'sha1'\nmode = 'url'\nurl = 'https://example.invalid/gate-test-mod-1.0.0.jar'\n" % ("0" * 40))

        def add_meta(s):
            s.write(ROOT + SLUG + ".pw.toml", new_meta)
            rc3, out3 = s.tool("mod_index.py", "generate")
            assert rc3 == 0, out3

        case("a mod added to the index with no record is refused", "NO RECORD   " + SLUG, add_meta)
        def drop(s):
            doc = s.bundle()
            del doc["records"][victim]
            s.write_bundle(doc)
        case("a grandfathered mod whose record was deleted is refused", "NO RECORD   " + victim, drop)

        def bump(s):
            raw = s.read(ROOT + victim + ".pw.toml").decode("utf-8")
            line = [l for l in raw.split("\n") if l.startswith("filename")][0]
            s.write(ROOT + victim + ".pw.toml", raw.replace(line, "filename = 'some-other-version-9.9.9.jar'"))
            s.tool("mod_index.py", "generate")
        case("a jar changed in the index without `update` is refused", "NO RECORD OF THIS JAR   " + victim, bump)
        def orphan(s):
            rec = dict(s.record(victim), mod="no-such-mod")
            s.write(RECORDS + "no-such-mod.json", json.dumps(rec))
        case("a record no mod belongs to is refused", "RECORD WITHOUT A MOD   no-such-mod", orphan)

        def orphan_in_bundle(s):
            doc = s.bundle()
            doc["records"]["no-such-mod"] = dict(doc["records"][victim], mod="no-such-mod")
            s.write_bundle(doc)
        case("... also when it sits in the bundle", "RECORD WITHOUT A MOD   no-such-mod", orphan_in_bundle)
        case("a record that does not parse is refused", "does not parse", lambda s: s.write(RECORDS + "broken.json", "{ not json"))
        case("a bundle that does not parse is refused", "does not parse", lambda s: s.write(BUNDLE, "{ not json"))

        def twice(s):
            s.write(RECORDS + victim + ".json", json.dumps(s.record(victim)))
        case("a record that exists twice is refused", "exists twice", twice)

        def claims(s):
            add_meta(s)
            rec = s.record(victim)
            rec.update(mod=SLUG, jar="gate-test-mod-1.0.0.jar", hash="sha1:" + "0" * 40, side="both", raised="grandfather")
            rec["decisions"] = [{"key": "tier-gate", "surface": "tier-gate", "status": "owed", "raised": "grandfather"}]
            s.write(RECORDS + SLUG + ".json", json.dumps(rec))
        case("a new mod whose record claims to be grandfathered is still new", "OWED   " + SLUG, claims)

        def side_differs(s):
            doc = s.bundle()
            rec = doc["records"][victim]
            rec["side"] = "client" if rec["side"] != "client" else "both"
            s.write_bundle(doc)
        case("a record whose side is not the index's is refused", "SIDE   " + victim, side_differs)

        # the client asset overrides: the stamp of their last check against the client index
        upd_jar = sorted(j for j, e in sb.stamp()["jars"].items() if not e["hash"].startswith("own:"))[0]
        upd_slug = sb.client_slug(upd_jar)

        def stamp_edit(fn):
            def mutate(s):
                doc = s.stamp()
                fn(doc["jars"])
                s.write(STAMP, json.dumps(doc, indent=1))
            return mutate

        case("a client mod updated since the client asset overrides were checked is refused",
             "CLIENT OVERRIDES   %s (%s): the index records another file" % (upd_slug, upd_jar),
             stamp_edit(lambda jars: jars[upd_jar].update(hash="sha1:" + "0" * 40)))
        case("a client mod added since that check is refused",
             "CLIENT OVERRIDES   %s (%s): in the client index, not in the stamp" % (upd_slug, upd_jar),
             stamp_edit(lambda jars: jars.pop(upd_jar)))
        case("a jar the overrides depend on, taken out of the client index without a new check, is refused",
             "CLIENT OVERRIDES   gone-1.0.jar: left the client index; the overrides depend on it (sounds)",
             stamp_edit(lambda jars: jars.update({"gone-1.0.jar": {"hash": "sha1:" + "1" * 40, "touches": ["sounds"]}})))
        case("no stamp is refused", "CLIENT OVERRIDES   no stamp", lambda s: os.remove(s.path(STAMP)))
        s2 = Sandbox()
        try:
            stamp_edit(lambda jars: jars.update({"gone-1.0.jar": {"hash": "sha1:" + "1" * 40}}))(s2)
            rc, out = s2.intake("check")
            check("a jar the overrides do not depend on can leave without a new check", rc == 0 and "CLIENT OVERRIDES" not in out, out)
        finally:
            s2.close()
    finally:
        sb.close()


def flow():
    print("add, decide, apply, update, remove (on a jar built here, without a boot)")
    sb = Sandbox()
    try:
        jar1 = os.path.join(sb.jars, "gate-test-mod-1.0.0.jar")
        jar2 = os.path.join(sb.dir, "new", "gate-test-mod-1.1.0.jar")
        build_jar(jar1, "1.0.0")
        build_jar(jar2, "1.1.0", with_vault=False, with_far2=True)
        # a script, a quest and a config that name the mod: what update and remove have to find
        sb.write(".minecraft/kubejs/server_scripts/loot/gate_test_rule.js",
                 "LootJS.modifiers(e => { e.addLootTableModifier('gatetest:chests/vault').addLoot('gatetest:widget') })\n"
                 "if (Platform.isLoaded('gatetest')) { console.log('here') }\n")
        sb.write(".minecraft/config/heracles/quests/test/q.json", '{"tasks": {"a": {"entity": {"type": "gatetest:big_boss"}}}}')
        sb.write(".minecraft/config/gatetest-common.toml", "[general]\nvalue = 1\n")
        before_index = sb.digest([ROOT, SERVER, CLIENT])

        rc, out = sb.intake("add", jar1, "--side", "both", "--url", "https://example.invalid/gate-test-mod-1.0.0.jar",
                            "--slug", SLUG, "--no-boot", "--no-client-check", "--mods", sb.jars)
        check("add: exits 0 and writes the record", rc == 0 and sb.exists(RECORDS + SLUG + ".json"), out)
        check("add: says the client asset overrides were not checked, and what the gate then does",
              "client asset overrides: NOT checked (--no-client-check)" in out and "client_overrides.py --check" in out, out)
        check("add: the metafile is in the source index and in both generated indexes",
              all(sb.exists(d + SLUG + ".pw.toml") for d in (ROOT, SERVER, CLIENT)), out)
        rc2, out2 = sb.tool("mod_index.py", "check")
        check("add: the mod index gate is green afterwards", rc2 == 0, out2)
        meta = sb.read(ROOT + SLUG + ".pw.toml").decode("utf-8")
        check("add: the metafile carries the jar's own sha512",
              hashlib.sha512(open(jar1, "rb").read()).hexdigest() in meta and "hash-format = 'sha512'" in meta, meta)
        rec = sb.record(SLUG) if sb.exists(RECORDS + SLUG + ".json") else {"decisions": []}
        keys = dict((d["key"], d) for d in rec["decisions"])
        for want in ("side", "boot", "tier-gate", "dimension:gatetest:far", "boss:gatetest:big_boss", "loot:chests", "loot:modifiers", "keys", "codex"):
            check("add: the record asks about %s" % want, want in keys, ", ".join(keys))
        check("add: side is answered by --side, the boot is owed without a boot",
              keys.get("side", {}).get("status") == "decided" and keys.get("boot", {}).get("status") == "owed", json.dumps(keys.get("boot")))
        check("add: every decision says what happens by default",
              all(d.get("default") for d in rec["decisions"] if d["key"] != "boot"), "")
        rc, out = sb.intake("check")
        check("the gate refuses the new mod while decisions are owed", rc == 1 and "OWED   " + SLUG in out, out)
        check("the gate refuses a client mod the client asset overrides were not checked with",
              rc == 1 and "CLIENT OVERRIDES   %s (gate-test-mod-1.0.0.jar): in the client index, not in the stamp" % SLUG in out
              and "client_overrides.py --check" in out, out)
        rc, out = sb.intake("add", jar1, "--side", "both", "--url", "https://example.invalid/x.jar", "--slug", "again", "--no-boot", "--mods", sb.jars)
        check("add: a jar that is already in the index is refused", rc == 2 and "already in the index" in out, out)
        rc, out = sb.intake("show", SLUG)
        check("show: the record reads as text, with DECIDE lines", rc == 0 and "DECIDE :" in out and "default:" in out, out)

        # decide and apply
        rc, out = sb.intake("decide", SLUG, "boss:gatetest:big_boss", "mob", "--note", "a test entity")
        check("decide: `mob` needs no registry entry", rc == 0 and "DECIDED" in out, out)
        rc, out = sb.intake("decide", SLUG, "dimension:gatetest:far", "3")
        check("decide: a tier is an answer waiting for apply", rc == 0 and "UNAPPLIED" in out, out)
        reg_before = sb.digest([".minecraft/kubejs/config/icraft/registry"])
        rc, out = sb.intake("apply", SLUG)
        check("apply: an entry the validator refuses leaves the registries byte for byte",
              rc == 1 and sb.digest([".minecraft/kubejs/config/icraft/registry"]) == reg_before and "NOTHING was kept" in out, out)
        rc, out = sb.intake("check")
        check("the gate names a decided, unapplied decision", rc == 1 and "NOT APPLIED   " + SLUG in out, out)
        rc, out = sb.intake("decide", SLUG, "dimension:gatetest:far", "untiered")
        check("decide: `untiered` needs no registry entry", rc == 0 and "DECIDED" in out, out)
        rc, out = sb.intake("decide", SLUG, "side", "sideways")
        check("decide: an answer that is none of the options is refused", rc == 2, out)
        rc, out = sb.intake("decide", SLUG, "boot", "accepted")
        check("decide: the boot is not accepted without a reason", rc == 2, out)
        rc, out = sb.intake("decide", SLUG, "boot", "accepted", "--note", "test jar: never booted")
        rc, out = sb.intake("decide", SLUG, "--defaults", "--note", "test")
        check("decide --defaults closes the rest", rc == 0, out)
        rc, out = sb.intake("check")
        check("every decision answered, the gate still refuses while the overrides were not checked with the jar",
              rc == 1 and "CLIENT OVERRIDES   " + SLUG in out and "OWED" not in out, out)
        sb.stamp_jar("gate-test-mod-1.0.0.jar")
        rc, out = sb.intake("check")
        check("the gate passes once every decision of the new mod is answered and the overrides were checked",
              rc == 0 and "1 new (1 complete)" in out, out)

        # a real boss-like entity of the pack that is in no list: the entry must validate
        boss = None
        for r in sb.bundle()["records"].values():
            for d in r["decisions"]:
                if d["key"].startswith("boss:") and d["status"] == "owed" and any("registered: category" in e for e in d.get("evidence", [])):
                    boss = (r["mod"], d["key"])
                    break
            if boss:
                break
        if boss:
            rc, out = sb.intake("decide", boss[0], boss[1], "named", "tier=4", "--note", "test")
            rc, out = sb.intake("apply", boss[0])
            reg = json.loads(sb.read(".minecraft/kubejs/config/icraft/registry/bosses.json").decode("utf-8"))
            check("apply: a decided boss becomes a registry entry the validator accepts (%s)" % boss[1],
                  rc == 0 and boss[1][5:] in reg["bosses"] and reg["bosses"][boss[1][5:]]["flags"] == ["boss", "x3"], out)
            rc, out = sb.intake("show", boss[0])
            check("apply: the record then reads the answer from the registry", "[registry]" in out and boss[1] + "  [decided]" in out, out)
            check("decide: a grandfathered record stays in the bundle", not sb.exists(RECORDS + boss[0] + ".json") and
                  [d for d in sb.bundle()["records"][boss[0]]["decisions"] if d["key"] == boss[1]][0].get("answer") == "named", "")
        else:
            check("apply: a boss-like entity in no list exists to test with", True)

        # update
        rc, out = sb.intake("update", SLUG, jar2, "--url", "https://example.invalid/gate-test-mod-1.1.0.jar", "--no-boot",
                            "--no-client-check", "--mods", sb.jars, "--out", os.path.join(sb.dir, "update.txt"))
        check("update: exits 0", rc == 0, out)
        check("update: the metafile names the new jar in all three indexes",
              all(b"gate-test-mod-1.1.0.jar" in sb.read(d + SLUG + ".pw.toml") for d in (ROOT, SERVER, CLIENT)), out)
        check("update: the loot table that left the jar is reported as vanished", "gatetest:chests/vault" in out and "vanished" in out, out)
        check("update: the script that still names it is found", "kubejs/server_scripts/loot/gate_test_rule.js" in out, out)
        check("update: it says that without a boot the registered ids are not known", "No boot diff" in out, out)
        rec = sb.record(SLUG)
        keys = dict((d["key"], d) for d in rec["decisions"])
        check("update: the new dimension is asked for, by the update",
              keys.get("dimension:gatetest:farther", {}).get("raised") == "update" and keys["dimension:gatetest:farther"]["status"] == "owed", json.dumps(keys.get("dimension:gatetest:farther")))
        check("update: answers given before are kept", keys.get("boss:gatetest:big_boss", {}).get("answer") == "mob", json.dumps(keys.get("boss:gatetest:big_boss")))
        check("update: the record is of the new jar and has a history line", rec["jar"] == "gate-test-mod-1.1.0.jar" and rec.get("history"), "")
        rc, out = sb.intake("check")
        check("the gate refuses the update while its new questions are owed", rc == 1 and "OWED   " + SLUG in out, out)
        check("the gate refuses an update the client asset overrides were not checked with",
              "CLIENT OVERRIDES   %s (gate-test-mod-1.1.0.jar): in the client index, not in the stamp" % SLUG in out, out)

        # the launcher's own update: the metafile already names a third build, the record still the second
        jar3 = os.path.join(sb.dir, "new", "gate-test-mod-1.2.0.jar")
        build_jar(jar3, "1.2.0", with_vault=False, with_far2=True)
        meta = sb.read(ROOT + SLUG + ".pw.toml").decode("utf-8")
        meta = meta.replace("gate-test-mod-1.1.0.jar", "gate-test-mod-1.2.0.jar").replace(
            hashlib.sha512(open(jar2, "rb").read()).hexdigest(), hashlib.sha512(open(jar3, "rb").read()).hexdigest())
        sb.write(ROOT + SLUG + ".pw.toml", meta)
        rc, out = sb.intake("check")
        check("a metafile moved by hand to another jar is refused, even before the indexes are regenerated",
              rc == 1 and "NO RECORD OF THIS JAR   " + SLUG in out, out)
        rc, out = sb.intake("update", SLUG, jar3, "--no-boot", "--no-client-check", "--mods", sb.jars)
        check("update: a metafile the launcher already moved is taken as it is", rc == 0 and "left as it is" in out
              and sb.record(SLUG)["jar"] == "gate-test-mod-1.2.0.jar" and b"gate-test-mod-1.2.0.jar" in sb.read(SERVER + SLUG + ".pw.toml"), out)
        sb.stamp_jar("gate-test-mod-1.2.0.jar")            # checked, and nothing of it is something an override needs
        jar2 = jar3
        own = sorted(slug for slug, r in sb.bundle()["records"].items() if r.get("own") and sb.exists(ROOT + slug + ".pw.toml"))
        check("the pack has own jars to test with", bool(own), "")
        if own:
            before_own = sb.digest([ROOT, SERVER, CLIENT, RECORDS])
            rc, out = sb.intake("update", own[0], jar2, "--no-boot", "--mods", sb.jars)
            check("update: one of the pack's own jars is refused and nothing is written (%s)" % own[0],
                  rc == 2 and "own jars" in out and sb.digest([ROOT, SERVER, CLIENT, RECORDS]) == before_own, out)
            rc, out = sb.intake("update", own[0], jar2, "--old-jar", jar1, "--diff-only", "--mods", sb.jars)
            check("update --diff-only: compares two jars and writes nothing",
                  rc == 0 and "gatetest:chests/vault" in out and sb.digest([ROOT, SERVER, CLIENT, RECORDS]) == before_own, out)

            # a release of an own jar under a NEW file name (custom-jar-release does this: metafile, manifest, jars).
            # The gate then asks for a record of the new jar, and update must be able to give it one.
            s3 = Sandbox()
            try:
                old_name = s3.record(own[0])["jar"]
                released = os.path.join(s3.jars, "own-jar-release-9.9.9.jar")
                build_jar(released, "9.9.9")
                meta = s3.read(ROOT + own[0] + ".pw.toml").decode("utf-8")
                old_hash = [l for l in meta.split("\n") if l.startswith("hash = ")][0]
                meta = meta.replace(old_name, "own-jar-release-9.9.9.jar").replace(
                    old_hash, "hash = '%s'" % hashlib.sha256(open(released, "rb").read()).hexdigest())
                s3.write(ROOT + own[0] + ".pw.toml", meta)
                man = json.loads(s3.read(".minecraft/custom_jars_manifest.json").decode("utf-8"))
                man["jars"]["own-jar-release-9.9.9.jar"] = man["jars"].pop(old_name)
                s3.write(".minecraft/custom_jars_manifest.json", json.dumps(man, indent=2))
                rc, out = s3.tool("mod_index.py", "generate")
                rc, out = s3.intake("check")
                check("an own jar released under a new file name: the gate asks for a record of it",
                      rc == 1 and "NO RECORD OF THIS JAR   " + own[0] in out, out)
                rc, out = s3.intake("update", own[0], released, "--no-boot", "--no-client-check", "--mods", s3.jars)
                check("update: after that release it rewrites the record and leaves the metafile alone",
                      rc == 0 and "a custom-jar release" in out and s3.record(own[0])["jar"] == "own-jar-release-9.9.9.jar"
                      and s3.read(ROOT + own[0] + ".pw.toml").decode("utf-8") == meta, out)
                if s3.exists(CLIENT + own[0] + ".pw.toml"):
                    s3.stamp_jar("own-jar-release-9.9.9.jar")      # the release's own client_overrides.py --check
                rc, out = s3.intake("check")
                check("... and the gate no longer misses the record (it asks what the update raised)",
                      "NO RECORD OF THIS JAR" not in out and (rc == 0 or "raised by an update" in out), out)
            finally:
                s3.close()

        # remove
        shutil.copy2(jar2, os.path.join(sb.jars, os.path.basename(jar2)))
        os.remove(jar1)
        check("a new mod's record is a file of its own, not in the bundle", sb.exists(RECORDS + SLUG + ".json") and SLUG not in sb.bundle()["records"], "")
        watched = [ROOT, SERVER, CLIENT, RECORDS, ".minecraft/cleanup_stale_jars.ps1", "iridescent-launcher/icraft-core/src/config.rs"]
        before = sb.digest(watched)
        rc, out = sb.intake("remove", SLUG, "--mods", sb.jars)
        check("remove (dry run): changes nothing", rc == 0 and sb.digest(watched) == before and "DRY RUN" in out, out)
        for want in ("kubejs/server_scripts/loot/gate_test_rule.js", "config/heracles/quests/test/q.json", "config/gatetest-common.toml",
                     "the mod id gatetest", "Deny-list pattern: 'gate-test-mod-'", "How the jar leaves"):
            check("remove (dry run): reports %s" % want, want in out, out)
        check("remove (dry run): a jar no client asset override depends on needs no new check", "Client asset overrides" not in out, out)
        touched = sorted(j for j, e in sb.stamp()["jars"].items() if e.get("touches") and not e["hash"].startswith("own:"))
        check("the stamp names jars the overrides depend on", bool(touched), "")
        if touched:
            rc, out = sb.intake("remove", sb.client_slug(touched[0]), "--mods", sb.jars)
            check("remove (dry run): a jar the overrides depend on is checked again by --apply (%s)" % touched[0],
                  rc == 0 and "Client asset overrides" in out and "they depend on it" in out
                  and "--apply runs client_overrides.py --check without it" in out, out)
        rc, out = sb.intake("remove", SLUG, "--apply", "--why", "test", "--mods", sb.jars)
        check("remove --apply: exits 0", rc == 0, out)
        check("remove --apply: the metafile is gone from all three indexes", not any(sb.exists(d + SLUG + ".pw.toml") for d in (ROOT, SERVER, CLIENT)), out)
        check("remove --apply: the record is gone", not sb.exists(RECORDS + SLUG + ".json"), out)
        check("remove --apply: the indexes are what they were before the add", sb.digest([ROOT, SERVER, CLIENT]) == before_index, out)
        ps1 = sb.read(".minecraft/cleanup_stale_jars.ps1").decode("utf-8")
        rs = sb.read("iridescent-launcher/icraft-core/src/config.rs").decode("utf-8")
        check("remove --apply: the deny pattern is in both clean-up lists", "'gate-test-mod-'" in ps1 and '"gate-test-mod-"' in rs, ps1[-1500:])
        real_ps1 = open(os.path.join(MC, "cleanup_stale_jars.ps1"), "rb").read().decode("utf-8")
        check("remove --apply: the clean-up script keeps its line endings and every old pattern",
              ("\r\n" in ps1) == ("\r\n" in real_ps1) and all(("'%s'" % p) in ps1 for p in ("truly_modular", "fastback")), "")
        rc, out = sb.tool("mod_index.py", "check")
        check("remove --apply: the mod index gate is green", rc == 0, out)
        rc, out = sb.intake("check")
        check("remove --apply: the intake gate is green", rc == 0, out)
    finally:
        sb.close()


def fake_boot(root, removed_tables, items):
    """A saved boot result of a new jar, as boot.ps1 writes one: it booted, its diff against the old jar says which
    loot tables the game stopped loading, and its registry dump lists the items the game registers."""
    d = os.path.join(root, "boot-new")
    os.makedirs(os.path.join(d, "registry", "all"))
    with open(os.path.join(d, "result.json"), "w") as f:
        json.dump({"booted": True, "boot": {"reached_done": True, "clean_stop": True}}, f)
    with open(os.path.join(d, "diff-vs-boot-old.json"), "w") as f:
        json.dump({"base": {"name": "boot-old"}, "loot_tables": {"added": [], "removed": removed_tables}, "regressions": []}, f)
    with open(os.path.join(d, "registry", "all", "minecraft__item.txt"), "w") as f:
        f.write("\n".join(items) + "\n")
    return d


def update_with_boot():
    """D1: with a boot diff, `update` sweeps the ids the GAME stopped registering. An id that only left the jar's
    files is checked against the new boot's registries: still registered = not vanished; registered nowhere = listed
    apart. (The Simply Swords proof reported 64 vanished ids where its boot said 4.)"""
    print("update with a boot diff (D1)")
    sb = Sandbox()
    try:
        old = os.path.join(sb.dir, "old", "gate-test-mod-1.0.0.jar")
        new = os.path.join(sb.dir, "new", "gate-test-mod-1.1.0.jar")
        build_jar(old, "1.0.0", lang={"item.%s.old_note" % MOD: "a description that left"})
        # the new build drops the chest table (the game stops loading it) and the recipe file named like the item
        # (the item stays registered: a recipe file of the same id is not the item)
        build_jar(new, "1.1.0", with_vault=False, drop=("data/%s/recipes/widget.json" % MOD,))
        sb.write(".minecraft/kubejs/server_scripts/loot/gate_test_rule.js",
                 "LootJS.modifiers(e => { e.addLootTableModifier('gatetest:chests/vault').addLoot('gatetest:widget') })\n")
        rdir = fake_boot(sb.dir, ["gatetest:chests/vault"], ["minecraft:stick", "gatetest:widget"])
        slug = first_grandfathered(sb)
        rc, out = sb.intake("update", slug, new, "--old-jar", old, "--diff-only", "--boot-result", rdir, "--mods", sb.jars)
        check("update + boot: exits 0", rc == 0, out)
        check("update + boot: the sweep counts the one id the game stopped registering",
              "Ids the game stopped registering (the boot diff): 1." in out and "    gatetest:chests/vault: registry loot_tables" in out, out)
        check("update + boot: the script that names it is found", "kubejs/server_scripts/loot/gate_test_rule.js" in out, out)
        check("update + boot: a recipe file that left, named like an item the new boot registers, is NOT vanished",
              "still registered in the new boot (NOT vanished): 1: gatetest:widget (minecraft:item)" in out
              and "    gatetest:widget:" not in out, out)
        check("update + boot: a language key the game never registered is listed apart",
              "registered in neither boot" in out and "gatetest:old_note" in out, out)
        rc, out = sb.intake("update", slug, new, "--old-jar", old, "--diff-only", "--mods", sb.jars)
        check("update without a boot: every id that left the jar is swept, and it says so",
              "No boot diff" in out and "Ids that vanished: 3." in out, out)
    finally:
        sb.close()


def dependencies():
    """D2: a library added to the tree a minute ago (its metafile in the index, its jar in a jar cache, not yet in
    the instance) provides its mod to the next `add`. A jar in a cache that the index does not name provides nothing."""
    print("dependencies of add (D2)")
    sb = Sandbox()
    try:
        lib = os.path.join(sb.dir, "downloads", "gatelib-1.0.0.jar")
        build_plain_jar(lib, "gatelib", "1.0.0")
        build_plain_jar(os.path.join(sb.dir, "downloads", "gatestray-1.0.0.jar"), "gatestray", "1.0.0")
        rc, out = sb.intake("add", lib, "--side", "both", "--url", "https://example.invalid/gatelib-1.0.0.jar",
                            "--slug", "gate-lib", "--no-boot", "--no-client-check", "--mods", sb.jars)
        check("add: a library with no dependency goes in", rc == 0, out)
        same = os.path.join(sb.dir, "downloads", "gatedep-1.0.0.jar")
        build_plain_jar(same, "gatedep", "1.0.0", needs=("gatelib",))
        rc, out = sb.intake("add", same, "--side", "both", "--url", "https://example.invalid/gatedep-1.0.0.jar",
                            "--slug", "gate-dep", "--no-boot", "--no-client-check", "--mods", sb.jars)
        check("add: a mod that needs the library just added, from the same folder, goes in", rc == 0 and "it needs" not in out, out)
        other = os.path.join(sb.dir, "elsewhere", "gatedep2-1.0.0.jar")
        build_plain_jar(other, "gatedep2", "1.0.0", needs=("gatelib",))
        rc, out = sb.intake("add", other, "--side", "both", "--url", "https://example.invalid/gatedep2-1.0.0.jar",
                            "--slug", "gate-dep2", "--no-boot", "--no-client-check", "--mods", sb.jars, jar_cache=os.path.join(sb.dir, "downloads"))
        check("add: ... and from another folder, the library's in ICRAFT_BOOT_JAR_CACHE", rc == 0 and "it needs" not in out, out)
        stray = os.path.join(sb.dir, "elsewhere", "gatedep3-1.0.0.jar")
        build_plain_jar(stray, "gatedep3", "1.0.0", needs=("gatestray",))
        rc, out = sb.intake("add", stray, "--side", "both", "--url", "https://example.invalid/gatedep3-1.0.0.jar",
                            "--slug", "gate-dep3", "--no-boot", "--mods", sb.jars, jar_cache=os.path.join(sb.dir, "downloads"))
        check("add: a jar in a cache that the index does not name provides nothing",
              rc == 2 and "it needs gatestray" in out and not sb.exists(ROOT + "gate-dep3.pw.toml"), out)

        # D3: update checks the new jar's dependencies the same way, before the metafile is rewritten
        print("dependencies of update (D3)")
        jar1 = os.path.join(sb.jars, "gate-test-mod-1.0.0.jar")
        build_jar(jar1, "1.0.0")
        rc, out = sb.intake("add", jar1, "--side", "both", "--url", "https://example.invalid/gate-test-mod-1.0.0.jar",
                            "--slug", SLUG, "--no-boot", "--no-client-check", "--mods", sb.jars)
        lacking = os.path.join(sb.dir, "new", "gate-test-mod-1.1.0.jar")
        build_jar(lacking, "1.1.0", needs=("gatemissing",))
        watched = [ROOT, SERVER, CLIENT, RECORDS]
        before = sb.digest(watched)
        rc, out = sb.intake("update", SLUG, lacking, "--url", "https://example.invalid/gate-test-mod-1.1.0.jar", "--no-boot", "--mods", sb.jars)
        check("update: a new jar that needs a mod nothing provides is refused, and nothing is written",
              rc == 2 and "needs gatemissing" in out and sb.digest(watched) == before, out)
        rc, out = sb.intake("update", SLUG, lacking, "--old-jar", jar1, "--diff-only", "--mods", sb.jars)
        check("update --diff-only: reports the missing dependency and writes nothing",
              rc == 0 and "DEPENDENCY: the new jar needs gatemissing" in out and sb.digest(watched) == before, out)
        wants_lib = os.path.join(sb.dir, "new", "gate-test-mod-1.2.0.jar")
        build_jar(wants_lib, "1.2.0", needs=("gatelib",))
        rc, out = sb.intake("update", SLUG, wants_lib, "--url", "https://example.invalid/gate-test-mod-1.2.0.jar", "--no-boot",
                            "--no-client-check", "--mods", sb.jars, jar_cache=os.path.join(sb.dir, "downloads"))
        check("update: a new jar that needs the library the tree has goes in",
              rc == 0 and b"gate-test-mod-1.2.0.jar" in sb.read(ROOT + SLUG + ".pw.toml"), out)
    finally:
        sb.close()


def main():
    gate_cases()
    flow()
    update_with_boot()
    dependencies()
    bad = [n for n, ok in RESULTS if not ok]
    print("")
    print("intake_test: %d checks, %d failed" % (len(RESULTS), len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
