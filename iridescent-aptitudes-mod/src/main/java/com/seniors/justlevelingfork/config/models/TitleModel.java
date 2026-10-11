package com.seniors.justlevelingfork.config.models;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.config.conditions.ConditionImpl;
import com.seniors.justlevelingfork.handler.HandlerConditions;
import com.seniors.justlevelingfork.registry.title.Title;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class TitleModel {
    public String TitleId;

    public List<String> Conditions = new ArrayList<>();

    public boolean Default;

    public Boolean HideRequirements = false;

    private transient Title _title;

    public Title getTitle() {
        return _title;
    }

    public TitleModel() {
        TitleId = "rookie";
        Conditions = new ArrayList<>();
        Default = true;
        HideRequirements = false;
    }

    public TitleModel(String titleID, List<String> conditions, boolean isDefault) {
        TitleId = titleID;
        Conditions = conditions;
        Default = isDefault;
        HideRequirements = false;
    }

    public TitleModel(String titleID, List<String> conditions, boolean isDefault, boolean hideRequirements) {
        TitleId = titleID;
        Conditions = conditions;
        Default = isDefault;
        HideRequirements = hideRequirements;
    }

    @Override
    public String toString() {
        return String.format("%s:%s:%s", TitleId, String.join("=", Conditions), Default);
    }

    public boolean CheckRequirements(ServerPlayer serverPlayer) {

        // If the title should be given by default then lets ignore conditions.
        if (Default) return true;

        // Iridescent fork: the condition strings are parsed ONCE and cached (see parsedConditions). This used to
        // split every string, resolve its comparator and stream-search the condition registry on every
        // evaluation -- per title, per player, every title check -- and re-log a malformed condition each time.
        List<ParsedCondition> parsed = parsedConditions();
        if (parsed == null) return false; // a malformed condition can never pass (same result as before)

        for (ParsedCondition condition : parsed) {
            condition.impl.ProcessVariable(condition.variable, serverPlayer);
            if (!condition.impl.MeetCondition(condition.value, condition.comparator)) {
                return false;
            }
        }

        return true;
    }

    // Iridescent fork: parse cache for CheckRequirements. Transient = invisible to the Gson config (de)serialiser.
    private record ParsedCondition(ConditionImpl<?> impl, String variable, EComparator comparator, String value) {
    }

    private transient List<String> _parsedFrom;          // copy of the Conditions the cache was built from
    private transient List<ParsedCondition> _parsed;     // null = at least one condition is malformed

    private List<ParsedCondition> parsedConditions() {
        List<String> conditions = Conditions;
        if (conditions == null) return null; // no list at all: nothing to parse, can never pass
        // Re-parse only if the list was replaced or edited since (element compare is an identity hit normally).
        if (_parsedFrom != null && _parsedFrom.equals(conditions)) return _parsed;

        List<ParsedCondition> parsed = new ArrayList<>(conditions.size());
        boolean malformed = false;
        for (String condition : conditions) {
            String[] split = condition.split("/");

            if (split.length != 4) {
                JustLevelingFork.getLOGGER().error(">> Error! Title {} have a wrong formatted condition. (General)", TitleId);
                malformed = true;
                continue;
            }
            EComparator comparator;

            try {
                comparator = EComparator.valueOf(split[2].toUpperCase());
            } catch (IllegalArgumentException e) {
                JustLevelingFork.getLOGGER().error(">> Error! Title {} have a wrong formatted condition. (Comparator)", TitleId);
                malformed = true;
                continue;
            }

            Optional<ConditionImpl<?>> conditionImpl = HandlerConditions.getConditionByName(split[0]);
            if(conditionImpl.isEmpty()){
                JustLevelingFork.getLOGGER().error(">> Error! Title {} have a wrong formatted condition. (Condition type or Comparator)", TitleId);
                malformed = true;
                continue;
            }

            parsed.add(new ParsedCondition(conditionImpl.get(), split[1], comparator, split[3]));
        }

        _parsed = malformed ? null : parsed;
        _parsedFrom = new ArrayList<>(conditions);
        return _parsed;
    }

    public RegistryObject<Title> registry(DeferredRegister<Title> TITLES) {
        _title = register(TitleId, Default);
        return TITLES.register(TitleId, () -> _title);
    }

    private Title register(String name, boolean requirement) {
        ResourceLocation key = new ResourceLocation(JustLevelingFork.MOD_ID, name);
        return new Title(key, requirement, this.HideRequirements);
    }

    private boolean Compare(int a, int b, EComparator comparator) {
        return switch (comparator) {
            case EQUALS -> a == b;
            case GREATER -> a > b;
            case LESS -> a < b;
            case GREATER_OR_EQUAL -> a >= b;
            case LESS_OR_EQUAL -> a <= b;
            default -> false;
        };
    }

    public enum EConditionType {

        Aptitude,
        Stat,
        EntityKilled,
        Special
    }

    public enum EComparator {
        EQUALS,
        GREATER,
        LESS,
        GREATER_OR_EQUAL,
        LESS_OR_EQUAL
    }

}