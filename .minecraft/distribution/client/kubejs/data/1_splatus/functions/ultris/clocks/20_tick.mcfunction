# IridescentCraft override (2026-10-30; RAM and lag audit, reports/datapack-bosses-scope.md, Ultris option A1-lite).
# Ultris 5.6.9c (All Rights Reserved) calls this function from its clock every 20 ticks. It stores the
# mobGriefing game rule in the score gamerule_mobGriefing (objective datasettings) and every online player's
# UUID in the scores ultris_uuid1..4, reading the UUID with `data get entity`, which saves the player's whole
# NBT four times. kubejs/server_scripts/compat/ultris_player_checks.js stores the same values at the end of
# that tick, from the game rule and the UUID themselves, and puts the clock 1sec back to 0. Every Ultris line
# that reads 1sec tests 1, so the 20 it holds until then changes none of them.
# This copy is empty on purpose: nothing of Ultris' text is copied into the pack.
# To undo: delete this file, clocks/5_tick, ../completed_advancement and that script, together.
