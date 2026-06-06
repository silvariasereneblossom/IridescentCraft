package net.royling.lovelysparklepieces.mixin;

import net.minecraftforge.registries.ForgeRegistries;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.Registries;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.EnchantmentMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.minecraft.world.item.enchantment.Enchantments;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.List;

import static net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary.EnchantEyeItem.hasEye;

@Mixin(EnchantmentMenu.class)
public abstract class EnchantmentMenuMixin {
    @Shadow @Final public int[] costs;
    @Shadow @Final private RandomSource random;
    @Shadow @Final private Container enchantSlots;
    @Shadow @Final private ContainerLevelAccess access;

    @Shadow protected abstract List<EnchantmentInstance> getEnchantmentList(RegistryAccess registryAccess, ItemStack stack, int slot, int cost);

    @Shadow @Final public int[] levelClue;
    @Shadow @Final public int[] enchantClue;
    @Unique private Inventory playerInventory;
    @Unique
    private static final ThreadLocal<Player> CURRENT_PLAYER = new ThreadLocal<>();
    @Inject(method = "<init>(ILnet/minecraft/world/entity/player/Inventory;Lnet/minecraft/world/inventory/ContainerLevelAccess;)V",
    at = @At("TAIL"))
    private void capturePlayerInventory(int containerId, Inventory playerInventory, ContainerLevelAccess access, CallbackInfo ci){
        this.playerInventory =playerInventory;
    }
    @Inject(method = "getEnchantmentList",at=@At("RETURN"),cancellable = true)
    private void modifyEnchantments(RegistryAccess registryAccess, ItemStack stack, int slot, int cost, CallbackInfoReturnable<List<EnchantmentInstance>> cir){
        Player player = this.playerInventory.player;
        if(!hasEye(player)) return;
        if(SoulData.getSouls(player)<5)return;
        List<EnchantmentInstance>list = cir.getReturnValue();
        int boostedLevel =this.costs[slot]+5;
        this.costs[slot]=boostedLevel;
        this.levelClue[slot]+=5;
        this.enchantClue[slot]+=5;
        // Remove unused registry fetch
        if (boostedLevel>=30){
            float random1 = this.random.nextFloat();
            if(random1<0.5f){
                boolean hasMending = list.stream().anyMatch(e->e.enchantment== Enchantments.MENDING);
                if(!hasMending){
                    if(Enchantments.MENDING.canEnchant(stack)){
                        list.add(new EnchantmentInstance(Enchantments.MENDING,1));
                    }
                }
            }
        }
    }

    @Inject(method = "clickMenuButton",at=@At("RETURN"),cancellable = true)
    private void removeSoul(Player player, int id, CallbackInfoReturnable<Boolean> cir){
        if(player.level().isClientSide)return;
        if(player.isCreative())return;
        if(SoulData.getSouls(player)>=5)
            SoulData.removeSoul(player,5);
    }
}
