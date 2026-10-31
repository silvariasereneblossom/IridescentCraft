# IridescentCraft (2026-10-30): the gated half of our ub:tick override (kubejs/data/ub/functions/tick.mcfunction).
# One line per Ultimate Bosses tick function, in its own order; a function runs while its family's score in
# icraft_gate is 1 (kubejs/server_scripts/compat/ub_tick_gate.js says which entities make up each family).
# An entity that joins while an earlier function runs (a summon) opens its family at once, so a later
# function of the same tick still sees it, as before.
execute if score #ub_eye icraft_gate matches 1.. run function ub:boss/eye
execute if score #ub_angel icraft_gate matches 1.. run function ub:boss/lostangel
# The Lost Angel function also gives Slowness to anything within 2 blocks of the position the tick runs at
# (world spawn), whether a Lost Angel exists or not: it runs whenever something is there, so that stays as it
# was. Keeping or dropping that Slowness is the operator's decision (scope section 7, decision 1).
execute unless score #ub_angel icraft_gate matches 1.. if entity @e[distance=..2] run function ub:boss/lostangel
execute if score #ub_storm icraft_gate matches 1.. run function ub:boss/storm
execute if score #ub_circle icraft_gate matches 1.. run function ub:alchemy_circles/tick
execute if score #ub_sorc icraft_gate matches 1.. run function ub:boss/sorcerer
execute if score #ub_extras icraft_gate matches 1.. run function ub:extras/tick
execute if score #ub_mobs icraft_gate matches 1.. run function ub:mobs/ticking
