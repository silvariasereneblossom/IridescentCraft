#!/usr/bin/env python3
"""
Walk every skin definition + module variant, verify referenced textures exist
on disk (in the mod's own resources or in any cached source-mod jar).
Reports gaps as (skin_id_or_variant, expected_path, where_we_looked).
"""
import json, os, sys, zipfile
from pathlib import Path
from collections import defaultdict

# MOD_ROOT is derived from this file's location (tools/ -> mod root) so the
# audit follows the resources wherever the iridescent_reforging namespace lives
# (it now ships inside iridescent-tetra-expansion-mod, NOT the old sibling
# iridescent-reforging-mod). A hardcoded absolute path silently scanned 0 files
# off the build box -- a false-clean, the exact silent-failure this tool exists
# to prevent.
MOD_ROOT = Path(__file__).resolve().parent.parent
SKINS = MOD_ROOT / "src/main/resources/data/iridescent_reforging/iridescent_reforging_skins"
MODULES = MOD_ROOT / "src/main/resources/data/tetra/modules"
SKIN_MODELS = MOD_ROOT / "src/main/resources/assets/iridescent_reforging/models/item"
OWN_ASSETS = MOD_ROOT / "src/main/resources/assets/iridescent_reforging"


def jar_dirs():
    """Candidate dirs holding the source-mod jars, newest convention first.
    Override with ICRAFT_MOD_JARS=<dir>. Falls back to the WSL build cache and
    the live PrismLauncher instance so the audit runs on the build box AND on a
    contributor's Windows machine."""
    cands = []
    env = os.environ.get("ICRAFT_MOD_JARS")
    if env:
        cands.append(Path(env))
    cands.append(Path("/root/IridescentCraft/iridescent-biomes-mod/tools/.cache/all-mods"))
    appdata = os.environ.get("APPDATA")
    if appdata:
        cands.append(Path(appdata) / "PrismLauncher/instances/IridescentCraft/.minecraft/mods")
    home = Path(os.path.expanduser("~"))
    cands.append(home / "AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods")
    return [d for d in cands if d.is_dir() and any(d.glob("*.jar"))]


JAR_CONTENT_INDEX = {}

def index_jars():
    """Map each assets/.../*.png to the jar that contains it (first source dir
    that has jars)."""
    dirs = jar_dirs()
    if not dirs:
        print("WARNING: no source-mod jar dir found (set ICRAFT_MOD_JARS); "
              "cross-mod textures cannot be verified.", file=sys.stderr)
        return
    src = dirs[0]
    jars = list(src.glob("*.jar"))
    print(f"Indexing {len(jars)} jars from {src} ...", file=sys.stderr)
    for jp in jars:
        try:
            with zipfile.ZipFile(jp) as zf:
                for name in zf.namelist():
                    if name.startswith("assets/") and name.endswith(".png"):
                        JAR_CONTENT_INDEX[name] = jp.name
        except zipfile.BadZipFile:
            continue

def resource_to_path(resloc):
    """Convert 'mod:textures/foo.png' to 'assets/mod/textures/foo.png'."""
    if ":" in resloc:
        ns, sub = resloc.split(":", 1)
    else:
        ns, sub = "minecraft", resloc
    return f"assets/{ns}/{sub}"

VANILLA_ARMOR_MATERIALS = {"iron", "gold", "diamond", "netherite", "leather", "chainmail", "turtle"}

def file_exists(asset_path):
    """Check on-disk + in any indexed jar. Treat minecraft: vanilla armor
    layer paths as always-present (the game ships them in minecraft.jar
    which we don't index)."""
    # asset_path looks like 'assets/<ns>/textures/...'
    if asset_path.startswith("assets/minecraft/textures/models/armor/"):
        # Extract material name
        leaf = asset_path.rsplit("/", 1)[-1]  # e.g. iron_layer_1.png
        for vm in VANILLA_ARMOR_MATERIALS:
            if leaf.startswith(vm + "_layer_"):
                return ("vanilla", asset_path)
    if (MOD_ROOT / "src/main/resources" / asset_path).exists():
        return ("own", str(MOD_ROOT / "src/main/resources" / asset_path))
    if asset_path in JAR_CONTENT_INDEX:
        return ("jar", JAR_CONTENT_INDEX[asset_path])
    return None

def audit_skins():
    """Verify each skin def's texture_layer_1/2 + namespace/name fallback paths."""
    gaps = []
    ok_count = 0
    for jf in sorted(SKINS.glob("*.json")):
        with open(jf) as f:
            d = json.load(f)
        sid = d.get("skin_id", jf.stem)
        slot = d.get("slot", "")
        is_legs = slot == "leggings"

        # Explicit override paths
        explicit1 = d.get("texture_layer_1", "")
        explicit2 = d.get("texture_layer_2", "")
        ns = d.get("armor_material_namespace", "")
        name = d.get("armor_material_name", "")

        explicit = explicit2 if is_legs else explicit1
        if explicit:
            ap = resource_to_path(explicit)
            if file_exists(ap):
                ok_count += 1
            else:
                gaps.append((sid, "explicit_override", explicit, ap))
            continue

        if ns and name:
            layer = 2 if is_legs else 1
            conv = f"{ns}:textures/models/armor/{name}_layer_{layer}.png"
            ap = resource_to_path(conv)
            if file_exists(ap):
                ok_count += 1
            else:
                gaps.append((sid, "namespace_convention", conv, ap))
            continue

        # No texture info at all - this skin must rely on Geckolib renderer
        gaps.append((sid, "no_texture_fields", "(geckolib only?)", ""))
    return gaps, ok_count

# Mirror of MATERIAL_TEXTURE_TEMPLATES in ItemModularArmor.java — keep in sync.
MATERIAL_TEXTURE_TEMPLATES = {
    "aethersteel":            "aethersteel:textures/models/armor/aethersteel__layer_{layer}.png",
    "undergarden_cloggrum":   "undergarden:textures/armor/cloggrum_layer_{layer}.png",
    "undergarden_froststeel": "undergarden:textures/armor/froststeel_layer_{layer}.png",
    "undergarden_utherium":   "undergarden:textures/armor/utherium_layer_{layer}.png",
    "charoite":               "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/charoite_layer_{layer}.png",
    "diopside":               "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/diopside_layer_{layer}.png",
    "horizonite":             "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/horizonite_layer_{layer}.png",
}

def audit_module_material_textures():
    """For each material variant in major modules, check the path the Java
    deriveTextureFromMajorMaterial would actually return at runtime: the
    template if mapped, vanilla convention if vanilla material, iron fallback
    otherwise. Iron fallback is always safe (minecraft jar guarantee)."""
    gaps = []
    ok_count = 0
    majors = [
        ("helmet/crown",           "helmet"),
        ("chestplate/chest_plate", "chestplate"),
        ("leggings/leg_plate",     "leggings"),
        ("boots/boot_sole",        "boots"),
    ]
    for slot_path, slot in majors:
        mod_file = MODULES / f"{slot_path}.json"
        if not mod_file.exists():
            continue
        with open(mod_file) as f:
            d = json.load(f)
        is_legs = slot == "leggings"
        layer = 2 if is_legs else 1
        for v in d.get("variants", []):
            vk = v.get("key", "")
            if not vk or vk.endswith("/"):
                continue
            mat = vk.rsplit("/", 1)[-1]
            if not mat:
                continue
            if mat in MATERIAL_TEXTURE_TEMPLATES:
                assumed = MATERIAL_TEXTURE_TEMPLATES[mat].format(layer=layer)
            elif mat in VANILLA_ARMOR_MATERIALS:
                assumed = f"minecraft:textures/models/armor/{mat}_layer_{layer}.png"
            else:
                # Java falls back to iron — iron is always present in vanilla
                assumed = f"minecraft:textures/models/armor/iron_layer_{layer}.png"
            ap = resource_to_path(assumed)
            if file_exists(ap):
                ok_count += 1
            else:
                gaps.append((vk, "actual_runtime_path", assumed, ap))
    return gaps, ok_count

def audit_skin_inventory_icons():
    """HARD check: each generated per-skin item model (models/item/skin/*.json)
    points layer0 at the source mod's inventory texture. A wrong ResourceLocation
    renders the magenta/black missing-texture in the workbench + inventory slot
    (the Wizard-hood class, 2026-06-17). This is what gen_skin_models.py emits, so
    it is the regression guard for that generator."""
    gaps = []
    ok_count = 0
    skin_dir = SKIN_MODELS / "skin"
    for jf in sorted(skin_dir.glob("*.json")):
        with open(jf) as f:
            d = json.load(f)
        tex = d.get("textures", {}).get("layer0")
        if not tex:
            continue
        # Item-model texture refs are short-form ("ns:item/foo"), so the asset
        # path is assets/<ns>/textures/<sub>.png -- NOT resource_to_path's
        # assets/<ns>/<sub> (that form is for skin-def texture_layer values,
        # which already carry the textures/ prefix + .png suffix).
        ns, sub = tex.split(":", 1) if ":" in tex else ("minecraft", tex)
        ap = f"assets/{ns}/textures/{sub}.png"
        if file_exists(ap):
            ok_count += 1
        else:
            gaps.append((jf.stem, "skin_icon", tex, ap))
    return gaps, ok_count

def main():
    index_jars()
    print(f"\nIndexed {len(JAR_CONTENT_INDEX)} png entries across cached jars.\n")

    print("=" * 72)
    print("SKIN DEFINITIONS — texture_layer + namespace/name fallback")
    print("=" * 72)
    skin_gaps, skin_ok = audit_skins()
    print(f"\nOK: {skin_ok}, GAPS: {len(skin_gaps)}")
    if skin_gaps:
        # Group by reason
        by_reason = defaultdict(list)
        for g in skin_gaps:
            by_reason[g[1]].append(g)
        for reason, items in by_reason.items():
            print(f"\n  [{reason}] {len(items)} entries:")
            for it in items[:5]:
                print(f"    - {it[0]}  expected={it[2]}")
            if len(items) > 5:
                print(f"    ... +{len(items) - 5} more")

    print("\n" + "=" * 72)
    print("MAJOR MODULE VARIANTS — deriveTextureFromMajorMaterial path")
    print("=" * 72)
    mod_gaps, mod_ok = audit_module_material_textures()
    print(f"\nOK: {mod_ok}, GAPS: {len(mod_gaps)}")
    if mod_gaps:
        # These all use minecraft: namespace; group by material name
        by_mat = defaultdict(list)
        for g in mod_gaps:
            mat = g[0].rsplit("/", 1)[-1]
            by_mat[mat].append(g[0])
        for mat, vks in sorted(by_mat.items()):
            print(f"  {mat:30s} → {len(vks)} variant(s) miss minecraft texture")

    print("\n" + "=" * 72)
    print("SKIN INVENTORY ICONS — models/item/skin/*.json layer0")
    print("=" * 72)
    icon_gaps, icon_ok = audit_skin_inventory_icons()
    print(f"\nOK: {icon_ok}, GAPS: {len(icon_gaps)}")
    for fn, _, tex, ap in icon_gaps:
        print(f"  {fn:34s} -> {tex}  (looked for {ap})")

    print("\nSUMMARY")
    print(f"  Skin def gaps:        {len(skin_gaps)}  (soft — Geckolib intercepts before getArmorTexture)")
    print(f"  Module derived gaps:  {len(mod_gaps)}  (HARD — these render as the missing-texture checkerboard)")
    print(f"  Skin icon gaps:       {len(icon_gaps)}  (HARD — magenta in workbench + inventory slot)")
    # Hard-fail on module-derived gaps AND skin inventory-icon gaps. Skin DEF
    # gaps (worn-armor layer) are intercepted by IssRendererFactories /
    # Geckolib at runtime, so failing the build on them would block legitimate
    # ships -- tracked as data hygiene only.
    return 1 if (mod_gaps or icon_gaps) else 0

if __name__ == "__main__":
    sys.exit(main())
