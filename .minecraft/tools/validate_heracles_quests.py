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

Also emits non-fatal NOTES for pack-specific smells (placeholder `kubejs:*` tokens,
"BUILD NOTE"/"placeholder"/"TODO" copy, references to the non-existent
`/icraft_quests` command).

Usage: python3 validate_heracles_quests.py [QUESTS_ROOT]
       default QUESTS_ROOT = .minecraft/config/heracles/quests
Exit code 1 if any ERROR is found.
"""
import json
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
SETTINGS_KEYS = {  # correct casing -> common wrong casing to warn on
    "individual_progress", "hidden", "unlockNotification",
    "showDependencyArrow", "repeatable", "autoClaimRewards",
}

errors, warns, notes = [], [], []
def err(f, m):  errors.append(f"  [ERROR] {f}: {m}")
def warn(f, m): warns.append(f"  [WARN]  {f}: {m}")
def note(f, m): notes.append(f"  [NOTE]  {f}: {m}")


def quest_id(path: Path) -> str:
    name = path.name
    return name[:name.index(".")] if "." in name else name


def check_item_token(f, where, item):
    """Flag legacy placeholder token namespace."""
    iid = item.get("id") if isinstance(item, dict) else item
    if isinstance(iid, str) and iid.startswith("kubejs:") and "token" in iid:
        note(f, f"{where} uses legacy placeholder token '{iid}' "
                f"(live pool token is icraft:progression_token_tN)")


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
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        ".minecraft/config/heracles/quests")
    files = sorted(root.rglob("*.json"))
    if not files:
        print(f"No quest JSON under {root}"); sys.exit(2)

    ids = {}
    parsed = {}
    for f in files:
        rel = f.relative_to(root)
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
    for label, bucket in (("ERRORS", errors), ("WARNINGS", warns), ("NOTES", notes)):
        print(f"--- {label}: {len(bucket)} ---")
        print("\n".join(bucket) if bucket else "  (none)")
        print()
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
