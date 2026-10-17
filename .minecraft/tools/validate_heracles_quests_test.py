#!/usr/bin/env python3
"""validate_heracles_quests_test.py -- does the quest validator refuse what it exists to refuse?

Builds a small quest tree in a temporary folder (with its own dev/registry lists above it, and one
loot table the folder's pack ships under kubejs/data), breaks it in one way at a time and runs validate_heracles_quests.py on it. Each case is a
defect this pack has had, or the validator's own contract:

  a kill task whose `entity` is a bare string   (2026-10-13: 51 tasks, 21 quests that could never be completed)
  a kill task naming an id that is no entity    (it decodes as minecraft:pig)
  a kill task naming a tag
  an unknown task type                          (the task is dropped, the quest shows NaN %)
  a dependency on a quest that does not exist   (dropped: the quest unlocks at once)
  `hidden` written as a bool
  two files with one quest id
  a file that is not JSON
  no entity list above the tree, with --require-entity-list   (exit 2: "could not run" is not a pass)
  a reward item that is no item                 (2026-10-17: tetra:repair_kit_iron, a reward that gave nothing)
  a loot-table reward whose table exists nowhere (2026-10-17: icraft:magic/scroll_t1, five rewards that gave nothing)
  a loot-table reward whose table the parser rejected
  a task item that is no item, an advancement task naming no advancement, an icon that is no item (WARN)
  the item list missing, with --require-entity-list
  (and two that must pass: a table the pack ships before the snapshot lists it, an item reward that exists)

Nothing in the real tree is touched. Usage: python .minecraft/tools/validate_heracles_quests_test.py
Exit 0 when every case behaves, 1 otherwise.
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "validate_heracles_quests.py")

GOOD = {
    "combat/kill_zombies.json": {
        "display": {"groups": {"Combat": {"position": [0, 0]}}},
        "settings": {"hidden": "LOCKED"},
        "dependencies": [],
        "tasks": {"kill": {"type": "heracles:kill_entity", "amount": 30, "entity": {"type": "minecraft:zombie"}}},
        "rewards": {"xp": {"type": "heracles:xp", "xptype": "LEVEL", "amount": 1},
                    "iron": {"type": "heracles:item", "item": {"id": "minecraft:iron_ingot", "count": 3}},
                    "chest": {"type": "heracles:loottable", "loot_table": "minecraft:chests/simple_dungeon"}},
    },
    "combat/kill_two.json": {
        "display": {"groups": {"Combat": {"position": [1, 0]}}},
        "dependencies": ["kill_zombies"],
        "tasks": {"both": {"type": "heracles:composite", "amount": 2, "tasks": {
            "a": {"type": "heracles:kill_entity", "amount": 1, "entity": {"type": "minecraft:zombie"}},
            "b": {"type": "heracles:kill_entity", "amount": 1, "entity": {"type": "minecraft:wither"}}}}},
        "rewards": {"scroll": {"type": "heracles:loottable", "loot_table": "pack:magic/shipped"}},
    },
    "onboarding/iron_tools.json": {
        "display": {"icon": {"type": "heracles:item", "item": "minecraft:iron_pickaxe"},
                    "groups": {"Onboarding": {"position": [0, 0]}}},
        "tasks": {"pick": {"type": "heracles:advancement", "advancements": ["minecraft:story/iron_tools"]},
                  "have": {"type": "heracles:item", "item": "minecraft:iron_ingot", "amount": 1}},
    },
}
ENTITY_TYPES = ["minecraft:zombie", "minecraft:wither", "minecraft:pig"]
# the rest of the snapshot (dev/registry) the tree is checked against
SNAPSHOT = {
    "items.txt": ["minecraft:iron_ingot", "minecraft:iron_pickaxe"],
    "loot_tables.txt": ["minecraft:chests/simple_dungeon", "minecraft:chests/broken_by_parser"],
    "loot_tables_rejected.txt": ["minecraft:chests/broken_by_parser"],
    "advancements.txt": ["minecraft:story/iron_tools"],
}
SHIPPED_TABLE = os.path.join("kubejs", "data", "pack", "loot_tables", "magic", "shipped.json")


def build(tmp, quests, entity_list=True, raw=None, drop=()):
    """a pack-shaped folder: <tmp>/dev/registry/*.txt, <tmp>/kubejs/data/... and <tmp>/config/heracles/quests/...
    (entity_list=False: no dev/registry at all; drop: snapshot lists left out)"""
    root = os.path.join(tmp, "config", "heracles", "quests")
    for rel, data in quests.items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f)
    for rel, text in (raw or {}).items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
    if entity_list:
        os.makedirs(os.path.join(tmp, "dev", "registry"), exist_ok=True)
        with open(os.path.join(tmp, "dev", "registry", "entity_types.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(ENTITY_TYPES) + "\n")
        for name, ids in SNAPSHOT.items():
            if name in drop:
                continue
            with open(os.path.join(tmp, "dev", "registry", name), "w", encoding="utf-8") as f:
                f.write("\n".join(ids) + "\n")
    os.makedirs(os.path.dirname(os.path.join(tmp, SHIPPED_TABLE)), exist_ok=True)
    with open(os.path.join(tmp, SHIPPED_TABLE), "w", encoding="utf-8") as f:
        f.write('{"type": "minecraft:chest", "pools": []}')
    return root


def run(root, *flags):
    r = subprocess.run([sys.executable, "-I", TOOL, root] + list(flags), capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def variant(change):
    q = json.loads(json.dumps(GOOD))
    change(q)
    return q


def set_entity(value):
    def f(q):
        q["combat/kill_zombies.json"]["tasks"]["kill"]["entity"] = value
    return f


def nested_bare(q):
    q["combat/kill_two.json"]["tasks"]["both"]["tasks"]["b"]["entity"] = "minecraft:wither"


def unknown_type(q):
    q["combat/kill_zombies.json"]["tasks"]["kill"]["type"] = "heracles:slay"


def bad_dependency(q):
    q["combat/kill_two.json"]["dependencies"] = ["no_such_quest"]


def hidden_bool(q):
    q["combat/kill_zombies.json"]["settings"]["hidden"] = True


def id_collision(q):
    q["hunter/kill_zombies.json"] = json.loads(json.dumps(GOOD["combat/kill_zombies.json"]))


def reward_item(iid):
    def f(q):
        q["combat/kill_zombies.json"]["rewards"]["iron"]["item"]["id"] = iid
    return f


def reward_table(table):
    def f(q):
        q["combat/kill_zombies.json"]["rewards"]["chest"]["loot_table"] = table
    return f


def selectable_bad_item(q):
    q["combat/kill_two.json"]["rewards"]["pick"] = {"type": "heracles:selectable", "rewards": {
        "a": {"type": "heracles:item", "item": "minecraft:iron_ingot"},
        "b": {"type": "heracles:item", "item": "tetra:repair_kit_iron"}}}


def task_item(q):
    q["onboarding/iron_tools.json"]["tasks"]["have"]["item"] = "minecraft:no_such_ingot"


def advancement(q):
    q["onboarding/iron_tools.json"]["tasks"]["pick"]["advancements"] = ["icraft:stage_tier_9"]


def icon(q):
    q["onboarding/iron_tools.json"]["display"]["icon"]["item"] = "minecraft:no_such_pickaxe"


# (name, quests, expected exit code, text the output must hold, extra arguments for build / run)
CASES = [
    ("the good tree passes", GOOD, 0, "--- ERRORS: 0 ---", {}),
    ("a kill task's entity as a bare string", variant(set_entity("minecraft:zombie")), 1, "is the bare string 'minecraft:zombie'", {}),
    ("a bare string inside a composite task", variant(nested_bare), 1, "is the bare string 'minecraft:wither'", {}),
    ("a kill task naming an id that is not an entity type", variant(set_entity({"type": "brutalbosses:no_such_boss"})), 1,
     "is not a registered entity type", {}),
    ("a kill task naming a tag", variant(set_entity({"type": "#forge:bosses"})), 1, "is a tag", {}),
    ("a kill task whose entity has no type", variant(set_entity({"nbt": "{}"})), 1, "has no 'type' string", {}),
    ("an unknown task type", variant(unknown_type), 1, "unknown task type 'heracles:slay'", {}),
    ("a dependency that does not resolve", variant(bad_dependency), 1, "dependency 'no_such_quest' does not resolve", {}),
    ("hidden written as a bool", variant(hidden_bool), 1, "settings.hidden=", {}),
    ("two files with one quest id", variant(id_collision), 1, "collides with", {}),
    ("a file that is not JSON", GOOD, 1, "JSON parse error", {"raw": {"combat/broken.json": "{ not json"}}),
    ("no entity list: a NOTE without the flag", GOOD, 0, "kill-task ids are NOT checked", {"entity_list": False}),
    ("no entity list: exit 2 with --require-entity-list", GOOD, 2, "CANNOT RUN", {"entity_list": False, "flags": ["--require-entity-list"]}),
    ("an unregistered id is not seen without the list", variant(set_entity({"type": "brutalbosses:no_such_boss"})), 0,
     "--- ERRORS: 0 ---", {"entity_list": False}),
    ("a reward item that is no item", variant(reward_item("tetra:repair_kit_iron")), 1,
     "reward item 'tetra:repair_kit_iron' is not a registered item", {}),
    ("a reward item that is no item, inside a selectable reward", variant(selectable_bad_item), 1,
     "rewards.pick.rewards.b (heracles:item) reward item 'tetra:repair_kit_iron'", {}),
    ("a loot-table reward whose table exists nowhere", variant(reward_table("icraft:magic/scroll_t1")), 1,
     "loot table 'icraft:magic/scroll_t1' exists nowhere", {}),
    ("a loot-table reward whose table the parser rejected", variant(reward_table("minecraft:chests/broken_by_parser")), 1,
     "is rejected by the game's parser", {}),
    ("a table the pack ships counts before the snapshot lists it", GOOD, 0, "--- ERRORS: 0 ---", {}),
    ("a task item that is no item", variant(task_item), 1, "task item 'minecraft:no_such_ingot' is not a registered item", {}),
    ("an advancement task naming no advancement", variant(advancement), 1, "advancement 'icraft:stage_tier_9' does not exist", {}),
    ("an icon that is no item is a WARN, not an error", variant(icon), 0, "display.icon item 'minecraft:no_such_pickaxe'", {}),
    ("no item list: exit 2 with --require-entity-list", GOOD, 2, "CANNOT RUN: dev/registry/items.txt",
     {"drop": ("items.txt",), "flags": ["--require-entity-list"]}),
    ("no loot-table list: a NOTE without the flag", variant(reward_table("icraft:magic/scroll_t1")), 0,
     "the loot-table rewards are NOT checked", {"drop": ("loot_tables.txt",)}),
]


def main():
    bad = 0
    for name, quests, want_rc, want_text, opt in CASES:
        with tempfile.TemporaryDirectory(prefix="hq-test-") as tmp:
            root = build(tmp, quests, entity_list=opt.get("entity_list", True), raw=opt.get("raw"), drop=opt.get("drop", ()))
            rc, out = run(root, *opt.get("flags", []))
        ok = rc == want_rc and want_text in out
        print("%s  %s (exit %d%s)" % ("ok  " if ok else "FAIL", name, rc, "" if rc == want_rc else ", wanted %d" % want_rc))
        if not ok:
            bad += 1
            if want_text not in out:
                print("      the output does not hold: %s" % want_text)
            print("      " + "\n      ".join(out.strip().splitlines()[-12:]))
    print("\n%d case(s), %d failed" % (len(CASES), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
