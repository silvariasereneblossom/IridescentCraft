package celia.adwadg.linearxp.Capability;

import celia.adwadg.linearxp.IAccuratedExp;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraftforge.common.capabilities.Capability;
import net.minecraftforge.common.capabilities.CapabilityManager;
import net.minecraftforge.common.capabilities.CapabilityToken;
import net.minecraftforge.common.capabilities.ICapabilitySerializable;
import net.minecraftforge.common.util.LazyOptional;
import org.jetbrains.annotations.NotNull;

import javax.annotation.Nullable;

public class AccuratedExpProvider implements ICapabilitySerializable<CompoundTag> {
    public static final Capability<IAccuratedExp> ACCURATED_EXP =
            CapabilityManager.get(new CapabilityToken<>() {});

    private final IAccuratedExp instance = new AccuratedExp();

    @Override
    public @NotNull <T> LazyOptional<T> getCapability(@NotNull Capability<T> cap, @Nullable Direction side) {
        return cap == ACCURATED_EXP ? LazyOptional.of(() -> instance).cast() : LazyOptional.empty();
    }

    @Override
    public CompoundTag serializeNBT() {
        CompoundTag tag = new CompoundTag();
        tag.putLong("accurated_exp", instance.getAccuratedExp());
        return tag;
    }

    @Override
    public void deserializeNBT(CompoundTag nbt) {
        if (nbt.contains("accurated_exp")) {
            instance.setAccuratedExp(nbt.getLong("accurated_exp"));
        }
    }
}