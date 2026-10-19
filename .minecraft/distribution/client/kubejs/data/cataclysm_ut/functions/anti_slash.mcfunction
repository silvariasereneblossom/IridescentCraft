# IridescentCraft override (2026-10-18; decision sheet 2026-10-11 row G16, the recommended trim).
# The Cataclysm Apotheosis add-on (cataclysm_ut) wrote this for another version of Cataclysm: its
# functions name the entity cataclysm:old_netherite_monstrosity, which the installed Cataclysm does not
# register, so this function never loaded and none of the add-on's boss logic has ever run in the pack.
# This empty copy keeps it that way without an ERROR line at every boot. Deleting the copy brings the
# line back and changes nothing else. Its other data (Attributizer stats, damage types, items) is untouched.
