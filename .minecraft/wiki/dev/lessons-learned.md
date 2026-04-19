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
