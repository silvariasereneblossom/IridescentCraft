package net.royling.lovelysparklepieces.ModAttributes;

import net.minecraftforge.registries.RegistryObject;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.minecraftforge.registries.DeferredRegister;

import net.royling.lovelysparklepieces.LovelySparklePieces;


public class ModAttribute {
    public static final DeferredRegister<Attribute> ATTRIBUTES = DeferredRegister.create(ForgeRegistries.ATTRIBUTES, LovelySparklePieces.MODID);
    public static final RegistryObject<Attribute> CRIT_CHANCE = ATTRIBUTES.register("critical_hit_chance",
            ()->new RangedAttribute("attribute.lsp.critical_hit_chance",0d,0d,1d).setSyncable(true));
    public static final RegistryObject<Attribute> DAMAGE_MODIFIER = ATTRIBUTES.register("damage_modifier",
            ()->new RangedAttribute("attribute.lsp.damage_modifier",1d,0d,2147483648d) /* IRIDESCENT FIX: base was 0d -> all player damage multiplied to zero without an LSP damage curio (magic_damage_modifier below correctly uses 1d) */.setSyncable(true));
    public static final RegistryObject<Attribute> MAGIC_DAMAGE_MODIFIER = ATTRIBUTES.register("magic_damage_modifier",
            ()->new RangedAttribute("attribute.lsp.magic_damage_modifier",1d,0d,2147483648d).setSyncable(true));

}
