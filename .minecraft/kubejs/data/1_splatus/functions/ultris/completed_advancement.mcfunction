# IridescentCraft override (2026-10-30; RAM and lag audit, reports/datapack-bosses-scope.md, Ultris option A1-lite).
# Ultris 5.6.9c (All Rights Reserved) runs this function every tick from its tick function. Its two Ominous
# Pearl tests are `nbt=` selectors on every online player, each of which saves the player's whole NBT.
# kubejs/server_scripts/compat/ultris_player_checks.js does this function's work at the end of every tick
# Ultris' clock ran, reading the inventory slots directly and calling Ultris' own ids: it grants
# 1_splatus:ultris/root and the two Ominous Pearl advancements, runs 1_splatus:ultris/other/check_advancement
# on the tick the 5-tick clock reads 1, and starts the conqueror music as before.
# This copy is empty on purpose: nothing of Ultris' text is copied into the pack.
# To undo: delete this file, clocks/5_tick and clocks/20_tick next to it, and that script, together.
