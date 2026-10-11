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

    // IridescentCraft patch: ONE holder per provider. Upstream built a brand-new,
    // never-invalidated LazyOptional on every getCapability call -- and this cap is
    // queried several times per player every 10 ticks plus on every XP pickup -- so
    // each query allocated a wrapper + lambda, and nobody holding one was ever told
    // the player had gone away. The holder is invalidated when the owning player's
    // caps are (CapabilityRegistry wires invalidate() via
    // AttachCapabilitiesEvent#addListener, the attached-provider equivalent of
    // overriding invalidateCaps()).
    private LazyOptional<IAccuratedExp> holder = LazyOptional.of(() -> instance);

    @Override
    public @NotNull <T> LazyOptional<T> getCapability(@NotNull Capability<T> cap, @Nullable Direction side) {
        if (cap != ACCURATED_EXP) {
            return LazyOptional.empty();
        }
        // DO NOT "simplify" this re-creation away. The owning entity answers empty
        // by itself while its caps are invalid, so a dead holder is only ever seen
        // here after Entity#reviveCaps() -- and that is ROUTINE for players: Forge's
        // ServerPlayer.changeDimension / cross-dimension teleportTo do
        // removePlayerImmediately (-> invalidateCaps) then revive() on the SAME
        // player object, on every portal trip. A LazyOptional cannot be
        // un-invalidated, so without a fresh one the capability would stay empty
        // for the rest of the session after a player's first dimension change (all
        // XP silently dropped). Hand out a new holder instead: present exactly when
        // the parent is valid, as it always was.
        if (!holder.isPresent()) {
            holder = LazyOptional.of(() -> instance);
        }
        return holder.cast();
    }

    /** Called when the owning entity's capabilities are invalidated (removal / death / unload). */
    public void invalidate() {
        holder.invalidate();
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
