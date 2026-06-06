package net.royling.lovelysparklepieces.ModItem.ModDataComponents;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;

public class NBTHelper {
    // BoundaryStoneData
    public static void setBoundaryStoneData(ItemStack stack, BlockPos anchorPos, ResourceLocation anchorDimension) {
        CompoundTag tag = stack.getOrCreateTag();
        CompoundTag boundaryData = new CompoundTag();
        boundaryData.putLong("anchor_pos", anchorPos.asLong());
        boundaryData.putString("anchor_dimension", anchorDimension.toString());
        tag.put("boundary_stone_data", boundaryData);
    }
    
    public static boolean hasBoundaryStoneData(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        return tag != null && tag.contains("boundary_stone_data");
    }
    
    public static void removeBoundaryStoneData(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        if (tag != null) {
            tag.remove("boundary_stone_data");
        }
    }
    
    public static BlockPos getAnchorPos(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        if (tag != null && tag.contains("boundary_stone_data")) {
            CompoundTag boundaryData = tag.getCompound("boundary_stone_data");
            return BlockPos.of(boundaryData.getLong("anchor_pos"));
        }
        return BlockPos.ZERO;
    }
    
    public static ResourceLocation getAnchorDimension(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        if (tag != null && tag.contains("boundary_stone_data")) {
            CompoundTag boundaryData = tag.getCompound("boundary_stone_data");
            return new ResourceLocation(boundaryData.getString("anchor_dimension"));
        }
        return new ResourceLocation("minecraft", "overworld");
    }
    
    // EnergyComponent
    public static void setEnergy(ItemStack stack, int energy, int maxEnergy) {
        CompoundTag tag = stack.getOrCreateTag();
        tag.putInt("energy", energy);
        tag.putInt("maxEnergy", maxEnergy);
    }
    
    public static void setCurrentEnergy(ItemStack stack, int energy) {
        stack.getOrCreateTag().putInt("energy", energy);
    }
    
    public static int getEnergy(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        return tag != null ? tag.getInt("energy") : 0;
    }
    
    public static int getMaxEnergy(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        return tag != null ? tag.getInt("maxEnergy") : 0;
    }
    
    public static void chargeEnergy(ItemStack stack, int amount) {
        int currentEnergy = getEnergy(stack);
        int maxEnergy = getMaxEnergy(stack);
        int newEnergy = Math.min(currentEnergy + Math.max(amount, 0), maxEnergy);
        setCurrentEnergy(stack, newEnergy);
    }
    
    public static void dischargeEnergy(ItemStack stack, int amount) {
        int currentEnergy = getEnergy(stack);
        int newEnergy = Math.max(currentEnergy - Math.max(amount, 0), 0);
        setCurrentEnergy(stack, newEnergy);
    }
    
    public static boolean hasEnergy(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        return tag != null && tag.contains("energy");
    }
}