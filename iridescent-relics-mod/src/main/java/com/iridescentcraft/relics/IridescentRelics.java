package com.iridescentcraft.relics;

import com.iridescentcraft.relics.item.CursedSigilPrideItem;
import com.iridescentcraft.relics.item.DragonsEyeItem;
import com.iridescentcraft.relics.item.FrostmawHeartItem;
import com.iridescentcraft.relics.item.IronheartCogItem;
import com.iridescentcraft.relics.block.RelicBrokerStandBlock;
import com.iridescentcraft.relics.item.LeviathansPearlItem;
import com.iridescentcraft.relics.item.PhylacteryShardItem;
import com.iridescentcraft.relics.item.RelicEssenceItem;
import com.iridescentcraft.relics.item.RemnantRelicItem;
import com.iridescentcraft.relics.item.SunfeatherCharmItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
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
    public static final DeferredRegister<Block> BLOCKS =
        DeferredRegister.create(ForgeRegistries.BLOCKS, MODID);
    public static final DeferredRegister<CreativeModeTab> TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

    // ===== Relics =====
    // Relic of the Remnant (Ancient Remnant / cursed_pyramid boss): charm slot, EPIC.
    // +max health + ISS spell power, expressed as framework leveling abilities. spell_power
    // resolves at runtime (soft dep on Iron's Spellbooks); see RemnantRelicItem.
    public static final RegistryObject<Item> REMNANT_RELIC = ITEMS.register("remnant_relic",
        () -> new RemnantRelicItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // ===== Phase 2 boss-relic roster =====
    // Each relic is a framework RelicItem subclass (see item/*.java). Slot is assigned by the
    // curios:<slot> item tag (data/curios/tags/items/<slot>.json). All modded attributes are
    // SOFT deps resolved at runtime. Drops are wired separately (kubejs/.../relic_boss_drops.js).

    // Frostmaw's Frozen Heart -- T1 (mowziesmobs:frostmaw), necklace, UNCOMMON. +armor.
    public static final RegistryObject<Item> FROSTMAW_HEART = ITEMS.register("frostmaw_heart",
        () -> new FrostmawHeartItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON).fireResistant()));

    // Ironheart Cog -- T1 (mowziesmobs:ferrous_wroughtnaut), belt, UNCOMMON. +armor, +knockback resist.
    public static final RegistryObject<Item> IRONHEART_COG = ITEMS.register("ironheart_cog",
        () -> new IronheartCogItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON).fireResistant()));

    // Sunfeather Charm -- T2 (aether:sun_spirit), charm, RARE. +max mana (ISS soft dep).
    public static final RegistryObject<Item> SUNFEATHER_CHARM = ITEMS.register("sunfeather_charm",
        () -> new SunfeatherCharmItem(new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    // Lich's Phylactery Shard -- T2 (twilightforest:lich), spellstone, RARE. +cooldown reduction (ISS soft dep).
    public static final RegistryObject<Item> PHYLACTERY_SHARD = ITEMS.register("phylactery_shard",
        () -> new PhylacteryShardItem(new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    // Leviathan's Pearl -- T3 (cataclysm:the_leviathan), body, EPIC. +max health, +attack damage.
    public static final RegistryObject<Item> LEVIATHANS_PEARL = ITEMS.register("leviathans_pearl",
        () -> new LeviathansPearlItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // Cursed Sigil of Pride -- T3 CURSE (cardinal_sins:lucifer), ring, EPIC. +spell power, +attack, -4 max health.
    public static final RegistryObject<Item> CURSED_SIGIL_PRIDE = ITEMS.register("cursed_sigil_pride",
        () -> new CursedSigilPrideItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // Dragon's Eye -- T4 finale (minecraft:ender_dragon), back, EPIC. +max health, +crit chance/damage (attributeslib soft dep).
    public static final RegistryObject<Item> DRAGONS_EYE = ITEMS.register("dragons_eye",
        () -> new DragonsEyeItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // ===== Economy: relic surplus-sink currency =====
    // Relic Essence -- distilled from surplus relics/curios (KubeJS submit-sweep +
    // Relic Broker buy trades, SAME data-driven table in economy/relic_sink.js) and
    // spent at the Broker's tier-gated catalog. Plain stackable currency (NOT a worn
    // relic); stacks like emeralds (the S18 convenience-currency parallel).
    public static final RegistryObject<Item> RELIC_ESSENCE = ITEMS.register("relic_essence",
        () -> new RelicEssenceItem(new Item.Properties().rarity(Rarity.UNCOMMON)));

    // Relic Essence Block -- 9 essence compressed (the emerald-block parallel). Storage +
    // the substantial-cost ingredient for the T2 Broker recipe (a crafting grid can only
    // hold 9 loose essence, so the block is how a recipe can charge dozens). Faintly glows.
    public static final RegistryObject<Block> RELIC_ESSENCE_BLOCK = BLOCKS.register("relic_essence_block",
        () -> new Block(BlockBehaviour.Properties.of()
            .strength(5.0F, 6.0F)
            .sound(SoundType.AMETHYST)
            .lightLevel(state -> 8)
            .requiresCorrectToolForDrops()));
    public static final RegistryObject<Item> RELIC_ESSENCE_BLOCK_ITEM = ITEMS.register("relic_essence_block",
        () -> new BlockItem(RELIC_ESSENCE_BLOCK.get(), new Item.Properties()));

    // ===== Economy: the Relic Broker Stand block =====
    // Physical anchor for the Relic Broker trade GUI. Right-click handling + the catalog
    // live in KubeJS (economy/relic_broker.js -> RelicBroker.open); the block is just a
    // placeable/craftable station (T2-gated recipe). Pickaxe-mineable, drops itself.
    public static final RegistryObject<Block> RELIC_BROKER_STAND = BLOCKS.register("relic_broker_stand",
        () -> new RelicBrokerStandBlock(BlockBehaviour.Properties.of()
            .strength(3.0F, 6.0F)
            .sound(SoundType.STONE)
            .requiresCorrectToolForDrops()));
    public static final RegistryObject<Item> RELIC_BROKER_STAND_ITEM = ITEMS.register("relic_broker_stand",
        () -> new BlockItem(RELIC_BROKER_STAND.get(), new Item.Properties()));

    // ===== Creative tab =====
    public static final RegistryObject<CreativeModeTab> RELICS_TAB = TABS.register("relics",
        () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup." + MODID))
            .icon(() -> new ItemStack(REMNANT_RELIC.get()))
            .displayItems((params, output) -> ITEMS.getEntries().forEach(e -> output.accept(e.get())))
            .build());

    public IridescentRelics() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        BLOCKS.register(modBus);
        ITEMS.register(modBus);
        TABS.register(modBus);
    }
}
