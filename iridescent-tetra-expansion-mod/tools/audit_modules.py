#!/usr/bin/env python3
"""
Module + schematic structural audit for iridescent-tetra-expansion-mod.

Runs 8 checks looking for fail-states like the "Emerald robe" bug
(base variant accepting a material the schematic restricts away from).

Usage from the mod source root:
    python3 tools/audit_modules.py

Returns 0 on clean, non-zero with issue summary on findings.
"""
import json
import glob
import sys
import os
import zipfile
from collections import defaultdict

MODULES_DIR = 'src/main/resources/data/tetra/modules'
SCHEMATICS_DIR = 'src/main/resources/data/tetra/schematics'

# The three material homes (see skill tetra-module-wiring). Material refs in
# schematics/variants are "tetra:<category>/<key>" built from each material
# JSON's `category` + `key` FIELDS (not its file path -- wool lives at
# fabric/wool/wool.json).
MATERIAL_DIRS = [
    'src/main/resources/data/tetra/materials',
    '../.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials',
]
# The Tetra jar holds the BUILTIN materials (wool + colored wools, etc.). It is
# staged by wsl-build.sh as libs/tetra.jar (NOT tetra-<ver>.jar), so a
# 'libs/tetra-*.jar' glob silently matched nothing -> builtins absent from the
# registry -> CHECK 2 could not see that e.g. tetra:fabric/wool was selectable,
# and the invalid tetra:fabric/wool/wool refs went unflagged. Match both shapes,
# and fall back to the live instance jar so the audit works off the build box.
TETRA_JAR_GLOBS = ['libs/tetra*.jar']
TETRA_JAR_FALLBACK = os.path.expanduser(
    '~/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods'
)


def _find_tetra_jar():
    for g in TETRA_JAR_GLOBS:
        hits = sorted(glob.glob(g))
        if hits:
            return hits[-1]
    hits = sorted(glob.glob(os.path.join(TETRA_JAR_FALLBACK, 'tetra-*.jar')))
    return hits[-1] if hits else None


def load_material_registry():
    """Material refs keyed by FILE-PATH resource location, mod src + the
    icraft_tetra_materials datapack + the Tetra jar's builtins.

    CRITICAL: Tetra resolves a variant/schematic `materials` ref by its FILE
    PATH (resource location), NOT the material JSON's category+key fields. A ref
    that doesn't match a material file silently falls through to the default
    material (reference_tetra_internals.md sec.4; the 320-case "silent
    fallthrough"). So `fabric/wool/wool.json` is `tetra:fabric/wool/wool` (NOT
    `tetra:fabric/wool` from its category+key), and `metal/diopside.json` is
    `tetra:metal/diopside` (its category is gem but the FOLDER governs the ref).
    Building the registry from category/key was the exact bug that made this
    audit bless 532 fallthrough refs as valid."""
    refs = set()

    def add_path(rel):  # rel = path under materials/, sans .json
        refs.add('tetra:' + rel.replace(os.sep, '/'))

    for base in MATERIAL_DIRS:
        for path in glob.glob(f'{base}/**/*.json', recursive=True):
            norm = path.replace(os.sep, '/')
            if '/materials/' in norm:
                add_path(norm.split('/materials/', 1)[1][:-5])

    jar = _find_tetra_jar()
    if jar:
        with zipfile.ZipFile(jar) as z:
            for name in z.namelist():
                if name.startswith('data/tetra/materials/') and name.endswith('.json'):
                    add_path(name.split('materials/', 1)[1][:-5])
    else:
        print('WARN: Tetra jar not found (libs/tetra*.jar) — builtin materials '
              '(wool, etc.) absent from registry; CHECK 2 coverage is partial.')
    return refs


def material_covered(entry, concrete_set):
    """A schematic `materials` entry covers either a category prefix
    (trailing slash -- Tetra matches by startswith) or one concrete ref."""
    if entry.endswith('/'):
        return any(m.startswith(entry) for m in concrete_set)
    return entry in concrete_set


def load_dir(prefix, glob_pattern):
    out = {}
    # glob returns OS-native separators (backslashes on Windows); normalize to
    # forward slashes so rel-keys match the '/'-style moduleKeys read from JSON.
    paths = sorted(p.replace('\\', '/') for p in glob.glob(glob_pattern, recursive=True))
    for path in paths:
        rel = path[len(prefix):].rsplit('.json', 1)[0]
        try:
            with open(path) as f:
                out[rel] = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return out


def main():
    modules = load_dir(MODULES_DIR + '/', f'{MODULES_DIR}/*/*.json')
    schematics = load_dir(SCHEMATICS_DIR + '/', f'{SCHEMATICS_DIR}/**/*.json')

    sch_by_module = defaultdict(list)
    for sch_path, sch in schematics.items():
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            if mk:
                sch_by_module[mk].append((sch_path, set(oc.get('materials', []))))

    issues = defaultdict(list)

    # CHECK 1: schematic targets a module that doesn't exist
    for sch_path, sch in schematics.items():
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            if mk and mk not in modules:
                issues['missing_module'].append(f'{sch_path} -> {mk}')

    # CHECK 2: every material a schematic makes SELECTABLE must have a module
    # variant to extract, or the selection silently no-ops in the workbench
    # (the deathskin-pages bug class, 7b25df073). Schematic entries are
    # category prefixes ("tetra:skin/") or concrete refs; prefixes are
    # expanded against the real material registry so PER-MATERIAL gaps are
    # caught, not just empty categories.
    registry = load_material_registry()
    for sch_path, sch in schematics.items():
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            sch_mats = set(oc.get('materials', []))
            if not mk or mk not in modules or not sch_mats:
                continue
            mod = modules[mk]
            variant_mats = {m for v in mod.get('variants', []) for m in v.get('materials', [])}
            for entry in sorted(sch_mats):
                if entry.endswith('/'):
                    members = {m for m in registry if m.startswith(entry)}
                    if not members:
                        issues['schematic_category_empty'].append(
                            f'{sch_path}: category {entry} matches no registered material'
                        )
                        continue
                    gaps = sorted(
                        m for m in members
                        if m not in variant_mats
                        and not any(vm.endswith('/') and m.startswith(vm) for vm in variant_mats)
                    )
                    if gaps:
                        issues['selectable_material_no_variant'].append(
                            f'{sch_path} -> {mk}: {len(gaps)} selectable material(s) with no variant: '
                            + ', '.join(gaps[:6]) + (' ...' if len(gaps) > 6 else '')
                        )
                elif entry not in variant_mats and not any(
                        vm.endswith('/') and entry.startswith(vm) for vm in variant_mats):
                    issues['selectable_material_no_variant'].append(
                        f'{sch_path} -> {mk}: concrete material {entry} has no variant'
                    )

    # CHECK 2b: variant references a material that does NOT exist in the
    # registry (mod + datapack + tetra builtins). This is the tetra:fabric/
    # wool/wool class -- a ref built from the file PATH (fabric/wool/wool.json)
    # instead of the material's category+key (fabric + wool = tetra:fabric/wool).
    # Before the 06-12 fill added the canonical tetra:fabric/wool variant, these
    # dead refs were a module's ONLY wool variant, so inserting wool fell through
    # to a random material (magenta). Skip when the registry is empty of builtins
    # (jar not found) to avoid false positives on legitimate external materials.
    # Guard: only run when the registry actually loaded the tetra builtins
    # (else every wool ref false-flags). Every tetra: material in THIS pack lives
    # in one of the three loaded homes, so any concrete tetra: ref absent from the
    # registry is genuinely dead. Non-tetra namespaces (other mods) are skipped.
    if any(m.startswith('tetra:fabric/') for m in registry):
        for mod_key, mod in modules.items():
            for v in mod.get('variants', []):
                for m in v.get('materials', []):
                    if m.endswith('/') or not m.startswith('tetra:'):
                        continue
                    if m not in registry:
                        issues['variant_material_not_in_registry'].append(
                            f'{mod_key} variant "{v.get("key", "?")}": {m} (no such material)'
                        )

    # CHECK 3 (soft): variants whose materials no schematic can reach -- dead
    # data. Generalizes the old "Emerald robe" base-variant check to the
    # per-material-variant data model (every combine-pattern key ends in '/',
    # so "the base variant" is no longer a single identifiable entry), with
    # prefix-aware matching against the schematic union.
    for mod_key, mod in modules.items():
        relevant = sch_by_module.get(mod_key, [])
        if not relevant:
            continue
        sch_union = set()
        for _, m in relevant:
            sch_union |= m
        if not sch_union:
            continue
        dead = set()
        for v in mod.get('variants', []):
            for vm in v.get('materials', []):
                reachable = any(
                    (s.endswith('/') and vm.startswith(s)) or s == vm
                    for s in sch_union
                )
                if not reachable:
                    dead.add(vm)
        if dead:
            issues['unreachable_variant_soft'].append(
                f'{mod_key}: {len(dead)} variant material(s) no schematic reaches: '
                + ', '.join(sorted(dead)[:6]) + (' ...' if len(dead) > 6 else '')
            )

    # CHECK 4: variant suffix doesn't match any of variant's materials
    for mod_key, mod in modules.items():
        for v in mod.get('variants', []):
            key = v.get('key', '')
            if key.endswith('/') or '/' not in key:
                continue
            suffix = key.rsplit('/', 1)[-1]
            v_mats = v.get('materials', [])
            if not v_mats:
                continue
            if not any(suffix in m for m in v_mats):
                issues['variant_suffix_no_match'].append(
                    f'{mod_key} variant {key}: materials {v_mats} but suffix not present'
                )

    # CHECK 5: major-displayType modules need magicCapacity > 0 to enable
    # the BookEnchantSchematic gate (decompiled: lambda checks
    # module.getMagicCapacityGain(stack) > 0).
    major_modules = set()
    for sch in schematics.values():
        if sch.get('displayType') != 'major':
            continue
        for oc in sch.get('outcomes', []):
            if oc.get('moduleKey'):
                major_modules.add(oc['moduleKey'])
    for mk in major_modules:
        mod = modules.get(mk)
        if not mod:
            continue
        for v in mod.get('variants', []):
            cap = v.get('extract', {}).get('magicCapacity', 0)
            if cap <= 0:
                issues['major_module_no_magic_capacity'].append(
                    f'{mk} variant "{v.get("key", "?")}": magicCapacity={cap}'
                )

    # CHECK 6: schematic slot must match its target module's slot
    for sch_path, sch in schematics.items():
        sch_slots = set(sch.get('slots', []))
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            if not mk or mk not in modules:
                continue
            mod_slots = set(modules[mk].get('slots', []))
            if sch_slots != mod_slots:
                issues['schematic_module_slot_mismatch'].append(
                    f'{sch_path} slots={sch_slots} != {mk} slots={mod_slots}'
                )

    # CHECK 7 (soft): every improvement a module declares (its `improvements`
    # FILE refs, e.g. tetra:iridescent_reforging/armor_mage_hone_chestplate) must
    # have a landing path -- a schematic OUTCOME that applies its key. Resolve
    # each ref to the improvement's key(s) and check them against the set of keys
    # any schematic outcome applies.
    #
    # Was a FALSE-CLEAN: the old code did `ns, path = ref.split(':')` then
    # `if ns != 'iridescent_reforging': continue` -- but the refs are
    # `tetra:iridescent_reforging/...` so ns is ALWAYS 'tetra' and the loop
    # skipped EVERY reforging improvement (never validated honing wiring). It
    # also matched improvement PATHS against schematic file PATHS, not the keys a
    # schematic actually applies. Soft because 'settled' improvements land via
    # progression (settle), not a schematic outcome -- so a hit here means "no
    # schematic applies this key", which the author reads + judges.
    applied_keys = set()
    for sch in schematics.values():
        for oc in sch.get('outcomes', []):
            applied_keys |= set((oc.get('improvements') or {}).keys())
    imp_key_cache = {}

    def improvement_keys(ref):
        if ref in imp_key_cache:
            return imp_key_cache[ref]
        keys = set()
        if ':' in ref:
            rel = ref.split(':', 1)[1].rstrip('/')
            fp = os.path.join(MODULES_DIR.replace('/modules', '/improvements'), rel + '.json')
            try:
                with open(fp) as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    data = [data]
                keys = {e.get('key') for e in data if e.get('key')}
            except (json.JSONDecodeError, IOError):
                pass
        imp_key_cache[ref] = keys
        return keys

    for mod_key, mod in modules.items():
        for imp_ref in mod.get('improvements', []):
            keys = improvement_keys(imp_ref)
            if not keys:
                continue
            # 'settled' improvements are applied by progression, not a schematic.
            if all('settle' in k for k in keys):
                continue
            if not (keys & applied_keys):
                issues['no_improvement_schematic'].append(
                    f'{mod_key} -> {imp_ref} (key {sorted(keys)}) applied by no schematic'
                )

    # CHECK 8: orphan modules (not targeted by any schematic).
    # Soft warning - tetra-side schematics may reference vanilla-named modules.
    referenced = {oc['moduleKey'] for s in schematics.values() for oc in s.get('outcomes', []) if oc.get('moduleKey')}
    for mod_key in modules:
        if mod_key not in referenced:
            issues['unreferenced_module'].append(mod_key)

    if not issues:
        print(f'Clean. Scanned {len(modules)} modules + {len(schematics)} schematics.')
        return 0

    SOFT = {'unreachable_variant_soft', 'schematic_category_empty', 'no_improvement_schematic'}
    hard_hit = False
    for cat, items in issues.items():
        tag = ' [soft]' if cat in SOFT else ''
        if cat not in SOFT:
            hard_hit = True
        print(f'\n=== {cat} ({len(items)}){tag} ===')
        for it in items[:25]:
            print(f'  {it}')
        if len(items) > 25:
            print(f'  ... +{len(items) - 25} more')
    return 1 if hard_hit else 0


if __name__ == '__main__':
    sys.exit(main())
