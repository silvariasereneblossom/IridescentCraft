package celia.adwadg.linearxp;

public interface IAccuratedExp {
    /**
     * 获取精确经验值（存储为实际经验的1000倍）
     */
    long getAccuratedExp();

    /**
     * 设置精确经验值
     */
    void setAccuratedExp(long value);

    /**
     * 增加精确经验值
     */
    void addAccuratedExp(long amount);

    /**
     * 减少精确经验值
     */
    void removeAccuratedExp(long amount);

    /**
     * 获取取证后的实际经验值（除以1000）
     */
    int getActualExp();

    /**
     * 设置实际经验值（内部乘以1000存储）
     */
    void setActualExp(int exp);

    /**
     * 增加实际经验值（内部乘以1000存储）
     */
    void addActualExp(int exp);
}
