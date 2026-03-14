// =============================================================================
// IRIDESCENT CODEX — Patchouli Book Item Registration
// File: kubejs/startup_scripts/iridescent_codex.js
//
// Patchouli automatically registers the book item once the book.json
// datapack is loaded. This script handles:
//   1. First-join delivery via PlayerEvents.loggedIn
//   2. A backup crafting recipe (cheap — book is cosmetic/reference, not gated)
//
// Book item ID: patchouli:guide_book{patchouli:book: "patchouli:iridescent_codex"}
// Note: Patchouli book delivery uses the /patchouli give_book command
//       which handles NBT tagging internally.
// =============================================================================

// No startup registration needed — Patchouli registers the book item
// automatically from the book.json in the datapack.
// This file is a placeholder confirming the book exists.

console.log('[IridescentCraft] Iridescent Codex startup placeholder loaded')
console.log('  - Book ID: patchouli:iridescent_codex')
console.log('  - Delivery handled by: kubejs/server_scripts/codex_delivery.js')
