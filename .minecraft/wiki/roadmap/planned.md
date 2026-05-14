# Planned Changes & Roadmap

Future features, improvements, and technical debt. Organized by priority.

---

## High Priority

### Blue Skies → T1 (post-alpha tier rebalance)

Move Blue Skies from T2 to T1, making it a day-1-accessible alternative
dimension alongside vanilla Overworld. Coherent with the existing gatekeeper
house lore (overworld plains/mountain/snowy structures that ARE the entry
point) and fleshes T1 out into a more complete-feeling tier.

**Why:** the "each tier feels like a complete modpack experience in its own
right" design pillar. T1 with just overworld + bottom Botania + early Create
feels thin. Adding Blue Skies gives T1:
- A second dimension to explore on day 1
- More biomes, mobs, structures, and a non-linear early loop
- Natural use of the gatekeeper houses (currently we strip their T2 loot;
  post-move, they become legitimate T1 discovery loot)
- An alt-path for early-game variety

**Work involved:**
1. Remove Blue Skies dimension gate from `astages_restrictions.js` (T2 stage entry)
2. Remove `LootJS` strips for Blue Skies items in overworld chests (currently
   in `lootjs_overhaul.js` ~line 1820)
3. Remove the explicit `gatekeeper_house/{plains,book}` ventium/moonstone
   strips added 2026-05-14
4. Rebalance Blue Skies mob scaling: D.4 currently sets BS at HP×2.0, DMG×2.3,
   Armor×1.4 (T2). Bring down to ~HP×1.3, DMG×1.2, Armor×1.1 (T1+ range).
5. Move Blue Skies-tier metals (Ventium, Falsite, Charoite, Diopside) to a
   sub-gate within Blue Skies — either Everbright/Everdawn dungeon-locked,
   or behind a Blue Skies T1 boss kill (Summoner / Alchemist / Starlit Crusher
   are currently T2 — would become "Blue Skies T1 bosses" with reduced HP).
6. Update D.1 affix rarity clamp for Blue Skies dimensions from common-epic
   to common-rare (T1 ceiling).
7. Update mod roster F.1/F.2 sections in master-appendix to reflect new tier.
8. Update master.md Part II (Tier System) and Part IV (Worlds & Dimensions)
   to mention Blue Skies as a T1 alternative dimension.
9. Verify Blue Skies recipes (gatekeeper crafted? Crystal-block-tier?) are
   T1-craftable with adjusted materials.

**Blocked by:** alpha testing completion. Want playtester data on how the
current T2 Blue Skies feels vs the T1 version before committing.

### Modrinth Pack Publication
- Convert modpack to Modrinth's pack format for one-click installation
- Eliminates all custom client deployment complexity
- Requires: final mod list audit, pack metadata, icon, description
- **Blocked by:** alpha testing completion

### Server Mod Update System (`update_mods.ps1`)
- After `sync_from_repo` syncs new `.pw.toml` files, mod JARs need updating
- Script should:
  1. Read all `.pw.toml` files
  2. Check if the filename in the TOML matches an existing JAR
  3. If TOML filename doesn't exist (new version), download it
  4. If old version of same mod exists (different filename, same mod ID), delete old JAR
  5. Run automatically after `sync_from_repo`
- Solves: manual mod version management on dedicated servers
- **Why:** Currently, updating a mod version requires manually deleting the old JAR and downloading the new one. With 420+ mods this is error-prone.

### FTB Quests Integration
- Quest book needs in-game GUI editor (can't be built externally)
- Should guide players through tier progression
- Integrate with token system and advancement gates

---

## Medium Priority

### Client Installer Polish
- Current approach: build importable zip → PrismLauncher import
- Works but requires GitHub API for standalone deployment
- Long-term: Modrinth publication replaces this entirely
- Consider: pre-built instance zip as GitHub release asset for interim

### Custom Item Artwork (72 items)
- All custom items use tinted vanilla placeholder textures
- Need proper 16x16 pixel art for: progression tokens, boss materials, alloys, rings, endgame items, MekaSuit Mk2, planetary elements, Compass of Return
- Location: `assets/kubejs/textures/item/` as 16x16 PNGs

### Tier-gated Sophisticated Backpacks mob-backpack loot
- **Status:** Idea parked 2026-04-24. Currently disabled via `defaultconfigs/sophisticatedbackpacks-server.toml` (`chance = 0.0`, `addLoot = false`).
- **Opportunity:** SB's `EntityBackpackAdditionsConfig` ships a per-entity loot table mapping (`entityLootTableList`, format `"EntityRegistryName|LootTableName"`) plus difficulty-scaled tier selection (`leatherWeight` → `netheriteWeight` and `minBackpackTierMidDifficulty` / `HighDifficulty`). The tier-scaling is already built to track local difficulty, which lines up with our dimension progression. Could turn this into a "rare treasure hunt" mechanic rather than a silent loot injector.
- **Design sketch:**
  - Overworld hostiles (zombie/skeleton/creeper/spider/husk/stray/drowned) → tier-appropriate T1 chest table (our own `icraft:chests/t1_mob_backpack`)
  - Twilight Forest / Aether / Blue Skies mobs → T2 table
  - Nether mobs → T3 table
  - End mobs → T4 table
  - New icraft loot tables with flavor items matching each tier, NOT full dungeon loot (we want this to be a taste, not a bypass of structure exploration)
  - `chance = 0.005` (0.5%, half the default) so it's genuinely rare
  - `backpackDropChance = 1.0` — if it spawned with one, reward the kill
- **Implementation path:** (a) author `data/icraft/loot_tables/mob_backpack/tX.json` for each tier; (b) update `defaultconfigs/sophisticatedbackpacks-server.toml` `entityLootTableList` to map our shortlist of supported mobs to the icraft tables; (c) document in Codex (Systems > Drops).
- **Not doing now:** wait for tester to confirm SB was the spider-drop injector (pending dropdiag data) before re-enabling. Also wants a proper design pass on which mobs are eligible so we don't silently re-introduce the same "random diamond out of nowhere" surprise the tester already flagged.

### Balance Testing Backlog
- Witch of Ink progression (boss counter, Penthesilea capstone)
- Artificial Construct iron eating + upgrade ladder
- Phantom Undeath (EntityEvents.death cancel)
- All class passives (Focus shield, Seasoned Traveler, Healing Aura, etc.)
- Magic damage sync (puffish → ars_nouveau + irons_spellbooks)
- Transmuted materials in recipes
- See known-issues/tracker.md for full list

---

## Low Priority

### Ad Astra Endgame Completion
- 5 planets as post-T4 content
- Remaining: recipe gating, dimension scaling, loot tables, space enchantments
- MekaSuit Mk2 recipes

### Config Hot-Reload System
- Allow config/kubejs changes without full server restart
- KubeJS supports `/kubejs reload` for server scripts
- Configs require restart — investigate which can be hot-reloaded

### Pack Optimization
- Profile KubeJS tick handlers for TPS impact
- Consolidate tick-based scripts (class_passives.js, battlemage_mana_shield.js, etc.)
- Consider caching origin/class detection results longer

### Iron's Spells Compatibility
- Base mod works, KubeJS addon removed (client class references crash server)
- If custom spell creation needed in future, investigate server-safe alternatives

### Iridescent Attributes Library (post-1.0)
- Build our own `iridescent_attributes` mod/library that unifies the attribute systems currently scattered across Puffish Attributes, XP: Attribute Core, Apotheosis affixes, and vanilla attribute mods
- Goal: one canonical namespace for all RPG-style attributes (crit, lifesteal, dodge, magic damage, class stats, etc.) so tooltips stop showing the same concept under three different names
- Would replace XP: Attribute Core (dependency of Class Artifacts) with a drop-in compatible shim so third-party mods like Class Artifacts still find the attributes they expect
- **Blocked by:** full release of IridescentCraft — this is a post-1.0 consolidation project, not an alpha/beta blocker

---

## Completed (moved from roadmap)

Items move here when implemented. See [Design Changelog](../design/changelog.md) for details.

- ~~Server distribution automation~~ → `iridescentserver.bat/.sh`, `sync_from_repo.bat/.sh`
- ~~Origins expansion (4 races + 2 origins)~~ → Implemented 2026-03-19
- ~~Class passive implementations~~ → All 10 classes functional 2026-03-19
- ~~Magic damage sync~~ → `skill_effects.js` syncs to ars_nouveau + irons_spellbooks
- ~~Phantom Undeath~~ → `phantom_undeath.js`
- ~~Compass of Return~~ → `compass_of_return.js` + loot + recipe
- ~~Transmuted materials~~ → 5 items, forge tags, JEI hidden
- ~~Codex update~~ → 80+ entries current
- ~~Tier loot fix (Nether = T3)~~ → Corrected in lootjs_overhaul.js
- ~~Iron's Spells loot tiering~~ → Spell books + inks scale T1-T4
- ~~OfflineSkins~~ → Client-only mod for offline-mode servers
