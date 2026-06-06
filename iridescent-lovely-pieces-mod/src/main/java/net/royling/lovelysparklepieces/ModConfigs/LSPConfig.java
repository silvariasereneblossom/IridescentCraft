package net.royling.lovelysparklepieces.ModConfigs;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.common.ForgeConfigSpec;
import org.apache.commons.lang3.tuple.Pair;

import java.util.List;

public class LSPConfig {
    public static final ForgeConfigSpec.Builder BUILDER = new ForgeConfigSpec.Builder();
    public static final ForgeConfigSpec SPEC;
    public static final ForgeConfigSpec.DoubleValue MAGNET_RADIUS;
    public static final ForgeConfigSpec.DoubleValue STRONG_MAGNET_RADIUS;
    public static final ForgeConfigSpec.ConfigValue<List<? extends String>> INSULT_MESSAGES;
    public static final ForgeConfigSpec.BooleanValue IS_DAMAGE_NUM;
    public static final ForgeConfigSpec.BooleanValue IS_START_ITEM;
    static{
        BUILDER.push("PiecesSettings");
        MAGNET_RADIUS = BUILDER
                .comment("磁力戒指的吸引范围，默认5，范围1-269")
                .comment("最好不要设置的太大，可能会有性能问题")
                .comment("Radius of the Magnet Ring (Default: 5.0, Min: 1.0, Max: 269.0)")
                .comment("do not set it too large, it may cause lag")
                .defineInRange("magnetRadius", 5.0, 1.0, 269.0);

        STRONG_MAGNET_RADIUS = BUILDER
                .comment("强磁戒指的吸引范围，默认9，范围1-269")
                .comment("最好不要设置的太大，可能会有性能问题")
                .comment("Radius of the Strong Magnet Ring (Default: 9.0, Min: 1.0, Max: 269.0)")
                .comment("do not set it too large, it may cause lag")

                .defineInRange("strongMagnetRadius", 9.0, 1.0, 269.0);
        INSULT_MESSAGES=BUILDER
                .comment("当玩家在启用杂鱼保护伞饰品且keepInventory为false时死亡，发送的提示(嘲讽)消息列表")
                .comment("仅在'enableInsultMessage'设置为true时生效")
                .comment("条目可以是本地化键（如my_mod.message.death）或直接文本（以text:开头，如text:下次好运！）//别忘了双引号 英文半角字符哦")
                .comment("A list of messages to send when the player dies with the protection trinket enabled and keepInventory is false.")
                .comment("Only active if 'enableInsultMessage' is true.")
                .comment("Each entry can be a localization key (e.g., 'my_mod.message.death') or direct text starting with 'text:' (e.g., 'text:Better luck next time!').")
                .<String>defineList("DeathInsultMessages",
                        List.of("lsp.newbie.newbie",
                                "lsp.newbie.newbie1",
                                "lsp.newbie.newbie2",
                                "lsp.newbie.newbie3",
                                "lsp.newbie.newbie4",
                                "lsp.newbie.newbie5",
                                "lsp.newbie.newbie6",
                                "lsp.newbie.newbie7",
                                "lsp.newbie.newbie8",
                                "lsp.newbie.newbie9",
                                "lsp.newbie.newbie10",
                                "text:You Died!",
                                "text:死"),
                        o -> o instanceof String);
        BUILDER.pop();
        BUILDER.push("Function");

        IS_DAMAGE_NUM=BUILDER
                .comment("是否启用伤害数值？")
                .comment("Is Damage Number?")
                .define("boolean damage number",true);

        IS_START_ITEM=BUILDER
                .comment("是否启用开局物品？")
                .comment("Is Start Item?")
                .define("boolean start item",false); // IRIDESCENT FIX: no auto-grant; Blasphemous Contract enters via curated loot only
        SPEC=BUILDER.build();
    }
}
