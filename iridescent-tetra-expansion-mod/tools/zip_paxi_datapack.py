#!/usr/bin/env python3
"""
zip_paxi_datapack.py -- (re)pack icraft datapack SOURCES into the 3 distro Paxi
datapack zips.

Some content loads in-game via Paxi datapack zips under
config/paxi/datapacks/, NOT via the mod jar (the jar carries module variants +
repairs + the registered Forge attributes). These source trees live under
.minecraft/datapack_sources/<name>/ and are packed into
config/paxi/datapacks/<name>.zip in all three distros:

  - icraft_tetra_materials    -- Tetra boss/base materials (run after
                                 gen_boss_materials.py edits the source)
  - icraft_apotheosis_affixes -- the icraft_* Apotheosis affixes (incl. the
                                 icraft:spell_power / lifesteal / dodge_chance
                                 affixes icraft_arcane / icraft_vampiric_weapon
                                 / icraft_evasive)

wsl-build.sh does NOT do this step, and sync-distros.ps1 does NOT watch
datapack_sources OR config/, so after editing any datapack_sources/<name>/ tree
you MUST re-run this and commit the regenerated zips, or the loaded copy keeps
the old content (silent drift).

IMPORTANT: must use forward-slash zip entry names. Windows PowerShell 5.1's
ZipFile.CreateFromDirectory (.NET Framework) writes OS-native BACKSLASH entries,
which Minecraft's datapack loader does not recognise (it expects 'data/...'), so
the datapack silently fails to register. Python's zipfile always uses '/'.

Run (Windows or WSL):
  python tools/zip_paxi_datapack.py                          # rebuild all
  python tools/zip_paxi_datapack.py icraft_apotheosis_affixes  # rebuild one
"""
import os, sys, zipfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent.parent

# Datapacks that ship as Paxi zips. Each <name> is packed from
# .minecraft/datapack_sources/<name>/ into config/paxi/datapacks/<name>.zip
# under every distro root below.
DATAPACKS = [
    "icraft_tetra_materials",
    "icraft_apotheosis_affixes",
]

DISTRO_ROOTS = [
    REPO_ROOT / ".minecraft",
    REPO_ROOT / ".minecraft" / "distribution" / "client",
    REPO_ROOT / ".minecraft" / "server_distribution",
]


def pack(name):
    src = REPO_ROOT / ".minecraft" / "datapack_sources" / name
    if not src.is_dir():
        print(f"SKIP {name}: source tree missing ({src})")
        return
    files = []
    for root, _dirs, names in os.walk(src):
        for n in sorted(names):
            full = Path(root) / n
            arc = full.relative_to(src).as_posix()  # forward slashes
            files.append((full, arc))
    files.sort(key=lambda x: x[1])

    rel = Path("config") / "paxi" / "datapacks" / f"{name}.zip"
    for distro in DISTRO_ROOTS:
        t = distro / rel
        t.parent.mkdir(parents=True, exist_ok=True)
        if t.exists():
            t.unlink()
        with zipfile.ZipFile(t, "w", zipfile.ZIP_DEFLATED) as z:
            for full, arc in files:
                z.write(full, arc)
        print(f"wrote {t}  ({len(files)} entries)")


def main():
    selected = sys.argv[1:] or DATAPACKS
    unknown = [s for s in selected if s not in DATAPACKS]
    if unknown:
        print(f"unknown datapack(s): {', '.join(unknown)}")
        print(f"known: {', '.join(DATAPACKS)}")
        sys.exit(2)
    for name in selected:
        pack(name)


if __name__ == "__main__":
    main()
