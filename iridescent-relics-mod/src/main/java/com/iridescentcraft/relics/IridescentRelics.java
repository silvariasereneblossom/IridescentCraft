package com.iridescentcraft.relics;

import com.iridescentcraft.relics.item.RemnantRelicItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Iridescent Relics -- pack-native relic system, now built as an ADDON of the Relics
 * framework (sskirillss / Octo-Studios, modId {@code relics}). Each relic is its own class
 * extending the framework {@link it.hurts.sskirillss.relics.items.relics.base.RelicItem},
 * authored through the framework's leveling / ability / style data DSL. The Remnant relic is
 * the proven template the rest of the roster copies.
 *
 * <p>Slots are still assigned by the {@code curios:<slot>} item tag (see
 * {@code data/curios/tags/items/charm.json}).
 */
@Mod(IridescentRelics.MODID)
public class IridescentRelics {

    public static final String MODID = "iridescent_relics";

    public static final DeferredRegister<Item> ITEMS =
        DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
    public static final DeferredRegister<CreativeModeTab> TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

    // ===== Relics =====
    // Relic of the Remnant (Ancient Remnant / cursed_pyramid boss): charm slot, EPIC.
    // +max health + ISS spell power, expressed as framework leveling abilities. spell_power
    // resolves at runtime (soft dep on Iron's Spellbooks); see RemnantRelicItem.
    public static final RegistryObject<Item> REMNANT_RELIC = ITEMS.register("remnant_relic",
        () -> new RemnantRelicItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // ===== Creative tab =====
    public static final RegistryObject<CreativeModeTab> RELICS_TAB = TABS.register("relics",
        () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup." + MODID))
            .icon(() -> new ItemStack(REMNANT_RELIC.get()))
            .displayItems((params, output) -> ITEMS.getEntries().forEach(e -> output.accept(e.get())))
            .build());

    public IridescentRelics() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        ITEMS.register(modBus);
        TABS.register(modBus);
    }
}
