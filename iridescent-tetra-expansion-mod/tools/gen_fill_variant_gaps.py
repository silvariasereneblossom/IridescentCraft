#!/usr/bin/env python3
"""
Fill selectable-material variant gaps across ALL module families.

Why: schematics accept material CATEGORIES (e.g. "tetra:metal/"), so every
registered material in an accepted category is selectable in the workbench.
A selectable material with no module variant silently no-ops on extract (the
deathskin-pages bug class, commit 7b25df073). gen_per_material_variants.py
only covers 12 metallic armor archetypes + book spine/covers/pages, and only
reads metal/gem/skin from the icraft_tetra_materials datapack -- materials
added since (boss bm_*, aether ae_*, wools, fibres, tetra builtins) drifted
out of coverage: audit_modules.py found 166 selectable-but-inert gaps across
boots/leggings/helmet/chestplate minors, wand, and book modules.

How: for each (module, missing material), clone the module's closest existing
variant as a template -- same category preferred, else the iron/leather
baseline, else any concrete variant -- and scale its stats:
  - armor-family modules ({helmet,chestplate,leggings,boots,wand}):
      primaryAttributes x (mat.primary / template_mat.primary)
  - book modules ({iss_book,ars_book}):
      primaryAttributes x (mat.magicCapacity / template_mat.magicCapacity)
  - magicCapacity always scales by the magicCapacity ratio (it gates
      BookEnchantSchematic, so it must stay > 0)
This mirrors the original generator's formulas (armor_mult = primary/5.0
with the iron-baseline template) without hand-designing 30 families.

Variant key stays "<archetype>/" (combine() concatenates material.key at
runtime -- a suffixed key doubles, per lessons-learned-Tetra 2026-05-12).
Lang entries follow the existing "tetra.variant.<arch>/<mat>" convention.

Idempotent: a material already covered (concretely or by a wildcard variant)
is skipped. Run from the mod root; then rerun audit_modules.py (expect the
selectable_material_no_variant category to be empty) and
gen_repair_definitions.py (new variants need repair defs).
"""
import json
import glob
import sys
import zipfile
from collections import defaultdict
from copy import deepcopy
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
MOD_ROOT = _SCRIPT_DIR.parent
REPO_ROOT = MOD_ROOT.parent

MODULES_DIR = MOD_ROOT / 'src/main/resources/data/tetra/modules'
SCHEMATICS_DIR = MOD_ROOT / 'src/main/resources/data/tetra/schematics'
LANG_FILE = MOD_ROOT / 'src/main/resources/assets/iridescent_reforging/lang/en_us.json'

MATERIAL_DIRS = [
    MOD_ROOT / 'src/main/resources/data/tetra/materials',
    REPO_ROOT / '.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials',
]
TETRA_JAR_GLOB = str(MOD_ROOT / 'libs/tetra-*.jar')

BOOK_FAMILIES = {'iss_book', 'ars_book'}


def load_material_registry():
    """ref ("tetra:metal/iron") -> material dict, from the three homes.
    Load order: tetra jar builtins, then mod src, then the datapack
    (mirrors datapack-over-mod override order; later wins)."""
    registry = {}

    def add(payload):
        try:
            d = json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return
        cat, key = d.get('category'), d.get('key')
        if cat and key:
            registry[f'tetra:{cat}/{key}'] = d

    jars = sorted(glob.glob(TETRA_JAR_GLOB))
    if jars:
        with zipfile.ZipFile(jars[-1]) as z:
            for name in z.namelist():
                if name.startswith('data/tetra/materials/') and name.endswith('.json'):
                    add(z.read(name))
    for base in MATERIAL_DIRS:
        for path in glob.glob(f'{base}/**/*.json', recursive=True):
            try:
                add(open(path, 'rb').read())
            except IOError:
                pass
    return registry


def covered(ref, variant_mats):
    return ref in variant_mats or any(
        vm.endswith('/') and ref.startswith(vm) for vm in variant_mats)


def pick_template(variants, ref, registry):
    """Best existing variant to clone for `ref`: same category first
    (iron/leather baselines preferred inside the category), else any
    concrete single-material variant with registry stats."""
    cat = ref.split('/', 1)[0] + '/'  # "tetra:metal/"
    candidates = []
    for v in variants:
        mats = v.get('materials', [])
        if len(mats) != 1 or mats[0].endswith('/'):
            continue
        if mats[0] not in registry:
            continue
        candidates.append(v)
    if not candidates:
        return None
    same_cat = [v for v in candidates if v['materials'][0].startswith(cat)]
    pool = same_cat or candidates
    for baseline in ('tetra:metal/iron', 'tetra:skin/leather'):
        for v in pool:
            if v['materials'][0] == baseline:
                return v
    return pool[0]


def scale_value(value, ratio):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    return round(value * ratio, 4)


def ratio_of(mat, template_mat, field, default=1.0):
    try:
        a = float(mat.get(field, 0))
        b = float(template_mat.get(field, 0))
        if a > 0 and b > 0:
            return a / b
    except (TypeError, ValueError):
        pass
    return default


def build_variant(template, ref, mat, registry, family):
    t_mat = registry[template['materials'][0]]
    stat_ratio = (ratio_of(mat, t_mat, 'magicCapacity')
                  if family in BOOK_FAMILIES else
                  ratio_of(mat, t_mat, 'primary'))
    magic_ratio = ratio_of(mat, t_mat, 'magicCapacity')

    v = deepcopy(template)
    v['materials'] = [ref]
    extract = v.get('extract', {})
    attrs = extract.get('primaryAttributes', {})
    extract['primaryAttributes'] = {k: scale_value(val, stat_ratio) for k, val in attrs.items()}
    if 'magicCapacity' in extract:
        base_cap = extract['magicCapacity']
        if isinstance(base_cap, (int, float)) and not isinstance(base_cap, bool):
            extract['magicCapacity'] = max(1, round(base_cap * magic_ratio))
    return v


def pretty_lang(archetype, ref):
    mat_name = ref.rsplit('/', 1)[-1].replace('_', ' ').title()
    return f"{mat_name} {archetype.replace('_', ' ')}"


def main():
    registry = load_material_registry()
    print(f'Material registry: {len(registry)} refs')

    schematics = {}
    for path in glob.glob(f'{SCHEMATICS_DIR}/**/*.json', recursive=True):
        try:
            schematics[path] = json.load(open(path))
        except (json.JSONDecodeError, IOError):
            pass

    accepted_by_module = defaultdict(set)
    for sch in schematics.values():
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            if mk:
                accepted_by_module[mk].update(oc.get('materials', []))

    new_lang = {}
    total = 0
    skipped_no_template = []

    for path in sorted(glob.glob(f'{MODULES_DIR}/*/*.json')):
        rel = path[len(str(MODULES_DIR)) + 1:-len('.json')]
        if rel not in accepted_by_module:
            continue
        data = json.load(open(path))
        variants = data.get('variants', [])
        variant_mats = {m for v in variants for m in v.get('materials', [])}
        family = rel.split('/')[0]

        missing = []
        for entry in sorted(accepted_by_module[rel]):
            if entry.endswith('/'):
                missing += [r for r in sorted(registry)
                            if r.startswith(entry) and not covered(r, variant_mats)]
            elif not covered(entry, variant_mats):
                missing.append(entry)
        if not missing:
            continue

        added_here = 0
        for ref in dict.fromkeys(missing):  # dedupe, keep order
            template = pick_template(variants, ref, registry)
            if template is None:
                skipped_no_template.append(f'{rel}: {ref}')
                continue
            variants.append(build_variant(template, ref, registry[ref], registry, family))
            arch = template.get('key', '').rstrip('/') or rel.split('/')[-1]
            new_lang[f'tetra.variant.{arch}/{ref.rsplit("/", 1)[-1]}'] = pretty_lang(arch, ref)
            added_here += 1

        if added_here:
            data['variants'] = variants
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
                f.write('\n')
            total += added_here
            print(f'  {rel}: +{added_here}')

    lang = json.load(open(LANG_FILE))
    lang_added = 0
    for k, v in new_lang.items():
        if k not in lang:
            lang[k] = v
            lang_added += 1
    with open(LANG_FILE, 'w') as f:
        json.dump(dict(sorted(lang.items())), f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f'\nAdded {total} variants, {lang_added} lang entries.')
    if skipped_no_template:
        print(f'SKIPPED (no usable template): {len(skipped_no_template)}')
        for s_ in skipped_no_template[:10]:
            print(f'  {s_}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
