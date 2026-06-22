#!/usr/bin/env python3
"""
Generates per-material armor and book module variant entries for the
iridescent-tetra-expansion-mod. Run from repo root.

Reads:
  - .minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials/
    (modded metals + gems + skins; 33 materials)
  - tetra-1.20.1-6.12.0.jar bundled vanilla materials (iron/gold/diamond/
    netherite/leather) for reference only -- not modified.

Writes (in place):
  - iridescent-tetra-expansion-mod/src/main/resources/data/tetra/modules/
    {helmet,chestplate,leggings,boots}/{archetype}.json  (12 archetypes)
  - iridescent-tetra-expansion-mod/src/main/resources/data/tetra/modules/
    {iss_book,ars_book}/{spine,front_cover,back_cover}.json  (6 modules)
  - iridescent-tetra-expansion-mod/src/main/resources/assets/
    iridescent_reforging/lang/en_us.json (variant display name entries)

Formula:
  armor_mult  = primary / 5.0                        (iron baseline = 1.0x)
  magic_cap   = max(4, round(magicCapacity / 12))
  toughness   = +0.2 if netherite-tier, +0.1 if diamond-tier, else 0
  kb_resist   = +0.05 if netherite-tier, else 0
  spine cooldown_reduction = round(magicCapacity / 10000, 4)
  spine magic_cap          = max(2, round(magicCapacity / 30))
  front_cover spell_power  = round(magicCapacity / 20000, 4)  # smaller
  back_cover  max_mana     = round(magicCapacity / 20)        # 4-7 typical

Existing vanilla 6 entries (default-metal/leather/iron/gold/diamond/
netherite) preserved untouched in the metallic archetypes; existing wildcard
entries preserved in the book modules. New per-material entries appended.
"""
import json, sys
from pathlib import Path

# 2026-05-28: REPO_ROOT now auto-detects from this script's location so the
# generator runs on the Windows dev host too (was hardcoded /root/...).
# Script lives at <REPO>/iridescent-tetra-expansion-mod/tools/<this>.py so
# REPO_ROOT is 2 levels up.
_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent.parent
MAT_DIR = REPO_ROOT / ".minecraft" / "datapack_sources" / "icraft_tetra_materials" / "data" / "tetra" / "materials"
MOD_ROOT = REPO_ROOT / "iridescent-tetra-expansion-mod" / "src" / "main" / "resources"
MODULE_DIR = MOD_ROOT / "data" / "tetra" / "modules"
LANG_FILE = MOD_ROOT / "assets" / "iridescent_reforging" / "lang" / "en_us.json"

# Existing materials hardcoded in archetype JSONs -- skip these so we don't
# duplicate or overwrite the hand-tuned vanilla entries.
EXISTING_KEYS = {"", "leather", "iron", "gold", "diamond", "netherite"}

# Archetypes that accept metallic + gem materials (excludes mage robes)
METALLIC_ARCHETYPES = {
    "helmet":      ["basic_crown", "heavy_crown", "light_crown"],
    "chestplate":  ["breastplate", "cuirass", "scaled_chest"],
    "leggings":    ["full_leg_plate", "heavy_leg_plate", "light_leg_plate"],
    "boots":       ["basic_boot_sole", "heavy_boot_sole", "light_boot_sole"],
}

# Per-archetype base armor (looked up from the existing default-metal variant
# in each JSON; we extract this dynamically to avoid drift).
def load_base_armor(archetype_path):
    with open(archetype_path) as f:
        data = json.load(f)
    for v in data.get("variants", []):
        key = v.get("key", "")
        if key.endswith("/"):
            attrs = v.get("extract", {}).get("primaryAttributes", {})
            return {
                "armor": attrs.get("minecraft:generic.armor", 0),
                "kb_resist": attrs.get("minecraft:generic.knockback_resistance", 0),
                "extras": {k: v for k, v in attrs.items()
                           if k not in ("minecraft:generic.armor",
                                        "minecraft:generic.knockback_resistance",
                                        "minecraft:generic.armor_toughness")},
            }
    return None


def load_materials():
    """Modded materials from the icraft_tetra_materials datapack, keyed by
    (top-level category folder, material key). Each dict records `__ref__`: its
    FILE-PATH resource location, "tetra:<path-under-materials>/<filename>",
    carrying any per-material subfolder (e.g. fabric/wool/).

    CRITICAL: Tetra resolves a variant's `materials` ref by this FILE PATH, NOT
    by "tetra:<category>/<key>". A ref that matches no material file silently
    falls through to the default material (the 2026-06-18 wool no-op). Build the
    ref from the on-disk path the same way audit_modules.load_material_registry
    does; never reconstruct it from the category+key fields. See
    IridescentCraft-internal/dev/reference_tetra_internals.md sec.4.

    rglob (not flat listdir) so a material in a subfolder is found and its ref
    keeps the subfolder segment."""
    out = {}
    for cat in ("metal", "gem", "skin"):
        cat_dir = MAT_DIR / cat
        if not cat_dir.is_dir(): continue
        for path in sorted(cat_dir.rglob("*.json")):
            with open(path) as f:
                d = json.load(f)
            rel = path.relative_to(MAT_DIR).as_posix()[:-len(".json")]
            d["__category__"] = cat
            d["__ref__"] = f"tetra:{rel}"
            out[(cat, d["key"])] = d
    return out


def tier_of(mat):
    """Map toolLevel to {iron, diamond, netherite}. Skin materials default to iron."""
    tl = str(mat.get("toolLevel", "")).lower()
    if "netherite" in tl: return "netherite"
    if "diamond" in tl:   return "diamond"
    return "iron"


def armor_extras_for(mat, base_extras, base_kb):
    """Per-material extra attributes (toughness, KB resist on top of base)."""
    out = dict(base_extras)
    tier = tier_of(mat)
    # Carry the archetype's base KB resist
    kb = base_kb
    if tier == "netherite":
        kb = round(base_kb + 0.05, 3)
        out["minecraft:generic.armor_toughness"] = 0.2
    elif tier == "diamond":
        out["minecraft:generic.armor_toughness"] = 0.1
    return out, kb


def generate_armor_variant(archetype, mat, base_armor):
    """Generate one variant entry for (archetype, material)."""
    cat = mat["__category__"]
    primary = float(mat.get("primary", 5.0))
    magic_cap = int(mat.get("magicCapacity", 60))

    armor_mult = primary / 5.0
    armor_value = round(base_armor["armor"] * armor_mult, 3)
    armor_magic = max(4, round(magic_cap / 12))

    extras, kb = armor_extras_for(mat, base_armor["extras"], base_armor["kb_resist"])

    primary_attrs = {"minecraft:generic.armor": armor_value}
    if kb > 0:
        primary_attrs["minecraft:generic.knockback_resistance"] = kb
    if "minecraft:generic.armor_toughness" in extras:
        primary_attrs["minecraft:generic.armor_toughness"] = extras.pop("minecraft:generic.armor_toughness")
    primary_attrs.update(extras)

    return {
        "materials": [mat["__ref__"]],  # file-path resource location (see load_materials), NOT tetra:<cat>/<key>
        # Wildcard trailing-slash key per lesson 2026-05-12: this is the variant
        # KEY (concatenated at runtime by MaterialVariantData.combine() with
        # material.key to produce e.g. "basic_crown/iron"). Suffixing material
        # name here causes doubled NBT like "basic_crown/aethersteelaethersteel".
        "key": f"{archetype}/",
        "extract": {
            "primaryAttributes": primary_attrs,
            "integrity": 0,
            "glyph": {
                "textureLocation": "iridescent_modular_spells:textures/gui/glyphs.png",
                "textureX": 0, "textureY": 0,
            },
            "availableTextures": ["default"],
            "models": [],
            "magicCapacity": armor_magic,
        },
    }


_BOOK_GLYPH_BLOCK = {
    "glyph": {
        "textureLocation": "iridescent_modular_spells:textures/gui/glyphs.png",
        "textureX": 0,
        "textureY": 0,
    },
    "availableTextures": [""],
    "models": [],
}


def _book_extract(attrs, magic_cap, integrity=0):
    """Common book module extract block with glyph + texture metadata. Without
    these, the workbench renders no glyph for the variant -- specific-match
    variants do NOT inherit from the wildcard."""
    return {
        "primaryAttributes": attrs,
        "integrity": integrity,
        **_BOOK_GLYPH_BLOCK,
        "magicCapacity": magic_cap,
    }


def generate_spine_variant(book_kind, mat):
    """Generate one spine variant entry for a metal."""
    cat = mat["__category__"]
    if cat != "metal": return None  # spines are metal-only
    magic_cap = int(mat.get("magicCapacity", 60))

    cdr = round(magic_cap / 10000, 4)
    sp_magic = max(2, round(magic_cap / 30))

    attr_key = ("**irons_spellbooks:cooldown_reduction" if book_kind == "iss_book"
                else "**ars_nouveau:ars_nouveau.perk.mana_regen")

    return {
        "materials": [mat["__ref__"]],  # file-path resource location (see load_materials), NOT tetra:<cat>/<key>
        "key": "spine/",  # wildcard trailing slash; see armor variant comment
        "extract": _book_extract({attr_key: cdr}, sp_magic),
    }


def generate_front_cover_variant(book_kind, mat):
    """Generate front_cover variant. Accepts skin and metal materials.
    Spell power scaled by material's magicCapacity."""
    cat = mat["__category__"]
    if cat not in ("skin", "metal"): return None
    magic_cap = int(mat.get("magicCapacity", 60))

    sp = round(magic_cap / 20000, 4)
    extra_magic = max(2, round(magic_cap / 25))

    attr_key = ("**irons_spellbooks:spell_power" if book_kind == "iss_book"
                else "**ars_nouveau:ars_nouveau.perk.spell_damage")

    return {
        "materials": [mat["__ref__"]],  # file-path resource location (see load_materials), NOT tetra:<cat>/<key>
        "key": "front_cover/",  # wildcard trailing slash; see armor variant comment
        # Magic-weapon aspect: lets the MagicWeaponCategory enchants (incl. Arcane
        # Edge) apply on the book cover at the Tetra workbench. See
        # apply_magic_weapon_aspect.py + MagicWeaponCategory.registerTetraAspect.
        "aspects": {"icraft_magic_weapon": 2},
        "extract": _book_extract({attr_key: sp}, extra_magic),
    }


def generate_pages_variant(book_kind, mat):
    """Generate pages variant. ISS-only (ars_book has no pages slot); SKIN
    materials only (the hand-authored paper + leather defaults are preserved
    via EXISTING_KEYS / append-merge). cast_time_reduction scaled by the
    material's magicCapacity, with a uniform minor magic + integrity
    contribution matching the existing leather pages entry. Added 2026-06-08:
    the pages module was the one book slot omitted from this loop, so non-
    leather skins (deathskin, rotten_leather, tf_*) could be SELECTED in the
    schematic but had no variant to extract -> silently didn't apply."""
    if book_kind != "iss_book":
        return None  # ars_book has no pages module
    cat = mat["__category__"]
    if cat != "skin":
        return None  # pages takes fibre+skin; fibre = paper only (hand-authored)
    magic_cap = int(mat.get("magicCapacity", 60))
    ctr = round(magic_cap / 10000, 4)  # ~0.008-0.011, near the 0.01 leather baseline
    return {
        "materials": [mat["__ref__"]],  # file-path resource location (see load_materials), NOT tetra:<cat>/<key>
        "key": "pages/",  # wildcard trailing slash; see armor variant comment
        "extract": {
            "tertiaryAttributes": {"**irons_spellbooks:cast_time_reduction": ctr},
            "integrity": 0.5,
            "glyph": {
                "textureLocation": "iridescent_modular_spells:textures/gui/glyphs.png",
                "textureX": 16,
                "textureY": 0,
            },
            "availableTextures": [""],
            "models": [],
            "magicCapacity": 0.5,
        },
    }


def generate_back_cover_variant(book_kind, mat):
    """Generate back_cover variant. Accepts skin and metal. Max mana scaled."""
    cat = mat["__category__"]
    if cat not in ("skin", "metal"): return None
    magic_cap = int(mat.get("magicCapacity", 60))

    mana = max(3, round(magic_cap / 20))

    attr_key = ("irons_spellbooks:max_mana" if book_kind == "iss_book"
                else "ars_nouveau:ars_nouveau.perk.max_mana")

    extract = _book_extract({attr_key: mana}, max(2, round(magic_cap / 40)), integrity=1)

    return {
        "materials": [mat["__ref__"]],  # file-path resource location (see load_materials), NOT tetra:<cat>/<key>
        "key": "back_cover/",  # wildcard trailing slash; see armor variant comment
        # Magic-weapon aspect: see generate_front_cover_variant.
        "aspects": {"icraft_magic_weapon": 2},
        "extract": extract,
    }


def update_archetype_json(path, new_variants):
    """Upsert by materials[0]: replace if a variant with the same material
    reference exists, append if new. The generator skips the vanilla 6
    (EXISTING_KEYS) at generation time, so vanilla variants are never in
    new_variants -- they stay preserved in the file.

    The Tetra variant structure in this codebase has MANY variants sharing
    the same `key` field (all `basic_crown/`, all `silk_lining/`, etc.) --
    the unique-per-variant identifier is the materials[0] reference like
    `tetra:metal/aethersteel`. So upsert by material, not by key.

    2026-05-28: was skip-if-exists, changed to upsert so re-running the
    generator after material primary stat changes actually updates the
    modded-metal variants. Previous skip-only behavior was the root cause
    of the vanilla-vs-modded armor inversion (aethersteel.primary bumped
    long ago but variants never re-flowed).
    """
    with open(path) as f:
        data = json.load(f)
    new_by_mat = {v["materials"][0]: v for v in new_variants if v.get("materials")}
    replaced, kept = 0, []
    for v in data.get("variants", []):
        mats = v.get("materials", [])
        mat0 = mats[0] if mats else None
        if mat0 in new_by_mat:
            kept.append(new_by_mat.pop(mat0))
            replaced += 1
        else:
            kept.append(v)
    appended = list(new_by_mat.values())
    data["variants"] = kept + appended
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return replaced, len(appended)


def lang_entry(archetype, mat_name):
    """Tetra variant lang convention: '<Capitalized Material> <archetype>'."""
    pretty_mat = mat_name.replace("_", " ").title()
    pretty_arch = archetype.replace("_", " ")
    return f"{pretty_mat} {pretty_arch}"


def main():
    materials = load_materials()
    print(f"Loaded {len(materials)} modded materials")

    new_lang = {}
    total_added = 0
    total_replaced = 0

    # ── Armor variants ───────────────────────────────────────────────────────
    for slot, archetypes in METALLIC_ARCHETYPES.items():
        for arch in archetypes:
            path = MODULE_DIR / slot / f"{arch}.json"
            if not path.exists():
                print(f"  WARN: missing {path}")
                continue
            base = load_base_armor(path)
            if not base:
                print(f"  WARN: no base default-metal variant in {path}")
                continue
            new_variants = []
            for (cat, name), mat in materials.items():
                if cat == "skin": continue  # archetype's hardcoded leather/skin entries cover this
                if name in EXISTING_KEYS: continue
                v = generate_armor_variant(arch, mat, base)
                new_variants.append(v)
                new_lang[f"tetra.variant.{arch}/{name}"] = lang_entry(arch, name)
            replaced, appended = update_archetype_json(path, new_variants)
            total_added += appended
            total_replaced += replaced
            print(f"  armor {slot}/{arch}: replaced {replaced}, appended {appended}")

    # ── Book module variants ─────────────────────────────────────────────────
    for book in ("iss_book", "ars_book"):
        for part, gen in [
            ("spine", generate_spine_variant),
            ("front_cover", generate_front_cover_variant),
            ("back_cover", generate_back_cover_variant),
            ("pages", generate_pages_variant),
        ]:
            path = MODULE_DIR / book / f"{part}.json"
            if not path.exists():
                print(f"  WARN: missing {path}")
                continue
            new_variants = []
            for (cat, name), mat in materials.items():
                v = gen(book, mat)
                if v is None: continue
                new_variants.append(v)
                new_lang[f"tetra.variant.{part}/{name}"] = lang_entry(part, name)
            replaced, appended = update_archetype_json(path, new_variants)
            total_added += appended
            total_replaced += replaced
            print(f"  book {book}/{part}: replaced {replaced}, appended {appended}")

    # ── Lang updates ─────────────────────────────────────────────────────────
    with open(LANG_FILE) as f:
        lang = json.load(f)
    lang_added = 0
    for k, v in new_lang.items():
        if k not in lang:
            lang[k] = v
            lang_added += 1
    # Sort for stability
    lang = dict(sorted(lang.items()))
    with open(LANG_FILE, "w") as f:
        json.dump(lang, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\nLang: +{lang_added} new keys (total {len(lang)})")
    print(f"\nTotal variant entries: replaced {total_replaced}, appended {total_added}")


if __name__ == "__main__":
    main()
