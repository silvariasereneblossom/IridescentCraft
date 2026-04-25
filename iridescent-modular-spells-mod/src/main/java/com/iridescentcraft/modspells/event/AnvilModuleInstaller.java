package com.iridescentcraft.modspells.event;

import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.event.AnvilUpdateEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import java.util.HashMap;
import java.util.Map;

/**
 * Anvil-event handler that lets players install or swap module materials
 * on a {@link ModularSpellBookItem}.
 *
 * <p>Pattern: anvil left-slot = modular book, right-slot = a material
 * item (leather / iron_ingot / diamond / etc). The handler decides
 * which slot the material targets based on a static material->slot
 * mapping and produces a result stack with that slot's NBT set.
 *
 * <p>Phase 1 supports cover slot only (leather/iron/diamond). Pages
 * slot install via anvil with a different material set comes in
 * Phase 2 once we have more materials authored.
 *
 * <p>XP cost is fixed at 5 levels per module install for Phase 1.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE)
public class AnvilModuleInstaller {

    /** Material-item -> our material-id-string mapping. */
    private static final Map<net.minecraft.world.item.Item, String> COVER_MATERIALS = new HashMap<>();
    static {
        COVER_MATERIALS.put(Items.LEATHER,       "leather");
        COVER_MATERIALS.put(Items.IRON_INGOT,    "iron");
        COVER_MATERIALS.put(Items.DIAMOND,       "diamond");
    }

    private static final int XP_COST = 5;

    @SubscribeEvent
    public static void onAnvilUpdate(AnvilUpdateEvent event) {
        ItemStack base  = event.getLeft();
        ItemStack mat   = event.getRight();

        if (!(base.getItem() instanceof ModularSpellBookItem)) return;
        if (mat.isEmpty()) return;

        // Cover slot: only material set we ship in Phase 1
        String coverMaterial = COVER_MATERIALS.get(mat.getItem());
        if (coverMaterial != null) {
            // Already same material in cover slot? No-op (don't burn xp).
            String existing = ModularSpellBookItem.getSlotMaterial(base, ModularSpellBookItem.SLOT_COVER);
            if (coverMaterial.equals(existing)) {
                event.setOutput(ItemStack.EMPTY);
                return;
            }
            ItemStack result = base.copy();
            ModularSpellBookItem.setSlotMaterial(
                    result, ModularSpellBookItem.SLOT_COVER, coverMaterial);
            event.setOutput(result);
            event.setCost(XP_COST);
            event.setMaterialCost(1);
            IridescentModularSpells.LOGGER.debug(
                    "[modspells/anvil] preview cover->{} for {}",
                    coverMaterial, base.getDisplayName().getString());
        }
    }
}
