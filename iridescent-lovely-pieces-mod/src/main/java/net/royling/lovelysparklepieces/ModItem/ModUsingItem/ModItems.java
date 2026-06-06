package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraftforge.registries.ForgeRegistries;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.*;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraftforge.common.ForgeTier;
import net.minecraftforge.registries.DeferredRegister;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModSounds.ModSounds;

import net.minecraftforge.registries.RegistryObject;

public class ModItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, LovelySparklePieces.MODID);
    public static final RegistryObject<Item> FLAME_STAFF = ITEMS.register("flame_soul_staff",
            ()->new FlameSoulStaff(new Item.Properties()));
    public static final RegistryObject<Item> SOUL_TORCH = ITEMS.register("soul_torch",
            ()->new SoulTorchItem(new Item.Properties()));
    public static final RegistryObject<Item> BINOCULARS = ITEMS.register("binoculars",
            ()->new Binoculars(new Item.Properties()));
    public static final RegistryObject<Item> NECROPSYCHE_PAPILLON = ITEMS.register("necropsyche_papillon",
            ()->new NecropsychePapillonItem(new Item.Properties()));
    public static final RegistryObject<Item> DOMAIN_STONE = ITEMS.register("domain_stone",
            ()->new DomainStoneItem(new Item.Properties()));
    public static final RegistryObject<Item> FIREBALL_STAFF  = ITEMS.register("fireball_staff",
            ()->new FireballStaffItem(new Item.Properties()));
    public static final RegistryObject<Item> POLYMERIZATION = ITEMS.register("polymerization",
            ()->new PolymerizationItem(new Item.Properties()));
    public static final RegistryObject<Item> SUPERPOLYMERIZATION = ITEMS.register("superpolymerization",
            ()->new SuperPolymerizationItem(new Item.Properties()));
    public static final RegistryObject<Item> FISHING_TREASURE = ITEMS.register("fishing_treasure",
            ()->new FishingTreasure(new Item.Properties(), ModSounds.TREASURE_OPEN.get()));

    public static final Tier PIRATE_SCIMITAR_TIRE = new ForgeTier(2, 320, 6f, 2f, 28,
            BlockTags.NEEDS_IRON_TOOL, ()-> Ingredient.of(Items.IRON_INGOT));

    public static final RegistryObject<Item> PIRATE_SCIMITAR = ITEMS.register("pirate_scimitar",
            ()->new SwordItem(PIRATE_SCIMITAR_TIRE, 3, -2.4f, new Item.Properties().stacksTo(1)));
    public static final RegistryObject<Item> FISH_PICKAXE = ITEMS.register("fish_pickaxe",
            ()->new PickaxeItem(PIRATE_SCIMITAR_TIRE, 1, -2.8f, new Item.Properties().stacksTo(1)));
    public static final RegistryObject<Item> FISH_AXE = ITEMS.register("fish_axe",
            ()->new AxeItem(PIRATE_SCIMITAR_TIRE, 6, -3.1f, new Item.Properties().stacksTo(1)));
    public static final RegistryObject<Item> FISH_SHOVEL = ITEMS.register("fish_shovel",
            ()->new ShovelItem(PIRATE_SCIMITAR_TIRE, 0.5f, -1f, new Item.Properties().stacksTo(1)));
    public static final RegistryObject<Item> FISH_HOE = ITEMS.register("fish_hoe",
            ()->new HoeItem(PIRATE_SCIMITAR_TIRE, -2, -1f, new Item.Properties().stacksTo(1)));

    public static final RegistryObject<Item> MOJA_COLA = ITEMS.register("moja_cola",
            ()->new Item(new Item.Properties().food(new FoodProperties.Builder().nutrition(2).saturationMod(0.3f).build())){
                @Override
                public SoundEvent getEatingSound() {
                    return SoundEvents.GENERIC_DRINK;
                }
            });

}
