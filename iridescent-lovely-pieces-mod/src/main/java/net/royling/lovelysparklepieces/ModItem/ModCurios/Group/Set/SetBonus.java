package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set;

import net.minecraft.world.item.Item;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

public class SetBonus {
    private final String id;
    private final Set<Item> items;
    private final List<SetBonusStage> stages;

    public SetBonus(String id, Set<Item> items, List<SetBonusStage> stages) {
        this.id = id;
        this.items = items;
        this.stages = stages.stream()
                .sorted(Comparator.comparingInt(SetBonusStage::requiredCount))
                .toList(); // 确保阶段从低到高排序
    }

    public String id() {
        return id;
    }

    public boolean matches(Item item) {
        return items.contains(item);
    }

    public List<SetBonusStage> getStages() {
        return stages;
    }
    public Set<Item> getItems() {
        return items; // 添加此方法以获取套装物品集合
    }
}
