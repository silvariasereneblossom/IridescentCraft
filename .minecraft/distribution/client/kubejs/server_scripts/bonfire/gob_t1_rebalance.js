// =============================================================================
// kubejs/server_scripts/bonfire/gob_t1_rebalance.js
//
// Makes Gob, King of Gnomes (Terramity) summonable at T1 -- he's the #46
// boss-compass / bonfire MVP target, but Terramity gates him behind a DIAMOND
// (T3): you barter a diamond to a gnome for a gnome hat, then right-click the
// golden gnome statue with the hat to summon him.
//
// Two T1 adjustments (both pure KubeJS -- no jar surgery):
//
//   1. Emerald craft path for the gnome hat. The diamond->hat barter is
//      HARDCODED in Terramity's Java (guidebook: "Give any gnome a diamond,
//      and it'll give you their hat") -- there's no data table to edit, and
//      the hat has no from-scratch recipe (only a red->blue recolor). So we
//      add a crafting recipe priced in emerald instead. The hardcoded diamond
//      barter still works; this just gives T1 players an emerald path.
//      red_gnome_hat_helmet is the base hat; right-click the golden statue
//      with it to summon Gob.
//
//   2. Golden gnome statue mineable with iron (was tagged needs_diamond_tool).
//      NOTE: the summon is right-click, NOT break -- this is for collecting /
//      relocating the statue and for T1 tool-tier consistency, not the summon.
//
// Tweak freely: change the recipe ingredients below, or the target tier tag.
// =============================================================================

ServerEvents.recipes(event => {
    // Emerald-priced gnome hat (T1 path to the Gob summon item).
    event.shapeless("terramity:red_gnome_hat_helmet", [
        "minecraft:emerald",
        "minecraft:leather",
    ]).id("kubejs:gob_t1_emerald_gnome_hat")
})

ServerEvents.tags("block", event => {
    // Iron-breakable golden gnome statue (was diamond-tier).
    event.remove("minecraft:needs_diamond_tool", "terramity:golden_gnome_statue")
    event.add("minecraft:needs_iron_tool", "terramity:golden_gnome_statue")
})

console.log("[iridescent/gob_t1] emerald gnome-hat recipe + iron-breakable golden gnome statue loaded")
