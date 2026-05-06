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
from collections import defaultdict

MODULES_DIR = 'src/main/resources/data/tetra/modules'
SCHEMATICS_DIR = 'src/main/resources/data/tetra/schematics'


def load_dir(prefix, glob_pattern):
    out = {}
    for path in sorted(glob.glob(glob_pattern, recursive=True)):
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

    # CHECK 2: schematic's materials are not all in any variant of target module
    for sch_path, sch in schematics.items():
        for oc in sch.get('outcomes', []):
            mk = oc.get('moduleKey')
            sch_mats = set(oc.get('materials', []))
            if not mk or mk not in modules or not sch_mats:
                continue
            mod = modules[mk]
            variant_mats = {m for v in mod.get('variants', []) for m in v.get('materials', [])}
            missing = sch_mats - variant_mats
            if missing:
                issues['schematic_mat_not_in_module'].append(
                    f'{sch_path} accepts {missing} but {mk} has no variant for them'
                )

    # CHECK 3: BASE variant accepts materials no schematic allows
    # (the "Emerald robe" fail pattern - base falls through to a material the
    # restrictive schematic wouldn't pick.)
    for mod_key, mod in modules.items():
        base_v = next((v for v in mod.get('variants', []) if v.get('key', '').endswith('/')), None)
        if not base_v:
            continue
        base_mats = set(base_v.get('materials', []))
        relevant = sch_by_module.get(mod_key, [])
        if not relevant:
            continue
        sch_union = set()
        for _, m in relevant:
            sch_union |= m
        extra = base_mats - sch_union
        if extra and sch_union:
            issues['base_accepts_unschematized'].append(
                f'{mod_key}: base variant accepts {extra} but schematics only allow {sch_union}'
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

    for cat, items in issues.items():
        print(f'\n=== {cat} ({len(items)}) ===')
        for it in items[:25]:
            print(f'  {it}')
        if len(items) > 25:
            print(f'  ... +{len(items) - 25} more')
    return 1


if __name__ == '__main__':
    sys.exit(main())
