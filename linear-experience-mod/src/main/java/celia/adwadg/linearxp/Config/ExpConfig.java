package celia.adwadg.linearxp.Config;

import celia.adwadg.linearxp.ExperienceType;
import net.minecraftforge.common.ForgeConfigSpec;

public class ExpConfig {
    public static final ForgeConfigSpec.Builder BUILDER = new ForgeConfigSpec.Builder();
    public static final ForgeConfigSpec SPEC;
    public static final ForgeConfigSpec.ConfigValue<Boolean> ISENABLE;
    public static final ForgeConfigSpec.ConfigValue<String> CALCULATEMODE;
    public static final ForgeConfigSpec.ConfigValue<Integer> STATICXPNEED;
    public static final ForgeConfigSpec.ConfigValue<Integer> LINEARBASEXP;
    public static final ForgeConfigSpec.ConfigValue<Integer> LINEARADDITION;
    public static final ForgeConfigSpec.ConfigValue<String> FORMULA;
    public static final ForgeConfigSpec.ConfigValue<Integer> FORMULABASE;

    static {
        BUILDER.push("general");
        ISENABLE = BUILDER
                .comment("是否启用经验计算修改")
                .define("enableXpCalculationModifier",true);
        CALCULATEMODE = BUILDER
                .comment("经验计算模式 LINEAR/STATIC/FORMULA")
                .define("calculateMode","STATIC");
        BUILDER.pop();
        BUILDER.push("mode settings");
        BUILDER.push("linear");
        LINEARBASEXP = BUILDER
                .comment("线性基础经验值")
                .defineInRange("linearBaseXp",100,1,10000);
        LINEARADDITION = BUILDER
                .comment("线性经验增量")
                .defineInRange("LinearXpAddition",1,1,10000);
        BUILDER.pop();
        BUILDER.push("static");
        STATICXPNEED = BUILDER
                .comment("固定升级所需经验值")
                .defineInRange("staticModeXpNeeded",100,1,10000);
        BUILDER.pop();
        BUILDER.push("formula");
        FORMULA = BUILDER
                .comment("公式模式计算公式（注意括号使用,可用参数base,level,分别对应设置的公式基础经验与玩家等级）")
                .define("formula","base+((level*level)*10)");
        FORMULABASE = BUILDER
                .comment("公式模式基础经验（可选）")
                .defineInRange("formulaBaseXp",100,1,10000);
        BUILDER.pop();
        BUILDER.pop();
        SPEC = BUILDER.build();
    }
}
