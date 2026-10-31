# IridescentCraft override (2026-10-30; RAM and lag audit, reports/datapack-bosses-scope.md option A).
# Ultimate Bosses 1.0.4 (All Rights Reserved) calls seven functions here every tick, and between them they
# scan every loaded entity of every dimension about 275 times per tick, boss or no boss. This copy calls the
# same seven function ids in the same order, each only while its family has something loaded:
# kubejs/server_scripts/compat/ub_tick_gate.js writes one score per family to the objective icraft_gate
# from entity joins and removals, and keeps a family open two ticks after its last entity leaves, so the
# bossbar clear and the music stop still run once. The calls are in icraft:gates/ub_gated.
# Nothing of Ultimate Bosses' text is copied: these files only call its function ids.
# Fail-open: the script sets #ub_ttl to 2 at the end of every tick and this file counts it down. When the
# script stops refreshing it, or the objective is gone, icraft:gates/ub_all runs all seven as before.
# Deleting this file brings back Ultimate Bosses' own tick and changes nothing else.
scoreboard players remove #ub_ttl icraft_gate 1
execute store success storage icraft:gates ub byte 1 if score #ub_ttl icraft_gate matches 1..
execute if data storage icraft:gates {ub:1b} run function icraft:gates/ub_gated
execute unless data storage icraft:gates {ub:1b} run function icraft:gates/ub_all
