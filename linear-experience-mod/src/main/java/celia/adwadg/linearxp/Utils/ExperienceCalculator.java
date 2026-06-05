package celia.adwadg.linearxp.Utils;

import celia.adwadg.linearxp.ExperienceManager;
import celia.adwadg.linearxp.LinearXp;

import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import javax.script.ScriptException;

public class ExperienceCalculator {

    /**
     * 计算从指定等级升到下一级所需的经验值
     * @param level 当前等级
     * @return 升级到下一级所需的经验值
     */
    public static int calculateExperience(int level) {
        if (level < 0) {
            return 0; // 等级不能为负
        }
        // 计算当前等级的总经验值
        int currentTotal = getTotalExperienceForLevel(level);
        // 计算下一等级的总经验值
        int nextTotal = getTotalExperienceForLevel(level + 1);
        // 返回差值
        return nextTotal - currentTotal;
    }
    /**
     * 计算从0级升到指定等级所需的总经验值
     * @param level 目标等级
     * @return 总经验值
     */
    private static int getTotalExperienceForLevel(int level) {
        if (level <= 0) {
            return 0;
        }
        if (level <= 16) {
            // L² + 6L
            return level * level + 6 * level;
        } else if (level <= 31) {
            // 2.5L² - 40.5L + 360
            return (int) (2.5 * level * level - 40.5 * level + 360);
        } else {
            // 4.5L² - 162.5L + 2220
            return (int) (4.5 * level * level - 162.5 * level + 2220);
        }
    }

    public static double calculateFormula(String formula, int base, int level) {
        // 替换变量
        String expression = formula
                .replace("base", String.valueOf(base))
                .replace("level", String.valueOf(level));

        // 简单的递归下降解析器
        return evaluateExpression(expression);
    }

    private static double evaluateExpression(String expr) {
        expr = expr.replaceAll("\\s+", ""); // 移除空格

        // 处理括号
        int bracketStart = expr.lastIndexOf('(');
        if (bracketStart != -1) {
            int bracketEnd = expr.indexOf(')', bracketStart);
            if (bracketEnd == -1) throw new RuntimeException("括号不匹配");

            double innerResult = evaluateExpression(expr.substring(bracketStart + 1, bracketEnd));
            String newExpr = expr.substring(0, bracketStart) + innerResult + expr.substring(bracketEnd + 1);
            return evaluateExpression(newExpr);
        }

        // 处理乘法和除法
        for (int i = expr.length() - 1; i >= 0; i--) {
            char c = expr.charAt(i);
            if (c == '*' || c == '/') {
                double left = evaluateExpression(expr.substring(0, i));
                double right = evaluateExpression(expr.substring(i + 1));
                return c == '*' ? left * right : left / right;
            }
        }

        // 处理加法和减法
        for (int i = expr.length() - 1; i >= 0; i--) {
            char c = expr.charAt(i);
            if (c == '+' || c == '-') {
                // 避免将负号误判为运算符
                if (i > 0 && ("+-*/".indexOf(expr.charAt(i - 1)) == -1)) {
                    double left = evaluateExpression(expr.substring(0, i));
                    double right = evaluateExpression(expr.substring(i + 1));
                    return c == '+' ? left + right : left - right;
                }
            }
        }

        // 如果是数字
        try {
            return Double.parseDouble(expr);
        } catch (NumberFormatException e) {
            throw new RuntimeException("无效的表达式: " + expr);
        }
    }

    /**
     * 计算经验倍率调整（返回浮点数结果）
     * @param original 原始经验值
     * @param level 当前等级
     * @return 调整后的经验值（浮点数）
     */
    public static double MultiplyXpDouble(int original, int level) {
        double handled;

        LinearXp.LOGGER.debug("计算参数 - 原始经验: {}, 等级: {}, 模式: {}",
                original, level, ExperienceManager.XPMODE);

        handled = switch (ExperienceManager.XPMODE) {
            case STATIC -> {
                int levelNeed = calculateExperience(level);
                LinearXp.LOGGER.debug("STATIC模式 - 等级需求: {}, 静态经验: {}",
                        levelNeed, ExperienceManager.STATICXP);

                if (levelNeed == 0) {
                    yield original; // 避免除零
                }

                double ratio = (double) levelNeed/ExperienceManager.STATICXP;
                handled = original * ratio;
                LinearXp.LOGGER.debug("STATIC计算结果 - 比率: {}, 结果: {}", ratio, handled);
                yield handled;
            }
            case LINEAR -> {
                int levelNeed = calculateExperience(level);
                // 线性升级难度：基础 + 等级 × 加成
                double linearNeed = ExperienceManager.LINEARBASE + ExperienceManager.LINEARADDITION * level;
                LinearXp.LOGGER.debug("LINEAR模式 - 原版需求: {}, 线性需求: {} (基础: {}, 加成: {})",
                        levelNeed, linearNeed, ExperienceManager.LINEARBASE, ExperienceManager.LINEARADDITION);

                if (linearNeed == 0) {
                    yield original; // 避免除零
                }

                // 这样随着等级提高，获得的经验值会减少（升级难度增加）
                double ratio = (double) levelNeed / linearNeed;
                handled = original * ratio;
                LinearXp.LOGGER.debug("LINEAR计算结果 - 比率: {}, 结果: {}", ratio, handled);
                yield handled;
            }
            case FORMULA -> {
                int levelNeed = calculateExperience(level);
                double formulaneed = calculateFormula(ExperienceManager.FORMULA,ExperienceManager.FORMULABASE,level);
                LinearXp.LOGGER.debug("FORMULA模式 - 原版需求: {}, 公式需求: {} (基础: {}, 公式结果: {})",
                        levelNeed, formulaneed, ExperienceManager.FORMULABASE, calculateFormula(ExperienceManager.FORMULA,ExperienceManager.FORMULABASE,level));

                if(formulaneed ==0){
                    yield original;
                }
                double ratio = (double) levelNeed / formulaneed;
                handled = original * ratio;
                LinearXp.LOGGER.debug("FORMULA计算结果 - 比率: {}, 结果: {}", ratio, handled);
                yield handled;
            }
        };

        return handled;
    }
    /**
     * 计算经验倍率调整并转为精确经验值（乘以1000）
     * @param original 原始经验值
     * @param level 当前等级
     * @return 精确经验值（乘以1000后的整数）
     */
    public static long MultiplyXpToAccurated(int original, int level) {
        double result = MultiplyXpDouble(original, level);
        // 将浮点数结果乘以1000转为long类型
        return (long) (result * 1000.0);
    }
    /**
     * 计算经验倍率调整（返回整数，向下取整，兼容旧代码）
     * @param original 原始经验值
     * @param level 当前等级
     * @return 调整后的经验值（向下取整）
     */
    public static int MultiplyXp(int original, int level) {
        double result = MultiplyXpDouble(original, level);
        return (int) Math.floor(result);
    }
    /**
     * 计算升级所需的精确经验值（乘以1000）
     * @param level 当前等级
     * @return 升级所需的精确经验值
     */
    public static long calculateAccuratedExperience(int level) {
        int original = calculateExperience(level);
        return (long) original * 1000L;
    }
    /**
     * 检查玩家是否可以升级
     * @param playerAccuratedExp 玩家的精确经验值
     * @param currentLevel 当前等级
     * @return 是否可以升级
     */
    public static boolean canLevelUp(long playerAccuratedExp, int currentLevel) {
        long requiredExp = calculateAccuratedExperience(currentLevel);
        return playerAccuratedExp >= requiredExp;
    }
    /**
     * 计算升级后剩余的经验值
     * @param playerAccuratedExp 玩家的精确经验值
     * @param currentLevel 当前等级
     * @return 升级后剩余的精确经验值
     */
    public static long getRemainingExpAfterLevelUp(long playerAccuratedExp, int currentLevel) {
        long requiredExp = calculateAccuratedExperience(currentLevel);
        return playerAccuratedExp - requiredExp;
    }
    /**
     * 计算当前等级的经验进度（0.0 - 1.0）
     * @param playerAccuratedExp 玩家的精确经验值
     * @param currentLevel 当前等级
     * @return 经验进度
     */
    public static float getExpProgress(long playerAccuratedExp, int currentLevel) {
        long requiredExp = calculateAccuratedExperience(currentLevel);
        if (requiredExp <= 0) return 1.0f;

        return Math.min(1.0f, (float) playerAccuratedExp / requiredExp);
    }
}
