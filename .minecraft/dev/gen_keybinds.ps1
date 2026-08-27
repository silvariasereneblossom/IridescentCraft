# =============================================================================
# gen_keybinds.ps1 - generate the pack's canonical DEFAULT KEYBIND set
# =============================================================================
# PURPOSE
#   Single source of truth for the IridescentCraft keybind anchor (docket:
#   keybind-anchor, 2026-08-27). Emits every shipped keybind file from ONE
#   curated map so the defaults can never drift between delivery channels:
#
#     .minecraft/config/defaultoptions/keybindings.txt            (Default Options mod)
#     .minecraft/distribution/client/config/defaultoptions/keybindings.txt
#     .minecraft/config/defaultoptions/options.txt                (first-run seed)
#     .minecraft/distribution/client/config/defaultoptions/options.txt
#     .minecraft/distribution/client/options.txt                  (install-time seed;
#                                                                  key_ block rewritten,
#                                                                  non-key lines preserved)
#
#   $Baseline below is the FULL registered-keybind inventory captured from the
#   operator's live post-modload instance on 2026-08-27 (413 KeyMappings).
#   $Overrides is the curated deconfliction map - the reviewable diff. Edit
#   ONLY $Overrides (or refresh $Baseline after mod add/remove), re-run, commit
#   the regenerated outputs. Full rationale per override:
#   IridescentCraft-internal/dev/keybind-map.md
#
# CONFLICT AUDIT
#   After applying overrides the script groups every BOUND mapping by
#   key+modifier. Any group with 2+ members must exactly match an entry in
#   $AllowedCoexist (intentional stacks: GUI-context keys, hold-overlays,
#   context-exclusive states). An unlisted collision fails the run (exit 1),
#   so a future edit can't silently reintroduce a fight over one key.
#
# FORMAT
#   Baseline/override values: '<input>' or '<input>:<SHIFT|CONTROL|ALT>'
#   (Forge KeyModifier). 'key.keyboard.unknown' = unbound. Emitted lines are
#   the vanilla/Forge options.txt format, which Default Options' keybindings
#   parser (key_([^:]+):([^:]+)(?::(.+))?) reads verbatim.
#
# USAGE
#   pwsh .minecraft/dev/gen_keybinds.ps1          # regenerate all outputs
#   pwsh .minecraft/dev/gen_keybinds.ps1 -Check   # verify outputs are fresh (exit 1 if stale)
# =============================================================================

param(
    [switch]$Check,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$mcRoot = Join-Path $RepoRoot '.minecraft'

# -----------------------------------------------------------------------------
# BASELINE - full registered inventory, live-instance mod defaults, in MC
# registration/save order. Format: '<name>|<input>[:MODIFIER]'
# (Auto-captured; regenerate with the capture snippet in the header of
#  IridescentCraft-internal/dev/keybind-map.md after adding/removing mods.)
# -----------------------------------------------------------------------------
$Baseline = @(
    'key.attack|key.mouse.left'
    'key.use|key.mouse.right'
    'key.forward|key.keyboard.w'
    'key.left|key.keyboard.a'
    'key.back|key.keyboard.s'
    'key.right|key.keyboard.d'
    'key.jump|key.keyboard.space'
    'key.sneak|key.keyboard.left.shift'
    'key.sprint|key.keyboard.left.control'
    'key.drop|key.keyboard.q'
    'key.inventory|key.keyboard.e'
    'key.chat|key.keyboard.t'
    'key.playerlist|key.keyboard.tab'
    'key.pickItem|key.mouse.middle'
    'key.command|key.keyboard.slash'
    'key.socialInteractions|key.keyboard.p'
    'key.screenshot|key.keyboard.f2'
    'key.togglePerspective|key.keyboard.f5'
    'key.smoothCamera|key.keyboard.unknown'
    'key.fullscreen|key.keyboard.f11'
    'key.spectatorOutlines|key.keyboard.unknown'
    'key.swapOffhand|key.keyboard.f'
    'key.saveToolbarActivator|key.keyboard.c'
    'key.loadToolbarActivator|key.keyboard.unknown'
    'key.advancements|key.keyboard.l'
    'key.hotbar.1|key.keyboard.1'
    'key.hotbar.2|key.keyboard.2'
    'key.hotbar.3|key.keyboard.3'
    'key.hotbar.4|key.keyboard.4'
    'key.hotbar.5|key.keyboard.5'
    'key.hotbar.6|key.keyboard.6'
    'key.hotbar.7|key.keyboard.7'
    'key.hotbar.8|key.keyboard.8'
    'key.hotbar.9|key.keyboard.9'
    'key.puffish_skills.open|key.keyboard.k'
    'key.entityculling.toggle|key.keyboard.unknown'
    'key.modernfix.config|key.keyboard.unknown'
    'key.apotheosis.toggle_radial_mining|key.keyboard.o:CONTROL'
    'key.apotheosis.world_tiers_arent_real|key.keyboard.t:CONTROL'
    'info.structure_gel.building_tool.undo|key.keyboard.z:CONTROL'
    'info.structure_gel.building_tool.redo|key.keyboard.y:CONTROL'
    'key.structure_gel.open_building_tool_gui|key.keyboard.unknown'
    'key.corpse.death_history|key.keyboard.u'
    'key.industrialforegoing.backpack.desc|key.keyboard.unknown'
    'key.botania_corporea_request|key.keyboard.unknown'
    'iris.keybind.reload|key.keyboard.unknown'
    'iris.keybind.toggleShaders|key.keyboard.unknown'
    'iris.keybind.shaderPackSelection|key.keyboard.unknown'
    'key.push_to_talk|key.keyboard.unknown'
    'key.whisper|key.keyboard.unknown'
    'key.mute_microphone|key.keyboard.m'
    'key.disable_voice_chat|key.keyboard.n'
    'key.hide_icons|key.keyboard.unknown'
    'key.voice_chat|key.keyboard.unknown'
    'key.voice_chat_settings|key.keyboard.unknown'
    'key.voice_chat_group|key.keyboard.g'
    'key.voice_chat_toggle_recording|key.keyboard.unknown'
    'key.voice_chat_adjust_volumes|key.keyboard.unknown'
    'key.structurize.teleport|key.keyboard.unknown'
    'key.structurize.move_forward|key.keyboard.up'
    'key.structurize.move_back|key.keyboard.down'
    'key.structurize.move_left|key.keyboard.left'
    'key.structurize.move_right|key.keyboard.right'
    'key.structurize.move_up|key.keyboard.keypad.add'
    'key.structurize.move_down|key.keyboard.keypad.subtract'
    'key.structurize.rotate_cw|key.keyboard.right:SHIFT'
    'key.structurize.rotate_ccw|key.keyboard.left:SHIFT'
    'key.structurize.mirror|key.keyboard.m'
    'key.structurize.place|key.keyboard.enter'
    'key.occultism.backpack|key.keyboard.unknown'
    'key.occultism.storage_remote|key.keyboard.n'
    'key.occultism.familiar.greedy_familiar|key.keyboard.unknown'
    'key.occultism.familiar.otherworld_bird|key.keyboard.unknown'
    'key.occultism.familiar.bat_familiar|key.keyboard.unknown'
    'key.occultism.familiar.deer_familiar|key.keyboard.unknown'
    'key.occultism.familiar.cthulhu_familiar|key.keyboard.unknown'
    'key.occultism.familiar.devil_familiar|key.keyboard.unknown'
    'key.occultism.familiar.dragon_familiar|key.keyboard.unknown'
    'key.occultism.familiar.blacksmith_familiar|key.keyboard.unknown'
    'key.occultism.familiar.guardian_familiar|key.keyboard.unknown'
    'key.occultism.familiar.headless_familiar|key.keyboard.unknown'
    'key.occultism.familiar.chimera_familiar|key.keyboard.unknown'
    'key.occultism.familiar.goat_familiar|key.keyboard.unknown'
    'key.occultism.familiar.shub_niggurath_familiar|key.keyboard.unknown'
    'key.occultism.familiar.beholder_familiar|key.keyboard.unknown'
    'key.occultism.familiar.fairy_familiar|key.keyboard.unknown'
    'key.occultism.familiar.mummy_familiar|key.keyboard.unknown'
    'key.occultism.familiar.beaver_familiar|key.keyboard.unknown'
    'cos.key.opencosarmorinventory|key.keyboard.unknown'
    'key.ad_astra.toggle_suit_flight|key.keyboard.keypad.5'
    'key.ad_astra.open_radio|key.keyboard.r'
    'key.craftingtweaks.rotate|key.keyboard.unknown'
    'key.craftingtweaks.rotate_counter_clockwise|key.keyboard.unknown'
    'key.craftingtweaks.balance|key.keyboard.unknown'
    'key.craftingtweaks.spread|key.keyboard.unknown'
    'key.craftingtweaks.clear|key.keyboard.unknown'
    'key.craftingtweaks.force_clear|key.keyboard.unknown'
    'key.craftingtweaks.compress_one|key.keyboard.k:CONTROL'
    'key.craftingtweaks.compress_stack|key.keyboard.k'
    'key.craftingtweaks.compress_all|key.keyboard.k:SHIFT'
    'key.craftingtweaks.decompress_one|key.keyboard.unknown'
    'key.craftingtweaks.decompress_stack|key.keyboard.unknown'
    'key.craftingtweaks.decompress_all|key.keyboard.unknown'
    'key.craftingtweaks.refill_last|key.keyboard.tab:CONTROL'
    'key.craftingtweaks.refill_last_stack|key.keyboard.tab'
    'key.craftingtweaks.transfer_stack|key.keyboard.unknown'
    'key.trashslot.toggle|key.keyboard.t'
    'key.trashslot.toggle_lock|key.keyboard.unknown'
    'key.trashslot.delete|key.keyboard.delete'
    'key.trashslot.delete_all|key.keyboard.delete:SHIFT'
    'key.moreartifacts.eye.teleport|key.keyboard.unknown'
    'key.moreartifacts.dragon.eye|key.keyboard.unknown'
    'key.cardinal_sins.armourability|key.keyboard.v'
    'key.sophisticatedcore.sort|key.mouse.middle'
    'key.sophisticatedcore.transfer_to_storage|key.keyboard.left.bracket'
    'key.sophisticatedcore.transfer_to_inventory|key.keyboard.right.bracket'
    'placebo.toggleTrails|key.keyboard.keypad.9'
    'placebo.toggleWings|key.keyboard.keypad.8'
    'key.sophisticatedbackpacks.open_backpack|key.keyboard.b'
    'key.sophisticatedbackpacks.inventory_interaction|key.keyboard.c'
    'key.sophisticatedbackpacks.tool_swap|key.keyboard.unknown'
    'key.sophisticatedbackpacks.toggle_upgrade_4|key.keyboard.unknown'
    'key.sophisticatedbackpacks.toggle_upgrade_3|key.keyboard.unknown'
    'key.sophisticatedbackpacks.toggle_upgrade_2|key.keyboard.x:ALT'
    'key.sophisticatedbackpacks.toggle_upgrade_1|key.keyboard.z:ALT'
    'key.sophisticatedbackpacks.toggle_upgrade_5|key.keyboard.unknown'
    'key.cataclysm.ability|key.keyboard.keypad.3'
    'key.cataclysm.helmet_ability|key.keyboard.keypad.2'
    'key.cataclysm.chestplate_ability|key.keyboard.keypad.multiply'
    'key.cataclysm.boots_ability|key.keyboard.keypad.1'
    'dropoff.key.dump|key.keyboard.unknown'
    'dropoff.key.deposit|key.keyboard.unknown'
    'key.attributecore.open_attributes|key.keyboard.unknown'
    'key.rpgseteffects.open_sets|key.keyboard.unknown'
    'mod.chiselsandbits.keys.key.modded-tool.open|key.keyboard.unknown'
    'mod.chiselsandbits.keys.key.modded-tool.cycle.left|key.keyboard.unknown'
    'mod.chiselsandbits.keys.key.modded-tool.cycle.right|key.keyboard.unknown'
    'mod.chiselsandbits.keys.key.measuring-tape.reset|key.keyboard.r:CONTROL'
    'mod.chiselsandbits.keys.key.undo|key.keyboard.z:CONTROL'
    'mod.chiselsandbits.keys.key.redo|key.keyboard.y:CONTROL'
    'mod.chiselsandbits.keys.key.zoom|key.keyboard.unknown'
    'mod.chiselsandbits.keys.reset-caches|key.keyboard.unknown'
    'mod.chiselsandbits.keys.remove-from-clipboard|key.keyboard.d:SHIFT'
    'key.irons_spellbooks.spell_wheel|key.keyboard.r'
    'key.irons_spellbooks.spell_wheel_toggle|key.keyboard.keypad.divide'
    'key.irons_spellbooks.spellbook_cast|key.keyboard.v'
    'key.irons_spellbooks.spell_bar_modifier|key.keyboard.left.alt'
    'key.irons_spellbooks.spell_quick_cast_1|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_2|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_3|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_4|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_5|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_6|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_7|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_8|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_9|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_10|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_11|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_12|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_13|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_14|key.keyboard.unknown'
    'key.irons_spellbooks.spell_quick_cast_15|key.keyboard.unknown'
    'key.ponder.ponder|key.keyboard.w'
    'keybind.ironjetpacks.engine|key.keyboard.unknown'
    'keybind.ironjetpacks.hover|key.keyboard.h'
    'keybind.ironjetpacks.ascend|key.keyboard.unknown'
    'keybind.ironjetpacks.descend|key.keyboard.unknown'
    'keybind.ironjetpacks.increment_throttle|key.keyboard.period'
    'keybind.ironjetpacks.decrement_throttle|key.keyboard.comma'
    'key.shetiphiancore.tool.next|key.keyboard.page.up'
    'key.shetiphiancore.tool.previous|key.keyboard.page.down'
    'key.terramity.slam|key.keyboard.keypad.8'
    'key.terramity.dash_ability|key.keyboard.keypad.7'
    'key.terramity.double_jump|key.keyboard.space'
    'key.terramity.active_ability|key.keyboard.h'
    'key.terramity.armor_set_bonus_ability|key.keyboard.keypad.4'
    'key.terramity.fire_gun|key.mouse.right'
    'key.terramity.sword_swing_keybind|key.mouse.left'
    'key.curios.open.desc|key.keyboard.g'
    'key.origins.primary_active|key.keyboard.g'
    'key.origins.secondary_active|key.keyboard.unknown'
    'key.origins.view_origin|key.keyboard.o'
    'key.theabyss.ghost_attack|key.keyboard.x'
    'key.theabyss.ghost_fire_attack|key.keyboard.c'
    'key.theabyss.ghost_deactivate|key.keyboard.keypad.decimal'
    'key.theabyss.friendley_fire_a|key.keyboard.right'
    'key.theabyss.friendley_fire_b|key.keyboard.left'
    'key.theabyss.abil_debug|key.keyboard.down'
    'key.jei.toggleWildcardHideIngredient|key.mouse.right:CONTROL'
    'key.jei.toggleCheatMode|key.keyboard.unknown'
    'key.jei.transferRecipeBookmark|key.mouse.left:SHIFT'
    'key.jei.closeRecipeGui|key.keyboard.escape'
    'key.jei.nextCategory|key.keyboard.page.down:SHIFT'
    'key.jei.showUses2|key.mouse.right'
    'key.jei.maxTransferRecipeBookmark|key.mouse.left:CONTROL'
    'key.jei.cheatOneItem2|key.mouse.right'
    'key.jei.showRecipe|key.keyboard.r'
    'key.jei.previousCategory|key.keyboard.page.up:SHIFT'
    'key.jei.recipeBack|key.keyboard.backspace'
    'key.jei.nextPage|key.keyboard.unknown'
    'key.jei.cheatOneItem|key.mouse.left'
    'key.jei.toggleCheatModeConfigButton|key.mouse.left:CONTROL'
    'key.jei.toggleEditMode|key.keyboard.unknown'
    'key.jei.toggleHideIngredient|key.mouse.left:CONTROL'
    'key.jei.cheatItemStack2|key.mouse.middle'
    'key.jei.toggleBookmarkOverlay|key.keyboard.unknown'
    'key.jei.showRecipe2|key.mouse.left'
    'key.jei.copy.recipe.id|key.keyboard.unknown'
    'key.jei.nextRecipePage|key.keyboard.page.down'
    'key.jei.previousSearch|key.keyboard.up'
    'key.jei.cheatItemStack|key.mouse.left:SHIFT'
    'key.jei.nextSearch|key.keyboard.down'
    'key.jei.toggleOverlay|key.keyboard.o:CONTROL'
    'key.jei.showUses|key.keyboard.u'
    'key.jei.previousRecipePage|key.keyboard.page.up'
    'key.jei.previousPage|key.keyboard.unknown'
    'key.jei.bookmark|key.keyboard.a'
    'key.jei.clearSearchBar|key.mouse.right'
    'key.jei.focusSearch|key.keyboard.f:CONTROL'
    'key.mekanism.mode|key.keyboard.n'
    'key.mekanism.head_mode|key.keyboard.keypad.6'
    'key.mekanism.chest_mode|key.keyboard.keypad.add'
    'key.mekanism.legs_mode|key.keyboard.keypad.equal'
    'key.mekanism.feet_mode|key.keyboard.keypad.9'
    'key.mekanism.details|key.keyboard.left.shift'
    'key.mekanism.description|key.keyboard.n:SHIFT'
    'key.mekanism.module_tweaker|key.keyboard.backslash'
    'key.mekanism.key_boost|key.keyboard.left.control'
    'key.mekanism.key_hud|key.keyboard.h'
    'key.heracles.open_quests|key.keyboard.u'
    'key.adhooks.main_hand.launching|key.keyboard.unknown'
    'key.adhooks.main_hand.pulling|key.keyboard.unknown'
    'key.adhooks.main_hand.jumping|key.keyboard.unknown'
    'key.adhooks.main_hand.loosening|key.keyboard.unknown'
    'key.adhooks.main_hand.unhooking|key.keyboard.unknown'
    'key.adhooks.off_hand.launching|key.keyboard.unknown'
    'key.adhooks.off_hand.pulling|key.keyboard.unknown'
    'key.adhooks.off_hand.jumping|key.keyboard.unknown'
    'key.adhooks.off_hand.loosening|key.keyboard.unknown'
    'key.adhooks.off_hand.unhooking|key.keyboard.unknown'
    'key.cofh.mode_change_increment|key.keyboard.keypad.add'
    'key.cofh.mode_change_decrement|key.keyboard.keypad.subtract'
    'keybinds.bettercombat.feint|key.keyboard.unknown'
    'keybinds.bettercombat.toggle_mine_with_weapons|key.keyboard.unknown'
    'tetra.toolbelt.binding.access|key.keyboard.b'
    'tetra.toolbelt.binding.restock|key.keyboard.b:SHIFT'
    'tetra.toolbelt.binding.open|key.keyboard.b:ALT'
    'tetra.toolbelt.binding.secondary_use|key.keyboard.v:ALT'
    'key.ars_nouveau.open_book|key.keyboard.c'
    'key.ars_nouveau.selection_hud|key.keyboard.unknown'
    'key.ars_nouveau.next_slot|key.keyboard.x'
    'key.ars_nouveau.previous_slot|key.keyboard.z'
    'key.ars_nouveau.head_curio_hotkey|key.keyboard.unknown'
    'key.ars_nouveau.qc1|key.keyboard.unknown'
    'key.ars_nouveau.qc2|key.keyboard.unknown'
    'key.ars_nouveau.qc3|key.keyboard.unknown'
    'key.ars_nouveau.qc4|key.keyboard.unknown'
    'key.ars_nouveau.qc5|key.keyboard.unknown'
    'key.ars_nouveau.qc6|key.keyboard.unknown'
    'key.ars_nouveau.qc7|key.keyboard.unknown'
    'key.ars_nouveau.qc8|key.keyboard.unknown'
    'key.ars_nouveau.qc9|key.keyboard.unknown'
    'key.ars_nouveau.qc10|key.keyboard.unknown'
    'key.ars_nouveau.familiar_toggle|key.keyboard.unknown'
    'key.aether.open_accessories.desc|key.keyboard.i'
    'key.aether.gravitite_jump_ability.desc|key.keyboard.space'
    'key.aether.invisibility_toggle.desc|key.keyboard.keypad.0'
    'key.deep_aether.stratus_dash_ability.desc|key.keyboard.unknown'
    'key.deep_aether.slider_eye_ability|key.keyboard.left.alt'
    'key.relics.ability_list|key.keyboard.left.alt'
    'key.relics.research_relic|key.keyboard.left.shift'
    'railways.keyinfo.bogey_menu|key.keyboard.left.alt'
    'railways.keyinfo.cycle_menu|key.keyboard.left.alt'
    'key.celestial_artifacts.ability_key|key.keyboard.unknown'
    'key.deeperdarker.boost|key.keyboard.unknown'
    'key.deeperdarker.transmit|key.keyboard.unknown'
    'key.lightoverlay.enable_overlay|key.keyboard.f7'
    'artifacts.key.helium_flamingo.activate|key.keyboard.unknown'
    'artifacts.key.night_vision_goggles.toggle|key.keyboard.unknown'
    'artifacts.key.universal_attractor.toggle|key.keyboard.unknown'
    'key.findme.search|key.keyboard.unknown'
    'key.findme.pull_one|key.keyboard.keypad.0'
    'key.findme.pull_stack|key.keyboard.keypad.1'
    'key.liteminer.veinmine|key.keyboard.grave.accent'
    'key.mca.skin_library|key.keyboard.unknown'
    'key.boss_checklist.open_checklist|key.keyboard.unknown'
    'key.crust.configs|key.keyboard.unknown'
    'key.crust.buttons.fullheal|key.keyboard.unknown'
    'key.crust.buttons.cleareffects|key.keyboard.unknown'
    'key.crust.buttons.destroyonpointer|key.keyboard.unknown'
    'key.crust.buttons.killall|key.keyboard.unknown'
    'key.crust.buttons.netherportal|key.keyboard.unknown'
    'key.crust.buttons.endportal|key.keyboard.unknown'
    'key.crust.buttons.day|key.keyboard.unknown'
    'key.crust.buttons.night|key.keyboard.unknown'
    'key.crust.buttons.toggleday|key.keyboard.unknown'
    'key.crust.buttons.weatherclear|key.keyboard.unknown'
    'key.crust.buttons.weatherrain|key.keyboard.unknown'
    'key.crust.buttons.weatherstorm|key.keyboard.unknown'
    'key.crust.buttons.togglerain|key.keyboard.unknown'
    'key.crust.buttons.gamemode|key.keyboard.unknown'
    'key.crust.buttons.magnetmode|key.keyboard.unknown'
    'key.crust.buttons.godmode|key.keyboard.unknown'
    'key.crust.buttons.supervisionmode|key.keyboard.unknown'
    'key.crust.buttons.superspeedmode|key.keyboard.unknown'
    'key.crust.buttons.nopickupmode|key.keyboard.unknown'
    'key.crust.buttons.custom1|key.keyboard.unknown'
    'key.crust.buttons.custom2|key.keyboard.unknown'
    'key.crust.buttons.custom3|key.keyboard.unknown'
    'key.crust.buttons.custom4|key.keyboard.unknown'
    'key.crust.buttons.custom5|key.keyboard.unknown'
    'key.crust.buttons.custom6|key.keyboard.unknown'
    'key.crust.buttons.custom7|key.keyboard.unknown'
    'key.crust.buttons.custom8|key.keyboard.unknown'
    'key.crust.buttons.custom9|key.keyboard.unknown'
    'key.crust.buttons.custom10|key.keyboard.unknown'
    'key.crust.buttons.custom11|key.keyboard.unknown'
    'key.crust.buttons.custom12|key.keyboard.unknown'
    'key.crust.buttons.custom13|key.keyboard.unknown'
    'key.crust.buttons.custom14|key.keyboard.unknown'
    'key.crust.buttons.custom15|key.keyboard.unknown'
    'key.crust.buttons.custom16|key.keyboard.unknown'
    'key.justlevelingfork.open_aptitudes|key.keyboard.y'
    'key.lsp.open_ender_chest|key.keyboard.n'
    'create.keyinfo.toolmenu|key.keyboard.left.alt'
    'create.keyinfo.toolbelt|key.keyboard.left.alt'
    'create.keyinfo.rotate_menu|key.keyboard.unknown'
    'key.journeymap.zoom_in|key.keyboard.equal'
    'key.journeymap.zoom_out|key.keyboard.minus'
    'key.journeymap.minimap_type|key.keyboard.left.bracket'
    'key.journeymap.minimap_preset|key.keyboard.backslash'
    'key.journeymap.create_waypoint|key.keyboard.unknown'
    'key.journeymap.toggle_waypoints|key.keyboard.z'
    'key.journeymap.fullscreen_create_waypoint|key.keyboard.b'
    'key.journeymap.fullscreen_chat_position|key.keyboard.c'
    'key.journeymap.map_toggle_alt|key.keyboard.j'
    'key.journeymap.fullscreen_waypoints|key.keyboard.n'
    'key.journeymap.minimap_toggle_alt|key.keyboard.j:CONTROL'
    'key.journeymap.fullscreen_options|key.keyboard.o'
    'key.journeymap.fullscreen.north|key.keyboard.up'
    'key.journeymap.fullscreen.south|key.keyboard.down'
    'key.journeymap.fullscreen.east|key.keyboard.right'
    'key.journeymap.fullscreen.west|key.keyboard.left'
    'key.journeymap.fullscreen.disable_buttons|key.keyboard.h'
    'key.configured.open_mod_list|key.keyboard.unknown'
    'key.estrogen.dash|key.keyboard.unknown'
    'key.openManual|key.keyboard.f1'
    'key.nextDestination|key.keyboard.right.bracket'
    'key.prevDestination|key.keyboard.left.bracket'
    'key.unmountVehicle|key.keyboard.backslash'
    'key.drawMahoujin|key.keyboard.m'
    'key.changeMysticCode|key.keyboard.unknown'
    'key.settingsGUI|key.keyboard.period'
    'key.selectiveDisplacement|key.keyboard.unknown'
    'key.refinedstorage.focusSearchBar|key.keyboard.tab'
    'key.refinedstorage.clearGridCraftingMatrix|key.keyboard.x:CONTROL'
    'key.refinedstorage.openWirelessGrid|key.keyboard.unknown'
    'key.refinedstorage.openWirelessFluidGrid|key.keyboard.unknown'
    'key.refinedstorage.openWirelessCraftingMonitor|key.keyboard.unknown'
    'key.refinedstorage.openPortableGrid|key.keyboard.unknown'
    'key.jade.config|key.keyboard.keypad.0'
    'key.jade.show_overlay|key.keyboard.keypad.1'
    'key.jade.toggle_liquid|key.keyboard.keypad.2'
    'key.jade.show_recipes|key.keyboard.keypad.3'
    'key.jade.show_uses|key.keyboard.keypad.4'
    'key.jade.narrate|key.keyboard.keypad.5'
    'key.jade.show_details|key.keyboard.left.shift'
    'quark.keybind.autorun|key.keyboard.unknown'
    'quark.keybind.back|key.mouse.4'
    'quark.keybind.camera_mode|key.keyboard.f12'
    'quark.keybind.transfer_insert|key.keyboard.unknown'
    'quark.keybind.transfer_extract|key.keyboard.unknown'
    'quark.keybind.shift_lock|key.keyboard.unknown'
    'quark.emote.no|key.keyboard.unknown'
    'quark.emote.yes|key.keyboard.unknown'
    'quark.emote.wave|key.keyboard.unknown'
    'quark.emote.salute|key.keyboard.unknown'
    'quark.emote.cheer|key.keyboard.unknown'
    'quark.emote.clap|key.keyboard.unknown'
    'quark.emote.think|key.keyboard.unknown'
    'quark.emote.point|key.keyboard.unknown'
    'quark.emote.shrug|key.keyboard.unknown'
    'quark.emote.headbang|key.keyboard.unknown'
    'quark.emote.weep|key.keyboard.unknown'
    'quark.emote.facepalm|key.keyboard.unknown'
    'quark.keybind.patreon_emote.dance|key.keyboard.unknown'
    'quark.keybind.patreon_emote.tpose|key.keyboard.unknown'
    'quark.keybind.patreon_emote.dab|key.keyboard.unknown'
    'quark.keybind.patreon_emote.jet|key.keyboard.unknown'
    'quark.keybind.patreon_emote.exorcist|key.keyboard.unknown'
    'quark.keybind.patreon_emote.zombie|key.keyboard.unknown'
    'quark.keybind.change_hotbar|key.keyboard.unknown'
    'quark.keybind.sort_player|key.keyboard.unknown'
    'quark.keybind.sort_container|key.keyboard.unknown'
    'quark.keybind.lock_rotation|key.keyboard.unknown'
    'quark.keybind.narrator_readout|key.keyboard.unknown'
    'quark.keybind.narrator_full_readout|key.keyboard.unknown'
    'quark.keybind.variant_selector|key.keyboard.unknown'
    'supplementaries.keybind.quiver|key.keyboard.unknown'
    'key.enderchests.open.bag|key.keyboard.unknown'
    'key.enderchests.open.pouch|key.keyboard.unknown'
    'key.inventoryhud.toggle|key.keyboard.i'
    'key.inventoryhud.openconfig|key.keyboard.unknown'
    'key.inventoryhud.togglepot|key.keyboard.unknown'
    'key.inventoryhud.togglearm|key.keyboard.unknown'
    'key.inventoryhud.toggleall|key.keyboard.unknown'
    'footwork.trance|key.keyboard.unknown'
    'key.l2mods.up|key.keyboard.up'
    'key.l2mods.down|key.keyboard.down'
    'key.l2mods.left|key.keyboard.left'
    'key.l2mods.right|key.keyboard.right'
    'key.l2mods.swap|key.keyboard.unknown'
    'key.refinedstorageaddons.openWirelessCraftingGrid|key.keyboard.g:CONTROL'
    'gui.xaero_pac_key_open_menu|key.keyboard.apostrophe'
)

# -----------------------------------------------------------------------------
# OVERRIDES - the curated keybind anchor. name -> final binding.
# Grouped by theme; see keybind-map.md for the full rationale table.
# -----------------------------------------------------------------------------
$Overrides = [ordered]@{
    # --- class/race powers (Origins). G stays EXCLUSIVE to the primary power:
    #     no modifier variants of G anywhere, or sprint/sneak-casting breaks.
    'key.origins.secondary_active'                = 'key.keyboard.caps.lock'    # was UNBOUND; gates Demi-God/Fallen Angel/Kirin/Ryu secondary powers
    'key.curios.open.desc'                        = 'key.keyboard.i:ALT'        # was G (fought primary power); curios GUI also reachable from inventory
    'key.refinedstorageaddons.openWirelessCraftingGrid' = 'key.keyboard.f7:CONTROL' # was CTRL+G (ate G while holding sprint)

    # --- spellcasting protection (ISS cast V / wheel R / ALT bar; Ars C/X/Z)
    'key.cardinal_sins.armourability'             = 'key.keyboard.p'            # was V (fought ISS cast); P freed from socialInteractions
    'key.socialInteractions'                      = 'key.keyboard.insert'       # vanilla social screen; niche, keep reachable
    'mod.chiselsandbits.keys.key.measuring-tape.reset' = 'key.keyboard.r:ALT'   # was CTRL+R (ate spell wheel while holding sprint)
    'key.ad_astra.open_radio'                     = 'key.keyboard.unknown'      # was R (fought spell wheel); music player, rebind if wanted
    'key.deep_aether.slider_eye_ability'          = 'key.keyboard.keypad.0:CONTROL' # was bare ALT (fought ISS spell-bar hold)
    'key.irons_spellbooks.spell_wheel_toggle'     = 'key.keyboard.keypad.divide' # explicit anchor (repo/distro had drifted)

    # --- tetra toolbelt family: off B (backpack wins B), whole family moves as
    #     a unit to ; preserving tetra's access/restock/open/secondary shape
    'tetra.toolbelt.binding.access'               = 'key.keyboard.semicolon'
    'tetra.toolbelt.binding.restock'              = 'key.keyboard.semicolon:SHIFT'
    'tetra.toolbelt.binding.open'                 = 'key.keyboard.semicolon:ALT'
    'tetra.toolbelt.binding.secondary_use'        = 'key.keyboard.semicolon:CONTROL' # was ALT+V - ate ISS cast during spell-bar hold

    # --- voice chat cluster -> F4 (M freed for Mahou Tsukai, N for Mekanism)
    'key.mute_microphone'                         = 'key.keyboard.f4'
    'key.voice_chat_group'                        = 'key.keyboard.f4:SHIFT'
    'key.voice_chat'                              = 'key.keyboard.f4:CONTROL'   # main VC GUI, was unbound (settings live inside it)
    'key.disable_voice_chat'                      = 'key.keyboard.keypad.enter' # rare kill-switch; NEVER alt+f4
    'key.occultism.storage_remote'                = 'key.keyboard.n:ALT'        # was N (fought Mekanism item mode)
    'key.lsp.open_ender_chest'                    = 'key.keyboard.end'          # was N; END = ender chest (Lovely Pieces)

    # --- movement/combat actives
    'key.terramity.dash_ability'                  = 'key.mouse.4'               # premium dash on side button (was keypad.7)
    'key.terramity.slam'                          = 'key.mouse.5'               # movement pair with dash (was keypad.8)
    'quark.keybind.back'                          = 'key.keyboard.unknown'      # GUI-history nicety; frees mouse.4
    'key.estrogen.dash'                           = 'key.keyboard.keypad.8'     # accessory-gated; was unbound
    'footwork.trance'                             = 'key.keyboard.f6'           # was unbound

    # --- gear/HUD toggles -> F8 family (frees H for Terramity active ability)
    'keybind.ironjetpacks.engine'                 = 'key.keyboard.f8'           # was UNBOUND - gameplay-gating (no engine = no flight)
    'keybind.ironjetpacks.hover'                  = 'key.keyboard.f8:SHIFT'     # was H (fought Terramity active)
    'key.mekanism.key_hud'                        = 'key.keyboard.f8:CONTROL'   # was H
    'key.inventoryhud.toggle'                     = 'key.keyboard.f8:ALT'       # was I (fought Aether accessories)
    'cos.key.opencosarmorinventory'               = 'key.keyboard.f7:SHIFT'     # cosmetic wardrobe, was unbound (alt+f10 avoided: NVIDIA overlay)

    # --- JourneyMap: J family + F10 minimap family
    'key.journeymap.minimap_toggle_alt'           = 'key.keyboard.f10'          # was CTRL+J (ate map-open while holding sprint)
    'key.journeymap.minimap_type'                 = 'key.keyboard.f10:SHIFT'    # was [ (RFTools destinations keep brackets)
    'key.journeymap.minimap_preset'               = 'key.keyboard.f10:CONTROL'  # was \ (Mek module tweaker keeps \)
    'key.journeymap.create_waypoint'              = 'key.keyboard.j:SHIFT'      # was unbound
    'key.journeymap.toggle_waypoints'             = 'key.keyboard.j:ALT'        # was Z (ate Ars previous-slot)

    # --- Jade -> F9 family (frees keypad 0-5 for Cataclysm/Ad Astra/aether abilities)
    'key.jade.show_overlay'                       = 'key.keyboard.f9'
    'key.jade.toggle_liquid'                      = 'key.keyboard.f9:SHIFT'
    'key.jade.narrate'                            = 'key.keyboard.f9:CONTROL'   # accessibility - keep bound
    'key.jade.config'                             = 'key.keyboard.unknown'
    'key.jade.show_recipes'                       = 'key.keyboard.unknown'      # JEI R in GUIs covers this
    'key.jade.show_uses'                          = 'key.keyboard.unknown'
    'key.mekanism.chest_mode'                     = 'key.keyboard.keypad.7'     # was keypad.add (fought CoFH mode increment)
    'placebo.toggleTrails'                        = 'key.keyboard.keypad.9:ALT' # cosmetic; frees keypad.9 for Mek feet mode
    'placebo.toggleWings'                         = 'key.keyboard.keypad.8:ALT' # cosmetic; frees keypad.8

    # --- F6 utility family
    'key.corpse.death_history'                    = 'key.keyboard.f6:SHIFT'     # was U (fought Heracles quests)
    'key.changeMysticCode'                        = 'key.keyboard.f6:CONTROL'   # Mahou Tsukai, was unbound
    'key.settingsGUI'                             = 'key.keyboard.f6:ALT'       # Mahou settings, was . (jetpack throttle keeps ./,)

    # --- character-sheet cluster on Y (aptitudes stay plain Y)
    'key.attributecore.open_attributes'           = 'key.keyboard.y:SHIFT'      # was unbound
    'key.rpgseteffects.open_sets'                 = 'key.keyboard.y:ALT'        # Class Artifacts set bonuses, was unbound

    # --- misc singles
    'key.boss_checklist.open_checklist'           = 'key.keyboard.home'         # was unbound; boss-heavy pack
    'key.openManual'                              = 'key.keyboard.f1:SHIFT'     # RFTools manual; plain F1 is vanilla hide-GUI (hardcoded)
    'key.unmountVehicle'                          = 'key.keyboard.backslash:SHIFT' # RFTools Builder; frees \ for Mek tweaker
    'key.theabyss.abil_debug'                     = 'key.keyboard.unknown'      # debug key
    'info.structure_gel.building_tool.undo'       = 'key.keyboard.unknown'      # dev/creative tool; C&B keeps CTRL+Z
    'info.structure_gel.building_tool.redo'       = 'key.keyboard.unknown'
    'key.loadToolbarActivator'                    = 'key.keyboard.x'            # restore vanilla default (creative-GUI context only)
}

# -----------------------------------------------------------------------------
# ALLOWED COEXISTENCE GROUPS - intentional multi-bind stacks. Key = 'input|MOD',
# value = the EXACT sorted set of mapping names allowed to share it.
# Categories: (v)=vanilla, (gui)=GUI-screen-context key, (hold)=hold-overlay,
# (ovl)=by-design overlay on a vanilla key, (ctx)=context-exclusive state.
# -----------------------------------------------------------------------------
$AllowedCoexist = @{
    'key.mouse.left|NONE'     = @('key.attack','key.jei.cheatOneItem','key.jei.showRecipe2','key.terramity.sword_swing_keybind')
    'key.mouse.right|NONE'    = @('key.jei.cheatOneItem2','key.jei.clearSearchBar','key.jei.showUses2','key.terramity.fire_gun','key.use')
    'key.mouse.middle|NONE'   = @('key.jei.cheatItemStack2','key.pickItem','key.sophisticatedcore.sort')
    'key.mouse.left|SHIFT'    = @('key.jei.cheatItemStack','key.jei.transferRecipeBookmark')
    'key.mouse.left|CONTROL'  = @('key.jei.maxTransferRecipeBookmark','key.jei.toggleCheatModeConfigButton','key.jei.toggleHideIngredient')
    'key.keyboard.space|NONE' = @('key.aether.gravitite_jump_ability.desc','key.jump','key.terramity.double_jump')
    'key.keyboard.left.shift|NONE'   = @('key.jade.show_details','key.mekanism.details','key.relics.research_relic','key.sneak')
    'key.keyboard.left.control|NONE' = @('key.mekanism.key_boost','key.sprint')
    'key.keyboard.left.alt|NONE'     = @('create.keyinfo.toolbelt','create.keyinfo.toolmenu','key.irons_spellbooks.spell_bar_modifier','key.relics.ability_list','railways.keyinfo.bogey_menu','railways.keyinfo.cycle_menu')
    'key.keyboard.w|NONE'     = @('key.forward','key.ponder.ponder')
    'key.keyboard.a|NONE'     = @('key.jei.bookmark','key.left')
    'key.keyboard.t|NONE'     = @('key.chat','key.trashslot.toggle')
    'key.keyboard.tab|NONE'   = @('key.craftingtweaks.refill_last_stack','key.playerlist','key.refinedstorage.focusSearchBar')
    'key.keyboard.c|NONE'     = @('key.ars_nouveau.open_book','key.journeymap.fullscreen_chat_position','key.saveToolbarActivator','key.sophisticatedbackpacks.inventory_interaction','key.theabyss.ghost_fire_attack')
    'key.keyboard.x|NONE'     = @('key.ars_nouveau.next_slot','key.loadToolbarActivator','key.theabyss.ghost_attack')
    'key.keyboard.r|NONE'     = @('key.irons_spellbooks.spell_wheel','key.jei.showRecipe')
    'key.keyboard.u|NONE'     = @('key.heracles.open_quests','key.jei.showUses')
    'key.keyboard.k|NONE'     = @('key.craftingtweaks.compress_stack','key.puffish_skills.open')
    'key.keyboard.o|NONE'     = @('key.journeymap.fullscreen_options','key.origins.view_origin')
    'key.keyboard.o|CONTROL'  = @('key.apotheosis.toggle_radial_mining','key.jei.toggleOverlay')
    'key.keyboard.b|NONE'     = @('key.journeymap.fullscreen_create_waypoint','key.sophisticatedbackpacks.open_backpack')
    'key.keyboard.h|NONE'     = @('key.journeymap.fullscreen.disable_buttons','key.terramity.active_ability')
    'key.keyboard.n|NONE'     = @('key.journeymap.fullscreen_waypoints','key.mekanism.mode')
    'key.keyboard.m|NONE'     = @('key.drawMahoujin','key.structurize.mirror')
    'key.keyboard.up|NONE'    = @('key.jei.previousSearch','key.journeymap.fullscreen.north','key.l2mods.up','key.structurize.move_forward')
    'key.keyboard.down|NONE'  = @('key.jei.nextSearch','key.journeymap.fullscreen.south','key.l2mods.down','key.structurize.move_back')
    'key.keyboard.left|NONE'  = @('key.journeymap.fullscreen.west','key.l2mods.left','key.structurize.move_left','key.theabyss.friendley_fire_b')
    'key.keyboard.right|NONE' = @('key.journeymap.fullscreen.east','key.l2mods.right','key.structurize.move_right','key.theabyss.friendley_fire_a')
    'key.keyboard.page.up|NONE'   = @('key.jei.previousRecipePage','key.shetiphiancore.tool.next')
    'key.keyboard.page.down|NONE' = @('key.jei.nextRecipePage','key.shetiphiancore.tool.previous')
    'key.keyboard.left.bracket|NONE'  = @('key.prevDestination','key.sophisticatedcore.transfer_to_storage')
    'key.keyboard.right.bracket|NONE' = @('key.nextDestination','key.sophisticatedcore.transfer_to_inventory')
    'key.keyboard.keypad.0|NONE'   = @('key.aether.invisibility_toggle.desc','key.findme.pull_one')
    'key.keyboard.keypad.1|NONE'   = @('key.cataclysm.boots_ability','key.findme.pull_stack')
    'key.keyboard.keypad.add|NONE'      = @('key.cofh.mode_change_increment','key.structurize.move_up')
    'key.keyboard.keypad.subtract|NONE' = @('key.cofh.mode_change_decrement','key.structurize.move_down')
}

# -----------------------------------------------------------------------------
# Non-key options.txt template for config/defaultoptions/options.txt (first-run
# seed: graphics/sound/server defaults; key_ lines are appended from the map).
# Captured from the shipped pack options 2026-08-27.
# -----------------------------------------------------------------------------
$OptionsHeader = @'
version:3465
autoJump:true
operatorItemsTab:false
autoSuggestions:true
chatColors:true
chatLinks:true
chatLinksPrompt:true
enableVsync:true
entityShadows:true
forceUnicodeFont:false
discrete_mouse_scroll:false
invertYMouse:false
realmsNotifications:true
reducedDebugInfo:false
showSubtitles:false
directionalAudio:false
touchscreen:false
fullscreen:false
bobView:true
toggleCrouch:false
toggleSprint:false
darkMojangStudiosBackground:false
hideLightningFlashes:false
mouseSensitivity:0.5
fov:0.0
screenEffectScale:1.0
fovEffectScale:1.0
darknessEffectScale:1.0
glintSpeed:0.5
glintStrength:0.75
damageTiltStrength:1.0
highContrast:false
gamma:0.5
renderDistance:12
simulationDistance:12
entityDistanceScaling:1.0
guiScale:4
particles:0
maxFps:120
graphicsMode:1
ao:true
prioritizeChunkUpdates:0
biomeBlendRadius:2
renderClouds:"true"
resourcePacks:[]
incompatibleResourcePacks:[]
lastServer:iridescentcraft.sereneblossom.gay
lang:en_us
soundDevice:""
chatVisibility:0
chatOpacity:1.0
chatLineSpacing:0.0
textBackgroundOpacity:0.5
backgroundForChatOnly:true
hideServerAddress:false
advancedItemTooltips:true
pauseOnLostFocus:true
overrideWidth:0
overrideHeight:0
chatHeightFocused:1.0
chatDelay:0.0
chatHeightUnfocused:0.4375
chatScale:1.0
chatWidth:1.0
notificationDisplayTime:1.0
mipmapLevels:4
useNativeTransport:true
mainHand:"right"
attackIndicator:1
narrator:0
tutorialStep:none
mouseWheelSensitivity:1.0
rawMouseInput:true
glDebugVerbosity:1
skipMultiplayerWarning:true
skipRealms32bitWarning:false
hideMatchedNames:true
joinedFirstServer:true
hideBundleTutorial:false
syncChunkWrites:true
showAutosaveIndicator:true
allowServerListing:true
onlyShowSecureChat:false
panoramaScrollSpeed:1.0
telemetryOptInExtra:false
onboardAccessibility:false
'@

$OptionsFooter = @'
soundCategory_master:1.0
soundCategory_music:1.0
soundCategory_record:1.0
soundCategory_weather:1.0
soundCategory_block:1.0
soundCategory_hostile:1.0
soundCategory_neutral:1.0
soundCategory_player:1.0
soundCategory_ambient:1.0
soundCategory_voice:1.0
modelPart_cape:true
modelPart_jacket:true
modelPart_left_sleeve:true
modelPart_right_sleeve:true
modelPart_left_pants_leg:true
modelPart_right_pants_leg:true
modelPart_hat:true
'@

# =============================================================================
# Build the final map
# =============================================================================
$final = [ordered]@{}
foreach ($row in $Baseline) {
    $parts = $row.Split('|', 2)
    if ($parts.Count -ne 2) { throw "Malformed baseline row: $row" }
    $final[$parts[0]] = $parts[1]
}

$unknownOverrides = @()
foreach ($name in $Overrides.Keys) {
    if (-not $final.Contains($name)) { $unknownOverrides += $name; continue }
    $final[$name] = $Overrides[$name]
}
if ($unknownOverrides.Count -gt 0) {
    Write-Host "[gen_keybinds] FATAL: override(s) name keys not in baseline (typo or removed mod):" -ForegroundColor Red
    $unknownOverrides | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

# =============================================================================
# Conflict audit
# =============================================================================
$groups = @{}
foreach ($name in $final.Keys) {
    $binding = $final[$name]
    $bp = $binding.Split(':')
    $inputName = $bp[0]
    $modifier = if ($bp.Count -gt 1) { $bp[1] } else { 'NONE' }
    if ($inputName -eq 'key.keyboard.unknown') { continue }
    $gk = "$inputName|$modifier"
    if (-not $groups.ContainsKey($gk)) { $groups[$gk] = New-Object System.Collections.Generic.List[string] }
    $groups[$gk].Add($name)
}

$violations = @()
foreach ($gk in ($groups.Keys | Sort-Object)) {
    $members = @($groups[$gk] | Sort-Object)
    if ($members.Count -lt 2) { continue }
    $expected = $AllowedCoexist[$gk]
    if ($null -eq $expected) {
        $violations += "UNLISTED collision on ${gk}: $($members -join ', ')"
    } else {
        $exp = @($expected | Sort-Object)
        if (($members -join ';') -ne ($exp -join ';')) {
            $violations += "Group ${gk} changed: have [$($members -join ', ')] expected [$($exp -join ', ')]"
        }
    }
}
# Also flag allowlist entries that no longer have a group (stale allowlist)
foreach ($gk in $AllowedCoexist.Keys) {
    if (-not $groups.ContainsKey($gk) -or $groups[$gk].Count -lt 2) {
        $violations += "Stale allowlist entry (no such collision anymore): $gk"
    }
}

if ($violations.Count -gt 0) {
    Write-Host "[gen_keybinds] CONFLICT AUDIT FAILED:" -ForegroundColor Red
    $violations | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "[gen_keybinds] conflict audit OK: $($final.Count) mappings, $(@($groups.Keys | Where-Object { $groups[$_].Count -ge 2 }).Count) intentional coexistence groups, 0 unlisted collisions." -ForegroundColor Green

# =============================================================================
# Emit
# =============================================================================
function Get-KeyLines {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($name in $final.Keys) {
        $binding = $final[$name]
        $bp = $binding.Split(':')
        if ($bp.Count -gt 1 -and $bp[1] -eq 'NONE') { $binding = $bp[0] }
        $lines.Add("key_${name}:$binding")
    }
    return $lines
}

function Write-Utf8NoBomLf {
    param([string]$Path, [string]$Text)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, ($Text -replace "`r`n", "`n"), $enc)
}

$keyLines = Get-KeyLines
$keyBlock = ($keyLines -join "`n") + "`n"

# defaultoptions keybindings.txt (x2): key lines only
$keybindingsTxt = $keyBlock

# defaultoptions options.txt first-run seed (x2): header + keys + footer
$optionsSeed = ($OptionsHeader -replace "`r`n", "`n").TrimEnd("`n") + "`n" + $keyBlock + ($OptionsFooter -replace "`r`n", "`n").TrimEnd("`n") + "`n"

# distribution/client/options.txt: preserve non-key lines, splice curated keys
$distOptionsPath = Join-Path $mcRoot 'distribution\client\options.txt'
$distLines = [System.IO.File]::ReadAllLines($distOptionsPath)
$out = New-Object System.Collections.Generic.List[string]
$spliced = $false
foreach ($l in $distLines) {
    if ($l.StartsWith('key_')) {
        if (-not $spliced) { foreach ($kl in $keyLines) { $out.Add($kl) }; $spliced = $true }
        continue
    }
    $out.Add($l)
}
if (-not $spliced) { throw "No key_ lines found in $distOptionsPath - refusing to splice" }
$distOptionsText = ($out -join "`n") + "`n"

$targets = @(
    @{ Path = Join-Path $mcRoot 'config\defaultoptions\keybindings.txt';                       Text = $keybindingsTxt }
    @{ Path = Join-Path $mcRoot 'distribution\client\config\defaultoptions\keybindings.txt';  Text = $keybindingsTxt }
    @{ Path = Join-Path $mcRoot 'config\defaultoptions\options.txt';                          Text = $optionsSeed }
    @{ Path = Join-Path $mcRoot 'distribution\client\config\defaultoptions\options.txt';      Text = $optionsSeed }
    @{ Path = $distOptionsPath;                                                               Text = $distOptionsText }
)

$stale = @()
foreach ($t in $targets) {
    if ($Check) {
        $cur = ''
        if (Test-Path -LiteralPath $t.Path) { $cur = [System.IO.File]::ReadAllText($t.Path) -replace "`r`n", "`n" }
        if ($cur -ne ($t.Text -replace "`r`n", "`n")) {
            $stale += $t.Path
            Write-Host "  [STALE] $($t.Path)" -ForegroundColor Red
        } else {
            Write-Host "  [ok]    $($t.Path)" -ForegroundColor Green
        }
    } else {
        Write-Utf8NoBomLf -Path $t.Path -Text $t.Text
        Write-Host "  -> $($t.Path)" -ForegroundColor Cyan
    }
}

if ($Check) {
    if ($stale.Count -gt 0) { Write-Host "[gen_keybinds] STALE output(s) - re-run without -Check and commit." -ForegroundColor Red; exit 1 }
    Write-Host "[gen_keybinds] all outputs fresh." -ForegroundColor Green
    exit 0
}

$changed = @($Overrides.Keys).Count
Write-Host "[gen_keybinds] wrote $($targets.Count) files. $($final.Count) mappings, $changed curated overrides." -ForegroundColor Green
exit 0
