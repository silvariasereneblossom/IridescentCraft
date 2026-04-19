package com.iridescentcraft.codex;

import net.minecraftforge.fml.common.Mod;

// modId MUST be "icraft" to match the book.json path at
// data/icraft/patchouli_books/iridescent_codex/book.json. Patchouli's
// BookRegistry.init() scans `data/{modId}/patchouli_books/` — if the
// modId doesn't match the data namespace, the book is never registered
// and players see "Invalid book: icraft:iridescent_codex" on tooltip.
@Mod("icraft")
public class IridescentCodex {
    public IridescentCodex() {}
}
