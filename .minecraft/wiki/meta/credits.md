# Credits & Attribution

IridescentCraft stands on the work of a large modded-Minecraft community. This
page lists every project that contributed source code, art, mechanics, or
ideas to the pack, organized by type of contribution.

Last updated: 2026-05-16.

---

## Custom mods bundled with the pack

The pack ships a small handful of mods authored or maintained for
IridescentCraft. Per the licensing of each upstream, attribution is required
in the source tree (see each mod's `LICENSE` and `NOTICE` files); this wiki
page is the public-facing summary.

### Forks of upstream projects

| Our mod | Upstream | Upstream license | What we kept / what we changed |
|---|---|---|---|
| [`iridescent-aptitudes-mod`](https://github.com/silvariasereneblossom/IridescentCraft/tree/main/iridescent-aptitudes-mod) | [Senior-S/JustLeveling-Fork](https://github.com/Senior-S/JustLeveling-Fork) — re-released from Tobinio's *Just Leveling* | Apache 2.0 | **Internal modid preserved (`justlevelingfork`)** so existing aptitude NBT survives the swap. Stripped gun-mod integrations (TacZ, Crayfish, Scorched Guns 2, PointBlank, BetterCombat), removed the KubeJS plugin subpackage, retuned passive-stat assignments off MAG. IridescentCraft KubeJS layer drives all on-skill behavior. |
| [`iridescent-origins-mod`](https://github.com/silvariasereneblossom/IridescentCraft/tree/main/iridescent-origins-mod) | [MerchantPug/Origins-Plus-Plus](https://github.com/MerchantPug/Origins-Plus-Plus) — extension of [Apace100/origins-fabric](https://github.com/apace100/origins-fabric) | MIT (both) | Bootstrapped from Origins++ data on 2026-03-04 (commit `da3e1b36`); renamespaced every asset key from `origins-plus-plus:*` to `icraft:*`, then diverged. Added 4 custom origins (Witch of Ink, Artificial Construct, Witherborn, Slimebodied), 4 new races (Demi-God, Ryu, Fallen Angel, Kirin), and 10 classes (Archmage, Battlemage, Berserker, Samurai, Ranger, Paladin, Vanguard, Wanderer, Artificer, Void Summoner). Heavily rebalanced upstream powers. |

### Original work (MIT-licensed)

These mods were written from scratch for IridescentCraft. They depend on third-party mods at runtime (those mods' own licenses apply to their own code), but no derived code is included.

| Our mod | Purpose | Runtime deps that significantly inform the design |
|---|---|---|
| `iridescent-biomes-mod` | TerraBlender region registration for `iridescent_biomes:cherry_river_valley` and `cherry_mountains`. Datapacks alone can't assign parameter points on TerraBlender 3.x; the Java side does it. | TerraBlender (Glitchfiend) |
| `iridescent-difficulty-mod` | Per-dimension HP / damage / champion-spawn multipliers + Apotheosis tier scaling | Apotheosis (Shadows of Fire), Champions (Wolfshotz) |
| `iridescent-modular-spells-mod` | Tetra-style modular spell books for ISS + Ars Nouveau | Tetra (mickelus), Iron's Spellbooks (Iron431), Ars Nouveau (Hollingsworth) |
| `iridescent-reforging-mod` | Tetra-style modular armor — `IModularItem` over `ArmorItem` | Tetra (mickelus) |
| `iridescent-tetra-expansion-mod` | Bundled distribution of `iridescent_reforging` + `iridescent_modular_spells` under one jar with two mod IDs | Tetra (mickelus), Iron's Spellbooks (Iron431), Ars Nouveau (Hollingsworth) |

The three Tetra-using mods extend Tetra's `IModularItem` interface and use its workbench. **Tetra is a runtime dependency, not derived code** — none of Tetra's code is copied into our mods.

---

## Major bytecode-patched JARs

Two third-party JARs are bytecode-patched in our shipped distribution. The patched class is a single-instruction change in each case; the bulk of the mod is unmodified and under the upstream license.

| JAR | Author | Upstream license | Our patch |
|---|---|---|---|
| `Patchouli-1.20.1-85-FORGE.jar` | Vazkii | CC-BY-NC-SA 3.0 (Patchouli) | `athrow → pop` in `Book.class` — disables use-resource-pack enforcement so our shipped codex book loads in a non-resource-pack-aware environment |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | Hollingsworth | LGPL-3.0 | `doApply → immediate return` in `DungeonLootEnhancerModifier.class` — disables Ars Nouveau's GLM chest-loot injection so our curated chest pools win |

Both patches require `-noverify` on the JVM (deprecated in Java 17 but functional). Details in [Appendix §J](../design/master-appendix.md#j-bytecode-patches).

---

## Runtime dependencies that shape the design

A non-exhaustive list of mods we lean on heavily for core systems. The pack does not work without them.

| Mod | Author | What we use it for |
|---|---|---|
| Tetra | mickelus | Modular-item framework -- backbone of armor + spell books |
| Apotheosis | Shadows of Fire | Enchanting + affix + gem systems; gems are our T1 enchanting-table ingredient |
| Apothic Attributes | Shadows of Fire | Crit chance / crit damage / lifesteal / dodge attribute system |
| Iron's Spellbooks | Iron431 | Primary ISS-side spell system; canonical mana pool post the 2026-05-15 unified-pool migration |
| Ars Nouveau | Hollingsworth | Secondary spell system; mana-routed through ISS via `ArsManaCapMixin` |
| Origins (Forge port) + Apoli | EdwinMindcraft, Apace100 | Power system that `iridescent_origins` data plugs into |
| KubeJS | LatvianModder | Server-side scripting layer (170+ scripts) |
| LootJS | AlmostReliable | Loot-table modifier API |
| Puffish Skills + Attributes | puffish | Skill trees + cross-mod attribute system |
| Champions | Wolfshotz | Boss-counter source for Witch of Ink scaling |
| Patchouli | Vazkii | In-game codex book |
| AStages | Darkhax | Per-player tier gating |
| Geckolib | Bernie | Animation framework used by ISS / Ars / our modular armor renderers |
| Curios | TheIllusiveC4 | Trinket / ring / belt slot framework |
| Sophisticated Backpacks | P3pp3rF1y | Bag system |
| When Dungeons Arise | foxyno | Structures (T1-T2 dungeons) |
| Twilight Forest | Benimatic | T2 dimension |
| Aether | Modding Legacy + Ascending | T2 dimension |
| Blue Skies | TaleOfTheChicken | T2 dimension |
| Cataclysm | shar_3303 | T3-T4 ultra-bosses |
| Mekanism | aidancbrady | T3 tech tier |
| Botania | Vazkii | Magic-tech hybrid system |
| Twilight Forest, Aether, Blue Skies, Undergarden, Deep Aether, Deeperdarker, The Abyss | various | Dimensions threaded through our tier system |

---

## Concept inspiration (not derived code)

Designs we drew on without copying source:

- **Tetra Spell Book (TSB)** — All-Rights-Reserved. Our `iridescent-modular-spells-mod` is conceptually adjacent (Tetra-modular spell books) but the implementation is independent, per the upstream license. No code shared.
- **Various Tetra modular-armor add-ons** — General "armor with Tetra slots" pattern is in the air; our `iridescent-reforging-mod` is an original implementation against Tetra's public `IModularItem` interface.

---

## Asset / texture credits

Textures shipped in our custom mods are either:
- Original work by Silvaria, or
- Vanilla Minecraft textures (Mojang, used per the EULA), or
- Mod-thematic items re-used from the mods we depend on (consumed at runtime via the mod's own asset system, not copied into our jars).

No third-party texture-pack content is copied into the shipped distribution.

---

## Maintenance note

When forking a new mod into the `iridescent-*-mod` family, the checklist is:

1. **Preserve `LICENSE` from upstream** in the new mod's root (rename to clarify if multi-license, but never strip the upstream copyright).
2. **Add a `NOTICE` file** describing what was forked, when, and what changed. The Apache 2.0 family REQUIRES this; MIT requires copyright preservation; LGPL requires the LGPL text + offer-of-source. CC-BY-* requires attribution in user-visible material.
3. **`mods.toml`** — set `license=` to the correct SPDX identifier (or the upstream's identifier), `authors=` to ours, and add a `credits=` line with a one-line upstream pointer.
4. **Add a row to this page** describing the fork.
5. **Add a row to** [`master-appendix §J Bytecode Patches`](../design/master-appendix.md#j-bytecode-patches) **if the modification is a bytecode patch** rather than a fork.

When in doubt, lean toward over-crediting. Attribution costs nothing and prevents bigger problems later.
