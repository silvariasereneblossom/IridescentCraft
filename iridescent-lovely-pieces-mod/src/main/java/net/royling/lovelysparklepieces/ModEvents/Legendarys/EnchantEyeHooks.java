package net.royling.lovelysparklepieces.ModEvents.Legendarys;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraftforge.registries.ForgeRegistries;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary.EnchantEyeItem;
import net.royling.lovelysparklepieces.PlayerData.SoulData;

import org.jetbrains.annotations.Nullable;
import java.util.List;

/**
 * IRIDESCENT: the Eye of Enchantment rules, shared by the two enchanting-menu mixins (vanilla
 * {@code EnchantmentMenu} and Apotheosis' {@code ApothEnchantmentMenu}, which replaces the vanilla table
 * whenever its enchanting module is on). Kept out of the mixin package so normal code can load it.
 *
 * What the item says it does: with the Eye equipped and 5 souls, an enchant is rolled 5 levels higher
 * and costs 5 souls; at enchanting level 35 a "unique" enchantment (Mending) can appear; the table's
 * preview is not boosted ("preview information will no longer be reliable").
 */
public final class EnchantEyeHooks {
    public static final int LEVEL_BONUS = 5;
    public static final int SOUL_COST = 5;
    public static final int UNIQUE_LEVEL = 35;
    private static final ResourceLocation APOTH_INFUSION = new ResourceLocation("apotheosis", "infusion");

    private EnchantEyeHooks() {
    }

    /** Server side only: the clicking player wears the Eye and can pay for the boost. */
    public static boolean canBoost(@Nullable Player player) {
        return player != null
                && !player.level().isClientSide
                && SoulData.getSouls(player) >= SOUL_COST
                && EnchantEyeItem.hasEye(player);
    }

    /**
     * Called with the list a boosted roll just produced.
     *
     * @return true when the roll is a real Eye enchant, i.e. the souls must be charged
     */
    public static boolean finishBoostedRoll(@Nullable Player player, ItemStack stack, int boostedLevel, @Nullable List<EnchantmentInstance> list) {
        if (player == null || list == null || list.isEmpty()) {
            return false; // nothing gets enchanted, so nothing is charged
        }
        for (EnchantmentInstance instance : list) {
            // Apotheosis marks an infusion recipe with this placeholder; the level plays no part in it.
            if (APOTH_INFUSION.equals(ForgeRegistries.ENCHANTMENTS.getKey(instance.enchantment))) {
                return false;
            }
        }
        if (boostedLevel >= UNIQUE_LEVEL && player.getRandom().nextFloat() < 0.5F) {
            addMending(stack, list);
        }
        return true;
    }

    private static void addMending(ItemStack stack, List<EnchantmentInstance> list) {
        Enchantment mending = Enchantments.MENDING;
        boolean allowed = stack.is(Items.BOOK) ? mending.isAllowedOnBooks() : mending.canEnchant(stack);
        if (!allowed) {
            return;
        }
        for (EnchantmentInstance instance : list) {
            if (instance.enchantment == mending || !instance.enchantment.isCompatibleWith(mending)) {
                return; // already there, or would make an illegal pair (e.g. Infinity)
            }
        }
        try {
            list.add(new EnchantmentInstance(mending, 1));
        } catch (UnsupportedOperationException ignored) {
            // another mod handed back an immutable list - keep its result untouched
        }
    }

    /** Pays for one boosted enchant. Creative players are not charged (unchanged from the original). */
    public static void charge(Player player) {
        if (player.level().isClientSide || player.isCreative()) {
            return;
        }
        SoulData.removeSoul(player, SOUL_COST);
    }
}
