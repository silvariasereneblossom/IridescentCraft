package net.royling.lovelysparklepieces;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.server.ServerStartingEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.royling.lovelysparklepieces.ClientEvent.Particle.DamageNumberParticle;
import net.royling.lovelysparklepieces.ClientEvent.Particle.ModParticles;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;
import net.royling.lovelysparklepieces.ModCommand.ModCommands;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModCreative.ModCreative;
import net.royling.lovelysparklepieces.ModEffect.ModMobEffects;
import net.royling.lovelysparklepieces.ModEntity.Butterfly.SoulButterflyRenderer;
import net.royling.lovelysparklepieces.ModEntity.ModEntities;
import net.royling.lovelysparklepieces.ModEvents.Gamblers.GamblersEvents;
import net.royling.lovelysparklepieces.ModEvents.HeartSystem;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BCEvents;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BowHandler;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.NewbieUmbrellaEvent;
import net.royling.lovelysparklepieces.ModEvents.PlayerDamageModifierEvent;
import net.royling.lovelysparklepieces.ModEvents.PlayerJoinHandler;
import net.royling.lovelysparklepieces.ModEvents.Rings.AutoSmeltHandler;
import net.royling.lovelysparklepieces.ModEvents.boot.DoubleJumpEvent;
import net.royling.lovelysparklepieces.ModEvents.boot.SteelBoot;
import net.royling.lovelysparklepieces.ModEvents.necklace.LavaDefance;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCuriosRender.MagmaAmuletRender;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;
import net.royling.lovelysparklepieces.ModSounds.ModSounds;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import net.royling.lovelysparklepieces.PlayerData.TemperatureData;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import org.slf4j.Logger;
import com.mojang.logging.LogUtils;
import top.theillusivec4.curios.api.client.CuriosRendererRegistry;
import net.minecraftforge.fml.config.ModConfig;

@Mod(LovelySparklePieces.MODID)
public class LovelySparklePieces {
    public static final String MODID = "lovely_sparkle_pieces";
    public static final Logger LOGGER = LogUtils.getLogger();
    
    public static ResourceLocation resLoc(String path) {
        return new ResourceLocation(MODID, path);
    }

    public LovelySparklePieces() {
        IEventBus modEventBus = FMLJavaModLoadingContext.get().getModEventBus();
        
        // 注册配置
        ModLoadingContext.get().registerConfig(ModConfig.Type.COMMON, LSPConfig.SPEC);
        
        // 注册到 mod 事件总线
        modEventBus.addListener(this::commonSetup);
        modEventBus.addListener(this::clientSetup);
        modEventBus.addListener(this::addCreative);
        
        // 注册所有的 DeferredRegister
        ModCurios.ITEMS.register(modEventBus);
        ModBlocks.BLOCKS.register(modEventBus);
        ModBlocks.BLOCK_ITEMS.register(modEventBus);
        ModItems.ITEMS.register(modEventBus);
        ModCreative.CREATIVE_MODE_TABS.register(modEventBus);
        ModAttribute.ATTRIBUTES.register(modEventBus);
        ModEntities.ENTITIES.register(modEventBus);
        ModParticles.register(modEventBus);
        ModMobEffects.MOB_EFFECTS.register(modEventBus);
        ModSounds.SOUNDS.register(modEventBus);

        // 注册到 Forge 事件总线
        MinecraftForge.EVENT_BUS.register(this);
        MinecraftForge.EVENT_BUS.register(PlayerJoinHandler.class);
        MinecraftForge.EVENT_BUS.register(SoulData.class);
        MinecraftForge.EVENT_BUS.register(ChipsData.class);
        MinecraftForge.EVENT_BUS.register(TemperatureData.class);
        MinecraftForge.EVENT_BUS.register(PlayerDamageModifierEvent.class);
        MinecraftForge.EVENT_BUS.register(BCEvents.class);
        MinecraftForge.EVENT_BUS.register(GamblersEvents.class);
        MinecraftForge.EVENT_BUS.register(BowHandler.class);
        MinecraftForge.EVENT_BUS.register(SteelBoot.class);
        MinecraftForge.EVENT_BUS.register(DoubleJumpEvent.class);
        MinecraftForge.EVENT_BUS.register(LavaDefance.class);
        MinecraftForge.EVENT_BUS.register(HeartSystem.class);
        MinecraftForge.EVENT_BUS.register(NewbieUmbrellaEvent.class);
        MinecraftForge.EVENT_BUS.register(AutoSmeltHandler.class);
    }
    
    private void commonSetup(final FMLCommonSetupEvent event) {
        event.enqueueWork(() -> {
            // 注册网络
            NetworkHandler.register();
        });
    }
    
    private void clientSetup(final FMLClientSetupEvent event) {
        // 注册实体渲染器
        EntityRenderers.register(ModEntities.BUTTERFLY.get(), SoulButterflyRenderer::new);
        
        event.enqueueWork(() -> {
            // 注册粒子
            Minecraft.getInstance().particleEngine.register(
                ModParticles.DAMAGE_NUMBER_PARTICLE.get(), 
                new DamageNumberParticle.Provider()
            );
            // 注册 Curios 渲染器
            CuriosRendererRegistry.register(ModCurios.MAGMA_AMULET.get(), MagmaAmuletRender::new);
        });
    }
    
    private void addCreative(BuildCreativeModeTabContentsEvent event) {
        // 创造模式物品添加
    }
    
    @SubscribeEvent
    public void onServerStarting(ServerStartingEvent event) {
        // 服务器启动事件
    }
    
    @SubscribeEvent
    public void onRegisterCommands(RegisterCommandsEvent event) {
        ModCommands.register(event.getDispatcher());
    }
}