package com.iridescentcraft.reforging.mixin;

import java.util.Collection;

import net.minecraft.world.item.ItemStack;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import se.mickelus.tetra.module.schematic.OutcomeMaterial;

/** Tetra's {@code OutcomeMaterial.itemStacks} (protected), for {@code OutcomeMaterialShareMixin}. */
@Mixin(value = OutcomeMaterial.class, remap = false)
public interface OutcomeMaterialAccessor {

    @Accessor("itemStacks")
    Collection<ItemStack> icraft$getItemStacks();

    @Accessor("itemStacks")
    void icraft$setItemStacks(Collection<ItemStack> itemStacks);
}
