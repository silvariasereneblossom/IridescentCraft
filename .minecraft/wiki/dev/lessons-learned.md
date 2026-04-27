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

## 2026-04-23 — Cherry biome FeatureSorter cycle crash: orphan datapack in a shadow namespace

**Symptom:** Server crashed at world load with `java.lang.IllegalStateException: Feature order cycle found, involved sources: [minecraft:lush_caves, icraft:cherry_mountains, biomesoplenty:moor]`, thrown from `com.teamabnormals.blueprint.common.world.modification.ModdedBiomeSlicesManager.lambda$onServerAboutToStart$3`. Every world gen chunk after server start raised it. Persisted across ~20 iterations of "fix the biome JSON" / "fix the TerraBlender region" / "fix the tags."

**Dead ends (in order attempted, each session-days long):**
- Reordered step 9 features to match vanilla `cherry_grove` (same prefix, same suffix, verbatim copy). Crash persisted.
- Added biomes to `#minecraft:is_overworld` and `#minecraft:is_mountain` tags thinking a modifier-targeting mismatch was the issue. Crash persisted.
- **Removed** both tags thinking a tag-targeted modifier was injecting cycling features. Crash persisted.
- Wrote a Python FeatureSorter-cycle detector (`tools/check_feature_cycles.py`) running against vanilla + BoP + all 444-mod-pack biomes with per-step consecutive-pair edges and general DFS cycle detection. **Detector PASSED across 241 biomes** — told me there was no cycle to find.
- Set `features: [[], [], ..., []]` (all eleven steps empty) in both biome JSONs. Crash persisted — cherry_mountains was still listed as "involved source" with zero declared features, which should have been impossible.
- Disabled the TerraBlender region registration entirely. Server loaded clean. That pointed at "biome presence in `possibleBiomes()` is the trigger, not content" — which was half-right but the *wrong* biome was the one in possibleBiomes.
- Rewrote from `addBiomeSimilar(CHERRY_GROVE, ...)` to `addBiome(explicit ClimateParameterPoint, ...)` — the method every other working biome mod in the pack uses. Audited all 444 jars; found we were the only `addBiomeSimilar` caller. Crash persisted.
- Flipped `mods.toml` ordering from `BEFORE` to `AFTER` for both `terrablender` and `biomesoplenty` (BoP's setting). Load order did change (our region moved from index 1 to later). Crash persisted.
- Removed tectonic (lithostitched `river_lichen` modifier targeting `#is_overworld`). No effect.
- Removed lionfishapi (its `lionfishapi:original` slice forces Blueprint to run FeatureSorter regardless of Blueprint's own `OriginalModdedBiomeProvider` check). Didn't get to test cleanly.

**Actual root cause:** The pack had **two independent systems registering the same biome IDs**. One was the `iridescent-biomes-mod` Java mod we'd been iterating on. The other was `datapack_sources/icraft_biomes/` — an early prototype datapack that had been compiled into `config/paxi/datapacks/icraft_biomes.zip` and was still being auto-loaded by Paxi every world load. The zip's `data/minecraft/tags/worldgen/biome/is_overworld.json` listed `icraft:cherry_mountains` and `icraft:cherry_river_meadow`. When the mod's registration was healthy, both systems registered the same biomes and there was no visible conflict. When the mod moved to the `iridescent_biomes:` namespace (or was disabled, or had empty features, etc.), the `icraft:` biomes from the datapack remained — registered in the biome registry, tagged `#is_overworld` (so every overworld-scoped biome modifier still injected features into them), but not placed in any TerraBlender region. Blueprint's `ModdedBiomeSlicesManager.onServerAboutToStart` FeatureSorter pass saw those orphans in the biome set with feature lists that couldn't be reconciled against their missing parameter points — the cycle report was correct; I was just looking at the wrong biome the whole time.

The crash message "involved sources: [..., icraft:cherry_mountains, ...]" was literally accurate. The `icraft:cherry_mountains` involved in the cycle was *not* the mod's biome — it was the orphaned datapack biome with the same local name, a different namespace, and no placement.

**What actually fixed it:** commit `8c85d818`.
- Deleted `datapack_sources/icraft_biomes/` (the source).
- Deleted `config/paxi/datapacks/icraft_biomes.zip` from all three distros.
- Moved the mod's own biome files from `data/icraft/worldgen/biome/` → `data/iridescent_biomes/worldgen/biome/` so the mod's `modId` matches its biome namespace (the convention every working TerraBlender biome mod in the pack follows).
- Updated tag values, Java ResourceLocation literals, and pack-side references (`kubejs/server_scripts/loot/lootjs_overhaul.js`) to the new namespace.

**Takeaways:**

1. **When a crash names a resource ID, `grep -r` the entire pack for that ID before analysing the failure.** If more than one file defines/declares it, that ambiguity is usually the bug. I should have been running `grep -rn "icraft:cherry_mountains" .minecraft/` on session 1, not session 15. Added to mental checklist: any FeatureSorter/registry/world-gen crash naming a specific ID → grep-sweep first.
2. **`datapack_sources/*` directories can contain stale builds.** When the mod-based implementation of a datapack replaces the datapack source, delete the `datapack_sources/<name>/` folder AND the compiled zip under `config/paxi/datapacks/` in the same commit. Otherwise the zip keeps running indefinitely, invisible to anyone not looking at the Paxi directory.
3. **Mod `modId` should match biome namespace.** Every working TerraBlender biome mod in this pack (BoP, Quark, aeroblender, etc.) puts biomes under its own `modId`. We were putting ours under `icraft:` — owned by `iridescent_origins` — which would have been OK if that were the only registration point, but combined with an orphan datapack in the same namespace it was catastrophic. Rule: new biome mod → biome namespace == modId, no exceptions.
4. **`tools/check_feature_cycles.py` was correct; my interpretation was wrong.** The detector audits biome JSONs on disk (from vanilla + BoP + shortlist of modded jars + our mod's `src/main/resources/`). It does NOT scan `config/paxi/datapacks/*.zip` or `.minecraft/kubejs/data/`. So the orphan datapack's biomes were invisible to it. Added to the detector's LIMITATION docstring going forward. When a detector says "no cycle" but production crashes, the detector's input set is wrong — expand the input, don't distrust the algorithm.
5. **The Blueprint stack trace was telling the truth.** "Involved sources: [three biomes]" meant those three biomes were the ones with inconsistent state. The fact that I couldn't reproduce the cycle in my simulation just meant my simulation was missing one of the three — it wasn't missing cherry_mountains (I had that), it was missing the SECOND cherry_mountains with a different namespace. Lesson: when a crash identifies specific IDs, enumerate *every* registration of that ID in the environment, not just the one you built.

**Time cost:** ~20 crash-and-fix iterations, two full session days. A single early `grep -rn "cherry_mountains" .minecraft/` would have surfaced the datapack in 5 minutes.

---

## 2026-04-21 — LootJS JS-function predicates silently become ALWAYS_FALSE

**Symptom:** Predicate filters for village artifact stripping (`event.addLootTableModifier(table).removeLoot(function(stack) {...})`) and for blank-enchanted-book stripping (`event.addLootTypeModifier(LootType.CHEST).removeLoot(blankEnchantedBookFilter)`) appeared registered but never actually stripped anything. Tester reports of "artifact in every chest" and "blank enchanted books still appearing" persisted across multiple fix attempts.

**Dead ends:**
- Assumed `removeLoot(predicate)` accepted a JS function because `ItemFilter extends Predicate<ItemStack>` and KubeJS usually auto-wraps.
- Blamed ordering between type-level injects and table-level removes. Predicate strips still silently no-opped after reordering.
- Switched `addWeightedLoot([air, ...artifacts])` to per-item `addLoot(.when(randomChance))` to work around what I thought was an air-dropping bug. Only the *rate* issue would be fixed by this — the non-curated-artifact leak is a separate filter problem.

**Actual root cause:** Decompiled `lootjs.jar` (`com.almostreliable.lootjs.kube.LootJSPlugin.ofItemFilter`). When `removeLoot(x)` is called from JS, the TypeWrapper runs `ofItemFilter(x)`: it first calls `IngredientJS.of(x)`, which returns an *empty* ingredient when given a function. The code then logs `"LootJS: Invalid ingredient for filter: Unknown"` and returns `ItemFilter.ALWAYS_FALSE`. The strip is registered, but with a filter that never matches anything. The warning was right there in `kubejs-server.log` (16x for village filters, 16x for blank book fallback, once for the global strip) — we just hadn't read the WARN lines.

The correct pattern is `removeLoot(ItemFilter.custom(fn))`. `ItemFilter.custom(Predicate)` is the static factory that wraps a JS function into a real `ItemFilter`. Without the explicit wrap, the Ingredient path swallows the function.

**What fixed it:** Loaded `com.almostreliable.lootjs.filters.ItemFilter` via `Java.loadClass` at the top of `lootjs_overhaul.js` and wrapped both predicate-based `removeLoot` call sites with `ItemFilter.custom(fn)`.

**Takeaway:**
- **Read WARN lines, not just ERROR lines.** The startup log had `"LootJS: Invalid ingredient for filter: Unknown"` fire 30+ times per server start. Every one of those was a silently-broken filter. We'd been reading ERROR-level output and missing the WARN that pointed straight at the cause.
- Same pattern as the Origin NBT probe: an API that accepts `Object`-typed arguments routes through a best-effort parser that falls back to a safe no-op on failure. Silent safe no-ops are the worst UX for authors because the thing *looks* registered. Treat WARN spam during mod-integration work as first-class signal.
- The jar audit reflex applies here too. LootJS's overload resolution was not guessable from the API surface alone — the log said "Invalid ingredient" but the real answer was inside `ofItemFilter`'s bytecode.

---

## 2026-04-21 — Origin NBT probe: list-shaped query against compound-shaped data (hit #2 in the same session)

**Symptom:** After the 2026-04-20 "ForgeCaps rewrite" we believed the origin-detection probe was fixed. Tester logs kept showing `detected=none` for every magic-class probe over a full 3-minute poll window. Even the `!origindump` fallback (which probes vanilla+icraft origins via the same NBT pattern) matched nothing. Two sessions of poll-timeout reports with nothing to show for it.

**Dead ends:**
- Assumed the 2026-04-20 rewrite that swapped `cardinal_components` → `ForgeCaps` had landed correctly — it had, but only on the capability key, not on the interior NBT shape.
- Added a polling loop, thinking the UI was still open during login. Polling didn't help because the probe itself never matched.
- Added an auto-origindump on login + a raw `player.nbt` read path. Both would have helped diagnose, but the fix came before the tester logged in to use them.
- Suspected threading issues with the chat handler when `!origindump` produced no log output.

**Actual root cause:** Decompiled `origins-forge-1.20.1-1.10.0.9-all.jar` (OriginContainer.serializeNBT bytecode) and found the actual shape. `Origins` is a `CompoundTag` of `{layer_id_string: origin_id_string}`, not a `ListTag` of `{origin: "..."}` objects. Every probe in the codebase used the list shape:
```
{Origins:[{origin:"icraft:archmage"}]}          // what we wrote
{Origins:{"origins:class":"icraft:archmage"}}   // what the jar actually writes
```
A NBT match on a list structure against a compound value can never succeed, so the probe always returned 0. This was silently wrong across 17 call sites in 9 scripts (magic-class detection, class_passives gating, witherborn/slimebodied hooks, skill_effects, phantom_undeath, battlemage_mana_shield, artificial_construct_progression, witch_of_ink_progression).

**What fixed it:** Rewrote all 17 probes to use the compound shape with an explicit layer id (`origins:class` for classes, `origins:race` for races, `origins:origin` for the vanilla+custom origin layer). Built a Python script to do the literal rewrites, hand-edited the 6 remaining template patterns (with `${varname}` interpolations). For the origindump which iterates across all three layer types, now probes all three layers per ID and reports which layer matched.

**Takeaway:**
- **When a bug resists a fix, decompile the jar instead of guessing at the shape.** Our ForgeCaps rewrite last session fixed the capability *name* but kept the wrong *interior shape* — both had to match reality. One audit of OriginContainer.serializeNBT would have told us both facts at once, in 10 minutes.
- `execute if entity [nbt={...}]` fails silently on shape mismatches. There's no error, no warning, just `r === 0` every time. Where silent failure is this cheap, a single passing test with a known-good character is worth the debugging it saves.
- This is the exact same failure shape as the glyph tier bug two days ago: a parallel manual model that drifted from the mod's own data. The mod jar is the source of truth — our probes should be generated from (or asserted against) its actual serialization code.

---

## 2026-04-21 — Village T1 artifact strip was string-matched against a type-level broadcast

**Symptom:** Tester reported uncurated artifacts appearing in village chests (artifact names not present in `villageArtifactPool`), even though Section 6 had a per-item strip that explicitly called `vSan.removeLoot(id)` on every element of `artifactT1Pool`.

**Dead ends:**
- Double-checked that `artifactT1Pool` was the correct array being iterated
- Verified the village sanitization block ran after the T1 broadcast registration (it did, line 1551 vs line 450)
- Considered and rejected moving the T1 broadcast behind a `.notTable(villagePattern)` filter (not confirmed available in LootJS 2.13.1's fluent builder, would need jar introspection)

**Actual root cause:** `event.addLootTableModifier(table).removeLoot('id_string')` on a village table cannot reliably strip items injected by `event.addLootTypeModifier(LootType.CHEST).anyDimension(OW).addLoot(LootEntry.of(id))` — the type-level injection produces the item as part of a different modifier pipeline and the string-based per-table strip's scope doesn't cross that boundary. It's the same pattern-shape as the earlier Bed failure: a modifier that looked registered but silently no-opped because of LootJS's internal ordering.

**What fixed it:** Switched the village artifact strip from string-matched per-item removals to a predicate-based `removeLoot(function(stack) {...})`. A predicate runs at roll time and inspects whatever ended up in the pool, so it catches type-level broadcast leaks regardless of registration order. The predicate whitelists `villageArtifactPool` and strips anything else from the `artifacts:` / `relics:` / `celestial_artifacts:` namespaces.

**Takeaway:**
- **When you have a global broadcast and a local exception, don't rely on string-matched removals** — they're a point-in-time name match and can miss injections from sibling modifier chains. Predicate filters evaluate at roll time against the actual pool contents, so they're robust to ordering.
- Blank enchanted book stripping (line ~84) had already established the predicate pattern and proven it works — should have reached for that pattern from the start.
- Design lesson: if the pool we want in villages is a small curated set, **whitelist at the village, don't blacklist at the source**. "Strip everything but these 12 items" is simpler and more robust than "try to exclude villages from the 15-item broadcast."

---

## 2026-04-20 — Manual tier arrays disagreed with the mod's own tier config on 20+ glyphs

**Symptom:** Tester running `/loot give village_plains_house` 30 times saw "T2 glyphs" appearing in Overworld village loot, despite a per-table strip targeting `glyphT2.concat(glyphT3, glyphT4)` on every village table. Strip appeared to work for some glyphs but not others.

**Dead ends:**
- Audited the strip code for persistent-filter bugs, event-thread issues, registration timing
- Rewrote the per-table strip pattern twice
- Doubted that `removeLoot` was firing on the village modifier chain
- Never verified that our `glyphT1` / `glyphT2` arrays matched what Ars Nouveau actually considers T1/T2

**Actual root cause:** Ars Nouveau has its own per-glyph `glyph_tier` config field (in `config/ars_nouveau/glyph_X.toml`). Our manually curated arrays disagreed with that authoritative config on 20+ glyphs. Specifically, `glyphT1` — the list we INJECT into Overworld chests — contained multiple AN-T2 glyphs (`heal`, `smelt`, `conjure_water`, `extend_time`, `duration_down`, `grow`). Those were legitimately getting injected in Overworld because they were on our "T1 is fine for Overworld" list. The village strip was correctly removing OUR glyphT2 array, but "T2 from the mod's perspective" ≠ "T2 from our array's perspective."

The user described the symptom crisply: "the glyphs themselves are marked by tiers outside our tiering system."

**What fixed it:** Parsed `config/ars_nouveau/glyph_*.toml` for the `glyph_tier = N` field on every glyph, rebuilt all 4 tier arrays from the mod's authoritative config. 35 / 28 / 14 glyphs for T1/T2/T3 (AN has no T4; our End/Abyss dims now pull from AN T3).

**Takeaway:**
- **When a mod defines its own tier/classification system, use it as the source of truth.** Don't create a parallel manual classification unless you're explicitly overriding the mod's intent — and if you are, write a test that verifies the overrides stay in sync.
- This was the *same shape* as the Origins NBT bug from the same day: a path/mapping that looked reasonable and was wrong, silently producing off-expected behavior for months. In both cases, **the mod jar / config had the authoritative answer**; our code carried stale conventions.
- When a strip list and an add list both exist for the same concept, sanity check: every item in the ADD list should match the same classification that the strip list uses. Mine did not.

---

## 2026-04-20 — Every origin-keyed script queried a NBT path that didn't exist

**Symptom:** Starter kit never fires. Class passives never trigger. Every `origin_effects` / `phantom_undeath` / `battlemage_mana_shield` check silently returns false for every player, every time. Symptoms reported across multiple sessions:
- "Archmage starter kit didn't come through" — seven sessions in a row
- Passive attack-damage modifier never applied
- Race-specific race powers never activated

**Dead ends:**
- Rewrote the chat command handlers three times to defer to server-tick
- Added polling windows with 3-minute detection cycles
- Debated worker-thread vs main-thread command execution
- Fought `EventExit: result` exceptions at length
- Never once ran `/data get entity @s cardinal_components."origins:origin"` to confirm the path existed

**Actual root cause:** The codebase has ~9 server scripts that query Origins data via `execute if entity <player>[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:X"}]}}}]`. This path is from the original **Fabric** Origins mod (apace100), which uses **Cardinal Components** as its data storage system. This pack uses **Origins-Forge (edwinmindcraft's fork, 1.10.0.9)**, which is a complete rewrite on top of **Forge Capabilities**, not Cardinal Components. Data is stored under:

```
ForgeCaps."origins:origins".Origins[].layer   (string, e.g. "origins:class")
ForgeCaps."origins:origins".Origins[].origin  (string, e.g. "icraft:archmage")
```

Notice also: `OriginLayers` → `Origins`, `Origin` → `origin` (lowercase). Every dimension of the path was wrong. The NBT selector returned zero matches for every player and every class, which `execute if entity` reports as return value 0, which the scripts interpret as "player doesn't have this class" → silently skip. Nobody noticed for months.

Confirmation via tester running the query directly: `Found no elements matching cardinal_components`.

**What fixed it:** Fetched the Origins jar from Modrinth (`origins-forge-1.20.1-1.10.0.9-all.jar`), disassembled `OriginsEventHandler.attachCapabilities` and `OriginContainer.serializeNBT`, read the capability identifier from the constant pool (`origins:origins`) and the serialization key (`Origins` list of `{layer, origin, choseOneAutomatically}`). Mass-rewrote the NBT pattern across all 9 affected scripts via a single `str.replace`.

**Takeaway:**
- **When a convention-based path keeps returning no data for every case, stop debugging downstream. Confirm the path exists.** A single `/data get entity @s <path>` from the tester would have collapsed months of ambiguity. The day I finally asked for it, the answer came back in 30 seconds.
- **Don't trust path conventions inherited from similar mods.** Origins-Forge looks like Origins-Fabric at the user level, but its storage is completely different. A pattern copied from one mod to another can be wrong in every character and still parse without error.
- **When multiple scripts share a query pattern, a wrong pattern fails everywhere at once and hides itself.** Nobody flagged the class passive, the starter kit, or the race power failing — because each one only affects one player's one feature, and testers mention whichever symptom hit them today, not the overall pattern.
- **Disassemble the dependency when in doubt.** `javap -v` on the relevant class took two minutes and found the answer. The jar is authoritative; documentation, comments, and analogs from other mods are not.

---

## 2026-04-20 — `const` redeclaration in one KubeJS script crashes the load of another

**Symptom:** Tester: starter pack still doesn't come through, `!codex` / `!magicstart` commands do nothing, village loot changes still aren't landing. Three days of escalating fixes had each sounded plausible but none actually landed for the user. Today's fresh log finally showed the real issue.

**Dead ends:**
- Day 1: added script; no fire. Assumed NBT query wrong.
- Day 2: added logging + login hook + poll; still no fire. Assumed class cache timing.
- Day 3: piggybacked onto codex_delivery (proven working); still no fire. Assumed origin-picker delay.
- Each day I edited *more* code thinking the root cause was subtler; the actual root cause was a **parse-time crash I introduced on Day 3** that killed the sibling script outright.

**Actual root cause:** The Day 3 piggyback commit added `const MAGIC_CLASSES` and `const MAGIC_STARTER_KITS` to `codex_delivery.js`. The same names were already declared `const` in `origins/magic_class_starter.js`. KubeJS/Rhino evaluates all `server_scripts/` files in a **single shared global scope**. The second file to parse (alphabetically after `codex_*`) hit `TypeError: redeclaration of const MAGIC_CLASSES` at *parse time* — the whole file failed to load. That killed its `PlayerEvents.chat` registration for `!magicstart` and its polling tick. The one-shot check I added to codex_delivery fired once at T+18s, found the class not yet picked, and never retried.

Evidence in the log:
```
[main/ERROR] [KubeJS Server/]: TypeError: TypeError: redeclaration of const MAGIC_CLASSES.
```
Immediately followed by `magic_class_starter.js` being absent from the `Loaded script server_scripts:origins/...` list.

**What fixed it:** `magic_class_starter.js` now reads `MAGIC_CLASSES`, `MAGIC_STARTER_KITS`, `MAGIC_FLAG_PREFIX` from the shared global scope (set by `codex_delivery.js`) rather than redeclaring them. Also converted the one-shot check to a 3-minute polling window so origin-picker delays no longer matter.

**Takeaway:**
- **KubeJS server_scripts share one global scope.** A `const` at top level of one file is visible to every other file — and a same-name `const` in another file is a parse error that aborts that file's load. This is not JavaScript module isolation; it's a single script context.
- When "a script I just modified doesn't seem to run," check the log for `TypeError: redeclaration of const` or `SyntaxError` lines BEFORE assuming timing/NBT/API issues. A parse error in KubeJS server_scripts is a silent killer — the rest of the modpack keeps running fine, just the one file is dead.
- For constants shared between two related scripts: declare them in *one* file only, read via `typeof X !== 'undefined' ? X : fallback` pattern from the other. Or better: consolidate the related logic into one file and delete the other.
- Three rounds of "add more features to fix it" when a single earlier check of the error log would have found the cause. After each failed fix, *grep the log for ERROR before editing code again*.

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

## 2026-04-26 — Tetra schematic identifier rejected `:` in path

**Symptom:** Server start crashed during `RegisterEvent` dispatch for `iridescent_modular_spells`:
```
net.minecraft.ResourceLocationException: Non [a-z0-9/._-] character in path of location: tetra:repair/iridescent_modular_spells:iss_book
    at se.mickelus.tetra.module.SchematicRegistry.registerSchematic
    at ModularSpellBookItem.<init>:130
```
Cascading registry failures in Moonlight + Supplementaries downstream of our crash.

**Dead ends:**
- Suspected duplicate `registerSchematic` calls (5 ISS items shared the same `TETRA_IDENTIFIER`). Decompiled `SchematicRegistry.registerSchematic` — it's a `Map.put`, duplicates overwrite silently. Not the cause.
- Suspected mod load order — Tetra's `instance` field not initialized when our `<init>` ran. Tetra is `ordering=AFTER` in our mods.toml dep so it loads first. Not the cause.
- Suspected access-transformer issues. Build had succeeded cleanly, no AT mismatches.

**Actual root cause:** Tetra's `registerSchematic` constructs `new ResourceLocation("tetra", "repair/" + identifier)`. Our identifier was `iridescent_modular_spells:iss_book`. The `:` character is **legal** in a ResourceLocation but only as the namespace/path separator — it is **not legal inside the path**. Our identifier became part of the path, so the `:` triggered `ResourceLocationException`.

**What fixed it:** Renamed `TETRA_IDENTIFIER` from `iridescent_modular_spells:iss_book` → `iridescent_iss_book` (and `:ars_book` → `iridescent_ars_book`). Underscore separator only. Hotfix in commit `7083c3a2`.

**Takeaway:**
- **Tetra item identifiers must obey `[a-z0-9/._-]`** because they get composed into a ResourceLocation path. No colons, no namespace prefix.
- General rule: when an API takes a "string identifier" and uses it to build a ResourceLocation, treat it as a *path* string, not a fully-qualified resource location. Apply path-character validation up front.

---

## 2026-04-27 — JEI item-dump saga: KubeJS class filter, em-dashes in PowerShell, cmd→PS quoting, and a server held open in the background

**Symptom:** A simple "dump every registered item to a TSV for offline audit" task became a 3-hour cascade of unrelated failures. By the end, every layer of the bat / KubeJS / PowerShell stack had been touched.

**The original goal:** runtime dump of `Item.REGISTRY` to `kubejs/exports/all_items.tsv` so the JEI item audit could be done offline against authoritative data (static jar excavation overcounted because Beautiful Enchanted Books ships speculative texture files for ~140 enchant variants from uninstalled mods).

**The cascade — eight unrelated bugs hit in sequence:**

1. **KubeJS class filter blocks `java.io.*` and `java.nio.file.*`.** The first three iterations of `dump_items.js` tried `Files.write`, then `Files.writeString`, then `FileWriter` directly. All blocked with `InternalError: Failed to load Java class 'java.io.FileWriter': Class is not allowed by class filter!` — KubeJS sandbox prevents scripts from opening arbitrary file handles. **Workaround:** dump to `console.log()` with a `[ITEM_DUMP]` prefix, extract from `kubejs-server.log` post-hoc. Server-log writing is unrestricted because Forge/Log4j owns that handle, not KubeJS.

2. **`Select-String -SimpleMatch '\[ITEM_DUMP\] '`** — first version of `extract_item_dump.ps1`. With `-SimpleMatch`, the pattern is treated as literal characters; `\[` and `\]` were searching for literal backslash-bracket pairs. Log lines didn't have backslashes → 0 matches → empty output. Fix: drop the regex-escape backslashes when `-SimpleMatch` is in play.

3. **Em-dash (`—`, U+2014) inside a double-quoted PowerShell string.** PowerShell on Windows reads scripts as Windows-1252 by default (no BOM = system codepage). UTF-8's 3-byte sequence for em-dash (`E2 80 94`) gets decoded as 3 separate Latin-1 chars. The third byte (`0x94`) is "right double quotation mark" in Win-1252 — PowerShell's parser sees it as an unmatched closing quote, throws `The string is missing the terminator: "` with a wildly misleading line number (cascaded into a fake `Missing closing '}' in statement block` 50 lines earlier). **Hours of dead-end debugging on the wrong line.** Fix: strip every em-dash from every `.ps1`. Em-dashes in `#` comments are harmless; em-dashes in strings are landmines. Going forward, **all `.ps1` files in this repo must be ASCII-only**, or have a UTF-8 BOM.

4. **Cmd → PowerShell trailing-backslash quoting.** `start "" /B powershell -File "%~dp0X.ps1" -ServerDir "%~dp0"` passes `%~dp0` quoted. `%~dp0` always ends in `\`. So the arg becomes `"C:\path\"` — and PowerShell's argv parser treats `\"` as an escaped quote, breaking the string and merging it with the next arg. The Phase 5 extract was running with garbled `$ServerDir`, looking at the wrong location, finding nothing, exiting silently. **Fix pattern:** before passing `%~dp0` to PowerShell, strip the trailing backslash:
   ```cmd
   set "SDIR=%~dp0"
   if "%SDIR:~-1%"=="\" set "SDIR=%SDIR:~0,-1%"
   powershell -File "%SDIR%\X.ps1" -ServerDir "%SDIR%"
   ```
   Phase 0.5 already had this (introduced for an earlier bug); subsequent phases didn't, and copy-pasted the trailing-backslash form. Now uses `%SDIR%` everywhere.

5. **Nested `setlocal enabledelayedexpansion` + `endlocal` inside a cmd `if (...)` block.** Cmd's parser has a known issue where the script can exit silently — no error, no output, just an empty cmd window. Symptom matched user's "fails silently after [DUMP] echo". **Avoid:** never put `setlocal/endlocal` inside an `if (...)` block. Use `goto :label` patterns or rely on a higher-scope `setlocal` instead.

6. **Inline cmd PowerShell with `^`-line-continuation and `\""` escaped quotes** silently dropped 3 of 9 entries from a hardcoded array literal. The `customJars` allowlist in `iridescentserver.bat` was an inline `powershell -Command "..."` block. Six entries survived, three didn't (`ars_nouveau-1.20.1-4.12.7-all.jar`, `iridescent_biomes-1.0.0.jar`, `iridescent_modular_spells-0.2.0.jar`). Cause was almost certainly cmd's `\""`-escape interaction with the `[''""]` regex character class earlier in the script fragmenting the args, but full diagnosis was abandoned in favor of **moving the whole block to a standalone `.ps1` file** (`cleanup_stale_jars.ps1`). PowerShell parses its own files cleanly without cmd quote-escape interference. **Heuristic:** any inline cmd-PowerShell longer than ~10 lines should be a `.ps1` file.

7. **Cleanup script deleting our own custom jars** (consequence of #6) caused a downstream **server crash** that masqueraded as an unrelated bug for hours. Forge's mod scan recorded the deleted jars from cached metadata; Connector tried to open them; `UncheckedIOException: Invalid paths argument`. Originally diagnosed as a Modrinth download flake on `BetterAdvancements-NeoForge-...jar` and "fixed" by setting `side = 'client'`. The actual cause was the cleanup deleting the file repeatedly. The `side='client'` fix was still correct (BetterAdvancements is a client UI mod), just not the root cause for that crash.

8. **Phantom `java.exe` from a prior failed run** held the bytecode-patched `ars_nouveau-...jar` open with restricted sharing. `Copy-Item -Force` from `phase0_sync.ps1`'s full-zip restore got `Access denied`. Misdiagnosed as Windows Defender; user reported real-time protection was off; turned out a server console was running silently in the background from an earlier crash that didn't fully cleanup. **Fix:** `taskkill /F /IM java.exe` plus checking Resource Monitor → Associated Handles to find what holds a locked file. Both surfaced the phantom process instantly. **Also added retry-on-lock to `phase0_sync.ps1`'s Copy-Item** so transient AV scans don't kill a whole sync, with a `[HINT]` line nudging Defender exclusion as the long-term fix.

**Final architecture (post-saga):**
- `kubejs/server_scripts/dump_items.js` — runs on `ServerEvents.loaded`, iterates `BuiltInRegistries.ITEM`, prints each item to console with `[ITEM_DUMP]` prefix. Idempotent via `dumpRan` JS flag + `kubejs/exports/all_items.tsv` existence check.
- `server_distribution/extract_item_dump.ps1` — searches `<server>/kubejs-server.log` and `<server>/logs/kubejs-server.log` for `[ITEM_DUMP]` lines, writes clean TSV to `kubejs/exports/all_items.tsv`. Two modes: `-Watch` (Get-Content -Wait, exits on completion marker) and one-shot.
- `server_distribution/cleanup_stale_jars.ps1` — owns the customJars allowlist; deleted in favor of inline cmd-PowerShell (issue #6).
- `iridescentserver.bat` Phase 5 — runs `extract_item_dump.ps1` post-server-stop. Phase 3.5 (background watcher during server runtime) was attempted, then backed out because `start /B powershell ...` was failing the bat at that line on this Windows host for reasons that couldn't be pinned down through 4 quoting fixes.

**Takeaways — all encoded as memory or repo conventions:**
- KubeJS scripts cannot write files via `java.io` / `java.nio.file`. Use `console.log` + post-hoc extraction. (Memory: should be added to feedback.)
- Every `.ps1` shipped in this repo must be ASCII-only. Em-dash in a string = silent script death. (Memory: feedback_powershell_ascii.)
- Cmd → PowerShell: never pass `%~dp0` quoted. Strip the trailing backslash via `set "X=%~dp0"` + `if "%X:~-1%"=="\" set "X=%X:~0,-1%"` first, then quote the cleaned variable.
- No `setlocal enabledelayedexpansion` + `endlocal` inside cmd `if (...)` blocks. Use `goto :label` instead.
- Inline cmd-PowerShell > 10 lines → extract to `.ps1` file. Cmd's quote-escape gymnastics are too fragile for long scripts.
- When a Windows file lock appears with no obvious AV cause, check for phantom processes via `tasklist | findstr /i "java powershell"` and Resource Monitor's "Associated Handles" search.
- Forge/Connector raises `UncheckedIOException: Invalid paths argument` when a jar referenced from cached metadata is missing on disk. Multiple causes: cleanup over-deletion, AV quarantine, manual deletion. Don't assume the most recent change is the cause — check whether the file is actually on disk first.
- `kubejs-server.log` lives in either `<server>/` or `<server>/logs/` depending on Forge/KubeJS version. Search both.

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
