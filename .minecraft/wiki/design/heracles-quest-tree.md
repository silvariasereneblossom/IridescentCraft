# Heracles quest tree — scoping spec

*Status: SCOPING (2026-05-28). Authoring is multi-session, chapter-by-chapter.*
*Cross-references: master.md (tier philosophy), master-appendix.md (recipe + boss tables), boss-catalog.md (boss inventory — produced by audit agent in parallel).*

---

## 1. Design philosophy

The quest tree exists to answer **"what should I do next?"**, to reward players for doing it, **and — as of the 2026-05-31 progression-framework lock — to *be* the progression engine.** Heracles is the Codex's mechanism (Part III of master.md): its item-submission, kill-tracking, and stage-granting run the four-lane **token economy**. Submitting progression tokens toward a tier threshold (500 / 1000 / 2000) and tracking the boss-rush % are how a player advances; reaching either grants the next AStages tier flag.

This **reverses the doc's original premise.** Earlier this section said the tree was "NOT a progression gate" and that AStages gated everything independently — that described the superseded "internal boss-counter" model. Under the locked framework, **Heracles token-submission IS the primary gate path** (the boss-rush % is the other). What remains true: a player is never forced down a *single* lane (four lanes + boss-rush keep it open), and the tree still does double duty as the content index + bonus-reward layer below.

Three constraints drive every quest authored:

1. **Pack goals.** Quests should reinforce what the pack actually rewards — deliberate progression, multi-mod synergy, deep specialization. A quest that says "kill 10 zombies" violates this; a quest that says "kill the Naga and bring its scales to the Tetra workbench" is on-mission.

2. **Content discoverability.** The tree is the player-facing index of pack content. Every dimension, structure, boss, mechanic, and modular system gets at least one quest pointing at it. If a player completes the tree, they have toured the whole pack.

3. **Dual-axis rewards.** Every quest reward is chosen on two axes:
   - **Tier axis.** T1 quests give T1-tier reagents; T4 quests give T4-tier reagents. Never reward up- or down-tier.
   - **Mod axis.** A quest about Mod X rewards items that boost Mod X's economy. Killing a Twilight Forest boss rewards Twilight Forest crafting reagents, not Ars Nouveau source gems.

The two axes compose: a quest in Chapter 3 (T3) about Iron's Spellbooks rewards a T3-tier ISS reagent (e.g., an ISS T3 spellbook material), not a T1 mana shard or a T3 Tetra schematic.

---

## 2. Codex integration

The Iridescent Codex (Patchouli book at `datapack_sources/iridescent_codex/`) is the canonical entry point. Players read the codex to learn pack systems; the quest tree is reached **from** the codex.

### 2.1 Codex-to-quest linking

Each codex chapter that covers a mod or system ends with a "Quests" section. The section contains one or more action buttons that fire a quest-tree-open command.

**Implementation note (2026-05-28 verification per `heracles-json-shape.md` §7):** `/heracles open <chapter>` does NOT exist in the in-pack Heracles version. The only built-in command is `/heracles` (opens the root quest UI). To deep-link to a specific chapter/group, we must ship a custom KubeJS command (e.g., `/icraft_quests open <group_id>`) that opens Heracles' UI then navigates to the named group. The codex action buttons fire the custom command, not Heracles' native one.

| Codex chapter | Quest entry point |
|---|---|
| `systems/tetra-materials.md` | Heracles chapter 2 (Gear progression) |
| `systems/armor_weight.md` | Heracles chapter 2 (Armor archetypes) |
| `systems/dimensions.md` (TBD) | Heracles chapter 3 (Dimensional unlocks) |
| `classes/overview.md` | Heracles chapter 0 (Character creation) |
| `bosses/*.md` (TBD) | Heracles chapter per boss tier |

### 2.2 Read-the-page bonus rewards

A small subset of quests award **bonus materials** for opening the matching codex page. Implementation: KubeJS server-script listens for Patchouli page-open events; on first open of a flagged page, awards the bonus item and marks the quest task complete. This is purely additive — players who skip codex reading still complete the quest via the normal task; reading just gives extra.

Target density: ~1 bonus-read quest per chapter, 6 total. Keeps the reward feel without forcing reading.

### 2.3 Codex entries auto-unlock on quest completion

Default behavior: codex entries ship locked behind their respective quest. Completing a quest in chapter N unlocks the corresponding codex pages. This means a player following the quest tree builds their codex naturally, page by page, as they progress.

Pages that should ship **always-unlocked** (i.e., not gated):
- `home.md`
- `classes/overview.md` (needed at character creation, pre-quest)
- `systems/overview.md` (orientation reading)
- `getting-started/` (pre-T1 content)
- Anything tagged as `bootstrap: true` in the page frontmatter (frontmatter convention TBD)

Pages gated behind quest completion: bosses, dimension overviews, advanced mechanics, gear archetypes, ultimate-tier content.

---

## 3. Chapter structure

Six chapters total. Tier alignment matches master.md sections III–VII.

| # | Chapter | Tier | Quest target | Quest count target |
|---|---|---|---|---|
| 0 | Onboarding | pre-T1 | Character creation, codex tour, first-day survival | 15 |
| 1 | Overworld Foundations | T1 | Vanilla + iron-tier modded, Tome Tower entry, novice spellbooks | 30 |
| 2 | Twilight + Mid-Tier | T2 | Twilight Forest, Cataclysm Overworld bosses, Tinkers' bronze, T2 spellbooks, Tetra intro | 35 |
| 3 | Nether + Dimensional | T3 | Nether progression, Ad Astra Mars, Mekanism intro, T3 spellbooks, Tetra honing | 35 |
| 4 | End + Postgame | T4 | End bosses, Aether endgame, ultimate Cataclysm, aethersteel-tier modular gear | 30 |
| 5 | Sandbox | optional | Side-content, boss codex completion, "I beat everything" capstones | 15 |

Total: ~160 quests. Within range of the "Standard: ~30-40 per tier" density target.

### 3.1 Per-chapter quest archetypes

Each chapter contains a mix of these archetypes (numbers indicative for chapter 2 / T2 as the reference template):

| Archetype | Count per chapter | Example (T2) |
|---|---|---|
| **Boss kill** | ~8 | Defeat the Naga / Lich / Hydra / Ur-Ghast / Cataclysm Overworld boss / etc. |
| **Dimensional unlock** | ~3 | Reach the Twilight Forest. Reach the Cave World. Reach a specific subzone. |
| **Gear progression** | ~6 | Craft your first Tinkers' bronze tool. Hone a Tetra module. Acquire a T2 spellbook. |
| **Mod-system intro** | ~6 | Use the Ars Nouveau Imbuement Chamber. Open a Tetra workbench. Set up a Botania mana pool. |
| **Codex reading bonus** | ~1 | Read the codex page on Twilight Forest progression. Bonus reward: a Magic Map Focus. |
| **Material collection** | ~5 | Collect 8 Naga scales, 4 Carminite, 1 Ur-Ghast tear. |
| **Lore / flavor** | ~3 | Discover the Tome Tower. Find a Magic Map. Read a Twilight Forest landmark notice board. |
| **Capstone / mastery** | ~3 | Complete every T2 boss. Acquire every T2 mod-archetype piece. Fully hone one T2 modular item. |

Totals to ~35 — matches chapter 2 target.

### 3.2 Reward design framework

Per §1, every reward is chosen on (tier × mod) axes. Reward types in order of authoring preference:

1. **Tier-bound mod reagents.** A T2 Twilight boss kill rewards Carminite / Magic Map Focus / Steeleaf. A T2 ISS quest rewards Arcane Essence (T2 spell book material). Preferred when the reward is directly usable in mod X.

2. **Tetra honing materials.** Honing materials (refined obsidian + tier-bound iron / steel / aethersteel) are the universal modular-gear progression. Use as cross-mod bridge rewards (e.g., a Cataclysm boss quest can reward honing iron + boss-specific drop).

3. **Codex reading bonuses.** See §2.2. Always small, always thematic to the page.

4. **Progression tokens (the four-lane economy).** Per the 2026-05-31 framework, *progression tokens* are first-class quest currency — a quest that asks you to submit Engineering/Magic/Exploration/Combat tokens, or that rewards tokens toward the tier threshold, is exactly on-model (Heracles is the token engine; §1). Distinguish these from raw **AStages stage flags**, which are *not* handed out as rewards — the tier flag is granted by the engine when the threshold/boss-rush is met, never gifted directly.

5. **Cosmetic / vanity items.** Reserved for sandbox chapter capstones. A "you beat everything" reward might be a custom hat or banner pattern.

Anti-patterns to never ship:
- XP-only rewards (XP is plentiful from gameplay; XP-only feels like a slap)
- Cross-tier rewards (T1 quest rewarding T3 material breaks tier discipline)
- Quest-only items with no in-game use (decorations that aren't decorative)
- Mod-X quest rewarding Mod-Y reagent (cross-mod muddies the mod-axis identity)

---

## 4. Quest authoring template

Each quest is a JSON file under `config/heracles/quests/<quest_id>.json`. JSON shape verified 2026-05-28 against `Heracles-forge-1.20.1-1.1.13.jar` bytecode — see [`heracles-json-shape.md`](heracles-json-shape.md) for the full reference (17 task types, 5 reward types, every field's codec citation).

**Critical corrections from initial sketch:**
- Quest **ID is the bare filename**, not a namespaced string. No `id` field exists in the JSON.
- **`dependencies`** (not `depends_on`).
- **`display.groups`** map (not a top-level `chapter` field — chapters are emergent from group assignment).
- **`heracles:item`** task type (not `heracles:item_have`).
- **`hidden`** is an enum (`LOCKED` / `IN_PROGRESS` / `COMPLETED` / `DEPENDENCIES_VISIBLE`), not a boolean.
- Field-name casing is inconsistent across the codec (e.g., `xpType` for tasks vs `xptype` for rewards). Copy field names exactly.

Working template (chapter 0 reference quest):

```jsonc
// File path: config/heracles/quests/onboarding_tome_tower_entry.json
//   Filename IS the quest ID. Recommend a chapter-slug prefix on every
//   filename so cross-chapter ID collisions can't happen silently.
{
    "display": {
        "title": "tetra.quest.iridescent.tome_tower_entry.title",
        "description": "tetra.quest.iridescent.tome_tower_entry.desc",
        "icon": {
            "item": "iridescent_codex:tome_of_iridescence"
        },
        "groups": {
            "onboarding": {
                "position": [0, 0]
            }
        }
    },

    "settings": {
        "individual_progress": true,
        "hidden": "LOCKED"
    },

    // Soft prerequisites (filename-based). Heracles SILENTLY DROPS missing
    // dep IDs from the set, so typos turn hard-gated quests into immediately
    // available. Belt-and-suspenders: cross-check each ID exists.
    "dependencies": [
        "onboarding_first_day"
    ],

    // Tasks: ALL must complete to advance. Map keyed by arbitrary string;
    // value's `type` field selects the task implementation.
    "tasks": {
        "find_fortress": {
            "type": "heracles:advancement",
            "advancement": "minecraft:nether/find_fortress"
        },
        "have_tome": {
            "type": "heracles:item",
            "item": {"id": "iridescent_codex:tome_of_iridescence"}
        }
    },

    // Rewards: granted on quest completion. Tier-bound + mod-bound per §3.2.
    "rewards": {
        "spellbook": {
            "type": "heracles:item",
            "item": {"id": "irons_spellbooks:novice_spellbook", "count": 1}
        },
        "repair_kits": {
            "type": "heracles:item",
            "item": {"id": "tetra:repair_kit_iron", "count": 4}
        }
    }
}
```

**Codex-read bonus reward** is NOT a Heracles field — handled out-of-band by a KubeJS Patchouli page-open listener that cross-references a separate `kubejs/server_scripts/quest_bonus_reads.js` table mapping `quest_id → page_id → bonus_item_stack`. Must be authored as an idempotent one-time grant per (player × quest × page) tuple. Lives outside the Heracles JSON to keep the JSON copy-and-paste compatible with vanilla Heracles tooling.

### 4.1 Naming conventions

| Element | Convention | Example |
|---|---|---|
| Quest ID (= filename) | `<chapter_slug>_<short>.json` | `twilight_midtier_naga_kill.json` |
| Title lang key | `tetra.quest.iridescent.<short>.title` | `tetra.quest.iridescent.naga_kill.title` |
| Description lang key | `tetra.quest.iridescent.<short>.desc` | `tetra.quest.iridescent.naga_kill.desc` |
| Chapter slug (= group key in `display.groups`) | snake_case | `overworld_foundations`, `twilight_midtier` |

**Filename prefix is load-bearing.** Heracles derives quest ID from filename only, ignoring subdirectory paths. `config/heracles/quests/foo.json` and `config/heracles/quests/chapter_2/foo.json` would collide silently with one taking priority. Prefix every filename with its chapter slug to make collisions impossible.

All lang strings live in `iridescent_reforging/lang/en_us.json` per existing convention.

### 4.2 Per-quest scoping checklist

Before authoring a quest JSON, fill out:

- [ ] What pack goal does this quest reinforce? (One of: deliberate progression / multi-mod synergy / deep specialization)
- [ ] What content is the player likely to miss without this quest?
- [ ] Reward: (tier, mod) — both axes filled?
- [ ] Is the reward in-game useful, or quest-only decoration?
- [ ] Does this quest depend on a boss, dimension, or system that exists in pack? (Audit: ExplorersCompass / boss-catalog.md)
- [ ] Does this quest fit one of the 8 archetype slots in §3.1?
- [ ] Does the matching codex page exist or need to be authored alongside?

---

## 5. Authoring sequence

Recommended ship-order:

1. **Boss catalog completion** (task #46 audit agent, in-flight as of 2026-05-28). Quest authoring without the catalog produces fragile boss-kill quests that point at the wrong entity ID.
2. **Heracles JSON shape verification.** Decompile `Heracles-forge-1.20.1-1.1.13.jar` to confirm task / reward predicate names, advancement triggers, depends-on semantics. Update §4 template with corrections.
3. **Chapter 0 (Onboarding) — concrete authoring.** 15 quests, ships as the reference implementation. Covers: char-creation prompts, codex tour, first-night survival, novice spellbook acquisition. After chapter 0 ships, lessons inform the chapter-1+ authoring pass.
4. **Codex `/heracles open` linking.** Add the action button to one existing codex page (e.g., `getting-started/`). Verify in-game that the button fires Heracles correctly.
5. **Codex auto-unlock-on-completion plumbing.** KubeJS server script listens for quest-complete events; toggles codex-page unlock state. Test on chapter 0 quests.
6. **Read-the-page bonus reward plumbing.** Implement the KubeJS Patchouli-page-open listener. Test the chapter 0 bonus quest end-to-end.
7. **Chapters 1–4.** Authored tier-by-tier. Each chapter ships independently; players see new content land per release.
8. **Chapter 5 (Sandbox).** Author last; capstone quests reference completion of chapters 1–4.

Don't author chapters 1+ in parallel until chapter 0 ships — the template / plumbing learnings from chapter 0 will reshape later chapters.

---

## 6. Heracles JSON shape verification — COMPLETED 2026-05-28

Bytecode decompile output: [`heracles-json-shape.md`](heracles-json-shape.md) (843 lines). Resolved every open question:

| Original question | Resolution |
|---|---|
| Exact task `type` strings | 17 task types enumerated: `heracles:kill_entity`, `heracles:advancement`, `heracles:item` (NOT `item_have`), `heracles:biome`, `heracles:structure`, `heracles:changed_dimension`, `heracles:check`, `heracles:dummy`, `heracles:entity_interaction`, `heracles:item_interaction`, `heracles:item_use`, `heracles:block_interaction`, `heracles:location`, `heracles:recipe`, `heracles:stat`, + 2 more — see `heracles-json-shape.md` §2. |
| Reward types | 5 types: `heracles:item`, `heracles:command`, `heracles:experience`, + 2 more — see `heracles-json-shape.md` §3. |
| Prerequisite field name | `dependencies` (not `depends_on`). Missing IDs silently dropped, not errored. |
| Chapters as first-class | NO. Emergent from `display.groups` map. Optional ordering via `groups.txt`. |
| Quest-icon | Object with item ID + texture variants — see `heracles-json-shape.md` §1.6. |
| Multiplayer | Per-player when `settings.individual_progress=true`; world-shared otherwise. |
| Task progress | Automatic for count-based tasks (kill_entity, item gather, etc.). |

Other corrections from the audit (referenced in §4 above): quest ID = filename; `hidden` is enum not bool; field-name casing inconsistent. Authoring lessons in `heracles-json-shape.md` §10.

---

## 7. Cross-references

- **master.md Part III** — the token economy (the engine this tree runs); tier/dimension/mod placement is in Parts II + IV
- **master-appendix.md §B** — Tier-skip recipe state (reagent costs per dim unlock)
- **master-appendix.md §C** — Boss → loot mapping (informs reward design)
- **master-appendix.md §L.2** — 4-archetype armor model (informs gear-progression quests)
- **boss-catalog.md** — Boss inventory (produced by task #46 audit; informs all kill-quests)
- **waystones-api-audit.md** — Waystones config (produced by task #46; informs whether boss-waystones can be auto-named in quest rewards)
- **wiki/systems/tetra-materials.md** — Tetra material progression (informs honing-quest reagent choices)
- **wiki/classes/overview.md** — Class system overview (informs chapter 0 char-creation quests)

---

## 8. Open questions

For decision before chapter 1 authoring begins:

- **Stage gating per quest.** Should a T2 quest auto-fail / hide if the player isn't AStages T2? Or visible-but-uncompleteable so it acts as a "coming up" preview? Recommend visible-but-uncompleteable for player visibility.
- **Multiplayer progress sharing.** If a player joins mid-pack, do they inherit chapter 0 completion from the world's main character? Recommend no — fresh start per player. Verify Heracles supports per-player tracking.
- **Quest-complete celebration.** Toast notification (Heracles default), or a more pack-thematic effect (firework + chat message + temporary buff)? Recommend pack-thematic for capstones only, plain toast for routine quests.
- **Boss-respawning quest design.** Some bosses don't respawn (Twilight Lich is one-shot). If a player completes the kill-quest then a new player joins later, do they get a duplicate boss to fight, or skip? Recommend: per-player kill-tracking, not world-shared, so each player has a path.
- **Localization.** Pack is English-first. Should we structure lang keys to support future translation, or hardcode display strings in JSON? Recommend lang-key structured (§4.1) for future-proofing.

---

## 9. Non-goals

Explicitly out of scope for this tree:

- Achievement-system mimicry (we have vanilla advancements + Heracles; we don't need a third tracking layer)
- Per-player economy / shop (no quest-rewards-for-currency systems)
- Daily / repeatable quests (one-shot only; tree must have a final state of "completed")
- Crafting-recipe tutorials (codex / JEI / EMI cover this; quests don't need to)
- Combat tutorials (Better Combat ships its own onboarding; we don't replicate)
- Server-administered events / boss spawning (operator manually triggers via `/summon`; not a quest)
- Skill-tree integration with Pufferfish Skills (skills have their own progression; quest tree references but doesn't drive them)

---

*Last revised 2026-05-28. Next revision when boss-catalog.md + waystones-api-audit.md land and Heracles JSON shape is verified.*
