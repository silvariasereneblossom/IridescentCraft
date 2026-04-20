# Dev Lessons Learned

<!-- INTERNAL ONLY — do NOT mirror to the public GitHub wiki. -->

Postmortem log for implementations that stalled, failed, shipped wrong, or took many more sessions than they should have. For each entry:

- **What broke / what looked wrong** — the visible symptom
- **Dead ends** — approaches tried that didn't fix it (and why they looked plausible)
- **Actual root cause** — the real thing, once found
- **What actually fixed it** — the change that ended the loop
- **Takeaway** — the rule/guardrail/check that would have caught it earlier

This page is for honest retro, not for user-facing docs. Write freely. Order is reverse-chronological (newest first).

---

## 2026-04-20 — Catch-all `@modid` strips silently eat every subsequent same-namespace re-add

**Symptom:** Tester reported for the third day in a row that Ars Nouveau glyphs weren't showing up in village chests, and white beds never spawned in any village container. I'd added the relevant `addLoot` calls explicitly and verified they were syntactically correct, so each day I kept adding MORE items to the re-add lists, thinking I was fixing a missing injection. None of them landed.

**Dead ends:**
- Three days of bumping up per-item rates (0.05 → 0.08 → 0.15 for some items) assuming low rates were the cause. With 15 tables × 20% per chest × 5 chests opened, probability says you'd see at least one bed even at 6%. The "zero observations" signal should have flagged a hard-zero bug (something deleting the item) rather than a low-rate rolling issue.
- I kept using `git blame` and reading the add lines to check correctness. The add lines were always fine.
- I didn't think to look *above* the re-adds in the same code path for a matching strip. The strip was 50 lines earlier, in a different "section" of the file, and used a namespace tag (`@ars_nouveau`) instead of a specific item id — which looked like "strip unwanted mod items" to me, not "strip every single re-add I'll do later."

**Actual root cause:** LootJS's persistent-filter rule extends to **namespace tag** strips, not just specific-id strips. `removeLoot('@ars_nouveau')` establishes a filter on the *entire* `ars_nouveau:` namespace for the remainder of the evaluation pass. Any later `addLoot(LootEntry.of('ars_nouveau:source_gem'))` in *any* modifier on the same table silently gets caught by that filter and removed. Same for `@irons_spellbooks` killing `copper_spell_book` + `common_ink` re-adds, and `@moreartifacts` killing every artifact add intended to recover the T1 pool.

The re-add code was correct. The namespace strip was the killer, from a SANITIZATION block comment describing it as stripping "mod leakage." In practice it was stripping every intentional add too.

**What fixed it:** Replaced each `@modid` strip with specific item IDs for the items we actually don't want (apprentice/archmage spell books for Ars Nouveau, tier tokens for KubeJS). Left the rest of each namespace alone so the re-adds can land.

**Takeaway:**
- The 2026-04-18 persistent-filter lesson was written about specific-id strips. Update that rule in mental model: **`@modid` strips propagate the same filter behavior, scaled up to every item in that namespace.** A single `removeLoot('@modname')` can neuter fifty downstream `addLoot` calls for items from that mod, silently.
- When a tester reports "I never see item X" across many observations, default to a hard-zero hypothesis (something is deleting it) before a low-rate one (rolls aren't coming up). "Never" is signal; "rarely" is statistics.
- When reading LootJS code, read the ENTIRE modifier chain for a given table before reasoning about what lands. Sections in the file are organizational, not execution-scoped. A strip in Section 6A will eat an add in Section 6B on the same table. Best to grep by table id (or regex of table id) to see every modifier it's part of before changing any of them.

---

## 2026-04-20 — Lootr aggressive_mode oscillation: two failure modes, neither "off"

**Symptom:** Tester: "first village chests aren't converting at all — shared inventory, regular vanilla chest." Server log: `[noobanidus.mods.lootr.api.LootrAPI/]: There are over 5000 entries in the pending conversion list.`

**Dead ends:**
- This is the THIRD flip of `aggressive_mode`. The prior Apr-19 flip from `true → false` was accompanied by commit message "every village chest generating as vanilla instead of Lootr per-player" — the exact same visible symptom as today, but the fix was the opposite direction. Both flips "worked" for a few days, then failed the same way.
- The root insight missed each time: Lootr has two independent failure modes, and flipping this one bit trades which one bites you.

**Actual root cause:** `aggressive_mode` toggles Lootr between two conversion strategies, both of which *can* leak vanilla chests into the world under IridescentCraft's specific load profile:
- `aggressive_mode = true`: eagerly checks every block entity during chunk load. Sometimes skips eligible chests that spawn via structure gen *after* the chunk entity scan completes (mostly village worldgen). Small-to-medium % leak.
- `aggressive_mode = false`: adds candidates to a ticker queue, processes slowly. Under IridescentCraft's structure-mod load (~30 mods spawning chests), queue piles to 5000+ and gets processed too slowly — chests get opened before the ticker reaches them → vanilla chest. Large % leak under heavy load.

The deciding evidence this time was the explicit Lootr-API error log about the 5000-entry queue, which is only emitted when `aggressive_mode = false`. The Apr-19 flip to false happened before that diagnostic existed (or before I knew to grep for it), and the village-chest complaint was attributed to aggressive mode missing them — when in reality both modes miss them, just in different ways.

**What fixed it:** Flipped back to `aggressive_mode = true`. Accepting the "small% missed" failure mode over the "most missed" failure mode under current load.

**Takeaway:**
- When a fix reverses a prior fix with the same user-reported symptom, the prior diagnosis was probably incomplete. Before flipping a config back, grep the server log for error lines *specific to the current mode* (Lootr conveniently emits a pending-queue warning under one mode only). Finding that warning collapses the ambiguity.
- A recurring oscillation is a flag that this feature has *no* strictly-correct setting under the current load profile. Document both failure modes in the config comments or a dedicated doc so the next operator doesn't flip again looking for a clean win.
- If aggressive-mode-missed chests become a problem again, the fix is additive: add specific `additional_chests` entries for the commonly-missed ones (village_weaponsmith, village_plains_house, etc.) rather than flipping the mode.

---

## 2026-04-19 — Audit deleted Epic Dungeons coverage because its namespace didn't match its slug

**Symptom:** Tester reported finding netherite and diamond gear in Overworld chests well before reaching any gated dimension. Commit archeology showed the regex-audit session had proudly "removed dead `overhauledstructures` and `lootintegrations` blocks" from `lootjs_overhaul.js`.

**Dead ends:**
- The regex-audit session checked the modpack's `.pw.toml` list for a mod named `overhauledstructures` and didn't find one, concluding the namespace was dead legacy code.
- Nothing flagged that the search should have been the *other direction*: given the namespace, find which mod ships that data folder.

**Actual root cause:** Namespace-vs-slug mismatch. The mod file is `Epic Dungeons-0.1.04-Forge-1.19-1.20.1.jar`, the packwiz slug is `epic-dungeons-a-roguelike-minecraft`, the display name is "Epic Dungeons: A Roguelike Minecraft", but the mod's internal data is shipped at `data/overhauledstructures/...`. Checking the `.pw.toml` list will never turn that up. The dungeons spawn in `#minecraft:is_overworld` with spacing 32/24, their top-tier chest (`ovdb_chest_3`) drops netherite_ingot at ~4.5% and diamond armor at ~1.5%, and since the LootJS coverage was removed, all 12 chest tables were shipping unmodified.

**What fixed it:** Downloaded the jar (3MB from Modrinth) and ran `unzip -l | grep data/` to list the actual data namespace. Re-added an overhauledstructures block in LootJS with a proper overhaul (strip + thematic per-family additions for the three dungeon families ovdb/ovdp/ovds) rather than just restoring the old block.

**Takeaway:**
- Before deleting a LootJS regex as "dead", run `unzip -l mods/*.jar | grep -i <namespace>` across the actual installed jars — don't trust the packwiz slug list alone. The slug is the *download* identifier; the namespace is the *data* identifier; they are allowed to be arbitrarily different and Epic Dungeons exploits that gap.
- When auditing structure mods generally, fetch the 5 MiB of relevant jars and inspect `data/<namespace>/loot_tables/` directly. A speculative audit from `.pw.toml` metadata can confidently mislead — this session proved that by producing two different "final" reports, one from metadata-only (said Epic Dungeons had no data) and one from jar inspection (caught the tier break).

---

## 2026-04-19 — Codex empty even after the modId fix was correct

**Symptom:** After the prior session's `modId="icraft"` fix, the book was now registered (no "Invalid book ID" tooltip), but opening it showed empty contents. Client log: `Error loading and compiling book icraft:iridescent_codex, using empty contents / RuntimeException: Entry in file .../t1_bosses.json does not have a valid category`. Warnings: `Queried for unknown config flag: icraft:stage_tier_3/4`.

**Dead ends:**
- Verified the jar was updated: `unzip -p .../stars.json` returned the new `"advancement": "icraft:stage_tier_4"`. Concluded "deployment is correct, something else is broken."
- Verified `datapack_sources/iridescent_codex/` was consistent (all `"advancement"`). Concluded the repo state was clean.
- Checked the deployed jar's `data/` and `assets/` folders — both had the correct `"advancement"` content across all 13 categories. The jar was fine.

**Actual root cause:** Minecraft's resource pack priority. The log line `Reloading ResourceManager: mod_resources, vanilla, KubeJS Resource Pack [assets], ...` shows KubeJS Resource Pack loads **after** mod_resources — later packs **override** earlier ones. A leftover `kubejs/assets/icraft/patchouli_books/iridescent_codex/` folder from the pre-jar era still had every category JSON using `"flag": "icraft:stage_tier_N"` gating. KubeJS's resource pack won over the jar, Patchouli 1.20.1-85 didn't recognize the old `"flag"` key, category parse failed, and every entry pointing to those categories reported "does not have a valid category."

Same pattern, second layer: `server_distribution/global_packs/required_data/iridescent_codex.zip` — a stale Paxi 3.x legacy datapack from before the jar migration — was being auto-loaded by Minecraft (`Found new data pack iridescent_codex.zip, loading it automatically`) and also still had `"flag"` content.

**What fixed it:** Deleted `kubejs/assets/icraft/patchouli_books/iridescent_codex/` and `kubejs/data/icraft/patchouli_books/iridescent_codex/` in all 3 distros. The jar ships both `assets/` and `data/` so no content is lost — just the shadowing fallback removed. Also deleted `server_distribution/global_packs/required_data/iridescent_codex.zip`. Only the jar and source-tracked `datapack_sources/iridescent_codex/` remain.

**Takeaway:**
- When migrating content between delivery mechanisms (KubeJS fallback → jar → Paxi → etc.), the OLD mechanism's files must be actively deleted. "The new one takes priority" is usually wrong — resource pack load order often puts user/runtime content AFTER mods, so legacy copies shadow the authoritative source. Always check the `Reloading ResourceManager` line in the log to see the actual pack order, and hunt down every copy of the content.
- CLAUDE.md explicitly said "KubeJS data/ + assets/ copies are kept as a harmless fallback." They were not harmless — they were stale. A "fallback" that diverges from the authoritative source is a latent landmine. If you keep a fallback, it has to be regenerated from source in the same build step that builds the authoritative artifact, or dropped.
- `find .minecraft -path "*/patchouli_books/iridescent_codex*"` run early in a codex-debugging session would have surfaced all four copies (jar, datapack_sources, kubejs/assets, kubejs/data, global_packs/required_data) in one shot.

---

## 2026-04-19 — Rivers never generated across many tests

**Symptom:** Tester reported never seeing a single river across multiple fresh worlds, even after a commit explicitly labeled "More water".

**Dead ends:**
- Assumed the "More water" commit (3b14ec9d, ridge 0.12→0.08 / erosion 0.14→0.10) had moved the knobs in the right direction; never verified against Tectonic's documented defaults.
- Looked first at whether the commit had been pushed/deployed (it had); then whether config was bitwise-identical across all three distros (it was). Both clean, so concluded "it's deployed" and moved on.
- Re-ran the same test (create new world) multiple times expecting rivers, instead of inspecting biome sources.

**Actual root cause:** Two stacked problems. (1) The "More water" knobs were inverted: *lower* `ridge_scale`/`erosion_scale` in Tectonic means *flatter* terrain with fewer carved channels — opposite of the commit's stated intent. (2) `config/paxi/datapacks/bop_biome_weights.zip` → `bop_custom_region.json` is a `terra:overworld` TerraBlender region with 20 landmass biomes and zero river biomes, so BoP was winning parameter-point selection for river slots and substituting landmass biomes.

**What fixed it:** `ridge_scale 0.08→0.3`, `erosion_scale 0.1→0.4` (both slightly above Tectonic defaults). Prepended `minecraft:river` (w=20) + `minecraft:frozen_river` (w=6) to the BoP region. Source-tracked the previously-orphaned zip at `datapack_sources/bop_biome_weights/`.

**Takeaway:**
- Before tuning a numeric knob in a mod config, check the mod's own default and document the direction of effect in the commit message. "Higher ridge_scale = taller ridges = deeper river valleys" belongs in the commit body.
- Paxi zips that live in `config/paxi/datapacks/` but have no corresponding `datapack_sources/` folder are invisible to every audit; they should be extracted to source the moment they're discovered (this is now codified in the triage-untracked feedback memory).
- When tests keep failing the same way, look for a layer that wasn't inspected — don't just re-run the test. In this case: biome selection (BoP region) was silently overriding the knob tuning.

---

## 2026-04-19 — Iridescent Codex "Invalid book ID" (many sessions)

**Symptom:** In-game tooltip "Invalid book ID" on every codex book, across multiple sessions and several attempted rebuilds.

**Dead ends:**
- Tried `lowcodefml` loader instead of `javafml`. No change — book still invalid.
- Tried a KubeJS fallback to manually register the book. No change.
- Suspected `show_progress`, then `book.json` schema, then Patchouli version compatibility. All verified correct.
- Rebuilt the jar repeatedly with the same modId (`iridescent_codex_data`), assuming the mod wasn't loading — it was loading fine; the book just wasn't being scanned.

**Actual root cause:** Patchouli's `BookRegistry.init()` scans `data/{modId}/patchouli_books/` where `{modId}` is the *mod's* own id, not the book's namespace. Our jar was `modId="iridescent_codex_data"` but the book JSON lived at `data/icraft/patchouli_books/iridescent_codex/book.json`. Patchouli was silently scanning `data/iridescent_codex_data/patchouli_books/` — which doesn't exist in our jar — and never saw the book.

**What fixed it:** Decompiling the Patchouli lambda (`lambda$init$2`) and seeing `"data/%s/%s"` formatted with `mod.getId()`. Renamed the mod to `@Mod("icraft")` so the scan path matched the actual data directory.

**Takeaway:**
- When a book/feature "isn't being registered" despite a correct-looking JSON, inspect the bytecode of the scanner. "This looks right by convention" is not proof; the scanner's path formatter is truth.
- Mod namespaces in Forge have three different identifiers that are easy to conflate: the *jar filename*, the `@Mod("id")`, and the `data/<namespace>/` directory. Patchouli uses the `@Mod` id as the key — other mods use the asset namespace. Always check which one the target mod reads from before naming a content mod.

---

## 2026-04-18 — Blank enchanted books in loot (reopened twice)

**Symptom:** Enchanted books in chest loot had no stored enchantments — blank on the tooltip. Issue was "fixed" on 2026-04-11 but came back.

**Dead ends:**
- First fix: switched `.enchantRandomly()` → `.enchantWithLevels(NumberProvider)` — correct in isolation but still produced blank books.
- Suspected vanilla `enchantItem` was rejecting our stacks; read vanilla source. `EnchantmentHelper.enchantItem` checks `stack.is(Items.BOOK)` to convert to an enchanted book with the proper NBT tag. We were passing `LootEntry.of('minecraft:enchanted_book')`, which is already a converted book with *Enchantments* NBT, not *StoredEnchantments* — so the enchant selection silently no-opped.
- A separate pass removed `removeLoot('minecraft:enchanted_book')` because the 2026-04-15 LootJS audit had shown `removeLoot(specific_id)` is persistent across the same evaluation pass and was eating our re-adds.

**Actual root cause:** Two bugs layered on top of each other. `LootEntry.of('enchanted_book')` produces an item that `enchantItem` can't apply levels to (wrong NBT tag). And the specific-item strip was catching the re-adds anyway, so even when the enchant call was correct it was being stripped.

**What fixed it:** Changed all four tier re-adds to `LootEntry.of('minecraft:book')` (vanilla BOOK item) + `.enchantWithLevels(...)`, so `enchantItem` does the NBT conversion itself. Removed the redundant global strip.

**Takeaway:**
- LootJS `addLootTableModifier` + `removeLoot(specific_item)` have a persistent-filter behavior that catches items re-added by later modifiers in the same pass. When you "strip then re-add" the same item in one script, the strip wins — always.
- When a vanilla helper isn't doing what you expect, check the item predicate it's guarding on (`stack.is(Items.BOOK)`, etc.), not just the surface API.

---

## 2026-04-19 — Starlight re-pulled by force sync after being deleted

**Symptom:** `starlight-*.jar` kept reappearing in `mods/` on the server after being removed, crashing with `BlockStarLightEngine.initNibble ISE` whenever Create loaded chunks.

**Dead ends:**
- Deleted the jar from the live server several times. It came back on every `iridescentserver.bat -Force` run.
- Assumed the strip script was missing a pattern; added `*starlight*` to `strip_client_mods.sh`/.bat. Crash still recurred because the strip runs *after* the installer's download phase — the file had been re-downloaded and the strip wasn't being triggered before the server launch path in some branches.

**Actual root cause:** Two layers of silent-restore. (1) `starlight.pw.toml` was still in `mods/.index/` (deletion was staged in working tree but never committed), so `server_install.ps1` re-downloaded it every full sync. (2) The `-Force` path in `phase0_sync.ps1` wrote a post-sync SHA *before* validating the install succeeded, so subsequent syncs thought state was clean and didn't re-strip.

**What fixed it:** Committed the `D` (deleted-not-staged) entries in `mods/.index/starlight-*.pw.toml`, added `starlight` to the `$forceSkip` array in `server_install.ps1`/`update_mods.ps1`/`update_mods.sh`, and added `*starlight*` to `strip_client_mods.sh`/.bat as belt-and-suspenders. Also fixed `phase0_sync.ps1` to only write the post-sync SHA when `$errors -eq 0`.

**Takeaway:**
- A deletion that's in the working tree but not committed is **silently restored** on the next sync that treats the committed tree as authoritative. Always `git status --short` at the start of a crash-debugging session and commit pending `D` entries before running the distribution sync again.
- Codified as the "triage untracked entries at session start" feedback rule — `??` and `D` entries in `git status` are not "someone else's in-progress work"; they need to be decided every session.

---

## Template (for future entries)

```markdown
## YYYY-MM-DD — Short title

**Symptom:** What the tester/user saw.

**Dead ends:**
- Approach N, why it looked plausible, why it didn't work.

**Actual root cause:** The real thing, stated flatly. No hedging.

**What fixed it:** The specific change (file, line, value) that ended the loop.

**Takeaway:** The rule or check that would have caught this earlier. Prefer concrete checks over "be careful" platitudes.
```
