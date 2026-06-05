package celia.adwadg.linearxp;

import celia.adwadg.linearxp.Config.ExpConfig;
import com.mojang.logging.LogUtils;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import org.slf4j.Logger;

@Mod(LinearXp.MODID)
public class LinearXp {
    public static final String MODID = "linearxp";
    public static final Logger LOGGER = LogUtils.getLogger();
    public LinearXp(){
        ModLoadingContext.get().registerConfig(ModConfig.Type.COMMON, ExpConfig.SPEC, "linear-xp.toml");
    }
}
