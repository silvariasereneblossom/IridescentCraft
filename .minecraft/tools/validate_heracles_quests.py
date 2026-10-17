#!/usr/bin/env python3
"""Validate Heracles quest JSON against the bytecode-verified codec shape.

Reference: .minecraft/wiki/design/heracles-json-shape.md (Heracles 1.1.13).
Catches the documented footguns BEFORE they reach the (server-authoritative) live tree:
  - quest ID = filename-before-first-dot; cross-dir filename collisions silently overwrite
  - unknown task `type` -> task silently dropped -> quest renders NaN% / auto-completes
  - missing required per-type fields -> same silent-drop / NaN
  - `hidden` is an ENUM not a bool
  - `dependencies` to a non-existent ID is silently removed -> quest unlocks immediately
  - field-casing traps: task `xpType` vs reward `xptype`; settings camelCase keys
  - a kill task's `entity` written as a bare string -> that task does not decode -> the WHOLE quest
    loads with no task and can never be completed (21 quests, found 2026-10-13)
  - a kill task whose entity id is not a registered entity type -> it decodes as `minecraft:pig`
  - a reward, a task or an advancement task naming an id the game does not have (checked against the
    registry snapshot dev/registry of a full-pack boot): an item reward that is no item, a loot-table
    reward whose table exists nowhere (Heracles then gives nothing and only tells the player "Loot table
    ... does not exist!"; five scroll rewards did that from the day they were written until 2026-10-17),
    a task item that is no item, an advancement that does not exist. A table the quest tree's own pack
    ships under kubejs/data/<ns>/loot_tables/ counts before the snapshot is refreshed; a table the game's
    parser rejected (dev/registry/loot_tables_rejected.txt) does not. An icon that is no item is a WARN.

Also emits non-fatal NOTES for pack-specific smells (placeholder `kubejs:*` tokens,
"BUILD NOTE"/"placeholder"/"TODO" copy, references to the non-existent
`/icraft_quests` command).

Usage: python3 validate_heracles_quests.py [QUESTS_ROOT] [--require-entity-list]
       default QUESTS_ROOT = .minecraft/config/heracles/quests
       --require-entity-list   fail (exit 2) when a list of the registry snapshot (dev/registry/
                               entity_types.txt, items.txt, loot_tables.txt, advancements.txt) is not
                               found above the quests root, instead of skipping that check with a NOTE.
                               The gates pass it: a checkout that lacks a list must not look like a pass.
Exit code 1 if any ERROR is found, 2 when the run could not be made (no quest file, or a snapshot list
missing with --require-entity-list). An error in a file listed in OWED is printed under OWED and does not fail
the run: the quest is known to be broken and waits for a decision.

Where it runs (since 2026-10-13; before that nobody ran it, and 51 kill tasks of the bare-string shape
reached main): the pre-push hook, on all three quest trees, when a pushed commit changes a file under
any distro's config/heracles/, a list of the snapshot it reads, or a loot table under any distro's
kubejs/data (dev/install-hooks.ps1, the block "Heracles quest validator"), and the GitHub Action
heracles-quests.yml. validate_heracles_quests_test.py plants each defect the validator
exists for and requires the refusal.
"""
import json
import os
import re
import sys
from pathlib import Path

# ---- codec spec (from heracles-json-shape.md) -------------------------------
# task type -> (required fields, optional fields)
TASK_TYPES = {
    "heracles:kill_entity":       ({"entity"}, {"amount"}),
    "heracles:advancement":       ({"advancements"}, set()),
    "heracles:item":              ({"item"}, {"nbt", "amount", "collection", "manual"}),
    "heracles:biome":             ({"biomes"}, set()),
    "heracles:structure":         ({"structures"}, set()),
    "heracles:changed_dimension": (set(), {"from", "to"}),
    "heracles:check":             (set(), {"nbt"}),
    "heracles:dummy":             ({"value"}, {"description"}),
    "heracles:entity_interaction": ({"entity"}, {"nbt"}),
    "heracles:item_interaction":  ({"item"}, {"nbt"}),
    "heracles:item_use":          ({"item"}, {"nbt"}),
    "heracles:block_interaction": ({"block"}, {"state", "nbt"}),
    "heracles:location":          ({"title", "description", "predicate"}, set()),
    "heracles:recipe":            ({"recipes"}, set()),
    "heracles:stat":              ({"stat", "target"}, set()),
    "heracles:composite":         ({"amount", "tasks"}, set()),
    "heracles:xp":                (set(), {"amount", "xpType", "collectionType"}),
}
# leaf tasks accept the shared base fields; composite does NOT have title/icon
BASE_TASK_FIELDS = {"type", "title", "icon"}

REWARD_TYPES = {
    "heracles:command":    ({"command"}, set()),
    "heracles:item":       ({"item"}, set()),
    "heracles:loottable":  ({"loot_table"}, set()),
    "heracles:selectable": ({"rewards"}, {"amount"}),
    "heracles:xp":         (set(), {"xptype", "amount"}),
}
BASE_REWARD_FIELDS = {"type", "title", "icon"}

HIDDEN_ENUM = {"LOCKED", "IN_PROGRESS", "COMPLETED", "DEPENDENCIES_VISIBLE"}

# heracles:kill_entity `entity` = resourcefullib RestrictedEntityPredicate, a record codec (its bytecode):
# `type` is the one required key, the others are optional. It compares ONE entity type, no tag, no list.
ENTITY_PREDICATE_KEYS = {"type", "location", "effects", "nbt", "flags", "target"}

# quest file (path under the quests root) -> why its errors do not fail the run.
# A quest goes here only while it is left broken ON PURPOSE, with the decision it waits for.
# Empty since 2026-10-14: its one entry, overworld_foundations/ovf_brutal_boss.json, was removed from the
# pack on the operator's ruling (its kill tasks named Brutal Bosses ids that are not entity types).
OWED = {}
SETTINGS_KEYS = {  # correct casing -> common wrong casing to warn on
    "individual_progress", "hidden", "unlockNotification",
    "showDependencyArrow", "repeatable", "autoClaimRewards",
}

errors, warns, notes, owed = [], [], [], []
def err(f, m):
    if str(f).replace("\\", "/") in OWED:
        owed.append(f"  [OWED]  {f}: {m}")
    else:
        errors.append(f"  [ERROR] {f}: {m}")
def warn(f, m): warns.append(f"  [WARN]  {f}: {m}")
def note(f, m): notes.append(f"  [NOTE]  {f}: {m}")


ENTITY_TYPES = None   # the entity types of a real full-pack boot (dev/registry/entity_types.txt), when found
ITEMS = None          # its items (dev/registry/items.txt)
LOOT_TABLES = None    # its loaded loot tables + the tables the tree's own pack ships, minus the rejected ones
REJECTED_TABLES = set()
ADVANCEMENTS = None   # its advancements (dev/registry/advancements.txt)
PACK_DATA = None      # the kubejs/data folder whose loot tables count (the quest tree's own distribution)


def load_registry_list(root: Path, name: str):
    """dev/registry/<name> of the pack the quests root belongs to, as a set, or None"""
    for up in [root.resolve()] + list(root.resolve().parents):
        f = up / "dev" / "registry" / name
        if f.is_file():
            return {l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")}
    return None


def load_entity_types(root: Path):
    """dev/registry/entity_types.txt of the pack the quests root belongs to, or None"""
    return load_registry_list(root, "entity_types.txt")


def pack_loot_tables(root: Path):
    """(the kubejs/data folder nearest above the quests root, the loot table ids it ships) or (None, set())"""
    for up in [root.resolve()] + list(root.resolve().parents):
        data = up / "kubejs" / "data"
        if data.is_dir():
            ids = set()
            for f in data.glob("*/loot_tables/**/*.json"):
                rel = f.relative_to(data).as_posix()          # <ns>/loot_tables/<path>.json
                ns, _, path = rel.partition("/loot_tables/")
                ids.add(f"{ns}:{path[:-len('.json')]}")
            try:
                shown = Path(os.path.relpath(data)).as_posix()
            except ValueError:   # another drive
                shown = data.as_posix()
            return shown, ids
    return None, set()


def check_kill_entity(f, where, ent):
    """`entity` of a heracles:kill_entity task"""
    if isinstance(ent, str):
        err(f, f"{where} (heracles:kill_entity) 'entity' is the bare string '{ent}'. Heracles reads an OBJECT: "
               f"\"entity\": {{ \"type\": \"{ent}\" }}. This task does not decode, and then the WHOLE quest loads "
               f"with no task: it shows in the book and can never be completed.")
        eid = ent
    elif isinstance(ent, dict):
        eid = ent.get("type")
        if not isinstance(eid, str):
            err(f, f"{where} (heracles:kill_entity) 'entity' has no 'type' string -> the task does not decode "
                   f"-> the whole quest loads with no task")
            return
        for extra in set(ent) - ENTITY_PREDICATE_KEYS:
            warn(f, f"{where} (heracles:kill_entity) entity has an unexpected key '{extra}' "
                    f"(the predicate reads {sorted(ENTITY_PREDICATE_KEYS)})")
    else:
        if ent is not None:
            err(f, f"{where} (heracles:kill_entity) 'entity' must be an object {{ \"type\": \"<id>\" }}")
        return
    if eid.startswith("#"):
        err(f, f"{where} (heracles:kill_entity) entity '{eid}' is a tag: the predicate compares ONE entity type")
    elif ENTITY_TYPES is not None and eid not in ENTITY_TYPES:
        err(f, f"{where} (heracles:kill_entity) entity '{eid}' is not a registered entity type: in the object "
               f"form it decodes as minecraft:pig (the registry's default entry), so the task would count pigs")


def quest_id(path: Path) -> str:
    name = path.name
    return name[:name.index(".")] if "." in name else name


def check_item_token(f, where, item):
    """Flag legacy placeholder token namespace."""
    iid = item.get("id") if isinstance(item, dict) else item
    if isinstance(iid, str) and iid.startswith("kubejs:") and "token" in iid:
        note(f, f"{where} uses legacy placeholder token '{iid}' "
                f"(live pool token is icraft:progression_token_tN)")


def item_id_of(item):
    """the item id of a task / reward / icon `item` (a string, or an object with `id`), or None"""
    iid = item.get("id") if isinstance(item, dict) else item
    return iid if isinstance(iid, str) else None


def check_item_registered(f, where, item, what):
    """an item id (not a #tag) against dev/registry/items.txt"""
    iid = item_id_of(item)
    if iid is None or ITEMS is None or iid.startswith("#") or iid in ITEMS:
        return
    err(f, f"{where} {what} '{iid}' is not a registered item (dev/registry/items.txt): "
           + ("the player is given nothing for it" if what == "reward item" else
              "the task can never be completed"))


def check_loot_table(f, where, table):
    """a heracles:loottable reward's table against the snapshot and the tables the pack ships"""
    if LOOT_TABLES is None or not isinstance(table, str):
        return
    if table in REJECTED_TABLES:
        err(f, f"{where} loot table '{table}' is rejected by the game's parser "
               f"(dev/registry/loot_tables_rejected.txt): it does not exist in game, the reward gives nothing")
    elif table not in LOOT_TABLES:
        err(f, f"{where} loot table '{table}' exists nowhere (not in dev/registry/loot_tables.txt, not under "
               f"{PACK_DATA}/<ns>/loot_tables/): Heracles gives nothing and tells the player "
               f"\"Loot table {table} does not exist!\"")


def check_icon(f, icon):
    """display.icon: an item icon that is no item shows nothing (WARN, the quest still works)"""
    if not isinstance(icon, dict) or ITEMS is None:
        return
    inner = icon.get("item")
    if isinstance(inner, dict) and "item" in inner and "id" not in inner:
        inner = inner.get("item")    # the nested { "type": "heracles:item", "item": ... } form
    iid = item_id_of(inner)
    if iid and not iid.startswith("#") and iid not in ITEMS:
        warn(f, f"display.icon item '{iid}' is not a registered item (dev/registry/items.txt): the icon shows nothing")


def validate_tasks(f, tasks, ctx="tasks"):
    if not isinstance(tasks, dict):
        err(f, f"{ctx} must be a JSON object keyed by name, not {type(tasks).__name__}")
        return
    for key, t in tasks.items():
        if not isinstance(t, dict):
            err(f, f"{ctx}.{key} is not an object"); continue
        ttype = t.get("type")
        if ttype not in TASK_TYPES:
            err(f, f"{ctx}.{key} unknown task type '{ttype}' -> task silently dropped (NaN%)")
            continue
        req, opt = TASK_TYPES[ttype]
        allowed = req | opt | (set() if ttype == "heracles:composite" else BASE_TASK_FIELDS)
        for r in req - set(t):
            err(f, f"{ctx}.{key} ({ttype}) missing required field '{r}'")
        for extra in set(t) - allowed - {"type"}:
            warn(f, f"{ctx}.{key} ({ttype}) unexpected field '{extra}' "
                    f"(typo? silently ignored by codec)")
        if ttype == "heracles:xp" and "xptype" in t:
            err(f, f"{ctx}.{key} XP TASK uses reward-casing 'xptype'; task field is 'xpType'")
        if ttype == "heracles:item":
            itm = t.get("item")
            if isinstance(itm, dict):
                err(f, f"{ctx}.{key} (heracles:item) 'item' is an OBJECT -> a TASK item is a "
                       f"RegistryValue (ID string or #tag), NOT an ItemStack. An object item (esp. one "
                       f"with an 'nbt' string) fails the codec -> task silently dropped -> quest renders "
                       f"NaN%. Use a string item + (if needed) a separate 'nbt' field.")
            check_item_token(f, f"{ctx}.{key} task", itm)
            if isinstance(itm, str):
                check_item_registered(f, f"{ctx}.{key} (heracles:item)", itm, "task item")
        if ttype in ("heracles:item_interaction", "heracles:item_use"):
            if isinstance(t.get("item"), str):
                check_item_registered(f, f"{ctx}.{key} ({ttype})", t.get("item"), "task item")
        if ttype == "heracles:advancement" and ADVANCEMENTS is not None:
            advs = t.get("advancements")
            for a in (advs if isinstance(advs, list) else []):
                if isinstance(a, str) and a not in ADVANCEMENTS:
                    err(f, f"{ctx}.{key} (heracles:advancement) advancement '{a}' does not exist "
                           f"(dev/registry/advancements.txt): the task can never be completed")
        if ttype == "heracles:kill_entity":
            check_kill_entity(f, f"{ctx}.{key}", t.get("entity"))
        if ttype == "heracles:composite":
            validate_tasks(f, t.get("tasks", {}), f"{ctx}.{key}.tasks")


def validate_rewards(f, rewards, ctx="rewards"):
    if not isinstance(rewards, dict):
        err(f, f"{ctx} must be a JSON object, not {type(rewards).__name__}"); return
    for key, r in rewards.items():
        if not isinstance(r, dict):
            err(f, f"{ctx}.{key} is not an object"); continue
        rtype = r.get("type")
        if rtype not in REWARD_TYPES:
            err(f, f"{ctx}.{key} unknown reward type '{rtype}'"); continue
        req, opt = REWARD_TYPES[rtype]
        for rq in req - set(r):
            err(f, f"{ctx}.{key} ({rtype}) missing required field '{rq}'")
        if rtype == "heracles:xp" and "xpType" in r:
            err(f, f"{ctx}.{key} XP REWARD uses task-casing 'xpType'; reward field is 'xptype'")
        if rtype == "heracles:item":
            check_item_token(f, f"{ctx}.{key} reward", r.get("item"))
            check_item_registered(f, f"{ctx}.{key} (heracles:item)", r.get("item"), "reward item")
        if rtype == "heracles:loottable":
            check_loot_table(f, f"{ctx}.{key} (heracles:loottable)", r.get("loot_table"))
        if rtype == "heracles:command":
            cmd = r.get("command", "")
            if "icraft_quests" in cmd:
                note(f, f"{ctx}.{key} calls '/icraft_quests ...' which is NOT a registered command")
            m = re.search(r"icraft:quest/[\w/]+", cmd)
            if m:
                note(f, f"{ctx}.{key} grants advancement '{m.group(0)}' "
                        f"(verify it exists in a datapack)")
        if rtype == "heracles:selectable":
            validate_rewards(f, r.get("rewards", {}), f"{ctx}.{key}.rewards")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if flags - {"--require-entity-list"}:
        print(f"unknown option: {' '.join(sorted(flags - {'--require-entity-list'}))}"); sys.exit(2)
    root = Path(args[0]) if args else Path(
        ".minecraft/config/heracles/quests")
    files = sorted(root.rglob("*.json"))
    if not files:
        print(f"No quest JSON under {root}"); sys.exit(2)
    global ENTITY_TYPES, ITEMS, LOOT_TABLES, REJECTED_TABLES, ADVANCEMENTS, PACK_DATA
    ENTITY_TYPES = load_entity_types(root)
    if ENTITY_TYPES is None:
        if "--require-entity-list" in flags:
            print(f"CANNOT RUN: dev/registry/entity_types.txt not found above {root} (--require-entity-list): "
                  f"the kill-task ids could not be checked against the registered entity types")
            sys.exit(2)
        note(Path("."), "dev/registry/entity_types.txt not found above the quests root: kill-task ids are NOT "
                        "checked against the registered entity types")
    ITEMS = load_registry_list(root, "items.txt")
    loaded = load_registry_list(root, "loot_tables.txt")
    ADVANCEMENTS = load_registry_list(root, "advancements.txt")
    REJECTED_TABLES = load_registry_list(root, "loot_tables_rejected.txt") or set()
    PACK_DATA, shipped = pack_loot_tables(root)
    LOOT_TABLES = None if loaded is None else (loaded | shipped) - REJECTED_TABLES
    for name, got, what in (("items.txt", ITEMS, "item ids of rewards, tasks and icons"),
                            ("loot_tables.txt", loaded, "loot-table rewards"),
                            ("advancements.txt", ADVANCEMENTS, "advancement tasks")):
        if got is None:
            if "--require-entity-list" in flags:
                print(f"CANNOT RUN: dev/registry/{name} not found above {root} (--require-entity-list): "
                      f"the {what} could not be checked against the game's own list")
                sys.exit(2)
            note(Path("."), f"dev/registry/{name} not found above the quests root: the {what} are NOT checked")

    ids = {}
    parsed = {}
    for f in files:
        rel = f.relative_to(root).as_posix()
        name = f.name
        if name.count(".") > 1:
            warn(rel, f"filename has extra dots -> ID truncates at first dot ('{quest_id(f)}')")
        if not re.fullmatch(r"[a-z0-9_]+\.json", name):
            warn(rel, "filename should be [a-z0-9_]+.json")
        qid = quest_id(f)
        if qid in ids:
            err(rel, f"quest ID '{qid}' collides with {ids[qid]} -> one silently overwrites")
        ids[qid] = rel
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"JSON parse error: {e}"); continue
        parsed[qid] = (rel, data)

    all_ids = set(parsed)
    groups_seen = {}
    for qid, (rel, data) in parsed.items():
        if not isinstance(data, dict):
            err(rel, "top-level is not an object"); continue
        # settings
        st = data.get("settings", {})
        if isinstance(st, dict):
            h = st.get("hidden")
            if h is not None and h not in HIDDEN_ENUM:
                err(rel, f"settings.hidden='{h!r}' not in {sorted(HIDDEN_ENUM)} "
                         f"(enum, not bool) -> falls back to LOCKED")
            for k in set(st) - SETTINGS_KEYS:
                warn(rel, f"settings.{k} unexpected (casing typo? silently ignored)")
        # dependencies
        deps = data.get("dependencies", [])
        if not isinstance(deps, list):
            err(rel, "dependencies must be a JSON array")
        else:
            for d in deps:
                if d not in all_ids:
                    err(rel, f"dependency '{d}' does not resolve -> silently dropped "
                             f"(quest may unlock immediately)")
        # groups
        disp = data.get("display", {})
        for g in (disp.get("groups", {}) if isinstance(disp, dict) else {}):
            groups_seen.setdefault(g, []).append(qid)
        if isinstance(disp, dict):
            check_icon(rel, disp.get("icon"))
        # tasks / rewards
        if "tasks" in data:
            validate_tasks(rel, data["tasks"])
        else:
            note(rel, "no tasks -> quest is a label/auto-complete node")
        if "rewards" in data:
            validate_rewards(rel, data["rewards"])
        # copy smells
        blob = json.dumps(data)
        for flagword in ("BUILD NOTE", "placeholder", "TODO", "FIXME"):
            if flagword.lower() in blob.lower():
                note(rel, f"copy contains '{flagword}' (unfinished content)")
                break

    print(f"== Heracles quest validation: {len(files)} files under {root} ==\n")
    print(f"Groups referenced ({len(groups_seen)}): "
          + ", ".join(f"{g}({len(v)})" for g, v in sorted(groups_seen.items())) + "\n")
    for label, bucket in (("ERRORS", errors), ("OWED", owed), ("WARNINGS", warns), ("NOTES", notes)):
        print(f"--- {label}: {len(bucket)} ---")
        print("\n".join(bucket) if bucket else "  (none)")
        if label == "OWED":
            for path, why in sorted(OWED.items()):
                print(f"  why {path} is owed: {why}")
        print()
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
