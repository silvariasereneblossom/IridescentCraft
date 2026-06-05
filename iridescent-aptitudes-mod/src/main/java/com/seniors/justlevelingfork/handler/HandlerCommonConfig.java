package com.seniors.justlevelingfork.handler;

import com.google.gson.GsonBuilder;
import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.config.Configuration;
import com.seniors.justlevelingfork.config.StringListGroup;
import dev.isxander.yacl3.config.v2.api.ConfigClassHandler;
import dev.isxander.yacl3.config.v2.api.SerialEntry;
import dev.isxander.yacl3.config.v2.api.autogen.Boolean;
import dev.isxander.yacl3.config.v2.api.autogen.*;
import dev.isxander.yacl3.config.v2.api.serializer.GsonConfigSerializerBuilder;
import net.minecraft.resources.ResourceLocation;

import java.util.Arrays;
import java.util.List;

public class HandlerCommonConfig {
    public static ConfigClassHandler<HandlerCommonConfig> HANDLER = ConfigClassHandler.createBuilder(HandlerCommonConfig.class)
            .id(new ResourceLocation(JustLevelingFork.MOD_ID, "config"))
            .serializer(config -> GsonConfigSerializerBuilder.create(config)
                    .setPath(Configuration.getAbsoluteDirectory().resolve("justleveling-fork.common.json5"))
                    .appendGsonBuilder(GsonBuilder::setPrettyPrinting)
                    .setJson5(true)
                    .build())
            .build();

    @SerialEntry(comment = "DON'T CHANGE THIS, REQUIRED TO AUTOMATICALLY TRY TO PORT LOCK ITEMS FROM THE OLD CONFIG.")
    @Boolean(formatter = Boolean.Formatter.TRUE_FALSE)
    public boolean usingNewConfig = false;

    @SerialEntry(comment = "Should the mod automatically check for updates on load?")
    @Boolean(formatter = Boolean.Formatter.ON_OFF)
    public boolean checkForUpdates = true;

    // General options
    @SerialEntry(comment = "Aptitudes Max Level")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 2, max = 1000)
    public int aptitudeMaxLevel = 32;

    @SerialEntry(comment = "Global max level, the global level is calculated summing all aptitudes level, so if this is set to 32 players will be able to only maximize 1 skill.")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 32, max = 99999)
    public int playersMaxGlobalLevel = 256;

    @SerialEntry(comment = "First aptitudes level cost")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 1, max = 1000)
    public int aptitudeFirstCostLevel = 5;

    // ─── Iridescent fork (#76): cumulative-level cost curve ────────────────────
    // Leveling an aptitude costs VANILLA LEVELS that scale with the player's
    // CUMULATIVE aptitude level (sum across all aptitudes). The cumulative range
    // is bracketed into "trees" of `aptitudeCostTreeSize` levels; each successive
    // tree's TOTAL level budget multiplies by `aptitudeCostDoubling` from a base
    // of `aptitudeCostBaseLevels` (tree 1=500, 2=1000, … 8=64,000). Within a tree
    // the per-level cost ramps linearly (see rampShape) and sums to that budget.
    // With Linear-Experience (#77, static 75 XP/level) a level reads as 75 XP.
    // NOTE: aptitudeFirstCostLevel above is no longer used by the curve.
    @SerialEntry(comment = "Aptitude cost: vanilla-level budget for the first 'tree' (cumulative-level bracket). Tree N total = base * doubling^(N-1).")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 1, max = 1000000)
    public int aptitudeCostBaseLevels = 500;

    @SerialEntry(comment = "Aptitude cost: multiplier applied to each successive tree's total budget (2 = doubles every tree).")
    @AutoGen(category = "common", group = "general")
    @FloatField(min = 1.0f, max = 16.0f)
    public float aptitudeCostDoubling = 2.0f;

    @SerialEntry(comment = "Aptitude cost: cumulative aptitude levels per 'tree' bracket.")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 1, max = 1000)
    public int aptitudeCostTreeSize = 30;

    @SerialEntry(comment = "Aptitude cost: within-tree linear ramp steepness. 0 = flat (every level in a tree costs the same), 1 = steep (first level ~free, last ~2x the tree average). The per-level cost still sums to the tree budget at any value.")
    @AutoGen(category = "common", group = "general")
    @FloatField(min = 0.0f, max = 1.0f)
    public float aptitudeCostRampShape = 0.5f;

    @SerialEntry(comment = "Aptitude cost: XP-per-vanilla-level used ONLY for the tooltip's informational '(N xp)' figure. Match Linear-Experience's staticModeXpNeeded (#77 = 75). The actual charge is in vanilla levels, so this does not affect balance.")
    @AutoGen(category = "common", group = "general")
    @IntField(min = 1, max = 100000)
    public int aptitudeCostXpPerLevel = 75;

    @SerialEntry(comment = "Show potions overlay over skills")
    @AutoGen(category = "common", group = "general")
    @Boolean(formatter = Boolean.Formatter.ON_OFF)
    public boolean showPotionsHud = true;

    @SerialEntry(comment = "If true, locked items will be automatically dropped from player hands")
    @AutoGen(category = "common", group = "general")
    @Boolean(formatter = Boolean.Formatter.ON_OFF)
    public boolean dropLockedItems = false;

    @SerialEntry(comment = "TAC:Zero have a special id system, so if you wanna get the id to restrict you need to enable this and shoot.")
    @AutoGen(category = "common", group = "general")
    @Boolean(formatter = Boolean.Formatter.ON_OFF)
    public boolean logTaczGunNames = false;

    @SerialEntry(comment = "If Iron's Spells 'n Spellbooks is present, it will log the spells id's on cast required to restrict them.")
    @AutoGen(category = "common", group = "general")
    @Boolean(formatter = Boolean.Formatter.ON_OFF)
    public boolean logSpellIds = false;

    @SerialEntry(comment = "If true this will display the player titles as prefixes when a player chat.")
    @AutoGen(category = "common", group = "general")
    @Boolean(formatter = Boolean.Formatter.TRUE_FALSE)
    public boolean displayTitlesAsPrefix = true;

    // Passive options
    @SerialEntry(comment = "Attack Damage passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float attackDamageValue = 1.5f;

    @SerialEntry(comment = "Attack damage passive levels. Don't modify the length of the array!")
    public int[] attackPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Attack Knockback passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float attackKnockbackValue = 0.4f;

    @SerialEntry(comment = "Attack knockback passive levels. Don't modify the length of the array!")
    public int[] attackKnockbackPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Max Health passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float maxHealthValue = 20.0f;

    @SerialEntry(comment = "Max health passive levels. Don't modify the length of the array!")
    public int[] maxHealthPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Knockback Resistance passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float knockbackResistanceValue = 0.5f;

    @SerialEntry(comment = "Knockback resistance passive levels. Don't modify the length of the array!")
    public int[] knockbackResistancePassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Movement Speed passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float movementSpeedValue = 0.05f;

    @SerialEntry(comment = "Movement speed passive levels. Don't modify the length of the array!")
    public int[] movementSpeedPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Projectile Damage passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float projectileDamageValue = 5.0f;

    @SerialEntry(comment = "Projectile damage passive levels. Don't modify the length of the array!")
    public int[] projectileDamagePassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Armor passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float armorValue = 4.0f;

    @SerialEntry(comment = "Armor passive levels. Don't modify the length of the array!")
    public int[] armorPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Armor Toughness passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float armorToughnessValue = 1.0f;

    @SerialEntry(comment = "Armor toughness passive levels. Don't modify the length of the array!")
    public int[] armorToughnessPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Attack Speed passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float attackSpeedValue = 0.4f;

    @SerialEntry(comment = "Attack speed passive levels. Don't modify the length of the array!")
    public int[] attackSpeedPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Entity Reach passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float entityReachValue = 1.0f;

    @SerialEntry(comment = "Entity reach passive levels. Don't modify the length of the array!")
    public int[] entityReachPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Block Reach passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float blockReachValue = 1.5f;

    @SerialEntry(comment = "Block reach passive levels. Don't modify the length of the array!")
    public int[] blockReachPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Break Speed passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float breakSpeedValue = 0.5f;

    @SerialEntry(comment = "Break speed passive levels. Don't modify the length of the array!")
    public int[] breakSpeedPassiveLevels = new int[]{8, 14, 20, 26, 3};

    @SerialEntry(comment = "Beneficial Effect passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float beneficialEffectValue = 60.0f;

    @SerialEntry(comment = "Beneficial effect passive levels. Don't modify the length of the array!")
    public int[] beneficialEffectPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Magic Resist passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float magicResistValue = 0.5f;

    @SerialEntry(comment = "Magic resistance passive levels. Don't modify the length of the array!")
    public int[] magicResistPassiveLevels = new int[]{8, 14, 20, 26, 32};

    @SerialEntry(comment = "Critical Damage passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float criticalDamageValue = 0.25f;

    @SerialEntry(comment = "Critical damage passive levels. Don't modify the length of the array!")
    public int[] criticalDamagePassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Luck passive value at max level")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float luckValue = 2.0f;

    @SerialEntry(comment = "Luck passive levels. Don't modify the length of the array!")
    public int[] luckPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    // ─── Iridescent fork: MAG + INT passives (per design plan) ─────────
    @SerialEntry(comment = "Spell Power passive value at max level (added to ISS spell_power, 0.16 = +16% spell damage at MAG 32, ~+0.5%/level)")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float spellPowerValue = 0.16f;

    @SerialEntry(comment = "Spell Power passive levels. Don't modify the length of the array!")
    public int[] spellPowerPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Mana Regen passive value at max level (added to ISS mana_regen, 0.32 = +32% regen at MAG 32, ~+1%/level)")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float manaRegenValue = 0.32f;

    @SerialEntry(comment = "Mana Regen passive levels. Don't modify the length of the array!")
    public int[] manaRegenPassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};

    @SerialEntry(comment = "Crit Chance passive value at max level (added to attributeslib:crit_chance, 0.25 = +25% crit chance at INT 32). Also boosts magic crit chance via magic_crit_hook.js.")
    @AutoGen(category = "common", group = "passives")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float critChanceValue = 0.25f;

    @SerialEntry(comment = "Crit Chance passive levels. Don't modify the length of the array!")
    public int[] critChancePassiveLevels = new int[]{5, 8, 11, 14, 17, 20, 23, 26, 29, 32};


    // Skills options
    @SerialEntry(comment = "One Handed skill damage amplifier increase")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float oneHandedAmplifier = 0.5f;

    @SerialEntry(comment = "Fighting Spirit skill strength potion effect boost")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 255)
    public int fightingSpiritBoost = 1;

    @SerialEntry(comment = "Fighting Spirit skill strength potion effect duration")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 3600)
    public int fightingSpiritDuration = 3;

    @SerialEntry(comment = "Berserker skill health percent")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 100)
    public int berserkerPercent = 30;

    @SerialEntry(comment = "Athletics skill air modifier multiply")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 500.0f)
    public float athleticsModifier = 1.5f;

    @SerialEntry(comment = "Lion Heart skill negative potion effect percent")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 100)
    public int lionHeartPercent = 50;

    @SerialEntry(comment = "Quick Reposition skill speed potion effect boost")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 255)
    public int quickRepositionBoost = 2;

    @SerialEntry(comment = "Quick Reposition skill speed potion effect duration")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 3600)
    public int quickRepositionDuration = 3;

    @SerialEntry(comment = "Stealth Mastery skill enemy vision percent")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 100)
    public int stealthMasteryUnSneakPercent = 20;

    @SerialEntry(comment = "Stealth Mastery skill enemy vision percent when player is sneaking")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 100)
    public int stealthMasterySneakPercent = 60;

    @SerialEntry(comment = "Stealth Mastery skill arrow damage modifier multiply")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 100.0f)
    public float stealthMasteryModifier = 1.25f;

    @SerialEntry(comment = "Counter Attack skill duration to return the attack")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 3600)
    public int counterAttackDuration = 3;

    @SerialEntry(comment = "Counter Attack skill damage returned percent")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 500)
    public int counterAttackPercent = 50;

    @SerialEntry(comment = "Diamond Skin defence potion effect boost")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 255)
    public int diamondSkinBoost = 2;

    @SerialEntry(comment = "Diamond skill defense amplifier increase when player is sneaking")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float diamondSkinSneakAmplifier = 2.0f;

    @SerialEntry(comment = "Haggler skill villager trades cost percent reduced")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 0, max = 100)
    public int hagglerPercent = 20;

    @SerialEntry(comment = "Expert Alchemist skill potion amplifier increase")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float alchemyManipulationAmplifier = 1.0f;

    @SerialEntry(comment = "Obsidian Smasher skill obsidian breaking speed modifier multiply")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 100.0f)
    public float obsidianSmasherModifier = 10.0f;

    @SerialEntry(comment = "Treasure Hunter skill probability chance to get a treasure in dirt")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 10000)
    public int treasureHunterProbability = 500;

    @SerialEntry(comment = "Treasure Hunter skill treasures item list")
    @ListGroup(controllerFactory = StringListGroup.class, valueFactory = StringListGroup.class)
    public List<String> treasureHunterItemList = Arrays.asList("minecraft:flint", "minecraft:clay_ball", "trashList[minecraft:feather;minecraft:bone_meal]", "lostToolList[minecraft:stick;minecraft:wooden_pickaxe{Damage:59};minecraft:wooden_shovel{Damage:59};minecraft:wooden_axe{Damage:59}]", "discList[minecraft:music_disc_13;minecraft:music_disc_cat;minecraft:music_disc_blocks;minecraft:music_disc_chirp;minecraft:music_disc_far;minecraft:music_disc_mall;minecraft:music_disc_mellohi;minecraft:music_disc_stal;minecraft:music_disc_strad;minecraft:music_disc_ward;minecraft:music_disc_11;minecraft:music_disc_wait]", "seedList[minecraft:beetroot_seeds;minecraft:wheat_seeds;minecraft:pumpkin_seeds;minecraft:melon_seeds;minecraft:brown_mushroom;minecraft:red_mushroom]", "mineralList[minecraft:raw_iron;minecraft:raw_gold;minecraft:raw_copper;minecraft:coal;minecraft:charcoal]");

    @SerialEntry(comment = "Convergence skill probability chance to obtain part of the spent material")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 10000)
    public int convergenceProbability = 8;

    @SerialEntry(comment = "Life Eater skill life steal amplifier increase")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float lifeEaterModifier = 1.0f;

    @SerialEntry(comment = "Critical Roll skill critic modifier multiply when you roll a 6")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 100.0f)
    public float criticalRoll6Modifier = 1.25f;

    @SerialEntry(comment = "Critical Roll skill critic probability reduce when you roll a 1")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 10000)
    public int criticalRoll1Probability = 3;

    @SerialEntry(comment = "Lucky Drop skill mob drops modifier multiply")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float luckyDropModifier = 2.0f;

    @SerialEntry(comment = "Lucky Drop skill mobs drops probability")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 10000)
    public int luckyDropProbability = 10;

    @SerialEntry(comment = "Limit Breaker skill deal damage amplifier")
    @AutoGen(category = "common", group = "skills")
    @FloatField(min = 0.0f, max = 10000.0f)
    public float limitBreakerAmplifier = 999.0f;

    @SerialEntry(comment = "Limit Breaker skill deal damage probability")
    @AutoGen(category = "common", group = "skills")
    @IntField(min = 1, max = 10000)
    public int limitBreakerProbability = 100;

    // Skill Levels
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int oneHandedRequiredLevel = 10;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int fightingSpiritRequiredLevel = 16;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int berserkerRequiredLevel = 30;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int athleticsRequiredLevel = 10;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int turtleShieldRequiredLevel = 20;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int lionHeartRequiredLevel = 32;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int quickRepositionRequiredLevel = 10;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int stealthMasteryRequiredLevel = 16;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int catEyesRequiredLevel = 32;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int snowWalkerRequiredLevel = 10;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int counterattackRequiredLevel = 18;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int diamondSkinRequiredLevel = 30;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    // Iridescent fork: deprecated INT natives set to -1 (skip registration).
    // Replaced by Curious (INT 5), Arcane Efficiency (INT 10), Insight (INT 15),
    // Materials Science (INT 20), Enlightenment (INT 30) per design plan.
    public int scholarRequiredLevel = -1;
    @SerialEntry(comment = "DEPRECATED - replaced by Curious/Arcane Efficiency/Insight/Materials Science/Enlightenment")
    @IntField(min = -1)
    public int hagglerRequiredLevel = -1;
    @SerialEntry(comment = "DEPRECATED")
    @IntField(min = -1)
    public int alchemyManipulationRequiredLevel = -1;

    // Iridescent fork: new INT skills at design thresholds 5/10/15/20/30.
    @SerialEntry(comment = "INT 5 — Curious: +10% XP gain")
    @IntField(min = -1)
    public int curiousRequiredLevel = 5;
    @SerialEntry(comment = "INT 10 — Arcane Efficiency: 25% XP refund when spending XP near enchanting table")
    @IntField(min = -1)
    public int arcaneEfficiencyRequiredLevel = 10;
    @SerialEntry(comment = "INT 15 — Insight: +20% XP gain (stacks with Curious + Enlightenment)")
    @IntField(min = -1)
    public int insightRequiredLevel = 15;
    @SerialEntry(comment = "INT 20 — Materials Science: 25% XP refund on anvil repairs")
    @IntField(min = -1)
    public int materialsScienceRequiredLevel = 20;
    @SerialEntry(comment = "INT 30 — Enlightenment: +30% XP gain (capstone)")
    @IntField(min = -1)
    public int enlightenmentRequiredLevel = 30;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int obsidianSmasherRequiredLevel = 12;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int treasureHunterRequiredLevel = 20;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int convergenceRequiredLevel = 30;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    // Iridescent fork: deprecated MAG natives set to -1 (skip registration).
    // Replaced by Mana Spark (MAG 5), Conservation (MAG 10), Mana Blaze (MAG 15),
    // Mystic Ward (MAG 20), Mana Inferno (MAG 30) per design plan.
    public int safePortRequiredLevel = -1;
    @SerialEntry(comment = "DEPRECATED - replaced by Mana Spark/Conservation/Mana Blaze/Mystic Ward/Mana Inferno")
    @IntField(min = -1)
    public int lifeEaterRequiredLevel = -1;
    @SerialEntry(comment = "DEPRECATED")
    @IntField(min = -1)
    public int wornholeStorageRequiredLevel = -1;

    // Iridescent fork: new MAG skills at design thresholds 5/10/15/20/30.
    @SerialEntry(comment = "MAG 5 — Mana Spark: +20 max mana, +5% spell power")
    @IntField(min = -1)
    public int manaSparkRequiredLevel = 5;
    @SerialEntry(comment = "MAG 10 — Conservation of Magic: +15% mana regen (approximates spell cost reduction)")
    @IntField(min = -1)
    public int conservationOfMagicRequiredLevel = 10;
    @SerialEntry(comment = "MAG 15 — Mana Blaze: +15% spell power")
    @IntField(min = -1)
    public int manaBlazeRequiredLevel = 15;
    @SerialEntry(comment = "MAG 20 — Mystic Ward: dynamic damage reduction scaled by bonus spell power")
    @IntField(min = -1)
    public int mysticWardRequiredLevel = 20;
    @SerialEntry(comment = "MAG 30 — Mana Inferno: +30% spell power (capstone)")
    @IntField(min = -1)
    public int manaInfernoRequiredLevel = 30;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int criticalRollRequiredLevel = 12;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int luckyDropRequiredLevel = 22;
    @SerialEntry(comment = "Required level to unlock skill")
    @IntField(min = 1)
    public int limitBreakerRequiredLevel = 32;
}
