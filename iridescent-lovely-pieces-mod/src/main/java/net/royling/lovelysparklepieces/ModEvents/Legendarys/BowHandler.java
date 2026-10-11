package net.royling.lovelysparklepieces.ModEvents.Legendarys;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.ArrowItem;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.EntityJoinLevelEvent;
import net.minecraftforge.event.entity.living.LivingGetProjectileEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.player.ArrowLooseEvent;
import net.minecraftforge.fml.util.ObfuscationReflectionHelper;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary.SoulQuiverItem;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.PlayerData.SoulData;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class BowHandler {
    private static final String QUIVER_CHECKED = "lsp_quiver_checked";
    private static final String SOUL_ARROW = "isSoulArrow";

    /** Arrows fired this tick by a quiver wearer; settled at the end of the same server tick. */
    private static final List<AbstractArrow> PENDING_ARROWS = new ArrayList<>();
    private static Method getPickupItem;
    private static boolean pickupLookupFailed;

    /*@SubscribeEvent
    public static void onArrowLoose(EntityJoinLevelEvent event){
        if(!((event.getEntity())instanceof Arrow arrow))return;
        if(!(arrow.getOwner()instanceof Player player))return;
        if(player.level().isClientSide)return;
        if(SoulData.getSouls(player)>0 && SoulQuiverItem.hasSoulQuiver(player)){
            if(!player.isCreative()){
                SoulData.removeSoul(player,1);
            }
            arrow.pickup = AbstractArrow.Pickup.DISALLOWED;
            arrow.setRemainingFireTicks(20);
        }
    }*/

    /**
     * IRIDESCENT: Soul Quiver - "usable even without arrows in inventory".
     *
     * Replaces the upstream mixin on the static {@code ProjectileWeaponItem.getHeldProjectile}. That hook
     * has no idea which weapon is asking, so it handed a free arrow to EVERY projectile weapon: a crossbow
     * loaded a real arrow for no souls (fire, pick the arrow up, repeat), and modded launchers with their
     * own ammo got an arrow they never asked for. Forge fires this event from {@code Player.getProjectile}
     * with the weapon stack, so the stand-in arrow is limited to bows - the only weapons whose shot
     * {@link #onArrowLoose2} turns into a soul arrow. (Tetra's modular bow asks with a vanilla bow stack,
     * so it is covered.) Runs on both sides: the client needs it to start drawing.
     */
    @SubscribeEvent
    public static void onGetProjectile(LivingGetProjectileEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        if (!(event.getProjectileWeaponItemStack().getItem() instanceof BowItem)) return;
        // per-tick snapshot, not a live curio scan: ammo HUDs call getProjectile every frame
        if (SoulData.getSouls(player) <= 0 || !ModCurios.wornThisTick(player).contains(ModCurios.SOUL_QUIVER.get())) return;
        // Always the stand-in, even when real arrows are carried: the shot is replaced by a soul arrow, and
        // a stand-in keeps the client's predicted "consume one arrow" off the real stack (no ghost count).
        event.setProjectileItemStack(new ItemStack(Items.ARROW));
    }

    @SubscribeEvent
    public static void onArrowLoose2(ArrowLooseEvent event){
        Player player = event.getEntity();
        if(player.level().isClientSide)return;
        ItemStack bow =event.getBow();
        if(SoulData.getSouls(player)>0&&SoulQuiverItem.hasSoulQuiver(player)){
            event.setCanceled(true);
            int charge = event.getCharge();
            float velocity = BowItem.getPowerForTime(charge);
            if (velocity < 0.1F) return;
            Arrow arrow = new Arrow(EntityType.ARROW,player.level());
            arrow.setPos(player.getX(), player.getEyeY() - 0.1, player.getZ());
            arrow.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0F, velocity * 3.0F, 1.0F);
            arrow.setCritArrow(velocity == 1.0F);
            arrow.setRemainingFireTicks(100);
            // Power and punch enchantments are handled differently in 1.20.1
            int powerLevel = bow.getEnchantmentLevel(Enchantments.POWER_ARROWS);
            int punchLevel = bow.getEnchantmentLevel(Enchantments.PUNCH_ARROWS);
            if (powerLevel > 0) {
                arrow.setBaseDamage(arrow.getBaseDamage() + (double)powerLevel * 0.5D + 0.5D);
            }
            if (punchLevel > 0) {
                arrow.setKnockback(punchLevel);
            }
            arrow.setTicksFrozen(40);
            arrow.getPersistentData().putBoolean(SOUL_ARROW,true);
            arrow.setOwner(player);
            arrow.pickup = AbstractArrow.Pickup.DISALLOWED;
            if (!player.isCreative()) {
                SoulData.removeSoul(player, 1);
            }
            player.level().addFreshEntity(arrow);
            player.level().playSound(null, player.getX(), player.getY(), player.getZ(),
                    SoundEvents.ARROW_SHOOT, SoundSource.PLAYERS, 1.0F, 1.0F);
        }
    }

    /**
     * IRIDESCENT: the quivers' "chance not to consume ammo" (Leather 25%, Woodgrain 40%, Soul 50%).
     *
     * Upstream injected into {@code ProjectileWeaponItem.useAmmo}, which only exists from 1.20.5 on - on
     * 1.20.1 the injection has no target. 1.20.1 has no shared ammo hook at all (BowItem, CrossbowItem and
     * every modded bow consume on their own), so this works from the other end: an arrow that enters the
     * world still pickup-able is an arrow that really cost its owner one item. On a successful roll that
     * item is handed straight back and the flying arrow becomes creative-only pickup.
     *
     * The swap never creates an arrow - "one arrow you could pick up" becomes "one arrow in your inventory"
     * - so there is nothing to farm; the gain is exactly the arrows a hit would have destroyed. Infinity,
     * creative and multishot side arrows are already non-pickup and are skipped.
     *
     * Step 1 (here): note arrows fired by a quiver wearer. Step 2 ({@link #onServerTickEnd}): settle them
     * at the end of the tick, when whatever fired the arrow has finished setting it up.
     */
    @SubscribeEvent
    public static void onArrowJoin(EntityJoinLevelEvent event) {
        if (event.getLevel().isClientSide() || event.loadedFromDisk()) return;
        if (!(event.getEntity() instanceof AbstractArrow arrow)) return;
        if (!(arrow.getOwner() instanceof ServerPlayer player)) return;
        if (arrow.getPersistentData().getBoolean(QUIVER_CHECKED) || arrow.getPersistentData().getBoolean(SOUL_ARROW)) return;
        // one roll per arrow, ever: the flag is saved with the arrow and survives a dimension change
        arrow.getPersistentData().putBoolean(QUIVER_CHECKED, true);
        if (quiverSaveChanceHit(player)) {
            PENDING_ARROWS.add(arrow);
        }
    }

    @SubscribeEvent
    public static void onServerTickEnd(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.END || PENDING_ARROWS.isEmpty()) return;
        List<AbstractArrow> arrows = new ArrayList<>(PENDING_ARROWS);
        PENDING_ARROWS.clear();
        for (AbstractArrow arrow : arrows) {
            try {
                refundArrow(arrow);
            } catch (RuntimeException e) {
                LovelySparklePieces.LOGGER.warn("[LSP] quiver refund failed for {}: {}", arrow, e.toString());
            }
        }
    }

    /** Independent rolls per quiver, as upstream: Leather 25%, Woodgrain 40%, Soul 50%. */
    private static boolean quiverSaveChanceHit(ServerPlayer player) {
        Set<Item> worn = ModCurios.wornThisTick(player);
        boolean saved = false;
        if (worn.contains(ModCurios.LEATHER_QUIVER.get()) && player.getRandom().nextFloat() < 0.25F) saved = true;
        if (worn.contains(ModCurios.WOOD_GRAIN_QUIVER.get()) && player.getRandom().nextFloat() < 0.4F) saved = true;
        if (worn.contains(ModCurios.SOUL_QUIVER.get()) && player.getRandom().nextFloat() < 0.5F) saved = true;
        return saved;
    }

    private static void refundArrow(AbstractArrow arrow) {
        // Not pickup-able by now = no real ammo was spent on it (Infinity, creative, multishot side arrow).
        if (arrow.pickup != AbstractArrow.Pickup.ALLOWED) return;
        if (!(arrow.getOwner() instanceof ServerPlayer player) || player.isRemoved()) return;
        ItemStack refund = pickupItemOf(arrow);
        if (refund.isEmpty() || !(refund.getItem() instanceof ArrowItem)) return; // arrows only, not tridents
        refund = refund.copy();
        refund.setCount(1);
        // the shot arrow can no longer be collected: exactly one item exists for it, and it is this one
        arrow.pickup = AbstractArrow.Pickup.CREATIVE_ONLY;
        if (!player.getInventory().add(refund)) {
            player.drop(refund, false);
        }
    }

    /** {@code AbstractArrow.getPickupItem()} is protected; SRG name m_7941_. */
    private static ItemStack pickupItemOf(AbstractArrow arrow) {
        if (pickupLookupFailed) return ItemStack.EMPTY;
        try {
            if (getPickupItem == null) {
                getPickupItem = ObfuscationReflectionHelper.findMethod(AbstractArrow.class, "m_7941_");
            }
            Object result = getPickupItem.invoke(arrow);
            return result instanceof ItemStack stack ? stack : ItemStack.EMPTY;
        } catch (Exception e) {
            pickupLookupFailed = true;
            LovelySparklePieces.LOGGER.warn("[LSP] cannot read arrow pickup items, quiver ammo saving is off: {}", e.toString());
            return ItemStack.EMPTY;
        }
    }
}
