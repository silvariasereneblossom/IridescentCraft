# IridescentCraft override (2026-10-30; RAM and lag audit, reports/datapack-bosses-scope.md, Ultris option A1-lite).
# Ultris 5.6.9c (All Rights Reserved) calls this function from its clock every 5 ticks. Its charm tests are
# `nbt=` selectors on every online player and its Shulker Shell helmet test one on every item entity, and
# each saves the whole NBT it tests. kubejs/server_scripts/compat/ultris_player_checks.js does the same work
# at the end of that tick, from the inventory slots and item stacks themselves: it runs Ultris'
# 1_splatus:ultris/wither/has_charm or has_charm_lol_not as the player and
# 1_splatus:ultris/other/misc/convert_netherite as the helmet item, and puts the clock 5tick back to 0.
# Every Ultris line that reads 5tick tests 1, 2, 3 or 1..2, so the 5 it holds until then changes none of them.
# This copy is empty on purpose: nothing of Ultris' text is copied into the pack.
# To undo: delete this file, clocks/20_tick, ../completed_advancement and that script, together.
