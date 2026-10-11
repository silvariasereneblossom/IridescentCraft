#!/usr/bin/env python
"""Write the forwarding ("alias") loot tables listed in alias_tables.json into kubejs/data.

Why they exist: some generated structures' chests name a loot table id that nothing ships (a typo,
a legacy id, a structure path pasted into the LootTable field). Such a chest is empty in game. An
alias table gives that id a table whose single pool forwards to the table the chest was meant to
roll.

  python -I .minecraft/dev/loot_audit/gen_alias_tables.py            # write / refresh
  python -I .minecraft/dev/loot_audit/gen_alias_tables.py --check    # exit 1 if a file is missing or differs

Only the main distro (.minecraft/kubejs/data) is written; sync-distros.ps1 -Fix mirrors it.
audit_loot.py reads the same map: it fails when a target is not a shipped table and reports pack
rules that reach a target but not its alias (LootJS keys on the ROOT table id, i.e. the alias).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MC = os.path.normpath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(MC, "kubejs", "data")


def load_map():
    with open(os.path.join(HERE, "alias_tables.json"), encoding="utf-8") as f:
        return json.load(f)["aliases"]


def table_path(table_id):
    ns, path = table_id.split(":", 1)
    # An id may end in "/" (ctov:village/desert/): the file is then literally ".json".
    return os.path.join(DATA, ns, "loot_tables", *(path + ".json").split("/"))


def render(targets):
    table = {
        "type": "minecraft:chest",
        "pools": [{
            "rolls": 1,
            "entries": [{"type": "minecraft:loot_table", "name": t, "weight": 1} for t in targets],
        }],
    }
    return json.dumps(table, indent=2) + "\n"


def git_ignored(paths):
    """Paths git would refuse to track. A table that exists here but is ignored never ships
    (.gitignore has bare mod-id dir rules such as 'idas/' for extracted-jar artifacts)."""
    import subprocess
    try:
        r = subprocess.run(["git", "-C", MC, "check-ignore", "--stdin"], input="\n".join(paths),
                           capture_output=True, text=True, timeout=60)
    except Exception as e:      # no git: cannot tell, do not fail the check on that
        print("[alias-tables] git check-ignore not run: %s" % e)
        return []
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def main():
    check = "--check" in sys.argv[1:]
    bad = 0
    ignored = git_ignored([os.path.relpath(table_path(a), MC).replace(os.sep, "/") for a in load_map()])
    for p in ignored:
        print("[alias-tables] GIT-IGNORED (would never ship): %s" % p)
    if ignored:
        return 1
    for alias, spec in sorted(load_map().items()):
        want = render(spec["targets"])
        p = table_path(alias)
        have = None
        if os.path.isfile(p):
            with open(p, encoding="utf-8", newline="") as f:
                have = f.read()
        if have == want:
            continue
        if check:
            print("[alias-tables] %s: %s" % ("MISSING" if have is None else "DIFFERS", os.path.relpath(p, MC)))
            bad += 1
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(want)
        print("[alias-tables] wrote %s" % os.path.relpath(p, MC))
    print("[alias-tables] %d alias table(s), %s" % (len(load_map()), ("%d not in sync" % bad) if bad else "in sync"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
