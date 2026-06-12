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
TETRA_JAR_GLOB = 'libs/tetra-*.jar'


def load_material_registry():
    """Full material refs ("tetra:metal/iron") from mod src + the
    icraft_tetra_materials datapack + the Tetra jar's builtins."""
    refs = set()

    def add_json(payload):
        try:
            d = json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return
        cat, key = d.get('category'), d.get('key')
        if cat and key:
            refs.add(f'tetra:{cat}/{key}')

    for base in MATERIAL_DIRS:
        for path in glob.glob(f'{base}/**/*.json', recursive=True):
            try:
                with open(path, 'rb') as f:
                    add_json(f.read())
            except IOError:
                pass

    jars = sorted(glob.glob(TETRA_JAR_GLOB))
    if jars:
        with zipfile.ZipFile(jars[-1]) as z:
            for name in z.namelist():
                if name.startswith('data/tetra/materials/') and name.endswith('.json'):
                    add_json(z.read(name))
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

    # CHECK 7: improvement families on iridescent_reforging modules have at
    # least one matching schematic (so honing has somewhere to land)
    for mod_key, mod in modules.items():
        for imp_pattern in mod.get('improvements', []):
            if ':' not in imp_pattern:
                continue
            ns, path_part = imp_pattern.split(':', 1)
            path_part = path_part.rstrip('/')
            if ns != 'iridescent_reforging':
                continue
            if not any(path_part in sp for sp in schematics):
                issues['no_improvement_schematic'].append(
                    f'{mod_key} -> improvement {imp_pattern} has no matching schematic'
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

    SOFT = {'unreachable_variant_soft', 'schematic_category_empty'}
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
