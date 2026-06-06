package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.living.LivingDamageEvent;
import net.minecraftforge.event.entity.living.LivingEvent;
import net.minecraftforge.event.entity.player.ItemTooltipEvent;
import net.minecraftforge.event.TickEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.DamageParticlePacket;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModEffect.ModMobEffects;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.*;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import net.royling.lovelysparklepieces.PlayerData.TemperatureData;
import top.theillusivec4.curios.api.CuriosApi;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static java.util.Map.entry;

public class PlayerDamageModifierEvent {

    private static final Map<TagKey<DamageType>, String> DAMAGE_TYPE_MAP = Map.ofEntries(
            entry(DamageTypeTags.IS_FIRE, "fire"),
            entry(DamageTypeTags.WITCH_RESISTANT_TO, "magic"),
            entry(DamageTypeTags.IS_PROJECTILE, "arrow"),
            entry(DamageTypeTags.IS_FALL, "fall"),
            entry(DamageTypeTags.IS_LIGHTNING, "thunder"),
            entry(DamageTypeTags.IS_EXPLOSION, "explosion"),
            entry(DamageTypeTags.IS_FREEZING, "frozen")
    );
    private static final Map<TagKey<DamageType>, String> DAMAGE_TYPE_PRIORITY_MAP = new LinkedHashMap<>();
    static {
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_FIRE, "fire");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.WITCH_RESISTANT_TO, "magic");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_PROJECTILE, "arrow");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_FALL, "fall");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_LIGHTNING, "thunder");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_EXPLOSION, "explosion");
        DAMAGE_TYPE_PRIORITY_MAP.put(DamageTypeTags.IS_FREEZING, "frozen");
        // ... 你可以根据需要添加更多标签和优先级
    }
    public static String getDamageTypeString(DamageSource damageType) {
        // 遍历优先级Map
        for (Map.Entry<TagKey<DamageType>, String> entry : DAMAGE_TYPE_PRIORITY_MAP.entrySet()) {
            if (damageType.is(entry.getKey())) {
                return entry.getValue(); // 如果伤害类型包含此标签，则返回对应的字符串
            }
        }
        return "attack"; // 如果没有匹配的标签，返回一个默认值
    }

    @SubscribeEvent(priority = EventPriority.LOWEST)
    public static void onLivingHurt(LivingDamageEvent event) {
        // 获取造成伤害的实体（来源实体和直接实体）
        Entity source = event.getSource().getEntity();
        Entity direct = event.getSource().getDirectEntity();

        // 判断是否由玩家造成伤害
        Player player = null;
        if (source instanceof Player) {
            player = (Player) source;
        } else if (direct instanceof Player) {
            player = (Player) direct;
        }

        // 初始化倍率，用于最终粒子效果显示
        double magnification = 1.0;

        if (player != null) {
            // 获取初始伤害值
            double baseDamage = event.getAmount();
            double multiple = 0;
            //熔火核心
            if (ModCurios.hasCurio(player, ModCurios.BLAZE_CORE.get())) {
                if (event.getSource().is(DamageTypeTags.IS_FIRE)) {
                    if (TemperatureData.gettemperatures(player) < 50) {
                        multiple += 0.15;
                    } else if (TemperatureData.gettemperatures(player) < 100) {
                        multiple += 0.25;
                    } else {
                        multiple += 0.5;
                    }
                    if (player.hasEffect(ModMobEffects.OVERHEAT_EFFECT.get())) {
                        baseDamage = 0;
                    }
                    TemperatureData.addTemperature(player, 10);
                }
            }
            //皮革箭袋
            if (ModCurios.hasCurio(player, ModCurios.LEATHER_QUIVER.get())) {
                if (event.getSource().is(DamageTypeTags.IS_PROJECTILE)) {
                    multiple += 0.08;
                }
            }
            if (ModCurios.hasCurio(player, ModCurios.WOOD_GRAIN_QUIVER.get())) {
                if (event.getSource().is(DamageTypeTags.IS_PROJECTILE)) {
                    multiple += 0.1;
                }
            }
            if (ModCurios.hasCurio(player, ModCurios.SOUL_QUIVER.get())) {
                if (event.getSource().is(DamageTypeTags.IS_PROJECTILE)) {
                    multiple += 0.2;
                }
            }
            //神射手护目镜
            if (ModCurios.hasCurio(player, ModCurios.MARKSMAN_GOGGLES.get())) {
                if (event.getSource().is(DamageTypeTags.IS_PROJECTILE)) {
                    multiple += 0.1;
                }
            }
            //女巫帽子
            if (ModCurios.hasCurio(player, ModCurios.WITCH_HAT.get())) {
                if (event.getSource().is(DamageTypeTags.WITCH_RESISTANT_TO)) {
                    multiple += 0.1;
                }
            }
            //黄巾
            if (ModCurios.hasCurio(player, ModCurios.YELLOW_HEADSCARF.get())) {
                if (event.getSource().is(DamageTypeTags.IS_LIGHTNING)) {
                    multiple += 0.1;
                }
            }
            baseDamage *= (1 + multiple);

            // 获取“增伤”属性并进行伤害倍率计算
            AttributeInstance dmgAttr = player.getAttribute(ModAttribute.DAMAGE_MODIFIER.get());
            if (dmgAttr != null) {
                baseDamage *= dmgAttr.getValue();
            }
            // 获取“暴击率”属性，进行暴击概率判断
            AttributeInstance critAttr = player.getAttribute(ModAttribute.CRIT_CHANCE.get());
            boolean isCrit = critAttr != null && player.level().random.nextDouble() < critAttr.getValue();
            if (isCrit) {
                // 暴击成功：计算暴击倍率
                double critMultiplier = ModCurios.hasCurio(player, ModCurios.BLASPHEMOUS_CONTRACT.get()) ? 1.5 : 1.75;

                // 如果装备了“赌徒的胸花”，进行暴击加成浮动判定
                if (ModCurios.hasCurio(player, ModCurios.GAMBLERS_CORSAGE.get())) {
                    int chips = ChipsData.getChips(player);
                    double chance = chips < 2 ? 0.5 : 0.75;
                    // 消耗筹码前先检查是否处于某特殊状态（防止多次扣除）
                    if (chips >= 2 && !player.getPersistentData().getBoolean("gambler_5effect")) {
                        ChipsData.removeChip(player, 2);
                    }
                    // 根据概率微调暴击倍率（+0.25 或 -0.25）
                    boolean bonus = player.level().random.nextFloat() < chance;
                    critMultiplier += bonus ? 0.25 : -0.25;
                }

                // 应用最终暴击伤害值
                event.setAmount((float) (baseDamage * critMultiplier));
                magnification = critMultiplier;

                // TODO：这里可以添加暴击提示（粒子、音效等）
            } else {
                // 没有暴击，仅使用增伤后数值
                event.setAmount((float) baseDamage);
            }

            if (LSPConfig.IS_DAMAGE_NUM.get())
            {
                // 如果是服务端玩家，发送伤害粒子包用于客户端显示
                if (player instanceof ServerPlayer serverPlayer) {
                    // 获取目标位置
                    Vec3 pos = event.getEntity().position();
                    // 根据伤害类型标签映射到对应的展示名称
                    String damageType = DAMAGE_TYPE_MAP.entrySet().stream()
                            .filter(entry -> event.getSource().is(entry.getKey()))
                            .map(Map.Entry::getValue)
                            .findFirst()
                            .orElse("attack");
                    String damagetype = getDamageTypeString(event.getSource());
                    // 发送自定义粒子数据包
                    NetworkHandler.sendToPlayer(new DamageParticlePacket(
                            damagetype,
                            event.getAmount(),
                            pos.x,
                            pos.y + event.getEntity().getBbHeight(),
                            pos.z,
                            magnification
                    ), serverPlayer);
                }
            }
        }
    }

    @SubscribeEvent
    public static void onTooltip(ItemTooltipEvent event) {
        for (int i = 0; i < event.getToolTip().size(); i++) {
            Component component = event.getToolTip().get(i);
            String rawText = component.getString(); // 获取原始文本

            // 获取当前语言的属性名称（自动适配中英文）
            String damageKey = Component.translatable("attribute.lsp.damage_modifier").getString();

            // 构建动态正则表达式
            Pattern pattern = Pattern.compile(
                    "([+-])(\\d+\\.?\\d*)\\s*" + Pattern.quote(damageKey)
            );

            Matcher matcher = pattern.matcher(rawText);
            if (matcher.find()) {
                // 转换数值到百分比
                double value = Double.parseDouble(matcher.group(2));
                int percentage = (int) Math.round(value * 100);

                // 构建新文本（保留符号和样式）
                MutableComponent newText = Component.literal(matcher.group(1) + percentage + "% ")
                        .append(Component.translatable("attribute.lsp.damage_modifier"))
                        .withStyle(component.getStyle());

                event.getToolTip().set(i, newText);
            }
        }
    }
    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if(event.phase != TickEvent.Phase.START) return;
        if(event.player.level().isClientSide) return;
        Player player = event.player;
        List<ItemStack> equipped = getAllCurioItems(player);
        SetBonusManager.tick(player, SetBonusRegistry.ALL, equipped);
    }
    public static List<ItemStack> getAllCurioItems(Player player) {
        return CuriosApi.getCuriosInventory(player)
                .map(handler -> {
                    List<ItemStack> items = new ArrayList<>();
                    handler.getCurios().keySet().forEach(slotId -> {
                        handler.getStacksHandler(slotId).ifPresent(stacks -> {
                            for (int i = 0; i < stacks.getSlots(); i++) {
                                ItemStack stack = stacks.getStacks().getStackInSlot(i);
                                if (!stack.isEmpty()) {
                                    items.add(stack);
                                }
                            }
                        });
                    });
                    return items;
                })
                .orElse(Collections.emptyList());
    }
}
