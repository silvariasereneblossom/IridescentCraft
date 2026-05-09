#!/usr/bin/env python3
"""
Adds thematic `attributes` blocks to icraft_tetra_materials material JSONs.
Mirrors the rotten_flesh / rotten_leather pattern (where the material file
declares spell-power / mana / etc bonuses that flow into every Tetra
variant using that material via wildcard or specific match).

Idempotent: re-running merges by attribute key, so existing entries are
preserved.
"""
import json
import os

MAT_BASE = "/root/IridescentCraft/.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials"

# (category, name) -> dict of attributes to merge into material.attributes.
# Multiplier prefix `**` matches the rotten_leather convention; without
# the prefix the attribute is additive in raw units.
THEMATIC = {
    # ── Botania mage trio ────────────────────────────────────────────────
    ("metal", "manasteel"):  {
        "**irons_spellbooks:mana_regen": 0.04,
        "**ars_nouveau:ars_nouveau.perk.mana_regen": 0.04,
    },
    ("metal", "elementium"): {
        "**irons_spellbooks:spell_power": 0.06,
        "**ars_nouveau:ars_nouveau.perk.spell_damage": 0.06,
    },
    ("metal", "terrasteel"): {
        "**irons_spellbooks:max_mana": 0.10,
        "**irons_spellbooks:mana_regen": 0.05,
    },

    # ── Twilight Forest ───────────────────────────────────────────────────
    ("metal", "fiery"): {
        "**irons_spellbooks:fire_spell_power":   0.12,
        "**irons_spellbooks:fire_magic_resist":  0.10,
    },
    ("metal", "steeleaf"):    {"**irons_spellbooks:nature_spell_power": 0.12},
    ("metal", "ironwood"):    {"**irons_spellbooks:nature_spell_power": 0.08},
    ("metal", "knightmetal"): {"**minecraft:generic.armor": 0.05},
    ("metal", "knight"):      {"**minecraft:generic.armor": 0.04},

    # ── Thermal triad ─────────────────────────────────────────────────────
    ("metal", "signalum"): {"**irons_spellbooks:lightning_spell_power": 0.10},
    ("metal", "lumium"):   {"**irons_spellbooks:holy_spell_power":      0.08},
    ("metal", "enderium"): {"**irons_spellbooks:ender_spell_power":     0.10},

    # ── Mekanism ──────────────────────────────────────────────────────────
    ("metal", "refined_obsidian"): {"minecraft:generic.knockback_resistance": 0.05},
    ("metal", "iridium"):          {"**minecraft:generic.armor": 0.10},
    ("metal", "osmium"):           {"**irons_spellbooks:mana_regen": 0.04},

    # ── Undergarden ───────────────────────────────────────────────────────
    ("metal", "undergarden_froststeel"):       {"**irons_spellbooks:ice_spell_power":  0.12},
    ("metal", "undergarden_cloggrum"):         {"**minecraft:generic.armor":           0.04},
    ("metal", "undergarden_forgotten_metal"):  {"**irons_spellbooks:ender_spell_power": 0.08},

    # ── Aethersteel (T4 endgame) ──────────────────────────────────────────
    ("metal", "aethersteel"): {
        "**irons_spellbooks:spell_power": 0.10,
        "**irons_spellbooks:max_mana":    0.10,
    },

    # ── Forbidden & Arcanus ───────────────────────────────────────────────
    ("metal", "deorum"):  {"**irons_spellbooks:holy_spell_power": 0.08},

    # ── Blue Skies ────────────────────────────────────────────────────────
    ("metal", "diopside"):    {"**irons_spellbooks:nature_spell_power": 0.06},
    ("metal", "charoite"):    {"**irons_spellbooks:ender_spell_power":  0.06},
    ("metal", "horizonite"):  {"**irons_spellbooks:holy_spell_power":   0.08},

    # ── Create ────────────────────────────────────────────────────────────
    ("metal", "brass"):  {"**irons_spellbooks:cooldown_reduction": 0.04},

    # ── Thermal industrial ────────────────────────────────────────────────
    ("metal", "steel"):  {"**minecraft:generic.armor": 0.04},

    # ── Terramity (gold/yellow glow) ──────────────────────────────────────
    ("metal", "dimlite"):  {
        "**irons_spellbooks:holy_spell_power": 0.05,
        "**irons_spellbooks:max_mana":         0.05,
    },

    # ── The Abyss (cavernous void) ────────────────────────────────────────
    ("metal", "phantom"):  {"**irons_spellbooks:ender_spell_power": 0.06},
    ("metal", "garnite"):  {"**irons_spellbooks:fire_spell_power":  0.06},
    ("metal", "unorithe"): {"**irons_spellbooks:spell_power":       0.05},

    # ── Gems (Terramity unless noted) ─────────────────────────────────────
    ("gem", "onyx"):     {"**irons_spellbooks:ender_spell_power":     0.12},
    ("gem", "ruby"):     {"**irons_spellbooks:fire_spell_power":      0.08},
    ("gem", "sapphire"): {"**irons_spellbooks:ice_spell_power":       0.08},
    ("gem", "topaz"):    {"**irons_spellbooks:lightning_spell_power": 0.08},
    ("gem", "undergarden_utherium"): {"**irons_spellbooks:blood_spell_power": 0.08},
}


def apply():
    updated, skipped = 0, 0
    for (cat, name), new_attrs in sorted(THEMATIC.items()):
        path = os.path.join(MAT_BASE, cat, f"{name}.json")
        if not os.path.exists(path):
            print(f"  MISSING: {cat}/{name}")
            skipped += 1
            continue
        with open(path) as f:
            data = json.load(f)
        attrs = data.get("attributes", {})
        before = dict(attrs)
        for k, v in new_attrs.items():
            attrs[k] = v
        if attrs == before:
            skipped += 1
            continue
        data["attributes"] = attrs
        with open(path, "w") as f:
            json.dump(data, f, indent=4)
            f.write("\n")
        updated += 1
        print(f"  {cat}/{name:30s} +{len(new_attrs)} attr(s)")
    print(f"\nUpdated {updated} files, {skipped} skipped/unchanged")


if __name__ == "__main__":
    apply()
