package net.royling.lovelysparklepieces.ModItem.ModCurios;

import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Heads.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Rings.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.back.LeatherQuiver;
import net.royling.lovelysparklepieces.ModItem.ModCurios.back.MermaidTail;
import net.royling.lovelysparklepieces.ModItem.ModCurios.back.WoodGrainQuiver;
import net.royling.lovelysparklepieces.ModItem.ModCurios.belt.AdventurersBelt;
import net.royling.lovelysparklepieces.ModItem.ModCurios.belt.GoldedHook;
import net.royling.lovelysparklepieces.ModItem.ModCurios.body.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.boot.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.bracelet.ResuscitatorItem;
import net.royling.lovelysparklepieces.ModItem.ModCurios.necklace.BlazeCoreItem;
import net.royling.lovelysparklepieces.ModItem.ModCurios.necklace.MagmaAmuletItem;
import net.royling.lovelysparklepieces.ModItem.ModCurios.necklace.MoonAmuletItem;
import top.theillusivec4.curios.api.CuriosApi;


public class ModCurios {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, LovelySparklePieces.MODID);
    //RING
    public static final RegistryObject<Item> MAGNETIC_RING = ITEMS.register("magnetic_ring",
            ()->new MagneticRingItem(new Item.Properties()));
    public static final RegistryObject<Item> SUPER_MAGNETIC_RING = ITEMS.register("super_magnetic_ring",
            ()->new SuperMagneticRingItem(new Item.Properties()));
    public static final RegistryObject<Item> ENDER_RING = ITEMS.register("ender_ring",
            ()->new EnderRingItem(new Item.Properties()));
    public static final RegistryObject<Item> CRIT_RING = ITEMS.register("crit_ring",
            ()->new CritRingItem(new Item.Properties()));
    public static final RegistryObject<Item> MEMORY_RING = ITEMS.register("memory_ring",
            ()->new MemoryRingItem(new Item.Properties()));
    public static final RegistryObject<Item> NIGHT_OWL_RING = ITEMS.register("night_owl_ring",
            ()->new NightOwlRingItem(new Item.Properties()));
    public static final RegistryObject<Item> CRUSH_STONE_RING = ITEMS.register("crush_stone_ring",
            ()->new CrushedStoneRingItem(new Item.Properties()));
    public static final RegistryObject<Item> INFERNO_RING = ITEMS.register("inferno_ring",
            ()->new InfernoRingItem(new Item.Properties()));
    public static final RegistryObject<Item> ECO_RING = ITEMS.register("eco_ring",
            ()->new EcoRingItem(new Item.Properties()));

    //head
    public static final RegistryObject<Item> FPS_EYE = ITEMS.register("fps_eye",
            ()->new FPSEyeItem(new Item.Properties()));
    public static final RegistryObject<Item> BLACKSTONE_HEART = ITEMS.register("blackstone_heart",
            ()->new BlackstoneHeart(new Item.Properties()));
    public static final RegistryObject<Item> NIGHT_VISION = ITEMS.register("night_vision",
            ()->new NightVisionItem(new Item.Properties()));
    public static final RegistryObject<Item>DOUBLE_NIGHT_VISION = ITEMS.register("double_night_vision",
            ()->new DoubleNightVisionItem(new Item.Properties()));
    public static final RegistryObject<Item> QUARTER_NIGHT_VISION = ITEMS.register("quarter_night_vision",
            ()->new QuaterNightVisionItem(new Item.Properties()));
    public static final RegistryObject<Item> JELLYFISH_HELMET = ITEMS.register("jellyfish_helmet",
            ()->new JellyfishHelmet(new Item.Properties()));
    public static final RegistryObject<Item> CAPITALIST_HEAT = ITEMS.register("capitalist_heat",
            ()->new CapitalistHeat(new Item.Properties()));
    public static final RegistryObject<Item> POSEIDON_RESPIRATOR  = ITEMS.register("poseidon_respirator",
            ()->new PoseidonRespirator(new Item.Properties()));
    public static final RegistryObject<Item> EYE_MASK  = ITEMS.register("eye_mask",
            ()->new EyeMask(new Item.Properties()));
    public static final RegistryObject<Item> MARKSMAN_GOGGLES  = ITEMS.register("marksman_goggles",
            ()->new MarksmanGoggles(new Item.Properties()));
    public static final RegistryObject<Item> WITCH_HAT  = ITEMS.register("witch_hat",
            ()->new WitchsHat(new Item.Properties()));
    public static final RegistryObject<Item> YELLOW_HEADSCARF  = ITEMS.register("yellow_headscarf",
            ()->new YellowHeadscarf(new Item.Properties()));

    //necklace
    public static final RegistryObject<Item> MAGMA_AMULET = ITEMS.register("magma_amulet",
            ()->new MagmaAmuletItem(new Item.Properties()));
    public static final RegistryObject<Item> MOON_AMULET = ITEMS.register("moon_amulet",
            ()->new MoonAmuletItem(new Item.Properties()));
    public static final RegistryObject<Item> BLAZE_CORE = ITEMS.register("blaze_core",
            ()->new BlazeCoreItem(new Item.Properties()));

    //bracelet
    public static final RegistryObject<Item> RESUSCITATOR = ITEMS.register("resuscitator",
            ()->new ResuscitatorItem(new Item.Properties()));
    //body
    public static final RegistryObject<Item> HEAVY_BIGROCK = ITEMS.register("heavy_bigrock",
            ()->new HeavyBigrock(new Item.Properties()));
    public static final RegistryObject<Item> POCKET_WATCH = ITEMS.register("pocket_watch",
            ()->new PocketWatch(new Item.Properties()));
    public static final RegistryObject<Item> SPEEDOMETER = ITEMS.register("speedometer",
            ()->new Speedometer(new Item.Properties()));
    public static final RegistryObject<Item> POSITION_TRACKER = ITEMS.register("position_tracker",
            ()->new PositionTrackerItem(new Item.Properties()));
    public static final RegistryObject<Item> GPS = ITEMS.register("global_positioning_system",
            ()->new GlobalPositioningSystem(new Item.Properties()));
    public static final RegistryObject<Item> HIGH_QUALITY_FISHING_LINE = ITEMS.register("high_quality_fishing_line",
            ()->new HighQualityFishingLineItem(new Item.Properties()));
    public static final RegistryObject<Item> PDA = ITEMS.register("pda",
            ()->new PDAItem(new Item.Properties()));

    //BACK
    public static final RegistryObject<Item> MERMAID_TAIL = ITEMS.register("mermaid_tail",
            ()->new MermaidTail(new Item.Properties()));
    public static final RegistryObject<Item> WOOD_GRAIN_QUIVER = ITEMS.register("wood_grain_quiver",
            ()->new WoodGrainQuiver(new Item.Properties()));
    public static final RegistryObject<Item> LEATHER_QUIVER = ITEMS.register("leather_quiver",
            ()->new LeatherQuiver(new Item.Properties()));
    //belt
    public static final RegistryObject<Item> GOLDEN_HOOK = ITEMS.register("golden_hook",
            ()->new GoldedHook(new Item.Properties()));
    public static final RegistryObject<Item> ADVENTURER_BELT = ITEMS.register("adventurer_belt",
            ()->new AdventurersBelt(new Item.Properties()));

    //boot
    public static final RegistryObject<Item> STRAW_SANDALS = ITEMS.register("straw_sandals",
            ()->new StrawSandalsItem(new Item.Properties()));
    public static final RegistryObject<Item> GOAT_BOOT = ITEMS.register("goat_boot",
            ()->new GoatBootItem(new Item.Properties()));
    public static final RegistryObject<Item> FOX_BOOT = ITEMS.register("fox_boot",
            ()->new FoxBootItem(new Item.Properties()));
    public static final RegistryObject<Item> RABBIT_BOOT = ITEMS.register("rabbit_boot",
            ()->new RabbitBootItem(new Item.Properties()));
    public static final RegistryObject<Item> CAT_BOOT = ITEMS.register("cat_boot",
            ()->new CatBootItem(new Item.Properties()));
    public static final RegistryObject<Item> BLADE_BOOT = ITEMS.register("blade_boot",
            ()->new BladeBootItem(new Item.Properties()));
    public static final RegistryObject<Item> CRYSTAL_BOOT = ITEMS.register("crystal_boot",
            ()->new CrystalBootItem(new Item.Properties()));
    public static final RegistryObject<Item> GUARD_BOOT = ITEMS.register("guard_boot",
            ()->new GuardBootItem(new Item.Properties()));
    public static final RegistryObject<Item> WARRIOR_GREAVES = ITEMS.register("warrior_greaves",
            ()->new WarriorGreavesItem(new Item.Properties()));
    public static final RegistryObject<Item> FLOWER_BOOT = ITEMS.register("flower_boot",
            ()->new FlowerBootItem(new Item.Properties()));
    public static final RegistryObject<Item> WATERWALK_BOOT = ITEMS.register("waterwalk_boot",
            ()->new WaterwalkBootItem(new Item.Properties()));
    public static final RegistryObject<Item> ROLLER_SKATES = ITEMS.register("roller_skates",
            ()->new RollerSkatesItem(new Item.Properties()));
    /// 合成boot
    public static final RegistryObject<Item> JUMPING_FOOTWEAR = ITEMS.register("jumping_footwear",
            ()->new JumpingFootwear(new Item.Properties()));
    public static final RegistryObject<Item> WIND_LEAP_BOOTS = ITEMS.register("wind_leap_boots",
            ()->new WindLeapBoots(new Item.Properties()));
    public static final RegistryObject<Item> SKY_BEAST_SHOES = ITEMS.register("sky_beast_shoes",
            ()->new SkyBeastShoes(new Item.Properties()));
    //lc
    public static final RegistryObject<Item> BLASPHEMOUS_CONTRACT = ITEMS.register("blasphemous_contract",
            ()->new BlasphemousContract(new Item.Properties()));
    public static final RegistryObject<Item> MIRROR_AND_WATER = ITEMS.register("mirror_and_water",
            ()->new MirrorAndWater(new Item.Properties()));
    public static final RegistryObject<Item> ENCHANT_EYE = ITEMS.register("enchant_eye",
            ()->new EnchantEyeItem(new Item.Properties()));
    public static final RegistryObject<Item> SOUL_QUIVER = ITEMS.register("soul_quiver",
            () -> new SoulQuiverItem(new Item.Properties()));
    public static final RegistryObject<Item> NEWBIE_UMBRELLA = ITEMS.register("newbie_umbrella",
            () -> new NewbieUmbrella(new Item.Properties()));
    public static final RegistryObject<Item> DRAGON_HEART = ITEMS.register("dragon_heart",
            () -> new DragonHeartItem(new Item.Properties()));
    //赌徒的套装
    public static final RegistryObject<Item> GAMBLERS_CORSAGE = ITEMS.register("gamblers_corsage",
            () -> new GamblersCorsageItem(new Item.Properties()));
    public static final RegistryObject<Item> GAMBLERS_DICE = ITEMS.register("gamblers_dice",
            () -> new GamblersDiceItem(new Item.Properties()));
    public static final RegistryObject<Item> GAMBLERS_EARRINGS = ITEMS.register("gamblers_earrings",
            () -> new GamblersEarringsItem(new Item.Properties()));
    public static final RegistryObject<Item> GAMBLERS_GOLD_COIN = ITEMS.register("gamblers_gold_coin",
            () -> new GamblersGoldCoinItem(new Item.Properties()));
    public static final RegistryObject<Item> GAMBLERS_POKER = ITEMS.register("gamblers_poker",
            () -> new GamblersPokerItem(new Item.Properties()));

    public static boolean  hasCurio(Player player,Item item){
        return CuriosApi.getCuriosInventory(player).map(inv->inv.findFirstCurio(item).isPresent()).orElse(false);
    }
}
