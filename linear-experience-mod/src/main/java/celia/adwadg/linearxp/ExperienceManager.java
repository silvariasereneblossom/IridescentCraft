package celia.adwadg.linearxp;

import celia.adwadg.linearxp.Config.ExpConfig;

public class ExperienceManager {
    public static ExperienceType XPMODE = StandlizeXPMODE(ExpConfig.CALCULATEMODE.get());
    public static Integer STATICXP = ExpConfig.STATICXPNEED.get();
    public  static Integer LINEARBASE = ExpConfig.LINEARBASEXP.get();
    public static Integer LINEARADDITION = ExpConfig.LINEARADDITION.get();
    public static String FORMULA = ExpConfig.FORMULA.get();
    public static Integer FORMULABASE = ExpConfig.FORMULABASE.get();
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
