package com.seniors.justlevelingfork.registry;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.client.core.Value;
import com.seniors.justlevelingfork.client.core.ValueType;
import com.seniors.justlevelingfork.handler.HandlerCommonConfig;
import com.seniors.justlevelingfork.handler.HandlerResources;
import com.seniors.justlevelingfork.registry.aptitude.Aptitude;
import com.seniors.justlevelingfork.registry.skills.Skill;
import net.minecraft.core.Registry;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.IForgeRegistry;
import net.minecraftforge.registries.RegistryBuilder;
import net.minecraftforge.registries.RegistryObject;

import java.util.function.Supplier;
import java.util.stream.Collectors;


public class RegistrySkills {
    public static final ResourceKey<Registry<Skill>> SKILLS_KEY = ResourceKey.createRegistryKey(new ResourceLocation(JustLevelingFork.MOD_ID, "skills"));
    public static final DeferredRegister<Skill> SKILLS = DeferredRegister.create(SKILLS_KEY, JustLevelingFork.MOD_ID);
    public static final Supplier<IForgeRegistry<Skill>> SKILLS_REGISTRY = SKILLS.makeRegistry(() -> new RegistryBuilder<Skill>().disableSaving());

    // ═══ Iridescent fork (#76): upstream natives REMOVED across all 8 aptitudes ═══════
    // Every upstream JLFork skill is hard-disabled (null). Their Java effect code in
    // RegistryCommonEvents + the mixins (and the TreasureHunterSkill / ConvergenceSkill
    // helpers) is null-guarded at every call site, so nulling here both pulls them from
    // the aptitude UI AND stops their effects — which otherwise DOUBLE-DIPPED with the
    // kubejs design effects (e.g. a STR player got native One Handed/Fighting Spirit/
    // Berserker on top of kubejs Might/Brutal Slash/Cleave/Hemorrhage/True Strength).
    //
    // All gameplay now lives in kubejs/server_scripts/skills/justleveling_skills.js keyed
    // off aptitude level; the registrations below this block exist purely to render the
    // 5/10/15/20/30 UI nodes. The fields are kept (not deleted) because the effect code
    // and mixins still reference them by name — they just resolve to null now.
    public static final RegistryObject<Skill> ONE_HANDED = null;
    public static final RegistryObject<Skill> FIGHTING_SPIRIT = null;
    public static final RegistryObject<Skill> BERSERKER = null;
    public static final RegistryObject<Skill> ATHLETICS = null;
    public static final RegistryObject<Skill> TURTLE_SHIELD = null;
    public static final RegistryObject<Skill> LION_HEART = null;
    public static final RegistryObject<Skill> QUICK_REPOSITION = null;
    public static final RegistryObject<Skill> STEALTH_MASTERY = null;
    public static final RegistryObject<Skill> CAT_EYES = null;
    public static final RegistryObject<Skill> SNOW_WALKER = null;
    public static final RegistryObject<Skill> COUNTER_ATTACK = null;
    public static final RegistryObject<Skill> DIAMOND_SKIN = null;
    public static final RegistryObject<Skill> SCHOLAR = null;
    public static final RegistryObject<Skill> HAGGLER = null;
    public static final RegistryObject<Skill> ALCHEMY_MANIPULATION = null;
    public static final RegistryObject<Skill> OBSIDIAN_SMASHER = null;
    public static final RegistryObject<Skill> TREASURE_HUNTER = null;
    public static final RegistryObject<Skill> CONVERGENCE = null;
    public static final RegistryObject<Skill> SAFE_PORT = null;
    public static final RegistryObject<Skill> LIFE_EATER = null;
    public static final RegistryObject<Skill> WORMHOLE_STORAGE = null;
    public static final RegistryObject<Skill> CRITICAL_ROLL = null;
    public static final RegistryObject<Skill> LUCKY_DROP = null;
    public static final RegistryObject<Skill> LIMIT_BREAKER = null;

    // ═══ Design 5-tier nodes — effects fire from kubejs by aptitude level ═════════════
    // UI-only registrations (no config Value args). Textures reuse each aptitude's three
    // upstream skill icons (cosmetic; unique 5-per-aptitude art is a future polish pass).

    // ─── STR — Strength ───
    public static final RegistryObject<Skill> MIGHT = HandlerCommonConfig.HANDLER.instance().mightRequiredLevel < 0 ? null : SKILLS.register("might", () -> register("might", RegistryAptitudes.STRENGTH.get(), HandlerCommonConfig.HANDLER.instance().mightRequiredLevel, HandlerResources.ONE_HANDED_SKILL));
    public static final RegistryObject<Skill> BRUTAL_SLASH = HandlerCommonConfig.HANDLER.instance().brutalSlashRequiredLevel < 0 ? null : SKILLS.register("brutal_slash", () -> register("brutal_slash", RegistryAptitudes.STRENGTH.get(), HandlerCommonConfig.HANDLER.instance().brutalSlashRequiredLevel, HandlerResources.FIGHTING_SPIRIT_SKILL));
    public static final RegistryObject<Skill> CLEAVE = HandlerCommonConfig.HANDLER.instance().cleaveRequiredLevel < 0 ? null : SKILLS.register("cleave", () -> register("cleave", RegistryAptitudes.STRENGTH.get(), HandlerCommonConfig.HANDLER.instance().cleaveRequiredLevel, HandlerResources.BERSERKER_SKILL));
    public static final RegistryObject<Skill> HEMORRHAGE = HandlerCommonConfig.HANDLER.instance().hemorrhageRequiredLevel < 0 ? null : SKILLS.register("hemorrhage", () -> register("hemorrhage", RegistryAptitudes.STRENGTH.get(), HandlerCommonConfig.HANDLER.instance().hemorrhageRequiredLevel, HandlerResources.FIGHTING_SPIRIT_SKILL));
    public static final RegistryObject<Skill> TRUE_STRENGTH = HandlerCommonConfig.HANDLER.instance().trueStrengthRequiredLevel < 0 ? null : SKILLS.register("true_strength", () -> register("true_strength", RegistryAptitudes.STRENGTH.get(), HandlerCommonConfig.HANDLER.instance().trueStrengthRequiredLevel, HandlerResources.BERSERKER_SKILL));

    // ─── CON — Constitution ───
    public static final RegistryObject<Skill> TOUGH_HIDE = HandlerCommonConfig.HANDLER.instance().toughHideRequiredLevel < 0 ? null : SKILLS.register("tough_hide", () -> register("tough_hide", RegistryAptitudes.CONSTITUTION.get(), HandlerCommonConfig.HANDLER.instance().toughHideRequiredLevel, HandlerResources.ATHLETICS_SKILL));
    public static final RegistryObject<Skill> HEARTY_MEALS = HandlerCommonConfig.HANDLER.instance().heartyMealsRequiredLevel < 0 ? null : SKILLS.register("hearty_meals", () -> register("hearty_meals", RegistryAptitudes.CONSTITUTION.get(), HandlerCommonConfig.HANDLER.instance().heartyMealsRequiredLevel, HandlerResources.ATHLETICS_SKILL));
    public static final RegistryObject<Skill> STEADY_BREATH = HandlerCommonConfig.HANDLER.instance().steadyBreathRequiredLevel < 0 ? null : SKILLS.register("steady_breath", () -> register("steady_breath", RegistryAptitudes.CONSTITUTION.get(), HandlerCommonConfig.HANDLER.instance().steadyBreathRequiredLevel, HandlerResources.TURTLE_SHIELD_SKILL));
    public static final RegistryObject<Skill> OVERFLOW = HandlerCommonConfig.HANDLER.instance().overflowRequiredLevel < 0 ? null : SKILLS.register("overflow", () -> register("overflow", RegistryAptitudes.CONSTITUTION.get(), HandlerCommonConfig.HANDLER.instance().overflowRequiredLevel, HandlerResources.TURTLE_SHIELD_SKILL));
    public static final RegistryObject<Skill> IRON_STOMACH = HandlerCommonConfig.HANDLER.instance().ironStomachRequiredLevel < 0 ? null : SKILLS.register("iron_stomach", () -> register("iron_stomach", RegistryAptitudes.CONSTITUTION.get(), HandlerCommonConfig.HANDLER.instance().ironStomachRequiredLevel, HandlerResources.LION_HEART_SKILL));

    // ─── DEX — Dexterity ───
    public static final RegistryObject<Skill> LIGHT_STEP = HandlerCommonConfig.HANDLER.instance().lightStepRequiredLevel < 0 ? null : SKILLS.register("light_step", () -> register("light_step", RegistryAptitudes.DEXTERITY.get(), HandlerCommonConfig.HANDLER.instance().lightStepRequiredLevel, HandlerResources.QUICK_REPOSITION_SKILL));
    public static final RegistryObject<Skill> FLEET_OF_FOOT = HandlerCommonConfig.HANDLER.instance().fleetOfFootRequiredLevel < 0 ? null : SKILLS.register("fleet_of_foot", () -> register("fleet_of_foot", RegistryAptitudes.DEXTERITY.get(), HandlerCommonConfig.HANDLER.instance().fleetOfFootRequiredLevel, HandlerResources.QUICK_REPOSITION_SKILL));
    public static final RegistryObject<Skill> DEADEYE = HandlerCommonConfig.HANDLER.instance().deadeyeRequiredLevel < 0 ? null : SKILLS.register("deadeye", () -> register("deadeye", RegistryAptitudes.DEXTERITY.get(), HandlerCommonConfig.HANDLER.instance().deadeyeRequiredLevel, HandlerResources.STEALTH_MASTERY_SKILL));
    public static final RegistryObject<Skill> RAPID_FIRE = HandlerCommonConfig.HANDLER.instance().rapidFireRequiredLevel < 0 ? null : SKILLS.register("rapid_fire", () -> register("rapid_fire", RegistryAptitudes.DEXTERITY.get(), HandlerCommonConfig.HANDLER.instance().rapidFireRequiredLevel, HandlerResources.STEALTH_MASTERY_SKILL));
    public static final RegistryObject<Skill> EXCITEMENT = HandlerCommonConfig.HANDLER.instance().excitementRequiredLevel < 0 ? null : SKILLS.register("excitement", () -> register("excitement", RegistryAptitudes.DEXTERITY.get(), HandlerCommonConfig.HANDLER.instance().excitementRequiredLevel, HandlerResources.CAT_EYES_SKILL));

    // ─── DEF — Defense ───
    public static final RegistryObject<Skill> PADDED_FRAME = HandlerCommonConfig.HANDLER.instance().paddedFrameRequiredLevel < 0 ? null : SKILLS.register("padded_frame", () -> register("padded_frame", RegistryAptitudes.DEFENSE.get(), HandlerCommonConfig.HANDLER.instance().paddedFrameRequiredLevel, HandlerResources.DIAMOND_SKIN_SKILL));
    public static final RegistryObject<Skill> SECOND_WIND = HandlerCommonConfig.HANDLER.instance().secondWindRequiredLevel < 0 ? null : SKILLS.register("second_wind", () -> register("second_wind", RegistryAptitudes.DEFENSE.get(), HandlerCommonConfig.HANDLER.instance().secondWindRequiredLevel, HandlerResources.COUNTER_ATTACK_SKILL));
    public static final RegistryObject<Skill> BULWARK = HandlerCommonConfig.HANDLER.instance().bulwarkRequiredLevel < 0 ? null : SKILLS.register("bulwark", () -> register("bulwark", RegistryAptitudes.DEFENSE.get(), HandlerCommonConfig.HANDLER.instance().bulwarkRequiredLevel, HandlerResources.DIAMOND_SKIN_SKILL));
    public static final RegistryObject<Skill> TURTLE_SHIELD_DEF = HandlerCommonConfig.HANDLER.instance().turtleShieldDefRequiredLevel < 0 ? null : SKILLS.register("turtle_shield_def", () -> register("turtle_shield_def", RegistryAptitudes.DEFENSE.get(), HandlerCommonConfig.HANDLER.instance().turtleShieldDefRequiredLevel, HandlerResources.SNOW_WALKER_SKILL));
    public static final RegistryObject<Skill> LION_HEART_DEF = HandlerCommonConfig.HANDLER.instance().lionHeartDefRequiredLevel < 0 ? null : SKILLS.register("lion_heart_def", () -> register("lion_heart_def", RegistryAptitudes.DEFENSE.get(), HandlerCommonConfig.HANDLER.instance().lionHeartDefRequiredLevel, HandlerResources.COUNTER_ATTACK_SKILL));

    // ─── INT — Intelligence (already migrated in #76) ───
    public static final RegistryObject<Skill> CURIOUS = HandlerCommonConfig.HANDLER.instance().curiousRequiredLevel < 0 ? null : SKILLS.register("curious", () -> register("curious", RegistryAptitudes.INTELLIGENCE.get(), HandlerCommonConfig.HANDLER.instance().curiousRequiredLevel, HandlerResources.SCHOLAR_SKILL));
    public static final RegistryObject<Skill> ARCANE_EFFICIENCY = HandlerCommonConfig.HANDLER.instance().arcaneEfficiencyRequiredLevel < 0 ? null : SKILLS.register("arcane_efficiency", () -> register("arcane_efficiency", RegistryAptitudes.INTELLIGENCE.get(), HandlerCommonConfig.HANDLER.instance().arcaneEfficiencyRequiredLevel, HandlerResources.SCHOLAR_SKILL));
    public static final RegistryObject<Skill> INSIGHT = HandlerCommonConfig.HANDLER.instance().insightRequiredLevel < 0 ? null : SKILLS.register("insight", () -> register("insight", RegistryAptitudes.INTELLIGENCE.get(), HandlerCommonConfig.HANDLER.instance().insightRequiredLevel, HandlerResources.HAGGLER_SKILL));
    public static final RegistryObject<Skill> MATERIALS_SCIENCE = HandlerCommonConfig.HANDLER.instance().materialsScienceRequiredLevel < 0 ? null : SKILLS.register("materials_science", () -> register("materials_science", RegistryAptitudes.INTELLIGENCE.get(), HandlerCommonConfig.HANDLER.instance().materialsScienceRequiredLevel, HandlerResources.HAGGLER_SKILL));
    public static final RegistryObject<Skill> ENLIGHTENMENT = HandlerCommonConfig.HANDLER.instance().enlightenmentRequiredLevel < 0 ? null : SKILLS.register("enlightenment", () -> register("enlightenment", RegistryAptitudes.INTELLIGENCE.get(), HandlerCommonConfig.HANDLER.instance().enlightenmentRequiredLevel, HandlerResources.ALCHEMY_MANIPULATION_SKILL));

    // ─── BLD — Building ───
    public static final RegistryObject<Skill> STEADY_HAND = HandlerCommonConfig.HANDLER.instance().steadyHandRequiredLevel < 0 ? null : SKILLS.register("steady_hand", () -> register("steady_hand", RegistryAptitudes.BUILDING.get(), HandlerCommonConfig.HANDLER.instance().steadyHandRequiredLevel, HandlerResources.TREASURE_HUNTER_SKILL));
    public static final RegistryObject<Skill> QUARRYMAN = HandlerCommonConfig.HANDLER.instance().quarrymanRequiredLevel < 0 ? null : SKILLS.register("quarryman", () -> register("quarryman", RegistryAptitudes.BUILDING.get(), HandlerCommonConfig.HANDLER.instance().quarrymanRequiredLevel, HandlerResources.OBSIDIAN_SMASHER_SKILL));
    public static final RegistryObject<Skill> THRIFTY_HANDS = HandlerCommonConfig.HANDLER.instance().thriftyHandsRequiredLevel < 0 ? null : SKILLS.register("thrifty_hands", () -> register("thrifty_hands", RegistryAptitudes.BUILDING.get(), HandlerCommonConfig.HANDLER.instance().thriftyHandsRequiredLevel, HandlerResources.CONVERGENCE_SKILL));
    public static final RegistryObject<Skill> RESOURCEFUL = HandlerCommonConfig.HANDLER.instance().resourcefulRequiredLevel < 0 ? null : SKILLS.register("resourceful", () -> register("resourceful", RegistryAptitudes.BUILDING.get(), HandlerCommonConfig.HANDLER.instance().resourcefulRequiredLevel, HandlerResources.CONVERGENCE_SKILL));
    public static final RegistryObject<Skill> MASTER_CRAFTSMAN = HandlerCommonConfig.HANDLER.instance().masterCraftsmanRequiredLevel < 0 ? null : SKILLS.register("master_craftsman", () -> register("master_craftsman", RegistryAptitudes.BUILDING.get(), HandlerCommonConfig.HANDLER.instance().masterCraftsmanRequiredLevel, HandlerResources.OBSIDIAN_SMASHER_SKILL));

    // ─── MAG — Magic (already migrated in #76) ───
    public static final RegistryObject<Skill> MANA_SPARK = HandlerCommonConfig.HANDLER.instance().manaSparkRequiredLevel < 0 ? null : SKILLS.register("mana_spark", () -> register("mana_spark", RegistryAptitudes.MAGIC.get(), HandlerCommonConfig.HANDLER.instance().manaSparkRequiredLevel, HandlerResources.SAFE_PORT_SKILL));
    public static final RegistryObject<Skill> CONSERVATION_OF_MAGIC = HandlerCommonConfig.HANDLER.instance().conservationOfMagicRequiredLevel < 0 ? null : SKILLS.register("conservation_of_magic", () -> register("conservation_of_magic", RegistryAptitudes.MAGIC.get(), HandlerCommonConfig.HANDLER.instance().conservationOfMagicRequiredLevel, HandlerResources.SAFE_PORT_SKILL));
    public static final RegistryObject<Skill> MANA_BLAZE = HandlerCommonConfig.HANDLER.instance().manaBlazeRequiredLevel < 0 ? null : SKILLS.register("mana_blaze", () -> register("mana_blaze", RegistryAptitudes.MAGIC.get(), HandlerCommonConfig.HANDLER.instance().manaBlazeRequiredLevel, HandlerResources.LIFE_EATER_SKILL));
    public static final RegistryObject<Skill> MYSTIC_WARD = HandlerCommonConfig.HANDLER.instance().mysticWardRequiredLevel < 0 ? null : SKILLS.register("mystic_ward", () -> register("mystic_ward", RegistryAptitudes.MAGIC.get(), HandlerCommonConfig.HANDLER.instance().mysticWardRequiredLevel, HandlerResources.LIFE_EATER_SKILL));
    public static final RegistryObject<Skill> MANA_INFERNO = HandlerCommonConfig.HANDLER.instance().manaInfernoRequiredLevel < 0 ? null : SKILLS.register("mana_inferno", () -> register("mana_inferno", RegistryAptitudes.MAGIC.get(), HandlerCommonConfig.HANDLER.instance().manaInfernoRequiredLevel, HandlerResources.WORMHOLE_STORAGE_SKILL));

    // ─── LCK — Luck ───
    public static final RegistryObject<Skill> LUCKY_CHARM = HandlerCommonConfig.HANDLER.instance().luckyCharmRequiredLevel < 0 ? null : SKILLS.register("lucky_charm", () -> register("lucky_charm", RegistryAptitudes.LUCK.get(), HandlerCommonConfig.HANDLER.instance().luckyCharmRequiredLevel, HandlerResources.LUCKY_DROP_SKILL));
    public static final RegistryObject<Skill> LUCKY_STRIKE = HandlerCommonConfig.HANDLER.instance().luckyStrikeRequiredLevel < 0 ? null : SKILLS.register("lucky_strike", () -> register("lucky_strike", RegistryAptitudes.LUCK.get(), HandlerCommonConfig.HANDLER.instance().luckyStrikeRequiredLevel, HandlerResources.CRITICAL_ROLL_SKILL));
    public static final RegistryObject<Skill> FORTUNES_FAVOR = HandlerCommonConfig.HANDLER.instance().fortunesFavorRequiredLevel < 0 ? null : SKILLS.register("fortunes_favor", () -> register("fortunes_favor", RegistryAptitudes.LUCK.get(), HandlerCommonConfig.HANDLER.instance().fortunesFavorRequiredLevel, HandlerResources.LUCKY_DROP_SKILL));
    public static final RegistryObject<Skill> TREASURE_SENSE = HandlerCommonConfig.HANDLER.instance().treasureSenseRequiredLevel < 0 ? null : SKILLS.register("treasure_sense", () -> register("treasure_sense", RegistryAptitudes.LUCK.get(), HandlerCommonConfig.HANDLER.instance().treasureSenseRequiredLevel, HandlerResources.LIMIT_BREAKER_SKILL));
    public static final RegistryObject<Skill> MOTHERLODE = HandlerCommonConfig.HANDLER.instance().motherlodeRequiredLevel < 0 ? null : SKILLS.register("motherlode", () -> register("motherlode", RegistryAptitudes.LUCK.get(), HandlerCommonConfig.HANDLER.instance().motherlodeRequiredLevel, HandlerResources.LIMIT_BREAKER_SKILL));

    private static Skill register(String name, Aptitude aptitude, int requiredLvl, ResourceLocation texture, Value... configValues) {
        ResourceLocation key = new ResourceLocation(JustLevelingFork.MOD_ID, name);
        return new Skill(key, aptitude, requiredLvl, texture, configValues);
    }

    public static void load(IEventBus eventBus) {
        SKILLS.register(eventBus);
    }

    public static Skill getSkill(String skillName) {
        return SKILLS_REGISTRY.get().getValues().stream().collect(Collectors.toMap(Skill::getName, Skill::get)).get(skillName);
    }
}
