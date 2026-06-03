#!/usr/bin/env python3
"""
gen_boss_materials.py  --  IridescentCraft docket #58 (refight-to-repair).

Generates the boss-only Tetra material datapack JSONs (Piece A) from the
single verified drop table below, plus their material-name lang keys.

Each boss mints exactly one Tetra material whose `material.items` craft-input
is the boss's *verified native signature drop* (jar-decompiled 2026-06-03), so
Tetra's Repair tab reads the same item -> repair == refight the boss.

Writes:
  - <repo>/.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/
      materials/<category>/<key>.json                    (one per material)
  - merges material-name keys into
    <repo>/.minecraft/kubejs/assets/tetra/lang/en_us.json

Categories are restricted to metal/gem ON PURPOSE: gen_per_material_variants.py
auto-scans metal/gem/skin and gen_repair_definitions.py auto-loads metal/gem,
so metal/gem boss materials flow through the armor/book variant + repair
generators with ZERO hand-authoring (bone/fibre would NOT auto-flow).

Stat bands per tier come from boss-tetra-and-structure-loot-scope.md sec.2
(durability deliberately LOW -- that is the lever that forces refight-to-repair).
Attributes use ** (MULTIPLY_TOTAL) per the hard rule; single-* silently zeroes.
T3/T4 require a diamond hammer to forge (hammer ladder verified reachable
2026-06-02 diamond-bridge). T1/T2 omit requiredTools (base hammer forges).

Run (Windows or WSL):  python tools/gen_boss_materials.py
Then: gen_per_material_variants.py -> (zip datapack to Paxi) -> wsl-build.sh.
"""
import json, os
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent.parent
MAT_DIR = REPO_ROOT / ".minecraft" / "datapack_sources" / "icraft_tetra_materials" / "data" / "tetra" / "materials"
LANG_FILE = REPO_ROOT / ".minecraft" / "kubejs" / "assets" / "tetra" / "lang" / "en_us.json"

# Per-tier stat block. primary/secondary/tertiary/durability/integrity/magicCap/
# toolLevel/toolEff + the 3 ** attribute magnitudes (lead spell_power /
# magic_resist / generic spell_power). Durability held at the LOW end.
TIER = {
    1: dict(primary=5.5, secondary=3.2, tertiary=3.2, durability=360, intCost=2,
            intGain=6,  magicCap=120, toolLevel="minecraft:iron",      toolEff=6,
            hammer=None,              a_lead=0.10, a_resist=0.06, a_spell=0.08),
    2: dict(primary=6.6, secondary=3.4, tertiary=3.6, durability=540, intCost=2,
            intGain=7,  magicCap=145, toolLevel="minecraft:iron",      toolEff=7,
            hammer=None,              a_lead=0.12, a_resist=0.07, a_spell=0.09),
    3: dict(primary=8.3, secondary=3.6, tertiary=3.8, durability=920, intCost=3,
            intGain=10, magicCap=200, toolLevel="minecraft:netherite", toolEff=9,
            hammer="minecraft:diamond", a_lead=0.12, a_resist=0.08, a_spell=0.10),
    4: dict(primary=9.0, secondary=3.4, tertiary=4.5, durability=1320, intCost=4,
            intGain=11, magicCap=220, toolLevel="minecraft:netherite", toolEff=10,
            hammer="minecraft:diamond", a_lead=0.15, a_resist=0.10, a_spell=0.12),
}

# key, cat, tier, school, tint, repair_item, name, prefix, flag
# flag: "" clean | "A" only drop is trophy/weapon (consume; re-drops on refight) |
#       "floor" needs a LootJS guaranteed-drop floor | "S" shared/identity-loose |
#       "M" drop was code-driven / not in a data table (LootJS-injected)
M = [
    # ---- T1 -- Overworld named bosses (Terramity / Mowzie's) ------------------
    ("bm_gob",        "metal", 1, "holy",     "d4af37", "terramity:gobs_gilded_hat_helmet", "Gilded Gnome Brass", "Gilded",     "A,floor", "Gob: only boss-unique drops are 1-of-3 gear; LootJS floor guarantees the gilded hat."),
    ("bm_frostmaw",   "gem",   1, "ice",      "7ad6e8", "mowziesmobs:ice_crystal",          "Frostmaw Crystal",   "Glacial",    "",        "Frostmaw: native ice_crystal (boss carried)."),
    ("bm_wroughtnaut","metal", 1, "eldritch", "8a8a8a", "mowziesmobs:wrought_helmet",       "Thousand-Metal Iron","Wrought",    "A",       "Ferrous Wroughtnaut: guaranteed wrought_helmet (the only drops are helm+axe)."),
    ("bm_umvuthi",    "metal", 1, "holy",     "ffd966", "mowziesmobs:sol_visage",           "Solar Visage Gold",  "Solar",      "A",       "Umvuthi: guaranteed sol_visage mask (sole material-ish drop)."),
    ("bm_sculptor",   "gem",   1, "nature",   "9c7a4d", "mowziesmobs:sculptor_staff",       "Geomancy Stone",     "Geomancer",  "A,floor", "Tongbi/Sculptor: 1-of-5 gear; LootJS floor guarantees the staff."),
    ("bm_mnaga",      "gem",   1, "nature",   "6b8e23", "mowziesmobs:naga_fang",            "Mowzie Venom Fang",  "Venom",      "floor",   "Mowzie's Naga: naga_fang 0-1; floor for reliability. Key distinct from tf_naga."),
    ("bm_sniffer",    "gem",   1, "nature",   "7cb342", "terramity:gaianite_cluster",       "Gaian Cluster",      "Gaian",      "",        "Super Sniffer: guaranteed gaianite_cluster 2-3 (cleaner than the 1-of-3 pelt)."),
    # bm_merlin INTENTIONALLY OMITTED -- Enchanter Merlin is code-driven with no
    # confirmed drop (proposed wizard_staff does not exist in the jar). FLAGGED.

    # ---- T2 -- First-dimensional (Twilight / Aether / Blue Skies) -------------
    ("tf_lich",          "gem",   2, "ender",     "9b59b6", "twilightforest:lich_trophy",       "Necrotwilight",       "Lich",       "A",       "Lich: no clean material; guaranteed lich_trophy is the boss-unique binding."),
    ("tf_hydra",         "metal", 2, "fire",      "c1440e", "twilightforest:fiery_blood",       "Hydra Ember",         "Ember",      "",        "Hydra: guaranteed fiery_blood 7-10 (proposed hydra_fang does not exist)."),
    ("tf_urghast",       "gem",   2, "fire",      "e8743b", "twilightforest:fiery_tears",       "Ghast Tearfire",      "Tearfire",   "",        "Ur-Ghast: guaranteed fiery_tears (proposed ur_ghast_tear does not exist)."),
    ("tf_knightphantom", "metal", 2, "lightning", "b0c4de", "twilightforest:knightmetal_ring",  "Spectral Knightmetal","Spectral",   "M,floor", "Knight Phantom: empty (code-driven) table; floor the knightmetal_ring."),
    ("tf_snowqueen",     "gem",   2, "ice",       "a0e7f0", "twilightforest:snow_queen_trophy", "Aurora Ice",          "Aurora",     "A",       "Snow Queen: no clean material; guaranteed snow_queen_trophy."),
    ("tf_minoshroom",    "metal", 2, "nature",    "8c6e3f", "twilightforest:minoshroom_trophy", "Labyrinth Bronze",    "Labyrinth",  "A",       "Minoshroom: drops are food/axe/trophy; bind guaranteed minoshroom_trophy."),
    ("ae_slider",        "metal", 2, "eldritch",  "a97142", "aether:carved_stone",              "Bronze Slider",       "Slider",     "",        "Slider: guaranteed carved_stone 7-9 (key is needed for the dungeon)."),
    ("ae_valkyrie",      "metal", 2, "holy",      "c0c0c0", "aether:victory_medal",             "Valkyrie Silver",     "Valkyrie",   "S,floor", "Valkyrie Queen: only drops a key+sword; floor victory_medal (also from lesser valkyries)."),
    ("ae_sunspirit",     "metal", 2, "holy",      "ffcf40", "aether:sun_altar",                 "Solar Aether",        "Sunspirit",  "A",       "Sun Spirit: only key+altar; bind guaranteed sun_altar."),
    ("bs_summoner",      "gem",   2, "ender",     "7e57c2", "blue_skies:soul_fragment",         "Everbright Soul",     "Soulbright", "",        "Summoner: soul_fragment via loot-bag (data-driven)."),
    ("bs_alchemist",     "metal", 2, "nature",    "6aa84f", "blue_skies:ventium_ingot",         "Everdawn Ventium",    "Ventium",    "",        "Alchemist: ventium_ingot via loot-bag."),
    ("bs_starlit",       "metal", 2, "ender",     "5c6bc0", "blue_skies:falsite_ingot",         "Starlit Falsite",     "Starlit",    "",        "Starlit Crusher: falsite_ingot via loot-bag bonus pool."),
    ("bs_arachnarch",    "gem",   2, "nature",    "9e9d24", "blue_skies:spider_webbing",        "Silkfang",            "Silkfang",   "",        "Arachnarch: spider_webbing via loot-bag."),

    # ---- T3 -- Nether / Undergarden / Deeper Darker / Cardinal Sins -----------
    ("cm_monstrosity",        "metal", 3, "fire",       "e25822", "cataclysm:lava_power_cell",       "Monstrous Netherite", "Monstrous",   "",        "Netherite Monstrosity: bulk lava_power_cell 16-24 (horn/forge are single trophies)."),
    ("cm_leviathan",          "metal", 3, "ice",        "1b6ca8", "cataclysm:abyssal_egg",           "Abyssal Steel",       "Abyssal",     "A",       "The Leviathan: guaranteed abyssal_egg (also baby-summon -- same tradeoff as the gauntlet)."),
    ("cm_scylla",             "gem",   3, "ice",        "a8d8e8", "cataclysm:lacrima",               "Frost Lacrima",       "Lacrima",     "",        "Scylla: bulk lacrima 8-16."),
    ("iss_deadking",          "metal", 3, "blood",      "6b0f1a", "irons_spellbooks:blood_staff",    "Bloodbone Darkin",    "Bloodbone",   "A,floor", "Dead King: blood_staff @50% -> floor (arcane_essence is shared/generic)."),
    ("iss_tyros",             "gem",   3, "fire",       "ff6320", "irons_spellbooks:cinder_essence", "Flamebearer Cinder",  "Flamebearer", "",        "Echo of Tyros: guaranteed cinder_essence."),
    ("iss_citadel",           "metal", 3, "fire",       "b5651d", "irons_spellbooks:keeper_flamberge","Citadel Steel",      "Citadel",     "A,floor", "Ancient Knight: keeper_flamberge @40% -> floor (cinder_essence shared w/ Tyros)."),
    ("iss_archevoker",        "gem",   3, "evocation",  "7b3fbf", "irons_spellbooks:arcane_essence", "Arcane Evoker",       "Evoker",      "S",       "Archevoker: arcane_essence (generic ISS but unique among our set)."),
    ("iss_magehunter",        "metal", 3, "eldritch",   "4b3b5a", "irons_spellbooks:magehunter",     "Magehunter Alloy",    "Magehunter",  "A,M,floor","Magehunter: code-driven; the magehunter weapon (existing @30% drop) -> floor."),
    ("ug_forgotten_guardian", "metal", 3, "ender",      "5a7d7c", "undergarden:forgotten_nugget",    "Forgotten Metal",     "Forgotten",   "",        "Forgotten Guardian: bulk forgotten_nugget 4-16 (guardian-exclusive; distinct from undergarden_forgotten_metal)."),
    ("dd_stalker",            "gem",   3, "ender",      "2e8b8b", "deeperdarker:soul_crystal",       "Sculk Soul",          "Sculk",       "",        "Stalker: guaranteed soul_crystal (avoids dd_warden/dd_resonarium items)."),
    ("tm_gatmancer",          "gem",   3, "eldritch",   "3d3d5c", "terramity:occult_fabric",         "Dungeon Occult",      "Occult",      "",        "Gatmancer: guaranteed occult_fabric bulk."),
    ("cs_pride",              "gem",   3, "holy",       "ffd700", "cardinal_sins:essenceofpride",    "Pride Essence",       "Pride",       "",        "Sin of Pride: native essenceofpride 100% bulk."),
    ("cs_wrath",              "gem",   3, "fire",       "c1121c", "cardinal_sins:essenceofwrath",    "Wrath Essence",       "Wrath",       "",        "Sin of Wrath: native essenceofwrath 100% bulk."),
    ("cs_greed",              "gem",   3, "eldritch",   "e0b000", "cardinal_sins:essenceofgreed",    "Greed Essence",       "Greed",       "",        "Sin of Greed: native essenceofgreed 100% bulk."),
    ("cs_envy",               "gem",   3, "nature",     "2e8b57", "cardinal_sins:essenceofenvy",     "Envy Essence",        "Envy",        "",        "Sin of Envy: native essenceofenvy 100% bulk."),
    ("cs_lust",               "gem",   3, "blood",      "d6336c", "cardinal_sins:essenceoflust",     "Lust Essence",        "Lust",        "",        "Sin of Lust: native essenceoflust 100% bulk."),
    ("cs_gluttony",           "gem",   3, "ice",        "8ab0c4", "cardinal_sins:essenceofgluttony", "Gluttony Essence",    "Gluttony",    "",        "Sin of Gluttony: native essenceofgluttony 100% bulk."),
    ("cs_sloth",              "gem",   3, "ender",      "6a5acd", "cardinal_sins:essenceofsloth",    "Sloth Essence",       "Sloth",       "",        "Sin of Sloth: native essenceofsloth 100% bulk."),
    ("cs_drakara",            "metal", 3, "fire",       "8b0000", "cardinal_sins:dragongreatsword",  "Draconic Sin",        "Drakara",     "A",       "Drakara: only drop is the Dragon Blade (guaranteed x1). No mint needed -- consume re-drops."),

    # ---- T4 -- Endgame (Cataclysm / Botania / Deep Aether / Terramity / End) --
    ("cm_ancient_metal", "metal", 4, "eldritch",  "c2a878", "cataclysm:ancient_metal_ingot",     "Ancient Desert Metal", "Ancient",   "floor",   "Ancient Remnant: native drops ancient_metal_BLOCK; floor a few ingots (witherite pattern)."),
    ("bo_gaia",          "gem",   4, "holy",      "7fffd4", "botania:life_essence",              "Gaia Spirit",          "Gaia",      "",        "Guardian of Gaia: guaranteed life_essence 6 (NOT gaia_ingot, which is crafted)."),
    ("da_eots",          "metal", 4, "lightning", "5dade2", "deep_aether:squall_plate",          "Storm Sky",            "Storm",     "M,floor", "Eye of the Storm: squall_plate not in a loot table -> LootJS floor (stratus_ingot already taken)."),
    ("tm_virtue",        "gem",   4, "holy",      "fff4c2", "terramity:angel_feather",           "Archangel Light",      "Archangel", "",        "Virtue: guaranteed angel_feather 7-10 (cleaner than the 1/10 halo)."),
    ("tm_circe",         "gem",   4, "ender",     "5d3a9b", "terramity:malediction_bracelets",   "Malediction",          "Circe",     "M,S,floor","Sorceress Circe: code-driven; malediction_bracelets (also a Gundalf drop) -> floor on Circe. FLAGGED."),
    ("tm_thunker",       "gem",   4, "lightning", "ffd24d", "terramity:chthonic_crystal",        "Chthonic Crystal",     "Chthonic",  "",        "Thunker: guaranteed chthonic_crystal 1-2 (thunker-exclusive)."),
    ("vn_dragon",        "gem",   4, "ender",     "b15dff", "minecraft:dragon_breath",           "Ender Dragon",         "Dragon",    "",        "Ender Dragon: dragon_breath is refightable (egg is one-per-world, disqualified)."),
    ("vn_warden",        "metal", 4, "ender",     "1b9e8f", "minecraft:echo_shard",              "Sculk Echo",           "Echo",      "S,floor", "Warden: drops only sculk_catalyst natively; floor echo_shard on warden kill."),
]


def build_material(key, cat, tier, school, tint, item, comment):
    t = TIER[tier]
    modid = item.split(":", 1)[0]
    mat = {
        "_comment": f"icraft #58 boss-only Tetra material (refight-to-repair, T{tier}). "
                    f"REPAIR ITEM = {item}. {comment}",
        "key": key,
        "category": cat,
        "primary": t["primary"],
        "secondary": t["secondary"],
        "tertiary": t["tertiary"],
        "durability": t["durability"],
        "integrityCost": t["intCost"],
        "integrityGain": t["intGain"],
        "magicCapacity": t["magicCap"],
        "toolLevel": t["toolLevel"],
        "toolEfficiency": t["toolEff"],
        "tints": {"glyph": tint, "texture": tint},
        "textures": ["shiny", "heavy", "metal"] if cat == "metal" else ["shiny", "metal"],
        "material": {"items": [item]},
    }
    if t["hammer"] is not None:
        mat["requiredTools"] = {"hammer_dig": t["hammer"]}
    if modid != "minecraft":
        mat["conditions"] = [{"type": "forge:mod_loaded", "modid": modid}]
    mat["attributes"] = {
        f"**irons_spellbooks:{school}_spell_power": t["a_lead"],
        f"**irons_spellbooks:{school}_magic_resist": t["a_resist"],
        "**irons_spellbooks:spell_power": t["a_spell"],
    }
    return mat


def main():
    written = {"metal": 0, "gem": 0}
    lang_new = {}
    for key, cat, tier, school, tint, item, name, prefix, flag, comment in M:
        mat = build_material(key, cat, tier, school, tint, item, comment)
        out_dir = MAT_DIR / cat
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_dir / f"{key}.json", "w", encoding="utf-8") as f:
            json.dump(mat, f, indent=2, ensure_ascii=False)
            f.write("\n")
        written[cat] += 1
        lang_new[f"tetra.material.{key}.name"] = name
        lang_new[f"tetra.material.{key}.prefix"] = prefix

    # Merge material-name lang (preserve existing keys + ordering, append new).
    with open(LANG_FILE, encoding="utf-8") as f:
        lang = json.load(f)
    added = 0
    for k, v in lang_new.items():
        if k not in lang:
            lang[k] = v
            added += 1
    with open(LANG_FILE, "w", encoding="utf-8") as f:
        json.dump(lang, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"gen_boss_materials: wrote {written['metal']} metal + {written['gem']} gem = "
          f"{written['metal'] + written['gem']} material JSONs")
    print(f"gen_boss_materials: +{added} lang keys (total {len(lang)})")
    flagged = [m[0] for m in M if m[8]]
    print(f"gen_boss_materials: {len(flagged)} carry a build flag (LootJS floor / consume): {flagged}")


if __name__ == "__main__":
    main()
