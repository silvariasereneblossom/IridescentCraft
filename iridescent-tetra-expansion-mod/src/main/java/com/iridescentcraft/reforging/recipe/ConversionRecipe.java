package com.iridescentcraft.reforging.recipe;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmorClient;
import com.iridescentcraft.reforging.registry.ModItems;
import com.iridescentcraft.reforging.registry.ModRecipeTypes;
import net.minecraft.core.NonNullList;
import net.minecraft.core.RegistryAccess;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.inventory.CraftingContainer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraft.world.item.crafting.RecipeSerializer;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.Level;

/**
 * Conversion recipe: source armor + N material items -> reforged armor with
 * skin tag + preserved Apotheosis affix NBT + preserved enchantments.
 *
 * Uses the vanilla crafting grid (any arrangement counts) rather than a
 * smithing table. The shapeless behavior is implemented in matches() by
 * scanning the container for one matching source + the correct count of
 * matching material.
 *
 * NBT carryover on assemble():
 *   - tag.Skin              = skinId  (from this recipe's config)
 *   - tag.affix_data        = source.tag.affix_data       (if present)
 *   - tag.affixes           = source.tag.affixes          (if present)
 *   - tag.AFFIX_CACHED_OBJECT removed (recomputed by Apotheosis on next read)
 *   - Enchantments          = source.Enchantments         (if present)
 *
 * Tetra's IModularItem expects to drive its own NBT inside `tag` via the
 * workbench, so we deliberately do NOT copy module data from the source —
 * the source isn't a Tetra item to begin with.
 */
public class ConversionRecipe implements Recipe<CraftingContainer> {

    private final ResourceLocation id;
    private final Ingredient source;
    private final Ingredient material;
    private final int materialCount;
    private final String skinId;
    private final String resultSlot;       // "helmet" | "chestplate" | "leggings" | "boots"

    public ConversionRecipe(ResourceLocation id,
                            Ingredient source,
                            Ingredient material,
                            int materialCount,
                            String skinId,
                            String resultSlot) {
        this.id = id;
        this.source = source;
        this.material = material;
        this.materialCount = materialCount;
        this.skinId = skinId;
        this.resultSlot = resultSlot;
    }

    @Override
    public boolean matches(CraftingContainer container, Level level) {
        int sourceCount = 0;
        int matCount = 0;
        for (int i = 0; i < container.getContainerSize(); i++) {
            ItemStack s = container.getItem(i);
            if (s.isEmpty()) continue;
            if (source.test(s)) sourceCount += s.getCount();
            else if (material.test(s)) matCount += s.getCount();
            else return false;   // unknown extra item -> not a match
        }
        return sourceCount == 1 && matCount == materialCount;
    }

    @Override
    public ItemStack assemble(CraftingContainer container, RegistryAccess access) {
        ItemStack sourceStack = ItemStack.EMPTY;
        for (int i = 0; i < container.getContainerSize(); i++) {
            ItemStack s = container.getItem(i);
            if (!s.isEmpty() && source.test(s)) {
                sourceStack = s;
                break;
            }
        }

        ItemStack out = new ItemStack(resultItem());
        CompoundTag tag = out.getOrCreateTag();
        tag.putString(ItemModularArmorClient.SKIN_NBT_KEY, skinId);

        // Copy Apotheosis affix data so affixes survive the conversion.
        // AFFIX_CACHED_OBJECT is intentionally not copied — Apotheosis
        // recomputes that lazy cache on next read from affix_data/affixes.
        CompoundTag srcTag = sourceStack.getTag();
        if (srcTag != null) {
            if (srcTag.contains("affix_data", Tag.TAG_COMPOUND)) {
                tag.put("affix_data", srcTag.getCompound("affix_data").copy());
            }
            if (srcTag.contains("affixes", Tag.TAG_COMPOUND)) {
                tag.put("affixes", srcTag.getCompound("affixes").copy());
            }
            // Preserve enchantments — players typically invest meaningful
            // XP into specialized armor before reforging.
            if (srcTag.contains("Enchantments", Tag.TAG_LIST)) {
                tag.put("Enchantments", srcTag.getList("Enchantments", Tag.TAG_COMPOUND).copy());
            }
            // Apotheosis rarity / tier marker (if present on source).
            if (srcTag.contains("rarity", Tag.TAG_STRING)) {
                tag.putString("rarity", srcTag.getString("rarity"));
            }
        }

        return out;
    }

    private Item resultItem() {
        return switch (resultSlot) {
            case "helmet"     -> ModItems.REFORGED_HELMET.get();
            case "chestplate" -> ModItems.REFORGED_CHESTPLATE.get();
            case "leggings"   -> ModItems.REFORGED_LEGGINGS.get();
            case "boots"      -> ModItems.REFORGED_BOOTS.get();
            default -> {
                IridescentReforging.LOGGER.warn(
                        "[ConversionRecipe] unknown result slot {} -- defaulting to helmet", resultSlot);
                yield ModItems.REFORGED_HELMET.get();
            }
        };
    }

    @Override public boolean canCraftInDimensions(int w, int h) { return w * h >= materialCount + 1; }

    @Override
    public ItemStack getResultItem(RegistryAccess access) {
        // Display result for JEI / inventory preview. The actual crafted
        // result is built per-craft by assemble() with NBT copied through.
        ItemStack preview = new ItemStack(resultItem());
        preview.getOrCreateTag().putString(ItemModularArmorClient.SKIN_NBT_KEY, skinId);
        return preview;
    }

    @Override
    public NonNullList<Ingredient> getIngredients() {
        NonNullList<Ingredient> list = NonNullList.create();
        list.add(source);
        for (int i = 0; i < materialCount; i++) list.add(material);
        return list;
    }

    @Override public ResourceLocation getId() { return id; }
    @Override public RecipeSerializer<?> getSerializer() { return ModRecipeTypes.CONVERSION_SERIALIZER.get(); }
    @Override public RecipeType<?> getType() { return ModRecipeTypes.CONVERSION_TYPE.get(); }

    public Ingredient getSource() { return source; }
    public Ingredient getMaterial() { return material; }
    public int getMaterialCount() { return materialCount; }
    public String getSkinId() { return skinId; }
    public String getResultSlot() { return resultSlot; }
}
