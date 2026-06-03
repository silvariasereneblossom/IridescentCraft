#!/usr/bin/env python3
"""
zip_paxi_datapack.py -- (re)pack the icraft_tetra_materials datapack source into
the 3 distro Paxi datapack zips.

The Tetra boss/base materials load in-game via a Paxi datapack (NOT the jar -- the
jar carries the module variants + repairs). wsl-build.sh does NOT do this step, so
run this after editing datapack_sources/icraft_tetra_materials/ (e.g. after
gen_boss_materials.py) and before shipping.

IMPORTANT: must use forward-slash zip entry names. Windows PowerShell 5.1's
ZipFile.CreateFromDirectory (.NET Framework) writes OS-native BACKSLASH entries,
which Minecraft's datapack loader does not recognise (it expects 'data/...'), so
the datapack silently fails to register. Python's zipfile always uses '/'.

Run (Windows or WSL):  python tools/zip_paxi_datapack.py
"""
import os, zipfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = _SCRIPT_DIR.parent.parent
SRC = REPO_ROOT / ".minecraft" / "datapack_sources" / "icraft_tetra_materials"
REL = Path("config") / "paxi" / "datapacks" / "icraft_tetra_materials.zip"
TARGETS = [
    REPO_ROOT / ".minecraft" / REL,
    REPO_ROOT / ".minecraft" / "distribution" / "client" / REL,
    REPO_ROOT / ".minecraft" / "server_distribution" / REL,
]


def main():
    files = []
    for root, _dirs, names in os.walk(SRC):
        for n in sorted(names):
            full = Path(root) / n
            arc = full.relative_to(SRC).as_posix()  # forward slashes
            files.append((full, arc))
    files.sort(key=lambda x: x[1])

    for t in TARGETS:
        t.parent.mkdir(parents=True, exist_ok=True)
        if t.exists():
            t.unlink()
        with zipfile.ZipFile(t, "w", zipfile.ZIP_DEFLATED) as z:
            for full, arc in files:
                z.write(full, arc)
        print(f"wrote {t}  ({len(files)} entries)")


if __name__ == "__main__":
    main()
