package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set;

import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers.Gamblers3Effect;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers.Gamblers5Effect;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;

import java.util.List;
import java.util.Set;

public class SetBonusRegistry {
    public static final List<SetBonus> ALL = List.of(
            new SetBonus("gamblers",
                    Set.of(ModCurios.GAMBLERS_CORSAGE.get(),ModCurios.GAMBLERS_DICE.get(),ModCurios.GAMBLERS_EARRINGS.get(),
                            ModCurios.GAMBLERS_GOLD_COIN.get(),ModCurios.GAMBLERS_POKER.get()),
                    List.of(
                            new Gamblers3Effect(),
                            new Gamblers5Effect()
                    )
            )
    );
}
