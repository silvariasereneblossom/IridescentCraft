# IridescentCraft (2026-10-30): the fail-open half of our ub:tick override (kubejs/data/ub/functions/tick.mcfunction):
# all seven Ultimate Bosses tick functions in their own order, ungated. It runs while
# kubejs/server_scripts/compat/ub_tick_gate.js is not refreshing #ub_ttl, or the objective icraft_gate is missing.
function ub:boss/eye
function ub:boss/lostangel
function ub:boss/storm
function ub:alchemy_circles/tick
function ub:boss/sorcerer
function ub:extras/tick
function ub:mobs/ticking
