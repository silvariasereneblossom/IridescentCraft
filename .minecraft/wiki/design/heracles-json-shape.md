# Heracles JSON shape — bytecode-verified reference

*Mod: `Heracles-forge-1.20.1-1.1.13.jar` (ThatGravyBoat / TerrariumEarth, MIT). Decompiled 2026-05-29.*
*Purpose: Canonical field-name / type reference for authoring `config/heracles/quests/**.json` files. Companion to `heracles-quest-tree.md` (task #45). Replaces the §4 sketch in that doc — fields below are bytecode-confirmed, not hypothesized.*

Bytecode citations point at `earth/terrarium/heracles/...` (in-jar paths). Re-verify any of them via `javap -c -p <file>.class` against a future Heracles jar; the static-init blocks of each `Codec` carry the field names as inline `ldc` string constants.

---

## 0. Top of file — what to know before §1

- **Filesystem root.** `<instance>/config/heracles/quests/<anything>/<quest_id>.json`. `<anything>` is purely filesystem organization — see §0.2.
- **Codec engine.** Mojang DFU `Codec` (`RecordCodecBuilder`), parsed via `JsonOps`. The Heracles README does not exist; the on-disk JSON shape is recovered by reading the static `CODEC` field initializers.
- **The pack's only existing quest** (`.minecraft/config/heracles/quests/main/first_blood.json`) is structurally valid but contains one minor field-mismatch — see §10 footnote A.

### 0.1 Top-level shape at a glance

`earth/terrarium/heracles/api/quests/Quest::CODEC` (file `Quest.class`, method `lambda$static$1`):

```jsonc
{
  "display":      { /* QuestDisplay; see §1.1 */ },   // optional, has default
  "settings":     { /* QuestSettings; see §1.2 */ },  // optional, has default
  "dependencies": ["other_quest_id", ...],            // optional, default []
  "tasks":        { "<task_key>": { ... }, ... },     // optional, default {}
  "rewards":      { "<reward_key>": { ... }, ... }    // optional, default {}
}
```

A file with `{}` is parseable and produces a quest with a "New Quest" title and empty tasks/rewards/deps. Every top-level field is optional — the codec uses `.orElseGet(...)` / `.orElse(...)` defaults at every position.

### 0.2 Filesystem → quest ID derivation

**The quest ID is just the bare filename, stripped of the first dot onward.**

Verified path: `QuestHandler.load(...)` calls `FileUtils.streamFilesAndParse(<questsRoot>, ...)` (resourcefullib `com/teamresourceful/resourcefullib/common/utils/FileUtils::readFileAndParse`), which does `getFileName().toString().substring(0, indexOf('.'))`. **No relative-path prefix is included in the ID.** So:

- `config/heracles/quests/main/first_blood.json` → ID `first_blood`
- `config/heracles/quests/chapter_2/naga.json` → ID `naga`
- `config/heracles/quests/main/version.1.json` → ID `version` (FIRST dot wins — see §10 footnote B)
- `config/heracles/quests/chapter_0/first_blood.json` AND `config/heracles/quests/main/first_blood.json` simultaneously → collision; one quest silently overwrites the other in a `HashMap` (no warning in logs verified, see §10 footnote C).

**Authoring rule for the Iridescent quest tree:** Use globally unique filenames. The `<chapter>/` subdirectory is for human filesystem organization only — it neither prefixes the ID nor scopes the namespace. Recommend prefixing every filename with its chapter slug (e.g., `c0_first_blood.json`, `c1_tome_tower_entry.json`) to prevent collisions across chapters.

**Authoring rule, dependencies.** `dependencies` is `Set<String>` of bare quest IDs (no `<modid>:` prefix, no `<chapter>/` prefix). So a chapter-2 quest depending on `c0_first_blood` writes `"dependencies": ["c0_first_blood"]`, NOT `"iridescent:chapter_0/first_blood"`.

### 0.3 What's NOT a field

The §4 sketch in `heracles-quest-tree.md` had these names that DO NOT EXIST in the Heracles codec:

| Sketched name | Reality |
|---|---|
| `id` (top-level) | Not a JSON field. ID derives from filename (§0.2). |
| `depends_on` | Real field is `dependencies`. |
| `chapter` (top-level) | Not a JSON field. Group/chapter is a key inside `display.groups` (§1.3). |
| `iridescent_codex_bonus` | Our extension; the Heracles codec parser will silently ignore unknown top-level keys (`Codec.parse` returns success even when extra fields are present). Safe to include as long as KubeJS reads it raw. |
| `tasks` as a JSON array | Wrong — it's an OBJECT keyed by task-name. See §1.4. |
| `rewards` as a JSON array | Wrong — same; OBJECT keyed by reward-name. See §1.5. |
| `heracles:item_have` | No such type. Acquire-an-item is `heracles:item` (see §2.3, `GatherItemTask`). |

---

## 1. Quest file structure

### 1.1 `display` (QuestDisplay)

`earth/terrarium/heracles/api/quests/QuestDisplay::CODEC`, `lambda$static$1`. Six fields, all optional:

| Field | Type | Default | Notes |
|---|---|---|---|
| `icon` | QuestIcon object | `{"type": "heracles:item", "item": "minecraft:air"}` | Only `heracles:item` type ships; see §1.6. |
| `icon_background` | resource location | `heracles:textures/gui/quest_backgrounds/default.png` | One of 9 built-in textures; see §8.2. |
| `title` | text component | `"New Quest"` | Accepts string OR Mojang component JSON; see §1.7. |
| `subtitle` | text component | `""` (CommonComponents.EMPTY) | Same component handling as `title`. |
| `description` | list of strings | `[]` | Plain strings, one per line. See §1.8. |
| `groups` | map<string, GroupDisplay> | `{"Main": {position: [0,0]}}` | Chapter assignment; see §1.3. |

### 1.2 `settings` (QuestSettings)

`earth/terrarium/heracles/api/quests/QuestSettings::CODEC`, `lambda$static$0`. Six fields, all optional:

| Field | Type | Default | Notes |
|---|---|---|---|
| `individual_progress` | bool | `false` | Per-player progress vs world/team-shared. See §6. |
| `hidden` | enum string | `"LOCKED"` | `QuestDisplayStatus`: `LOCKED` / `IN_PROGRESS` / `COMPLETED` / `DEPENDENCIES_VISIBLE`. Controls when this quest is visible in the tree UI. |
| `unlockNotification` | bool | `false` | Sends "Quest Unlocked!" toast when deps satisfied. **Note camelCase — see §10 footnote D.** |
| `showDependencyArrow` | bool | `true` | Draws an arrow from this quest to its deps in the UI. |
| `repeatable` | bool | `false` | The field's getter signature is `Boolean` (boxed) which suggests the author once considered nullable — current codec is plain `Codec.BOOL` so it's a regular boolean. |
| `autoClaimRewards` | bool | `false` | If true, rewards are granted automatically on quest completion (no "Claim" button click required). |

`hidden` semantics:
- `LOCKED` — quest is fully hidden until deps complete; appears as "locked" thumbnail otherwise (visible silhouette).
- `IN_PROGRESS` — quest is only shown once at least one task has progress.
- `COMPLETED` — quest only shown after completion (a postmortem entry).
- `DEPENDENCIES_VISIBLE` — quest hidden but its deps are visible. Useful for hiding capstones until the player engages with the chapter.

**Important parse footgun** (see §10 footnote A): the existing `first_blood.json` writes `"hidden": false` (boolean), but the codec expects the enum's string name (`"LOCKED"` / `"IN_PROGRESS"` / etc.). `false` is not a valid enum name → `EnumCodec.fieldOf("hidden").orElse(LOCKED)` falls back to default. **Net effect for the existing file: works because the default is LOCKED anyway.** For new authoring, omit the field entirely (default LOCKED) OR write `"hidden": "LOCKED"`.

### 1.3 `display.groups` (chapter/group assignment)

`Map<String, GroupDisplay>`. The keys ARE the chapter/group names. Each value:

```jsonc
{
  "position": [x, y]   // [int, int] -- quest position within the group's 2D canvas
}
```

`GroupDisplay::codec(String)` (`GroupDisplay.class`, `lambda$codec$0`). Note: the codec is parameterized over the group-name string — the group name itself is the MAP KEY and is INJECTED into the GroupDisplay record via `RecordCodecBuilder.point(...)`; you do not need to repeat it inside the value.

Multi-group quests are allowed: a quest that appears in groups `chapter_2` AND `bosses` has both keys in `display.groups` with two different `position` values. (Re-asserted in §4.)

Default group when omitted: `"Main"` at position `[0, 0]`.

### 1.4 `tasks` (Map<String, QuestTask>)

`Map<String, QuestTask<?, ?, ?>>`. Keys are TASK NAMES (free-form, you choose them — they're shown nowhere player-facing but they're used internally for task progress state). Values are dispatched on the `type` field — see §2 for the full task catalog.

Example:
```jsonc
"tasks": {
  "kill_zombies": { "type": "heracles:kill_entity", "entity": "minecraft:zombie", "amount": 10 },
  "find_temple":  { "type": "heracles:structure",   "structures": "minecraft:desert_pyramid" }
}
```

**Implicit AND semantics.** Quest is complete when ALL tasks complete. There is no "OR" or "N-of-M" at this level — for OR semantics use the `heracles:composite` task (§2.16) which itself runs an N-of-M check on its inner tasks.

### 1.5 `rewards` (Map<String, QuestReward>)

`Map<String, QuestReward<?>>`. Same structure as `tasks` — keys are reward names you choose (used for "did this player already claim this specific reward" tracking), values dispatch on `type`. See §3 for the full reward catalog.

### 1.6 `display.icon` (QuestIcon)

Only one icon type registered (`QuestIcons` static init only calls `register(ItemQuestIcon.TYPE)`):

```jsonc
{ "type": "heracles:item", "item": "minecraft:iron_sword" }
```

Or with NBT / tag (item is an `ItemValue` — either a vanilla `ItemStack` codec OR a TagKey):

```jsonc
{ "type": "heracles:item", "item": { "id": "minecraft:diamond_sword", "count": 1, "nbt": "..." } }
{ "type": "heracles:item", "item": "#minecraft:swords" }   // any item in the swords tag, picks first
```

**Texture-path icon types do NOT exist** in Heracles 1.1.13. If you want a custom-PNG icon you either ship it as an item texture override via a resource pack, or pick a vanilla item that displays as your visual. No `heracles:texture` type.

### 1.7 Text components — lang keys vs raw strings

The `title` / `subtitle` use `ExtraCodecs.f_252442_` which is Mojang's `COMPONENT_CODEC` (accepts a string OR an object). Either works:

```jsonc
"title": "First Blood"
"title": {"translate": "quest.iridescent.first_blood.title"}
"title": {"text": "Bold!", "color": "red"}
```

**For the Iridescent pack:** Use translation-key form (`{"translate": "..."}`) per §4.1 of `heracles-quest-tree.md`. Heracles does NOT auto-resolve plain strings as translation keys — a raw string is a literal display string.

The Heracles UI ships its OWN auto-lang-key conventions for task / reward type labels (e.g., `task.heracles.kill_entity.desc.singular` = `"Kill %sx %s"`) and these CANNOT be overridden from the quest JSON. To override the displayed task title, use the per-task `title` field (§2 catalog, every task type has one).

### 1.8 `display.description`

`List<String>`. Each list entry is one line. Plain literal strings only (no rich components in description — verified, `DESCRIPTION_CODEC` is `List<String>`, not `List<Component>`). Empty strings render as blank lines.

**Lang-key trick:** because description entries are plain strings, you cannot natively use `{"translate": "..."}` form. Option: ship one long string with `\n` newlines that IS the literal translation, then write a one-time lang-key in `en_us.json` and reference it from a resource-pack lang transform. Simpler approach for English-only: write literal description text inline, accept the localization debt.

---

## 2. Task types

17 task types are registered (`QuestTasks` static init enumerates each `register(...)` call). All types share four base fields:

- `type` — required, dispatcher key (string, e.g., `"heracles:kill_entity"`).
- `title` — optional, string, default `""`. Override of the auto-generated task title.
- `icon` — optional, QuestIcon object (same shape as `display.icon`), default `{"type":"heracles:item","item":"minecraft:air"}`. Override of the auto-generated task icon.
- Per-type-specific fields (below).

Each task tracks its progress via a typed `TaskStorage`: integer counter for count tasks, boolean flag for binary tasks, NBT-tag for complex state. The Heracles UI auto-renders progress bars / counters for integer storage (e.g., "3/5 zombies killed").

### 2.1 `heracles:kill_entity`

Source: `KillEntityQuestTask$Type::id()` = `(heracles, kill_entity)`. Codec at `lambda$codec$0`.

| Field | Type | Default | Required |
|---|---|---|---|
| `entity` | RestrictedEntityPredicate | — | YES |
| `amount` | int | `1` | no |

`entity` is a resourcefullib `RestrictedEntityPredicate`. The simple form is the entity ID string: `"minecraft:zombie"` or `"#minecraft:undead"`. For more complex predicates (nbt-match, has-attribute) see the resourcefullib RestrictedEntityPredicate schema.

Storage: integer counter. Auto-renders "N/M killed" in UI.

```jsonc
"slay_zombies": {
  "type": "heracles:kill_entity",
  "entity": "minecraft:zombie",
  "amount": 10
}
```

### 2.2 `heracles:advancement`

Source: `AdvancementTask$Type`. Codec strings: `advancements`.

| Field | Type | Default | Required |
|---|---|---|---|
| `advancements` | `Set<ResourceLocation>` (JSON array of advancement IDs) | — | YES |

Multiple advancements act as OR (any one satisfies). Storage is boolean (completed-or-not). No N/M counter.

```jsonc
"unlock_smelt": {
  "type": "heracles:advancement",
  "advancements": ["minecraft:story/smelt_iron", "minecraft:nether/find_fortress"]
}
```

### 2.3 `heracles:item` (GatherItemTask)

Source: `GatherItemTask$Type::id()` = `(heracles, item)`. Has BOTH a new codec and a `legacyCodec` — `Codec.either(newCodec, legacyCodec)` → tries the new shape first.

**New shape:**

| Field | Type | Default | Required |
|---|---|---|---|
| `item` | RegistryValue\<Item\> (item ID or `#tag`) | — | YES |
| `nbt` | NbtPredicate | `ANY` | no |
| `amount` | int | `1` | no |
| `collection` | enum string | `"AUTOMATIC"` | no — `"AUTOMATIC"` / `"MANUAL"` / `"CONSUME"` |

`collection` semantics (from `CollectionType` enum + lang `task.heracles.tasks.collection_type.*`):
- `AUTOMATIC` ("Acquire") — task ticks each time the player has the item in their inventory.
- `MANUAL` ("Submit") — task only progresses when the player clicks the "Submit" button on the task UI. Items NOT consumed.
- `CONSUME` ("Auto-Submit") — task progresses and items are removed from inventory immediately.

**Legacy shape** (still parseable, ignored if new shape parses):

| Field | Type | Default | Required |
|---|---|---|---|
| `item` | RegistryValue\<Item\> | — | YES |
| `nbt` | NbtPredicate | `ANY` | no |
| `amount` | int | `1` | no |
| `manual` | bool | `false` | no — `true` → MANUAL, `false` → CONSUME |

Storage: integer counter. Auto-renders "N/M acquired".

```jsonc
"collect_diamonds": {
  "type": "heracles:item",
  "item": "minecraft:diamond",
  "amount": 8,
  "collection": "AUTOMATIC"
}
"submit_naga_scales": {
  "type": "heracles:item",
  "item": "twilightforest:naga_scale",
  "amount": 4,
  "collection": "CONSUME"
}
"any_sword": {
  "type": "heracles:item",
  "item": "#minecraft:swords",
  "amount": 1
}
```

### 2.4 `heracles:biome`

Source: `BiomeTask$Type`. Codec string: `biomes`.

| Field | Type | Default | Required |
|---|---|---|---|
| `biomes` | RegistryValue\<Biome\> (single biome ID or `#tag`) | — | YES |

Storage: boolean. Triggers when player enters the matched biome.

```jsonc
"visit_savanna": {
  "type": "heracles:biome",
  "biomes": "minecraft:savanna"
}
"visit_undead_biome": {
  "type": "heracles:biome",
  "biomes": "#irons_spellbooks:undead_biomes"
}
```

### 2.5 `heracles:structure`

Source: `StructureTask$Type`. Codec string: `structures`.

| Field | Type | Default | Required |
|---|---|---|---|
| `structures` | RegistryValue\<Structure\> | — | YES |

Storage: boolean. Triggers when player enters the bounding box of the matched structure.

```jsonc
"find_lich_tower": {
  "type": "heracles:structure",
  "structures": "twilightforest:lich_tower"
}
```

### 2.6 `heracles:changed_dimension`

Source: `ChangedDimensionTask$Type`. Codec strings: `from` (optional), `to` (optional). Both fields are optional via `optionalFieldOf` without default — they decode as `Optional<ResourceKey<Level>>` and the task fires when player dimension-changes if either matches (or both, if both specified). Specifying neither = trigger on ANY dimension change.

| Field | Type | Default | Required |
|---|---|---|---|
| `from` | dimension ID | absent (any) | no |
| `to` | dimension ID | absent (any) | no |

Storage: boolean.

```jsonc
"enter_nether": {
  "type": "heracles:changed_dimension",
  "to": "minecraft:the_nether"
}
"leave_aether_to_overworld": {
  "type": "heracles:changed_dimension",
  "from": "aether:the_aether",
  "to": "minecraft:overworld"
}
```

### 2.7 `heracles:check`

Source: `CheckTask$Type`. Codec string: `nbt`.

| Field | Type | Default | Required |
|---|---|---|---|
| `nbt` | NbtPredicate | `ANY` | no |

This is the "manual-complete with NBT condition" task. Storage is boolean; triggers when a manual check passes the NBT predicate. Mostly editor-grade — useful as a placeholder during quest authoring. For player-facing tasks prefer a typed alternative.

### 2.8 `heracles:dummy`

Source: `DummyTask$Type`. Codec strings: `value`, `description`.

| Field | Type | Default | Required |
|---|---|---|---|
| `value` | string | — | YES (the trigger value) |
| `description` | string | `""` | no |

Triggered by the operator-only `/heracles dummy <id>` command (see §7) — fires the task with the given `value`. Useful for hand-scripted quest steps (e.g., KubeJS server scripts).

```jsonc
"watch_dialogue": {
  "type": "heracles:dummy",
  "value": "dialogue_seen",
  "description": "Wait for the dialogue to play."
}
```

Then `/heracles dummy dialogue_seen` from a KubeJS event handler completes the task for the running player.

### 2.9 `heracles:entity_interaction`

Source: `EntityInteractTask$Type`. Codec strings: `entity`, `nbt`.

| Field | Type | Default | Required |
|---|---|---|---|
| `entity` | RegistryValue\<EntityType\> | — | YES |
| `nbt` | NbtPredicate | `ANY` | no |

Storage: boolean. Fires on right-click of a matching entity.

```jsonc
"shake_villager": {
  "type": "heracles:entity_interaction",
  "entity": "minecraft:villager"
}
```

### 2.10 `heracles:item_interaction`

Source: `ItemInteractTask$Type`. Codec strings: `item`, `nbt`. Same shape as entity_interaction but on item right-click (using the item, not interacting with it).

| Field | Type | Default | Required |
|---|---|---|---|
| `item` | RegistryValue\<Item\> | — | YES |
| `nbt` | NbtPredicate | `ANY` | no |

### 2.11 `heracles:item_use`

Source: `ItemUseTask$Type`. Codec strings: `item`, `nbt`. Like `item_interaction` but fires on item-USE (e.g., eat a food, drink a potion, throw an ender pearl). Distinct from item-INTERACTION.

| Field | Type | Default | Required |
|---|---|---|---|
| `item` | RegistryValue\<Item\> | — | YES |
| `nbt` | NbtPredicate | `ANY` | no |

```jsonc
"eat_golden_apple": {
  "type": "heracles:item_use",
  "item": "minecraft:golden_apple"
}
```

### 2.12 `heracles:block_interaction`

Source: `BlockInteractTask$Type`. Codec strings: `block`, `state` (optional), `nbt` (optional).

| Field | Type | Default | Required |
|---|---|---|---|
| `block` | RegistryValue\<Block\> | — | YES |
| `state` | BlockStatePredicate | `ANY` | no |
| `nbt` | NbtPredicate | `ANY` | no |

```jsonc
"open_chest": {
  "type": "heracles:block_interaction",
  "block": "minecraft:chest"
}
```

### 2.13 `heracles:location`

Source: `LocationTask$Type`. Codec strings: `title` (REQUIRED here, not optional), `icon`, `description`, `predicate`.

| Field | Type | Default | Required |
|---|---|---|---|
| `title` | string | — | YES (override default behavior — title is NOT optional for this type) |
| `description` | text component | — | YES |
| `predicate` | vanilla `LocationPredicate` | — | YES |

Uses vanilla advancement `LocationPredicate` shape (biome, dimension, coordinates, fluid, light, smokey, position). Storage: boolean.

```jsonc
"reach_deep_dark": {
  "type": "heracles:location",
  "title": "Descend into the Deep Dark",
  "description": "Reach Y < 0 in the Deep Dark biome.",
  "predicate": {
    "biome": "minecraft:deep_dark",
    "position": {"y": {"max": 0}}
  }
}
```

### 2.14 `heracles:recipe`

Source: `RecipeTask$Type`. Codec string: `recipes`.

| Field | Type | Default | Required |
|---|---|---|---|
| `recipes` | `Set<ResourceLocation>` (JSON array) | — | YES |

Fires when player crafts any recipe in the set. Storage: boolean.

```jsonc
"craft_bronze_pickaxe": {
  "type": "heracles:recipe",
  "recipes": ["tconstruct:smeltery/seared/seared_brick"]
}
```

### 2.15 `heracles:stat`

Source: `StatTask$Type`. Codec strings: `stat`, `target`.

| Field | Type | Default | Required |
|---|---|---|---|
| `stat` | ResourceLocation | — | YES (a vanilla `Stat<?>` ID) |
| `target` | int | — | YES (the value the stat must reach) |

Storage: integer counter. Auto-renders progress.

```jsonc
"walk_10km": {
  "type": "heracles:stat",
  "stat": "minecraft:walk_one_cm",
  "target": 1000000
}
```

### 2.16 `heracles:composite`

Source: `CompositeTask$Type`. Codec strings: `amount`, `tasks`. **No `title` / `icon` fields** — those exist only on leaf tasks.

| Field | Type | Default | Required |
|---|---|---|---|
| `amount` | int (positive) | — | YES (how many of the inner tasks must complete) |
| `tasks` | Map<String, QuestTask> (same shape as top-level `tasks`) | — | YES |

This is the "N of M" gate. Set `amount = (number of inner tasks)` for AND. Set `amount = 1` for OR. Set `amount = 2` for "any two of these three", etc.

```jsonc
"any_two_dimensions": {
  "type": "heracles:composite",
  "amount": 2,
  "tasks": {
    "to_nether":   { "type": "heracles:changed_dimension", "to": "minecraft:the_nether" },
    "to_end":      { "type": "heracles:changed_dimension", "to": "minecraft:the_end" },
    "to_twilight": { "type": "heracles:changed_dimension", "to": "twilightforest:twilight_forest" }
  }
}
```

### 2.17 `heracles:xp`

Source: `XpTask$Type`. Codec strings: `amount`, `xpType`, `collectionType`.

| Field | Type | Default | Required |
|---|---|---|---|
| `amount` | int | `1` | no |
| `xpType` | enum string | `"LEVEL"` | `"LEVEL"` or `"POINTS"` |
| `collectionType` | enum string | `"CONSUME"` | `"AUTOMATIC"` / `"MANUAL"` / `"CONSUME"` |

Note: this is the XP-GATHERING task (player must gather/submit XP). Distinct from `heracles:xp` REWARD (§3.5) which gives XP. Note ALSO the camelCase field names (`xpType`, `collectionType`) — different from `collection` field on `heracles:item` task. See §10 footnote D.

```jsonc
"submit_5_levels": {
  "type": "heracles:xp",
  "amount": 5,
  "xpType": "LEVEL",
  "collectionType": "CONSUME"
}
```

---

## 3. Reward types

5 reward types registered (`QuestRewards` static init). Every reward shares three base fields:

- `type` — required dispatcher key.
- `title` — optional string, default `""`.
- `icon` — optional QuestIcon, default `heracles:item` of `minecraft:air`.

Plus per-type fields.

### 3.1 `heracles:command`

Source: `CommandReward$Type`. Codec string: `command`.

| Field | Type | Default | Required |
|---|---|---|---|
| `command` | string | — | YES |

The command is executed as `/<command>` with the **player as the source** (so `@s` resolves to the rewarded player). No need to lead with `/`. Useful for custom-mod hooks (KubeJS events, advancement grants, give-item from a mod that has no Heracles reward type, etc.).

```jsonc
"grant_advancement": {
  "type": "heracles:command",
  "command": "advancement grant @s only iridescent:quest_chapter_0_complete"
}
"give_kubejs_token": {
  "type": "heracles:command",
  "command": "iridescent_tokens grant @s tier1 1"
}
```

This is the most flexible reward type — when in doubt, use `heracles:command` to call out to KubeJS or another mod's command. `canBeMassClaimed()` returns `false` by default for command rewards (i.e., the "claim all" button skips them).

### 3.2 `heracles:item`

Source: `ItemReward$Type`. Codec string: `item`.

| Field | Type | Default | Required |
|---|---|---|---|
| `item` | ItemStack codec (resourcefullib `ItemStackCodec`) | — | YES |

Item is given on claim. Mass-claimable.

```jsonc
"give_diamond_sword": {
  "type": "heracles:item",
  "item": {"id": "minecraft:diamond_sword", "count": 1}
}
"give_naga_scales": {
  "type": "heracles:item",
  "item": {"id": "twilightforest:naga_scale", "count": 4}
}
```

### 3.3 `heracles:loottable`

Source: `LootTableReward$Type::id()` = `(heracles, loottable)` (one word, no underscore). Codec string: `loot_table`.

| Field | Type | Default | Required |
|---|---|---|---|
| `loot_table` | ResourceLocation | — | YES (must reference an existing loot table) |

Rolls the loot table on claim and gives the result. Mass-claimable.

```jsonc
"random_treasure": {
  "type": "heracles:loottable",
  "loot_table": "iridescent:rewards/chapter_0_complete"
}
```

### 3.4 `heracles:selectable`

Source: `SelectableReward$Type`. Codec strings: `amount`, `rewards`.

| Field | Type | Default | Required |
|---|---|---|---|
| `amount` | int (positive) | `1` | no |
| `rewards` | Map<String, QuestReward> (NESTED rewards map) | — | YES |

Player picks `amount` of the inner rewards from the modal. Useful for class-choice / role-choice quests.

```jsonc
"choose_starter_kit": {
  "type": "heracles:selectable",
  "amount": 1,
  "rewards": {
    "warrior_kit": {
      "type": "heracles:item",
      "item": {"id": "minecraft:iron_sword", "count": 1}
    },
    "mage_kit": {
      "type": "heracles:item",
      "item": {"id": "irons_spellbooks:novice_spellbook", "count": 1}
    },
    "ranger_kit": {
      "type": "heracles:item",
      "item": {"id": "minecraft:bow", "count": 1}
    }
  }
}
```

NOT mass-claimable (player must open the modal and choose).

### 3.5 `heracles:xp`

Source: `XpQuestReward$Type`. Codec strings: `xptype`, `amount`.

| Field | Type | Default | Required |
|---|---|---|---|
| `xptype` | enum string | `"LEVEL"` | `"LEVEL"` or `"POINTS"` |
| `amount` | int | `1` | no |

`xptype` is lowercase `xptype`, NOT `xpType` — distinct from the XP TASK field. See §10 footnote D for the naming inconsistency.

```jsonc
"give_5_levels": {
  "type": "heracles:xp",
  "xptype": "LEVEL",
  "amount": 5
}
```

---

## 4. Chapter / group structure

**Chapters are NOT first-class** in the Heracles codec. They're emergent from:

1. **`config/heracles/quests/groups.txt`** — a plain text file, one group name per line, that defines the explicit ordering of groups in the Heracles UI. Loaded by `QuestHandler.loadGroups`. If missing, no error — groups are inferred from quests.
2. **`display.groups` per quest** — each quest declares which group(s) it belongs to and its position within each group.

After all quests load, `loadGroups` walks every quest's `display.groups.keySet()` and ADDS any group name not yet in the `GROUPS` list. So a group exists iff at least one quest references it. `groups.txt` exists only to enforce a stable display order.

There is NO chapter-level config JSON file (no `chapter.json` per group, no titles per group, no group descriptions). A group name is purely a string identifier. To rename a "chapter" you'd rename the group string across every quest that references it (and update `groups.txt`).

**Cross-group dependencies are unrestricted.** A quest in group `chapter_3` can list a dep on a quest in group `chapter_0` — Heracles doesn't care; dependencies are by bare quest ID (§0.2).

**Ordering within a group:** the `position` field of each `GroupDisplay` is the literal `[x, y]` placement of the quest's icon in the group's canvas. No auto-layout — you pick the coordinates. The Heracles editor UI lets you drag-drop in-game to set positions; for batch authoring you write them in JSON directly.

**Authoring rule for the Iridescent quest tree (§3 of `heracles-quest-tree.md`):** use 6 groups: `Onboarding`, `Overworld Foundations`, `Twilight Midtier`, `Nether Dimensional`, `End Postgame`, `Sandbox`. Ship a `groups.txt` listing them in this order to lock UI order. Within each group lay quests out left-to-right by dependency depth: chapter root at `[0,0]`, deps-of-root at `[100,0]` & `[100,-50]`, deps-of-deps at `[200, ...]`, etc.

---

## 5. Dependency / prerequisite semantics

**Field name: `dependencies`** (NOT `depends_on`, NOT `prerequisites`, NOT `requires`).

**Type: `Set<String>`.** JSON array of strings, each a bare quest ID (filename without `.json`, no path prefix, no `heracles:` namespace prefix). De-duplication is automatic (it's a Set).

**Combinator: AND.** `CompletableQuests.updateCompleteQuests` iterates each dependency and sets `boolean isMet = true`; on any unmet dep, `isMet = false`. The quest only becomes "completable" once all deps are complete (see bytecode offsets 151-208 in `CompletableQuests.class`). To get OR, you can't do it at the dependency layer — you'd use a single `heracles:composite` task with the desired N-of-M, and structure deps to point at quests using composite tasks.

**Missing-dep handling.** In `QuestHandler.load`, after loading every file, the loader iterates each quest and runs `dependencies.removeIf(dep -> !QUESTS.containsKey(dep))`. **So if you reference a non-existent quest ID, it's silently dropped from the Set — no warning logged.** This is a footgun for ID typos: a misspelled dependency simply does nothing and the quest unlocks immediately. See §10 footnote E.

**Visual treatment.** Per the lang keys:
- `LOCKED` (deps not met, default `hidden` enum) — quest hidden behind a silhouette icon.
- `IN_PROGRESS` — quest visible with progress bar.
- `COMPLETED` / "Claimed" — quest visible with checkmark / claimed-checkmark.
- `DEPENDENCIES_VISIBLE` (config flag `hidden = "DEPENDENCIES_VISIBLE"`) — quest hidden, but its dep arrows ARE drawn, so the player sees "something exists past this point."
- Arrow rendering controlled by `settings.showDependencyArrow` (default true).

---

## 6. Multiplayer / per-player tracking

**Per-player by default. Optional team-shared via `individual_progress`.**

`QuestProgressHandler extends SavedData` — Heracles maintains a `Map<UUID, QuestsProgress>` in world saved-data, keyed by player UUID. Every player has their own complete progress state per quest.

`settings.individual_progress` (default `false`): when `false`, the quest's progress is **shared across the player's team**. Teams are resolved via the `TeamProvider` SPI (`earth/terrarium/heracles/api/teams/TeamProviders`). Without a team mod installed (FTB Teams, Argonauts, etc.), the default `TeamProvider` returns single-player teams, so `false` effectively still means per-player.

**With a team mod:** all teammates see the same progress for any quest where `individual_progress = false`. Both completion AND claim-tracking sync to teammates' `QuestsProgress` instances.

**Joining mid-pack:** when a new player joins, `QuestProgressHandler.findFirstPerson(server, teamMemberUUIDs)` is called — it scans existing teammates' progress and copies their first-found completion state to the new player's progress map. So in a non-individual quest, a mid-pack joiner inherits the team's progress. In an individual quest, they start fresh.

**Bytecode reference:** `QuestProgressHandler::lambda$setupChanger$3`, `QuestProgressHandler::sync`, `findFirstPerson`, `copyProgress`. The TeamProvider SPI is in `earth/terrarium/heracles/api/teams/`.

**Authoring guidance for Iridescent (per Open Question 2 in `heracles-quest-tree.md`):** if "fresh start per player" is desired, set `individual_progress = true` on every quest. If "team-shared once a team mod is installed" is acceptable, leave the default false. The pack does not currently ship a team mod, so the practical effect of `false` is still per-player today.

---

## 7. Commands API

Root: `/heracles`. Registered in `ModCommands.init`. Tree:

| Command | Args | Permission | Behavior |
|---|---|---|---|
| `/heracles pin <quest>` | quest ID | any player | Pins / unpins the quest in the player's HUD overlay. |
| `/heracles reset <quest> <target>` | quest ID, entity selector | OP (perm level 2) | Resets the named quest for the targeted player(s). |
| `/heracles resetall <target>` | entity selector | OP | Resets ALL quests for the targeted player(s). |
| `/heracles complete <quest> <target>` | quest ID, entity selector | OP | Force-completes the named quest for the targeted player(s). |
| `/heracles barrier add <quest>` | quest ID | OP (and must be holding a Quest Barrier item) | Adds the quest to the barrier item's allow-list. |
| `/heracles barrier remove <quest>` | quest ID | OP, holding Quest Barrier | Removes from the list. |
| `/heracles dummy <id>` | string | OP | Triggers all `heracles:dummy` tasks with matching `value`. |

**There is NO `/heracles open` command.** Source: `ModCommands.init` registers ONLY pin, reset, resetall, complete, barrier, dummy. The "open the quest book" interaction is a client-side keybind (`key.heracles.open_quests`) and an item right-click on the Quest Book.

**Implication for codex linking** (`heracles-quest-tree.md` §2.1 assumed `/heracles open <chapter>`): **that command does not exist.** For codex-to-quest jumping, options:
1. Bind the codex's "Quests" action button to the keybind for `Open Quests` (Patchouli + a KubeJS keybind sim).
2. Implement `/heracles open <group>` as a KubeJS-shipped custom command that calls into Heracles' client screen API.
3. Settle for "Open Quests" then-let-player-find-the-group manually, paired with a printed group name in the codex.

The cleanest fix is (2) — KubeJS command that calls `MinecraftClient.setScreen(new QuestsScreen(group))` (the relevant client class is `earth/terrarium/heracles/client/screens/`). Out of scope for this doc but flagged for task #45.

`heracles` namespace command — see `ModCommands::QUESTS` SuggestionProvider which auto-completes quest IDs from the live quest registry, so `/heracles reset <TAB>` lists every loaded quest by bare ID.

---

## 8. Asset paths

### 8.1 Quest icons

ONLY item-based: `{"type": "heracles:item", "item": "<item_id>"}`. The item's vanilla model + texture render as the icon. To use a custom icon, either:
- Register a custom item in a KubeJS / data-driven mod and reference its ID.
- Override an existing item's texture in a resource pack and reference that item.

There is no `texture` field on QuestIcon. The Item is fully driven by Mojang's `ItemStackCodec` shape (`{id, count, nbt}` or shorthand `"id"`).

### 8.2 Icon backgrounds

`display.icon_background` is a `ResourceLocation` pointing to a 24×24 PNG. 9 built-in backgrounds ship in the jar at `assets/heracles/textures/gui/quest_backgrounds/`:
- `circles.png`
- `default.png` *(default if `icon_background` omitted)*
- `diamonds.png` (animated, `.mcmeta` present)
- `gears.png`
- `hearts.png` (animated)
- `hexagons.png`
- `octagons.png`
- `pentagons.png` (animated)
- `rounded_squares.png`

Custom backgrounds: ship a 24×24 PNG in a resource pack at `assets/<modid>/textures/<your_path>.png`, reference as `"<modid>:<your_path>"` (Minecraft strips the `textures/...png` automatically — write the relative-path-from-`textures/`-without-`.png`).

### 8.3 Group/chapter backgrounds

NOT directly configurable per-group. The Heracles quests screen renders the whole quest canvas; there's no per-group banner image field. The `icon_background` is per-QUEST, not per-group.

---

## 9. Versioning / format-version

**No `format_version` field in the JSON.** Heracles does NOT support a forward-compat schema marker. The codec just parses whatever JSON it sees against the current `Quest::CODEC`.

**Heracles version in the pack:** 1.1.13 (from `META-INF/mods.toml` and the jar filename). Minecraft 1.20.1 + Forge >=46.

**Forward-compat strategy:** the codec is tolerant of unknown extra fields (DFU `Codec.parse` ignores them). And every field has a default via `orElse(...)` / `orElseGet(...)`. So an OLDER Heracles can typically read a NEWER quest JSON safely — new fields are ignored, old fields keep their defaults. The exceptions:
- An enum value (e.g., `collection`) that no longer exists in the older version fails the EnumCodec parse and falls back to its default — possibly changing the task's semantics.
- A new TASK TYPE will fail dispatch (no codec registered for the unknown `type` string) and the quest will fail to load with an error.

**Breaking changes between mod versions:** ThatGravyBoat ships release notes on the Heracles Modrinth page (not bundled in jar). Not surveyed in this audit. Recommend: pin Heracles version in the pack manifest and bump only after re-verifying this shape.

---

## 10. Surprising findings / footnotes

### Footnote A — `hidden: false` in existing first_blood.json is a no-op

The pack ships `.minecraft/config/heracles/quests/main/first_blood.json` with `"hidden": false` (boolean) in `settings`. The codec expects `EnumCodec.of(QuestDisplayStatus.class).fieldOf("hidden")` — i.e., a string like `"LOCKED"`. A boolean `false` is not a valid enum name. EnumCodec returns failure → the codec falls back to `orElse(LOCKED)`. Net effect: works, because LOCKED is the default anyway. Recommend either deleting the field or writing `"hidden": "LOCKED"` explicitly. Same applies to any quest authored using a "treat hidden as boolean" mental model.

### Footnote B — Filename's first dot truncates the ID

`FileUtils.readFileAndParse` does `filename.substring(0, filename.indexOf('.'))`. So `foo.bar.json` → ID `foo` (NOT `foo.bar`). Avoid extra dots in quest filenames; use only `[a-z0-9_]` characters.

### Footnote C — Cross-directory ID collisions silently overwrite

Because IDs are derived from filename only (no relative-path prefix), two files named `naga.json` in different subdirectories produce two quests with the same ID, both stored in a `HashMap<String, Quest>`. The later load wins; the earlier is dropped. **No collision warning is emitted** (verified — load loop just calls `Map.put(id, quest)` without an existence check). Authoring rule: globally unique filenames.

### Footnote D — Field-name casing inconsistencies in `settings` and `xp`

The Heracles codec is inconsistent on `snake_case` vs `camelCase`:
- `settings.individual_progress` (snake_case)
- `settings.unlockNotification` (camelCase)
- `settings.showDependencyArrow` (camelCase)
- `settings.autoClaimRewards` (camelCase)
- `heracles:item` task uses `collection` (single word, no case issue)
- `heracles:xp` task uses `xpType` and `collectionType` (camelCase, the `T` is uppercase)
- `heracles:xp` reward uses `xptype` (all lowercase!)

These appear to be inconsistent author choices baked into the codec — they CANNOT be changed without modifying the jar. Strictly copy the casing as documented; a `xpType` vs `xptype` typo will cause silent fallback to default. The reward-vs-task `xptype`/`xpType` difference in particular is a sharp-edge — distinct codecs were authored at different times.

### Footnote E — Missing-dep dropouts unlock quests unexpectedly

If a quest's `dependencies` array contains an ID that doesn't match any loaded quest, that entry is silently removed (`dependencies.removeIf(dep -> !QUESTS.containsKey(dep))` in `QuestHandler.lambda$load$0`). If ALL deps are dropped, the quest becomes immediately completable. **Typos in dep IDs convert hard-blocked quests into instantly-available ones.** Mitigation: after every authoring pass, sanity-check the loaded quest set in-game via `/heracles reset` tab-completion (shows live registry).

### Footnote F — Save-time path uses lowercased alphanumeric-stripped group name

When the in-game editor SAVES a quest, `pickQuestPath` selects the first group name (sorted), then `lambda$pickQuestPath$3` runs `.replaceAll("[^a-z0-9]", "")` → lowercased alphanumerics only. So a group named `Chapter 2` saves under directory `chapter2/`, not `Chapter 2/` or `chapter_2/`. This affects only WRITE; READ still scans every subdirectory. If you mix editor-authored and hand-authored quests, expect the editor to file new ones into a folder whose name is the cleaned group key.

### Footnote G — `unknown top-level keys` are silently accepted

The Heracles codec uses `RecordCodecBuilder.create(...)` which gives a `Codec` that ignores fields not explicitly declared in the record group. So our planned `iridescent_codex_bonus` top-level field is parse-safe — Heracles ignores it. A KubeJS server-script that reads the raw JSON can pick it up. (But you cannot put `iridescent_codex_bonus` in a place where the Heracles codec is strict, like inside a `QuestSettings` block — only fully-record-coded blocks are strict, and the top-level Quest record happens to use the "permissive" RecordCodecBuilder.)

### Footnote H — Composite tasks don't show in the player UI as a separate "task"

Each composite task is one logical row in the quest's task list, but its INNER tasks are NOT individually shown in the standard task widget. Use composite for OR / N-of-M semantics, but design titles carefully because the inner task names aren't surfaced. If you need players to SEE multiple sub-objectives separately, put them at the top-level `tasks` map instead.

### Footnote I — `heracles:item` task collection-type interaction with submit button

For `collection = "MANUAL"`, items remain in player's inventory after task completes. For `CONSUME`, items are stripped during the submit. The submit button only renders if the task isn't `AUTOMATIC`. For pure inventory-check (no consumption), use `AUTOMATIC`. For pay-the-NPC-style quests, use `CONSUME`. The MANUAL option is mostly editor-grade — players rarely understand the distinction from `AUTOMATIC` in practice.

### Footnote J — XP reward types

`heracles:xp` reward with `xptype = "LEVEL"` grants Minecraft XP levels (the bigger ones); `"POINTS"` grants raw XP points (the smaller, cumulative ones inside each level). Same for the `xpType` field on the `heracles:xp` task. Be intentional — LEVEL × 5 ≠ POINTS × 5 by a huge margin.

### Footnote K — TaskTitleFormatters / per-task icon overrides

Every task has a `title` and `icon` override field, but if you leave them at default the Heracles UI auto-formats a label using `TaskTitleFormatters` (`api/tasks/client/display/TaskTitleFormatters`) which interpolates the entity / item / structure name into a template like `"Kill: %s"`. For pack-thematic quests, an explicit `title` override (with translation-key form) is preferable for control over wording.

### Footnote L — Quest icon's `item` field accepts either ID-string OR ItemStack-object

`ItemValue` is an `Either<ItemStack, TagKey<Item>>`. The `ItemStack` side uses resourcefullib's `ItemStackCodec` which accepts BOTH the short form `"minecraft:diamond"` AND the long form `{"id": "minecraft:diamond", "count": 1, "nbt": "..."}`. Both shapes parse identically for an icon (only the displayed item matters; count and nbt are passed to `getDefaultInstance()` for rendering).

---

*Doc revision 1, 2026-05-29. Verified against `Heracles-forge-1.20.1-1.1.13.jar`. Re-verify before any Heracles version bump — Codec field names are encoded as bytecode-level string literals and can shift between releases.*
