package net.royling.lovelysparklepieces.ModEvents.Legendarys;

import net.minecraft.ChatFormatting;

import net.minecraft.core.NonNullList;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.living.LivingDropsEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.inventory.ICurioStacksHandler;
import top.theillusivec4.curios.api.type.inventory.IDynamicStackHandler;

import java.util.*;

/**
 * Newbie Umbrella: "no longer drops items everywhere upon death".
 *
 * IRIDESCENT rewrite. Upstream copied the dying player's inventory + curios into a static in-memory map at
 * LivingDeathEvent, wiped ALL drops, and put the copies back at respawn. That lost everything when the
 * server stopped or crashed while the player sat on the death screen, kept the entry forever for a player
 * who never respawned, deleted drops that were not part of the saved inventory, and could duplicate:
 * anything another handler kept or took (keepInventory, a soulbound enchant, a grave) was handed back a
 * second time, and a death cancelled after the snapshot left a stale copy that the next "respawn"
 * (leaving the End counts as one) wrote over the live inventory.
 *
 * Now:
 *  1. death (LOWEST, not cancelled): remember WHERE every stack sits. Nothing is saved yet; the note is
 *     only valid for the tick it was made in.
 *  2. drops: a stack is saved only if that very object is in the drop list - i.e. it really left the
 *     player. It is written into the player's {@code PlayerPersisted} data (stored in the player file,
 *     copied to the respawned player by Forge) and its item entity is taken out of the drops. Stacks
 *     somebody else kept are not ours to restore; drops that are not from the inventory fall as usual.
 *  3. respawn - or login, if the server went down in between: the saved data is removed first, then each
 *     stack goes back to its slot if that is free, otherwise into the inventory / at the player's feet.
 *     Every saved stack therefore comes back exactly once.
 */
@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID)
public class NewbieUmbrellaEvent {
    /** Inside the player's PlayerPersisted compound: a list with one compound per protected death. */
    private static final String SAVED_KEY = "lsp_umbrella_saved";
    private static final String GROUP_MAIN = "main";
    private static final String GROUP_ARMOR = "armor";
    private static final String GROUP_OFFHAND = "offhand";
    private static final String GROUP_CURIO = "curio";
    private static final String GROUP_COSMETIC = "cosmetic";

    /** Death notes waiting for their LivingDropsEvent (same tick). Never the store of record. */
    private static final Map<UUID, DeathNote> PENDING = new HashMap<>();

    private record Entry(String group, String curioSlot, int index, ItemStack stack) {}

    private record DeathNote(long gameTime, List<Entry> entries) {}

    @SubscribeEvent(priority = EventPriority.LOWEST)
    public static void onPlayerDeath(LivingDeathEvent event){
        if(!(event.getEntity() instanceof ServerPlayer player)) return;
        PENDING.remove(player.getUUID());
        if (!ModCurios.hasCurio(player, ModCurios.NEWBIE_UMBRELLA.get())) return;
        List<Entry> entries = new ArrayList<>();
        Inventory inventory = player.getInventory();
        note(entries, GROUP_MAIN, inventory.items);
        note(entries, GROUP_ARMOR, inventory.armor);
        note(entries, GROUP_OFFHAND, inventory.offhand);
        CuriosApi.getCuriosInventory(player).ifPresent(handler -> handler.getCurios().forEach((id, slot) -> {
            note(entries, GROUP_CURIO, id, slot.getStacks());
            note(entries, GROUP_COSMETIC, id, slot.getCosmeticStacks());
        }));
        PENDING.put(player.getUUID(), new DeathNote(player.level().getGameTime(), entries));
    }

    private static void note(List<Entry> entries, String group, NonNullList<ItemStack> stacks) {
        for (int i = 0; i < stacks.size(); i++) {
            ItemStack stack = stacks.get(i);
            if (!stack.isEmpty()) entries.add(new Entry(group, "", i, stack));
        }
    }

    private static void note(List<Entry> entries, String group, String curioSlot, IDynamicStackHandler stacks) {
        for (int i = 0; i < stacks.getSlots(); i++) {
            ItemStack stack = stacks.getStackInSlot(i);
            if (!stack.isEmpty()) entries.add(new Entry(group, curioSlot, i, stack));
        }
    }

    // NORMAL priority on purpose: after Curios (HIGHEST) has moved the curios into the drops, before
    // grave / corpse mods (LOWEST) collect what is left.
    @SubscribeEvent
    public static void onPlayerDrops(LivingDropsEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        DeathNote note = PENDING.remove(player.getUUID());
        if (note == null || note.gameTime() != player.level().getGameTime()) return;

        Map<ItemStack, ItemEntity> dropped = new IdentityHashMap<>();
        for (ItemEntity drop : event.getDrops()) {
            dropped.put(drop.getItem(), drop);
        }
        // Pair every noted stack with the item entity that carries it. remove(), not get(): one dropped
        // stack can satisfy one slot only, so nothing can ever be saved twice.
        List<Entry> leaving = new ArrayList<>();
        Set<ItemEntity> taken = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Entry entry : note.entries()) {
            if (entry.stack().isEmpty()) continue;
            ItemEntity drop = dropped.remove(entry.stack());
            if (drop != null) {
                leaving.add(entry);
                taken.add(drop);
            }
        }
        if (leaving.isEmpty()) return; // nothing left the player (keepInventory...): no wear, no taunt

        // one use of the umbrella; a broken one is gone (an emptied stack is skipped below)
        for (Entry entry : note.entries()) {
            ItemStack stack = entry.stack();
            if (GROUP_CURIO.equals(entry.group()) && stack.is(ModCurios.NEWBIE_UMBRELLA.get())) {
                stack.setDamageValue(stack.getDamageValue() + 1);
                if (stack.getDamageValue() >= stack.getMaxDamage()) {
                    stack.shrink(1);
                }
                break;
            }
        }

        ListTag items = new ListTag();
        for (Entry entry : leaving) {
            if (entry.stack().isEmpty()) continue; // the umbrella that just broke
            CompoundTag tag = new CompoundTag();
            tag.putString("Group", entry.group());
            tag.putString("Id", entry.curioSlot());
            tag.putInt("Slot", entry.index());
            tag.put("Item", entry.stack().save(new CompoundTag()));
            items.add(tag);
        }
        event.getDrops().removeIf(taken::contains);

        if (!items.isEmpty()) {
            CompoundTag save = new CompoundTag();
            save.put("Items", items);
            CompoundTag root = player.getPersistentData();
            CompoundTag persisted = root.getCompound(Player.PERSISTED_NBT_TAG);
            // a list, appended to: an earlier save that was never handed back must not be overwritten
            ListTag saves = persisted.getList(SAVED_KEY, Tag.TAG_COMPOUND);
            saves.add(save);
            persisted.put(SAVED_KEY, saves);
            root.put(Player.PERSISTED_NBT_TAG, persisted);
        }
        sendInsultMessage(player);
    }

    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) {
            restore(player);
        }
    }

    // The server stopped (or crashed after a save) between death and respawn: a player who logs back in
    // dead respawns and is handled above; this covers one who is somehow alive with items still parked.
    @SubscribeEvent
    public static void onPlayerLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player && player.isAlive()) {
            restore(player);
        }
    }

    @SubscribeEvent
    public static void onPlayerLogout(PlayerEvent.PlayerLoggedOutEvent event) {
        PENDING.remove(event.getEntity().getUUID());
    }

    private static void restore(ServerPlayer player) {
        CompoundTag root = player.getPersistentData();
        if (!root.contains(Player.PERSISTED_NBT_TAG, Tag.TAG_COMPOUND)) return;
        CompoundTag persisted = root.getCompound(Player.PERSISTED_NBT_TAG);
        if (!persisted.contains(SAVED_KEY, Tag.TAG_LIST)) return;
        ListTag saves = persisted.getList(SAVED_KEY, Tag.TAG_COMPOUND);
        // Gone from the player data BEFORE anything is handed back: whatever happens below, a saved stack
        // can never be restored twice.
        persisted.remove(SAVED_KEY);
        for (int s = 0; s < saves.size(); s++) {
            ListTag items = saves.getCompound(s).getList("Items", Tag.TAG_COMPOUND);
            for (int i = 0; i < items.size(); i++) {
                CompoundTag tag = items.getCompound(i);
                ItemStack stack = ItemStack.EMPTY;
                try {
                    stack = ItemStack.of(tag.getCompound("Item"));
                    if (stack.isEmpty()) continue;
                    if (!putBack(player, tag.getString("Group"), tag.getString("Id"), tag.getInt("Slot"), stack)) {
                        player.getInventory().placeItemBackInInventory(stack);
                    }
                } catch (RuntimeException e) {
                    LovelySparklePieces.LOGGER.error("[LSP] Newbie Umbrella could not put back {} for {}", tag, player.getGameProfile().getName(), e);
                    if (!stack.isEmpty()) {
                        player.drop(stack, false); // last resort: at their feet rather than lost
                    }
                }
            }
        }
    }

    /** Puts the stack into the slot it came from, if that slot still exists and is free. */
    private static boolean putBack(ServerPlayer player, String group, String curioSlot, int index, ItemStack stack) {
        Inventory inventory = player.getInventory();
        switch (group) {
            case GROUP_MAIN:
                return putIfFree(inventory.items, index, stack);
            case GROUP_ARMOR:
                return putIfFree(inventory.armor, index, stack);
            case GROUP_OFFHAND:
                return putIfFree(inventory.offhand, index, stack);
            case GROUP_CURIO:
            case GROUP_COSMETIC:
                boolean cosmetic = GROUP_COSMETIC.equals(group);
                return CuriosApi.getCuriosInventory(player).resolve().map(handler -> {
                    ICurioStacksHandler slot = handler.getCurios().get(curioSlot);
                    if (slot == null) return false;
                    IDynamicStackHandler stacks = cosmetic ? slot.getCosmeticStacks() : slot.getStacks();
                    if (index < 0 || index >= stacks.getSlots() || !stacks.getStackInSlot(index).isEmpty()) return false;
                    stacks.setStackInSlot(index, stack);
                    return true;
                }).orElse(false);
            default:
                return false;
        }
    }

    private static boolean putIfFree(NonNullList<ItemStack> stacks, int index, ItemStack stack) {
        if (index < 0 || index >= stacks.size() || !stacks.get(index).isEmpty()) return false;
        stacks.set(index, stack);
        return true;
    }

    private static void sendInsultMessage(ServerPlayer player) {
        List<? extends String> messages = LSPConfig.INSULT_MESSAGES.get();
        Component message = messages.isEmpty() ?
                createDefaultMessage() :
                createRandomMessage(messages, player.level().getRandom());
        player.sendSystemMessage(message, false);
    }
    private static Component createDefaultMessage() {
        return Component.translatable("lsp.newbie.newbie").withStyle(ChatFormatting.AQUA);
    }
    private static Component createRandomMessage(List<? extends String> messages, RandomSource random) {
        String rawMessage = messages.get(random.nextInt(messages.size()));
        return rawMessage.startsWith("text:") ?
                Component.literal(rawMessage.substring(5)).withStyle(ChatFormatting.AQUA) :
                Component.translatable(rawMessage).withStyle(ChatFormatting.AQUA);
    }
}
