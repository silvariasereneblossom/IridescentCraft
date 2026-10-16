# Design Changelog

A high-level, dated summary of the **major** design changes in IridescentCraft, newest first. This is the player-facing overview — one headline per change, no implementation detail. The blow-by-blow development history (root causes, script-level notes) is kept in the project's private developer log.

For where systems stand today, see the [Master Design Document](master.md) and the [Home page status table](../home.md).

---

## October 2026 — The Cardinal Sins arenas generate again

- **The Cardinal Sins have arenas again.** Since the end of May no Cardinal Sins arena generated anywhere: the mod builds its arenas only in the Overworld, and the pack had moved them to the Undergarden and the Nether, so the shrine chain could not start. Now the seven sins and Drakara have their arenas in the Abyss, and Lucifer's arena is in the Nether. The Boss Compass finds every one of them. They stay Tier 3 bosses, and Lucifer stays the Tier 3 capstone.
- **The shrine chain.** Every shrine takes the previous sin's Soul Orb and works once: Sloth → Gluttony → Lust → Greed → Envy → Wrath → Pride → Lucifer's Atrocity Shrine. Sloth's Malevolichite Shrine takes a Soulweaver Orb (8 Malevolichite around an Eye of Ender; the ore sits in the floating pillars of the Overworld's Forgotten Forest). Every other orb is an Eye of Ender and the Essence the previous sin drops, at a smithing table with no template.
- **The Boss Compass points to the right Terramity places.** Enchanter Merlin and Sorceress Circe are summoned together with Occult Fabric at the Offering Pedestal of the Nether's Chthonic Cathedral, Archmage Gundalf appears when Circe falls, and Gatmancers live in the Chthonic Dungeon. The compass pointed at the Fairy Fountain, the Mausoleum, the Trial Spire and the Infested Laboratory, where none of them is found.

## October 2026 — Aether follow-ups

- **Neptune armour converts like zanite armour.** At the Tetra workbench it becomes iron modular armour; it keeps its look, its armour bonus and its full-set bonus (water breathing and dolphin's grace). The old conversion multiplied spell power by about two per piece, so a full set multiplied it by eighteen. The Neptune Tetra material is gone.
- **Converted Forbidden Arcanus armour can be repaired.** Mortem pieces with cloth, tyr pieces with golden dragon scales, draco arcanus pieces with dragon scales (the repair items named before did not exist).
- **The Sun Spirit drops legendary ink like the Eye of the Storm:** 30% for one (it was 50% for one or two).
- **The Sunfeather Charm is worth 500 relic essence**, the Tier 4 value (was 250).
- **Frostmaw has 1,500 health wherever it stands**, like the other Tier 2 named bosses (designed 500 with the x3, off the dimension curve); per-kill scaling still applies.
- **Quests.** The Frostmaw hunt moved to the Exploration chapter, next to the Tier 2 dimension bosses; the Tier 2 boss-rush quest lists Frostmaw (any 4 of 6); reaching Tier 2 gives 4 Everbright pyrope gems and *Frontiers I* gives 6 Everdawn moonstone shards, in place of the zanite and ambrosium they gave when the Aether was Tier 2.

## October 2026 — The rest of the week (10 to 16 October)

The other October entries cover the week's big changes. This one gathers everything else a player meets.

**Features that never worked now do.** Much of the pack's own content had never run on the server. Since this week:
- Custom enchantments, Apotheosis affix effects, the Abyss rings and armour sets, the unique weapons' tier bonus (+10% at Tier 1 up to +40% at Tier 4), the plain-bow effects of Too Many Bows' themed bows, and the Deathskin bonus against undead all apply.
- All forty aptitude skills read your real aptitude levels.
- The bonfires, the Boss Compass, the Relic Broker's window, the class altar and the class starter kits work.
- The Codex works: submitting materials, counting the tokens you hold, the Tier 4 token-to-experience exchange, crediting boss kills above Tier 1, and the relic sink. A submission takes only what is in your main inventory (hotbar included), never armour you wear or the item in your off hand.
- Vorpal and Arcane Vorpal beheadings happen (on a crit of the pack's own crit roll) and kill through armour; MekaSuit Mk2 pieces get their bonus armour; the modular Ars spell book's covers and spine change something.
- Lovely Pieces' Enchant Eye, fishing line, quivers and Newbie Umbrella work, and so does the Compass of Return.
- Mutant Monsters drop ten times their experience.
- Some things survive death now: the Relic Broker's daily limit no longer resets, a full Tetra armour set keeps its bonus after respawning, and your progress toward the next level is kept on death and on leaving the End.

**Bosses.**
- Twenty-two named bosses the pack's boss rules had missed (Lucifer, Frostmaw, Gob, Virtue and Sorceress Circe among them) follow them now: the boss health bonus applies once instead of twice (about a third of their old health), and they can no longer be beheaded or executed.
- A boss keeps its health bonus when the server restarts or its chunk reloads; until now a boss waiting in its arena lost it.
- The Magehunter Vindicator of the Evoker Fort is a real boss: 500 health, no beheading. Its Boss Compass row leads to the Evoker Fort (it pointed at the Mountain Tower), and no structure gets two bonfires.
- The Amethyst Crab and MCA's Grim Reaper are minibosses: tokens on every kill, no beheading.
- The first phases of the Sins of Envy, Pride and Wrath are bosses (about 1,050 to 1,125 health at the Nether's starting difficulty instead of 1,750 to 1,875) and grow per kill like Lucifer's.
- **A boss with a designed health or the boss bonus has the same health in every dimension**: the dimension difficulty curve no longer multiplies it again. The Warden, for one, has 1,500 everywhere (it had 2,250 in the Overworld and 4,500 in the Nether at their starting difficulty). Minibosses without a designed health still grow with the curve.
- With two or more players online, every boss keeps fighting when no player is near it (until now only the Wither was meant to, and it was not).

**Progression and dimensions.**
- The boss rush can be completed: its lists named bosses that do not exist, so no tier could be reached that way. And a tier is now bought only with the tier below held, by tokens or by the boss rush.
- Tier gates survive a `/reload`, and the recipes they guard are locked by tier. The netherite ingot, the eye of ender, the Digital Miner, the Hephaestus Forge and the reforging and augmenting tables could be crafted by anyone; the rocket workbench and the Dragon Summoning Crystal (the only way to start the Ender Dragon fight) by no one. The End Crystal recipe is back.
- The Ad Astra planets and orbits, Iron's Spellbooks' pocket dimension and the Reality Marble are Tier 4 dimensions. Each planet and orbit has its own Tier 4 gate (a rocket handed to a Tier 3 player goes nowhere), their mobs follow the Tier 4 difficulty curve (they were on the Tier 1 curve), a death there costs 22% to 30% durability, and affixes and gems found there roll Epic to Ancient. The *Pocket Dimension* spell is refused before Tier 4. The Abyss's pocket dimension counts as Tier 2.
- The Otherside and the Abyss count as Tier 3 for the Samurai's and the Archmage's tier passives.
- Invader bosses can now appear in Everbright, Everdawn, the Undergarden, the Otherside, the Abyss and its Frost World, the Aether and the five planets. Most of these were on the spawn list with no bosses to send; the Frost World and the planets were not on it at all.

**Loot.**
- The Wither drops the Dormant Relic on your first kill (15% after that) and 2 Runic Tablets on every kill. The tablets go into the two relic crafts only: every runic weapon and fused-gem recipe is removed.
- No more diamonds before Tier 3 from the Aquaculture treasure chest (an emerald now), Aether whirlwinds, or Tetra geodes (an emerald, and a pristine emerald instead of a pristine diamond). The Dungeons Arise diamond strip applies in the Overworld only.
- The Lich, the Ur-Ghast, the Netherite Monstrosity, the Harbinger, the Wither and the Gaia Guardian drop their reforging token 60% of the time.
- The Abyss's rings drop from its bosses: Nightblade the Shadows and Phantom rings (15% each), The Roka the Embers ring (15%), the Ice Knight the Frost ring (15%), the Elder the Void Sight ring (10%).
- Terramity's Tier 3 gear (the Reverium sword and axe, the malediction and electron bracelets) and its "Tier 2" tomes left Overworld chests for its two Nether dungeons.
- The Rift Shard and Mythic Catalyst counters count each item once.

**Smaller changes.**
- Material Save and Craft Bonus roll on a real craft only (they handed out free materials and copies of items on every inventory change).
- The Wind Essence Wand gives +5% speed, as its tooltip says (it gave +50%).
- Ars Nouveau's own max mana and mana regeneration say "(no effect here)": Ars spells draw from the Iron's Spellbooks mana pool.
- Eighteen unused items are gone (the transmuted materials, three alloys, the rift gem and the old token fragments): nothing made or used them.
- The *Level Up* onboarding quest completes at any aptitude level 2.
- A cancelled hit triggers no on-hit effect, and the plain-bow effects and the Deathskin bonus apply to the hit itself, not to the splash damage it causes.
- The pack's diopside Tetra material is made from the diopside gem (it named an item that does not exist).
- Mowzie's Geomancer set counts as robes for armour weight; the Soul Butterfly's tooltip says one butterfly per use; the Codex's text is a warm sepia, with italic page titles.

## October 2026 — Virtue's altar is the Prismatic Pond

- **The Prismatic Pond generates in the Aether.** Terramity's crystal pond was moved to the Deep Aether forests of the Aether in May, but it was placed below the Aether's floor and never generated. It now sits on the surface of the Deep Aether islands, never over the void, and the Boss Compass finds it. Only newly generated land has it; the server had generated no Aether land yet.
- **Virtue is summoned only at the pond.** Throw an Unholy Lance (the Dead King's drop) into the pond's prism solution: Virtue rises about ten seconds later. In the Overworld, where Terramity summoned Virtue anywhere under open sky, the lance now calls nothing and falls back to you, with a message saying where the altar is. A lance that misses the pond in the Aether falls back to you the same way; in other dimensions it shatters after a second of flight, as before.

## October 2026 — Aether gear for Tier 4

- **The Aether's Tetra materials are Tier 4 materials.** The Aether is a Tier 4 dimension, where netherite is the floor and only Aethersteel sits above it. The Slider's, the Valkyrie Queen's and the Sun Spirit's boss materials (carved stone, victory medal, sun altar) now sit in the Tier 4 boss band, just under the Eye of the Storm's squall plate, and need a diamond hammer to forge. Zanite, gravitite, valkyrie, phoenix and skyjade are netherite-grade in Tetra and keep their own perks (skyjade stays brittle and still takes no enchantments).
- **A stratus ingot makes one Tetra material.** Two materials both claimed the ingot; the pack's own Stratus (the one with modular armour) keeps it.
- **Neptune and obsidian armour at the Tetra workbench.** Neptune's material now names its real item, the neptune mesh. Aether obsidian armour converts into netherite modular armour, which matches its own numbers.
- **The Silver and Gold dungeon reward chests pay Tier 4 loot.** The Silver chest holds a stratus ingot and the Gold chest two, every time; the plain iron and golden swords and the chainmail are gone from them. The Aether's own gear, Deep Aether's extras and the upgrade templates are unchanged.

## October 2026 — The Aether becomes Tier 4; Frostmaw moves to Everbright

- **The Aether is a Tier 4 dimension.** It opens at Tier 4 instead of Tier 2 (Deep Aether's biomes are part of it; Deep Aether has no dimension of its own). Its mobs follow the Tier 4 difficulty curve, 600% rising to 1000% over 200 hours as in The End (it was 200% to 350% over 100 hours), and its own creatures (blue and golden swets, whirlwinds and evil whirlwinds, the aechor plant, cockatrices, zephyrs, Deep Aether's baby zephyrs and venomites) now grow with the curve too. A death there costs 22% durability (was 15%). Affixes and gems found there roll Rare to Ancient (was Uncommon to Epic), and Apotheosis invader bosses appear 8% of the time (was 4%). Its chests follow The End's Tier 4 loot rules, and its arrival bonus and first-kill boss tokens are The End's (Tier 3 tokens).
- **The tiers' dimensions.** Tier 2 is now the Twilight Forest and Blue Skies' Everbright and Everdawn. Tier 4 is The End, the Aether and the Ad Astra planets and orbits.
- **The Aether's dungeon bosses are Tier 4 bosses.** The Slider (Bronze Dungeon) has 3,000 health, the Valkyrie Queen (Silver Dungeon) and the Sun Spirit (Gold Dungeon) 3,600 each (they had 1,200, 1,650 and 1,500), and they have left the Tier 2 boss rush. Their drops are at Tier 4 values: the Slider drops the Advanced Reforging Token (60%) instead of the basic one, epic ink instead of uncommon and a lightning upgrade orb instead of the lightning rune; the Sun Spirit drops legendary ink instead of rare and fire and holy upgrade orbs instead of the runes; all three drop 1-2 Rift Shards and a Void Fragment, and the Slider's Artifact Piece Pouch follows the Tier 4 rule (2 pouches and a small chance at an awakening artifact). Virtue (Terramity) has a designed health of 1,500 (4,500 in game) and is left out of the difficulty curve.
- **Their unique weapons stay with them and are Tier 4 uniques now** (a x1.40 tier bonus instead of x1.20): Thunderbrand and the Scatter Bow from the Slider, Caelestis, the Wind Bow and Radiance from the Valkyrie Queen, Sunfire and Aether's Call from the Sun Spirit. Caelestis and Sunfire now have 13 base damage, as Thunderbrand does, and their effects are stronger: Thunder Blitz and Righteous Standard deal 5 damage (was 3), Righteous Standard heals with a 1.6 scaling (was 1.3), and Astral Shift triggers 8% of the time (was 5%). The Sunfeather Charm stays on the Sun Spirit, now a Tier 4 relic.
- **Three unique swords that dropped from nothing are Tier 2 drops:** Mjolnir from the Minoshroom, Storm's Edge from the Bellringer and Slumbering Lichblade from the Mutant Enderman (15% each).
- **Frostmaw lives in Everbright.** It is a Tier 2 boss now, found in Everbright's frozen biomes (the frostbitten forest and its clearing, snow-covered pines, polar highland, slushlands), on the Tier 2 boss rush and with a Boss Compass arena there. It no longer generates in new Overworld chunks; chunks already generated keep theirs. The Frostmaw Heart is a Tier 2 relic (worth 250 essence to the relic sink, was 150) and Frostmaw Crystal joins the Tier 2 band of Tetra materials.
- **Boss rush targets.** Tier 1 → 2 needs 8 of 10 bosses (was 9 of 11) and Tier 2 → 3 needs 17 of 18 (was 18 of 20); Tier 3 → 4 is unchanged (all 43).
- **Tier 2 chests hold tokens more often.** Every chest in a Tier 2 dimension now has a 50% chance (was 45%) of 2-4 Tier 2 tokens.
- **Quests follow.** *Frontiers I* asks for the Twilight Forest, Everbright and Everdawn (no Aether); the Tier 2 boss-rush quest no longer lists the Slider; the Tier 1 rush and first-boss quests no longer list Frostmaw; the Frostmaw quest is a Tier 2 hunt in Everbright; *Frontiers IV* and the End Compass capstone now ask you to reach the Aether (they asked for a "Deep Aether" dimension that never existed).
- **Two claims in the documentation corrected.** The End is reached with Eyes of Ender, staged at Tier 4: the End Compass (to be crafted from the Aether's materials and to point to an End Bastion) is planned, not in the game. And there are no Deep Aether "Celestial Events". The Aether's real hazards are these: its mobs get Speed I (its flyers Strength I as well); thin air above Y 180 brings Weakness unless your armor has Aether Acclimation; sprinting above Y 200 sometimes brings vertigo (nausea); and when you fall below Y 0, an updraft gives you Slow Falling once.

## October 2026 — Bosses remember who beat them; sunlight burns the undead; the Codex ladder is strict

- **Bosses get stronger for the players who have beaten them.** The first time a boss trades a hit with a player, it takes the highest kill count of that boss among the players within 64 blocks: your 2nd fight is +15% health, +10% damage and +3% speed, rising to +150% / +80% / +15% from the 15th fight. Everyone within 64 blocks when it dies counts the kill, and `/icraft bosskills` shows your own counts. Everyone starts at zero. The Wither, the Ender Dragon, the Warden and the Elder Guardian are not scaled.
- **Sunlight burns hostile undead faster (Sunlight Smite).** By day, a hostile undead mob under open sky near a player in the Overworld burns about four times faster than before (a zombie lasts about 15 seconds instead of a minute). Bosses, your own summons and pets, and wild zombie and skeleton horses are spared; a roof keeps any mob safe.
- **A Codex tier is bought only with the tier below.** Tokens of a higher tier no longer buy their tier for a player who has not reached the one below it; `/icraft codex balance` says which tier comes first.

## October 2026 — The Wither keeps its designed health; the Ultimate Wither returns as a challenge

- **The Wither has 1,800 health everywhere.** The difficulty curve that makes ordinary monsters tougher dimension by dimension was meant to leave the Wither alone, but it named a Wither the game never spawns. From the next server restart the Wither has its designed 1,800 health wherever it is summoned; it had 2,550 at the Overworld's starting difficulty, and the curve would have taken it past 15,000 in The End.
- **The Ultimate Wither is an optional Tier 4 challenge.** Of Progressive Bosses' three stronger Withers only the strongest stays: Corrupted Soul Sand for it is crafted from soul sand or soul soil and 3 Nether Stars once you reach Tier 4, and the Wither built with it forms only in the Nether (anywhere else the build is refused and your blocks stay). It has 3,000 health and drops 5 Nether Stars, 2 Netherite Upgrade templates and 3,000 experience, with the Wither's usual spoils; the Capstones quest *Challenge: The Ultimate Wither* pays 3 Ignitium ingots and 25 levels. The armoured and summoner Withers stay out: their recipes are gone.
- **Withers share their loot when several players fight.** With two or more players near, a Wither drops a loot bag for each player instead of one set of drops, and its health grows with the number of players. Each bag holds a plain Wither's spoils, Nether Stars included (until now a bag would have held no star); fought by a group, the Ultimate Wither drops these bags too.
- **Far-off Withers keep fighting on a busy server.** With two or more players online the server pauses creatures far from every player; the Wither was meant to be exempt but was not. It now is.
- **A Wither cannot be built near the spawn village.** Monsters are kept out of a 96-block circle around the world spawn, and a Wither built inside it used to vanish together with its soul sand and skulls. Now the last skull is simply not placed: the blocks stay, the skull stays in your hand, and a message tells you to build further out. A Wither built outside the circle works as before.
- **The quest *Brutal Bosses: Claim a Dungeon* is removed.** It could never be completed: its targets were not creatures the game knows. Nothing depended on it, and Brutal Bosses' champions still guard their dungeons.

## October 2026 — The End can be generated

- **The End generates.** Until now no chunk of The End could be generated. In an offline test of the full pack, asking for one crashed the server; the test server carries the same data, so the first player through an End portal would have met the same. Nobody had tried yet. Two switched-off ore entries in the pack's own data were one and the same feature for the game, and the game refuses to generate a dimension in which a feature has to come before itself.
- **What was tested.** In an offline test of the full pack the central island, the arrival platform, three places on the outer islands and an End City (with every chunk around it) generate, and the server keeps running.
- **The offline boot test now covers every dimension.** Each time it is run it generates a new chunk in each of the 26 dimensions and checks each dimension's generation order for this kind of conflict, so the next mod that brings one can be caught before it reaches the server.
- **Nothing else changes.** What generates in The End is what was designed; Enderium ore stays switched off. The Overworld and the other dimensions are not affected.

## October 2026 — Kill quests count kills, and three bosses follow their rules

- **Kill quests can be completed.** Twenty-one quests that ask you to kill something could never be completed, and three more were locked behind them. Twenty of them now count the kills they state: the three Boss-Rush gauntlets, *Giant Slayer*, *Bigger They Come*, *Veteran Hunter*, the four hunter quests (zombies, skeletons, spiders, creepers), *Frontiers II*, the Mowzie's Mobs, Mutant Monsters and Terramity quests of Overworld Foundations, *Foundations Laid* and *Capstone: Lucifer*. Kills made before this change were never recorded, so they are not credited: the kills have to be done again.
- **One quest is still broken:** *Brutal Bosses: Claim a Dungeon* cannot be completed yet. It is on the known-issues list.
- **Boss-Rush III counts the Wither.** Its Wither line named an entity the game never lets you fight.
- **The Wither is a boss for every pack rule.** The Wither you fight is Progressive Bosses' own version, and the pack's boss rules did not reach it. It now has its boss health (2,550 at the Overworld's starting difficulty), drops its pack loot (2 Nether Stars, 3-6 Wither Bones, 2 Runic Tablets, 3 Rift Shards, a Void Fragment, often an Advanced Reforging Token), gives the Dormant Relic on your first kill, and counts for the Codex and the boss rush.
- **The Ender Dragon has its designed 3,000 health.** It used to appear with 500 health out of a maximum of 7,500.
- **The Dragon's Eye is not lost when no player is in the dimension** as the dragon dies: it drops where the dragon died.
- **Minibosses follow the boss rules.** Twenty-one minibosses and Ars Nouveau's Wilden Chimera are no longer beheaded by Vorpal. Seventeen of the minibosses and the Chimera no longer get the ordinary-mob health bonus on top of their own (Gundalf 3,500 to 1,500, the Chimera 10,500 to 4,500 at the Overworld's starting difficulty). They still grow with the difficulty of where you meet them.

## October 2026 — Armor follows its designed curve

- **Armor now has the diminishing returns it was designed with in June.** That curve never took effect: a mistake in the setting made the game fall back to the armor mod's default. From the next server restart armor blocks about 24% of a hit at 10 armor, 35% at 20, 51% at 50, 63% at 100 and 77% at 200, up to a cap of 95%.
- **Ordinary mobs hurt more.** Until now armor blocked most of a small hit (67% at 20 armor, 91% at 100) and much less of a big one. Now it blocks the same share of every hit, so a small hit gets through about twice as hard at 20 armor and four times as hard at 100.
- **The biggest boss hits are blocked a little better than before**, because the old default let large hits punch through armor. Mid-sized hits change little.
- **Your gear is unchanged.** Armor points from equipment, enchantments, classes and races are what they were; only how many points block how much has changed.

## October 2026 — The server launcher can carry a world refresh out

- **The launcher can now reset the parts of the world a refresh plan marks, and nothing else.** The plan is the map made earlier: beds, claims, the spawn area, used waystones and lived-in chunks are kept exactly as they are; the rest is taken out so Minecraft generates it again when somebody goes there. **Nothing has been regenerated on the test server**: this is the tool, not a run of it.
- **It only runs on the server operator's typed go-ahead**, with the server stopped, after working the plan out again from the world as it is. If the world changed since the plan was looked at, nothing happens and the difference is shown.
- **It takes a checked backup first and keeps everything it removes.** A run that is undone before the server starts again gives the world back exactly as it was. It is refused outright if a player last logged out in an area that would be reset.
- **World backups now carry the server's own files too** (who may join, the server's own settings), so a lost server can be rebuilt from a backup alone.

## October 2026 — The Abyss's bosses carry the Abyssal artifacts

- **Twelve Abyss-themed Celestial Artifacts now drop from the three Abyss bosses.** They were written for Abyss treasure chests, and The Abyss has none that roll loot. The Elder (20%) and The Roka (50%) drop one of Demon Curse, Twisted Scabbard, Catastrophe Scroll, Abyss Will Badge or Lock of Abyss. Nightblade always drops one of Abyss Core, Demon Heart, Twisted Heart, Twisted Scroll, Heart of Revenge, Chaotic Etching or Nihility Etching. Each of the three can also drop an enchanted book (10%, levels 20–30). The rates are provisional and may be tuned.
- **Where to find them.** The Elder roams Blue Mountain and The Roka Blue Jungle. Nightblade is summoned at a Night Altar: light its eight upper pillars with Soul Hearts (Soul Guards drop them only to a Looting weapon), then use an Eye of Abyss on the altar.
- **Nothing was taken away.** The artifacts keep their chest sources in the other dimensions.

## October 2026 — The test server has a whitelist

- **Only listed players can join the test server.** To be added, send the server operator your exact in-game name, capitals included. If you see *"You are not white-listed on this server!"*, your name is not on the list yet or was entered with different capitals. Nothing changes for players who are already listed: characters, claims and quests are untouched.

## October 2026 — Loot check: empty chests filled, luck skills pay out properly

- **Chests that were always empty now hold loot.** A handful of structures pointed some of their chests at loot that did not exist: the underground floors of the sandstone Battle Tower (48 chests), and a few chests in abandoned houses, pillager fortresses, the labyrinth, bandit towers and three village workshops. They now roll the loot their structure was meant to give. Chests you have already opened stay as they are.
- **Themed treasure reaches the places it was written for.** The chest at the top of a Structory tower, the Twilight Forest Lich Tower and the Undergarden catacombs now carry their themed artifact pool and enchanted book, and the Overworld villages added by Repurposed Structures follow the same village loot rules as every other village.
- **The Dragon's Eye goes straight to whoever kills the Ender Dragon** instead of dropping where the dragon dies (often over the void). If the final blow has no owner — a bed or an End Crystal — the nearest player in the End receives it.
- **Treasure Sense, Motherlode and Fortune's Favor are true extra rolls.** A Treasure Sense proc is a real second kill (Looting counts, player-only drops included); Motherlode and Fortune's Favor are real extra breaks with the tool in your hand (Fortune and Silk Touch count). Blocks that hold items, such as shulker boxes, never trigger them.
- **The Infested Laboratory no longer hands out Tier 3 progression tokens** — it stands in the Overworld.
- **Avocado trees give something again.** Their leaves dropped nothing at all. They now drop saplings, the odd avocado and sticks, and shears or Silk Touch collect the leaves themselves.
- **Two more drops that never happened.** Bookshelves in the Citadel can hold its lore tomes, and a placed Exotic Roll Medley gives itself back when broken untouched (a bowl once it has been eaten from).
- **Three mobs have their drops back.** The Abyss's End Spider drops an Icora Nugget and its Slime Spider slime balls (both only when killed with a Looting weapon, like the Abyss's other spiders), and the boss of the Mercury arena drops raw iron, magma cream and blaze rods.

## October 2026 — Server owners can tune world generation from the launcher

- **The server launcher's Customizer tab has a Worldgen settings page.** Biome layout, terrain shape and ore generation (TerraBlender, Biomes O' Plenty, Tectonic, Mekanism, Large Ore Deposits, Thermal, Create and more) are listed setting by setting, each with the mod's own description and allowed range, instead of being spread over dozens of config files.
- **A server's changes are its own and survive pack updates.** They are kept apart from the pack's files and put back before every server start. Any setting can be returned to the pack's value with one click. Nothing changes for players or for other servers unless a server's owner changes something.
- **New terrain only.** These settings shape chunks as they are generated; land that already exists stays as it is until it is regenerated.
- **Ordinary ore veins included.** Iron, copper, ancient debris, zinc and the Thermal ores (tin, lead, silver, nickel) can be tuned there as well: veins per chunk and the height band of each.

## October 2026 — Mapping what a world refresh would keep

- **The server launcher can now work out which parts of the world are "somebody's".** Before any terrain is ever regenerated (for example to bring in new world generation), the launcher maps what must be kept: every player's bed chunk and the chunks around it, chunks claimed in Open Parties and Claims, the area around world spawn, waystones a player has activated or placed, and chunks players have spent real time in. The launcher window has a new **Customizer** tab for it: the rules are set on screen and the result is shown as totals, warnings and a map, with anything questionable flagged, such as a lived-in chunk that no rule protects.
- **This step changes nothing.** It only reads the world, and it can run while the server is up. Actually regenerating chunks is a separate, later step that will only run from an approved plan, after a fresh backup.

## October 2026 — The server backs its world up again

- **World backups are back, twice a day.** The dedicated server's backup mod (FastBack) quietly never worked there — it needs a tool the server machine doesn't have — so the world had gone without backups since April. The server launcher now takes them itself: every 12 hours, during a restart it was already making, it zips the whole world, checks the zip by reading it back, and keeps the newest two. No extra restarts, and no backups while anyone could be mid-save.
- **A second copy now lives off the server.** The backups used to sit on the same disk as the world they protect. A separate computer now fetches the newest two every two hours and checks each copy against the launcher's checksum before keeping it, so losing the server's disk no longer means losing the backups too.
- **FastBack is removed** from the pack on both sides. It did nothing on the server and was never part of singleplayer saves unless you set it up yourself; your worlds are untouched.

## October 2026 — The Abyss now hits like a Tier 3 dimension

- **Abyss mobs were scaling like Overworld mobs — fixed.** A wrong dimension name in the difficulty settings meant The Abyss silently fell back to the Tier 1 curve. It now runs the intended Tier 3 curve (mobs start at 300% and ramp to 450%, instead of 150% → 300%), and its **Frost World** side-dimension joins it. Only newly spawned mobs are affected.
- **Deep Aether scales with the Aether.** Deep Aether is not a separate dimension (its biomes generate inside the Aether), so its ordinary mobs follow the Aether's Tier 2 curve. The difficulty tables used to list it under Tier 4, which never took effect; the documentation now matches the game. Its bosses and materials remain Tier 4 content.
- **Boss Compass now points properly to the two Deep Aether bosses** — Eye of the Storm and Virtue used to show a dimension name that does not exist instead of the direction arrow.

## August 2026 — One curated keybind layout for the whole pack

- **Every important function now has its own working default key.** With ~450 mods, dozens of actions shipped fighting over the same buttons (spell casting vs. armor abilities on V, backpack vs. toolbelt on B, class powers vs. curios vs. voice chat on G, quests vs. death history on U, jetpack vs. Terramity abilities on H, ...) and several gameplay abilities shipped with **no key at all** — including the secondary Origin power for Demi-God, Fallen Angel, Kirin, and Ryu, and the jetpack engine toggle. All resolved: one deconflicted layout, verified to have zero unintended key conflicts, ships as the pack default. See the new **[Controls](../systems/controls.md)** page for the full layout.
- **Delivered via the new Default Options mod** (client-side): fresh installs get the layout automatically, and for existing players the *Controls → Key Binds → **Reset Keys*** button now resets to the *pack* layout (not raw mod defaults) while keeping your graphics and sound settings untouched. Your own rebinds are never overwritten without you asking.
- **Your local settings now stay yours** — a leftover from early development meant the dev-instance sync could overwrite `options.txt` (keybinds + graphics) on launch; per the client-sync protocol it no longer touches player settings.
- The in-game Codex's keybind references render **live bindings**, so the book always matches your actual keys.

## June 2026 — Three new specialist mage classes: the Trinity casters

- **Elemental, Blessed, and Corrupted** join the class roster as magic *specialists* — the counterpart to the Archmage's generalist. Where the Archmage is decent at every school of magic, each Trinity mage is exceptional at **three** related schools and brings little to the rest (depth over breadth):
  - **Elemental (Stormcaller)** — fire, ice, lightning. The glass-cannon artillery mage: highest burst, lowest survivability.
  - **Blessed (Hierophant)** — holy, nature, evocation. The sustain/support crusader: hardier, the best healing, strong against undead and the Corrupted.
  - **Corrupted (Hollow)** — blood, ender, eldritch. The attrition drain-mage: sustains through lifesteal, resists the elements, vulnerable to holy.
- The three form a **rock-paper-scissors triangle** through their resistances (Blessed beats Corrupted beats Elemental beats Blessed), and each beats the Archmage *within* its three schools while falling behind across the other six. Each starts with a themed spell kit. *(First phase — their signature active abilities and the offensive side of the triangle arrive in a follow-up.)*

## June 2026 — Glass-cannon armor maluses now scale instead of wiping robe builds

- **T1 damage softener trimmed -30% -> -15%** — early Overworld is meant to be punishing for the low-HP mage origin stacks (glass cannons earn their late-game ceiling by being fragile early); the +30% damage bump now carries that intent, so the softener is reduced to a thin anti-one-shot margin rather than a comfort cushion.
- **Incoming damage raised +30% at every tier** — a new damage-only knob in the difficulty mod makes mobs hit 30% harder across all four tiers (and at every point on the time curve), while their health, armor, and speed are unchanged. Preemptive re-threat to match the class/race power that the progression fix above restored.
- **Class/race progressions actually apply now** — a command-syntax mismatch had silently disabled most attribute-based class and race bonuses since they were written (Witch of Ink defense ladder, Berserker Trance, Orc Bloodlust, Wanderer bonuses, Slimebodied DR, the whole Artificial Construct ladder, and the caster mana-regen/cooldown sync). All ported to a working mechanism; damage-side effects were never affected.
- **Workbench labels completed** — 407 missing translation entries filled; honing schematics now show themed names (Flow, Potency, Bulwark, ...) with tier numerals instead of raw IDs, and wand parts/material categories are properly labeled.
- **Carrot/potato harvest yield fixed** — right-click (hoe) harvesting consumed the crop's own replant cost out of a reduced drop pool, netting zero; drops re-tuned so every harvest method nets the designed yield.
- **166 dead workbench material choices now work** — newer materials (boss metals, Aether alloys, wools, fibres, hides) were selectable in reforged armor/wand/spellbook schematics but silently did nothing; all now have real stats (scaled from material grade) and repair recipes. Numbers are first-pass conservative — expect tuning.
- **Armor sets were only counting one piece — fixed** — a modifier-identity collision in the modular-armor pipeline meant every equipped reforged piece silently replaced the previous one's armor contribution, so a full set gave roughly one piece's worth (tooltips, which render per-item, always looked right). Each slot now counts separately; equipped armor matches your tooltip sum before percentages.
- **Class/race armor penalties converted from flat to percentage** — the Archmage's armor malus was a flat -4 armor / -2 toughness, authored when a typical kit carried ~20 vanilla armor (about -20%). Against today's Tetra robe builds (4-8 armor total) the same flat number erased the entire armor value — the "my robes read 0.5 armor" report. Archmage is now -20% armor & toughness, Ranger -15% armor, and the Elf race's frailty -10% toughness, all applied to your final armor so the penalty scales with what you actually wear and can never zero a build. Codex class pages updated to match.
- **Glass-cannon equipment-HP halving now actually halves** — a feedback loop in the penalty calculation meant Ranger/Archmage/Void Summoner equipment HP was only being reduced by about a third instead of the designed half, and the penalty could stick around after removing gear. Both fixed; Void Summoners are also now measured against their correct base HP.
- **New diagnostic: `/icraft armormods`** — any player can dump every live modifier on their armor and toughness (including ones items and powers apply invisibly) to help report armor oddities precisely.

## June 2026 — Loot-leak audit, dead-pack revival, and sync hardening

- **Stray loot fixed at the source** — three separate mechanisms were leaking high-tier items onto things that shouldn't carry them. Passive animals no longer drop boss-fragment cores, hostile-mob projectile/beam entities no longer get equipped with gear or scaled, and script-equipped mob gear no longer drops on death. The over-broad death-loot rule was replaced with a properly monster-gated handler.
- **Two dead datapacks revived** — the stone-tag fixer and the infinite-ham blocker were silently rejected for a packaging error (missing/misplaced pack manifest); both are now loading and doing their jobs again.
- **Affix and gem repairs** — several Apotheosis status-effect affixes had a malformed value shape and never loaded; two custom gems (Guardian, Intelligent) were fully disabled by a duplicate-slot conflict; the magic-weapon affix pool resolved to empty because a shadowing override dropped the relevant weapon types. All repaired.
- **Broken tag and ID cleanup** — a sweep of armor/entity/biome tags and a handful of loot/recipe scripts fixed dozens of references to renamed, mistyped, or uninstalled-mod items so they stop erroring at load.
- **Script error fixes** — the boss-bonfire tick error, several Create/Industrial-Foregoing recipe failures, and a non-existent loot id were corrected.
- **PacketFixer removed, then restored same-day** — it looked redundant alongside Connectivity, but its string-length patch turned out to be load-bearing (without it, large server payloads broke client logins with a vanilla 32k string cap). Back in the pack; the harmless overlap warnings with Connectivity return with it.
- **Ash blacklist** — common passive mobs are now excluded from a Supplementaries ash interaction via a tag override (the config flag for it was a dead toggle).
- **Stranded-item janitor** — a periodic cleanup sweeps up stray marker items left behind by the boss-wave randomizer.
- **Sync made fail-visible** — the launcher no longer launches silently stale on a failed update; an in-game warning surfaces if the pack didn't sync, and a new-machine setup guide documents the correct install layout.
- **Scorching (formerly Ignition) affix reworked** — it was accidentally granting the *target* fire resistance; it now marks struck enemies with a timed fire vulnerability that amplifies all fire damage they take, scaling with affix rarity.
- **MekaSuit Mk2 rebuilt** — the Mk2 is now a true in-place upgrade of the real MekaSuit: installed modules, stored energy, enchantments, and affixes all survive the craft, and the upgraded suit carries bonus base armor on top of the full module ecosystem. (The old version was a non-functional placeholder that destroyed installed modules — if you crafted one, ask an admin for a replacement.)
- **Mekanism rebalance (engineering stack, ERA 4)** — fusion now generates 1.5x and fission 1.25x energy per fuel, making big reactors the rewarding answer to the pack's 2.5x machine power costs. Radiation is disabled (it could semi-permanently ruin a base); an overdamaged fission reactor now force-shuts-down until it cools instead of melting down — still dangerous, always recoverable. Fusion, antimatter/SPS, the Digital Miner, and ultimate-tier facilities are now Tier 4; intermediate materials stay open. The 5x ore chain is untouched — it's the reward for reaching Tier 3 and building the infrastructure.
- **Antimatter is now worth making** — the top Mythic Forge catalysts (IV and V) each require an Antimatter Pellet, the MekaSuit Mk2 upgrade consumes one per piece, and pellets can be exchanged for Codex progression tokens. The SPS is the endgame power sink it was always meant to be.
- **Biofuel rework** — all crops now crush into roughly a quarter of the biofuel they used to. Meaningful ethylene power runs on automated farming, not a hoe and patience. (Bio-generator burn values and the ethylene chain itself are unchanged.)
- **Worldgen rebalance (lands with the world reset)** — the world gets flatter and friendlier: noticeably more plains, lush deserts and volcanic biomes retired (scrubland and wastes remain), mountains about a quarter lower and smoother overall, Cherry River Valley trimmed very slightly (still common). Towers of the Wild appear more often; Apotheosis tome towers slightly less often. The tome-tower loot fix note: the long-standing "chests under-fill" issue was traced to an already-removed book-stripping bug, and the arcane-essence + scroll additions have been live since they shipped — a fresh world shows it all working.
- **Tier-gating regression fixed (fresh-world impact)** — a legacy gating script re-enabled in early June quietly re-imposed whole-mod locks (Thermal, Ars Nouveau, Occultism, Forbidden & Arcanus) on top of the current per-item design. Veterans never noticed (already high-tier); fresh-world players hit it immediately — starter spellbooks and Thermal seeds were un-pickupable at Tier 1. The legacy script set is retired again; gating follows the curated per-item lists. (Server operators: requires the stale-file cleanup to take effect.)
- **Pigs no longer drop boss loot** — the long-running mystery (boss weapons, reforging tokens, waystone cores, and runes appearing on ordinary pigs) is root-caused and fixed: the entity registry silently substitutes a *pig* for any misspelled or wrong-mod boss id in the loot system, and eight such ids had accumulated. All are corrected or removed, and a boot-time validator now loudly flags any future unresolvable id instead of letting it leak. (The Gaia Guardian's drops were never affected — its unusual internal name is correct.)
- **XP collection fixed (was gamebreaking)** — since the Linear Experience mod shipped, XP and levels were actually accruing server-side but the client bar never updated (the mod's interception bypassed the only field the game watches to re-send XP to your screen). Picking up orbs now visibly fills the bar and levels again.
- **Spawn village is now a safe haven** — hostiles can no longer spawn within the spawn village, and any that wander in are silently removed (no drops, no XP — the zone can't be farmed). Raids effectively cannot execute inside the protected radius.
- **Waystone Cores re-specced** — now a consistent uncommon (20%) drop across all twelve bosses, instead of guaranteed-or-coinflip.
- **Meat drops doubled** — all base meat from the standard animals (pig, cow, mooshroom, chicken, sheep, rabbit, cod, salmon, hoglin) now drops at twice the base rate, raw and cooked, with Looting stacking on top — food and cooking are central to the pack and the economy now reflects it.
- **Last pig-loot straggler fixed** — one more misspelled mob id (an ant "queen" that's actually a caste, not an entity) was quietly feeding Nature Runes to pigs; re-homed to the real ant at a much lower rate.
- **Stone is mineable again (critical fix)** — a mod was overwriting the "breakable by pickaxe" block list and wiping plain stone out of it, leaving stone effectively unbreakable. The previous datapack patch for this had quietly stopped applying; the fix is now done at a layer that always wins regardless of mod load order, so it can't silently break again.
- **Cherry River Valley gets its rivers back** — the valley biome's climate claim was unintentionally swallowing the band where the game carves rivers, so the "river valley" generated riverless. The claim now splits around the river band (rivers flow through valleys again, same for mountain valleys), and the valley's range extends slightly coastward so more of them border lakes and seas. Applies to newly generated terrain — lands fully with the world reset.
- **Spellbook stat tooltips cleaned up** — modular spell books were showing their magic stats twice: once correctly as percentages and once as redundant raw decimals (e.g. +0.05). The redundant decimal lines are gone; stats now show only as clean percentages.
- **Spellbook page materials fixed** — applying Deathskin (and other animal-hide materials) to a spell book's pages did nothing; the pages slot was missing those material options. All four hide materials now apply correctly.
- **Three magic enchants now actually work** — Spell Echo, Mana Siphon, and Resonance were obtainable but did nothing. Now: Resonance extends your beneficial potion durations (+50% per level) while holding the book; Mana Siphon returns a slice of your spell damage as mana (capped so it can't be farmed); Spell Echo gives a per-cast chance for the spell to cost no mana, on a short cooldown. Their tooltips now describe the real effect.
- **Spellbooks removed from village chests** — copper and novice spellbooks were appearing in roughly one of eight village chests (several per village), which trivialized mage entry that the class starter kits already provide. Village chests still carry ink and source gems at unchanged rates; spellbooks now come from your class kit, exploration loot, and progression.
- **Priest tower in every village (and always at spawn)** — the Iron's Spells priest tower (inscription table, priest villager) was a roughly coin-flip find per village; its weight is now up across all village styles (~85%+ of villages, still max one each), and the starting village is *guaranteed* one: if the spawn village didn't roll a tower naturally, one is placed at the village edge on first load — existing worlds get this retroactively on next boot.
- **Lovely Pieces curation pass** — the accessory mod is now fully loot-driven: all crafting recipes removed, every item tier-scoped into exploration loot (T1 dungeon chests, T2 progression-dimension chests, T3 nether-tier dimensions + ancient cities/bastions, Gambler set pieces hunted across T3). The six legendary accessories are exclusive 10% drops on tier-matched bosses (two hosts each — the Blasphemous Contract comes from the Lich or the Sun Spirit, the Dragon Heart from the Hydra or the Eye of the Storm, and so on). Also cut in our fork: the FPS-scaled damage eye (non-deterministic, hardware-biased), the heartrate HUD, and the floating damage-number particles. All drop rates provisional.
- **Iridescent Lovely Pieces (new custom mod, fork intake)** — a charm-focused accessory mod joins the pack as a managed fork: ~60 new curios (15 boots, rings, amulets, quivers, gadgets, a dark "legendary" tier with real tradeoffs) plus the Gambler set with its chip-gambling crit system. Upstream's game-breaking bug (a damage attribute that silently multiplied all unarmed/melee player damage to zero) is fixed in our build, the legendary auto-grant is off, and the floating damage-number particles it ships are config-toggleable. Items are currently craftable; tier-gating and slot-row curation are the next pass. Because curios are now affixable, these accessories participate in the affix lane automatically.
- **Curios become affixable and socketable (curio affix lane)** — two new mods land together: *Apothic Curios* bridges Apotheosis onto curios (every curio slot — rings, necklaces, charms, belts, backs, bracelets, spellstones, spellbooks, and more — can now roll affixes and gem sockets), and *Caster Curios Bonus* adds 12 build-around caster accessories (cooldown-from-spell-power, mana overflow casting, lifesteal sharing, a temporary free-casting overdrive, and more) found in structure loot like ancient cities and bastions. A 14-affix curio pool ships with it (offense on rings/bracelets/hands, defense on necklaces/bodies/backs/heads, utility on charms/belts/feet, caster stats on spellbooks), and all 14 custom gems gained a curio bonus matching their school or martial identity. Curios found in chests can roll pre-affixed from Tier 1 — the system introduces itself early. All numbers provisional pending a feel pass.
- **Mage curios join the village pool** — six caster-oriented curios (mana, cooldown, and cast-time rings, a concentration amulet, a mana-regen amulet, and a spell-discount ring) now roll in village chests alongside the martial set. Total village curio supply is unchanged — the pool redistributes, with mage items now about a third of artifact rolls.
- **Engineering questline** — a new 14-quest Heracles line walks the whole engineering lane: Create ore-doubling at Tier 1, Thermal infrastructure at Tier 2, the Mekanism 5x chain at Tier 3, fusion and your first antimatter at Tier 4 — with Codex token rewards and a matching "Engineering Lane" Codex chapter. Also fixed: the MekaSuit Mk2 recipes referenced a nonexistent ingot id and were silently uncraftable.

## May 2026 — Modular gear, unified magic, and the bespoke difficulty engine

- **Iridescent Tetra Expansion** — the modular-armor (Iridescent Reforging) and modular-spell-book (Iridescent Modular Spells) systems were bundled into a single custom mod, with full honing progression for armor, wands, and spell books.
- **Modded metals as Tetra materials** — dozens of modded ores and special materials (Twilight Forest, Blue Skies, Undergarden, Forbidden & Arcanus, Abyss, Botania cloths, and more) were wired into the Tetra crafting system, with a consistent hammer-tier ladder.
- **Unified mana pool** — Ars Nouveau and Iron's Spells & Spellbooks now share one mana pool, with gem buffs and elemental Apotheosis gems feeding school-specific spell power.
- **Crit system unified** — all critical-hit sources were converted to a single additive number, with Vorpal reworked and a dedicated magic-weapon enchant set.
- **Bespoke difficulty engine** — a custom time-and-dimension-based scaling mod (`iridescent_difficulty`) replaced ScalingMobs, Improved Mobs, and Azukaar's Fair Difficulty.
- **Magic progression** — Dan's Magic and Simple Staves wands were integrated as a Tier 1–4 mage progression and folded into the modular wand system; drop-wand tiers added.
- **Origin progression rework** — capstone abilities and in-game status commands for progression origins (Witch of Ink, Artificial Construct).
- **Armor weight system + Battlemage rework** — explicit light/medium/heavy armor tagging with a toughness trade-off for light armor.
- **Loot rebalances** — per-structure themed loot pools for marquee structures, a village food/seed rebalance, a Celestial Artifacts re-audit, and several over-aggressive mod-loot strips.
- **Iridescent Aptitudes** — the JustLeveling fork expanded with a five-tier skill-node pass across all eight aptitudes.

## April 2026 — Custom mods, the Codex, and the loot overhaul

- **Iridescent Reforging** shipped — a Tetra-style modular-armor extension with per-archetype modules, set bonuses, skins, and a workbench-driven conversion path.
- **Iridescent Modular Spells** completed — modular spell books spanning Iron's Spells and Ars Nouveau, integrated with the Tetra workbench.
- **Iridescent Codex** shipped as a proper Forge content mod — the in-game guidebook documenting the progression and systems.
- **Inert-on-break** — a custom durability coremod so gear goes inert at near-zero durability instead of being destroyed.
- **Class Artifacts** (Epic RPG) integrated as a drops-only, tier-gated system.
- **Loot system overhaul** — tiered artifact rates, village chest sanitization, battle-tower loot, and finalized per-tier drop rates.
- **Mod roster changes** — the FTB suite was removed in favor of FastBack (backups), Open Parties and Claims (chunk claiming), and LiteMiner + Amber (veinmining); Champions Unofficial was removed for Majrusz's Progressive Difficulty; Tetra was rolled back to a stable version.
- **Origins expansion** — additional custom races and origins, a JustLeveling redesign, and the Heracles quest system.
- **Combat tuning** — early-game damage retuned so full-iron players aren't one-shot; Ars Nouveau glyphs added to tiered loot.
- **Worldgen** — river and water generation restored/tuned; custom cherry biomes brought online.

## March 2026 — Foundations: progression, dimensions, and systems

- **Token economy** — the four-lane Codex progression system (Engineering · Magic · Exploration · Combat) that gates tiers, dimensions, and recipes.
- **Dimension/location-based boss tiering** — bosses and their drops mapped onto the tier ladder by where they're found.
- **Three-prompt character creation** — Origin → Race → Class selection on first join, with rebalanced vanilla origins plus custom races and classes.
- **Ore re-homing** — endgame ores (Aethersteel and others) re-gated behind tier unlocks, appearing as plain stone until the player reaches the right tier.
- **Dimension integration & balance** — Blue Skies, The Undergarden, The Aether, and The Abyss received balance passes and bespoke dimension mechanics; the End was reworked into an "explore first, fight the dragon last" gate.
- **Tetra modded materials** — the first datapack pass adding modded metals to Tetra, with a diamond hammer tier.
- **Tech & farming balance** — a Mekanism balance overhaul (generator nerfs, higher RF costs, recipe gating), a food-system overhaul, and Farmer's Delight cooking conversions.
- **Combat systems** — the full Apotheosis affix set, functional skill-tree effects, and per-dimension elite-mob affix scaling.
- **Distribution** — the dedicated-server distribution and the client installer were built out.
- **Ad Astra** integration begun as post-Tier-4 space content (ongoing).

## Origins

The pack began from a master design document covering progression, classes, dimensions, loot, and combat. Implementation started in March 2026; the systems above were built out from that foundation.

---

## Related pages

- [Master Design Document](master.md) — current design intent
- [Master Design Appendix](master-appendix.md) — numerical reference (tiers, materials, boss drops)
- [Known Issues](../known-issues/tracker.md) — current bugs and recent fixes
