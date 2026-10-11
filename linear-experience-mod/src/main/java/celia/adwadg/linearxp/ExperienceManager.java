package celia.adwadg.linearxp;

import celia.adwadg.linearxp.Config.ExpConfig;

/**
 * Live view of the XP-curve settings in {@code linear-xp.toml}.
 *
 * IridescentCraft patch: upstream copied every value into a static field when
 * this class was first touched, so an edit to linear-xp.toml did nothing until
 * the next restart (even though Forge hot-reloads the file). These accessors
 * read the config spec on every call instead — {@code ConfigValue.get()} is a
 * cached field read that Forge invalidates on reload, so it is as cheap as the
 * old static and always current.
 */
public class ExperienceManager {
    public static ExperienceType xpMode() {
        return StandlizeXPMODE(ExpConfig.CALCULATEMODE.get());
    }

    public static int staticXp() {
        return ExpConfig.STATICXPNEED.get();
    }

    public static int linearBase() {
        return ExpConfig.LINEARBASEXP.get();
    }

    public static int linearAddition() {
        return ExpConfig.LINEARADDITION.get();
    }

    public static String formula() {
        return ExpConfig.FORMULA.get();
    }

    public static int formulaBase() {
        return ExpConfig.FORMULABASE.get();
    }

    public static ExperienceType StandlizeXPMODE(String MODE){
        return switch (MODE) {
            case "STATIC" -> ExperienceType.STATIC;
            case "LINEAR" -> ExperienceType.LINEAR;
            case "FORMULA" -> ExperienceType.FORMULA;
            default -> invaidmodedeal();
        };
    }
    private static ExperienceType invaidmodedeal(){
        ExpConfig.CALCULATEMODE.set("STATIC");
        return ExperienceType.STATIC;
    }
}
